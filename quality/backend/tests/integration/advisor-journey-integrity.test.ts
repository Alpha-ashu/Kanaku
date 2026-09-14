/**
 * Advisor journey integrity — duplicate records, decision consistency, sessions.
 *
 * Regression guard for the defects found by the 2026-09-14 end-to-end validation
 * of User -> advisor request -> Manager/Admin approval -> availability -> booking
 * -> acceptance -> confirmation. Each case fires the requests a double-tap or two
 * reviewers produce, concurrently, and asserts the database ends with exactly one
 * logical record:
 *
 *   - apply twice at once      -> 1 application, 1 reviewer notification, loser's uploads removed
 *   - approve twice at once    -> 1 decision + notification; repeats answer 409
 *   - admin-console approve    -> application status moves with the role grant
 *   - availability saved twice -> 1 row per weekday
 *   - booking tapped twice     -> 1 booking; past / off-schedule / malformed slots refused
 *   - accept tapped twice      -> 1 session, no 500
 *   - logout                   -> the presented access + refresh tokens stop working
 *   - manager sets up a PIN    -> role stays 'manager' (PIN setup used to demote managers to 'user')
 *
 * Storage is mocked so the upload paths run without a bucket.
 */
jest.mock('../../../../backend/src/utils/storage', () => ({
  uploadBuffer: jest.fn(async () => undefined),
  createSignedUrl: jest.fn(async () => 'https://example.test/signed'),
  removeObject: jest.fn(async () => undefined),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { generateTokens } from '../../../../backend/src/utils/auth';
import { removeObject, uploadBuffer } from '../../../../backend/src/utils/storage';

const API = '/api/v1';
const uniqueEmail = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
type Role = 'admin' | 'manager' | 'advisor' | 'user';
// Under NODE_ENV=test the auth middleware skips the DB snapshot and trusts the
// token's role claims (ALLOW_TEST_ROLE_FALLBACK), so each call states the role
// the account holds at that point in the journey.
const token = (userId: string, role: Role) => {
  const secret = process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long-for-testing';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, role, isApproved: true, type: 'access', jti: Math.random().toString(36) }, secret, { expiresIn: '15m' });
};
const auth = (userId: string, role: Role = 'user') => ({ Authorization: `Bearer ${token(userId, role)}` });

/** YYYY-MM-DD of the next given weekday at least two days out. */
const nextWeekday = (dow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const apply = (userId: string, fullName: string, role: Role = 'user') =>
  request(app)
    .post(`${API}/advisors/apply`)
    .set(auth(userId, role))
    .field('fullName', fullName)
    .field('phone', '+919000000000')
    .field('experienceYears', '7')
    .field('expertise', 'Retirement planning')
    .field('hourlyRate', '1500')
    .field('bio', 'Adviser focused on retirement planning.')
    .attach('panDocument', Buffer.from('%PDF-1.4 pan'), { filename: 'pan.pdf', contentType: 'application/pdf' })
    .attach('aadhaarDocument', Buffer.from('%PDF-1.4 aadhaar'), { filename: 'aadhaar.pdf', contentType: 'application/pdf' });

describe('Advisor journey integrity', () => {
  const ids = { admin: '', manager: '', applicant: '', probe: '', client: '' };
  let dbReady = false;

  beforeAll(async () => {
    try {
      const make = (name: string, role: string) => prisma.user.create({
        data: { email: uniqueEmail(name.toLowerCase()), name, password: 'x', role, isApproved: true, emailVerified: true },
      });
      ids.admin = (await make('Admin', 'admin')).id;
      ids.manager = (await make('Manager', 'manager')).id;
      ids.applicant = (await make('Muhammad Shah', 'user')).id;
      ids.probe = (await make('Console Probe', 'user')).id;
      ids.client = (await make('Aisha Client', 'user')).id;
      dbReady = true;
    } catch {
      /* DB unavailable — cases self-skip */
    }
  });

  afterAll(async () => {
    const created = Object.values(ids).filter(Boolean);
    if (!created.length) return;
    await prisma.advisorSession.deleteMany({ where: { OR: [{ advisorId: { in: created } }, { clientId: { in: created } }] } }).catch(() => undefined);
    await prisma.bookingRequest.deleteMany({ where: { OR: [{ advisorId: { in: created } }, { clientId: { in: created } }] } }).catch(() => undefined);
    await prisma.advisorAvailability.deleteMany({ where: { advisorId: { in: created } } }).catch(() => undefined);
    await prisma.userPin.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
    await prisma.advisorApplication.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: created } } }).catch(() => undefined);
  });

  it('a double-submitted application yields one application, one notification per reviewer, no orphaned uploads', async () => {
    if (!dbReady) return;
    (removeObject as jest.Mock).mockClear();
    (uploadBuffer as jest.Mock).mockClear();
    const [a, b] = await Promise.all([apply(ids.applicant, 'Muhammad Shah'), apply(ids.applicant, 'Muhammad Shah')]);

    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(await prisma.advisorApplication.count({ where: { userId: ids.applicant } })).toBe(1);
    for (const reviewer of [ids.admin, ids.manager]) {
      expect(await prisma.notification.count({
        where: { userId: reviewer, title: 'New Advisor Application', message: { startsWith: 'Muhammad Shah' } },
      })).toBe(1);
    }
    // Whatever the loser uploaded before losing is removed: only the winner's PAN + Aadhaar remain.
    expect((uploadBuffer as jest.Mock).mock.calls.length - (removeObject as jest.Mock).mock.calls.length).toBe(2);

    // Submitting grants nothing: the role only changes at approval.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.applicant } });
    expect(user.role).toBe('user');
    const mine = await request(app).get(`${API}/advisors/application/my`).set(auth(ids.applicant));
    expect(mine.body.application.status).toBe('PENDING');
    expect(mine.body.isApproved).toBe(false);
  });

  it('staff accounts cannot apply (approval would overwrite their role)', async () => {
    if (!dbReady) return;
    const res = await apply(ids.manager, 'Manager', 'manager');
    expect(res.status).toBe(403);
  });

  it("setting up a PIN leaves a manager's role intact (the queue stays reachable)", async () => {
    if (!dbReady) return;
    const res = await request(app).post(`${API}/pin/create`).set(auth(ids.manager, 'manager')).send({ pin: '135792' });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.manager } })).role).toBe('manager');
  });

  it('concurrent approvals produce one decision; repeats are refused', async () => {
    if (!dbReady) return;
    const approve = () => request(app).put(`${API}/advisors/admin/${ids.applicant}/approve`).set(auth(ids.manager, 'manager'));
    const [a, b] = await Promise.all([approve(), approve()]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await approve()).status).toBe(409);
    expect(await prisma.notification.count({ where: { userId: ids.applicant, title: 'Advisor Application Approved!' } })).toBe(1);

    const app_ = await prisma.advisorApplication.findUniqueOrThrow({ where: { userId: ids.applicant } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.applicant } });
    expect(app_.status).toBe('APPROVED');
    expect(app_.reviewedBy).toBe(ids.manager);
    expect(user.role).toBe('advisor');
    expect(user.isApproved).toBe(true);
  });

  it('the admin console approve/revoke path keeps the application and the role in step', async () => {
    if (!dbReady) return;
    expect((await apply(ids.probe, 'Console Probe')).status).toBe(200);

    const approved = await request(app).post(`${API}/admin/users/${ids.probe}/approve`).set(auth(ids.admin, 'admin'));
    expect(approved.status).toBe(200);
    expect((await prisma.advisorApplication.findUniqueOrThrow({ where: { userId: ids.probe } })).status).toBe('APPROVED');

    const revoked = await request(app).put(`${API}/advisors/admin/${ids.probe}/reject`).set(auth(ids.admin, 'admin')).send({ reason: 'Licence lapsed' });
    expect(revoked.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: ids.probe } });
    expect((await prisma.advisorApplication.findUniqueOrThrow({ where: { userId: ids.probe } })).status).toBe('REJECTED');
    expect(after.role).toBe('user');
    expect(after.isApproved).toBe(false);

    const again = await request(app).put(`${API}/advisors/admin/${ids.probe}/reject`).set(auth(ids.admin, 'admin')).send({ reason: 'again' });
    expect(again.status).toBe(409);
  });

  it('availability saved concurrently keeps one row per weekday, and the advisor can read it', async () => {
    if (!dbReady) return;
    const toggle = () => request(app).put(`${API}/advisors/availability/status`).set(auth(ids.applicant, 'advisor')).send({ available: true });
    const saturday = () => request(app).post(`${API}/advisors/availability`).set(auth(ids.applicant, 'advisor'))
      .send({ dayOfWeek: 6, startTime: '10:00', endTime: '13:00', isActive: true });
    const statuses = (await Promise.all([toggle(), toggle(), saturday(), saturday()])).map((r) => r.status);
    expect(statuses).toEqual([200, 200, 200, 200]);

    const rows = await prisma.advisorAvailability.groupBy({ by: ['dayOfWeek'], where: { advisorId: ids.applicant }, _count: true });
    expect(rows.map((r) => r.dayOfWeek).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.every((r) => r._count === 1)).toBe(true);

    const own = await request(app).get(`${API}/advisors/${ids.applicant}/availability`).set(auth(ids.applicant, 'advisor'));
    expect(own.status).toBe(200);
  });

  it('bookings: refuses past, off-schedule and malformed slots; a double-tap creates one booking', async () => {
    if (!dbReady) return;
    const base = { advisorId: ids.applicant, sessionType: 'video', proposedDate: nextWeekday(2), proposedTime: '11:00', duration: 60, amount: 1500 };
    const book = (body: Record<string, unknown>) =>
      request(app).post(`${API}/bookings`).set(auth(ids.client)).set('Idempotency-Key', Math.random().toString(36)).send(body);

    const listing = await request(app).get(`${API}/advisors`).set(auth(ids.client));
    const listed = (listing.body as any[]).find((a) => a.id === ids.applicant);
    expect(listed).toBeTruthy();
    expect(listed).not.toHaveProperty('email');

    expect((await book({ ...base, proposedDate: '2020-01-07' })).body.code).toBe('BOOKING_IN_PAST');
    expect((await book({ ...base, proposedDate: nextWeekday(0) })).body.code).toBe('ADVISOR_UNAVAILABLE');
    expect((await book({ ...base, proposedTime: '16:30' })).body.code).toBe('ADVISOR_UNAVAILABLE');
    expect((await book({ ...base, proposedTime: '25:99' })).status).toBe(400);

    const [a, b] = await Promise.all([book(base), book(base)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.bookingRequest.count({ where: { clientId: ids.client, advisorId: ids.applicant } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ids.applicant, title: 'New Booking Request' } })).toBe(1);
  });

  it('accept tapped twice creates one session and never answers 500', async () => {
    if (!dbReady) return;
    const booking = await prisma.bookingRequest.findFirstOrThrow({ where: { clientId: ids.client, advisorId: ids.applicant } });
    const accept = () => request(app).put(`${API}/bookings/${booking.id}/accept`).set(auth(ids.applicant, 'advisor')).send({});

    const results = await Promise.all([accept(), accept()]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await accept()).status).toBe(200);
    expect(await prisma.advisorSession.count({ where: { bookingId: booking.id } })).toBe(1);
    expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('accepted');

    const clientView = await request(app).get(`${API}/bookings`).set(auth(ids.client));
    const mine = (clientView.body as any[]).filter((row) => row.id === booking.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe('accepted');
    expect(mine[0].session?.id).toBeTruthy();
  });

  it('logout revokes the presented tokens but not another device session', async () => {
    if (!dbReady) return;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.client } });
    const thisDevice = generateTokens(user);
    const otherDevice = generateTokens(user);

    const out = await request(app).post(`${API}/auth/logout`)
      .set('Authorization', `Bearer ${thisDevice.accessToken}`)
      .set('x-refresh-token', thisDevice.refreshToken);
    expect(out.status).toBe(200);

    const reuse = await request(app).get(`${API}/bookings`).set('Authorization', `Bearer ${thisDevice.accessToken}`);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('SESSION_REVOKED');
    const refresh = await request(app).post(`${API}/auth/refresh`).set('x-refresh-token', thisDevice.refreshToken);
    expect(refresh.status).toBe(401);

    const sibling = await request(app).get(`${API}/bookings`).set('Authorization', `Bearer ${otherDevice.accessToken}`);
    expect(sibling.status).toBe(200);
  });
});
