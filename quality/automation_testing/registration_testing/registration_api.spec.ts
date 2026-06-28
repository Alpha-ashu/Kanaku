import { test, expect } from '@playwright/test';
import { config } from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { generateValidUser, invalidUserScenarios } from './test_data';

// Resolve directory name and load env from root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '../../../backend/generated/prisma/index.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

test.describe('Registration API validation (POST /api/v1/auth/register)', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('registers a new user successfully and creates DB records (201)', async ({ request }) => {
    const user = generateValidUser();
    
    // Call registration endpoint via proxy
    const response = await request.post('/api/v1/auth/register', {
      data: {
        email: user.email,
        name: user.name,
        password: user.password,
        mobile: user.mobile,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toBeDefined();
    expect(body.data.user.email).toBe(user.email.toLowerCase());
    expect(response.headers()['authorization']).toMatch(/^Bearer .+/);
    expect(response.headers()['x-refresh-token'] || response.headers()['set-cookie']).toBeDefined();

    // Verify DB states directly
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email.toLowerCase() },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.name).toBe(user.name);
    expect(dbUser!.password).not.toBe(user.password); // password must be hashed/encrypted
    expect(dbUser!.status).toBe('verified');

    // Verify default UserSettings were created
    const dbSettings = await prisma.userSettings.findUnique({
      where: { userId: dbUser!.id },
    });
    expect(dbSettings).not.toBeNull();

    // Verify default Categories were created
    const dbCategories = await prisma.category.findMany({
      where: { userId: dbUser!.id },
    });
    expect(dbCategories.length).toBeGreaterThan(0);
  });

  test('rejects duplicate email with 409 Conflict', async ({ request }) => {
    const user = generateValidUser();
    
    // First registration
    const firstResponse = await request.post('/api/v1/auth/register', {
      data: {
        email: user.email,
        name: user.name,
        password: user.password,
        mobile: user.mobile,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(firstResponse.status()).toBe(201);

    // Second registration with same email
    const secondResponse = await request.post('/api/v1/auth/register', {
      data: {
        email: user.email,
        name: 'Another Name',
        password: user.password,
        mobile: '9999999999',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(secondResponse.status()).toBe(409);
    const secondBody = await secondResponse.json();
    expect(secondBody.code).toMatch(/EMAIL_EXISTS|CONFLICT/i);
  });

  // Loop through negative scenarios
  for (const scenario of invalidUserScenarios) {
    if (scenario.expectedError === null) continue; // handle safety tests separately

    test(`rejects validation scenario: ${scenario.name}`, async ({ request }) => {
      const user = generateValidUser();
      const payload = {
        email: user.email,
        name: user.name,
        password: user.password,
        mobile: user.mobile,
        ...scenario.data,
      };

      const response = await request.post('/api/v1/auth/register', {
        data: payload,
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.code).toBe(scenario.expectedError);
    });
  }

  test('sanitizes and processes Name with SQL Injection payload safely', async ({ request }) => {
    const user = generateValidUser();
    const sqlInjectionPayload = "' OR '1'='1";
    
    const response = await request.post('/api/v1/auth/register', {
      data: {
        email: user.email,
        name: sqlInjectionPayload,
        password: user.password,
        mobile: user.mobile,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status()).toBe(201);

    // Verify DB contains literal injection payload (shows it wasn't executed)
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email.toLowerCase() },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.name).toBe(sqlInjectionPayload);
  });

  test('processes Name with XSS payload safely by stripping scripts', async ({ request }) => {
    const user = generateValidUser();
    const xssPayload = 'QA User <script>alert("xss")</script>';

    const response = await request.post('/api/v1/auth/register', {
      data: {
        email: user.email,
        name: xssPayload,
        password: user.password,
        mobile: user.mobile,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status()).toBe(201);

    // Verify DB contains sanitized payload where the script is stripped
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email.toLowerCase() },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.name).toBe('QA User');
  });
});
