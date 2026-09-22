/**
 * AUTH RATE-LIMIT KEYING
 *
 * The auth limiters used to key on `req.ip`. The browser build reaches this
 * backend through Vercel's rewrite, so `req.ip` is the Vercel edge address for
 * every web visitor — one shared bucket for the entire web user base, at 5
 * logins/min and 10 sign-ups/hour. That is why people could not log in or
 * register and saw "You are doing that too fast".
 *
 * These tests pin the two halves of the fix:
 *   - the per-ACCOUNT budget is still enforced (brute force is still stopped,
 *     and now it cannot be evaded by rotating IPs either), and
 *   - a second account from the SAME IP is unaffected by the first's spend.
 */

// Must be set before the app (and therefore auth.routes.ts, which reads these
// at module load) is required. setup.ts relaxes the limits for other suites, so
// overwrite unconditionally rather than defaulting.
process.env.FORCE_RATE_LIMIT = 'true';
process.env.LOGIN_RATE_LIMIT = '5';
process.env.LOGIN_IP_RATE_LIMIT = '100';
process.env.AUTH_RATE_LIMIT = '20';
process.env.AUTH_IP_RATE_LIMIT = '400';

import type { Express } from 'express';
import request from 'supertest';

const API = '/api/v1';

// One fixed source address for every request below: the point is that a shared
// address no longer means a shared budget.
const SHARED_PROXY_IP = { 'X-Forwarded-For': '76.76.21.100' };

let app: Express;

const attemptLogin = (email: string) =>
  request(app)
    .post(`${API}/auth/login/challenge`)
    .set(SHARED_PROXY_IP)
    .send({ email, password: 'not-the-real-password' });

describe('Auth rate limiting is keyed by account, not by proxy IP', () => {
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    app = require('../../../../backend/src/app').app;
  });

  it('still throttles repeated attempts against ONE account', async () => {
    const victim = `brute-target-${Date.now()}@example.com`;

    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      statuses.push((await attemptLogin(victim)).status);
    }

    // The budget is 5/min for this account; attempts beyond it must be refused.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT throttle a different account from the same IP', async () => {
    // The previous test has already exhausted this IP's login budget under the
    // old per-IP scheme. A different user on the same corporate/carrier/edge
    // address must still be able to sign in.
    const bystander = `bystander-${Date.now()}@example.com`;

    const res = await attemptLogin(bystander);

    expect(res.status).not.toBe(429);
    expect(res.body?.code).not.toBe('RATE_LIMIT_EXCEEDED');
  });

  it('a 429 carries the machine-readable code and retry hint', async () => {
    const victim = `brute-code-${Date.now()}@example.com`;

    let limited: request.Response | undefined;
    for (let i = 0; i < 8 && !limited; i += 1) {
      const res = await attemptLogin(victim);
      if (res.status === 429) limited = res;
    }

    expect(limited).toBeDefined();
    expect(limited!.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(typeof limited!.body.retryAfter).toBe('number');
    expect(limited!.headers['retry-after']).toBeDefined();
  });
});
