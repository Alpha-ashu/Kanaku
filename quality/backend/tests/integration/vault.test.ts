import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';

const createTestToken = (userId: string, email: string) => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }
  return jwt.sign(
    { userId, email, role: 'user', isApproved: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
};

describe('KANAKKU VAULT SECURITY & ARCHITECTURE', () => {
  const userAId = 'a0000000-0000-4000-8000-000000000001';
  const userAEmail = 'vault-user-a@test.com';
  const tokenA = createTestToken(userAId, userAEmail);

  const userBId = 'b0000000-0000-4000-8000-000000000002';
  const userBEmail = 'vault-user-b@test.com';
  const tokenB = createTestToken(userBId, userBEmail);

  beforeAll(async () => {
    // Ensure clean state before running
    await prisma.vaultAuditLog.deleteMany({
      where: { ownerId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.vaultShare.deleteMany({
      where: { ownerId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.vaultDocumentVersion.deleteMany({
      where: { document: { userId: { in: [userAId, userBId] } } },
    }).catch(() => {});
    await prisma.vaultDocument.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.vaultFolder.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.vaultLockSetting.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { in: [userAId, userBId, 'vault-test-user-a', 'vault-test-user-b'] } },
          { email: { in: [userAEmail, userBEmail] } },
        ],
      },
    }).catch(() => {});

    await prisma.user.create({
      data: {
        id: userAId,
        email: userAEmail,
        name: 'User A',
        password: 'hash-password-a',
        role: 'user',
        isApproved: true,
        status: 'verified',
      },
    });

    await prisma.user.create({
      data: {
        id: userBId,
        email: userBEmail,
        name: 'User B',
        password: 'hash-password-b',
        role: 'user',
        isApproved: true,
        status: 'verified',
      },
    });
  });

  afterAll(async () => {
    // Clean up created vault items
    await prisma.vaultAuditLog.deleteMany({
      where: { ownerId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.vaultShare.deleteMany({
      where: { ownerId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.vaultDocumentVersion.deleteMany({
      where: { document: { userId: { in: [userAId, userBId] } } },
    }).catch(() => {});
    await prisma.vaultDocument.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.vaultFolder.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.vaultLockSetting.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    }).catch(() => {});
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get(`${API}/vault/folders`);
    expect(res.status).toBe(401);
  });

  it('initializes 7 default folders upon first access for user', async () => {
    const res = await request(app)
      .get(`${API}/vault/folders`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(7);

    const folderNames = res.body.map((f: any) => f.name);
    expect(folderNames).toContain('Personal Documents');
    expect(folderNames).toContain('Property Documents');
    expect(folderNames).toContain('Insurance');
    expect(folderNames).toContain('Financial Documents');
    expect(folderNames).toContain('Legal Documents');
    expect(folderNames).toContain('Medical Documents');
    expect(folderNames).toContain('Other');
  });

  it('allows user to create custom root folders and subfolders', async () => {
    // 1. Create root custom folder
    const folderRes = await request(app)
      .post(`${API}/vault/folders`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'My Family', category: 'Other' });

    expect(folderRes.status).toBe(201);
    expect(folderRes.body.name).toBe('My Family');
    const parentId = folderRes.body.id;

    // 2. Create subfolder
    const subRes = await request(app)
      .post(`${API}/vault/folders`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Father', parentId });

    expect(subRes.status).toBe(201);
    expect(subRes.body.parentId).toBe(parentId);
    expect(subRes.body.name).toBe('Father');
  });

  let uploadedDocId: string;

  it('uploads and encrypts a document in user vault', async () => {
    const dummyPdf = Buffer.from('%PDF-1.4 dummy confidential content for testing');

    const res = await request(app)
      .post(`${API}/vault/documents`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('title', 'Aadhaar Card Test')
      .field('category', 'Personal Documents')
      .field('isSensitive', 'true')
      .field('institution', 'UIDAI')
      .attach('file', dummyPdf, {
        filename: 'aadhaar.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Aadhaar Card Test');
    expect(res.body.isEncrypted).toBe(true);
    expect(res.body.isSensitive).toBe(true);

    uploadedDocId = res.body.id;
  });

  it('strictly isolates documents: User B cannot access User A unshared document (403)', async () => {
    // Attempt preview by unauthorized User B
    const res = await request(app)
      .get(`${API}/vault/documents/${uploadedDocId}/preview`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
  });

  let shareId: string;

  it('allows Owner to explicitly share document with User B as Viewer', async () => {
    const res = await request(app)
      .post(`${API}/vault/shares`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sharedWithUserEmailOrId: userBEmail,
        documentId: uploadedDocId,
        permission: 'viewer',
        canDownload: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.permission).toBe('viewer');
    expect(res.body.status).toBe('active');
    shareId = res.body.id;
  });

  it('allows authorized User B to view and preview shared document', async () => {
    const res = await request(app)
      .get(`${API}/vault/documents/${uploadedDocId}/preview`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('application/pdf');
  });

  it('strictly forbids Viewer from editing document metadata (403)', async () => {
    const res = await request(app)
      .patch(`${API}/vault/documents/${uploadedDocId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'Tampered Title' });

    expect(res.status).toBe(403);
  });

  it('instantly cuts off access when Owner revokes share', async () => {
    // Owner revokes share
    const revokeRes = await request(app)
      .delete(`${API}/vault/shares/${shareId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(revokeRes.status).toBe(200);

    // User B attempts to access again immediately
    const res = await request(app)
      .get(`${API}/vault/documents/${uploadedDocId}/preview`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
  });

  it('records immutable audit logs for all security actions', async () => {
    const res = await request(app)
      .get(`${API}/vault/audit-logs`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const actions = res.body.map((l: any) => l.action);
    expect(actions).toContain('UPLOAD');
    expect(actions).toContain('SHARE_GRANT');
    expect(actions).toContain('SHARE_REVOKE');
  });
});
