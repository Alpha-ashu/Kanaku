/**
 * Unique test-data factory.
 *
 * Every call returns FRESH, collision-free data so tests can run repeatedly
 * (locally and in CI) without "email already registered" failures and without
 * depending on a clean database.
 *
 * Password rule (enforced by backend register validation):
 *   >= 8 chars AND at least one upper, one lower, one digit, one special char.
 */
import { randomUUID } from 'crypto';

/** Short, monotonic-ish, collision-resistant suffix. */
export function uniqueSuffix(): string {
  const t = Date.now().toString(36);
  const r = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${t}${r}`;
}

export interface TestUser {
  name: string;
  email: string;
  mobile: string;
  /** Plain password (send as-is to /register; SHA-256 it for /login/challenge). */
  password: string;
}

/** A brand-new, valid user that satisfies all backend register rules. */
export function uniqueUser(overrides: Partial<TestUser> = {}): TestUser {
  const suffix = uniqueSuffix();
  // Guaranteed to contain upper + lower + digit + special, length > 8.
  const password = `Qa!${suffix}A9`;
  // 10-digit Indian-style mobile starting with 9.
  const mobile = `9${String(Math.floor(100000000 + Math.random() * 899999999))}`.slice(0, 10);
  return {
    name: `QA User ${suffix}`,
    email: `qa+${suffix}@kanaku.test`,
    mobile,
    password,
    ...overrides,
  };
}

/** Deliberately invalid variants for negative testing. */
export const invalidUsers = {
  missingFields: () => ({ email: `qa+${uniqueSuffix()}@kanaku.test` }), // no name/password
  badEmail: () => ({ ...uniqueUser(), email: 'not-an-email' }),
  shortPassword: () => ({ ...uniqueUser(), password: 'Aa1!' }), // < 8
  weakPassword: () => ({ ...uniqueUser(), password: 'alllowercase' }), // no upper/digit/special
};

