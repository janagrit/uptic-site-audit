/**
 * The reporting model: how one test's Playwright result maps to an audit outcome, and how a run
 * becomes one final verdict. Pure (no Playwright runtime, no I/O) and unit tested in
 * tests/unit/reporter-model.spec.ts. Every output (console table, step summary, JSON, exit code)
 * reads the same `RunReport`, so they cannot disagree.
 */

import type { Finding } from './findings';

/**
 * - passed           expected to pass, passed on the first try
 * - flaky            passed on a retry (green, but listed)
 * - failed           a new failure: expected to pass and did not (also a known-bug test that crashed or timed out)
 * - known-defect     `knownBug()` / `test.fail`: an open FINDINGS entry, failing as expected
 * - unexpected-pass  `knownBug()` test that passed: the site was fixed, the marker must go
 * - skipped          skipped on purpose (`test.skip`, platform not applicable)
 * - not-run          collected but never finished (run interrupted, timed out, max failures)
 */
export type Outcome = 'passed' | 'flaky' | 'failed' | 'known-defect' | 'unexpected-pass' | 'skipped' | 'not-run';

export const OUTCOMES: readonly Outcome[] = ['passed', 'flaky', 'failed', 'known-defect', 'unexpected-pass', 'skipped', 'not-run'];

export type RunStatus = 'passed' | 'failed' | 'interrupted' | 'timedout';

/** The subset of a Playwright TestCase result the model needs. */
export interface ResultLike {
  readonly status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
}

export interface ClassifyInput {
  readonly expectedStatus: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  /** Playwright's `TestCase.outcome()`. */
  readonly outcome: 'skipped' | 'expected' | 'unexpected' | 'flaky';
  readonly results: readonly ResultLike[];
}

export function classify({ expectedStatus, outcome, results }: ClassifyInput): Outcome {
  const finished = results.filter((r) => r.status !== 'interrupted');
  if (finished.length === 0) return 'not-run';
  if (outcome === 'skipped') return 'skipped';
  if (outcome === 'flaky') return 'flaky';
  const knownBug = expectedStatus === 'failed';
  if (outcome === 'expected') return knownBug ? 'known-defect' : 'passed';
  // Unexpected. For a known bug that only counts as "fixed" if it actually passed; a crash or timeout is a failure.
  return knownBug && finished.at(-1)?.status === 'passed' ? 'unexpected-pass' : 'failed';
}

export interface TestRecord {
  /** Stable identity, also the baseline key: `project › file › describe › title`. */
  readonly key: string;
  readonly project: string;
  /** Spec file relative to the test directory, e.g. `seo.spec.ts`. */
  readonly file: string;
  /** Describe blocks and title, ` › `-joined. */
  readonly title: string;
  readonly outcome: Outcome;
  /** The `knownBug()` reason (FINDINGS reference), when the test is marked as one. */
  readonly finding?: string;
  /** Last error message without ANSI colours, when the test failed (including expected failures). */
  readonly error?: string;
  /** Screenshot, trace and other attachment paths of the last attempt. */
  readonly attachments: readonly string[];
  readonly durationMs: number;
}

export type Counts = Record<Outcome, number>;

export function emptyCounts(): Counts {
  return { passed: 0, flaky: 0, failed: 0, 'known-defect': 0, 'unexpected-pass': 0, skipped: 0, 'not-run': 0 };
}

export function countOutcomes(records: readonly TestRecord[]): Counts {
  const counts = emptyCounts();
  for (const record of records) counts[record.outcome] += 1;
  return counts;
}

/** Worst first: with `--repeat-each`, a key's record is its worst repeat. */
const SEVERITY: readonly Outcome[] = ['failed', 'unexpected-pass', 'not-run', 'flaky', 'known-defect', 'passed', 'skipped'];

export function mergeRepeats(records: readonly TestRecord[]): TestRecord[] {
  const byKey = new Map<string, TestRecord>();
  for (const record of records) {
    const seen = byKey.get(record.key);
    if (!seen || SEVERITY.indexOf(record.outcome) < SEVERITY.indexOf(seen.outcome)) byKey.set(record.key, record);
  }
  return [...byKey.values()];
}

// ── Baseline result (computed in baseline.ts, consumed by the verdict) ────────────────────────────

export type BaselineMode = 'off' | 'check' | 'update';

export type DriftKind = 'removed' | 'added' | 'changed';

export interface Drift {
  readonly kind: DriftKind;
  readonly key: string;
  readonly from?: string;
  readonly to?: string;
}

export interface BaselineResult {
  readonly mode: BaselineMode;
  /**
   * off      BASELINE unset
   * skipped  target is not production (the baseline describes production)
   * passed   check: outcomes match
   * failed   check: drift, or the run did not collect the full suite
   * updated  update: file rewritten
   * refused  update: run not trustworthy (incomplete, failing, removals not allowed); file untouched
   */
  readonly status: 'off' | 'skipped' | 'passed' | 'failed' | 'updated' | 'refused';
  readonly drift: readonly Drift[];
  /** Why the run cannot be trusted as a full-suite run (filters, missing files/projects, not-run tests). */
  readonly collectionIssues: readonly string[];
  readonly message: string;
}

export const BASELINE_OFF: BaselineResult = { mode: 'off', status: 'off', drift: [], collectionIssues: [], message: 'baseline not checked (BASELINE unset)' };

// ── Verdict ──────────────────────────────────────────────────────────────────────────────────────

export interface Verdict {
  readonly status: RunStatus;
  /** Every reason the run is not green; empty when it passed. */
  readonly reasons: readonly string[];
}

export interface VerdictInput {
  /** Status Playwright computed from test results alone. */
  readonly runStatus: RunStatus;
  readonly counts: Counts;
  readonly baseline: BaselineResult;
  /** Errors outside any test (config, global setup, a spec that fails to load). */
  readonly globalErrors: number;
}

/**
 * The single authority on whether the run passed. Never turns a failing run green: it can only add
 * reasons to fail. Interrupted and timed-out runs keep their status.
 */
export function decideVerdict({ runStatus, counts, baseline, globalErrors }: VerdictInput): Verdict {
  const reasons: string[] = [];
  const add = (n: number, text: string): void => {
    if (n > 0) reasons.push(`${n} ${text}`);
  };
  add(counts.failed, 'new failure(s)');
  add(counts['unexpected-pass'], 'known bug(s) now pass: fixed on the site, remove knownBug()');
  add(counts['not-run'], 'test(s) did not run');
  add(globalErrors, 'error(s) outside tests');
  if (baseline.status === 'failed' || baseline.status === 'refused') reasons.push(`baseline ${baseline.status}: ${baseline.message}`);
  if (runStatus === 'interrupted' || runStatus === 'timedout') reasons.push(`run ${runStatus}`);
  if (runStatus === 'failed' && reasons.length === 0) reasons.push('Playwright reported a failure not tied to a test');

  if (runStatus === 'interrupted' || runStatus === 'timedout') return { status: runStatus, reasons };
  return { status: reasons.length > 0 ? 'failed' : 'passed', reasons };
}

// ── Run report: what every output renders ────────────────────────────────────────────────────────

/** Everything known about a finished run. The console, step summary and JSON file all render this. */
export interface RunReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly target: { readonly id: string; readonly baseUrl: string; readonly isProduction: boolean };
  readonly durationMs: number;
  /** Final status: the process exit code follows it. */
  readonly verdict: Verdict;
  /** What Playwright alone concluded, before the baseline. Kept to make overrides visible. */
  readonly playwrightStatus: RunStatus;
  readonly counts: Counts;
  readonly groups: readonly GroupRow[];
  readonly baseline: BaselineResult;
  readonly findings: readonly Finding[];
  readonly tests: readonly TestRecord[];
}

export interface GroupRow {
  /** `file [project]` */
  readonly group: string;
  readonly counts: Counts;
  readonly durationMs: number;
}

export function groupRows(records: readonly TestRecord[]): GroupRow[] {
  const rows = new Map<string, { counts: Counts; durationMs: number }>();
  for (const record of records) {
    const group = `${record.file}${record.project ? ` [${record.project}]` : ''}`;
    const row = rows.get(group) ?? { counts: emptyCounts(), durationMs: 0 };
    row.counts[record.outcome] += 1;
    row.durationMs += record.durationMs;
    rows.set(group, row);
  }
  return [...rows.entries()].map(([group, row]) => ({ group, ...row })).sort((a, b) => a.group.localeCompare(b.group));
}
