import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './targets';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['./reporters/summary-table.ts'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: [/mobile\.spec\.ts/, /tests\/api\//] },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
    { name: 'api', testMatch: /tests\/api\/.*\.spec\.ts/ },
  ],
});
