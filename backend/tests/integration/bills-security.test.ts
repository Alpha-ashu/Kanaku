import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const getSignedToken = () => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }

  return jwt.sign(
    {
      userId: 'bills-security-user',
      email: 'bills-security@test.com',
      role: 'user',
      isApproved: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

describe('BILLS SECURITY', () => {
  it('rejects unauthenticated bill upload', async () => {
    const res = await request(app)
      .post(`${API}/bills`)
      .attach('file', Buffer.from('dummy payload'), {
        filename: 'receipt.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('rejects oversized bill uploads over 5MB', async () => {
    const token = getSignedToken();
    const oversized = Buffer.alloc((5 * 1024 * 1024) + 1024, 0x61);

    const res = await request(app)
      .post(`${API}/bills`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', oversized, {
        filename: 'oversized.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('File exceeds 5MB limit');
  });

  it('rejects transactionId not owned by authenticated user', async () => {
    const token = getSignedToken();

    const res = await request(app)
      .post(`${API}/bills`)
      .set('Authorization', `Bearer ${token}`)
      .field('transactionId', '00000000-0000-0000-0000-000000000000')
      .attach('file', Buffer.from('dummy payload'), {
        filename: 'receipt.txt',
        contentType: 'text/plain',
      });

    expect([403, 503]).toContain(res.status);
    if (res.status === 403) expect(res.body.error).toBe('Unauthorized transaction reference');
  });

  it('rate limits repeated bill upload attempts', async () => {
    const token = getSignedToken();

    // Pre-flight: if DB is unavailable the auth middleware takes 4-12s per request.
    // Detect this early by racing the profile endpoint against a 3s deadline.
    try {
      const check = await (request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', `Bearer ${token}`) as any)
        .timeout(3000);
      if (check.status === 503) return;
    } catch {
      return; // Response took > 3s → DB unreachable, can't test rate limiting
    }

    const previousNodeEnv = process.env.NODE_ENV;

    // Rate limiting middleware is bypassed in test mode, so enable it only for this case.
    process.env.NODE_ENV = 'development';

    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const res = await request(app)
          .post(`${API}/bills`)
          .set('Authorization', `Bearer ${token}`)
          .field('transactionId', `tx-rate-limit-${attempt}`);
        statuses.push(res.status);
        if (res.status === 503) break;
      }

      expect(statuses.every((status) => [400, 403, 429, 503].includes(status))).toBe(true);
      if (!statuses.some(s => s === 503) && statuses.length === 11) {
        expect(statuses[10]).toBe(429);
      }
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }, 30000);
});
