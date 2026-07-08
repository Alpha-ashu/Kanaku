/**
 * Advisor application → reviewer notification.
 *
 * Requirement: when a user requests the advisor role, BOTH admins and managers
 * must be notified (either can review/approve the queue). Regression guard for
 * the fix that previously notified admins only.
 *
 * Storage is mocked so the (otherwise storage-dependent) apply happy-path runs.
 */
jest.mock('../../../../backend/src/utils/storage', () => ({
  uploadBuffer: jest.fn(async () => undefined),
  createSignedUrl: jest.fn(async () => 'https://example.test/signed'),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const uniqueEmail = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
const token = (userId: string) => {
  const secret = process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long-for-testing';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, type: 'access' }, secret, { expiresIn: '15m' });
};

const dbUp = (s: number) => s !== 503;

describe('Advisor application notifies BOTH admin and manager', () => {
  let adminId = '';
  let managerId = '';
  let applicantId = '';
  const created: string[] = [];

  beforeAll(async () => {
    try {
      const admin = await prisma.user.create({
        data: { email: uniqueEmail('admin'), name: 'Admin', password: 'x', role: 'admin', isApproved: true },
      });
      const manager = await prisma.user.create({
        data: { email: uniqueEmail('mgr'), name: 'Manager', password: 'x', role: 'manager', isApproved: true },
      });
      const applicant = await prisma.user.create({
        data: { email: uniqueEmail('appl'), name: 'Applicant', password: 'x', role: 'user', isApproved: true },
      });
      adminId = admin.id; managerId = manager.id; applicantId = applicant.id;
      created.push(admin.id, manager.id, applicant.id);
    } catch {
      /* DB unavailable — the test self-skips via dbUp() below */
    }
  });

  afterAll(async () => {
    if (created.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
      await prisma.advisorApplication.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: created } } }).catch(() => undefined);
    }
  });

  it('creates a New Advisor Application notification for admins AND managers', async () => {
    if (!applicantId) return; // seeding failed (no DB) → skip
    const res = await request(app)
      .post('/api/v1/advisors/apply')
      .set('Authorization', `Bearer ${token(applicantId)}`)
      .field('fullName', 'Applicant Full')
      .field('phone', '+919000000000')
      .field('experienceYears', '8')
      .field('expertise', 'investments')
      .field('bio', 'Seasoned advisor with a strong track record.')
      .attach('panDocument', Buffer.from('%PDF-1.4 pan'), { filename: 'pan.pdf', contentType: 'application/pdf' })
      .attach('aadhaarDocument', Buffer.from('%PDF-1.4 aadhaar'), { filename: 'aadhaar.pdf', contentType: 'application/pdf' });

    if (!dbUp(res.status)) return;
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const adminNotif = await prisma.notification.findFirst({
      where: { userId: adminId, title: 'New Advisor Application' },
    });
    const managerNotif = await prisma.notification.findFirst({
      where: { userId: managerId, title: 'New Advisor Application' },
    });

    expect(adminNotif).toBeTruthy();
    expect(managerNotif).toBeTruthy(); // the fix: manager must be notified too
    // Deep links are role-appropriate.
    expect(managerNotif?.deepLink).toContain('manager');
  });
});
