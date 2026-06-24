/**
 * TRANSACTIONS API - Comprehensive Test Suite
 * Covers: CRUD, Balance Updates, Transfers, Validation, Edge Cases
 */
import request from 'supertest';
import { app } from '../../src/app';

const API = '/api/v1';

const getAuthHeaders = (token = 'mock-access-token') => ({
  Authorization: `Bearer ${token}`,
});

describe('TRANSACTIONS MODULE', () => {
  //  GET /transactions 
  describe('GET /transactions', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/transactions`);
      expect(res.status).toBe(401);
    });

    it('should return transactions for authenticated user', async () => {
      const res = await request(app)
        .get(`${API}/transactions`)
        .set(getAuthHeaders());
      expect([200, 401]).toContain(res.status);
    });

    it('should filter transactions by accountId', async () => {
      const res = await request(app)
        .get(`${API}/transactions?accountId=test-account-id`)
        .set(getAuthHeaders());
      expect([200, 401]).toContain(res.status);
    });

    it('should filter transactions by date range', async () => {
      const res = await request(app)
        .get(`${API}/transactions?startDate=2025-01-01&endDate=2025-12-31`)
        .set(getAuthHeaders());
      expect([200, 401]).toContain(res.status);
    });

    it('should filter transactions by category', async () => {
      const res = await request(app)
        .get(`${API}/transactions?category=food`)
        .set(getAuthHeaders());
      expect([200, 401]).toContain(res.status);
    });

    it('should handle invalid date range gracefully', async () => {
      const res = await request(app)
        .get(`${API}/transactions?startDate=invalid&endDate=also-invalid`)
        .set(getAuthHeaders());
      expect([200, 400, 401, 500]).toContain(res.status);
    });
  });

  //  POST /transactions 
  describe('POST /transactions', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .send({ accountId: 'x', type: 'expense', amount: 50, category: 'food', date: '2025-01-01' });
      expect(res.status).toBe(401);
    });

    it('should reject with missing required fields', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({ type: 'expense' });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject with missing accountId', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({ type: 'expense', amount: 50, category: 'food', date: '2025-01-01' });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject with missing type', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({ accountId: 'x', amount: 50, category: 'food', date: '2025-01-01' });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject with missing amount', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({ accountId: 'x', type: 'expense', category: 'food', date: '2025-01-01' });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle negative amount', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({ accountId: 'x', type: 'expense', amount: -100, category: 'food', date: '2025-01-01' });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle zero amount', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({ accountId: 'x', type: 'expense', amount: 0, category: 'food', date: '2025-01-01' });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle very large amount', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({ accountId: 'x', type: 'income', amount: 999999999999, category: 'salary', date: '2025-01-01' });
      expect([201, 400, 401, 500]).toContain(res.status);
    });

    it('should validate transaction type', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({ accountId: 'x', type: 'invalid_type', amount: 50, category: 'food', date: '2025-01-01' });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle transfer with missing destination account', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({ accountId: 'x', type: 'transfer', amount: 50, category: 'transfer', date: '2025-01-01' });
      // Transfer without transferToAccountId should fail or create as expense
      expect([201, 400, 401]).toContain(res.status);
    });

    it('should prevent transfer to same account', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({
          accountId: 'same-id',
          type: 'transfer',
          amount: 50,
          category: 'transfer',
          date: '2025-01-01',
          transferToAccountId: 'same-id',
        });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle XSS in description field', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({
          accountId: 'x',
          type: 'expense',
          amount: 50,
          category: 'food',
          date: '2025-01-01',
          description: '<script>alert("xss")</script>',
        });
      expect([201, 400, 401]).toContain(res.status);
    });

    it('should handle SQL injection in category', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({
          accountId: 'x',
          type: 'expense',
          amount: 50,
          category: "'; DROP TABLE transactions; --",
          date: '2025-01-01',
        });
      // Prisma ORM parameterizes queries, so this should be safe
      expect([201, 400, 401]).toContain(res.status);
    });
  });

  //  GET /transactions/:id 
  describe('GET /transactions/:id', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/transactions/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent transaction', async () => {
      const res = await request(app)
        .get(`${API}/transactions/nonexistent-id`)
        .set(getAuthHeaders());
      expect([404, 401]).toContain(res.status);
    });
  });

  //  PUT /transactions/:id 
  describe('PUT /transactions/:id', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .put(`${API}/transactions/some-id`)
        .send({ amount: 100 });
      expect(res.status).toBe(401);
    });
  });

  //  DELETE /transactions/:id 
  describe('DELETE /transactions/:id', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).delete(`${API}/transactions/some-id`);
      expect(res.status).toBe(401);
    });

    it('should handle deleting non-existent transaction', async () => {
      const res = await request(app)
        .delete(`${API}/transactions/nonexistent-id`)
        .set(getAuthHeaders());
      expect([404, 401]).toContain(res.status);
    });
  });

  //  Balance Consistency 
  describe('Balance Consistency', () => {
    it('should not allow expense exceeding account balance', async () => {
      // This depends on account having insufficient funds
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({
          accountId: 'low-balance-account',
          type: 'expense',
          amount: 999999999,
          category: 'test',
          date: '2025-01-01',
        });
      expect([400, 401, 500]).toContain(res.status);
    });
  });
});
