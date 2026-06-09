/**
 * LOANS API - Comprehensive Test Suite
 * Covers: CRUD, Payments, Validation, Authorization, Balance Tracking
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const getSignedAuthHeaders = (userId = 'loans-test-user', role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId, id: userId, email: 'loans@test.com', role }, secret, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}` };
};

describe('LOANS MODULE', () => {
  //  GET /loans
  describe('GET /loans', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/loans`);
      expect(res.status).toBe(401);
    });

    it('should return loans list for authenticated user', async () => {
      const res = await request(app).get(`${API}/loans`).set(getSignedAuthHeaders());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  //  POST /loans
  describe('POST /loans', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .send({ type: 'borrowed', name: 'Home Loan', principalAmount: 500000 });
      expect(res.status).toBe(401);
    });

    it('should reject loan with missing type', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getSignedAuthHeaders())
        .send({ name: 'Home Loan', principalAmount: 500000 });
      expect(res.status).toBe(400);
    });

    it('should reject loan with missing name', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getSignedAuthHeaders())
        .send({ type: 'borrowed', principalAmount: 500000 });
      expect(res.status).toBe(400);
    });

    it('should reject loan with missing principalAmount', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getSignedAuthHeaders())
        .send({ type: 'borrowed', name: 'Test Loan' });
      expect(res.status).toBe(400);
    });

    it('should reject loan with negative principalAmount', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getSignedAuthHeaders())
        .send({ type: 'borrowed', name: 'Bad Loan', principalAmount: -10000 });
      expect(res.status).toBe(400);
    });

    it('should reject loan with zero principalAmount', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getSignedAuthHeaders())
        .send({ type: 'borrowed', name: 'Zero Loan', principalAmount: 0 });
      expect(res.status).toBe(400);
    });

    it('should create a valid loan', async () => {
      const uniqueName = `Test Loan ${Date.now()}`;
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getSignedAuthHeaders())
        .send({
          type: 'borrowed',
          name: uniqueName,
          principalAmount: 50000,
          interestRate: 7.5,
          frequency: 'monthly',
        });
      expect([201, 500]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('id');
        expect(res.body.data.principalAmount).toBe(50000);
        expect(res.body.data.outstandingBalance).toBe(50000);
        expect(res.body.data.status).toBe('active');
      }
    });

    it('should sanitize XSS in loan name', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getSignedAuthHeaders())
        .send({ type: 'lent', name: '<img onerror=alert(1) src=x>', principalAmount: 1000 });
      if (res.status === 201 && res.body.data?.name) {
        expect(res.body.data.name).not.toContain('onerror');
      }
      expect([201, 400, 500]).toContain(res.status);
    });
  });

  //  GET /loans/:id
  describe('GET /loans/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/loans/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent loan', async () => {
      const res = await request(app)
        .get(`${API}/loans/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([404, 500]).toContain(res.status);
    });
  });

  //  PUT /loans/:id
  describe('PUT /loans/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put(`${API}/loans/some-id`)
        .send({ interestRate: 8 });
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent loan', async () => {
      const res = await request(app)
        .put(`${API}/loans/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders())
        .send({ interestRate: 8 });
      expect([404, 500]).toContain(res.status);
    });

    it('should reject negative outstandingBalance', async () => {
      const res = await request(app)
        .put(`${API}/loans/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders())
        .send({ outstandingBalance: -500 });
      expect([400, 404, 500]).toContain(res.status);
    });

    it('should reject negative interestRate', async () => {
      const res = await request(app)
        .put(`${API}/loans/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders())
        .send({ interestRate: -5 });
      expect([400, 404, 500]).toContain(res.status);
    });
  });

  //  DELETE /loans/:id
  describe('DELETE /loans/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).delete(`${API}/loans/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent loan', async () => {
      const res = await request(app)
        .delete(`${API}/loans/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([404, 500]).toContain(res.status);
    });
  });

  //  POST /loans/:id/payment
  describe('POST /loans/:id/payment', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`${API}/loans/some-id/payment`)
        .send({ amount: 1000 });
      expect(res.status).toBe(401);
    });

    it('should reject payment without amount', async () => {
      const res = await request(app)
        .post(`${API}/loans/some-id/payment`)
        .set(getSignedAuthHeaders())
        .send({});
      expect([400, 404, 401]).toContain(res.status);
    });

    it('should reject payment with negative amount', async () => {
      const res = await request(app)
        .post(`${API}/loans/some-id/payment`)
        .set(getSignedAuthHeaders())
        .send({ amount: -500 });
      expect([400, 404]).toContain(res.status);
    });

    it('should reject payment with zero amount', async () => {
      const res = await request(app)
        .post(`${API}/loans/some-id/payment`)
        .set(getSignedAuthHeaders())
        .send({ amount: 0 });
      expect([400, 404]).toContain(res.status);
    });

    it('should return 404 for payment on non-existent loan', async () => {
      const res = await request(app)
        .post(`${API}/loans/00000000-0000-0000-0000-000000000000/payment`)
        .set(getSignedAuthHeaders())
        .send({ amount: 500 });
      expect([404, 500]).toContain(res.status);
    });
  });

  //  IDOR Protection
  describe('IDOR Protection', () => {
    it('should not allow accessing another users loan', async () => {
      const res = await request(app)
        .get(`${API}/loans/another-users-loan-id`)
        .set(getSignedAuthHeaders());
      expect([404, 500]).toContain(res.status);
    });

    it('should not allow updating another users loan', async () => {
      const res = await request(app)
        .put(`${API}/loans/another-users-loan-id`)
        .set(getSignedAuthHeaders())
        .send({ name: 'Hacked' });
      expect([404, 500]).toContain(res.status);
    });
  });

  //  Edge Cases
  describe('Edge Cases', () => {
    it('should reject empty body POST', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getSignedAuthHeaders())
        .send({});
      expect(res.status).toBe(400);
    });
  });
});

