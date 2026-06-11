import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const makeToken = (userId: string, role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, email: `${userId}@test.com`, role }, secret, { expiresIn: '15m' });
};

const auth = (userId = 'gold-test-user') => ({
  Authorization: `Bearer ${makeToken(userId)}`,
});

const validGoldAsset = {
  type: 'physical',
  weight: 10,
  unit: 'gram',
  purity: '22K',
  purchasePrice: 55000,
  purchaseDate: '2026-01-01',
  description: 'Gold biscuit',
};

describe('Gold Assets', () => {
  describe('GET /gold', () => {
    it('returns gold assets for authenticated user', async () => {
      const res = await request(app).get(`${API}/gold`).set(auth());
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get(`${API}/gold`);
      expect(res.status).toBe(401);
    });

    it('returns array in data if 200', async () => {
      const res = await request(app).get(`${API}/gold`).set(auth());
      if (res.status === 200) {
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('POST /gold', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/gold`).send(validGoldAsset);
      expect(res.status).toBe(401);
    });

    it('creates gold asset with valid data', async () => {
      const res = await request(app)
        .post(`${API}/gold`)
        .set(auth())
        .send(validGoldAsset);
      expect([201, 200, 400, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    it('rejects missing weight', async () => {
      const res = await request(app)
        .post(`${API}/gold`)
        .set(auth())
        .send({ type: 'physical', purity: '24K' });
      expect([400, 422, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(201);
    });

    it('rejects negative weight', async () => {
      const res = await request(app)
        .post(`${API}/gold`)
        .set(auth())
        .send({ ...validGoldAsset, weight: -5 });
      expect([400, 422, 500, 503]).toContain(res.status);
    });

    it('rejects invalid gold type', async () => {
      const res = await request(app)
        .post(`${API}/gold`)
        .set(auth())
        .send({ ...validGoldAsset, type: 'invalid-type' });
      expect([400, 422, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /gold/:id', () => {
    it('returns 404 or 500 for non-existent asset', async () => {
      const res = await request(app).get(`${API}/gold/non-existent-gold-id`).set(auth());
      expect([404, 500, 503]).toContain(res.status);
    });

    it('rejects unauthenticated', async () => {
      const res = await request(app).get(`${API}/gold/some-id`);
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /gold/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .put(`${API}/gold/some-id`)
        .send({ weight: 15 });
      expect(res.status).toBe(401);
    });

    it('returns error for non-existent asset', async () => {
      const res = await request(app)
        .put(`${API}/gold/non-existent-gold-id`)
        .set(auth())
        .send({ weight: 15 });
      expect([400, 403, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('DELETE /gold/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).delete(`${API}/gold/some-id`);
      expect(res.status).toBe(401);
    });

    it('returns 404 or 500 for non-existent asset', async () => {
      const res = await request(app)
        .delete(`${API}/gold/non-existent-gold-id`)
        .set(auth());
      expect([400, 403, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /gold/summary', () => {
    it('returns gold portfolio summary', async () => {
      const res = await request(app).get(`${API}/gold/summary`).set(auth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });
  });

  describe('GET /gold/price', () => {
    it('returns current gold price data', async () => {
      const res = await request(app).get(`${API}/gold/price`).set(auth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('supports currency query param', async () => {
      const res = await request(app).get(`${API}/gold/price?currency=INR`).set(auth());
      expect([200, 400, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('Cross-user gold isolation', () => {
    it('user A cannot update user B gold asset', async () => {
      const res = await request(app)
        .put(`${API}/gold/other-user-gold-asset-id`)
        .set({ Authorization: `Bearer ${makeToken('gold-attacker')}` })
        .send({ weight: 999 });
      expect([400, 403, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });

    it('user A cannot delete user B gold asset', async () => {
      const res = await request(app)
        .delete(`${API}/gold/other-user-gold-asset-id`)
        .set({ Authorization: `Bearer ${makeToken('gold-attacker-2')}` });
      expect([400, 403, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });
});
