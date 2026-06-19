/**
 * Application-level cryptography for data at rest.
 *
 * Used to protect Account Aggregator (AA) statements, KYC artefacts, and
 * any other PII that must remain encrypted in Postgres even if the DB is
 * compromised. Algorithm: **AES-256-GCM** with a per-user Data Encryption
 * Key (DEK) derived from a single Root Key via HKDF-SHA-256.
 *
 * Key model:
 *
 *   ENV: AA_ENCRYPTION_ROOT_KEY  (32 bytes / 64 hex chars)
 *          │
 *          ▼  HKDF-SHA-256(salt=userId, info="kanaku/aa/v1")
 *     per-user DEK (32 bytes)
 *          │
 *          ▼  AES-256-GCM(iv=12B random, aad=optional)
 *     ciphertext + authTag
 *
 * Wire format:  base64( iv ‖ tag ‖ ciphertext )
 *
 * Rotation strategy:
 *   - Prefix every payload with a one-byte version (`0x01`) so we can
 *     introduce v2 (e.g. KMS-wrapped per-user DEKs) without breaking
 *     decryption of existing rows.
 *   - On rotation, scan and re-encrypt rows lazily on read.
 *
 * Tamper protection:
 *   - GCM authentication tag is verified on every decrypt; tampering
 *     causes `decryptForUser` to throw.
 *   - Optional `aad` parameter lets callers bind a ciphertext to a
 *     specific (userId, recordId) pair so swapping rows is detectable.
 *
 * If `AA_ENCRYPTION_ROOT_KEY` is missing, all encrypt/decrypt calls
 * throw — never silently store plaintext in production.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

const VERSION_BYTE = 0x01;
const IV_LENGTH = 12;        // 96-bit nonce, recommended for GCM.
const TAG_LENGTH = 16;       // 128-bit authentication tag.
const KEY_LENGTH = 32;       // AES-256.
const HKDF_INFO_AA = 'kanaku/aa/v1';

let cachedRootKey: Buffer | null = null;

const getRootKey = (): Buffer => {
  if (cachedRootKey) return cachedRootKey;

  const hex = process.env.AA_ENCRYPTION_ROOT_KEY;
  if (!hex) {
    throw new Error(
      'AA_ENCRYPTION_ROOT_KEY is not configured. Cannot encrypt/decrypt at-rest payloads. ' +
        'Generate one with: node -e "console.log(require(\\"crypto\\").randomBytes(32).toString(\\"hex\\"))"',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('AA_ENCRYPTION_ROOT_KEY must be 64 hex chars (32 bytes).');
  }

  cachedRootKey = Buffer.from(hex, 'hex');
  return cachedRootKey;
};

/**
 * Derive a per-user 32-byte DEK from the root key. Pure function;
 * derivation is deterministic so the same user always gets the same DEK
 * (until root-key rotation). HKDF is cheap (~microseconds) so we do not
 * cache derived keys.
 */
const deriveUserKey = (userId: string, info = HKDF_INFO_AA): Buffer => {
  if (!userId) throw new Error('deriveUserKey: userId is required');
  const root = getRootKey();
  // Note: hkdfSync returns an ArrayBuffer in older Node typings; wrap it.
  const okm = hkdfSync('sha256', root, Buffer.from(userId, 'utf8'), Buffer.from(info, 'utf8'), KEY_LENGTH);
  return Buffer.from(okm);
};

export interface EncryptOptions {
  /** Optional additional authenticated data — bind ciphertext to context. */
  aad?: string | Buffer;
  /** Override the HKDF info tag (advanced; do not use unless rotating). */
  info?: string;
}

/**
 * Encrypt `plaintext` for a specific user. Output is base64-encoded and
 * self-describes its version + IV + tag, so the caller need not store
 * anything else alongside it.
 */
export const encryptForUser = (
  userId: string,
  plaintext: string | Buffer,
  options: EncryptOptions = {},
): string => {
  const key = deriveUserKey(userId, options.info);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  if (options.aad) {
    cipher.setAAD(typeof options.aad === 'string' ? Buffer.from(options.aad, 'utf8') : options.aad);
  }

  const ptBuf = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const encrypted = Buffer.concat([cipher.update(ptBuf), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Layout: [version(1) | iv(12) | tag(16) | ciphertext(n)]
  const packed = Buffer.concat([Buffer.from([VERSION_BYTE]), iv, tag, encrypted]);
  return packed.toString('base64');
};

/**
 * Decrypt a payload produced by `encryptForUser`. Throws if:
 *   - the version byte is unknown (forward-compat protection),
 *   - the auth tag fails (ciphertext or AAD has been tampered with),
 *   - the root key has been rotated and no longer derives the old DEK.
 */
export const decryptForUser = (
  userId: string,
  payload: string,
  options: EncryptOptions = {},
): string => {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 1 + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('decryptForUser: payload too short');
  }

  const version = buf.readUInt8(0);
  if (version !== VERSION_BYTE) {
    throw new Error(`decryptForUser: unknown payload version 0x${version.toString(16)}`);
  }

  const iv = buf.subarray(1, 1 + IV_LENGTH);
  const tag = buf.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(1 + IV_LENGTH + TAG_LENGTH);

  const key = deriveUserKey(userId, options.info);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  if (options.aad) {
    decipher.setAAD(typeof options.aad === 'string' ? Buffer.from(options.aad, 'utf8') : options.aad);
  }

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
};

/**
 * Convenience wrapper for JSON values — automatically serializes and
 * parses, so callers can persist structured AA records without manual
 * JSON.stringify everywhere.
 */
export const encryptJsonForUser = (userId: string, value: unknown, options?: EncryptOptions): string =>
  encryptForUser(userId, JSON.stringify(value ?? null), options);

export const decryptJsonForUser = <T = unknown>(userId: string, payload: string, options?: EncryptOptions): T => {
  const raw = decryptForUser(userId, payload, options);
  return JSON.parse(raw) as T;
};

/** Health probe — true iff a root key is configured and parseable. */
export const isCryptoConfigured = (): boolean => {
  try {
    getRootKey();
    return true;
  } catch {
    return false;
  }
};

