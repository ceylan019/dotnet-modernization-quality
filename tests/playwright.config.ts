import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from './src/config/env';
import { CHANGES_DATA_PROJECT, CHANGES_DATA_SPECS } from './src/run-order';

const env = loadEnv();

export default defineConfig({
  testDir: 'specs',
  retries: 0,
  // Required: see src/run-order.ts. The changes-data specs refuse to run otherwise.
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'reports/playwright.json' }],
    ['allure-playwright', { resultsDir: 'allure-results' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: env.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Project order is run order (one worker, see src/run-order.ts).
  projects: [
    { name: 'read-only', testIgnore: CHANGES_DATA_SPECS, use: { ...devices['Desktop Chrome'] } },
    { name: CHANGES_DATA_PROJECT, testMatch: CHANGES_DATA_SPECS, use: { ...devices['Desktop Chrome'] } },
    // Legacy-only smoke checks with Web Forms control IDs and no risk tags. They exist only
    // when TARGET=legacy, so runs against the modern app and the qa gate never see them.
    ...(env.target === 'legacy'
      ? [{ name: 'legacy-smoke', testDir: 'specs-legacy', use: { ...devices['Desktop Chrome'] } }]
      : []),
  ],
});
