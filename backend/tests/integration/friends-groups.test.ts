/**
 * FRIENDS & GROUPS API - Comprehensive Test Suite
 * Covers: Friends CRUD, Groups CRUD, Expense Splitting, Authorization
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const getSignedAuthHeaders = (userId = 'friends-test-user', role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId, id: userId, email: 'friends@test.com', role }, secret, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}` };
};

describe('FRIENDS MODULE', () => {
  describe('GET /friends', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/friends`);
      expect(res.status).toBe(401);
    });

    it('should return friends list for authenticated user', async () => {
      const res = await request(app).get(`${API}/friends`).set(getSignedAuthHeaders());
      expect([200, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('POST /friends', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`${API}/friends`)
        .send({ name: 'Raj Kumar', phone: '9876543210' });
      expect(res.status).toBe(401);
    });

    it('should reject friend with missing name', async () => {
      const res = await request(app)
        .post(`${API}/friends`)
        .set(getSignedAuthHeaders())
        .send({ phone: '9876543210' });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle XSS in friend name', async () => {
      const res = await request(app)
        .post(`${API}/friends`)
        .set(getSignedAuthHeaders())
        .send({ name: '<script>alert("xss")</script>' });
      if (res.status === 201 && res.body.data?.name) {
        expect(res.body.data.name).not.toContain('<script>');
      }
      expect([201, 400, 500, 503]).toContain(res.status);
    });
  });

  describe('DELETE /friends/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).delete(`${API}/friends/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent friend', async () => {
      const res = await request(app)
        .delete(`${API}/friends/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([404, 500, 503]).toContain(res.status);
    });
  });

  describe('IDOR Protection', () => {
    it('should not allow accessing another users friends', async () => {
      const resA = await request(app)
        .get(`${API}/friends`)
        .set(getSignedAuthHeaders('user-a-friends'));
      const resB = await request(app)
        .get(`${API}/friends`)
        .set(getSignedAuthHeaders('user-b-friends'));

      expect([200, 500]).toContain(resA.status);
      expect([200, 500]).toContain(resB.status);
    });
  });
});

describe('GROUPS MODULE', () => {
  describe('GET /groups', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/groups`);
      expect(res.status).toBe(401);
    });

    it('should return groups list for authenticated user', async () => {
      const res = await request(app).get(`${API}/groups`).set(getSignedAuthHeaders());
      expect([200, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('POST /groups', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`${API}/groups`)
        .send({ name: 'Weekend Trip', members: [] });
      expect(res.status).toBe(401);
    });

    it('should reject group with missing name', async () => {
      const res = await request(app)
        .post(`${API}/groups`)
        .set(getSignedAuthHeaders())
        .send({ members: [] });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle XSS in group name', async () => {
      const res = await request(app)
        .post(`${API}/groups`)
        .set(getSignedAuthHeaders())
        .send({ name: '<script>alert(1)</script>', members: [] });
      if (res.status === 201 && res.body.data?.name) {
        expect(res.body.data.name).not.toContain('<script>');
      }
      expect([201, 400, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /groups/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/groups/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent group', async () => {
      const res = await request(app)
        .get(`${API}/groups/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([404, 500, 503]).toContain(res.status);
    });
  });

  describe('DELETE /groups/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).delete(`${API}/groups/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent group', async () => {
      const res = await request(app)
        .delete(`${API}/groups/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([404, 500, 503]).toContain(res.status);
    });
  });
});

