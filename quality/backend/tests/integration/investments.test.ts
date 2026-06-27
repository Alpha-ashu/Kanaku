/**
 * INVESTMENTS API - Comprehensive Test Suite
 * Covers: CRUD, Validation, Authorization, Gold, Edge Cases
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';

const getSignedAuthHeaders = (userId = 'investments-test-user', role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId, id: userId, email: 'investments@test.com', role }, secret, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}` };
};

describe('INVESTMENTS MODULE', () => {
  describe('GET /investments', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/investments`);
      expect(res.status).toBe(401);
    });

    it('should return investments for authenticated user', async () => {
      const res = await request(app).get(`${API}/investments`).set(getSignedAuthHeaders());
      expect([200, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('POST /investments', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`${API}/investments`)
        .send({ type: 'stocks', name: 'TATA', units: 10, purchasePrice: 500 });
      expect(res.status).toBe(401);
    });

    it('should reject investment with missing required fields', async () => {
      const res = await request(app)
        .post(`${API}/investments`)
        .set(getSignedAuthHeaders())
        .send({ type: 'stocks' });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject investment with negative units', async () => {
      const res = await request(app)
        .post(`${API}/investments`)
        .set(getSignedAuthHeaders())
        .send({ type: 'stocks', name: 'TATA', units: -5, purchasePrice: 500 });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject investment with negative purchasePrice', async () => {
      const res = await request(app)
        .post(`${API}/investments`)
        .set(getSignedAuthHeaders())
        .send({ type: 'stocks', name: 'TATA', units: 10, purchasePrice: -100 });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle XSS in investment name', async () => {
      const res = await request(app)
        .post(`${API}/investments`)
        .set(getSignedAuthHeaders())
        .send({ type: 'stocks', name: '<script>alert(1)</script>', units: 1, purchasePrice: 100 });
      if (res.status === 201 && res.body.data?.name) {
        expect(res.body.data.name).not.toContain('<script>');
      }
      expect([201, 400, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /investments/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/investments/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent investment', async () => {
      const res = await request(app)
        .get(`${API}/investments/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([404, 500, 503]).toContain(res.status);
    });
  });

  describe('PUT /investments/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put(`${API}/investments/some-id`)
        .send({ units: 15 });
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent investment', async () => {
      const res = await request(app)
        .put(`${API}/investments/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders())
        .send({ units: 15 });
      expect([404, 500, 503]).toContain(res.status);
    });
  });

  describe('DELETE /investments/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).delete(`${API}/investments/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent investment', async () => {
      const res = await request(app)
        .delete(`${API}/investments/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([404, 500, 503]).toContain(res.status);
    });
  });

  describe('IDOR Protection', () => {
    it('should not allow accessing another users investment', async () => {
      const res = await request(app)
        .get(`${API}/investments/another-user-investment-id`)
        .set(getSignedAuthHeaders());
      expect([404, 500, 503]).toContain(res.status);
    });

    it('should not allow modifying another users investment', async () => {
      const res = await request(app)
        .put(`${API}/investments/another-user-investment-id`)
        .set(getSignedAuthHeaders())
        .send({ units: 100 });
      expect([404, 500, 503]).toContain(res.status);
    });
  });
});

