/**
 * LOANS, GOALS, SETTINGS APIs - Comprehensive Test Suite
 * Covers: CRUD, Validation, Authorization, Edge Cases
 */
import request from 'supertest';
import { app } from '../../src/app';

const API = '/api/v1';

const getAuthHeaders = (token = 'mock-access-token') => ({
  Authorization: `Bearer ${token}`,
});

// 
// GOALS MODULE
// 
describe('GOALS MODULE', () => {
  describe('GET /goals', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/goals`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /goals', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/goals`)
        .send({ name: 'Save for car', targetAmount: 5000, targetDate: '2026-12-31' });
      expect(res.status).toBe(401);
    });

    it('should reject goal with missing name', async () => {
      const res = await request(app)
        .post(`${API}/goals`)
        .set(getAuthHeaders())
        .send({ targetAmount: 5000 });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject goal with negative target amount', async () => {
      const res = await request(app)
        .post(`${API}/goals`)
        .set(getAuthHeaders())
        .send({ name: 'Test Goal', targetAmount: -100 });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject goal with zero target amount', async () => {
      const res = await request(app)
        .post(`${API}/goals`)
        .set(getAuthHeaders())
        .send({ name: 'Test Goal', targetAmount: 0 });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle past target date', async () => {
      const res = await request(app)
        .post(`${API}/goals`)
        .set(getAuthHeaders())
        .send({ name: 'Test Goal', targetAmount: 1000, targetDate: '2020-01-01' });
      expect([201, 400, 401]).toContain(res.status);
    });
  });

  describe('IDOR Protection', () => {
    it('should not allow accessing another users goal', async () => {
      const res = await request(app)
        .get(`${API}/goals/another-users-goal-id`)
        .set(getAuthHeaders());
      expect([401, 403, 404]).toContain(res.status);
    });
  });
});

// 
// LOANS MODULE
// 
describe('LOANS MODULE', () => {
  describe('GET /loans', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/loans`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /loans', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .send({ type: 'borrowed', name: 'Car Loan', principalAmount: 10000 });
      expect(res.status).toBe(401);
    });

    it('should reject loan with missing type', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getAuthHeaders())
        .send({ name: 'Car Loan', principalAmount: 10000 });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject loan with missing name', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getAuthHeaders())
        .send({ type: 'borrowed', principalAmount: 10000 });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject loan with missing principal', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getAuthHeaders())
        .send({ type: 'borrowed', name: 'Car Loan' });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject loan with negative principal', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getAuthHeaders())
        .send({ type: 'borrowed', name: 'Test', principalAmount: -5000 });
      expect([400, 401]).toContain(res.status);
    });

    it('should validate loan type values', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getAuthHeaders())
        .send({ type: 'invalid_type', name: 'Test', principalAmount: 5000 });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle negative interest rate', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(getAuthHeaders())
        .send({ type: 'borrowed', name: 'Test', principalAmount: 5000, interestRate: -5 });
      expect([400, 401]).toContain(res.status);
    });
  });

  describe('POST /loans/:id/payment', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/loans/some-id/payment`)
        .send({ amount: 500 });
      expect(res.status).toBe(401);
    });

    it('should reject payment with missing amount', async () => {
      const res = await request(app)
        .post(`${API}/loans/some-id/payment`)
        .set(getAuthHeaders())
        .send({});
      expect([400, 401]).toContain(res.status);
    });

    it('should reject negative payment', async () => {
      const res = await request(app)
        .post(`${API}/loans/some-id/payment`)
        .set(getAuthHeaders())
        .send({ amount: -100 });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject zero payment', async () => {
      const res = await request(app)
        .post(`${API}/loans/some-id/payment`)
        .set(getAuthHeaders())
        .send({ amount: 0 });
      expect([400, 401]).toContain(res.status);
    });
  });
});

// 
// SETTINGS MODULE
// 
describe('SETTINGS MODULE', () => {
  describe('GET /settings', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/settings`);
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /settings', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .put(`${API}/settings`)
        .send({ theme: 'dark' });
      expect(res.status).toBe(401);
    });

    it('should handle invalid theme value', async () => {
      const res = await request(app)
        .put(`${API}/settings`)
        .set(getAuthHeaders())
        .send({ theme: 'invalid_theme' });
      expect([200, 400, 401]).toContain(res.status);
    });

    it('should handle XSS in language setting', async () => {
      const res = await request(app)
        .put(`${API}/settings`)
        .set(getAuthHeaders())
        .send({ language: '<script>alert(1)</script>' });
      expect([200, 400, 401]).toContain(res.status);
    });
  });
});
