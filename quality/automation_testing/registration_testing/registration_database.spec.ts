import { test, expect } from '@playwright/test';
import { config } from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { generateValidUser } from './test_data';

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

test.describe('Registration Database and Profile Persistence Gating', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('verifies registration inputs correctly map to DB tables and reflect in profile endpoints', async ({ request }) => {
    const user = generateValidUser();
    
    // Step 1: Register User
    const regResponse = await request.post('/api/v1/auth/register', {
      data: {
        email: user.email,
        name: user.name,
        password: user.password,
        mobile: user.mobile,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(regResponse.status()).toBe(201);
    
    const regBody = await regResponse.json();
    const token = regResponse.headers()['authorization'];
    expect(token).toBeDefined();

    // Verify User record exists in local DB
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email.toLowerCase() },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.email).toBe(user.email.toLowerCase());
    expect(dbUser!.name).toBe(user.name);
    expect(dbUser!.status).toBe('verified');
    
    // Step 2: Simulate Onboarding Profile Update (PUT /api/v1/auth/profile)
    const profilePayload = {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.mobile,
      mobile: user.mobile,
      dateOfBirth: '1990-10-25',
      gender: 'male',
      country: 'India',
      state: 'Karnataka',
      city: 'Bengaluru',
      jobType: 'Full-time Employment',
      monthlyIncome: 75000,
    };

    const profResponse = await request.put('/api/v1/auth/profile', {
      data: profilePayload,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });
    expect(profResponse.status()).toBe(200);

    // Verify profiles record directly via Raw SQL and ORM queries
    const dbProfile = await prisma.profiles.findUnique({
      where: { id: dbUser!.id },
    });
    expect(dbProfile).not.toBeNull();
    expect(dbProfile!.email).toBe(user.email.toLowerCase());
    expect(dbProfile!.first_name).toBe(user.firstName);
    expect(dbProfile!.last_name).toBe(user.lastName);
    expect(dbProfile!.phone).toBe(user.mobile);
    expect(dbProfile!.gender).toBe('male');
    expect(dbProfile!.job_type).toBe('Full-time Employment');
    expect(dbProfile!.country).toBe('India');
    expect(dbProfile!.state).toBe('Karnataka');
    expect(dbProfile!.city).toBe('Bengaluru');
    expect(dbProfile!.monthly_income?.toNumber()).toBe(75000);
    expect(dbProfile!.annual_income?.toNumber()).toBe(900000);
    expect(dbProfile!.date_of_birth?.toISOString()).toContain('1990-10-25');

    // Step 3: Simulate Onboarding Settings Update (PUT /api/v1/settings)
    const settingsPayload = {
      currency: 'INR',
      language: 'en',
      timezone: 'Asia/Kolkata',
    };
    const settingsResponse = await request.put('/api/v1/settings', {
      data: settingsPayload,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });
    expect(settingsResponse.status()).toBe(200);

    // Verify UserSettings record in database
    const dbSettings = await prisma.userSettings.findUnique({
      where: { userId: dbUser!.id },
    });
    expect(dbSettings).not.toBeNull();
    expect(dbSettings!.currency).toBe('INR');
    expect(dbSettings!.language).toBe('en');
    expect(dbSettings!.timezone).toBe('Asia/Kolkata');

    // Step 4: Simulate Onboarding Bank Account Setup (POST /api/v1/accounts)
    const accountPayload = {
      name: 'Primary HDFC Account',
      type: 'bank',
      provider: 'HDFC Bank',
      country: 'India',
      balance: 10000,
      currency: 'INR',
    };
    const accResponse = await request.post('/api/v1/accounts', {
      data: accountPayload,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });
    expect(accResponse.status()).toBe(201);

    // Verify Account record in database
    const dbAccount = await prisma.account.findFirst({
      where: { userId: dbUser!.id, name: 'Primary HDFC Account' },
    });
    expect(dbAccount).not.toBeNull();
    expect(dbAccount!.type).toBe('bank');
    expect(dbAccount!.provider).toBe('HDFC Bank');
    expect(dbAccount!.country).toBe('India');
    expect(dbAccount!.currency).toBe('INR');
    expect(dbAccount!.balance.toNumber()).toBe(10000);

    // Step 5: Verify GET /api/v1/auth/profile (Simulates User Profile Page Retrieval)
    const getProfResponse = await request.get('/api/v1/auth/profile?includePrivate=true', {
      headers: {
        'Authorization': token,
      },
    });
    expect(getProfResponse.status()).toBe(200);
    const getProfBody = await getProfResponse.json();
    expect(getProfBody.success).toBe(true);

    const profileData = getProfBody.data;
    // Check user info
    expect(profileData.email).toBe(user.email.toLowerCase());
    expect(profileData.name).toBe(user.name);
    // Check profile fields
    expect(profileData.firstName).toBe(user.firstName);
    expect(profileData.lastName).toBe(user.lastName);
    expect(profileData.phone).toBe(user.mobile);
    expect(profileData.gender).toBe('male');
    expect(profileData.dateOfBirth).toContain('1990-10-25');
    expect(profileData.jobType).toBe('Full-time Employment');
    expect(profileData.monthlyIncome).toBe(75000);
    expect(profileData.salary).toBe(900000);
    expect(profileData.country).toBe('India');
    expect(profileData.state).toBe('Karnataka');
    expect(profileData.city).toBe('Bengaluru');
    // Check settings fields
    expect(profileData.currency).toBe('INR');
    expect(profileData.language).toBe('en');

    // Step 6: Verify GET /api/v1/accounts (Simulates Account Page Retrieval)
    const getAccResponse = await request.get('/api/v1/accounts', {
      headers: {
        'Authorization': token,
      },
    });
    expect(getAccResponse.status()).toBe(200);
    const getAccBody = await getAccResponse.json();
    expect(getAccBody.success).toBe(true);
    expect(getAccBody.data).toBeDefined();
    expect(getAccBody.data.length).toBeGreaterThanOrEqual(1);

    const firstAccount = getAccBody.data.find((a: any) => a.name === 'Primary HDFC Account');
    expect(firstAccount).toBeDefined();
    expect(firstAccount.type).toBe('bank');
    expect(firstAccount.provider).toBe('HDFC Bank');
    expect(parseFloat(firstAccount.balance)).toBe(10000);
    expect(firstAccount.currency).toBe('INR');
  });
});
