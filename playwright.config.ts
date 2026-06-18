import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './quality/e2e',
  outputDir: './quality/e2e/screenshots',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'quality/e2e/report', open: 'never' }],
    ['json', { outputFile: 'quality/e2e/results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:9002',
    headless: false,
    viewport: { width: 1280, height: 800 },
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
