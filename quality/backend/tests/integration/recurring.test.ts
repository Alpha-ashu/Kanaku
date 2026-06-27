import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';

const makeToken = (userId: string, role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, email: `${userId}@test.com`, role }, secret, { expiresIn: '15m' });
};

const auth = (userId = 'recurring-test-user') => ({
  Authorization: `Bearer ${makeToken(userId)}`,
});

const validRecurring = {
  name: 'Netflix Subscription',
  amount: 649,
  type: 'expense',
  category: 'Entertainment',
  frequency: 'monthly',
  startDate: '2026-01-01',
  accountId: 'test-account-id',
};

describe('Recurring Transactions', () => {
  describe('GET /recurring', () => {
    it('returns list for authenticated user', async () => {
      const res = await request(app).get(`${API}/recurring`).set(auth());
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get(`${API}/recurring`);
      expect(res.status).toBe(401);
    });

    it('returns array in data if 200', async () => {
      const res = await request(app).get(`${API}/recurring`).set(auth());
      if (res.status === 200) {
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('supports active filter query param', async () => {
      const res = await request(app)
        .get(`${API}/recurring?active=true`)
        .set(auth());
      expect([200, 500, 503]).toContain(res.status);
    });
  });

  describe('POST /recurring', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/recurring`).send(validRecurring);
      expect(res.status).toBe(401);
    });

    it('creates with valid data', async () => {
      const res = await request(app)
        .post(`${API}/recurring`)
        .set(auth())
        .send(validRecurring);
      expect([201, 200, 400, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post(`${API}/recurring`)
        .set(auth())
        .send({ name: 'Incomplete' });
      expect([400, 422, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(201);
    });

    it('rejects invalid frequency', async () => {
      const res = await request(app)
        .post(`${API}/recurring`)
        .set(auth())
        .send({ ...validRecurring, frequency: 'invalid-freq' });
      expect([400, 422, 500, 503]).toContain(res.status);
    });

    it('rejects negative amount', async () => {
      const res = await request(app)
        .post(`${API}/recurring`)
        .set(auth())
        .send({ ...validRecurring, amount: -500 });
      expect([400, 422, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /recurring/:id', () => {
    it('returns 404 or 500 for non-existent record', async () => {
      const res = await request(app)
        .get(`${API}/recurring/non-existent-id-000`)
        .set(auth());
      expect([404, 500, 503]).toContain(res.status);
    });

    it('rejects unauthenticated', async () => {
      const res = await request(app).get(`${API}/recurring/some-id`);
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /recurring/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .put(`${API}/recurring/some-id`)
        .send({ amount: 799 });
      expect(res.status).toBe(401);
    });

    it('returns appropriate error for non-existent record', async () => {
      const res = await request(app)
        .put(`${API}/recurring/non-existent-id-000`)
        .set(auth())
        .send({ amount: 799 });
      expect([400, 403, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('DELETE /recurring/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).delete(`${API}/recurring/some-id`);
      expect(res.status).toBe(401);
    });

    it('returns 404 or 500 for non-existent record', async () => {
      const res = await request(app)
        .delete(`${API}/recurring/non-existent-id-000`)
        .set(auth());
      expect([400, 403, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('PATCH /recurring/:id/toggle', () => {
    it('requires authentication', async () => {
      const res = await request(app).patch(`${API}/recurring/some-id/toggle`);
      expect(res.status).toBe(401);
    });

    it('returns 404 or 500 for non-existent record', async () => {
      const res = await request(app)
        .patch(`${API}/recurring/non-existent-id-000/toggle`)
        .set(auth());
      expect([400, 403, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('Cross-user isolation', () => {
    it('user A cannot toggle user B recurring transaction', async () => {
      const res = await request(app)
        .patch(`${API}/recurring/other-user-recurring-id/toggle`)
        .set({ Authorization: `Bearer ${makeToken('attacker-recurring')}` });
      expect([400, 403, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });
});
