import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './targets';

// testMatch/testIgnore are RegExps on purpose: the audit reporter lists the spec files each project
// should collect and refuses a baseline check or update when the run collected fewer (reporters/baseline.ts).
const SPEC = /\.spec\.ts$/;
const MOBILE_SPEC = /mobile\.spec\.ts$/;
const API_SPECS = /[\\/]tests[\\/]api[\\/].*\.spec\.ts$/;
const UNIT_SPECS = /[\\/]tests[\\/]unit[\\/].*\.spec\.ts$/;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 1,
  forbidOnly: !!process.env.CI,
  // The audit reporter decides the verdict and exit status; list (live progress) and html (drill-down) only display.
  reporter: [['./reporters/audit-reporter.ts'], ['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // A service worker could send requests the write guard never sees.
    serviceWorkers: 'block',
  },
  projects: [
    // Pure logic (reporters, URL parsing, write policy, schemas): no traffic to the site, runs in seconds.
    { name: 'unit', testMatch: UNIT_SPECS, use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: SPEC, testIgnore: [MOBILE_SPEC, API_SPECS, UNIT_SPECS] },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: MOBILE_SPEC },
    { name: 'api', testMatch: API_SPECS },
  ],
});
