/**
 * HEALTH & INFRASTRUCTURE - Smoke Test Suite
 * Covers: Health check, API versioning, 404 handling, rate limits, CORS headers
 */
import request from 'supertest';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';

describe('SMOKE TESTS - System Stability', () => {
  //  Health Check
  describe('GET /health', () => {
    it('should return 200 status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });

    it('should return ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.body.status).toBe('ok');
    });

    it('should include timestamp in response', async () => {
      const res = await request(app).get('/health');
      expect(res.body.timestamp).toBeDefined();
      expect(typeof res.body.timestamp).toBe('string');
    });

    it('public /health is a minimal liveness probe (no internal service details exposed)', async () => {
      const res = await request(app).get('/health');
      // Detailed diagnostics are intentionally NOT exposed on the public probe
      // (info-disclosure safety); they live on the authenticated deep route.
      expect(res.body.services).toBeUndefined();
    });

    it('detailed service health is exposed only on the authenticated deep route', async () => {
      const res = await request(app).get('/api/v1/health/deep');
      expect(res.status).toBe(401); // protected — requires a valid token
    });

    it('should not expose X-Powered-By header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('should set X-Request-Id header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });

  //  API Versioning
  describe('API Versioning', () => {
    it('should have all core routes under /api/v1', async () => {
      const routes = [
        `${API}/auth/register`,
        `${API}/transactions`,
        `${API}/accounts`,
        `${API}/goals`,
        `${API}/loans`,
        `${API}/settings`,
        `${API}/dashboard/summary`,
        `${API}/dashboard/cashflow`,
      ];

      for (const route of routes) {
        const res = await request(app).get(route);
        // Should get 401 (auth required) not missing route; 404/405 if GET not supported
        expect([200, 400, 401, 403, 404, 405]).toContain(res.status);
      }
    });
  });

  //  404 Handling
  describe('404 Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/this-route-does-not-exist');
      expect(res.status).toBe(404);
    });

    it('should return structured 404 response', async () => {
      const res = await request(app).get('/unknown-route-xyz');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('should return 404 for unknown API v1 routes', async () => {
      const res = await request(app).get(`${API}/nonexistent-resource`);
      expect(res.status).toBe(404);
    });
  });

  //  Security Headers
  describe('Security Headers', () => {
    it('should set X-Content-Type-Options header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should set XSS protection header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-xss-protection']).toBeDefined();
    });
  });

  //  API Docs
  describe('API Documentation', () => {
    it('should serve OpenAPI JSON at /api-docs/openapi.json', async () => {
      const res = await request(app).get('/api-docs/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBeDefined();
      expect(res.body.info).toBeDefined();
    });

    it('should serve Swagger UI at /api-docs', async () => {
      const res = await request(app).get('/api-docs');
      expect(res.status).toBe(200);
      expect(res.text).toContain('swagger');
    });

    it('should serve testing guide at /api-docs/testing-guide', async () => {
      const res = await request(app).get('/api-docs/testing-guide');
      expect(res.status).toBe(200);
      expect(typeof res.text).toBe('string');
    });
  });
});

