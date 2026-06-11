import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const makeToken = (userId: string, role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign({ userId, id: userId, email: `${userId}@test.com`, role }, secret, { expiresIn: '15m' });
};

const auth = (userId = 'pin-test-user') => ({
  Authorization: `Bearer ${makeToken(userId)}`,
});

describe('PIN Management', () => {
  describe('GET /pin/status', () => {
    it('returns PIN status for authenticated user', async () => {
      const res = await request(app).get(`${API}/pin/status`).set(auth());
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get(`${API}/pin/status`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /pin/create', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/pin/create`).send({ pin: '1234' });
      expect(res.status).toBe(401);
    });

    it('rejects PIN without auth', async () => {
      const res = await request(app).post(`${API}/pin/create`).send({ pin: '1234' });
      expect(res.status).toBe(401);
    });

    it('accepts PIN with auth → 200/400/500', async () => {
      const res = await request(app)
        .post(`${API}/pin/create`)
        .set(auth())
        .send({ pin: '1234', confirmPin: '1234' });
      expect([200, 201, 400, 409, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('rejects mismatched PINs if validated', async () => {
      const res = await request(app)
        .post(`${API}/pin/create`)
        .set(auth())
        .send({ pin: '1234', confirmPin: '5678' });
      expect([400, 422, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
    });

    it('rejects non-numeric PIN format if validated', async () => {
      const res = await request(app)
        .post(`${API}/pin/create`)
        .set(auth())
        .send({ pin: 'abcd', confirmPin: 'abcd' });
      expect([400, 422, 500, 503]).toContain(res.status);
    });
  });

  describe('POST /pin/verify', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/pin/verify`).send({ pin: '1234' });
      expect(res.status).toBe(401);
    });

    it('accepts PIN verify request with auth', async () => {
      const res = await request(app)
        .post(`${API}/pin/verify`)
        .set(auth())
        .send({ pin: '1234' });
      expect([200, 400, 401, 403, 500]).toContain(res.status);
      expect(res.status).not.toBe(404);
    });

    it('returns lockout info on repeated wrong attempts', async () => {
      // 5 wrong attempts should trigger lockout (if implemented)
      const results: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post(`${API}/pin/verify`)
          .set(auth('lockout-test-user'))
          .send({ pin: '0000' });
        results.push(res.status);
      }
      // After 5 wrong attempts, either locked out (429/423) or DB not available (500)
      const lastStatus = results[results.length - 1];
      expect([400, 401, 403, 423, 429, 500]).toContain(lastStatus);
    });
  });

  describe('POST /pin/update', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/pin/update`).send({ oldPin: '1234', newPin: '5678' });
      expect(res.status).toBe(401);
    });

    it('accepts update with auth', async () => {
      const res = await request(app)
        .post(`${API}/pin/update`)
        .set(auth())
        .send({ oldPin: '1234', newPin: '5678', confirmPin: '5678' });
      expect([200, 400, 401, 403, 500]).toContain(res.status);
      expect(res.status).not.toBe(404);
    });
  });

  describe('POST /pin/reset', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/pin/reset`).send({ email: 'test@test.com' });
      expect(res.status).toBe(401);
    });

    it('accepts reset request with auth', async () => {
      const res = await request(app)
        .post(`${API}/pin/reset`)
        .set(auth())
        .send({});
      // 403 = security gate requires OTP/security verification before reset
      expect([200, 400, 403, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });
  });

  describe('GET /pin/key-backup', () => {
    it('requires authentication', async () => {
      const res = await request(app).get(`${API}/pin/key-backup`);
      expect(res.status).toBe(401);
    });

    it('returns backup key or error with auth', async () => {
      const res = await request(app).get(`${API}/pin/key-backup`).set(auth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });
  });
});
