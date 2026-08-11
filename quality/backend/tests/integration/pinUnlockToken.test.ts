/**
 * PIN-unlock token: the mechanism that makes the server-side PIN gate work
 * without Redis.
 *
 * Background: the gate previously kept its unlock marker in a per-process Map
 * (Redis having been removed from the codebase), which meant every restart —
 * and Render's free plan sleeps after 15 min idle — silently re-locked every
 * user, and any second instance disagreed with the first. Both push a 403 at a
 * client that believes it is unlocked. The unlock is now a short-lived signed
 * token, so these tests pin down the properties that make it safe to enable.
 *
 * Pure unit tests: no DB needed for the token path, which is deliberate — that
 * is the whole point of making it stateless.
 */
import jwt from 'jsonwebtoken';

const SECRET = 'test-pin-unlock-secret-value-at-least-32-chars';

/** Loads pinUnlock with a controlled env (module reads config at import time). */
const loadModule = async (env: Record<string, string | undefined>) => {
  jest.resetModules();
  const previous = { ...process.env };
  Object.assign(process.env, env);
  // The module short-circuits when NODE_ENV === 'test'; these tests exercise the
  // enabled path, so they run as 'production' with an explicit secret.
  const mod = await import('../../../../backend/src/security/pinUnlock');
  return {
    mod,
    restore: () => {
      process.env = previous;
    },
  };
};

const enabledEnv = {
  NODE_ENV: 'production',
  PIN_GATE_ENABLED: 'true',
  PIN_GATE_TIMEOUT_MINUTES: '5',
  SECURITY_JWT_SECRET: SECRET,
};

describe('pinUnlock — gate toggle', () => {
  it('is inert unless PIN_GATE_ENABLED is exactly "true"', async () => {
    const { mod, restore } = await loadModule({ ...enabledEnv, PIN_GATE_ENABLED: 'false' });
    try {
      expect(mod.isPinGateEnabled()).toBe(false);
      // Disabled means fail-open: no token minted, every request allowed.
      expect(mod.issuePinUnlockToken('user-1')).toBeNull();
      await expect(mod.evaluatePinUnlockRequest('user-1', undefined))
        .resolves.toMatchObject({ unlocked: true });
    } finally {
      restore();
    }
  });

  it('never enables itself under NODE_ENV=test', async () => {
    const { mod, restore } = await loadModule({ ...enabledEnv, NODE_ENV: 'test' });
    try {
      expect(mod.isPinGateEnabled()).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('pinUnlock — token issue and verify', () => {
  it('issues a token that verifies for its own user', async () => {
    const { mod, restore } = await loadModule(enabledEnv);
    try {
      const token = mod.issuePinUnlockToken('user-1');
      expect(token).toBeTruthy();
      expect(mod.verifyPinUnlockToken(token!, 'user-1')).toBe(true);
    } finally {
      restore();
    }
  });

  it('rejects a token belonging to a different user', async () => {
    const { mod, restore } = await loadModule(enabledEnv);
    try {
      const token = mod.issuePinUnlockToken('user-1')!;
      // The whole point of binding `sub`: one unlocked account must not open
      // another's financial data.
      expect(mod.verifyPinUnlockToken(token, 'user-2')).toBe(false);
    } finally {
      restore();
    }
  });

  it('rejects a token signed with a different secret', async () => {
    const { mod, restore } = await loadModule(enabledEnv);
    try {
      const forged = jwt.sign({ sub: 'user-1', type: 'pin_unlock' }, 'attacker-secret', {
        expiresIn: '5m',
      });
      expect(mod.verifyPinUnlockToken(forged, 'user-1')).toBe(false);
    } finally {
      restore();
    }
  });

  it('rejects a token of the wrong type', async () => {
    const { mod, restore } = await loadModule(enabledEnv);
    try {
      // A step-up security token is signed with the SAME secret by design, so
      // the `type` claim is what stops it being replayed as an unlock.
      const wrongType = jwt.sign({ sub: 'user-1', type: 'security_verification' }, SECRET, {
        expiresIn: '5m',
      });
      expect(mod.verifyPinUnlockToken(wrongType, 'user-1')).toBe(false);
    } finally {
      restore();
    }
  });

  it('rejects an expired token', async () => {
    const { mod, restore } = await loadModule(enabledEnv);
    try {
      const expired = jwt.sign({ sub: 'user-1', type: 'pin_unlock' }, SECRET, { expiresIn: -10 });
      expect(mod.verifyPinUnlockToken(expired, 'user-1')).toBe(false);
    } finally {
      restore();
    }
  });

  it('treats missing/garbage tokens as absent rather than throwing', async () => {
    const { mod, restore } = await loadModule(enabledEnv);
    try {
      expect(mod.verifyPinUnlockToken(undefined, 'user-1')).toBe(false);
      expect(mod.verifyPinUnlockToken('not-a-jwt', 'user-1')).toBe(false);
      expect(mod.verifyPinUnlockToken('', 'user-1')).toBe(false);
    } finally {
      restore();
    }
  });

  it('honours the configured window', async () => {
    const { mod, restore } = await loadModule({ ...enabledEnv, PIN_GATE_TIMEOUT_MINUTES: '15' });
    try {
      const token = mod.issuePinUnlockToken('user-1')!;
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      const lifetime = (decoded.exp! - decoded.iat!) * 1000;
      expect(lifetime).toBe(15 * 60 * 1000);
      expect(mod.getPinGateWindowMs()).toBe(15 * 60 * 1000);
    } finally {
      restore();
    }
  });

  it('clamps a nonsensically small window to a floor', async () => {
    const { mod, restore } = await loadModule({ ...enabledEnv, PIN_GATE_TIMEOUT_MINUTES: '0' });
    try {
      // 0 would mint already-dead tokens and lock everyone out instantly.
      expect(mod.getPinGateWindowMs()).toBeGreaterThanOrEqual(60_000);
    } finally {
      restore();
    }
  });
});

describe('pinUnlock — request evaluation and sliding', () => {
  it('accepts a valid token and returns a refreshed one', async () => {
    const { mod, restore } = await loadModule(enabledEnv);
    try {
      const token = mod.issuePinUnlockToken('user-1')!;
      const result = await mod.evaluatePinUnlockRequest('user-1', token);

      expect(result.unlocked).toBe(true);
      // The refreshed token is what slides the window — without it an actively
      // used app would still be re-prompted every PIN_GATE_TIMEOUT_MINUTES.
      expect(result.refreshedToken).toBeTruthy();
      expect(mod.verifyPinUnlockToken(result.refreshedToken!, 'user-1')).toBe(true);
    } finally {
      restore();
    }
  });

  it('extends the deadline on each accepted request', async () => {
    const { mod, restore } = await loadModule(enabledEnv);
    try {
      const original = mod.issuePinUnlockToken('user-1')!;
      const originalExp = (jwt.decode(original) as jwt.JwtPayload).exp!;

      // jwt exp has 1-second granularity, so advance real time past a tick.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const { refreshedToken } = await mod.evaluatePinUnlockRequest('user-1', original);
      const refreshedExp = (jwt.decode(refreshedToken!) as jwt.JwtPayload).exp!;

      expect(refreshedExp).toBeGreaterThan(originalExp);
    } finally {
      restore();
    }
  });

  it('does not accept another user\'s token', async () => {
    const { mod, restore } = await loadModule(enabledEnv);
    try {
      const otherToken = mod.issuePinUnlockToken('user-2')!;
      // Falls through to the DB fallback, which fails open only on error — with
      // no matching record this must not unlock.
      const result = await mod.evaluatePinUnlockRequest('user-1', otherToken);
      expect(result.refreshedToken).not.toBe(otherToken);
    } finally {
      restore();
    }
  });
});
