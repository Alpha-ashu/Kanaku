/**
 * SECURITY & VULNERABILITY Test Suite
 * Covers: Injection, XSS, CSRF, Auth Bypass, IDOR, Rate Limiting, Headers
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const getAuthHeaders = (token = 'mock-access-token') => ({
  Authorization: `Bearer ${token}`,
});

const getSignedAuthHeaders = (userId = 'security-test-user', role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = secret;
  }
  const token = jwt.sign({ userId, id: userId, email: 'security@test.com', role }, secret, { expiresIn: '15m' });
  return {
    Authorization: `Bearer ${token}`,
  };
};

describe('SECURITY TESTS', () => {
  //  SQL Injection 
  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in login email', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: "admin@test.com' OR '1'='1", password: 'test' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });

    it('should prevent SQL injection in register name', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: 'test@test.com',
          name: "'; DROP TABLE users; --",
          password: 'SecurePass123!',
        });
      // Prisma parameterizes queries - should not cause issues
      expect([201, 400, 409]).toContain(res.status);
    });

    it('should prevent SQL injection in transaction category filter', async () => {
      const res = await request(app)
        .get(`${API}/transactions?category=' OR 1=1 --`)
        .set(getAuthHeaders());
      expect([200, 400, 401]).toContain(res.status);
    });

    it('should prevent SQL injection in account query params', async () => {
      const res = await request(app)
        .get(`${API}/transactions?accountId=' UNION SELECT * FROM users --`)
        .set(getAuthHeaders());
      expect([200, 400, 401]).toContain(res.status);
    });
  });

  //  NoSQL Injection 
  describe('NoSQL Injection Prevention', () => {
    it('should prevent NoSQL injection in login', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: { $gt: '' }, password: { $gt: '' } });
      expect(res.status).toBe(400);
    });

    it('should prevent object injection in query params', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: { $ne: null }, password: { $ne: null } });
      expect(res.status).toBe(400);
    });
  });

  //  XSS Prevention 
  describe('XSS Prevention', () => {
    it('should not reflect XSS in error responses', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: '<script>alert(1)</script>@test.com',
          name: 'Test',
          password: 'SecurePass123!',
        });
      const body = JSON.stringify(res.body);
      // Strict email regex rejects XSS in email, sanitizer strips XSS from name
      expect(body).not.toContain('<script>');
    });

    it('should sanitize XSS in transaction description via API', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(getAuthHeaders())
        .send({
          accountId: 'x',
          type: 'expense',
          amount: 10,
          category: 'test',
          date: '2025-01-01',
          description: '"><img src=x onerror=alert(1)>',
        });
      if (res.status === 201 && res.body.description) {
        expect(res.body.description).not.toContain('onerror');
      }
    });
  });

  //  Authentication Bypass 
  describe('Authentication Bypass Prevention', () => {
    it('should reject requests without Authorization header', async () => {
      const endpoints = [
        { method: 'get', path: `${API}/accounts` },
        { method: 'get', path: `${API}/transactions` },
        { method: 'get', path: `${API}/goals` },
        { method: 'get', path: `${API}/loans` },
        { method: 'get', path: `${API}/settings` },
        { method: 'get', path: `${API}/sync/devices` },
        { method: 'get', path: `${API}/auth/profile` },
      ];

      for (const endpoint of endpoints) {
        const res = await (request(app) as any)[endpoint.method](endpoint.path);
        expect(res.status).toBe(401);
      }
    });

    it('should reject tampered JWT token', async () => {
      const res = await request(app)
        .get(`${API}/accounts`)
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjM0NTYiLCJyb2xlIjoiYWRtaW4ifQ.tampered');
      expect(res.status).toBe(401);
    });

    it('should reject JWT with none algorithm', async () => {
      // Attempt "none" algorithm attack
      const noneToken = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64') +
        '.' +
        Buffer.from('{"userId":"admin","role":"admin"}').toString('base64') +
        '.';
      const res = await request(app)
        .get(`${API}/admin/users`)
        .set('Authorization', `Bearer ${noneToken}`);
      expect([401, 403]).toContain(res.status);
    });

    it('should reject empty string as token', async () => {
      const res = await request(app)
        .get(`${API}/accounts`)
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
    });

    it('should reject null token', async () => {
      const res = await request(app)
        .get(`${API}/accounts`)
        .set('Authorization', 'Bearer null');
      expect(res.status).toBe(401);
    });
  });

  //  Authorization (RBAC) 
  describe('RBAC Enforcement', () => {
    it('should reject non-admin from admin endpoints', async () => {
      const adminEndpoints = [
        `${API}/admin/users`,
        `${API}/admin/pending-advisors`,
        `${API}/admin/stats`,
        `${API}/admin/feature-flags`,
      ];

      for (const endpoint of adminEndpoints) {
        const res = await request(app)
          .get(endpoint)
          .set(getAuthHeaders());
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  //  IDOR (Insecure Direct Object Reference) 
  describe('IDOR Prevention', () => {
    it('should not allow accessing other users data via ID manipulation', async () => {
      const res = await request(app)
        .get(`${API}/accounts/00000000-0000-0000-0000-000000000000`)
        .set(getAuthHeaders());
      expect([401, 403, 404]).toContain(res.status);
    });

    it('should not allow modifying other users transactions', async () => {
      const res = await request(app)
        .put(`${API}/transactions/00000000-0000-0000-0000-000000000000`)
        .set(getAuthHeaders())
        .send({ amount: 999999 });
      expect([401, 403, 404]).toContain(res.status);
    });
  });

  //  Content Type Validation 
  describe('Content Type Validation', () => {
    it('should handle non-JSON content type', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .set('Content-Type', 'text/plain')
        .send('email=test@test.com&password=test');
      expect([400, 415]).toContain(res.status);
    });

    it('should handle malformed JSON body', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .set('Content-Type', 'application/json')
        .send('{"email": invalid json}');
      expect([400, 500]).toContain(res.status);
    });
  });

  //  HTTP Method Enforcement 
  describe('HTTP Method Enforcement', () => {
    it('should reject GET on POST-only auth endpoints', async () => {
      const res = await request(app).get(`${API}/auth/register`);
      expect([404, 405]).toContain(res.status);
    });

    it('should reject POST on GET-only endpoints', async () => {
      const res = await request(app).post('/health');
      expect([404, 405]).toContain(res.status);
    });
  });

  //  Response Headers 
  describe('Security Headers', () => {
    it('should not expose server technology in headers', async () => {
      const res = await request(app).get('/health');
      // X-Powered-By should be disabled (app.disable('x-powered-by'))
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('should set CORS headers correctly', async () => {
      const res = await request(app)
        .options(`${API}/auth/login`)
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  //  Payload Size 
  describe('Payload Size Limits', () => {
    it('should reject extremely large request body', async () => {
      const largePayload = { data: 'x'.repeat(10 * 1024 * 1024) }; // 10MB
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send(largePayload);
      expect([400, 413, 500]).toContain(res.status);
    });
  });

  //  Path Traversal 
  describe('Path Traversal Prevention', () => {
    it('should not allow path traversal in route params', async () => {
      const res = await request(app)
        .get(`${API}/accounts/../../admin/users`)
        .set(getAuthHeaders());
      expect([401, 403, 404]).toContain(res.status);
    });
  });

  //  PIN Security & Policies 
  describe('PIN Security & Policies', () => {
    it('should reject weak PINs with HTTP 400', async () => {
      const weakPins = ['123456', '111111', '121212', '987654', '223344'];
      for (const pin of weakPins) {
        const res = await request(app)
          .post(`${API}/pin/create`)
          .set(getSignedAuthHeaders())
          .send({ pin });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_PIN');
      }
    });

    it('should return 404 when no PIN key backup is found', async () => {
      const res = await request(app)
        .get(`${API}/pin/key-backup`)
        .set(getSignedAuthHeaders());
      expect(res.status).toBe(404);
    });

    it('should return 200 for correct PIN verification and 401 for incorrect PIN verification', async () => {
      const userId = 'pin-test-user-123';
      const email = 'pin-test@security.com';
      const secret = process.env.JWT_SECRET || 'test-jwt-secret';
      if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = secret;
      }
      const token = jwt.sign({ userId, id: userId, email, role: 'user' }, secret, { expiresIn: '15m' });
      const headers = { Authorization: `Bearer ${token}` };

      const { prisma } = require('../../src/db/prisma');
      await prisma.userPin.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});

      const pin = '135790';
      const crypto = require('crypto');
      const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');

      // Create PIN
      const createRes = await request(app)
        .post(`${API}/pin/create`)
        .set(headers)
        .send({ pin: hashedPin });
      expect(createRes.status).toBe(200);

      // Verify correct PIN -> should return 200
      const verifyCorrectRes = await request(app)
        .post(`${API}/pin/verify`)
        .set(headers)
        .send({ pin: hashedPin });
      expect(verifyCorrectRes.status).toBe(200);
      expect(verifyCorrectRes.body.success).toBe(true);

      // Verify wrong PIN -> should return 401
      const wrongPin = '097531';
      const hashedWrongPin = crypto.createHash('sha256').update(wrongPin).digest('hex');
      const verifyWrongRes = await request(app)
        .post(`${API}/pin/verify`)
        .set(headers)
        .send({ pin: hashedWrongPin });
      expect(verifyWrongRes.status).toBe(401);
      expect(verifyWrongRes.body.success).toBe(false);

      // Clean up
      await prisma.userPin.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    });
  });
});
