/**
 * Shared fixtures for the coin wallet / payments / session-payment suites.
 *
 * Import AFTER any jest.mock() in the suite (jest hoists mocks above imports,
 * so a normal import statement is fine).
 */
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../../../../backend/src/db/prisma';

export type Role = 'admin' | 'manager' | 'advisor' | 'user';

export const API = '/api/v1';

/** Access token. Under NODE_ENV=test the auth middleware trusts these role claims. */
export const token = (userId: string, role: Role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long-for-testing';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, role, isApproved: true, type: 'access', jti: randomUUID() }, secret, { expiresIn: '15m' });
};

export const bearer = (userId: string, role: Role = 'user') => ({ Authorization: `Bearer ${token(userId, role)}` });

const uniqueEmail = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;

export const makeUser = async (name: string, role: Role = 'user') =>
  prisma.user.create({
    data: { email: uniqueEmail(name.toLowerCase().replace(/\W+/g, '')), name, password: 'x', role, isApproved: true, emailVerified: true },
  });

/** An approved advisor with a published hourly rate (the server prices sessions from it). */
export const makeAdvisor = async (name: string, hourlyRate: number) => {
  const advisor = await makeUser(name, 'advisor');
  await prisma.advisorApplication.create({
    data: {
      userId: advisor.id,
      fullName: name,
      email: advisor.email,
      phone: '+919000000000',
      experienceYears: 5,
      expertise: 'Tax Planning',
      bio: 'Test advisor',
      hourlyRate,
      status: 'APPROVED',
    },
  });
  return advisor;
};

/** Wall-clock date/time in Asia/Kolkata `minutes` from now, as the booking form sends it. */
export const istSlot = (minutesFromNow: number) => {
  const at = new Date(Date.now() + minutesFromNow * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { proposedDate: `${get('year')}-${get('month')}-${get('day')}`, proposedTime: `${get('hour')}:${get('minute')}` };
};

export const makePackage = async (coins: number, priceMinor: number, bonusCoins = 0) =>
  prisma.coinPackage.create({
    data: { code: `test-${randomUUID().slice(0, 12)}`, name: `Test ${coins}`, coins, bonusCoins, priceMinor, isActive: true, sortOrder: 999 },
  });

export const walletOf = async (userId: string) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return { available: wallet?.availableBalance ?? 0, pending: wallet?.pendingBalance ?? 0, status: wallet?.status ?? 'ACTIVE' };
};

/** Sum of the ledger per bucket — must always equal the wallet row. */
export const ledgerOf = async (userId: string) => {
  const rows = await prisma.walletTransaction.findMany({ where: { userId } });
  return {
    available: rows.filter((r) => r.bucket === 'AVAILABLE').reduce((s, r) => s + r.amount, 0),
    pending: rows.filter((r) => r.bucket === 'PENDING').reduce((s, r) => s + r.amount, 0),
    rows,
  };
};

/**
 * Users are deleted; wallets and ledger rows are not (the ledger is append-only
 * by trigger and deliberately outlives accounts).
 */
export const cleanupUsers = async (ids: string[]) => {
  const created = ids.filter(Boolean);
  if (!created.length) return;
  await prisma.chatMessage.deleteMany({ where: { senderId: { in: created } } }).catch(() => undefined);
  await prisma.advisorSession.deleteMany({ where: { OR: [{ advisorId: { in: created } }, { clientId: { in: created } }] } }).catch(() => undefined);
  await prisma.bookingRequest.deleteMany({ where: { OR: [{ advisorId: { in: created } }, { clientId: { in: created } }] } }).catch(() => undefined);
  await prisma.notification.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
  await prisma.advisorApplication.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: created } } }).catch(() => undefined);
};
