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
 * Thrown when a message cannot be encrypted. Callers must translate this into a
 * 503 and MUST NOT persist the message.
 *
 * A distinct class rather than a bare Error so the transports can tell "we
 * refused to store this" apart from "the database rejected it": the first is a
 * server misconfiguration the operator can fix, the second is not.
 */
export class MessageEncryptionUnavailableError extends Error {
  readonly code = 'MESSAGE_ENCRYPTION_UNAVAILABLE';
  constructor(cause?: unknown) {
    super('Secure messaging is temporarily unavailable.');
    this.name = 'MessageEncryptionUnavailableError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Encrypts a message body for storage. **Fails closed.**
 *
 * This used to return the plaintext when no root key was configured, on the
 * reasoning that refusing to send was worse than storing a message the way this
 * table stored every message before encryption existed. That trade was wrong:
 * `AA_ENCRYPTION_ROOT_KEY` is not provisioned in `render.yaml`, so the fallback
 * was not a rare degraded mode — it was, in all likelihood, the normal one, and
 * the only trace was one log line per message that nobody reads. A consultation
 * silently stored in the clear is a confidentiality breach the user has no way
 * to detect; a send that fails with "try again shortly" is an outage they can.
 *
 * So: no key, or encryption throws ⇒ raise. The caller answers 503 and nothing
 * is written. `isCryptoConfigured()` is still what the deployment check should
 * assert, and env.ts now refuses to boot production without the key, so this
 * path should be unreachable outside a partial rollout.
 */
export const encryptMessageBody = (senderId: string, sessionId: string, plaintext: string): string => {
  if (!isCryptoConfigured()) {
    logger.error(
      '[chat] No encryption root key configured — REFUSING to store message. Set AA_ENCRYPTION_ROOT_KEY.',
      { sessionId },
    );
    throw new MessageEncryptionUnavailableError();
  }
  try {
    return PREFIX + encryptForUser(senderId, plaintext, { aad: sessionId, info: HKDF_INFO });
  } catch (err) {
    logger.error('[chat] Message encryption failed — REFUSING to store message', {
      sessionId, error: err instanceof Error ? err.message : String(err),
    });
    throw new MessageEncryptionUnavailableError(err);
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
