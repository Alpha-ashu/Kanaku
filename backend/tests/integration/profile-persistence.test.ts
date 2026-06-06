/**
 * PROFILE PERSISTENCE & MERGING - Integration Test Suite
 * Covers: Profile update merging, preservation of phone/mobile, avatarUrl format, and partial update merging.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { prisma } from '../../src/db/prisma';

const API = '/api/v1';

// Unique test user helper
const uniqueEmail = () => `profile_test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;

const getSignedAuthToken = (userId: string, email: string, name: string) => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }

  return jwt.sign(
    {
      userId,
      id: userId,
      email,
      role: 'user',
      isApproved: true,
      name,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

describe('PROFILE PERSISTENCE & MERGING MODULE', () => {
  let userId: string;
  let email: string;
  let token: string;
  const name = 'John Doe';
  const phone = '+1234567890';

  beforeAll(async () => {
    email = uniqueEmail();
  });

  afterAll(async () => {
    // Cleanup the test user
    if (userId) {
      try {
        await prisma.user.delete({ where: { id: userId } });
      } catch (err) {
        // Ignore errors if already deleted
      }
    }
  });

  it('should successfully register a user and save their phone/mobile number', async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({
        email,
        name,
        password: 'SecurePass123!',
        phone,
      });

    // 201 Created (or 500 if DB is offline, but we expect it to be online for verification)
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email },
    });
    expect(user).toBeDefined();
    userId = user!.id;
    token = getSignedAuthToken(userId, email, name);

    // Verify phone is in public.profiles table
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
    });
    expect(profile).toBeDefined();
    expect(profile!.phone).toBe(phone);
  });

  it('should preserve phone/mobile number on onboarding completion (partial update)', async () => {
    expect(token).toBeDefined();

    // Onboarding completes and sends onboarding data but omits phone/mobile
    const onboardingData = {
      firstName: 'John',
      lastName: 'Doe',
      gender: 'male',
      country: 'Canada',
      state: 'Ontario',
      city: 'Toronto',
      jobType: 'salaried',
      monthlyIncome: 5000,
      dateOfBirth: '1995-05-15',
    };

    const res = await request(app)
      .put(`${API}/auth/profile`)
      .set('Authorization', `Bearer ${token}`)
      .send(onboardingData);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.firstName).toBe('John');
    expect(res.body.data.lastName).toBe('Doe');
    expect(res.body.data.gender).toBe('male');
    expect(res.body.data.phone).toBe(phone); // Verified that phone is NOT overwritten with null!

    // Verify database state directly
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
    });
    expect(profile!.phone).toBe(phone);
    expect(profile!.first_name).toBe('John');
    expect(profile!.last_name).toBe('Doe');
  });

  it('should merge partial profile updates correctly without resetting other fields', async () => {
    // Update only avatar and state
    const partialUpdate = {
      state: 'Quebec',
      avatarUrl: 'https://example.com/avatar.png',
      avatarId: 'avatar_1',
    };

    const res = await request(app)
      .put(`${API}/auth/profile`)
      .set('Authorization', `Bearer ${token}`)
      .send(partialUpdate);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.state).toBe('Quebec');
    expect(res.body.data.city).toBe('Toronto'); // Preserved from previous update
    expect(res.body.data.gender).toBe('male'); // Preserved from previous update
    expect(res.body.data.phone).toBe(phone); // Preserved
    expect(res.body.data.avatarUrl).toBe('https://example.com/avatar.png');
    expect(res.body.data.avatarId).toBe('avatar_1');
  });

  it('should retrieve a profile containing correct camelCase avatarUrl', async () => {
    const res = await request(app)
      .get(`${API}/auth/profile`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toBe('https://example.com/avatar.png');
    expect(res.body.data.avatarId).toBe('avatar_1');
    expect(res.body.data.phone).toBe(phone);
  });
});
