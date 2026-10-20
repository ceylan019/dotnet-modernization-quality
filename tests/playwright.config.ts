import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from './src/config/env';

const env = loadEnv();

export default defineConfig({
  testDir: 'specs',
  retries: 0,
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
