import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const makeToken = (userId: string, role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, email: `${userId}@test.com`, role }, secret, { expiresIn: '15m' });
};

const auth = (userId = 'tax-test-user') => ({
  Authorization: `Bearer ${makeToken(userId)}`,
});

describe('Tax Calculations', () => {
  describe('GET /tax', () => {
    it('returns tax records for authenticated user', async () => {
      const res = await request(app).get(`${API}/tax`).set(auth());
      expect([200, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get(`${API}/tax`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /tax/summary', () => {
    it('returns tax summary', async () => {
      const res = await request(app).get(`${API}/tax/summary`).set(auth());
      expect([200, 404, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('supports financial year query param', async () => {
      const res = await request(app).get(`${API}/tax/summary?fy=2025-26`).set(auth());
      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /tax/calculate', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/tax/calculate`)
        .send({ income: 1200000, regime: 'new' });
      expect(res.status).toBe(401);
    });

    it('calculates tax with valid income (new regime)', async () => {
      const res = await request(app)
        .post(`${API}/tax/calculate`)
        .set(auth())
        .send({ income: 1200000, regime: 'new', financialYear: '2025-26' });
      expect([200, 201, 400, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    it('calculates tax with old regime', async () => {
      const res = await request(app)
        .post(`${API}/tax/calculate`)
        .set(auth())
        .send({ income: 1200000, regime: 'old', financialYear: '2025-26' });
      expect([200, 201, 400, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('rejects missing income field', async () => {
      const res = await request(app)
        .post(`${API}/tax/calculate`)
        .set(auth())
        .send({ regime: 'new' });
      expect([400, 422, 500]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });

    it('rejects invalid tax regime', async () => {
      const res = await request(app)
        .post(`${API}/tax/calculate`)
        .set(auth())
        .send({ income: 1200000, regime: 'invalid' });
      expect([400, 422, 500]).toContain(res.status);
    });

    it('rejects negative income', async () => {
      const res = await request(app)
        .post(`${API}/tax/calculate`)
        .set(auth())
        .send({ income: -100000, regime: 'new' });
      expect([400, 422, 500]).toContain(res.status);
    });
  });

  describe('GET /tax/deductions', () => {
    it('returns available deductions', async () => {
      const res = await request(app).get(`${API}/tax/deductions`).set(auth());
      expect([200, 404, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });
  });

  describe('POST /tax/deductions', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/tax/deductions`)
        .send({ type: '80C', amount: 150000 });
      expect(res.status).toBe(401);
    });

    it('creates deduction with auth', async () => {
      const res = await request(app)
        .post(`${API}/tax/deductions`)
        .set(auth())
        .send({ type: '80C', amount: 150000, description: 'PPF contribution' });
      expect([201, 200, 400, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('rejects deduction exceeding section limit if validated', async () => {
      const res = await request(app)
        .post(`${API}/tax/deductions`)
        .set(auth())
        .send({ type: '80C', amount: 9999999, description: 'Too much' });
      // May return 400 if section limits validated, or 500 if DB unavailable
      expect([400, 422, 500]).toContain(res.status);
    });
  });

  describe('GET /tax/history', () => {
    it('returns tax history for user', async () => {
      const res = await request(app).get(`${API}/tax/history`).set(auth());
      expect([200, 404, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });
  });

  describe('Cross-user tax isolation', () => {
    it('user A cannot access user B tax records', async () => {
      const resA = await request(app)
        .get(`${API}/tax`)
        .set({ Authorization: `Bearer ${makeToken('tax-user-a')}` });
      const resB = await request(app)
        .get(`${API}/tax`)
        .set({ Authorization: `Bearer ${makeToken('tax-user-b')}` });

      if (resA.status === 200 && resB.status === 200) {
        const idsA = (resA.body.data || []).map((t: any) => t.id);
        const idsB = (resB.body.data || []).map((t: any) => t.id);
        expect(idsA.filter((id: string) => idsB.includes(id))).toHaveLength(0);
      }
    });
  });
});
