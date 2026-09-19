/**
 * Regression tests for the Vault gaps found in the 2026-09-20 full-stack review:
 * share-role escalation via folder moves, unchecked version uploads, the
 * version-decryption (AAD) mismatch, folder cycles, the UI-only Vault lock, the
 * unverified "forgot Vault PIN" reset, and share-recipient leakage.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';

const tokenFor = (userId: string, email: string) => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  return jwt.sign({ userId, email, role: 'user', isApproved: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const OWNER = { id: 'c0000000-0000-4000-8000-000000000001', email: 'vault-hardening-owner@test.com' };
const EDITOR = { id: 'c0000000-0000-4000-8000-000000000002', email: 'vault-hardening-editor@test.com' };
const VIEWER = { id: 'c0000000-0000-4000-8000-000000000003', email: 'vault-hardening-viewer@test.com' };
const USERS = [OWNER, EDITOR, VIEWER];
const ids = USERS.map((u) => u.id);

const ownerToken = tokenFor(OWNER.id, OWNER.email);
const editorToken = tokenFor(EDITOR.id, EDITOR.email);
const viewerToken = tokenFor(VIEWER.id, VIEWER.email);

const cleanup = async () => {
  await prisma.vaultAuditLog.deleteMany({ where: { OR: [{ ownerId: { in: ids } }, { actorId: { in: ids } }] } }).catch(() => {});
  await prisma.vaultShare.deleteMany({ where: { ownerId: { in: ids } } }).catch(() => {});
  await prisma.vaultDocumentVersion.deleteMany({ where: { document: { userId: { in: ids } } } }).catch(() => {});
  await prisma.vaultDocument.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.vaultFolder.updateMany({ where: { userId: { in: ids } }, data: { parentId: null } }).catch(() => {});
  await prisma.vaultFolder.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.vaultLockSetting.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.otpRequest.deleteMany({ where: { destination: { in: USERS.map((u) => u.email) } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
};

const uploadPdf = (token: string, title: string) =>
  request(app)
    .post(`${API}/vault/documents`)
    .set('Authorization', `Bearer ${token}`)
    .field('title', title)
    .field('category', 'Personal Documents')
    .attach('file', Buffer.from(`%PDF-1.4 ${title}`), { filename: `${title}.pdf`, contentType: 'application/pdf' });

describe('Vault hardening (2026-09-20 review)', () => {
  let docId: string;

  beforeAll(async () => {
    await cleanup();
    for (const u of USERS) {
      await prisma.user.create({
        data: { id: u.id, email: u.email, name: u.email.split('@')[0], password: 'x', role: 'user', isApproved: true, status: 'verified' },
      });
    }
    const up = await uploadPdf(ownerToken, 'Passport');
    expect(up.status).toBe(201);
    docId = up.body.id;

    const share = await request(app)
      .post(`${API}/vault/shares`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ sharedWithUserEmailOrId: EDITOR.email, documentId: docId, permission: 'editor', canDownload: false });
    expect(share.status).toBe(201);
    const viewerShare = await request(app)
      .post(`${API}/vault/shares`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ sharedWithUserEmailOrId: VIEWER.email, documentId: docId, permission: 'viewer', canDownload: true });
    expect(viewerShare.status).toBe(201);
  });

  afterAll(cleanup);

  it('an editor cannot move the owner\'s document into their own folder to become its owner', async () => {
    const folder = await request(app)
      .post(`${API}/vault/folders`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Mine' });
    expect(folder.status).toBe(201);

    const move = await request(app)
      .patch(`${API}/vault/documents/${docId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ folderId: folder.body.id });
    expect(move.status).toBe(403);

    // Even if the row were moved out-of-band, owning the folder grants nothing.
    await prisma.vaultDocument.update({ where: { id: docId }, data: { folderId: folder.body.id } });
    const del = await request(app).delete(`${API}/vault/documents/${docId}`).set('Authorization', `Bearer ${editorToken}`);
    expect(del.status).toBe(403);
    const download = await request(app).get(`${API}/vault/documents/${docId}/download`).set('Authorization', `Bearer ${editorToken}`);
    expect(download.status).toBe(403);
    await prisma.vaultDocument.update({ where: { id: docId }, data: { folderId: null } });
  });

  it('rejects a new version with a disallowed content type', async () => {
    const res = await request(app)
      .post(`${API}/vault/documents/${docId}/version`)
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.html', contentType: 'text/html' });
    expect(res.status).toBe(400);
  });

  it('keeps a document readable after a new version is uploaded', async () => {
    const res = await request(app)
      .post(`${API}/vault/documents/${docId}/version`)
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', Buffer.from('%PDF-1.4 version two'), { filename: 'passport-v2.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.currentVersion).toBe(2);

    const preview = await request(app).get(`${API}/vault/documents/${docId}/preview`).set('Authorization', `Bearer ${ownerToken}`);
    expect(preview.status).toBe(200);
    expect(Buffer.from(preview.body).toString()).toContain('version two');
    expect(preview.header['x-content-type-options']).toBe('nosniff');
    expect(preview.header['content-security-policy']).toContain('sandbox');
  });

  it('does not show other share recipients to a non-owner', async () => {
    const res = await request(app).get(`${API}/vault/documents/${docId}`).set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.shares).toEqual([]);

    const owner = await request(app).get(`${API}/vault/documents/${docId}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(owner.body.shares.length).toBe(2);
  });

  it('lets a folder-share recipient list and open the folder, and nobody else', async () => {
    const folder = await request(app).post(`${API}/vault/folders`).set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Family' });
    const inFolder = await request(app)
      .post(`${API}/vault/documents`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('title', 'Birth Certificate')
      .field('folderId', folder.body.id)
      .attach('file', Buffer.from('%PDF-1.4 birth'), { filename: 'birth.pdf', contentType: 'application/pdf' });
    expect(inFolder.status).toBe(201);
    const share = await request(app)
      .post(`${API}/vault/shares`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ sharedWithUserEmailOrId: VIEWER.email, folderId: folder.body.id, permission: 'viewer', canDownload: false });
    expect(share.status).toBe(201);

    const listed = await request(app)
      .get(`${API}/vault/shared-with-me/folders/${folder.body.id}/documents`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.canDownload).toBe(false);
    expect(listed.body.documents.map((d: any) => d.id)).toEqual([inFolder.body.id]);

    const preview = await request(app)
      .get(`${API}/vault/documents/${inFolder.body.id}/preview`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(preview.status).toBe(200);

    const stranger = await request(app)
      .get(`${API}/vault/shared-with-me/folders/${folder.body.id}/documents`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(stranger.status).toBe(403);
  });

  it('refuses to move a folder inside its own subtree', async () => {
    const parent = await request(app).post(`${API}/vault/folders`).set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Parent' });
    const child = await request(app)
      .post(`${API}/vault/folders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Child', parentId: parent.body.id });
    const res = await request(app)
      .patch(`${API}/vault/folders/${parent.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: child.body.id });
    expect(res.status).toBe(400);
  });

  it('keeps subfolders reachable when their parent folder is deleted', async () => {
    const parent = await request(app).post(`${API}/vault/folders`).set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Doomed' });
    const child = await request(app)
      .post(`${API}/vault/folders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Survivor', parentId: parent.body.id });
    const del = await request(app).delete(`${API}/vault/folders/${parent.body.id}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(del.status).toBe(200);
    const moved = await prisma.vaultFolder.findUnique({ where: { id: child.body.id } });
    expect(moved?.parentId).toBeNull();
    expect(moved?.deletedAt).toBeNull();
  });

  describe('Vault lock is enforced by the server', () => {
    let unlockToken: string;

    it('enabling a PIN returns an unlock token for the current session', async () => {
      const res = await request(app)
        .post(`${API}/vault/lock/configure`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ isLockEnabled: true, vaultPin: '482915' });
      expect(res.status).toBe(200);
      expect(res.body.isLockEnabled).toBe(true);
      expect(typeof res.body.unlockToken).toBe('string');
    });

    it('blocks vault data without an unlock token', async () => {
      const res = await request(app).get(`${API}/vault/documents`).set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('VAULT_LOCKED');
    });

    it('rejects a wrong PIN and issues a token for the right one', async () => {
      const wrong = await request(app).post(`${API}/vault/lock/verify`).set('Authorization', `Bearer ${ownerToken}`).send({ vaultPin: '000000' });
      expect(wrong.body.verified).toBe(false);
      expect(wrong.body.unlockToken).toBeUndefined();

      const right = await request(app).post(`${API}/vault/lock/verify`).set('Authorization', `Bearer ${ownerToken}`).send({ vaultPin: '482915' });
      expect(right.body.verified).toBe(true);
      unlockToken = right.body.unlockToken;
      expect(typeof unlockToken).toBe('string');
    });

    it('serves vault data with the token and slides it forward', async () => {
      const res = await request(app)
        .get(`${API}/vault/documents`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Vault-Unlock', unlockToken);
      expect(res.status).toBe(200);
      expect(res.header['x-vault-unlock']).toBeDefined();
    });

    it("does not accept another user's unlock token", async () => {
      await request(app)
        .post(`${API}/vault/lock/configure`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ isLockEnabled: true, vaultPin: '1234' });
      const res = await request(app)
        .get(`${API}/vault/documents`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .set('X-Vault-Unlock', unlockToken);
      expect(res.status).toBe(403);
    });

    it('will not disable the lock without an unlocked session or the current PIN', async () => {
      const locked = await request(app)
        .post(`${API}/vault/lock/configure`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ isLockEnabled: false });
      expect(locked.status).toBe(403);

      const withToken = await request(app)
        .post(`${API}/vault/lock/configure`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Vault-Unlock', unlockToken)
        .send({ isLockEnabled: true, autoLockMinutes: 10 });
      expect(withToken.status).toBe(200);
    });

    it('will not reset the Vault PIN without a verified email OTP', async () => {
      const res = await request(app).post(`${API}/vault/lock/reset`).set('Authorization', `Bearer ${ownerToken}`).send({});
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SECURITY_PROOF_REQUIRED');

      const still = await prisma.vaultLockSetting.findUnique({ where: { userId: OWNER.id } });
      expect(still?.isLockEnabled).toBe(true);
      expect(still?.vaultPinHash).toBeTruthy();
    });

    it('resets the Vault PIN once the account email has a verified sensitive_action OTP', async () => {
      await prisma.otpRequest.create({
        data: {
          destination: OWNER.email,
          purpose: 'sensitive_action',
          channel: 'email',
          otpHash: 'test',
          status: 'VERIFIED',
          verifiedAt: new Date(),
          expiryTime: new Date(Date.now() + 5 * 60_000),
        },
      });
      const res = await request(app).post(`${API}/vault/lock/reset`).set('Authorization', `Bearer ${ownerToken}`).send({});
      expect(res.status).toBe(200);
      expect(res.body.isLockEnabled).toBe(false);
    });
  });

  it('revokes shares when the owner deletes the document', async () => {
    const del = await request(app).delete(`${API}/vault/documents/${docId}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(del.status).toBe(200);
    const active = await prisma.vaultShare.count({ where: { documentId: docId, status: 'active' } });
    expect(active).toBe(0);
  });
});
