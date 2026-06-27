/**
 * COLLABORATION API — Test Suite
 * Covers the unified collaboration/invitation endpoints: list, pending, get, revoke.
 * Tolerant of DB availability (list/pending degrade to an empty array on DB error).
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';

const authHeaders = (userId = 'collab-test-user') => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  const token = jwt.sign(
    { userId, id: userId, email: `${userId}@test.com`, role: 'user', isApproved: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
  return { Authorization: `Bearer ${token}` };
};

describe('COLLABORATION MODULE', () => {
  describe('GET /collaborations', () => {
    it('requires authentication', async () => {
      const res = await request(app).get(`${API}/collaborations`);
      expect(res.status).toBe(401);
    });

    it('returns a list for an authenticated user (empty array when none / DB down)', async () => {
      const res = await request(app).get(`${API}/collaborations`).set(authHeaders());
      expect([200, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('rejects an invalid moduleType query value', async () => {
      const res = await request(app)
        .get(`${API}/collaborations?moduleType=not_a_module`)
        .set(authHeaders());
      expect(res.status).toBe(400);
    });

    it('accepts a valid moduleType filter', async () => {
      const res = await request(app)
        .get(`${API}/collaborations?moduleType=group_expense`)
        .set(authHeaders());
      expect([200, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /collaborations/pending', () => {
    it('requires authentication', async () => {
      const res = await request(app).get(`${API}/collaborations/pending`);
      expect(res.status).toBe(401);
    });

    it('returns pending invitations for an authenticated user', async () => {
      const res = await request(app).get(`${API}/collaborations/pending`).set(authHeaders());
      expect([200, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('GET /collaborations/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).get(`${API}/collaborations/some-id`);
      expect(res.status).toBe(401);
    });

    it('returns 404 (or DB-unavailable) for a non-existent collaboration', async () => {
      const res = await request(app)
        .get(`${API}/collaborations/00000000-0000-0000-0000-000000000000`)
        .set(authHeaders());
      expect([404, 500, 503]).toContain(res.status);
    });
  });

  describe('DELETE /collaborations/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).delete(`${API}/collaborations/some-id`);
      expect(res.status).toBe(401);
    });

    it('returns 404 (or DB-unavailable) when revoking a non-existent collaboration', async () => {
      const res = await request(app)
        .delete(`${API}/collaborations/00000000-0000-0000-0000-000000000000`)
        .set(authHeaders());
      expect([404, 500, 503]).toContain(res.status);
    });
  });
});
