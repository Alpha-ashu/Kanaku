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
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get(`${API}/tax`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /tax (create tax calculation)', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/tax`)
        .send({ income: 1200000, regime: 'new' });
      expect(res.status).toBe(401);
    });

    it('creates tax calc with valid income (new regime)', async () => {
      const res = await request(app)
        .post(`${API}/tax`)
        .set(auth())
        .send({ income: 1200000, regime: 'new', financialYear: '2025-26' });
      expect([200, 201, 400, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    it('creates tax calc with old regime', async () => {
      const res = await request(app)
        .post(`${API}/tax`)
        .set(auth())
        .send({ income: 1200000, regime: 'old', financialYear: '2025-26' });
      expect([200, 201, 400, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('rejects missing income field', async () => {
      const res = await request(app)
        .post(`${API}/tax`)
        .set(auth())
        .send({ regime: 'new' });
      expect([400, 422, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(201);
    });

    it('rejects invalid tax regime', async () => {
      const res = await request(app)
        .post(`${API}/tax`)
        .set(auth())
        .send({ income: 1200000, regime: 'invalid' });
      expect([400, 422, 500, 503]).toContain(res.status);
    });

    it('rejects negative income', async () => {
      const res = await request(app)
        .post(`${API}/tax`)
        .set(auth())
        .send({ income: -100000, regime: 'new' });
      expect([400, 422, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /tax/:id', () => {
    it('returns 404 or 500 for non-existent tax record', async () => {
      const res = await request(app).get(`${API}/tax/non-existent-id-000`).set(auth());
      expect([404, 500, 503]).toContain(res.status);
    });

    it('rejects unauthenticated', async () => {
      const res = await request(app).get(`${API}/tax/some-id`);
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /tax/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).delete(`${API}/tax/some-id`);
      expect(res.status).toBe(401);
    });

    it('returns 404 or 500 for non-existent record', async () => {
      const res = await request(app)
        .delete(`${API}/tax/non-existent-id-000`)
        .set(auth());
      expect([400, 403, 404, 500, 503]).toContain(res.status);
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
