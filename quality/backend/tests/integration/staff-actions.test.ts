/**
 * Staff changing someone's access — the rules shared by an admin's direct
 * role/status change and a manager request an admin approves.
 *
 * Before: an admin could change or block their own account, make anyone an
 * advisor (who receives and withdraws money) without the KYC review, a manager
 * could file any action/role/target — including "admin", themselves or an
 * admin — and an approval ran twice on a double click or after a reject.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';
const run = randomUUID().slice(0, 8);

const auth = (userId: string, role: string) => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId, id: userId, email: `${role}_${userId.slice(0, 8)}@test.com`, role, isApproved: true }, secret, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}` };
};

const ids = { admin: '', manager: '', target: '' };
let dbReady = false;

const makeUser = async (role: string) => {
  const user = await prisma.user.create({
    data: { email: `staff-${role}-${run}-${randomUUID().slice(0, 6)}@example.com`, name: `Staff test ${role}`, password: 'x', role },
    select: { id: true },
  });
  return user.id;
};

beforeAll(async () => {
  try {
    ids.admin = await makeUser('admin');
    ids.manager = await makeUser('manager');
    ids.target = await makeUser('user');
    dbReady = true;
  } catch {
    dbReady = false;
  }
});

afterAll(async () => {
  if (!dbReady) return;
  await prisma.approvalRequest.deleteMany({ where: { OR: [{ requesterId: ids.manager }, { targetUserId: ids.target }] } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } }).catch(() => undefined);
});

describe("admin's direct role and status changes", () => {
  it('refuses changing your own role', async () => {
    if (!dbReady) return;
    const res = await request(app).post(`${API}/admin/users/${ids.admin}/role`).set(auth(ids.admin, 'admin')).send({ role: 'user' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_ACTION');
  });

  it('refuses blocking your own account', async () => {
    if (!dbReady) return;
    const res = await request(app).post(`${API}/admin/users/${ids.admin}/status`).set(auth(ids.admin, 'admin')).send({ status: 'blocked' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_ACTION');
  });

  it('refuses making someone an advisor without an approved application (KYC)', async () => {
    if (!dbReady) return;
    const res = await request(app).post(`${API}/admin/users/${ids.target}/role`).set(auth(ids.admin, 'admin')).send({ role: 'advisor' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ADVISOR_NOT_VERIFIED');
    expect((await prisma.user.findUnique({ where: { id: ids.target }, select: { role: true } }))?.role).toBe('user');
  });

  it('answers 404 for an unknown account instead of a server error', async () => {
    if (!dbReady) return;
    const res = await request(app).post(`${API}/admin/users/${randomUUID()}/role`).set(auth(ids.admin, 'admin')).send({ role: 'manager' });
    expect(res.status).toBe(404);
  });

  it('changes a role, and audits it', async () => {
    if (!dbReady) return;
    const res = await request(app).post(`${API}/admin/users/${ids.target}/role`).set(auth(ids.admin, 'admin')).send({ role: 'manager' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('manager');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'ROLE_CHANGE', resource: `user:${ids.target}` } });
    expect(audit).toBeTruthy();
    // Back to a plain user for the request tests below.
    await prisma.user.update({ where: { id: ids.target }, data: { role: 'user' } });
  });
});

describe('manager requests and their approval', () => {
  const file = (body: Record<string, unknown>) => request(app).post(`${API}/manager/requests`).set(auth(ids.manager, 'manager')).send(body);

  it('refuses unknown action types, admin as a role, missing reasons, self and admin targets', async () => {
    if (!dbReady) return;
    expect((await file({ actionType: 'MAKE_ME_RICH', targetUserId: ids.target })).body.code).toBe('INVALID_ACTION_TYPE');
    expect((await file({ actionType: 'ROLE_CHANGE', targetUserId: ids.target, payload: { role: 'admin' }, reason: 'Promote please' })).body.code).toBe('INVALID_ROLE');
    expect((await file({ actionType: 'ROLE_CHANGE', targetUserId: ids.target, payload: { role: 'advisor' }, reason: 'Make advisor' })).body.code).toBe('INVALID_ROLE');
    expect((await file({ actionType: 'ROLE_CHANGE', targetUserId: ids.target, payload: { role: 'manager' } })).body.code).toBe('REASON_REQUIRED');
    expect((await file({ actionType: 'ROLE_CHANGE', targetUserId: ids.manager, payload: { role: 'user' }, reason: 'Self demotion' })).body.code).toBe('SELF_REQUEST');
    expect((await file({ actionType: 'STATUS_CHANGE', targetUserId: ids.admin, payload: { status: 'blocked' }, reason: 'Block the admin' })).body.code).toBe('TARGET_NOT_ALLOWED');
  });

  it('runs an approved request exactly once, and a later reject cannot undo the record', async () => {
    if (!dbReady) return;
    const filed = await file({ actionType: 'STATUS_CHANGE', targetUserId: ids.target, payload: { status: 'suspended' }, reason: 'Repeated chargebacks' });
    expect(filed.status).toBe(201);
    const id = filed.body.data.id;

    const [first, second] = await Promise.all([
      request(app).post(`${API}/admin/approvals/${id}/approve`).set(auth(ids.admin, 'admin')),
      request(app).post(`${API}/admin/approvals/${id}/approve`).set(auth(ids.admin, 'admin')),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect((await prisma.user.findUnique({ where: { id: ids.target }, select: { status: true } }))?.status).toBe('suspended');

    const reject = await request(app).post(`${API}/admin/approvals/${id}/reject`).set(auth(ids.admin, 'admin')).send({ reason: 'too late' });
    expect(reject.status).toBe(409);
    expect((await prisma.approvalRequest.findUnique({ where: { id }, select: { status: true } }))?.status).toBe('APPROVED');
  });
});
