import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { devices } from '@playwright/test';
import { test, expect, newGuardedContext } from '../fixtures';
import { PAGES, TARGET, siteUrl } from '../targets';
import { measurePageLoad, THROTTLING } from './measure';
import { budgetViolations, imageIssues, parseHistory, regressions, summarize, type Budget, type ImageFacts, type Sample } from './stats';

/**
 * Performance audit, kept out of the functional suite (own config: playwright.perf.config.ts,
 * `npm run perf`). Per page: PERF_RUNS cold loads in fresh contexts, one at a time, judged on the
 * median. Budgets fail; a worsening against history only warns (see perf/stats.ts for why).
 *
 * Output: perf-results/<page>.json (latest run, machine-readable) and perf-results/history.jsonl
 * (one line per page per run; CI keeps it between scheduled runs).
 */

const RUNS = Number(process.env.PERF_RUNS ?? 5);
const RESULTS_DIR = resolve(__dirname, '..', 'perf-results');
const HISTORY_FILE = join(RESULTS_DIR, 'history.jsonl');
const BUDGETS = JSON.parse(readFileSync(join(__dirname, 'budgets.json'), 'utf8')) as { default: Budget; pages: Record<string, Budget> };
const PROFILE = devices['Pixel 7'];

if (!Number.isInteger(RUNS) || RUNS < 3) throw new Error(`PERF_RUNS must be an integer ≥ 3 (a median of fewer runs is noise), got ${process.env.PERF_RUNS}`);

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

for (const target of PAGES) {
  test(`Performance — ${target.name}`, async ({ browser }, testInfo) => {
    const url = siteUrl(target.path);
    const samples: Sample[] = [];
    let images: readonly ImageFacts[] = [];

    for (let run = 0; run < RUNS; run += 1) {
      const context = await newGuardedContext(browser, { ...PROFILE });
      try {
        const measurement = await measurePageLoad(await context.newPage(), url);
        samples.push(measurement.sample);
        images = measurement.images;
      } finally {
        await context.close();
      }
    }

    const summary = summarize(target.name, samples);
    const budget: Budget = { ...BUDGETS.default, ...BUDGETS.pages[target.name] };
    const violations = budgetViolations(summary, budget);
    const history = existsSync(HISTORY_FILE) ? parseHistory(readFileSync(HISTORY_FILE, 'utf8')) : [];
    const trends = regressions(summary, history);
    const imageProblems = imageIssues(images);
    const measuredAt = new Date().toISOString();

    const result = {
      schemaVersion: 1,
      measuredAt,
      target: { id: TARGET.id, url, isProduction: TARGET.isProduction },
      profile: { device: 'Pixel 7', ...THROTTLING, runs: RUNS },
      summary,
      samples,
      budget,
      violations,
      trends,
      images: imageProblems,
    };
    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(join(RESULTS_DIR, `${slug(target.name)}.json`), `${JSON.stringify(result, null, 2)}\n`);
    appendFileSync(HISTORY_FILE, `${JSON.stringify({ measuredAt, page: target.name, median: summary.median })}\n`);
    await testInfo.attach('performance.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });

    for (const trend of trends) {
      testInfo.annotations.push({
        type: 'warning',
        description: `${trend.metric} median ${trend.current} is ${Math.round(trend.change * 100)}% above the recent median ${trend.historicalMedian}`,
      });
    }
    for (const image of imageProblems) {
      testInfo.annotations.push({ type: 'image', description: `${image.url}: ${image.issues.join('; ')}` });
    }

    for (const { metric, actual, budget: limit } of violations) {
      expect.soft(actual, `${target.name}: median ${metric} ${actual} is over the budget of ${limit}`).toBeLessThanOrEqual(limit);
    }
  });
}
