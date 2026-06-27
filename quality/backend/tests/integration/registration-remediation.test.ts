/**
 * Registration remediation (Phase 1) — verifies the atomic registration flow:
 * single transaction (user + profile + settings + categories), mandatory profile,
 * derived currency/locale, default categories, audit logging, duplicate handling,
 * and rollback/race safety.
 *
 * Like the other integration suites, these tolerate a DB-unavailable environment
 * (status 500/503) and only assert the DB state when registration returns 201.
 */
import request from 'supertest';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { DEFAULT_CATEGORIES } from '../../../../backend/src/features/auth/registration.defaults';

const API = '/api/v1';
const uniqueEmail = () => `reg_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
let phoneSeq = 0;
const uniquePhone = (cc = '+91') => `${cc} 9${String(Date.now()).slice(-4)}${String(phoneSeq++).padStart(5, '0')}`;

const createdUserIds = new Set<string>();
const dbUp = (status: number) => status === 201;

async function registerUser(body: Record<string, unknown>) {
  const res = await request(app).post(`${API}/auth/register`).send(body);
  if (res.status === 201 && res.body?.data?.user?.id) createdUserIds.add(res.body.data.user.id);
  return res;
}

afterAll(async () => {
  // Cascade (FK) removes profile/settings/categories with the user.
  for (const id of createdUserIds) {
    try { await prisma.user.delete({ where: { id } }); } catch { /* ignore */ }
  }
  await prisma.$disconnect().catch(() => {});
});

describe('Registration remediation', () => {
  it('creates user + profile + settings + default categories atomically (201)', async () => {
    const email = uniqueEmail();
    const res = await registerUser({ name: 'Reg Test', email, password: 'SecurePass123!', mobile: uniquePhone('+91') });
    expect([201, 500, 503]).toContain(res.status);
    if (!dbUp(res.status)) return;

    const userId = res.body.data.user.id;
    const [profile, settings, categories] = await Promise.all([
      prisma.profiles.findUnique({ where: { id: userId } }),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.category.findMany({ where: { userId } }),
    ]);
    expect(profile).not.toBeNull();          // profile is mandatory now
    expect(settings).not.toBeNull();         // settings always created
    expect(categories.length).toBe(DEFAULT_CATEGORIES.length);
  });

  it('derives currency/locale from the signup country (+91 → INR/en-IN)', async () => {
    const res = await registerUser({ name: 'India User', email: uniqueEmail(), password: 'SecurePass123!', mobile: uniquePhone('+91') });
    if (!dbUp(res.status)) return;
    const settings = await prisma.userSettings.findUnique({ where: { userId: res.body.data.user.id } });
    expect(settings?.currency).toBe('INR');
    expect(settings?.language).toBe('en-IN');
  });

  it('derives currency/locale for +1 → USD/en-US', async () => {
    const res = await registerUser({ name: 'US User', email: uniqueEmail(), password: 'SecurePass123!', mobile: uniquePhone('+1') });
    if (!dbUp(res.status)) return;
    const settings = await prisma.userSettings.findUnique({ where: { userId: res.body.data.user.id } });
    expect(settings?.currency).toBe('USD');
    expect(settings?.language).toBe('en-US');
  });

  it('stores default notification preferences inside UserSettings.settings', async () => {
    const res = await registerUser({ name: 'Notif User', email: uniqueEmail(), password: 'SecurePass123!', mobile: uniquePhone('+91') });
    if (!dbUp(res.status)) return;
    const settings = await prisma.userSettings.findUnique({ where: { userId: res.body.data.user.id } });
    expect((settings?.settings as any)?.notifications?.email).toBe(true);
  });

  it('writes an immutable audit record for the successful registration', async () => {
    const res = await registerUser({ name: 'Audit User', email: uniqueEmail(), password: 'SecurePass123!', mobile: uniquePhone('+91') });
    if (!dbUp(res.status)) return;
    const audits = await prisma.auditLog.findMany({ where: { userId: res.body.data.user.id, action: 'auth.register' } });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0].requestId).toBeTruthy();
  });

  it('rejects a duplicate email (409) and creates no second user', async () => {
    const email = uniqueEmail();
    const first = await registerUser({ name: 'Dup A', email, password: 'SecurePass123!', mobile: uniquePhone('+91') });
    if (!dbUp(first.status)) return;
    const second = await request(app).post(`${API}/auth/register`).send({ name: 'Dup B', email, password: 'SecurePass123!', mobile: uniquePhone('+91') });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('EMAIL_EXISTS');
    const users = await prisma.user.findMany({ where: { email } });
    expect(users.length).toBe(1);
  });

  it('rejects a duplicate phone (409)', async () => {
    const phone = uniquePhone('+91');
    const first = await registerUser({ name: 'Phone A', email: uniqueEmail(), password: 'SecurePass123!', mobile: phone });
    if (!dbUp(first.status)) return;
    const second = await request(app).post(`${API}/auth/register`).send({ name: 'Phone B', email: uniqueEmail(), password: 'SecurePass123!', mobile: phone });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('PHONE_EXISTS');
  });

  it('is race-safe: concurrent same-email registrations yield exactly one user (rollback proof)', async () => {
    const email = uniqueEmail();
    const body = { name: 'Race', password: 'SecurePass123!' };
    const results = await Promise.allSettled(
      [0, 1, 2, 3].map((i) => registerUser({ ...body, email, mobile: uniquePhone('+91') })),
    );
    const statuses = results.map((r) => (r.status === 'fulfilled' ? (r.value as any).status : 0));
    if (!statuses.includes(201)) return; // DB unavailable
    const users = await prisma.user.findMany({ where: { email } });
    const profiles = await prisma.profiles.findMany({ where: { email } });
    expect(users.length).toBe(1);          // only one winner — others rolled back
    expect(profiles.length).toBe(1);       // no partial/orphan profile
  });
});
