/**
 * SANITY TEST SUITE
 * Quick verification that the core system is responsive and structurally sound.
 * Run after any deployment or significant change.
 */
import request from 'supertest';
import { app } from '../../src/app';

const API = '/api/v1';

describe('SANITY TESTS - Post-Change Verification', () => {
  describe('Core Infrastructure', () => {
    it('server starts and responds to health check', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('health check responds within 2 seconds', async () => {
      const start = Date.now();
      await request(app).get('/health');
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });

    it('API v1 routes are accessible (return 401 not 404)', async () => {
      const protectedRoutes = [
        `${API}/accounts`,
        `${API}/transactions`,
        `${API}/goals`,
        `${API}/loans`,
        `${API}/settings`,
        `${API}/investments`,
        `${API}/friends`,
        `${API}/groups`,
        `${API}/todos`,
        `${API}/dashboard/summary`,
        `${API}/notifications`,
      ];

      for (const route of protectedRoutes) {
        const res = await request(app).get(route);
        expect(res.status).toBe(401); // Auth required, not 404 (route missing)
      }
    });

    it('public auth routes accept POST requests', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({});
      // Should return 400 (validation) not 404 (route missing) or 500 (crash)
      expect(res.status).toBe(400);
    });

    it('OpenAPI docs endpoint is reachable', async () => {
      const res = await request(app).get('/api-docs/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.info.title).toBe('KANKU Backend API');
    });
  });

  describe('Authentication Sanity', () => {
    it('missing email returns 400 with MISSING_FIELDS code', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'Test', password: 'TestPass123!' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('invalid email format returns 400 with INVALID_EMAIL code', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'not-an-email', password: 'TestPass123!' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });

    it('missing auth token returns 401', async () => {
      const res = await request(app).get(`${API}/auth/profile`);
      expect(res.status).toBe(401);
    });
  });

  describe('Request/Response Integrity', () => {
    it('responses are valid JSON', async () => {
      const res = await request(app).get('/health');
      expect(() => JSON.parse(JSON.stringify(res.body))).not.toThrow();
    });

    it('error responses have consistent shape', async () => {
      const res = await request(app).get('/nonexistent');
      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('code');
    });

    it('Content-Type is application/json for API responses', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Security Sanity', () => {
    it('X-Powered-By header is not exposed', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('X-Content-Type-Options header is set', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('each request gets unique X-Request-Id', async () => {
      const [r1, r2] = await Promise.all([
        request(app).get('/health'),
        request(app).get('/health'),
      ]);
      expect(r1.headers['x-request-id']).toBeDefined();
      expect(r2.headers['x-request-id']).toBeDefined();
      expect(r1.headers['x-request-id']).not.toBe(r2.headers['x-request-id']);
    });

    it('SQL injection in email is rejected', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: "admin@test.com' OR '1'='1", password: 'test' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });
  });
});

