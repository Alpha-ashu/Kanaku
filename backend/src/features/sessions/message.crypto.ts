/**
 * Encryption at rest for advisor/client chat messages.
 *
 * `ChatMessage.message` was stored as plaintext, so anyone with a database
 * dump — or a mis-scoped query — could read every consultation. Messages are
 * now AES-256-GCM encrypted with the same per-user DEK scheme the Account
 * Aggregator data uses (security/crypto.ts).
 *
 * Key choice: the DEK is derived from the SENDER's id, not the session's.
 * The server holds the root key and knows every message's senderId, so it can
 * always derive the right key to render a thread for either party. Deriving
 * from the session instead would buy nothing — the server would still be able
 * to read everything — and would break if a message ever moved threads.
 *
 * This is encryption at rest, NOT end-to-end: the server necessarily sees
 * plaintext to store and serve it. Say so plainly rather than implying E2E.
 *
 * AAD = sessionId, so a ciphertext lifted into a different thread fails its
 * authentication tag instead of decrypting.
 *
 * ── Backward compatibility ─────────────────────────────────────────────────
 * Every row written before this existed is plaintext, and there is no marker
 * on those rows to distinguish them. New ciphertext is therefore written with
 * an explicit `enc:v1:` prefix, and anything without that prefix is returned
 * as-is. That makes the change safe to deploy with no backfill: old threads
 * keep rendering, new messages are encrypted, and a backfill (if ever wanted)
 * can convert rows in place without a flag day.
 */
import { encryptForUser, decryptForUser, isCryptoConfigured } from '../../security/crypto';
import { logger } from '../../config/logger';

/** Marks a value as produced by this module. Legacy rows carry no prefix. */
const PREFIX = 'enc:v1:';
const HKDF_INFO = 'kanaku/chat/v1';

export const isEncryptedMessage = (value: string): boolean => value.startsWith(PREFIX);

/**
 * Encrypts a message body for storage.
 *
 * Falls back to plaintext when no root key is configured, because refusing to
 * send a message is a worse outcome than storing it the way this table already
 * stored every message before today. The condition is logged loudly — and
 * `isCryptoConfigured()` is what the deployment check should assert.
 */
export const encryptMessageBody = (senderId: string, sessionId: string, plaintext: string): string => {
  if (!isCryptoConfigured()) {
    logger.error(
      '[chat] No encryption root key configured — message stored as PLAINTEXT. Set AA_ENCRYPTION_ROOT_KEY.',
    );
    return plaintext;
  }
  try {
    return PREFIX + encryptForUser(senderId, plaintext, { aad: sessionId, info: HKDF_INFO });
  } catch (err) {
    logger.error('[chat] Message encryption failed — storing plaintext', {
      sessionId, error: err instanceof Error ? err.message : String(err),
    });
    return plaintext;
  }
};

/**
 * Decrypts a stored message body.
 *
 * Returns a placeholder rather than throwing when a row cannot be opened (root
 * key rotated, ciphertext corrupted): one unreadable message must not blank the
 * whole conversation for both parties.
 */
export const decryptMessageBody = (senderId: string, sessionId: string, stored: string): string => {
  if (!stored || !isEncryptedMessage(stored)) return stored; // legacy plaintext row
  try {
    return decryptForUser(senderId, stored.slice(PREFIX.length), { aad: sessionId, info: HKDF_INFO });
  } catch (err) {
    logger.warn('[chat] Message decryption failed', {
      sessionId, error: err instanceof Error ? err.message : String(err),
    });
    return '[This message could not be decrypted]';
  }
};

/** Maps a stored ChatMessage row to one safe to return to a client. */
export const decryptMessageRow = <T extends { senderId: string; sessionId: string; message: string }>(
  row: T,
): T => ({ ...row, message: decryptMessageBody(row.senderId, row.sessionId, row.message) });
