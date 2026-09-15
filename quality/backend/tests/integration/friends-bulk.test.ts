/**
 * POST /friends/bulk — phone-contacts import path.
 *
 * Contact lists are hundreds of rows and names routinely carry emoji, so this
 * asserts a full-size batch of emoji names saves verbatim in one request, the
 * per-request cap still rejects oversize batches (the web client splits into
 * batches of that size), and friends still link to matching unlinked group
 * members. Tolerates a DB-unavailable environment like the other suites.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';
const userId = randomUUID();
let dbAvailable = true;

const authHeaders = () => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId, id: userId, email: `bulk_${userId}@example.com`, role: 'user' }, secret, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}` };
};

const EMOJI_NAMES = [
  'Family Ambrin 💕',
  '👨‍👩‍👧‍👦 Home',
  'Priya 🇮🇳',
  'Arun 👍🏽',
  '🎂',
  'Kanmani Sarees 🥻✨',
];

beforeAll(async () => {
  try {
    await prisma.user.create({
      data: { id: userId, email: `bulk_${userId}@example.com`, name: 'Bulk Import', password: 'Password123!', role: 'user', isApproved: true },
    });
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  // Cascade removes the user's friends and group expenses.
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

describe('POST /friends/bulk', () => {
  it('saves a full 200-row batch with emoji names verbatim', async () => {
    if (!dbAvailable) return;
    const friends = Array.from({ length: 200 }, (_, i) => ({
      name: i < EMOJI_NAMES.length ? EMOJI_NAMES[i] : `Contact ${i} 😊`,
      phone: i % 3 === 0 ? undefined : `+9190000${String(i).padStart(5, '0')}`,
    }));

    const res = await request(app).post(`${API}/friends/bulk`).set(authHeaders()).send({ friends });
    expect(res.status).toBe(201);
    expect(res.body.data.createdCount).toBe(200);
    expect(res.body.data.skippedCount).toBe(0);

    const stored = await prisma.friend.findMany({ where: { userId }, select: { name: true } });
    const storedNames = new Set(stored.map((f) => f.name));
    for (const name of EMOJI_NAMES) expect(storedNames.has(name)).toBe(true);
  });

  it('skips names that already exist when the same list is re-sent', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post(`${API}/friends/bulk`)
      .set(authHeaders())
      .send({ friends: [{ name: EMOJI_NAMES[0] }, { name: 'Brand New 🆕' }] });
    expect(res.status).toBe(201);
    expect(res.body.data.createdCount).toBe(1);
    expect(res.body.data.skipped).toEqual([{ name: EMOJI_NAMES[0], reason: 'A friend with this name already exists' }]);
  });

  it('rejects more than 200 rows in one request (client must batch)', async () => {
    if (!dbAvailable) return;
    const friends = Array.from({ length: 201 }, (_, i) => ({ name: `Too Many ${i}` }));
    const res = await request(app).post(`${API}/friends/bulk`).set(authHeaders()).send({ friends });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('links a new friend to an unlinked group member with the same name', async () => {
    if (!dbAvailable) return;
    const group = await prisma.groupExpense.create({
      data: {
        userId, name: 'Trip', totalAmount: 900, date: new Date(),
        groupMembers: { create: [{ name: 'shakin dad 🧔' }] },
      },
      include: { groupMembers: true },
    });

    const res = await request(app)
      .post(`${API}/friends/bulk`)
      .set(authHeaders())
      .send({ friends: [{ name: 'Shakin Dad 🧔', phone: '+919000099999' }, { name: 'Unrelated 🙂' }] });
    expect(res.status).toBe(201);

    const friend = res.body.data.created.find((f: any) => f.name === 'Shakin Dad 🧔');
    const member = await prisma.groupExpenseMember.findUnique({ where: { id: group.groupMembers[0].id } });
    expect(member?.friendId).toBe(friend.id);
    expect(member?.phone).toBe('+919000099999');
  });
});
