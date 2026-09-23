import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * awaitVaultUnlock parks a refused request until the lock overlay produces a
 * token. The two things that matter are that it releases when the unlock
 * happens, and that it CANNOT park forever — a request that never resolves is
 * worse than the error it replaced.
 */
describe('awaitVaultUnlock', () => {
  beforeEach(() => {
    vi.resetModules();
    try {
      sessionStorage.clear();
    } catch {
      /* not available in this environment */
    }
  });

  const load = () => import('@/lib/vaultUnlock');

  it('resolves immediately when a token is already held', async () => {
    const { setVaultUnlockToken, awaitVaultUnlock } = await load();
    setVaultUnlockToken('existing-token');

    await expect(awaitVaultUnlock(50)).resolves.toBe(true);
  });

  it('releases waiters when the overlay stores a token', async () => {
    const { setVaultUnlockToken, clearVaultUnlockToken, awaitVaultUnlock } = await load();
    clearVaultUnlockToken();

    const waiting = awaitVaultUnlock(5_000);
    // The overlay's verify lands a moment later.
    setTimeout(() => setVaultUnlockToken('fresh-token'), 10);

    await expect(waiting).resolves.toBe(true);
  });

  it('releases every parked waiter, not just the first', async () => {
    const { setVaultUnlockToken, clearVaultUnlockToken, awaitVaultUnlock } = await load();
    clearVaultUnlockToken();

    const both = Promise.all([awaitVaultUnlock(5_000), awaitVaultUnlock(5_000)]);
    setTimeout(() => setVaultUnlockToken('fresh-token'), 10);

    await expect(both).resolves.toEqual([true, true]);
  });

  it('gives up rather than hanging when nobody unlocks', async () => {
    const { clearVaultUnlockToken, awaitVaultUnlock } = await load();
    clearVaultUnlockToken();

    await expect(awaitVaultUnlock(30)).resolves.toBe(false);
  });

  it('is not released by the lock being cleared', async () => {
    // signalVaultLocked() clears the token. That is a re-lock, not an unlock,
    // and must not be mistaken for one.
    const { clearVaultUnlockToken, signalVaultLocked, awaitVaultUnlock } = await load();
    clearVaultUnlockToken();

    const waiting = awaitVaultUnlock(60);
    signalVaultLocked();

    await expect(waiting).resolves.toBe(false);
  });
});
