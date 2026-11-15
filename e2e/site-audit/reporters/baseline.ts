import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { ConfigError } from '../config/url';
import type { BaselineMode, BaselineResult, Drift, Outcome, RunStatus, TestRecord } from './model';

/**
 * Regression baseline: the expected outcome of every test, committed in baseline/results.json as a
 * flat `{ "<project › file › describe › title>": "pass" | "bug" | "skipped" }` map.
 *
 * It guards against making a red run green without fixing anything: deleting a test, skipping it,
 * or wrapping it in `knownBug()`. Two rules make the guard trustworthy:
 *
 * 1. Only a complete run counts. Before checking or updating, the run must prove it collected the
 *    whole suite: every configured project ran, every spec file on disk contributed tests, no CLI
 *    filter (grep, shard) was active, and every collected test finished. A filtered, sharded,
 *    interrupted or `.only` run can neither pass the check nor overwrite the file.
 * 2. Updating is explicit and conservative. `BASELINE=update` refuses unless the run is complete and
 *    green, and refuses to drop tests unless `BASELINE_ALLOW_REMOVED=1` confirms the removal.
 *
 * Everything except readBaseline/writeBaseline is pure and unit tested in tests/unit/baseline.spec.ts.
 */

export type BaselineOutcome = 'pass' | 'bug' | 'skipped';
export type Baseline = Readonly<Record<string, BaselineOutcome>>;

const BASELINE_OUTCOMES: ReadonlySet<string> = new Set<BaselineOutcome>(['pass', 'bug', 'skipped']);

export function parseBaselineMode(value: string | undefined): BaselineMode {
  const mode = value?.trim() ?? '';
  if (mode === '') return 'off';
  if (mode === 'check' || mode === 'update') return mode;
  throw new ConfigError(`BASELINE must be "check", "update" or unset, got "${value}"`);
}

/** The stable outcome the baseline stores, or undefined for outcomes that are failures in their own right. */
export function baselineOutcomeOf(outcome: Outcome): BaselineOutcome | undefined {
  switch (outcome) {
    case 'passed':
    case 'flaky':
      return 'pass';
    case 'known-defect':
      return 'bug';
    case 'skipped':
      return 'skipped';
    default:
      return undefined; // failed, unexpected-pass, not-run: the verdict fails on them directly
  }
}

/** Compares the run with the baseline. Failing tests are not drift: the verdict already fails on them. */
export function diffBaseline(baseline: Baseline, records: readonly TestRecord[]): Drift[] {
  const drift: Drift[] = [];
  const byKey = new Map(records.map((r) => [r.key, r]));
  for (const [key, expected] of Object.entries(baseline)) {
    const record = byKey.get(key);
    if (!record) {
      drift.push({ kind: 'removed', key, from: expected });
      continue;
    }
    const actual = baselineOutcomeOf(record.outcome);
    if (actual !== undefined && actual !== expected) drift.push({ kind: 'changed', key, from: expected, to: actual });
  }
  for (const record of records) {
    if (!(record.key in baseline)) drift.push({ kind: 'added', key: record.key, to: baselineOutcomeOf(record.outcome) ?? record.outcome });
  }
  return drift.sort((a, b) => a.key.localeCompare(b.key));
}

export function formatDrift(drift: Drift): string {
  switch (drift.kind) {
    case 'removed':
      return `removed            ${drift.key}`;
    case 'added':
      return `not in baseline    ${drift.key}`;
    case 'changed':
      return `${`${drift.from} → ${drift.to}`.padEnd(19)}${drift.key}`;
  }
}

/** What the run collected versus what the config says the full suite is. */
export interface CollectionEvidence {
  readonly configuredProjects: readonly string[];
  readonly collectedProjects: readonly string[];
  /** Spec files on disk that each project's testMatch/testIgnore selects, relative to the config dir. */
  readonly expectedFiles: Readonly<Record<string, readonly string[]>>;
  /** Spec files that contributed at least one test, per project. */
  readonly collectedFiles: Readonly<Record<string, readonly string[]>>;
  /** Active run filters, e.g. `--grep /foo/`, `--shard 1/2`. */
  readonly filters: readonly string[];
}

/** Every reason the run is not a complete run of the full suite. Empty = complete. */
export function collectionIssues(evidence: CollectionEvidence, records: readonly TestRecord[]): string[] {
  const issues = evidence.filters.map((filter) => `filtered run: ${filter}`);
  for (const project of evidence.configuredProjects) {
    if (!evidence.collectedProjects.includes(project)) {
      issues.push(`project "${project}" did not run`);
      continue;
    }
    const collected = new Set(evidence.collectedFiles[project] ?? []);
    for (const file of evidence.expectedFiles[project] ?? []) {
      if (!collected.has(file)) issues.push(`${project} › ${file}: no tests collected (file filter, test.only, or a load error)`);
    }
  }
  const notRun = records.filter((r) => r.outcome === 'not-run').length;
  if (notRun > 0) issues.push(`${notRun} collected test(s) never finished`);
  return issues;
}

export interface BaselineInput {
  readonly mode: BaselineMode;
  readonly isProduction: boolean;
  /** Current file content; undefined when the file does not exist. */
  readonly baseline: Baseline | undefined;
  readonly records: readonly TestRecord[];
  readonly evidence: CollectionEvidence;
  readonly runStatus: RunStatus;
  /** `BASELINE_ALLOW_REMOVED=1`: the update may drop tests that no longer exist. */
  readonly allowRemoved: boolean;
}

export interface BaselineDecision {
  readonly result: BaselineResult;
  /** Set only when the file must be (re)written. */
  readonly next?: Baseline;
}

export function evaluateBaseline(input: BaselineInput): BaselineDecision {
  const { mode, isProduction, baseline, records, evidence, runStatus, allowRemoved } = input;
  if (mode === 'off') return { result: { mode, status: 'off', drift: [], collectionIssues: [], message: 'not checked (BASELINE unset)' } };

  const issues = collectionIssues(evidence, records);
  const result = (status: BaselineResult['status'], message: string, drift: readonly Drift[] = []): BaselineResult => ({
    mode,
    status,
    drift,
    collectionIssues: issues,
    message,
  });

  if (!isProduction) {
    // The baseline records production's known bugs; another target legitimately differs.
    // A check is skipped; an explicit update is refused so nobody records staging as the truth.
    return { result: result(mode === 'check' ? 'skipped' : 'refused', 'it describes production; this run targets another URL') };
  }

  if (mode === 'check') {
    if (issues.length > 0) return { result: result('failed', `incomplete run, ${issues.length} collection issue(s); run the full suite`) };
    if (!baseline) return { result: result('failed', 'baseline/results.json is missing (run npm run baseline:update)') };
    const drift = diffBaseline(baseline, records);
    return drift.length === 0
      ? { result: result('passed', `${records.length} tests match`) }
      : { result: result('failed', `${drift.length} difference(s) from baseline/results.json`, drift) };
  }

  // update
  if (issues.length > 0) return { result: result('refused', `incomplete run, ${issues.length} collection issue(s); file not changed`) };
  const failing = records.filter((r) => baselineOutcomeOf(r.outcome) === undefined).length;
  if (runStatus !== 'passed' || failing > 0) {
    return { result: result('refused', `the run is not green (${failing} failing test(s), status ${runStatus}); fix them or mark them with knownBug() first`) };
  }
  const drift = baseline ? diffBaseline(baseline, records) : [];
  const removed = drift.filter((d) => d.kind === 'removed');
  if (removed.length > 0 && !allowRemoved) {
    return { result: result('refused', `the update would drop ${removed.length} test(s); if intended, rerun with BASELINE_ALLOW_REMOVED=1`, removed) };
  }
  const next = Object.fromEntries(
    records
      .map((r) => [r.key, baselineOutcomeOf(r.outcome)] as const)
      .filter((entry): entry is readonly [string, BaselineOutcome] => entry[1] !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return { result: result('updated', `${records.length} tests written (${drift.length} change(s))`, drift), next };
}

// ── File I/O ─────────────────────────────────────────────────────────────────────────────────────

/** Reads and validates the baseline file; undefined when it does not exist, throws when it is corrupt. */
export function readBaseline(file: string): Baseline | undefined {
  if (!existsSync(file)) return undefined;
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`${file}: expected an object of test → outcome`);
  }
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string' || !BASELINE_OUTCOMES.has(value)) {
      throw new Error(`${file}: "${key}" has invalid outcome ${JSON.stringify(value)}`);
    }
  }
  return data as Baseline;
}

/** Writes via a temp file and rename, so a crash mid-write cannot leave a truncated baseline. */
export function writeBaseline(file: string, baseline: Baseline): void {
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(baseline, null, 2)}\n`);
  renameSync(temp, file);
}
