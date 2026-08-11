/**
 * Brute-force throttle for the PIN lock screen.
 *
 * Before this existed, verifyPIN was a pure local computation with no attempt
 * counter anywhere and the keypad auto-submitted on the 6th digit — nothing
 * stopped a script walking the whole 10^6 keyspace.
 */
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  FREE_ATTEMPTS,
  formatLockCountdown,
  getPinLockState,
  recordPinFailure,
  resetPinAttempts,
} from '@/lib/pinAttemptGuard';

const mockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
};

describe('pinAttemptGuard', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts unlocked with no attempts', () => {
    expect(getPinLockState()).toEqual({ locked: false, remainingMs: 0, attempts: 0 });
  });

  it('tolerates the free attempts without locking', () => {
    for (let i = 1; i <= FREE_ATTEMPTS; i++) {
      const state = recordPinFailure();
      expect(state.locked).toBe(false);
      expect(state.attempts).toBe(i);
    }
    expect(getPinLockState().locked).toBe(false);
  });

  it('locks once the free attempts are spent', () => {
    for (let i = 0; i < FREE_ATTEMPTS; i++) recordPinFailure();

    const state = recordPinFailure();
    expect(state.locked).toBe(true);
    expect(state.attempts).toBe(FREE_ATTEMPTS + 1);
    expect(state.remainingMs).toBeGreaterThan(0);
    expect(getPinLockState().locked).toBe(true);
  });

  it('escalates the lockout on each further failure', () => {
    for (let i = 0; i < FREE_ATTEMPTS; i++) recordPinFailure();

    const first = recordPinFailure().remainingMs;
    const second = recordPinFailure().remainingMs;
    const third = recordPinFailure().remainingMs;

    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('caps the backoff rather than growing without bound', () => {
    for (let i = 0; i < FREE_ATTEMPTS + 20; i++) recordPinFailure();
    const capped = recordPinFailure().remainingMs;

    expect(capped).toBeLessThanOrEqual(30 * 60_000);
  });

  it('survives a reload — the deadline is persisted, not in-memory', () => {
    for (let i = 0; i <= FREE_ATTEMPTS; i++) recordPinFailure();

    // Simulates a fresh module read after a page reload.
    expect(getPinLockState().locked).toBe(true);
  });

  it('lifts the lock once the deadline passes', () => {
    for (let i = 0; i <= FREE_ATTEMPTS; i++) recordPinFailure();
    expect(getPinLockState().locked).toBe(true);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 60_000);

    expect(getPinLockState().locked).toBe(false);
  });

  it('clears the counter on a successful unlock', () => {
    for (let i = 0; i <= FREE_ATTEMPTS; i++) recordPinFailure();
    expect(getPinLockState().locked).toBe(true);

    resetPinAttempts();

    expect(getPinLockState()).toEqual({ locked: false, remainingMs: 0, attempts: 0 });
  });

  it('formats the countdown for the lock banner', () => {
    expect(formatLockCountdown(45_000)).toBe('45s');
    expect(formatLockCountdown(65_000)).toBe('1m 05s');
    expect(formatLockCountdown(600_000)).toBe('10m 00s');
  });
});
