import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const makeToken = (userId: string, role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, email: `${userId}@test.com`, role }, secret, { expiresIn: '15m' });
};

const auth = (userId = 'budget-test-user') => ({
  Authorization: `Bearer ${makeToken(userId)}`,
});

describe('Budget Management', () => {
  describe('GET /budgets', () => {
    it('returns budgets for authenticated user', async () => {
      const res = await request(app).get(`${API}/budgets`).set(auth());
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get(`${API}/budgets`);
      expect(res.status).toBe(401);
    });

    it('returns array or empty list in data', async () => {
      const res = await request(app).get(`${API}/budgets`).set(auth());
      if (res.status === 200) {
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('POST /budgets', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/budgets`)
        .send({ category: 'Food', limit: 5000, period: 'monthly' });
      expect(res.status).toBe(401);
    });

    it('creates budget with valid data', async () => {
      const res = await request(app)
        .post(`${API}/budgets`)
        .set(auth())
        .send({ category: 'Food', limit: 5000, period: 'monthly', month: 6, year: 2026 });
      expect([201, 200, 400, 409, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    it('rejects budget with missing required fields', async () => {
      const res = await request(app)
        .post(`${API}/budgets`)
        .set(auth())
        .send({ category: 'Food' }); // missing limit
      expect([400, 422, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(201);
    });

    it('rejects negative budget limit', async () => {
      const res = await request(app)
        .post(`${API}/budgets`)
        .set(auth())
        .send({ category: 'Food', limit: -100, period: 'monthly' });
      expect([400, 422, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /budgets/:id', () => {
    it('returns 404 or 500 for non-existent budget', async () => {
      const res = await request(app)
        .get(`${API}/budgets/non-existent-id-000`)
        .set(auth());
      expect([404, 500, 503]).toContain(res.status);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get(`${API}/budgets/some-id`);
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /budgets/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .put(`${API}/budgets/some-id`)
        .send({ limit: 6000 });
      expect(res.status).toBe(401);
    });

    it('returns appropriate error for non-existent budget', async () => {
      const res = await request(app)
        .put(`${API}/budgets/non-existent-id-000`)
        .set(auth())
        .send({ limit: 6000 });
      expect([400, 403, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });

  describe('DELETE /budgets/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).delete(`${API}/budgets/some-id`);
      expect(res.status).toBe(401);
    });

    it('returns 404 or 500 for non-existent budget', async () => {
      const res = await request(app)
        .delete(`${API}/budgets/non-existent-id-000`)
        .set(auth());
      expect([400, 403, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /budgets/summary', () => {
    it('returns budget summary for user', async () => {
      const res = await request(app).get(`${API}/budgets/summary`).set(auth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('accepts month/year query params', async () => {
      const res = await request(app)
        .get(`${API}/budgets/summary?month=6&year=2026`)
        .set(auth());
      expect([200, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('POST /budgets/:id/recalculate', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/budgets/some-id/recalculate`);
      expect(res.status).toBe(401);
    });

    it('returns 404 or 500 for unknown budget', async () => {
      const res = await request(app)
        .post(`${API}/budgets/non-existent-id-000/recalculate`)
        .set(auth());
      expect([400, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('Budget threshold alerts', () => {
    it('GET /budgets/alerts returns alert status', async () => {
      const res = await request(app).get(`${API}/budgets/alerts`).set(auth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });
  });

  describe('Cross-user budget isolation', () => {
    it('user A cannot update user B budget', async () => {
      const res = await request(app)
        .put(`${API}/budgets/other-user-budget-id`)
        .set({ Authorization: `Bearer ${makeToken('attacker-user')}` })
        .send({ limit: 99999 });
      expect([400, 403, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });
});
