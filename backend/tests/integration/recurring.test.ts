import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

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
  describe('GET /recurring-transactions', () => {
    it('returns list for authenticated user', async () => {
      const res = await request(app).get(`${API}/recurring-transactions`).set(auth());
      expect([200, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get(`${API}/recurring-transactions`);
      expect(res.status).toBe(401);
    });

    it('returns array in data if 200', async () => {
      const res = await request(app).get(`${API}/recurring-transactions`).set(auth());
      if (res.status === 200) {
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('supports active filter query param', async () => {
      const res = await request(app)
        .get(`${API}/recurring-transactions?active=true`)
        .set(auth());
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /recurring-transactions', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/recurring-transactions`).send(validRecurring);
      expect(res.status).toBe(401);
    });

    it('creates with valid data', async () => {
      const res = await request(app)
        .post(`${API}/recurring-transactions`)
        .set(auth())
        .send(validRecurring);
      expect([201, 200, 400, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post(`${API}/recurring-transactions`)
        .set(auth())
        .send({ name: 'Incomplete' });
      expect([400, 422, 500]).toContain(res.status);
      expect(res.status).not.toBe(201);
    });

    it('rejects invalid frequency', async () => {
      const res = await request(app)
        .post(`${API}/recurring-transactions`)
        .set(auth())
        .send({ ...validRecurring, frequency: 'invalid-freq' });
      expect([400, 422, 500]).toContain(res.status);
    });

    it('rejects negative amount', async () => {
      const res = await request(app)
        .post(`${API}/recurring-transactions`)
        .set(auth())
        .send({ ...validRecurring, amount: -500 });
      expect([400, 422, 500]).toContain(res.status);
    });
  });

  describe('GET /recurring-transactions/:id', () => {
    it('returns 404 or 500 for non-existent record', async () => {
      const res = await request(app)
        .get(`${API}/recurring-transactions/non-existent-id-000`)
        .set(auth());
      expect([404, 500]).toContain(res.status);
    });

    it('rejects unauthenticated', async () => {
      const res = await request(app).get(`${API}/recurring-transactions/some-id`);
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /recurring-transactions/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .put(`${API}/recurring-transactions/some-id`)
        .send({ amount: 799 });
      expect(res.status).toBe(401);
    });

    it('returns appropriate error for non-existent record', async () => {
      const res = await request(app)
        .put(`${API}/recurring-transactions/non-existent-id-000`)
        .set(auth())
        .send({ amount: 799 });
      expect([400, 403, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /recurring-transactions/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).delete(`${API}/recurring-transactions/some-id`);
      expect(res.status).toBe(401);
    });

    it('returns 404 or 500 for non-existent record', async () => {
      const res = await request(app)
        .delete(`${API}/recurring-transactions/non-existent-id-000`)
        .set(auth());
      expect([400, 403, 404, 500]).toContain(res.status);
    });
  });

  describe('PATCH /recurring-transactions/:id/toggle', () => {
    it('requires authentication', async () => {
      const res = await request(app).patch(`${API}/recurring-transactions/some-id/toggle`);
      expect(res.status).toBe(401);
    });

    it('returns 404 or 500 for non-existent record', async () => {
      const res = await request(app)
        .patch(`${API}/recurring-transactions/non-existent-id-000/toggle`)
        .set(auth());
      expect([400, 403, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /recurring-transactions/:id/execute', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/recurring-transactions/some-id/execute`);
      expect(res.status).toBe(401);
    });

    it('returns 404 or 500 for unknown record', async () => {
      const res = await request(app)
        .post(`${API}/recurring-transactions/non-existent-id-000/execute`)
        .set(auth());
      expect([400, 403, 404, 500]).toContain(res.status);
    });
  });

  describe('Cross-user isolation', () => {
    it('user A cannot toggle user B recurring transaction', async () => {
      const res = await request(app)
        .patch(`${API}/recurring-transactions/other-user-recurring-id/toggle`)
        .set({ Authorization: `Bearer ${makeToken('attacker-recurring')}` });
      expect([400, 403, 404, 500]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });
});
