/**
 * Unique UI test-data factory (mirrors the API one but with the fields the
 * signup FORM needs: firstName / lastName / mobile).
 *
 * Every call = fresh data, so UI runs never collide on email/phone and you get
 * "unique test data every time".
 */
import { randomUUID } from 'crypto';

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${randomUUID().replace(/-/g, '').slice(0, 6)}`;
}

export interface UiUser {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
  persona?: string;
}

export function uniqueUiUser(overrides: Partial<UiUser> = {}): UiUser {
  const suffix = uniqueSuffix();
  return {
    firstName: 'QA',
    lastName: suffix.slice(0, 8),
    email: `qa+${suffix}@kanaku.test`,
    mobile: `9${String(Math.floor(100000000 + Math.random() * 899999999))}`.slice(0, 10),
    password: `Qa!${suffix}A9`, // upper+lower+digit+special, > 8 chars
    persona: 'QA Tester',
    ...overrides,
  };
}

