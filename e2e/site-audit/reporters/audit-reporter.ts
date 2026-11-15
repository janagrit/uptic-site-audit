import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { FullConfig, FullProject, FullResult, Reporter, Suite, TestCase, TestError } from '@playwright/test/reporter';
import { TARGET } from '../targets';
import { evaluateBaseline, parseBaselineMode, readBaseline, writeBaseline, type CollectionEvidence } from './baseline';
import { buildFindings, parseFindings } from './findings';
import { classify, countOutcomes, decideVerdict, groupRows, mergeRepeats, type BaselineMode, type RunReport, type TestRecord } from './model';
import { renderConsole, renderMarkdown } from './summary-table';

/**
 * The suite's single result authority. It runs once at the end and, in this order: classifies
 * every test → checks the collection → evaluates the baseline → decides the verdict → renders the
 * console table, the GitHub step summary and reports/audit-results.json → returns the verdict's
 * status to Playwright, which becomes the exit code.
 *
 * Before, a summary reporter and a baseline reporter each ran their own onEnd: the table printed
 * PASS, then the baseline reporter failed the run. One reporter deciding one verdict makes that
 * contradiction impossible, whatever order other reporters are listed in.
 */

export interface AuditReporterOptions {
  /** Defaults: BASELINE env, baseline/results.json, reports/audit-results.json, FINDINGS.md. */
  readonly baselineMode?: BaselineMode;
  readonly baselineFile?: string;
  readonly jsonFile?: string;
  readonly findingsFile?: string;
  readonly allowRemoved?: boolean;
  readonly isProduction?: boolean;
  /** Console sink; unit tests capture it. */
  readonly write?: (text: string) => void;
  readonly stepSummaryFile?: string;
}

const SUITE_ROOT = resolve(__dirname, '..');
const ANSI = /\x1b\[[0-9;]*m/g;
const SKIPPED_DIRS = new Set(['node_modules', '.git']);

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry.name) || entry.name.endsWith('-snapshots')) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
}

const isMatchAll = (grep: RegExp | readonly RegExp[]): boolean => asArray(grep).every((g) => g.source === '.*' || g.source === '(?:)');

export default class AuditReporter implements Reporter {
  private config: FullConfig | undefined;
  private rootSuite: Suite | undefined;
  private globalErrors = 0;

  constructor(private readonly options: AuditReporterOptions = {}) {
    // Fail at startup on a typo like BASELINE=chek, not silently at the end.
    parseBaselineMode(process.env.BASELINE);
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.rootSuite = suite;
  }

  onError(_error: TestError): void {
    this.globalErrors += 1;
  }

  onEnd(result: FullResult): Promise<{ status: FullResult['status'] }> {
    const report = this.buildReport(result);
    const write = this.options.write ?? ((text: string) => process.stdout.write(text));
    write(renderConsole(report, process.stdout.isTTY && !process.env.NO_COLOR));

    const jsonFile = this.options.jsonFile ?? join(SUITE_ROOT, 'reports', 'audit-results.json');
    mkdirSync(dirname(jsonFile), { recursive: true });
    writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);

    const stepSummary = this.options.stepSummaryFile ?? process.env.GITHUB_STEP_SUMMARY;
    if (stepSummary) appendFileSync(stepSummary, renderMarkdown(report));

    return Promise.resolve({ status: report.verdict.status });
  }

  private buildReport(result: FullResult): RunReport {
    const records = mergeRepeats((this.rootSuite?.allTests() ?? []).map((test) => this.toRecord(test)));
    const mode = this.options.baselineMode ?? parseBaselineMode(process.env.BASELINE);
    const baselineFile = this.options.baselineFile ?? join(SUITE_ROOT, 'baseline', 'results.json');
    const isProduction = this.options.isProduction ?? TARGET.isProduction;

    const decision = evaluateBaseline({
      mode,
      isProduction,
      baseline: mode === 'off' ? undefined : readBaseline(baselineFile),
      records,
      evidence: this.evidence(),
      runStatus: result.status,
      allowRemoved: this.options.allowRemoved ?? process.env.BASELINE_ALLOW_REMOVED === '1',
    });
    if (decision.next) writeBaseline(baselineFile, decision.next);

    const counts = countOutcomes(records);
    const findingsFile = this.options.findingsFile ?? join(SUITE_ROOT, 'FINDINGS.md');
    const findings = parseFindings(existsSync(findingsFile) ? readFileSync(findingsFile, 'utf8') : '');

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      target: { id: TARGET.id, baseUrl: TARGET.baseUrl, isProduction },
      durationMs: result.duration,
      verdict: decideVerdict({ runStatus: result.status, counts, baseline: decision.result, globalErrors: this.globalErrors }),
      playwrightStatus: result.status,
      counts,
      groups: groupRows(records),
      baseline: decision.result,
      findings: buildFindings(records, findings),
      tests: records,
    };
  }

  private relativeToRoot(file: string): string {
    return relative(this.config?.rootDir ?? process.cwd(), file);
  }

  private toRecord(test: TestCase): TestRecord {
    const project = test.parent.project()?.name ?? '';
    const file = this.relativeToRoot(test.location.file);
    const title = test.titlePath().slice(3).join(' › ');
    const last = test.results.at(-1);
    const error = last?.errors.map((e) => e.message ?? e.value ?? '').join('\n').replace(ANSI, '').trim();
    return {
      key: [project, file, title].join(' › '),
      project,
      file,
      title,
      outcome: classify({ expectedStatus: test.expectedStatus, outcome: test.outcome(), results: test.results }),
      finding: test.annotations.find((a) => a.type === 'fail')?.description,
      error: error || undefined,
      attachments: (last?.attachments ?? []).flatMap((a) => (a.path ? [relative(SUITE_ROOT, a.path)] : [])),
      durationMs: test.results.reduce((sum, r) => sum + r.duration, 0),
    };
  }

  /** What a full run would collect (spec files on disk per project) next to what this run collected. */
  private evidence(): CollectionEvidence {
    const config = this.config;
    if (!config) return { configuredProjects: [], collectedProjects: [], expectedFiles: {}, collectedFiles: {}, filters: ['reporter saw no config'] };

    const filters: string[] = [];
    if (config.shard) filters.push(`--shard ${config.shard.current}/${config.shard.total}`);
    if (!isMatchAll(config.grep) || config.grepInvert) filters.push('--grep / --grep-invert');
    // CLI filters that do not show up in FullConfig. A grep matching a few tests in every file would
    // otherwise pass the per-file evidence below.
    for (const arg of process.argv) {
      const flag = /^(-g|--grep|--grep-invert|--last-failed|--only-changed|--test-list|--test-list-invert)(=|$)/.exec(arg)?.[1];
      if (flag) filters.push(`CLI ${flag}`);
    }

    const expectedFiles: Record<string, string[]> = {};
    for (const project of config.projects) {
      if (!isMatchAll(project.grep) || project.grepInvert) filters.push(`grep on project "${project.name}"`);
      expectedFiles[project.name] = this.specFilesOf(project, filters);
    }

    const collectedFiles: Record<string, string[]> = {};
    for (const projectSuite of this.rootSuite?.suites ?? []) {
      const tests = projectSuite.allTests();
      if (tests.length > 0) collectedFiles[projectSuite.title] = [...new Set(tests.map((t) => this.relativeToRoot(t.location.file)))];
    }
    return {
      configuredProjects: config.projects.map((p) => p.name),
      collectedProjects: Object.keys(collectedFiles),
      expectedFiles,
      collectedFiles,
      filters,
    };
  }

  /** Spec files a project selects from disk. Needs RegExp testMatch/testIgnore (the config uses them). */
  private specFilesOf(project: FullProject, filters: string[]): string[] {
    const match = asArray<string | RegExp>(project.testMatch);
    const ignore = asArray<string | RegExp>(project.testIgnore);
    const regexes = [...match, ...ignore].every((p): p is RegExp => p instanceof RegExp);
    if (!regexes) {
      filters.push(`project "${project.name}" uses a glob testMatch/testIgnore, so its collection cannot be verified`);
      return [];
    }
    const matches = (patterns: readonly (string | RegExp)[], file: string): boolean =>
      patterns.some((p) => new RegExp((p as RegExp).source, (p as RegExp).flags.replace('g', '')).test(file));
    return listFiles(project.testDir)
      .filter((file) => matches(match, file) && !matches(ignore, file))
      .map((file) => this.relativeToRoot(file))
      .sort();
  }
}
