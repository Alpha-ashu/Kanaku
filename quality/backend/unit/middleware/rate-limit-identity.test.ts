/**
 * Global API rate limiting — identity-aware buckets.
 *
 * A flat 60/min PER IP tripped ordinary use: an app launch syncs ~12 tables, the
 * dashboard polls quotes every few seconds, and a user's web/Android/iOS clients
 * on one Wi-Fi (or many phones behind a carrier NAT) shared a single IP bucket.
 * Signed-in traffic is now budgeted per user; anonymous traffic stays per IP.
 *
 * Redis and audit are mocked, so the in-memory limiter path is exercised.
 */
jest.mock('../../../../backend/src/config/redis-connections', () => ({
  getPurposeClient: () => null,
  getPurposeStatus: () => 'disabled',
}));
jest.mock('../../../../backend/src/utils/auditLogger', () => ({ audit: jest.fn() }));

import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { authenticatedRateLimit, resolveRateLimitKey } from '../../../../backend/src/middleware/rateLimit';

const SECRET = 'rate-limit-test-secret';
let scopeCounter = 0;

const tokenFor = (userId: string, expiresIn: string | number = '15m') =>
  jwt.sign({ userId, type: 'access' }, SECRET, { expiresIn } as jwt.SignOptions);

const makeReq = (ip: string, token?: string) =>
  ({ ip, headers: token ? { authorization: `Bearer ${token}` } : {}, method: 'GET', path: '/accounts' }) as unknown as Request;

const makeRes = () => {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: undefined };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res as Response & { statusCode: number; headers: Record<string, string>; body: any };
};

/** Fire n requests through the limiter; returns how many were rejected and the last response. */
const fire = async (limiter: ReturnType<typeof authenticatedRateLimit>, req: Request, n: number) => {
  let rejected = 0;
  let last = makeRes();
  for (let i = 0; i < n; i++) {
    last = makeRes();
    let passed = false;
    await limiter(req, last, () => { passed = true; });
    if (!passed) rejected += 1;
  }
  return { rejected, last };
};

const globalLimiter = (userMax: number, ipMax: number) =>
  authenticatedRateLimit({
    windowMs: 60_000,
    max: (key) => (key.startsWith('user:') ? userMax : ipMax),
    // Fresh scope per limiter so in-memory buckets never leak between tests.
    scope: `test-global-${++scopeCounter}`,
  });

describe('identity-aware global rate limit', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.FORCE_RATE_LIMIT = 'true';
    process.env.JWT_SECRET = SECRET;
  });

  afterAll(() => {
    process.env = env;
  });

  it('gives each signed-in user their own bucket even on a shared IP', async () => {
    const limiter = globalLimiter(5, 2);
    const sharedIp = '203.0.113.7';

    const alice = await fire(limiter, makeReq(sharedIp, tokenFor('alice')), 5);
    const bob = await fire(limiter, makeReq(sharedIp, tokenFor('bob')), 5);

    expect(alice.rejected).toBe(0);
    expect(bob.rejected).toBe(0);
  });

  it('applies the larger user budget to signed-in traffic and the IP budget to anonymous traffic', async () => {
    const limiter = globalLimiter(5, 2);

    const user = await fire(limiter, makeReq('198.51.100.1', tokenFor('carol')), 6);
    const anon = await fire(limiter, makeReq('198.51.100.2'), 3);

    expect(user.rejected).toBe(1);
    expect(user.last.headers['X-RateLimit-Limit']).toBe('5');
    expect(anon.rejected).toBe(1);
    expect(anon.last.headers['X-RateLimit-Limit']).toBe('2');
  });

  it('keys an expired but genuine token to its user, and a forged one to the IP', () => {
    const expired = tokenFor('dave', -60);
    const forged = jwt.sign({ userId: 'dave' }, 'not-our-secret');

    expect(resolveRateLimitKey(makeReq('192.0.2.10', expired))).toBe('user:dave');
    expect(resolveRateLimitKey(makeReq('192.0.2.10', forged))).toBe('ip:192.0.2.10');
    expect(resolveRateLimitKey(makeReq('192.0.2.10'))).toBe('ip:192.0.2.10');
  });

  it('returns a machine-readable 429 the client can back off from', async () => {
    const limiter = globalLimiter(1, 1);

    const { last } = await fire(limiter, makeReq('192.0.2.20', tokenFor('erin')), 2);

    expect(last.statusCode).toBe(429);
    expect(last.body).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
    expect(last.body.retryAfter).toBeGreaterThan(0);
    expect(last.headers['Retry-After']).toBe(String(last.body.retryAfter));
  });
});
