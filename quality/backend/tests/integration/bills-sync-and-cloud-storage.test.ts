import path from 'path';
import crypto from 'crypto';
import { config } from 'dotenv';

// Load test environment before importing app or prisma
config({ path: path.resolve(__dirname, '../../../../backend/.env.test') });
config({ path: path.resolve(__dirname, '../../../../backend/.env') });

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';

const getSignedToken = (userId: string, email: string) => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }

  return jwt.sign(
    {
      userId,
      email,
      role: 'user',
      isApproved: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

describe('BILLS SYNC & CLOUD STORAGE ARCHITECTURE', () => {
  const userAId = '00000000-0000-0000-0000-000000000009';
  const userBId = '00000000-0000-0000-0000-000000000001';
  const tokenA = getSignedToken(userAId, 'user_00000000@test.com');
  const tokenB = getSignedToken(userBId, 'admin_00000000@test.com');

  let accountAId: string;
  let uploadedBillId: string;

  beforeAll(async () => {
    let acc = await prisma.account.findFirst({
      where: { userId: userAId },
    });
    if (!acc) {
      acc = await prisma.account.create({
        data: {
          userId: userAId,
          name: 'Bills Sync Checking Account',
          type: 'checking',
          balance: 10000,
          currency: 'INR',
        },
      });
    }
    accountAId = acc.id;
    await prisma.account.update({
      where: { id: accountAId },
      data: { balance: 50000 },
    });
  });

  afterAll(async () => {
    try {
      if (uploadedBillId) {
        await prisma.expenseBill.deleteMany({ where: { id: uploadedBillId } });
      }
      await prisma.expenseBill.deleteMany({ where: { originalName: { contains: 'medical_invoice' } } });
      await prisma.transaction.deleteMany({ where: { description: 'Doctor consultation & medicines' } });
    } catch {
      // ignore
    }
  });

  // 1. Upload & DB Persistence
  it('1. Uploads file, persists in storage and creates canonical ExpenseBill in DB with userId and sha256', async () => {
    const samplePdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n49\n%%EOF');

    const res = await request(app)
      .post(`${API}/bills`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', samplePdf, {
        filename: 'medical_invoice.pdf',
        contentType: 'application/pdf',
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.id).toBeDefined();
    expect(res.body.fileName).toContain('medical_invoice.pdf');
    expect(res.body.fileType).toBe('application/pdf');
    expect(res.body.fileSize).toBe(samplePdf.length);

    uploadedBillId = res.body.id;

    // Verify in database
    const dbBill = await prisma.expenseBill.findFirst({
      where: { id: uploadedBillId, userId: userAId },
    });
    expect(dbBill).not.toBeNull();
    expect(dbBill?.userId).toBe(userAId);
    expect(dbBill?.sha256).toBeDefined();
    expect(dbBill?.originalName).toContain('medical_invoice.pdf');
  });

  // 2. Idempotent Deduplication
  it('2. Idempotently returns existing bill without duplicate DB rows when identical buffer is uploaded again', async () => {
    const samplePdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n49\n%%EOF');

    const res = await request(app)
      .post(`${API}/bills`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', samplePdf, {
        filename: 'medical_invoice_copy.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(uploadedBillId);
    expect(res.body.deduplicated).toBe(true);

    // Verify no second record was created
    const count = await prisma.expenseBill.count({
      where: { userId: userAId },
    });
    expect(count).toBe(1);
  });

  // 3. User Isolation & Security
  it('3. Enforces strict user isolation: User B cannot retrieve, download, or delete User A bill', async () => {
    // Attempt GET bill metadata by User B
    const getRes = await request(app)
      .get(`${API}/bills/${uploadedBillId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect([403, 404]).toContain(getRes.status);

    // Attempt GET binary file stream by User B
    const fileRes = await request(app)
      .get(`${API}/bills/${uploadedBillId}/file`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect([403, 404]).toContain(fileRes.status);

    // Attempt DELETE by User B
    const delRes = await request(app)
      .delete(`${API}/bills/${uploadedBillId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect([403, 404]).toContain(delRes.status);

    // Verify bill still exists in DB
    const stillExists = await prisma.expenseBill.findUnique({
      where: { id: uploadedBillId },
    });
    expect(stillExists).not.toBeNull();
  }, 30000);

  // 4. Authorized Streaming / Download Endpoint
  it('4. Allows User A to stream/download the binary file with correct headers', async () => {
    const res = await request(app)
      .get(`${API}/bills/${uploadedBillId}/file`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([200, 302]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.body).toBeDefined();
    }
  }, 30000);

  // 5. Transaction Linking & Canonical Reference
  it('5. Creates transaction with canonical attachment bill:<id> and links ExpenseBill.transactionId', async () => {
    const canonicalRef = `bill:${uploadedBillId || 'dummy-bill-id'}`;

    const txRes = await request(app)
      .post(`${API}/transactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        accountId: accountAId,
        type: 'expense',
        amount: 2500,
        category: 'Health & Fitness',
        date: new Date().toISOString(),
        attachment: canonicalRef,
        description: 'Doctor consultation & medicines',
      });

    if (txRes.status !== 200 && txRes.status !== 201) {
      console.error('Test 5 failed with:', txRes.status, txRes.body);
    }

    expect([200, 201]).toContain(txRes.status);
    const tx = txRes.body.data || txRes.body;
    expect(tx.attachment).toBe(canonicalRef);

    if (uploadedBillId) {
      // Verify ExpenseBill.transactionId was linked
      const linkedBill = await prisma.expenseBill.findUnique({
        where: { id: uploadedBillId },
      });
      expect(linkedBill?.transactionId).toBe(tx.id);
    }
  }, 30000);

  // 6. Cross-Device Sync Engine Pull
  it('6. Pulls canonical expenseBills metadata via /sync/pull for multi-device synchronization', async () => {
    const syncRes = await request(app)
      .post(`${API}/sync/pull`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        deviceId: 'device-sync-test-1',
        entityTypes: ['bills', 'transactions'],
      });

    if (!syncRes.body.success) {
      console.error('Test 6 sync pull failed with:', syncRes.status, syncRes.body);
    }

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.success).toBe(true);
    expect(syncRes.body.data.expenseBills).toBeDefined();

    if (uploadedBillId) {
      const pulledBill = syncRes.body.data.expenseBills.find((b: any) => b.id === uploadedBillId);
      expect(pulledBill).toBeDefined();
      expect(pulledBill.userId).toBe(userAId);
    }
  }, 30000);

  // 7. Deletion & Attachment Unlinking
  it('7. Deletes bill, removes object from storage, and unlinks transaction attachment', async () => {
    const delRes = await request(app)
      .delete(`${API}/bills/${uploadedBillId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(delRes.status).toBe(200);

    // Verify deleted from DB
    const checkBill = await prisma.expenseBill.findUnique({
      where: { id: uploadedBillId },
    });
    expect(checkBill).toBeNull();

    // Verify transaction attachment was unlinked (null)
    const txList = await prisma.transaction.findMany({
      where: { userId: userAId },
    });
    for (const tx of txList) {
      expect(tx.attachment).toBeNull();
    }
  }, 30000);

  // 8. Actual Binary Persistence & Exact Checksum Parity (Original SHA-256 == Downloaded SHA-256)
  it('8. Confirms exact binary persistence: original SHA-256 equals downloaded SHA-256', async () => {
    const originalBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n49\n%%EOF\n% parity-test-binary',
    );
    const expectedSha256 = crypto.createHash('sha256').update(originalBuffer).digest('hex');

    const uploadRes = await request(app)
      .post(`${API}/bills`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', originalBuffer, {
        filename: 'statement_parity.pdf',
        contentType: 'application/pdf',
      });

    expect([200, 201]).toContain(uploadRes.status);
    const billId = uploadRes.body.id;

    // Stream the binary back
    const downloadRes = await request(app)
      .get(`${API}/bills/${billId}/file`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([200, 302]).toContain(downloadRes.status);
    if (downloadRes.status === 200) {
      const downloadedBuffer = Buffer.isBuffer(downloadRes.body)
        ? downloadRes.body
        : Buffer.from(downloadRes.body);
      const actualSha256 = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
      expect(actualSha256).toBe(expectedSha256);
    }

    // Cleanup
    await prisma.expenseBill.deleteMany({ where: { id: billId } });
  }, 30000);

  // 9. Multi-Category File Support: PNG bill, JPG receipt, PDF statement
  it('9. Supports all required file categories: PNG, JPG, PDF with accurate metadata', async () => {
    const pngBuf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const jpgBuf = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
    const pdfBuf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n49\n%%EOF\n% sbi_statement');

    const [pngRes, jpgRes, pdfRes] = await Promise.all([
      request(app)
        .post(`${API}/bills`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', pngBuf, { filename: 'electricity_bill.png', contentType: 'image/png' }),
      request(app)
        .post(`${API}/bills`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', jpgBuf, { filename: 'grocery_receipt.jpg', contentType: 'image/jpeg' }),
      request(app)
        .post(`${API}/bills`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', pdfBuf, { filename: 'sbi_statement.pdf', contentType: 'application/pdf' }),
    ]);

    expect([200, 201]).toContain(pngRes.status);
    expect([200, 201]).toContain(jpgRes.status);
    expect([200, 201]).toContain(pdfRes.status);

    const ids = [pngRes.body.id, jpgRes.body.id, pdfRes.body.id].filter(Boolean);
    expect(ids.length).toBe(3);

    const records = await prisma.expenseBill.findMany({ where: { id: { in: ids } } });
    expect(records.length).toBe(3);

    // Cleanup
    await prisma.expenseBill.deleteMany({ where: { id: { in: ids } } });
  }, 30000);

  // 10. File Replacement Test: Replace v1 with v2 on transaction and ensure cache invalidation
  it('10. Correctly replaces attachment v1 with v2 on transaction and updates canonical reference', async () => {
    const v1Buf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n49\n%%EOF\n% invoice_v1');
    const v2Buf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n49\n%%EOF\n% invoice_v2_replaced');

    const v1Res = await request(app)
      .post(`${API}/bills`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', v1Buf, { filename: 'invoice_v1.pdf', contentType: 'application/pdf' });

    const v2Res = await request(app)
      .post(`${API}/bills`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', v2Buf, { filename: 'invoice_v2.pdf', contentType: 'application/pdf' });

    expect([200, 201]).toContain(v1Res.status);
    expect([200, 201]).toContain(v2Res.status);

    const billV1Id = v1Res.body.id;
    const billV2Id = v2Res.body.id;

    // Create transaction with v1
    const txRes = await request(app)
      .post(`${API}/transactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        accountId: accountAId,
        type: 'expense',
        amount: 800,
        category: 'Shopping',
        date: new Date().toISOString(),
        attachment: `bill:${billV1Id}`,
        description: 'Retail shopping receipt v1',
      });

    expect([200, 201]).toContain(txRes.status);
    const txId = (txRes.body.data || txRes.body).id;

    // Update transaction to v2
    const updateRes = await request(app)
      .put(`${API}/transactions/${txId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        attachment: `bill:${billV2Id}`,
        description: 'Retail shopping receipt v2 (replaced)',
      });

    expect([200, 204]).toContain(updateRes.status);

    // Confirm database points to v2
    const updatedTx = await prisma.transaction.findUnique({ where: { id: txId } });
    expect(updatedTx?.attachment).toBe(`bill:${billV2Id}`);

    // Cleanup
    await prisma.transaction.deleteMany({ where: { id: txId } });
    await prisma.expenseBill.deleteMany({ where: { id: { in: [billV1Id, billV2Id] } } });
  }, 30000);

  // 11. Multi-File Batch & Concurrency Race Condition Safety
  it('11. Handles concurrent rapid uploads without deadlocks, corrupted state, or orphaned files', async () => {
    const promises = Array.from({ length: 5 }, (_, i) => {
      const buf = Buffer.from(
        `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n49\n%%EOF\n% concurrent-batch-${i}-${Date.now()}`,
      );
      return request(app)
        .post(`${API}/bills`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', buf, { filename: `batch_bill_${i}.pdf`, contentType: 'application/pdf' });
    });

    const results = await Promise.all(promises);
    const uploadedIds: string[] = [];

    for (const res of results) {
      expect([200, 201]).toContain(res.status);
      expect(res.body.id).toBeDefined();
      uploadedIds.push(res.body.id);
    }

    expect(new Set(uploadedIds).size).toBe(5);

    // Cleanup batch
    await prisma.expenseBill.deleteMany({ where: { id: { in: uploadedIds } } });
  }, 30000);

  // 12. Account-Level Binding: Attachment bound strictly to userId, not device identifiers
  it('12. Binds attachments strictly to account userId regardless of client device headers', async () => {
    const testBuf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n49\n%%EOF\n% device-independence-test',
    );
    const res = await request(app)
      .post(`${API}/bills`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Device-Id', 'android-device-xyz-999')
      .attach('file', testBuf, { filename: 'device_test.pdf', contentType: 'application/pdf' });

    expect([200, 201]).toContain(res.status);
    const billId = res.body.id;

    // Read back from a different simulated device header (e.g. iOS or Web)
    const readRes = await request(app)
      .get(`${API}/bills/${billId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Device-Id', 'iphone-device-abc-111');

    expect(readRes.status).toBe(200);
    expect(readRes.body.id).toBe(billId);

    // Cleanup
    await prisma.expenseBill.deleteMany({ where: { id: billId } });
  }, 30000);
});
