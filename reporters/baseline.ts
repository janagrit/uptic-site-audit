import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';

/**
 * Regression baseline: the expected outcome of every test, committed in baseline/results.json.
 *
 * BASELINE=check   fail the run if any test is removed, newly skipped, newly marked as a known
 *                  defect, or not yet in the baseline (CI runs this)
 * BASELINE=update  rewrite the baseline from this run (only after an intentional change)
 * unset            reporter does nothing
 *
 * Guards against "fixing" a red test by deleting it, skipping it or wrapping it in test.fail.
 */

type Outcome = 'pass' | 'known-defect' | 'skipped';
type Baseline = Record<string, Outcome>;

const BASELINE_FILE = resolve(__dirname, '..', 'baseline', 'results.json');
const MODE = process.env.BASELINE;

function outcomeOf(test: TestCase): Outcome | 'failed' {
  const outcome = test.outcome();
  if (outcome === 'skipped') return 'skipped';
  if (outcome === 'unexpected') return 'failed';
  return test.expectedStatus === 'failed' ? 'known-defect' : 'pass';
}

export default class BaselineReporter implements Reporter {
  private rootDir = process.cwd();
  private rootSuite: Suite | undefined;

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.rootDir = config.rootDir;
    this.rootSuite = suite;
  }

  private keyOf(test: TestCase): string {
    const project = test.parent.project()?.name ?? '';
    const file = relative(this.rootDir, test.location.file);
    return [project, file, ...test.titlePath().slice(3)].join(' › ');
  }

  private current(): Map<string, Outcome | 'failed'> {
    const outcomes = new Map<string, Outcome | 'failed'>();
    for (const test of this.rootSuite?.allTests() ?? []) {
      const key = this.keyOf(test);
      const outcome = outcomeOf(test);
      // With --repeat-each, any failing repeat wins.
      if (outcomes.get(key) !== 'failed') outcomes.set(key, outcome);
    }
    return outcomes;
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | void> {
    if (MODE !== 'check' && MODE !== 'update') return;
    const outcomes = this.current();

    if (MODE === 'update') {
      return this.update(result, outcomes);
    }
    return this.check(outcomes);
  }

  private update(result: FullResult, outcomes: Map<string, Outcome | 'failed'>): void {
    if (result.status !== 'passed') {
      process.stdout.write('\nBaseline NOT updated: the run did not pass. Fix or mark failures first.\n');
      return;
    }
    const sorted = Object.fromEntries([...outcomes.entries()].sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
    process.stdout.write(`\nBaseline updated: ${outcomes.size} tests → ${relative(process.cwd(), BASELINE_FILE)}\n`);
  }

  private check(outcomes: Map<string, Outcome | 'failed'>): { status: FullResult['status'] } | void {
    if (!existsSync(BASELINE_FILE)) {
      process.stdout.write('\nBaseline check FAILED: baseline/results.json is missing (run npm run baseline:update).\n');
      return { status: 'failed' };
    }
    const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
    const drift: string[] = [];

    for (const [key, expected] of Object.entries(baseline)) {
      const actual = outcomes.get(key);
      if (actual === undefined) drift.push(`removed      ${key}`);
      else if (actual !== 'failed' && actual !== expected) drift.push(`${expected} → ${actual}  ${key}`);
    }
    for (const key of outcomes.keys()) {
      if (!(key in baseline)) drift.push(`not in baseline  ${key}`);
    }

    if (drift.length === 0) {
      process.stdout.write(`\nBaseline check passed: ${outcomes.size} tests match baseline/results.json\n`);
      return;
    }
    process.stdout.write(
      `\nBaseline check FAILED (${drift.length}):\n${drift.map((line) => `  ${line}`).join('\n')}\n` +
        'If intentional, run `npm run baseline:update` and commit baseline/results.json with the change.\n',
    );
    return { status: 'failed' };
  }
}
