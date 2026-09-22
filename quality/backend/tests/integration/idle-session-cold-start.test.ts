/**
 * IDLE SESSION COLD-START GRACE (§3 "users are not randomly logged out")
 *
 * A missing idle marker is ambiguous, and the two readings demand opposite
 * responses: "this user was not seen inside the window" means end the session;
 * "this process has never seen anyone" means say nothing about them.
 *
 * With a durable store only the first is possible. Redis is permanently gone
 * from this codebase (config/redis-connections.ts returns null by design), so
 * markers live in a process-local Map — and the API runs on Render's free plan,
 * which spins down on inactivity and cold-starts. Every restart therefore
 * emptied the map for every user at once, and the old code read that as "all of
 * you have been idle."
 *
 * These tests pin BOTH sides: the grace must apply right after boot, and it
 * must stop applying once the process has actually watched a full window —
 * otherwise the control is permanently disabled rather than merely delayed.
 */

// A sub-second window so real elapsed time can cross it. Must be set before the
// module is required: the timeout is read once, at module load.
const WINDOW_MS = 1200;

describe('evaluateIdleSession cold-start grace', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTimeout = process.env.IDLE_TIMEOUT_MINUTES;

  let idleSession: typeof import('../../../../backend/src/security/idleSession');

  beforeAll(() => {
    // The module short-circuits to "enabled: false" under NODE_ENV=test, which
    // would make every assertion below vacuously pass.
    process.env.NODE_ENV = 'development';
    process.env.IDLE_TIMEOUT_MINUTES = String(WINDOW_MS / 60_000);

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      idleSession = require('../../../../backend/src/security/idleSession');
    });
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalTimeout === undefined) delete process.env.IDLE_TIMEOUT_MINUTES;
    else process.env.IDLE_TIMEOUT_MINUTES = originalTimeout;
  });

  it('is actually enabled, or the rest of this file proves nothing', () => {
    expect(idleSession.isIdleTimeoutEnabled()).toBe(true);
  });

  it('adopts a user with no marker and a STALE token right after boot', async () => {
    // Exactly the spin-down case: the access token is older than the idle
    // window, and the process has no memory of anyone. Before the fix this
    // returned false and the request was rejected.
    const staleIat = Math.floor((Date.now() - WINDOW_MS * 10) / 1000);

    const allowed = await idleSession.evaluateIdleSession('cold-start-user', {
      allowFreshTokenGrace: true,
      iatSeconds: staleIat,
    });

    expect(allowed).toBe(true);
  });

  it('still admits a freshly issued token (unchanged behaviour)', async () => {
    const allowed = await idleSession.evaluateIdleSession('fresh-token-user', {
      allowFreshTokenGrace: true,
      iatSeconds: Math.floor(Date.now() / 1000),
    });
    expect(allowed).toBe(true);
  });

  it('stops granting grace once the process has watched a full window', async () => {
    // Wait out the window so process uptime exceeds it. From here a missing
    // marker genuinely does mean the user was not seen, and the control must
    // bite — otherwise the fix has simply disabled idle enforcement forever.
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 300));

    const staleIat = Math.floor((Date.now() - WINDOW_MS * 10) / 1000);
    const allowed = await idleSession.evaluateIdleSession('steady-state-user', {
      allowFreshTokenGrace: true,
      iatSeconds: staleIat,
    });

    expect(allowed).toBe(false);
  });

  it('keeps honouring an established session after the grace expires', async () => {
    // The user adopted at boot must not be evicted the moment grace ends — the
    // marker written for them is what carries the session forward.
    await idleSession.establishIdleSession('established-user');

    const allowed = await idleSession.evaluateIdleSession('established-user', {
      allowFreshTokenGrace: false,
    });

    expect(allowed).toBe(true);
  });
});
