/**
 * UI — Registration matrix.
 *
 * Demonstrates MULTIPLE test cases driven from a data table, each with UNIQUE
 * test data generated fresh per run. Valid cases register a new account;
 * invalid cases assert the form blocks submission / shows an error.
 *
 * Requires the frontend dev server (http://localhost:9002) AND backend.
 *   npm run dev      # starts both
 *   npx playwright test quality/e2e/auth-registration.matrix.spec.ts
 */
import { test, expect } from '@playwright/test';
import { registerUser, gotoApp, isElementVisible } from './helpers';
import { uniqueUiUser, UiUser } from './test-data';

type Case = {
  name: string;
  build: () => UiUser;
  expect: 'registered' | 'blocked';
};

const cases: Case[] = [
  {
    name: 'valid new user (unique data)',
    build: () => uniqueUiUser(),
    expect: 'registered',
  },
  {
    name: 'valid new user with different persona (unique data)',
    build: () => uniqueUiUser({ firstName: 'Test', persona: 'Investor' }),
    expect: 'registered',
  },
  {
    name: 'invalid email format is blocked',
    build: () => uniqueUiUser({ email: 'not-an-email' }),
    expect: 'blocked',
  },
  {
    name: 'weak password is blocked',
    build: () => uniqueUiUser({ password: 'weak' }),
    expect: 'blocked',
  },
];

test.describe('UI registration — multiple cases, unique data each run', () => {
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      const user = c.build();
      const result = await registerUser(page, user as any);

      if (c.expect === 'registered') {
        // Real new user => app reports success and navigates away from the form.
        expect(result, `expected ${user.email} to register`).toBe('registered');
      } else {
        // Invalid data => never reaches the "registered" success state.
        expect(result, `expected ${user.email} to be blocked`).not.toBe('registered');
      }
    });
  }

  test('the same test data is never reused across runs', async () => {
    const a = uniqueUiUser();
    const b = uniqueUiUser();
    expect(a.email).not.toBe(b.email);
    expect(a.mobile).not.toBe(b.mobile);
    expect(a.password).not.toBe(b.password);
  });

  test('landing page renders (smoke)', async ({ page }) => {
    await gotoApp(page);
    expect(await isElementVisible(page.locator('body'), 5000)).toBe(true);
  });
});

