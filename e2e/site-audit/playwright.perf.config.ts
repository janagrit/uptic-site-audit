import { defineConfig } from '@playwright/test';

/**
 * Performance audit only (`npm run perf`). Separate from playwright.config.ts on purpose: lab
 * performance numbers are noisy, slow to collect and judged differently (medians and budgets, not
 * pass/fail per assertion), so they must never make the functional suite flaky.
 *
 * One worker: parallel page loads would compete for CPU and bandwidth and skew each other.
 */
export default defineConfig({
  testDir: './perf',
  testMatch: /\.spec\.ts$/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 10 * 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'perf-report' }]],
  use: { serviceWorkers: 'block' },
});
