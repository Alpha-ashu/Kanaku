import { randomUUID } from 'crypto';

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${randomUUID().replace(/-/g, '').slice(0, 6)}`;
}

export interface TestUser {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  mobile: string;
  password: string;
}

export function generateValidUser(overrides: Partial<TestUser> = {}): TestUser {
  const suffix = uniqueSuffix();
  const firstName = `QA`;
  const lastName = `User${suffix.slice(0, 6)}`;
  return {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email: `qa+${suffix}@kanaku.test`,
    mobile: `9${String(Math.floor(100000000 + Math.random() * 899999999))}`.slice(0, 10),
    password: `Qa!${suffix}A9`, // Valid password (uppercase + lowercase + digit + special character, >= 8 chars)
    ...overrides,
  };
}

export const invalidUserScenarios = [
  {
    name: 'Empty Email',
    data: { email: '' },
    expectedError: 'MISSING_FIELDS',
  },
  {
    name: 'Invalid Email Format',
    data: { email: 'not-an-email' },
    expectedError: 'INVALID_EMAIL',
  },
  {
    name: 'Missing Name',
    data: { name: '', firstName: '', lastName: '' },
    expectedError: 'MISSING_FIELDS',
  },
  {
    name: 'Short Password',
    data: { password: 'Short1!' }, // < 8 chars
    expectedError: 'PASSWORD_TOO_SHORT',
  },
  {
    name: 'Weak Password - No special chars',
    data: { password: 'WeakPassword123' },
    expectedError: 'PASSWORD_TOO_WEAK',
  },
  {
    name: 'Weak Password - No uppercase',
    data: { password: 'weakpassword1!' },
    expectedError: 'PASSWORD_TOO_WEAK',
  },
  {
    name: 'Weak Password - No digits',
    data: { password: 'WeakPassword!' },
    expectedError: 'PASSWORD_TOO_WEAK',
  },
  {
    name: 'Name - SQL Injection Payload',
    data: { name: "' OR '1'='1" },
    expectedError: null, // API should handle this as a string safely (or fail validation if symbols are strictly disallowed)
  },
  {
    name: 'Name - XSS Payload',
    data: { name: '<script>alert("xss")</script>' },
    expectedError: null, // Handled safely or sanitized
  },
];
