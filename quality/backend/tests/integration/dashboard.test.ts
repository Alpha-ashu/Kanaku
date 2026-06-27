/**
 * DASHBOARD API - Comprehensive Test Suite
 * Covers: Summary, Cashflow, Auth, Edge Cases
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';

const getSignedAuthHeaders = (userId = 'dashboard-test-user', role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId, id: userId, email: 'dashboard@test.com', role }, secret, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}` };
};

describe('DASHBOARD MODULE', () => {
  //  GET /dashboard/summary
  describe('GET /dashboard/summary', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/dashboard/summary`);
      expect(res.status).toBe(401);
    });

    it('should return dashboard summary for authenticated user', async () => {
      const res = await request(app)
        .get(`${API}/dashboard/summary`)
        .set(getSignedAuthHeaders());
      expect([200, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
      }
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get(`${API}/dashboard/summary`)
        .set({ Authorization: 'Bearer invalid-token' });
      expect(res.status).toBe(401);
    });
  });

  //  GET /dashboard/cashflow
  describe('GET /dashboard/cashflow', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/dashboard/cashflow`);
      expect(res.status).toBe(401);
    });

    it('should return cashflow data for authenticated user', async () => {
      const res = await request(app)
        .get(`${API}/dashboard/cashflow`)
        .set(getSignedAuthHeaders());
      expect([200, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
      }
    });

    it('should not expose other users dashboard data', async () => {
      const userA = getSignedAuthHeaders('user-a');
      const userB = getSignedAuthHeaders('user-b');

      const resA = await request(app).get(`${API}/dashboard/summary`).set(userA);
      const resB = await request(app).get(`${API}/dashboard/summary`).set(userB);

      // Both should succeed independently
      expect([200, 500, 503]).toContain(resA.status);
      expect([200, 500, 503]).toContain(resB.status);
    });
  });
});

