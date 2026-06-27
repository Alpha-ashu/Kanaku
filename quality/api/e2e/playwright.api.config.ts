import { defineConfig } from '@playwright/test';
import { API_BASE_URL } from './helpers/env';

/**
 * Dedicated Playwright config for **API E2E** tests (no browser).
 *
 * Run:
 *   npm run test:api                         # from repo root
 *   API_BASE_URL=https://kanaku.fly.dev npx playwright test -c quality/api/e2e/playwright.api.config.ts
 *
 * Requires the backend reachable at API_BASE_URL (default http://localhost:3000).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: './.results',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: './global-setup.ts',
  reporter: [
    ['list'],
    ['html', { outputFolder: './report', open: 'never' }],
    ['json', { outputFile: './results.json' }],
  ],
  use: {
    baseURL: API_BASE_URL,
    extraHTTPHeaders: { Accept: 'application/json' },
    trace: 'retain-on-failure',
  },
});

