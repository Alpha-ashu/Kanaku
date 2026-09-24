/**
 * Chat message encryption must FAIL CLOSED.
 *
 * `encryptMessageBody()` used to return the caller's plaintext when no root key
 * was configured, so a deployment missing `AA_ENCRYPTION_ROOT_KEY` — which is
 * what `render.yaml` described until 2026-09-24 — stored every advisor/client
 * consultation in the clear while appearing to work.
 *
 * ── Why this file imports only the two functions ────────────────────────────
 *
 * The contract being defended is behavioural: "no key ⇒ the plaintext is never
 * returned". An earlier version of this suite imported the
 * `MessageEncryptionUnavailableError` class, which meant that against the
 * fail-open implementation the file did not COMPILE — so the regression
 * surfaced as `TS2305: has no exported member`, which reads like a broken test
 * rather than a security regression.
 *
 * Importing only `encryptMessageBody` / `decryptMessageBody` keeps the suite
 * compiling against either implementation, so a revert to fail-open fails here
 * with an explicit message about storing plaintext. The error's `code` is
 * asserted structurally for the same reason.
 *
 * Pure unit test: `security/crypto` is mocked, so there is no DB, no Redis and
 * no dependency on the ambient environment.
 */
const mockIsCryptoConfigured = jest.fn();
const mockEncryptForUser = jest.fn();
const mockDecryptForUser = jest.fn();

jest.mock('../../../../backend/src/security/crypto', () => ({
  isCryptoConfigured: () => mockIsCryptoConfigured(),
  encryptForUser: (...args: unknown[]) => mockEncryptForUser(...args),
  decryptForUser: (...args: unknown[]) => mockDecryptForUser(...args),
}));

jest.mock('../../../../backend/src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import {
  encryptMessageBody,
  decryptMessageBody,
  isEncryptedMessage,
} from '../../../../backend/src/features/sessions/message.crypto';

const SENDER = '11111111-1111-4111-8111-111111111111';
const OTHER_SENDER = '33333333-3333-4333-8333-333333333333';
const SESSION = '22222222-2222-4222-8222-222222222222';
const SECRET = 'my accountant says I should restructure the loan';

/** Calls the encryptor and reports what happened, without assuming it throws. */
const attemptEncrypt = (): { returned?: string; error?: unknown; threw: boolean } => {
  try {
    return { returned: encryptMessageBody(SENDER, SESSION, SECRET), threw: false };
  } catch (error) {
    return { error, threw: true };
  }
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('key misconfiguration — no root key at all', () => {
  beforeEach(() => mockIsCryptoConfigured.mockReturnValue(false));

  it('never returns the plaintext for storage', () => {
    const { returned, threw } = attemptEncrypt();

    // Asserted as a descriptive string rather than a bare boolean so a failure
    // reads as "Expected: threw / Received: returned the PLAINTEXT" instead of
    // "Expected true, received false".
    const outcome = threw
      ? 'threw'
      : returned === SECRET
        ? 'returned the PLAINTEXT (consultations would be stored in the clear)'
        : 'returned a value instead of throwing';

    expect(outcome).toBe('threw');
    expect(returned).toBeUndefined();
  });

  it('does not leak the plaintext through the error either', () => {
    const { error } = attemptEncrypt();
    expect(String((error as Error)?.message ?? '')).not.toContain(SECRET);
  });

  it('carries a machine-readable code so transports can answer 503', () => {
    const { error } = attemptEncrypt();

    expect((error as { code?: string })?.code).toBe('MESSAGE_ENCRYPTION_UNAVAILABLE');
    // The user-facing message must not name the missing variable.
    expect((error as Error)?.message).not.toMatch(/AA_ENCRYPTION_ROOT_KEY/);
  });
});

describe('key misconfiguration — key present but encryption fails', () => {
  beforeEach(() => {
    mockIsCryptoConfigured.mockReturnValue(true);
    mockEncryptForUser.mockImplementation(() => {
      throw new Error('cipher exploded');
    });
  });

  it('throws rather than silently downgrading to plaintext', () => {
    const { returned, threw } = attemptEncrypt();

    const outcome = threw
      ? 'threw'
      : returned === SECRET
        ? 'fell back to storing the PLAINTEXT'
        : 'returned a value instead of throwing';

    expect(outcome).toBe('threw');
    expect(returned).toBeUndefined();
  });
});

describe('successful encryption', () => {
  beforeEach(() => {
    mockIsCryptoConfigured.mockReturnValue(true);
    mockEncryptForUser.mockReturnValue('CIPHERTEXT');
  });

  it('prefixes the ciphertext so legacy rows stay distinguishable', () => {
    const stored = encryptMessageBody(SENDER, SESSION, SECRET);

    expect(stored).toBe('enc:v1:CIPHERTEXT');
    expect(isEncryptedMessage(stored)).toBe(true);
  });

  it('does not contain the plaintext anywhere in the stored value', () => {
    expect(encryptMessageBody(SENDER, SESSION, SECRET)).not.toContain(SECRET);
  });

  it('binds the ciphertext to the session via AAD', () => {
    encryptMessageBody(SENDER, SESSION, SECRET);

    // A ciphertext lifted into another thread then fails its auth tag rather
    // than decrypting — the integration suite proves that end to end.
    expect(mockEncryptForUser).toHaveBeenCalledWith(
      SENDER,
      SECRET,
      expect.objectContaining({ aad: SESSION }),
    );
  });

  it('derives the key from the SENDER, so either party can read the thread', () => {
    encryptMessageBody(OTHER_SENDER, SESSION, SECRET);
    expect(mockEncryptForUser).toHaveBeenCalledWith(OTHER_SENDER, SECRET, expect.anything());
  });
});

describe('successful decryption', () => {
  beforeEach(() => {
    mockIsCryptoConfigured.mockReturnValue(true);
    mockDecryptForUser.mockReturnValue(SECRET);
  });

  it('returns exactly what the sender typed', () => {
    expect(decryptMessageBody(SENDER, SESSION, 'enc:v1:CIPHERTEXT')).toBe(SECRET);
  });

  it('opens the ciphertext with the same sender and AAD it was sealed under', () => {
    decryptMessageBody(SENDER, SESSION, 'enc:v1:CIPHERTEXT');

    expect(mockDecryptForUser).toHaveBeenCalledWith(
      SENDER,
      'CIPHERTEXT',
      expect.objectContaining({ aad: SESSION }),
    );
  });
});

describe('decryption is resilient, unlike encryption', () => {
  beforeEach(() => mockIsCryptoConfigured.mockReturnValue(true));

  it('returns an unprefixed row unchanged without attempting decryption', () => {
    // Rows written before encryption existed (and by the old plaintext
    // fallback) carry no prefix. The backfill script depends on this.
    expect(decryptMessageBody(SENDER, SESSION, SECRET)).toBe(SECRET);
    expect(mockDecryptForUser).not.toHaveBeenCalled();
  });

  it('does not blank a whole thread when one row cannot be opened', () => {
    mockDecryptForUser.mockImplementation(() => {
      throw new Error('bad tag');
    });

    // Deliberately asymmetric with encryption: refusing to WRITE protects the
    // user, whereas refusing to READ would hide a conversation they are
    // entitled to see because of one damaged row.
    expect(decryptMessageBody(SENDER, SESSION, 'enc:v1:GARBAGE'))
      .toBe('[This message could not be decrypted]');
  });
});
