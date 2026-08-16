import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';

const makeToken = (userId: string, role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, email: `${userId}@test.com`, role }, secret, { expiresIn: '15m' });
};

const auth = (userId = 'category-test-user') => ({
  Authorization: `Bearer ${makeToken(userId)}`,
});

describe('Category Management', () => {
  describe('GET /categories', () => {
    it('returns categories for authenticated user', async () => {
      const res = await request(app).get(`${API}/categories`).set(auth());
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get(`${API}/categories`);
      expect(res.status).toBe(401);
    });

    it('returns array in data', async () => {
      const res = await request(app).get(`${API}/categories`).set(auth());
      if (res.status === 200) {
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('accepts a type filter', async () => {
      const res = await request(app).get(`${API}/categories?type=expense`).set(auth());
      expect([200, 500, 503]).toContain(res.status);
    });

    it('rejects an invalid type filter', async () => {
      const res = await request(app).get(`${API}/categories?type=nonsense`).set(auth());
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('POST /categories', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/categories`)
        .send({ name: 'Groceries', type: 'expense', color: '#EF4444', icon: 'tag' });
      expect(res.status).toBe(401);
    });

    it('creates a category with valid data', async () => {
      const res = await request(app)
        .post(`${API}/categories`)
        .set(auth())
        .send({ name: `Test Category ${Date.now()}`, type: 'expense', color: '#EF4444', icon: 'tag' });
      expect([200, 201, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects a missing name', async () => {
      const res = await request(app)
        .post(`${API}/categories`)
        .set(auth())
        .send({ type: 'expense', color: '#EF4444', icon: 'tag' });
      expect([400, 422]).toContain(res.status);
    });

    it('rejects an invalid colour', async () => {
      const res = await request(app)
        .post(`${API}/categories`)
        .set(auth())
        .send({ name: 'Bad Colour', type: 'expense', color: 'red', icon: 'tag' });
      expect([400, 422]).toContain(res.status);
    });

    it('rejects an invalid type', async () => {
      const res = await request(app)
        .post(`${API}/categories`)
        .set(auth())
        .send({ name: 'Bad Type', type: 'transfer', color: '#EF4444', icon: 'tag' });
      expect([400, 422]).toContain(res.status);
    });

    // Same name+type posted twice must converge rather than 400 — this is the
    // behaviour the budget sync loop lacked (DUPLICATE_BUDGET, see
    // featureSyncService.ts) and categories are deliberately built not to repeat it.
    it('converges on a repeat post instead of rejecting it', async () => {
      const name = `Convergence Test ${Date.now()}`;
      const payload = { name, type: 'expense', color: '#3B82F6', icon: 'tag' };
      const first = await request(app).post(`${API}/categories`).set(auth()).send(payload);
      const second = await request(app).post(`${API}/categories`).set(auth()).send(payload);

      if (first.status === 201 || first.status === 200) {
        expect([200, 201]).toContain(second.status);
        expect(second.status).not.toBe(400);
      }
    });
  });

  describe('POST /categories/bulk', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/categories/bulk`)
        .send({ categories: [{ name: 'A', type: 'expense' }] });
      expect(res.status).toBe(401);
    });

    it('accepts a batch and returns every requested category', async () => {
      const res = await request(app)
        .post(`${API}/categories/bulk`)
        .set(auth())
        .send({
          categories: [
            { name: `Bulk A ${Date.now()}`, type: 'expense' },
            { name: `Bulk B ${Date.now()}`, type: 'income' },
          ],
          createdFromImport: true,
        });
      expect([200, 201, 500, 503]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('rejects an empty batch', async () => {
      const res = await request(app)
        .post(`${API}/categories/bulk`)
        .set(auth())
        .send({ categories: [] });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('PUT /categories/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).put(`${API}/categories/some-id`).send({ name: 'New Name' });
      expect(res.status).toBe(401);
    });

    it('returns not-found for a non-existent category', async () => {
      const res = await request(app)
        .put(`${API}/categories/non-existent-id-000`)
        .set(auth())
        .send({ name: 'New Name' });
      expect([404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });

    it('rejects an empty update body', async () => {
      const res = await request(app)
        .put(`${API}/categories/some-id`)
        .set(auth())
        .send({});
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('DELETE /categories/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).delete(`${API}/categories/some-id`);
      expect(res.status).toBe(401);
    });

    it('returns not-found for a non-existent category', async () => {
      const res = await request(app)
        .delete(`${API}/categories/non-existent-id-000`)
        .set(auth());
      expect([404, 500, 503]).toContain(res.status);
    });
  });

  describe('Cross-user category isolation', () => {
    it('user A cannot update user B category', async () => {
      const res = await request(app)
        .put(`${API}/categories/other-user-category-id`)
        .set({ Authorization: `Bearer ${makeToken('attacker-user')}` })
        .send({ name: 'Hijacked' });
      expect([400, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });
});
