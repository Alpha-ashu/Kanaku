import crypto from 'crypto';
import path from 'path';
import { uploadBuffer, downloadBuffer, removeObject } from '../../utils/storage';
import { logger } from '../../config/logger';

const VERSION_BYTE = 0x01;
const IV_LENGTH = 12; // 96-bit nonce for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag
const KEY_LENGTH = 32; // AES-256
const HKDF_INFO_VAULT = 'kanaku/vault/v1';

// Supported file extensions & mimetypes
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const MAX_VAULT_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Publicly known key (it is SHA-256 of the empty string, and it is in this
 * repository). Used only when no root key is configured, so files encrypted
 * under it are NOT protected at rest. Kept as a decrypt candidate so documents
 * uploaded before a real key was configured stay readable.
 */
const INSECURE_FALLBACK_KEY_HEX = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const isHexKey = (v?: string): v is string => Boolean(v && /^[0-9a-fA-F]{64}$/.test(v));

let warnedAboutFallback = false;

/** Root keys in preference order: the first encrypts, all are tried to decrypt. */
const getVaultRootKeys = (): Buffer[] => {
  const configured = [process.env.VAULT_ENCRYPTION_ROOT_KEY, process.env.AA_ENCRYPTION_ROOT_KEY].filter(isHexKey);
  if (configured.length === 0 && !warnedAboutFallback) {
    warnedAboutFallback = true;
    const log = process.env.NODE_ENV === 'production' ? logger.error.bind(logger) : logger.warn.bind(logger);
    log('[VaultStorage] VAULT_ENCRYPTION_ROOT_KEY is not set — vault files are encrypted with a publicly known development key and are NOT protected at rest. Set a 64-hex-char key.');
  }
  return [...new Set([...configured, INSECURE_FALLBACK_KEY_HEX].map((h) => h.toLowerCase()))].map((h) => Buffer.from(h, 'hex'));
};

/** True when vault files are encrypted under a real, private root key. */
export const isVaultEncryptionConfigured = (): boolean =>
  isHexKey(process.env.VAULT_ENCRYPTION_ROOT_KEY) || isHexKey(process.env.AA_ENCRYPTION_ROOT_KEY);

const deriveKey = (root: Buffer, userId: string): Buffer =>
  Buffer.from(crypto.hkdfSync('sha256', root, Buffer.from(userId, 'utf8'), Buffer.from(HKDF_INFO_VAULT, 'utf8'), KEY_LENGTH));

/**
 * Derives a per-user 32-byte DEK (Data Encryption Key) using HKDF-SHA-256 from
 * the current (preferred) root key.
 */
export const deriveVaultUserKey = (userId: string): Buffer => {
  if (!userId) throw new Error('deriveVaultUserKey: userId is required');
  return deriveKey(getVaultRootKeys()[0], userId);
};

/**
 * Encrypts a binary buffer at rest using AES-256-GCM with per-user DEK.
 */
export const encryptBufferForUser = (userId: string, plaintext: Buffer, aad?: string): Buffer => {
  const key = deriveVaultUserKey(userId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: [version(1) | iv(12) | tag(16) | ciphertext(n)]
  return Buffer.concat([Buffer.from([VERSION_BYTE]), iv, tag, ciphertext]);
};

/**
 * Decrypts a binary buffer using AES-256-GCM.
 */
export const decryptBufferForUser = (userId: string, payload: Buffer, aad?: string): Buffer => {
  if (payload.length < 1 + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('decryptBufferForUser: payload too short or corrupted');
  }

  const version = payload.readUInt8(0);
  if (version !== VERSION_BYTE) {
    throw new Error(`decryptBufferForUser: unsupported payload version 0x${version.toString(16)}`);
  }

  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const tag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(1 + IV_LENGTH + TAG_LENGTH);

  if (!userId) throw new Error('decryptBufferForUser: userId is required');

  // GCM authenticates, so a wrong key fails loudly instead of returning garbage:
  // try each candidate root key (current key first, then older/fallback ones).
  let lastError: unknown;
  for (const root of getVaultRootKeys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(root, userId), iv);
      decipher.setAuthTag(tag);
      if (aad) {
        decipher.setAAD(Buffer.from(aad, 'utf8'));
      }
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('decryptBufferForUser: unable to decrypt payload');
};

/**
 * Generates an isolated, safe storage path for a user's vault document.
 */
export const makeVaultStoragePath = (userId: string, documentId: string, ext = 'bin'): string => {
  const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const sanitizedDocId = documentId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.posix.join('vault', sanitizedUserId, `${sanitizedDocId}_${Date.now()}.${ext}`);
};

/**
 * Encrypts and writes a file to secure private storage.
 */
export const storeEncryptedVaultFile = async (
  ownerId: string,
  documentId: string,
  rawBuffer: Buffer,
  originalFileName: string,
): Promise<{ storagePath: string; isEncrypted: boolean }> => {
  const ext = path.extname(originalFileName).replace('.', '') || 'bin';
  const storagePath = makeVaultStoragePath(ownerId, documentId, ext);

  // Encrypt with owner's DEK, binding to documentId as AAD
  const encryptedBuffer = encryptBufferForUser(ownerId, rawBuffer, documentId);

  await uploadBuffer(storagePath, encryptedBuffer, 'application/octet-stream');
  return { storagePath, isEncrypted: true };
};

/**
 * Downloads and decrypts a file from storage in server memory.
 */
export const fetchDecryptedVaultFile = async (
  ownerId: string,
  documentId: string,
  storagePath: string,
  isEncrypted: boolean,
  legacyAads: string[] = [],
): Promise<Buffer> => {
  const downloaded = await downloadBuffer(storagePath);
  if (!downloaded || !downloaded.buffer) {
    throw new Error('File not found in storage');
  }

  if (!isEncrypted) {
    return downloaded.buffer;
  }

  // Versions uploaded before 2026-09-20 were bound to `<documentId>_v<n>` instead
  // of the document id, so they are tried after the canonical AAD.
  let lastError: unknown;
  for (const aad of [documentId, ...legacyAads]) {
    try {
      return decryptBufferForUser(ownerId, downloaded.buffer, aad);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to decrypt vault file');
};

/**
 * Removes file from storage.
 */
export const deleteVaultFile = async (storagePath: string): Promise<void> => {
  await removeObject(storagePath);
};
