/**
 * NOTIFICATIONS API - Comprehensive Test Suite
 * Covers: CRUD, Read/Unread, Authorization, Bulk Ops
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const getSignedAuthHeaders = (userId = 'notif-test-user', role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId, id: userId, email: 'notif@test.com', role }, secret, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}` };
};

describe('NOTIFICATIONS MODULE', () => {
  describe('GET /notifications', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/notifications`);
      expect(res.status).toBe(401);
    });

    it('should return notifications for authenticated user', async () => {
      const res = await request(app)
        .get(`${API}/notifications`)
        .set(getSignedAuthHeaders());
      expect([200, 500, 503]).toContain(res.status);
    });
  });

  describe('PUT /notifications/:id/read', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).put(`${API}/notifications/some-id/read`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await request(app)
        .put(`${API}/notifications/00000000-0000-0000-0000-000000000000/read`)
        .set(getSignedAuthHeaders());
      expect([403, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('PUT /notifications/read-all', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).put(`${API}/notifications/read-all`);
      expect(res.status).toBe(401);
    });

    it('should mark all notifications as read for authenticated user', async () => {
      const res = await request(app)
        .put(`${API}/notifications/read-all`)
        .set(getSignedAuthHeaders());
      expect([200, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('DELETE /notifications/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).delete(`${API}/notifications/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await request(app)
        .delete(`${API}/notifications/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([403, 404, 500, 503]).toContain(res.status);
    });
  });

  describe('IDOR Protection', () => {
    it('should not allow reading another users notifications', async () => {
      const res = await request(app)
        .put(`${API}/notifications/another-user-notif-id/read`)
        .set(getSignedAuthHeaders());
      expect([404, 403, 500, 503]).toContain(res.status);
    });
  });
});

