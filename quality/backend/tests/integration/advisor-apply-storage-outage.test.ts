/**
 * What /advisors/apply does when the document bucket is unreachable.
 *
 * This is the production failure mode behind the reported 500: SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY are `sync: false` in render.yaml (dashboard-only),
 * so the deployed service can be missing them while `backend/.env` has them, and
 * `uploadBuffer` then throws on every call. Uploads are the only step between
 * the pre-checks and the transaction that is not exercised by the happy-path
 * suite, and the endpoint is the only one of the three in the report that writes
 * to the bucket.
 *
 * It used to surface as a bare 500 with `{"error":{}}` in the logs. This pins the
 * three things that make it diagnosable and safe instead:
 *   - 503 + STORAGE_UNAVAILABLE, not a 4xx the user can pointlessly retry
 *   - documents already uploaded are rolled back, not orphaned in the bucket
 *   - no half-written application row
 */
const uploadBuffer = jest.fn();
// Typed params so `mock.calls[0][0]` is the path, not an empty tuple.
const removeObject = jest.fn(async (_path: string) => undefined);

jest.mock('../../../../backend/src/utils/storage', () => ({
  uploadBuffer,
  removeObject,
  createSignedUrl: jest.fn(async () => 'https://example.test/signed'),
  getStorageHealth: () => ({ configured: false, bucket: 'expense-bills', probe: 'unconfigured' }),
  verifyStorageBucket: jest.fn(async () => undefined),
  STORAGE_BUCKET: 'expense-bills',
  SIGNED_URL_TTL: 600,
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

const submit = (userId: string) =>
  request(app)
    .post('/api/v1/advisors/apply')
    .set('Authorization', `Bearer ${token(userId)}`)
    .field('fullName', 'Storage Outage')
    .field('phone', '+919000000001')
    .field('experienceYears', '4')
    .field('expertise', 'Tax Planning')
    .field('bio', 'Advisor applying while the bucket is down.')
    .attach('panDocument', Buffer.from('%PDF-1.4 pan'), { filename: 'pan.pdf', contentType: 'application/pdf' })
    .attach('aadhaarDocument', Buffer.from('%PDF-1.4 aadhaar'), { filename: 'aadhaar.pdf', contentType: 'application/pdf' });

describe('/advisors/apply when document storage is unavailable', () => {
  let applicantId = '';

  beforeAll(async () => {
    try {
      const user = await prisma.user.create({
        data: { email: uniqueEmail('storageout'), name: 'Storage Outage', password: 'x', role: 'user', isApproved: true },
      });
      applicantId = user.id;
    } catch {
      /* DB unavailable — self-skips below */
    }
  });

  afterAll(async () => {
    if (applicantId) {
      await prisma.advisorApplication.deleteMany({ where: { userId: applicantId } }).catch(() => undefined);
      await prisma.notification.deleteMany({ where: { userId: applicantId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: applicantId } }).catch(() => undefined);
    }
  });

  beforeEach(() => {
    uploadBuffer.mockReset();
    removeObject.mockClear();
  });

  it('answers 503 STORAGE_UNAVAILABLE rather than an opaque 500', async () => {
    if (!applicantId) return;
    uploadBuffer.mockRejectedValue(new Error('Persistent cloud storage unavailable: Upload failed'));

    const res = await submit(applicantId);
    if (res.status === 503 && res.body.code === 'DB_OFFLINE') return; // DB, not storage

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('STORAGE_UNAVAILABLE');
  });

  it('rolls back documents already uploaded when a later one fails', async () => {
    if (!applicantId) return;
    // PAN lands, Aadhaar fails — the PAN object must not be left behind.
    uploadBuffer
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('Persistent cloud storage unavailable: Upload failed'));

    const res = await submit(applicantId);
    if (res.body?.code === 'DB_OFFLINE') return;

    expect(res.status).toBe(503);
    expect(removeObject).toHaveBeenCalledTimes(1);
    expect(String(removeObject.mock.calls[0][0])).toContain(`advisor-docs/${applicantId}/pan-`);
  });

  it('writes no application row when the documents never landed', async () => {
    if (!applicantId) return;
    uploadBuffer.mockRejectedValue(new Error('Persistent cloud storage unavailable: Upload failed'));

    await submit(applicantId);

    const row = await prisma.advisorApplication.findUnique({ where: { userId: applicantId } }).catch(() => null);
    expect(row).toBeNull();
  });
});
