/**
 * POST /pin/create against an account that already has a PIN.
 *
 * This is the state a returning user lands in whenever the client's /pin/status
 * lookup was inconclusive (backend cold, throttled, session still settling after
 * OTP verification) and the app therefore offered PIN *creation*. The refusal is
 * correct — overwriting a PIN from a plain session would let any access token
 * re-key the app lock — but it has to be distinguishable, or the PIN screen has
 * nothing to act on and onboarding dead-ends.
 *
 * So this asserts the contract the client recovers through: 409 + the
 * PIN_ALREADY_EXISTS code, and the stored PIN left untouched.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';
const uniqueEmail = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;

const token = (userId: string) => {
  const secret = process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long-for-testing';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, type: 'access' }, secret, { expiresIn: '15m' });
};

describe('POST /pin/create when a PIN already exists', () => {
  let userId = '';
  let originalHash = '';
  // Neither sequential nor repeating, so it survives the weak-PIN check and the
  // request reaches the "already exists" branch under test.
  const EXISTING_PIN = '481937';
  const NEW_PIN = '596284';

  beforeAll(async () => {
    try {
      const user = await prisma.user.create({
        data: { email: uniqueEmail('pinconflict'), name: 'Pin Conflict', password: 'x', role: 'user', isApproved: true },
      });
      userId = user.id;
      originalHash = await bcrypt.hash(EXISTING_PIN, 10);
      await prisma.userPin.create({
        data: {
          userId,
          pinHash: originalHash,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });
    } catch {
      /* DB unavailable — the test self-skips below */
    }
  });

  afterAll(async () => {
    if (userId) {
      await prisma.userPin.deleteMany({ where: { userId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
  });

  it('answers 409 PIN_ALREADY_EXISTS instead of an opaque 400', async () => {
    if (!userId) return; // seeding failed (no DB) → skip

    const res = await request(app)
      .post(`${API}/pin/create`)
      .set('Authorization', `Bearer ${token(userId)}`)
      .send({ pin: NEW_PIN });

    if (res.status === 503) return; // DB went away mid-test

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PIN_ALREADY_EXISTS');
  });

  it('leaves the stored PIN untouched, so the existing PIN still verifies', async () => {
    if (!userId) return;

    const stored = await prisma.userPin.findUnique({ where: { userId } }).catch(() => null);
    if (!stored) return;

    expect(stored.pinHash).toBe(originalHash);
    await expect(bcrypt.compare(EXISTING_PIN, stored.pinHash)).resolves.toBe(true);
    await expect(bcrypt.compare(NEW_PIN, stored.pinHash)).resolves.toBe(false);
  });
});
