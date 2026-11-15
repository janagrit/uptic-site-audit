import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unitTest as test, expect } from '../../fixtures';
import {
  collectionIssues,
  diffBaseline,
  evaluateBaseline,
  parseBaselineMode,
  readBaseline,
  writeBaseline,
  type Baseline,
  type BaselineInput,
} from '../../reporters/baseline';
import type { TestRecord } from '../../reporters/model';
import { completeEvidence, record } from './support';

const A = record('A', 'passed');
const B = record('B', 'known-defect');
const C = record('C', 'skipped', { file: 'links.spec.ts' });
const RECORDS: readonly TestRecord[] = [A, B, C];
const BASELINE: Baseline = { [A.key]: 'pass', [B.key]: 'bug', [C.key]: 'skipped' };

function input(overrides: Partial<BaselineInput>): BaselineInput {
  const records = overrides.records ?? RECORDS;
  return {
    mode: 'check',
    isProduction: true,
    baseline: BASELINE,
    records,
    evidence: completeEvidence(records),
    runStatus: 'passed',
    allowRemoved: false,
    ...overrides,
  };
}

test.describe('Unit — Baseline mode', () => {
  test('accepts unset, check and update; rejects anything else', () => {
    expect(parseBaselineMode(undefined)).toBe('off');
    expect(parseBaselineMode('')).toBe('off');
    expect(parseBaselineMode('check')).toBe('check');
    expect(parseBaselineMode('update')).toBe('update');
    expect(() => parseBaselineMode('chek')).toThrow(/must be "check", "update" or unset/);
  });
});

test.describe('Unit — Baseline drift', () => {
  test('no drift when outcomes match', () => {
    expect(diffBaseline(BASELINE, RECORDS)).toEqual([]);
  });

  test('a removed test is drift', () => {
    expect(diffBaseline(BASELINE, [A, B])).toEqual([{ kind: 'removed', key: C.key, from: 'skipped' }]);
  });

  test('a new test is drift until recorded', () => {
    const D = record('D', 'passed');

    expect(diffBaseline(BASELINE, [...RECORDS, D])).toEqual([{ kind: 'added', key: D.key, to: 'pass' }]);
  });

  test('a passing test newly skipped is drift', () => {
    expect(diffBaseline(BASELINE, [record('A', 'skipped'), B, C])).toEqual([{ kind: 'changed', key: A.key, from: 'pass', to: 'skipped' }]);
  });

  test('a passing test newly wrapped in knownBug() is drift', () => {
    expect(diffBaseline(BASELINE, [record('A', 'known-defect'), B, C])).toEqual([{ kind: 'changed', key: A.key, from: 'pass', to: 'bug' }]);
  });

  test('knownBug() removed without a baseline update is drift', () => {
    expect(diffBaseline(BASELINE, [A, record('B', 'passed'), C])).toEqual([{ kind: 'changed', key: B.key, from: 'bug', to: 'pass' }]);
  });

  test('a flaky pass still matches "pass"', () => {
    expect(diffBaseline(BASELINE, [record('A', 'flaky'), B, C])).toEqual([]);
  });

  test('failures and unexpected passes are not drift (the verdict fails on them directly)', () => {
    expect(diffBaseline(BASELINE, [record('A', 'failed'), record('B', 'unexpected-pass'), C])).toEqual([]);
  });
});

test.describe('Unit — Baseline collection evidence', () => {
  const evidence = completeEvidence(RECORDS);

  test('a complete run has no issues', () => {
    expect(collectionIssues(evidence, RECORDS)).toEqual([]);
  });

  test('a spec file that contributed no tests (file filter, test.only, load error)', () => {
    const issues = collectionIssues({ ...evidence, expectedFiles: { desktop: ['seo.spec.ts', 'links.spec.ts', 'mobile.spec.ts'] } }, RECORDS);

    expect(issues).toEqual(['desktop › mobile.spec.ts: no tests collected (file filter, test.only, or a load error)']);
  });

  test('a configured project that did not run (--project)', () => {
    expect(collectionIssues({ ...evidence, configuredProjects: ['desktop', 'api'] }, RECORDS)).toEqual(['project "api" did not run']);
  });

  test('CLI filters', () => {
    expect(collectionIssues({ ...evidence, filters: ['--grep / --grep-invert'] }, RECORDS)).toEqual(['filtered run: --grep / --grep-invert']);
  });

  test('collected tests that never finished (interrupted run)', () => {
    expect(collectionIssues(evidence, [...RECORDS, record('D', 'not-run')])).toEqual(['1 collected test(s) never finished']);
  });
});

test.describe('Unit — Baseline check', () => {
  test('passes on a complete matching run', () => {
    expect(evaluateBaseline(input({})).result.status).toBe('passed');
  });

  test('fails on drift and lists it', () => {
    const { result } = evaluateBaseline(input({ records: [A, B] , evidence: completeEvidence(RECORDS) }));

    expect(result.status).toBe('failed');
    expect(result.drift).toEqual([{ kind: 'removed', key: C.key, from: 'skipped' }]);
  });

  test('fails on an incomplete run instead of reporting every unselected test as removed', () => {
    const evidence = { ...completeEvidence(RECORDS), filters: ['--grep / --grep-invert'] };
    const { result } = evaluateBaseline(input({ records: [A], evidence }));

    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/incomplete run/);
    expect(result.drift).toEqual([]);
  });

  test('fails when the baseline file is missing', () => {
    expect(evaluateBaseline(input({ baseline: undefined })).result.message).toMatch(/missing/);
  });

  test('is skipped (not failed) against a non-production target', () => {
    expect(evaluateBaseline(input({ isProduction: false })).result.status).toBe('skipped');
  });

  test('never writes the file', () => {
    expect(evaluateBaseline(input({})).next).toBeUndefined();
  });
});

test.describe('Unit — Baseline update', () => {
  const update = (overrides: Partial<BaselineInput>) => evaluateBaseline(input({ mode: 'update', ...overrides }));

  test('writes every stable outcome, sorted, from a complete green run', () => {
    const D = record('D', 'passed', { file: 'a.spec.ts' });
    const records = [...RECORDS, D];
    const { result, next } = update({ records, evidence: completeEvidence(records) });

    expect(result.status).toBe('updated');
    expect(next).toEqual({ [D.key]: 'pass', ...BASELINE });
    expect(Object.keys(next ?? {})).toEqual(Object.keys(next ?? {}).sort());
  });

  test('refuses an incomplete run', () => {
    const { result, next } = update({ evidence: { ...completeEvidence(RECORDS), filters: ['--shard 1/2'] } });

    expect(result.status).toBe('refused');
    expect(next).toBeUndefined();
  });

  test('refuses an interrupted run', () => {
    const records = [...RECORDS, record('D', 'not-run')];
    const { result, next } = update({ records, evidence: completeEvidence(records), runStatus: 'interrupted' });

    expect(result.status).toBe('refused');
    expect(next).toBeUndefined();
  });

  test('refuses while a test fails', () => {
    const records = [A, B, record('C', 'failed', { file: 'links.spec.ts' })];

    expect(update({ records, runStatus: 'failed' }).next).toBeUndefined();
  });

  test('refuses while a known bug passes unexpectedly', () => {
    const records = [A, record('B', 'unexpected-pass'), C];

    expect(update({ records, runStatus: 'failed' }).next).toBeUndefined();
  });

  test('refuses to drop tests unless BASELINE_ALLOW_REMOVED=1', () => {
    const records = [A, B];
    const refused = update({ records, evidence: completeEvidence(records) });

    expect(refused.result.status).toBe('refused');
    expect(refused.result.message).toMatch(/drop 1 test/);
    expect(refused.next).toBeUndefined();

    const allowed = update({ records, evidence: completeEvidence(records), allowRemoved: true });
    expect(allowed.result.status).toBe('updated');
    expect(allowed.next).toEqual({ [A.key]: 'pass', [B.key]: 'bug' });
  });

  test('refuses against a non-production target', () => {
    expect(update({ isProduction: false }).result.status).toBe('refused');
  });
});

test.describe('Unit — Baseline file', () => {
  test('round-trips through write and read', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'baseline-')), 'results.json');

    writeBaseline(file, BASELINE);

    expect(readBaseline(file)).toEqual(BASELINE);
    expect(readFileSync(file, 'utf8').endsWith('\n')).toBe(true);
  });

  test('missing file reads as undefined; a corrupt one throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baseline-'));
    expect(readBaseline(join(dir, 'none.json'))).toBeUndefined();

    const corrupt = join(dir, 'corrupt.json');
    writeFileSync(corrupt, JSON.stringify({ x: 'passed' }));
    expect(() => readBaseline(corrupt)).toThrow(/invalid outcome/);
  });
});
