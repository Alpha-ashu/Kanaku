import CryptoJS from 'crypto-js';

// Encryption key management
/** Legacy (v1) verifier: an UNSALTED SHA-256 of the PIN. Read-only — see verifyPIN. */
const STORAGE_KEY = 'KANAKU_encrypted_key';
const SALT_KEY = 'KANAKU_salt';
/** Current (v2) verifier: salted PBKDF2-SHA256, format `v2$<iterations>$<hex>`. */
const VERIFIER_KEY = 'KANAKU_pin_verifier';

/**
 * PBKDF2 work factor.
 *
 * The old parameters (10 000 iterations, SHA-1) were weak, but the real break was
 * that the *verifier* skipped PBKDF2 entirely and stored SHA-256(pin). With a
 * 6-digit PIN that is a 10^6 keyspace against an unsalted, single-round hash — a
 * complete rainbow table computes in milliseconds, so anything that could read
 * localStorage (XSS, a shared device, a malicious extension) recovered the PIN
 * outright. Salting + stretching the verifier is what closes that.
 */
const PBKDF2_ITERATIONS = 100_000;
const VERIFIER_VERSION = 'v2';

/**
 * Call this BEFORE localStorage.clear() during signout.
 * Returns the PIN keys and global settings that must survive the clear.
 */
export const backupPINKeys = (): {
  hash: string | null;
  salt: string | null;
  verifier: string | null;
  adminSettings: string | null;
} => ({
  hash: localStorage.getItem(STORAGE_KEY),
  salt: localStorage.getItem(SALT_KEY),
  verifier: localStorage.getItem(VERIFIER_KEY),
  adminSettings: localStorage.getItem('admin_global_feature_settings'),
});

/**
 * Call this AFTER localStorage.clear() during signout.
 * Restores the PIN keys and global settings so they survive logout.
 */
export const restorePINKeys = (backup: {
  hash: string | null;
  salt: string | null;
  verifier?: string | null;
  adminSettings?: string | null;
}): void => {
  if (backup.hash) localStorage.setItem(STORAGE_KEY, backup.hash);
  if (backup.salt) localStorage.setItem(SALT_KEY, backup.salt);
  if (backup.verifier) localStorage.setItem(VERIFIER_KEY, backup.verifier);
  if (backup.adminSettings) localStorage.setItem('admin_global_feature_settings', backup.adminSettings);
};

/**
 * Serialise the local PIN material for the server-side key backup.
 *
 * Wire format is versioned and self-describing:
 *   v2 → `v2|<verifier>|<salt>`   (verifier contains `$`, never `|`)
 *   v1 → `<sha256hash>|<salt>`    (legacy two-part form, still readable)
 *
 * Restoring a v1 backup is fine: verifyPIN accepts a v1 verifier once and
 * rewrites it as v2 on the next successful unlock.
 */
export const serializePINKeyBackup = (): string | null => {
  const salt = localStorage.getItem(SALT_KEY);
  if (!salt) return null;

  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (verifier) return `${VERIFIER_VERSION}|${verifier}|${salt}`;

  const legacyHash = localStorage.getItem(STORAGE_KEY);
  if (legacyHash) return `${legacyHash}|${salt}`;

  return null;
};

/** Inverse of serializePINKeyBackup. Accepts both the v2 and legacy formats. */
export const restorePINKeyBackup = (raw: string | null | undefined): boolean => {
  if (!raw) return false;
  const parts = raw.split('|');

  if (parts.length >= 3 && parts[0] === VERIFIER_VERSION) {
    const [, verifier, salt] = parts;
    if (!verifier || !salt) return false;
    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(SALT_KEY, salt);
    localStorage.removeItem(STORAGE_KEY);
    return true;
  }

  const [legacyHash, salt] = parts;
  if (!legacyHash || !salt) return false;
  localStorage.setItem(STORAGE_KEY, legacyHash);
  localStorage.setItem(SALT_KEY, salt);
  return true;
};

// ── PBKDF2 helpers ───────────────────────────────────────────────────────────

// Explicitly backed by an ArrayBuffer (not ArrayBufferLike) so it satisfies the
// BufferSource that SubtleCrypto expects under TS 5.7+ typed-array generics.
const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  const pairs = hex.match(/.{1,2}/g) || [];
  const bytes = new Uint8Array(new ArrayBuffer(pairs.length));
  pairs.forEach((pair, index) => {
    bytes[index] = parseInt(pair, 16);
  });
  return bytes;
};

const bytesToHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const hasWebCrypto = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.crypto?.subtle &&
  typeof window.crypto.subtle.deriveBits === 'function';

/** PBKDF2 → hex. Uses Web Crypto (off the main thread) with a CryptoJS fallback. */
const pbkdf2Hex = async (
  secret: string,
  saltHex: string,
  iterations: number,
  hash: 'SHA-1' | 'SHA-256',
  bits: number,
): Promise<string> => {
  if (hasWebCrypto()) {
    try {
      const baseKey = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
      );
      const derived = await window.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash },
        baseKey,
        bits,
      );
      return bytesToHex(derived);
    } catch (e) {
      console.warn('Web Crypto PBKDF2 failed, falling back to CryptoJS:', e);
    }
  }

  // Degraded path. It produces byte-identical output to the Web Crypto branch
  // (same UTF-8 password bytes, same hex-decoded salt, same hash, same length) —
  // that equivalence is load-bearing, because a verifier written by one path is
  // later checked by the other, and any mismatch locks the user out of their own
  // account with a PIN they typed correctly. See the "Web Crypto ⇄ CryptoJS
  // agreement" tests.
  //
  // It is also ~20x slower and runs on the main thread (roughly a second per
  // derivation on desktop, several on a phone), so surface it rather than let the
  // app just feel broken. Reaching here means no secure context: Web Crypto's
  // subtle API is unavailable over plain HTTP on a non-localhost origin.
  console.warn(
    '[encryption] Web Crypto unavailable — falling back to CryptoJS PBKDF2. ' +
    'Unlock will be noticeably slower. Serve the app over HTTPS to restore the fast path.',
  );

  return CryptoJS.PBKDF2(secret, CryptoJS.enc.Hex.parse(saltHex), {
    keySize: bits / 32,
    iterations,
    hasher: hash === 'SHA-256' ? CryptoJS.algo.SHA256 : CryptoJS.algo.SHA1,
  }).toString();
};

/**
 * Verifier salt, domain-separated from the master-key salt.
 *
 * The verifier is the value at rest; deriving it from a different salt means
 * recovering it tells an attacker nothing about the key derived from the same
 * PIN, even though both start from `KANAKU_salt`.
 */
const verifierSalt = (saltHex: string): string =>
  CryptoJS.SHA256(`kanaku-pin-verifier|${saltHex}`).toString();

/** Length-independent, early-exit-free string comparison. */
const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const buildVerifier = async (pin: string, saltHex: string): Promise<string> => {
  const digest = await pbkdf2Hex(pin, verifierSalt(saltHex), PBKDF2_ITERATIONS, 'SHA-256', 256);
  return `${VERIFIER_VERSION}$${PBKDF2_ITERATIONS}$${digest}`;
};

const matchesVerifier = async (pin: string, saltHex: string, stored: string): Promise<boolean> => {
  const [version, iterationsRaw, digest] = stored.split('$');
  if (version !== VERIFIER_VERSION || !digest) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  // Honour the stored iteration count so raising PBKDF2_ITERATIONS later does not
  // lock out anyone whose verifier was written under the old cost.
  const candidate = await pbkdf2Hex(pin, verifierSalt(saltHex), iterations, 'SHA-256', 256);
  return constantTimeEquals(candidate, digest);
};

/**
 * Change PIN - verifies old PIN first, then stores the new one.
 * Returns true on success, false if oldPin is wrong.
 */
export const changePIN = async (oldPin: string, newPin: string): Promise<boolean> => {
  const { isValid } = await verifyPIN(oldPin);
  if (!isValid) return false;
  await storeMasterKey(newPin);
  return true;
};

/**
 * Generate encryption key from PIN
 */
export const generateKeyFromPIN = async (pin: string, salt?: string): Promise<string> => {
  const useSalt = salt || CryptoJS.lib.WordArray.random(128 / 8).toString();

  if (!salt) {
    // Store salt for future use
    localStorage.setItem(SALT_KEY, useSalt);
  }

  // SHA-256 at PBKDF2_ITERATIONS, upgraded from SHA-1 at 10 000.
  //
  // Safe to change: this key is handed to SecurityContext and parked in
  // sessionStorage, but nothing currently decrypts with it (encryptForStorage /
  // decryptForStorage have no callers), so there is no ciphertext at rest tied to
  // the old parameters. Getting the derivation right now means at-rest encryption
  // can be switched on later without a second migration.
  return pbkdf2Hex(pin, useSalt, PBKDF2_ITERATIONS, 'SHA-256', 256);
};

/**
 * Encrypt data
 */
export const encryptData = (data: any, key: string): string => {
  const jsonString = JSON.stringify(data);
  const encrypted = CryptoJS.AES.encrypt(jsonString, key);
  return encrypted.toString();
};

/**
 * Decrypt data
 */
export const decryptData = (encryptedData: string, key: string): any => {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, key);
    const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
};

/**
 * Legacy (v1) PIN hash — unsalted SHA-256.
 *
 * @deprecated Retained ONLY so an existing v1 verifier can be checked once and
 * transparently upgraded (see verifyPIN). Never write this value.
 */
export const hashPIN = (pin: string): string => {
  return CryptoJS.SHA256(pin).toString();
};

/**
 * Store the PIN verifier and return the derived master key.
 */
export const storeMasterKey = async (pin: string): Promise<string> => {
  const salt = localStorage.getItem(SALT_KEY) || CryptoJS.lib.WordArray.random(128 / 8).toString();
  localStorage.setItem(SALT_KEY, salt);

  const key = await generateKeyFromPIN(pin, salt);

  localStorage.setItem(VERIFIER_KEY, await buildVerifier(pin, salt));
  // Drop any v1 hash so the weak value does not linger next to the strong one.
  localStorage.removeItem(STORAGE_KEY);

  return key;
};

/**
 * Verify PIN and return the encryption key.
 *
 * Accepts a v1 (unsalted SHA-256) verifier exactly once, then rewrites it as v2
 * in place — so existing installs upgrade on their next successful unlock
 * without anyone having to re-enter or reset a PIN.
 */
export const verifyPIN = async (pin: string): Promise<{ isValid: boolean; key?: string }> => {
  const salt = localStorage.getItem(SALT_KEY);
  if (!salt) {
    return { isValid: false };
  }

  const storedVerifier = localStorage.getItem(VERIFIER_KEY);
  if (storedVerifier) {
    if (!(await matchesVerifier(pin, salt, storedVerifier))) {
      return { isValid: false };
    }
    return { isValid: true, key: await generateKeyFromPIN(pin, salt) };
  }

  // ── v1 → v2 migration path ──
  const legacyHash = localStorage.getItem(STORAGE_KEY);
  if (!legacyHash) {
    return { isValid: false };
  }

  if (!constantTimeEquals(hashPIN(pin), legacyHash)) {
    return { isValid: false };
  }

  localStorage.setItem(VERIFIER_KEY, await buildVerifier(pin, salt));
  localStorage.removeItem(STORAGE_KEY);

  return { isValid: true, key: await generateKeyFromPIN(pin, salt) };
};

/**
 * Check if PIN is set
 */
export const isPINSet = (): boolean => {
  return !!localStorage.getItem(VERIFIER_KEY) || !!localStorage.getItem(STORAGE_KEY);
};

/**
 * Clear all security data (logout/reset)
 */
export const clearSecurityData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(SALT_KEY);
  sessionStorage.clear();
};

/**
 * Encrypt object for IndexedDB storage
 */
export const encryptForStorage = (obj: any, encryptionKey: string): any => {
  // Don't encrypt id and metadata fields
  const { id, createdAt, ...dataToEncrypt } = obj;

  const encrypted = encryptData(dataToEncrypt, encryptionKey);

  return {
    id,
    createdAt,
    encryptedData: encrypted,
    isEncrypted: true,
  };
};

/**
 * Decrypt object from IndexedDB storage
 */
export const decryptFromStorage = (obj: any, encryptionKey: string): any => {
  if (!obj.isEncrypted) {
    return obj; // Not encrypted, return as-is
  }

  const decrypted = decryptData(obj.encryptedData, encryptionKey);

  return {
    id: obj.id,
    createdAt: obj.createdAt,
    ...decrypted,
  };
};
