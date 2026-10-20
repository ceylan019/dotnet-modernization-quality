import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from './src/config/env';

const env = loadEnv();

// Specs that create or change records. With one worker, tests run in project order, so these
// start only after every read-only spec has finished: searches, pages and their baselines see
// the seed alone, and two runs on a fresh seed send the same requests in the same order.
// (A teardown or dependency project would also order them, but runs unfiltered by --grep and
// file arguments, and a dependency is skipped when an earlier test fails.)
const CHANGES_DATA = [
  '**/api/workflow.spec.ts',
  '**/ui/apply.spec.ts',
  '**/ui/review.spec.ts',
  '**/smoke/legacy-api.spec.ts',
  '**/smoke/legacy-ui.spec.ts',
];

export default defineConfig({
  testDir: 'specs',
  retries: 0,
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
  projects: [
    { name: 'read-only', testIgnore: CHANGES_DATA, use: { ...devices['Desktop Chrome'] } },
    { name: 'changes-data', testMatch: CHANGES_DATA, use: { ...devices['Desktop Chrome'] } },
  ],
});
