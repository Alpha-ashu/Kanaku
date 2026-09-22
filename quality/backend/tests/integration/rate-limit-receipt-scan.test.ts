/**
 * A receipt scan must not rate-limit itself.
 *
 * The limiter on `/api/v1/receipts` is sized for STARTING scans (8/min), but it
 * is mounted on a path prefix, so it also counted the status polls of the scan
 * it had just authorised. The client polls every 700ms for the first six
 * seconds, so one 30-second scan spent ~24 requests against a budget of 8: the
 * user hit "You're doing this too fast" a few seconds into their FIRST receipt,
 * and the half-finished scan left the screen stuck.
 *
 * These tests reproduce the polling pattern rather than asserting on the
 * configured numbers, so they keep failing if the limits drift back under what
 * the client actually does.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';

const API = '/api/v1';

/** Mirrors pollDelayMs() in frontend/src/services/cloudReceiptScanService.ts. */
const pollDelayMs = (elapsedMs: number): number => {
  if (elapsedMs < 6_000) return 700;
  if (elapsedMs < 20_000) return 1_500;
  if (elapsedMs < 60_000) return 2_500;
  return 4_000;
};

/** How many status polls the client issues during a scan of `seconds`. */
const pollsDuring = (seconds: number): number => {
  let elapsed = 0;
  let polls = 0;
  while (elapsed < seconds * 1_000) {
    polls += 1;
    elapsed += pollDelayMs(elapsed);
  }
  return polls;
};

describe('Receipt scanning does not trip its own rate limit', () => {
  let app: any;
  const userId = 'rate-limit-scan-user';
  let token: string;

  beforeAll(async () => {
    // The limiters short-circuit outside production unless forced, so turn them
    // on for this file only — the whole point is to exercise them.
    process.env.FORCE_RATE_LIMIT = 'true';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
    token = jwt.sign(
      { userId, id: userId, email: `${userId}@test.local`, role: 'user', isApproved: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );
    // Imported AFTER the flag is set: app.ts reads it while building middleware.
    ({ app } = await import('../../../../backend/src/app'));
  });

  afterAll(() => {
    delete process.env.FORCE_RATE_LIMIT;
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('polls a 30s scan without a 429 from the receipts limiter', async () => {
    const polls = pollsDuring(30);
    // Guards the premise: if the client's pacing changes, this number moves and
    // the test still measures the real thing.
    expect(polls).toBeGreaterThan(8);

    const statuses: number[] = [];
    for (let i = 0; i < polls; i++) {
      const res = await request(app)
        .get(`${API}/receipts/status/job-${i}`)
        .set(auth());
      statuses.push(res.status);
    }

    // A missing job (404) or a gate (403) is fine — this asserts only that the
    // client is never told it is going too fast for polling its own scan.
    expect(statuses.filter((s) => s === 429)).toHaveLength(0);
  });

  it('survives two receipts scanned back to back', async () => {
    const perScan = pollsDuring(10);
    const statuses: number[] = [];

    // Interleaved, the way two concurrent scans actually poll.
    for (let i = 0; i < perScan; i++) {
      for (const job of ['job-a', 'job-b']) {
        const res = await request(app).get(`${API}/receipts/status/${job}-${i}`).set(auth());
        statuses.push(res.status);
      }
    }

    expect(statuses.filter((s) => s === 429)).toHaveLength(0);
  });

  it('still limits repeated scan STARTS, which is what the budget is for', async () => {
    // The protection must survive the fix: starting scans is the expensive
    // operation and stays capped.
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post(`${API}/receipts/start`)
        .set(auth())
        .attach('file', Buffer.from('not-a-real-image'), 'receipt.jpg');
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  });

  it('does not let listing bills consume the upload budget', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await request(app).get(`${API}/bills`).set(auth());
      statuses.push(res.status);
    }

    expect(statuses.filter((s) => s === 429)).toHaveLength(0);
  });
});
