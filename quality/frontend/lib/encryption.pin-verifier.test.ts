/**
 * PIN verifier: v2 (salted PBKDF2-SHA256) behaviour and the one-way v1 migration.
 *
 * The v1 verifier was an UNSALTED SHA-256 of a 6-digit PIN — a 10^6 keyspace
 * against a single-round hash, recoverable from localStorage in milliseconds.
 * These tests pin down both that the replacement rejects wrong PINs and, just as
 * importantly, that existing installs are NOT locked out: a v1 verifier must
 * still unlock once and be silently rewritten as v2.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CryptoJS from 'crypto-js';
import {
  clearSecurityData,
  isPINSet,
  restorePINKeyBackup,
  serializePINKeyBackup,
  storeMasterKey,
  verifyPIN,
} from '@/lib/encryption';

const LEGACY_VERIFIER_KEY = 'KANAKU_encrypted_key';
const VERIFIER_KEY = 'KANAKU_pin_verifier';
const SALT_KEY = 'KANAKU_salt';

// Matches the stub convention used by the other suites in this directory.
const mockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
    snapshot: () => ({ ...store }),
  };
};

const installStorage = () => {
  const ls = mockLocalStorage();
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('sessionStorage', mockLocalStorage());
  return ls;
};

/** Everything currently persisted, as one searchable string. */
const dumpStorage = (ls: ReturnType<typeof mockLocalStorage>) =>
  JSON.stringify(ls.snapshot());

const seedLegacyInstall = (pin: string) => {
  localStorage.setItem(SALT_KEY, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
  localStorage.setItem(LEGACY_VERIFIER_KEY, CryptoJS.SHA256(pin).toString());
};

describe('PIN verifier (v2, salted PBKDF2)', () => {
  let ls: ReturnType<typeof mockLocalStorage>;
  beforeEach(() => { ls = installStorage(); });

  it('accepts the correct PIN and rejects a wrong one', async () => {
    await storeMasterKey('284617');

    await expect(verifyPIN('284617')).resolves.toMatchObject({ isValid: true });
    await expect(verifyPIN('284618')).resolves.toEqual({ isValid: false });
  });

  it('never stores the raw PIN or its unsalted SHA-256', async () => {
    const pin = '284617';
    await storeMasterKey(pin);

    const stored = dumpStorage(ls);
    expect(stored).not.toContain(pin);
    // The v1 break: SHA256(pin) is table-lookupable for a 6-digit PIN.
    expect(stored).not.toContain(CryptoJS.SHA256(pin).toString());
    expect(localStorage.getItem(LEGACY_VERIFIER_KEY)).toBeNull();
  });

  it('derives a different verifier for the same PIN under a different salt', async () => {
    await storeMasterKey('284617');
    const first = localStorage.getItem(VERIFIER_KEY);

    localStorage.clear();
    localStorage.setItem(SALT_KEY, 'ffffffffffffffffffffffffffffffff');
    await storeMasterKey('284617');

    expect(localStorage.getItem(VERIFIER_KEY)).not.toBe(first);
  });

  it('returns a stable master key across verifications', async () => {
    const created = await storeMasterKey('284617');
    const verified = await verifyPIN('284617');

    expect(verified.isValid).toBe(true);
    expect(verified.key).toBe(created);
  });
});

describe('v1 → v2 migration', () => {
  beforeEach(() => { installStorage(); });

  it('unlocks a legacy install and rewrites the verifier as v2', async () => {
    seedLegacyInstall('284617');
    expect(isPINSet()).toBe(true);

    const result = await verifyPIN('284617');

    expect(result.isValid).toBe(true);
    expect(result.key).toBeTruthy();
    // Upgraded in place: v2 written, weak v1 hash removed.
    expect(localStorage.getItem(VERIFIER_KEY)).toMatch(/^v2\$\d+\$[0-9a-f]+$/);
    expect(localStorage.getItem(LEGACY_VERIFIER_KEY)).toBeNull();
  });

  it('rejects a wrong PIN against a legacy install without upgrading it', async () => {
    seedLegacyInstall('284617');

    await expect(verifyPIN('111111')).resolves.toEqual({ isValid: false });

    expect(localStorage.getItem(VERIFIER_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_VERIFIER_KEY)).not.toBeNull();
  });

  it('still verifies on the second unlock, after the upgrade', async () => {
    seedLegacyInstall('284617');

    await verifyPIN('284617');
    await expect(verifyPIN('284617')).resolves.toMatchObject({ isValid: true });
    await expect(verifyPIN('284618')).resolves.toEqual({ isValid: false });
  });

  it('fails closed when the salt is missing', async () => {
    localStorage.setItem(LEGACY_VERIFIER_KEY, CryptoJS.SHA256('284617').toString());

    await expect(verifyPIN('284617')).resolves.toEqual({ isValid: false });
  });
});

describe('Web Crypto ⇄ CryptoJS agreement', () => {
  /**
   * The verifier is written once and checked later, potentially by the OTHER
   * derivation path (Web Crypto is primary; CryptoJS is the fallback when
   * subtle.deriveBits is missing or throws). If the two disagree by even one
   * byte, a user whose browser takes a different path on a later launch is
   * permanently locked out of their own account with a "wrong PIN" they typed
   * correctly. This asserts the paths are interchangeable.
   *
   * (The pre-existing implementation did NOT satisfy this: Web Crypto hex-decoded
   * the salt while the CryptoJS fallback passed the same string through as UTF-8
   * text, so the two produced different keys for identical inputs.)
   */
  // The CryptoJS fallback runs ~20x slower than Web Crypto and these cases force
  // it deliberately, several derivations per test.
  const FALLBACK_TIMEOUT_MS = 60_000;

  const withoutWebCrypto = async (fn: () => Promise<void>) => {
    const original = Object.getOwnPropertyDescriptor(window, 'crypto');
    Object.defineProperty(window, 'crypto', { value: undefined, configurable: true });
    try {
      await fn();
    } finally {
      if (original) Object.defineProperty(window, 'crypto', original);
    }
  };

  it('verifies a Web-Crypto-written verifier using the CryptoJS fallback', async () => {
    installStorage();
    // Written with whatever the environment provides (Web Crypto when present).
    await storeMasterKey('284617');
    const writtenVerifier = localStorage.getItem(VERIFIER_KEY);

    await withoutWebCrypto(async () => {
      await expect(verifyPIN('284617')).resolves.toMatchObject({ isValid: true });
      await expect(verifyPIN('284618')).resolves.toEqual({ isValid: false });
    });

    // Verification must not have rewritten it — the value is genuinely identical.
    expect(localStorage.getItem(VERIFIER_KEY)).toBe(writtenVerifier);
  }, FALLBACK_TIMEOUT_MS);

  it('verifies a CryptoJS-written verifier using Web Crypto', async () => {
    installStorage();
    await withoutWebCrypto(async () => {
      await storeMasterKey('284617');
    });

    await expect(verifyPIN('284617')).resolves.toMatchObject({ isValid: true });
    await expect(verifyPIN('999999')).resolves.toEqual({ isValid: false });
  }, FALLBACK_TIMEOUT_MS);

  it('derives an identical master key on both paths', async () => {
    installStorage();
    const viaPrimary = await storeMasterKey('284617');

    let viaFallback = '';
    await withoutWebCrypto(async () => {
      const result = await verifyPIN('284617');
      viaFallback = result.key ?? '';
    });

    expect(viaFallback).toBe(viaPrimary);
    expect(viaFallback).toHaveLength(64);
  }, FALLBACK_TIMEOUT_MS);
});

describe('server key backup round-trip', () => {
  beforeEach(() => { installStorage(); });

  it('round-trips a v2 install through the backup payload', async () => {
    await storeMasterKey('284617');
    const payload = serializePINKeyBackup();
    expect(payload).toMatch(/^v2\|v2\$\d+\$[0-9a-f]+\|[0-9a-f]+$/);

    clearSecurityData();
    expect(isPINSet()).toBe(false);

    expect(restorePINKeyBackup(payload)).toBe(true);
    await expect(verifyPIN('284617')).resolves.toMatchObject({ isValid: true });
  });

  it('restores a legacy two-part backup and upgrades it on unlock', async () => {
    const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const legacyPayload = `${CryptoJS.SHA256('284617').toString()}|${salt}`;

    expect(restorePINKeyBackup(legacyPayload)).toBe(true);
    await expect(verifyPIN('284617')).resolves.toMatchObject({ isValid: true });
    expect(localStorage.getItem(VERIFIER_KEY)).toMatch(/^v2\$/);
  });

  it('ignores an empty or malformed payload', () => {
    expect(restorePINKeyBackup(null)).toBe(false);
    expect(restorePINKeyBackup('')).toBe(false);
    expect(restorePINKeyBackup('no-separator')).toBe(false);
  });
});
