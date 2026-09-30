/**
 * Advisor application — documents and the fields around them.
 *
 * Regression guard for the 2026-09-30 "user can't apply for the advisor role"
 * report. The happy-path suites only ever sent a tiny PDF declared as
 * application/pdf, which is not what phones send:
 *
 *   - Android's picker (Drive, Files, some galleries) gives the WebView a File
 *     with no type, which the browser sends as application/octet-stream. A real
 *     PDF was refused as "only JPEG, PNG, WEBP, or PDF allowed".
 *   - The declared type was trusted, so a non-image declared image/png was
 *     stored and later served to reviewers.
 *   - An ineligible applicant uploaded every document before being refused.
 *
 * It also pins the document-security contract: objects in the bucket are
 * ciphertext, documents are read back only through the authenticated route
 * (owner or reviewer, audited), and a resubmission deletes the documents of the
 * application it replaces.
 *
 * Storage is an in-memory map so the bytes actually written can be inspected.
 */
const objects = new Map<string, Buffer>();
const uploadBuffer = jest.fn(async (path: string, buffer: Buffer, _contentType: string) => {
  objects.set(path, Buffer.from(buffer));
});
const downloadBuffer = jest.fn(async (path: string) => (objects.has(path) ? { buffer: objects.get(path)! } : null));
const removeObject = jest.fn(async (path: string) => {
  objects.delete(path);
});

jest.mock('../../../../backend/src/utils/storage', () => ({
  uploadBuffer,
  downloadBuffer,
  removeObject,
  createSignedUrl: jest.fn(async () => 'https://example.test/signed'),
  getStorageHealth: () => ({ configured: true, bucket: 'expense-bills', probe: 'ok' }),
  verifyStorageBucket: jest.fn(async () => undefined),
  STORAGE_BUCKET: 'expense-bills',
  SIGNED_URL_TTL: 600,
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';
const uniqueEmail = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
const token = (userId: string, role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long-for-testing';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, role, isApproved: true, type: 'access', jti: Math.random().toString(36) }, secret, { expiresIn: '15m' });
};

const PDF = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF`);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpeg-body')]);

type Doc = { buffer: Buffer; filename: string; contentType: string };
const apply = (
  userId: string,
  overrides: Record<string, string> = {},
  docs: { pan?: Doc | null; aadhaar?: Doc | null; cert?: Doc | null } = {},
) => {
  const fields: Record<string, string> = {
    fullName: 'Priya Raman',
    phone: '+91 98765 43210',
    experienceYears: '6',
    expertise: 'Tax Planning',
    bio: 'Chartered accountant advising salaried families.',
    ...overrides,
  };
  let req = request(app).post(`${API}/advisors/apply`).set('Authorization', `Bearer ${token(userId)}`);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  const pan = docs.pan === undefined ? { buffer: PDF('pan'), filename: 'pan.pdf', contentType: 'application/pdf' } : docs.pan;
  const aadhaar = docs.aadhaar === undefined ? { buffer: PDF('aadhaar'), filename: 'aadhaar.pdf', contentType: 'application/pdf' } : docs.aadhaar;
  if (pan) req = req.attach('panDocument', pan.buffer, { filename: pan.filename, contentType: pan.contentType });
  if (aadhaar) req = req.attach('aadhaarDocument', aadhaar.buffer, { filename: aadhaar.filename, contentType: aadhaar.contentType });
  if (docs.cert) req = req.attach('certDocument', docs.cert.buffer, { filename: docs.cert.filename, contentType: docs.cert.contentType });
  return req;
};

const readDoc = (viewerId: string, applicationOrUserId: string, docType: string, role = 'user') =>
  request(app)
    .get(`${API}/advisors/application/${applicationOrUserId}/document/${docType}`)
    .set('Authorization', `Bearer ${token(viewerId, role)}`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

/** audit() persists fire-and-forget; give the row a moment to land. */
const waitForAuditRows = async (where: Record<string, unknown>, expected: number) => {
  for (let i = 0; i < 40; i += 1) {
    const count = await prisma.auditLog.count({ where });
    if (count >= expected) return count;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return prisma.auditLog.count({ where });
};

describe('Advisor application documents', () => {
  const ids = { manager: '', android: '', disguised: '', phone: '', pending: '', owner: '', stranger: '', resubmit: '' };
  let dbReady = false;

  beforeAll(async () => {
    try {
      const make = async (name: string, role: string) => (await prisma.user.create({
        data: { email: uniqueEmail(name), name, password: 'x', role, isApproved: true, emailVerified: true },
      })).id;
      ids.manager = await make('docmanager', 'manager');
      for (const key of ['android', 'disguised', 'phone', 'pending', 'owner', 'stranger', 'resubmit'] as const) {
        ids[key] = await make(`doc${key}`, 'user');
      }
      dbReady = true;
    } catch {
      /* DB unavailable — cases self-skip */
    }
  });

  afterAll(async () => {
    const created = Object.values(ids).filter(Boolean);
    if (!created.length) return;
    await prisma.notification.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
    await prisma.advisorApplication.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: created } } }).catch(() => undefined);
  });

  beforeEach(() => {
    uploadBuffer.mockClear();
    removeObject.mockClear();
  });

  it('accepts a real PDF the Android picker sent as application/octet-stream, and stores ciphertext', async () => {
    if (!dbReady) return;
    const res = await apply(ids.android, {}, {
      pan: { buffer: PDF('pan'), filename: 'document', contentType: 'application/octet-stream' },
      aadhaar: { buffer: JPEG, filename: 'IMG_2031', contentType: 'application/octet-stream' },
    });

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('PENDING');
    // Storage keys are internal and are not echoed back.
    expect(JSON.stringify(res.body)).not.toContain('advisor-docs/');

    expect(uploadBuffer).toHaveBeenCalledTimes(2);
    for (const [path, buffer, contentType] of uploadBuffer.mock.calls) {
      expect(path).toMatch(new RegExp(`^advisor-docs/${ids.android}/(pan|aadhaar)-[0-9a-f-]{36}\\.(pdf|jpg)\\.enc$`));
      expect(contentType).toBe('application/octet-stream');
      // Neither the PDF header nor the JPEG magic survives encryption.
      expect(buffer.subarray(0, 4).toString('latin1')).not.toBe('%PDF');
      expect(buffer[0] === 0xff && buffer[1] === 0xd8).toBe(false);
    }
  });

  it('judges a document by its bytes: a non-image declared image/png is refused before any upload', async () => {
    if (!dbReady) return;
    const res = await apply(ids.disguised, {}, {
      aadhaar: { buffer: Buffer.from('<html><script>alert(1)</script></html>'), filename: 'aadhaar.png', contentType: 'image/png' },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DOCUMENT_UNSUPPORTED_TYPE');
    expect(res.body.error).toMatch(/Aadhaar/);
    expect(uploadBuffer).not.toHaveBeenCalled();
    expect(await prisma.advisorApplication.findUnique({ where: { userId: ids.disguised } })).toBeNull();
  });

  it('names the field that is wrong instead of failing the whole form generically', async () => {
    if (!dbReady) return;
    const badPhone = await apply(ids.phone, { phone: 'call me' });
    expect(badPhone.status).toBe(400);
    expect(badPhone.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'phone', error: 'Enter a valid mobile number' });

    const decimalYears = await apply(ids.phone, { experienceYears: '2.5' });
    expect(decimalYears.status).toBe(400);
    expect(decimalYears.body.field).toBe('experienceYears');

    const negativeFee = await apply(ids.phone, { hourlyRate: '-100' });
    expect(negativeFee.status).toBe(400);
    expect(negativeFee.body.field).toBe('hourlyRate');

    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('stores markup-free text and an unset fee as null', async () => {
    if (!dbReady) return;
    const res = await apply(ids.phone, { fullName: '<b>Arun</b> Kumar', hourlyRate: '' });
    expect(res.status).toBe(200);
    const row = await prisma.advisorApplication.findUniqueOrThrow({ where: { userId: ids.phone } });
    expect(row.fullName).toBe('Arun Kumar');
    expect(row.hourlyRate).toBeNull();
  });

  it('refuses a second application while one is pending without uploading anything', async () => {
    if (!dbReady) return;
    expect((await apply(ids.pending)).status).toBe(200);
    uploadBuffer.mockClear();

    const again = await apply(ids.pending);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('APPLICATION_PENDING');
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('serves a document decrypted to its owner and to a reviewer, audits it, and hides it from anyone else', async () => {
    if (!dbReady) return;
    const pan = PDF('owner-pan');
    expect((await apply(ids.owner, {}, { pan: { buffer: pan, filename: 'pan.pdf', contentType: 'application/pdf' } })).status).toBe(200);
    const application = await prisma.advisorApplication.findUniqueOrThrow({ where: { userId: ids.owner } });

    const own = await readDoc(ids.owner, application.id, 'pan');
    expect(own.status).toBe(200);
    expect(Buffer.compare(own.body as Buffer, pan)).toBe(0);
    expect(own.headers['content-type']).toMatch(/^application\/pdf/);
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect(own.headers['cache-control']).toMatch(/no-store/);

    // Reviewers address the application by the applicant's user id as well.
    const reviewer = await readDoc(ids.manager, ids.owner, 'aadhaar', 'manager');
    expect(reviewer.status).toBe(200);
    expect((reviewer.body as Buffer).subarray(0, 4).toString('latin1')).toBe('%PDF');

    // Another user is told nothing — not even that the application exists.
    const stranger = await readDoc(ids.stranger, application.id, 'pan');
    expect(stranger.status).toBe(404);

    expect((await readDoc(ids.owner, application.id, 'cert')).status).toBe(404); // not provided
    expect((await readDoc(ids.owner, application.id, 'passport')).status).toBe(400); // not a document type

    const resourceId = application.id;
    expect(await waitForAuditRows({ action: 'kyc.document_view', resourceId }, 2)).toBe(2);
    expect(await waitForAuditRows({ action: 'kyc.document_view_denied', resourceId, userId: ids.stranger }, 1)).toBe(1);
  });

  it('a resubmission after rejection deletes the documents it replaces', async () => {
    if (!dbReady) return;
    expect((await apply(ids.resubmit)).status).toBe(200);
    const first = await prisma.advisorApplication.findUniqueOrThrow({ where: { userId: ids.resubmit } });
    const reject = await request(app)
      .put(`${API}/advisors/admin/${ids.resubmit}/reject`)
      .set('Authorization', `Bearer ${token(ids.manager, 'manager')}`)
      .send({ reason: 'Aadhaar scan is illegible' });
    expect(reject.status).toBe(200);

    const second = await apply(ids.resubmit);
    expect(second.status).toBe(200);
    const row = await prisma.advisorApplication.findUniqueOrThrow({ where: { userId: ids.resubmit } });
    expect(row.status).toBe('PENDING');
    expect(row.rejectionReason).toBeNull();
    expect(row.panDocumentPath).not.toBe(first.panDocumentPath);
    expect(objects.has(first.panDocumentPath!)).toBe(false);
    expect(objects.has(first.aadhaarDocumentPath!)).toBe(false);
    expect(objects.has(row.panDocumentPath!)).toBe(true);

    // Each submission is announced to the reviewer once.
    expect(await prisma.notification.count({
      where: { userId: ids.manager, type: 'advisor_application_submitted', metadata: { path: ['applicantId'], equals: ids.resubmit } },
    })).toBe(2);
  });
});
