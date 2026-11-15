import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullConfig, FullResult, Suite, TestCase } from '@playwright/test/reporter';
import { unitTest as test, expect } from '../../fixtures';
import AuditReporter, { type AuditReporterOptions } from '../../reporters/audit-reporter';
import type { BaselineMode, RunReport } from '../../reporters/model';

/**
 * End-to-end check of the reporter against a fake Playwright run: the console label, the JSON
 * report and the returned exit status must agree, whatever the baseline says.
 */

interface FakeTest {
  readonly title: string;
  readonly file: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly knownBug?: string;
}

function fakeRun(dir: string, tests: readonly FakeTest[], specFilesOnDisk: readonly string[]): { config: FullConfig; suite: Suite } {
  mkdirSync(join(dir, 'tests'), { recursive: true });
  for (const file of specFilesOnDisk) writeFileSync(join(dir, 'tests', file), '');

  const cases = tests.map((t) => {
    const expectedStatus = t.knownBug ? 'failed' : t.status === 'skipped' ? 'skipped' : 'passed';
    const outcome = t.status === 'skipped' ? 'skipped' : t.status === expectedStatus ? 'expected' : 'unexpected';
    return {
      title: t.title,
      expectedStatus,
      outcome: () => outcome,
      annotations: t.knownBug ? [{ type: 'fail', description: t.knownBug }] : [],
      location: { file: join(dir, 'tests', t.file), line: 1, column: 1 },
      titlePath: () => ['', 'desktop', t.file, 'SEO — Home', t.title],
      parent: { project: () => ({ name: 'desktop' }) },
      results: [{ status: t.status, duration: 5, errors: t.status === 'failed' ? [{ message: 'Expected: 1\nReceived: 0' }] : [], attachments: [] }],
    } as unknown as TestCase;
  });
  const projectSuite = { title: 'desktop', allTests: () => cases } as unknown as Suite;
  const suite = { suites: [projectSuite], allTests: () => cases } as unknown as Suite;
  const config = {
    rootDir: join(dir, 'tests'),
    grep: /.*/,
    grepInvert: null,
    shard: null,
    projects: [{ name: 'desktop', testDir: join(dir, 'tests'), testMatch: /\.spec\.ts$/, testIgnore: [], grep: /.*/, grepInvert: null }],
  } as unknown as FullConfig;
  return { config, suite };
}

async function run(
  tests: readonly FakeTest[],
  options: { mode: BaselineMode; baseline?: Record<string, string>; specFiles?: readonly string[]; playwrightStatus?: FullResult['status'] },
): Promise<{ status: string; output: string; report: RunReport; baselineFile: string; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'audit-reporter-'));
  const baselineFile = join(dir, 'results.json');
  if (options.baseline) writeFileSync(baselineFile, JSON.stringify(options.baseline));
  let output = '';
  const reporterOptions: AuditReporterOptions = {
    baselineMode: options.mode,
    baselineFile,
    jsonFile: join(dir, 'audit-results.json'),
    findingsFile: join(dir, 'FINDINGS.md'),
    isProduction: true,
    allowRemoved: false,
    write: (text) => (output += text),
    stepSummaryFile: join(dir, 'summary.md'),
  };
  const reporter = new AuditReporter(reporterOptions);
  const { config, suite } = fakeRun(dir, tests, options.specFiles ?? [...new Set(tests.map((t) => t.file))]);
  reporter.onBegin(config, suite);
  const { status } = await reporter.onEnd({ status: options.playwrightStatus ?? 'passed', startTime: new Date(), duration: 1000 });
  const report = JSON.parse(readFileSync(reporterOptions.jsonFile!, 'utf8')) as RunReport;
  return { status, output, report, baselineFile, dir };
}

const key = (title: string, file = 'seo.spec.ts') => `desktop › ${file} › SEO — Home › ${title}`;
const PASSING: readonly FakeTest[] = [
  { title: 'canonical', file: 'seo.spec.ts', status: 'passed' },
  { title: 'h1', file: 'seo.spec.ts', status: 'failed', knownBug: 'FINDINGS #1: no h1' },
];
const MATCHING_BASELINE = { [key('canonical')]: 'pass', [key('h1')]: 'bug' };

test.describe('Unit — Audit reporter', () => {
  test('green run: console, JSON and exit status all say passed', async () => {
    const { status, output, report } = await run(PASSING, { mode: 'check', baseline: MATCHING_BASELINE });

    expect(status).toBe('passed');
    expect(output).toContain(' PASS ');
    expect(report.verdict).toEqual({ status: 'passed', reasons: [] });
    expect(report.counts).toMatchObject({ passed: 1, 'known-defect': 1 });
  });

  test('baseline drift with every test passing: FAIL everywhere, never PASS', async () => {
    const { status, output, report } = await run(PASSING, { mode: 'check', baseline: { ...MATCHING_BASELINE, [key('og')]: 'pass' } });

    expect(status).toBe('failed');
    expect(output).not.toContain(' PASS ');
    expect(output).toContain(' FAILED ');
    expect(output).toContain(`removed            ${key('og')}`);
    expect(report.playwrightStatus).toBe('passed');
    expect(report.verdict.status).toBe('failed');
    expect(report.baseline.drift).toEqual([{ kind: 'removed', key: key('og'), from: 'pass' }]);
  });

  test('step summary carries the same verdict', async () => {
    const { dir } = await run(PASSING, { mode: 'check', baseline: { [key('canonical')]: 'pass' } });

    expect(readFileSync(join(dir, 'summary.md'), 'utf8')).toMatch(/^## ❌ Site audit — failed/);
  });

  test('reports each category separately: new failure, known bug, unexpected pass, skipped', async () => {
    const { report, output } = await run(
      [
        { title: 'a', file: 'seo.spec.ts', status: 'passed' },
        { title: 'b', file: 'seo.spec.ts', status: 'failed' },
        { title: 'c', file: 'seo.spec.ts', status: 'failed', knownBug: 'FINDINGS #1: x' },
        { title: 'd', file: 'seo.spec.ts', status: 'passed', knownBug: 'FINDINGS #2: y' },
        { title: 'e', file: 'seo.spec.ts', status: 'skipped' },
      ],
      { mode: 'off', playwrightStatus: 'failed' },
    );

    expect(report.counts).toMatchObject({ passed: 1, failed: 1, 'known-defect': 1, 'unexpected-pass': 1, skipped: 1 });
    expect(report.findings.map((f) => [f.category, f.test])).toEqual([
      ['new-failure', key('b')],
      ['fixed-on-site', key('d')],
      ['known-defect', key('c')],
    ]);
    expect(output).toContain('New failures (look at these first)');
    expect(output).toContain('Fixed on the site');
  });

  test('update from an incomplete run leaves the baseline file untouched', async () => {
    const original = JSON.stringify(MATCHING_BASELINE);
    const { status, report, baselineFile } = await run(PASSING, { mode: 'update', baseline: MATCHING_BASELINE, specFiles: ['seo.spec.ts', 'links.spec.ts'] });

    expect(status).toBe('failed');
    expect(report.baseline.status).toBe('refused');
    expect(report.baseline.collectionIssues).toEqual(['desktop › links.spec.ts: no tests collected (file filter, test.only, or a load error)']);
    expect(readFileSync(baselineFile, 'utf8')).toBe(original);
  });

  test('update from a complete green run rewrites the baseline', async () => {
    const tests: FakeTest[] = [...PASSING, { title: 'og', file: 'seo.spec.ts', status: 'passed' }];
    const { status, baselineFile } = await run(tests, { mode: 'update', baseline: MATCHING_BASELINE });

    expect(status).toBe('passed');
    expect(JSON.parse(readFileSync(baselineFile, 'utf8'))).toEqual({ ...MATCHING_BASELINE, [key('og')]: 'pass' });
  });
});
