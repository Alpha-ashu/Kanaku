/**
 * VAULT LOCK: an outage is not a locked vault.
 *
 * requireVaultUnlock fails CLOSED, which is right when we merely could not read
 * the lock state — the vault holds identity documents and the owner can re-enter
 * their PIN. It is wrong when the lock table itself is unusable: "your vault is
 * locked, enter your PIN" is then both false and unwinnable, because entering
 * the PIN hits the same broken table. The user loops, on every device, with
 * nothing explaining why.
 *
 * Access is denied in both cases. What changes is the reason given, and whether
 * anyone finds out.
 */
import express from 'express';
import request from 'supertest';

const mockGetActiveLock = jest.fn();

jest.mock('../../../../backend/src/db/prisma', () => ({
  prisma: {
    vaultLockSetting: {
      findUnique: (...args: unknown[]) => mockGetActiveLock(...args),
    },
  },
}));

import { requireVaultUnlock } from '../../../../backend/src/features/vault/vault.lock';
import { errorHandler } from '../../../../backend/src/middleware/error';

const buildApp = () => {
  const app = express();
  app.use((req: any, _res, next) => {
    req.user = { id: 'vault-user' };
    next();
  });
  app.get('/vault/documents', requireVaultUnlock, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
};

const prismaError = (code: string, message: string) =>
  Object.assign(new Error(message), { name: 'PrismaClientKnownRequestError', code });

describe('requireVaultUnlock', () => {
  beforeEach(() => mockGetActiveLock.mockReset());

  it('answers 503 — not "locked" — when the lock table is structurally broken', async () => {
    mockGetActiveLock.mockRejectedValue(
      prismaError('P2022', 'The column `vault_lock_settings.pin_length` does not exist in the current database.'),
    );

    const res = await request(buildApp()).get('/vault/documents');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('VAULT_UNAVAILABLE');
    // Telling them to enter a PIN would send them into a loop that cannot win.
    expect(res.body.error).not.toMatch(/pin/i);
  });

  it('still says VAULT_LOCKED for a transient read failure', async () => {
    // A blip is the case failing closed was designed for: deny, and let the
    // owner re-enter their PIN.
    mockGetActiveLock.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const res = await request(buildApp()).get('/vault/documents');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('VAULT_LOCKED');
  });

  it('lets a user with no configured lock straight through', async () => {
    mockGetActiveLock.mockResolvedValue(null);

    const res = await request(buildApp()).get('/vault/documents');

    expect(res.status).toBe(200);
  });

  it('denies a user with a lock and no unlock token', async () => {
    mockGetActiveLock.mockResolvedValue({
      isLockEnabled: true,
      vaultPinHash: 'hash',
      autoLockMinutes: 5,
    });

    const res = await request(buildApp()).get('/vault/documents');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('VAULT_LOCKED');
  });
});
