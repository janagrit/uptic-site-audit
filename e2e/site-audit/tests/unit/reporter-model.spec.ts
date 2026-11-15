import { unitTest as test, expect } from '../../fixtures';
import { BASELINE_OFF, classify, countOutcomes, decideVerdict, mergeRepeats, type BaselineResult, type ClassifyInput, type Outcome } from '../../reporters/model';
import { record } from './support';

test.describe('Unit — Outcome classification', () => {
  const cases: ReadonlyArray<[name: string, input: ClassifyInput, expected: Outcome]> = [
    ['passed', { expectedStatus: 'passed', outcome: 'expected', results: [{ status: 'passed' }] }, 'passed'],
    ['failed', { expectedStatus: 'passed', outcome: 'unexpected', results: [{ status: 'failed' }, { status: 'failed' }] }, 'failed'],
    ['timed out', { expectedStatus: 'passed', outcome: 'unexpected', results: [{ status: 'timedOut' }] }, 'failed'],
    ['passed on retry', { expectedStatus: 'passed', outcome: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] }, 'flaky'],
    ['known bug still failing', { expectedStatus: 'failed', outcome: 'expected', results: [{ status: 'failed' }] }, 'known-defect'],
    ['known bug now passing', { expectedStatus: 'failed', outcome: 'unexpected', results: [{ status: 'passed' }, { status: 'passed' }] }, 'unexpected-pass'],
    // A test.fail test that times out is not "fixed": it is broken.
    ['known bug timing out', { expectedStatus: 'failed', outcome: 'unexpected', results: [{ status: 'timedOut' }] }, 'failed'],
    ['skipped', { expectedStatus: 'skipped', outcome: 'skipped', results: [{ status: 'skipped' }] }, 'skipped'],
    ['never started', { expectedStatus: 'passed', outcome: 'skipped', results: [] }, 'not-run'],
    ['interrupted mid-test', { expectedStatus: 'passed', outcome: 'skipped', results: [{ status: 'interrupted' }] }, 'not-run'],
  ];
  for (const [name, input, expected] of cases) {
    test(`${name} → ${expected}`, () => {
      expect(classify(input)).toBe(expected);
    });
  }

  test('with --repeat-each the worst repeat wins', () => {
    const merged = mergeRepeats([record('t', 'passed'), record('t', 'failed'), record('t', 'flaky')]);

    expect(merged.map((r) => r.outcome)).toEqual(['failed']);
  });
});

test.describe('Unit — Verdict', () => {
  const counts = (...outcomes: Outcome[]) => countOutcomes(outcomes.map((o, i) => record(`t${i}`, o)));
  const baseline = (status: BaselineResult['status']): BaselineResult => ({ ...BASELINE_OFF, mode: 'check', status, message: status });

  test('all passed, known bugs and skips are green', () => {
    const verdict = decideVerdict({ runStatus: 'passed', counts: counts('passed', 'known-defect', 'skipped', 'flaky'), baseline: baseline('passed'), globalErrors: 0 });

    expect(verdict).toEqual({ status: 'passed', reasons: [] });
  });

  test('a new failure is red', () => {
    const verdict = decideVerdict({ runStatus: 'failed', counts: counts('passed', 'failed'), baseline: BASELINE_OFF, globalErrors: 0 });

    expect(verdict.status).toBe('failed');
    expect(verdict.reasons).toEqual(['1 new failure(s)']);
  });

  test('an unexpected pass (bug fixed on the site) is red', () => {
    const verdict = decideVerdict({ runStatus: 'failed', counts: counts('unexpected-pass'), baseline: BASELINE_OFF, globalErrors: 0 });

    expect(verdict.status).toBe('failed');
    expect(verdict.reasons[0]).toMatch(/known bug\(s\) now pass/);
  });

  test('baseline drift fails a run whose tests all passed (the P0 contradiction)', () => {
    const verdict = decideVerdict({ runStatus: 'passed', counts: counts('passed', 'passed'), baseline: baseline('failed'), globalErrors: 0 });

    expect(verdict.status).toBe('failed');
    expect(verdict.reasons).toEqual(['baseline failed: failed']);
  });

  test('a refused baseline update fails the run', () => {
    expect(decideVerdict({ runStatus: 'passed', counts: counts('passed'), baseline: baseline('refused'), globalErrors: 0 }).status).toBe('failed');
  });

  test('a skipped baseline (non-production target) does not fail the run', () => {
    expect(decideVerdict({ runStatus: 'passed', counts: counts('passed'), baseline: baseline('skipped'), globalErrors: 0 }).status).toBe('passed');
  });

  test('tests that never ran fail the run', () => {
    expect(decideVerdict({ runStatus: 'passed', counts: counts('passed', 'not-run'), baseline: BASELINE_OFF, globalErrors: 0 }).reasons).toEqual([
      '1 test(s) did not run',
    ]);
  });

  test('errors outside tests fail the run', () => {
    expect(decideVerdict({ runStatus: 'failed', counts: counts('passed'), baseline: BASELINE_OFF, globalErrors: 2 }).reasons).toEqual([
      '2 error(s) outside tests',
    ]);
  });

  test('never turns a failed Playwright run green', () => {
    const verdict = decideVerdict({ runStatus: 'failed', counts: counts('passed'), baseline: BASELINE_OFF, globalErrors: 0 });

    expect(verdict.status).toBe('failed');
    expect(verdict.reasons).toEqual(['Playwright reported a failure not tied to a test']);
  });

  test('keeps interrupted and timed-out statuses', () => {
    expect(decideVerdict({ runStatus: 'interrupted', counts: counts('passed'), baseline: BASELINE_OFF, globalErrors: 0 }).status).toBe('interrupted');
    expect(decideVerdict({ runStatus: 'timedout', counts: counts('passed'), baseline: BASELINE_OFF, globalErrors: 0 }).status).toBe('timedout');
  });
});
