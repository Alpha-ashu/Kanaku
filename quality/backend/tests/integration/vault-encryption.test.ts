/**
 * VAULT FILE ENCRYPTION
 *
 * Vault documents are decrypted SERVER-side, so viewing one is device
 * independent by construction. What is not device independent is the chain of
 * gates in front of it — and what is not time independent is the key the server
 * happens to be holding. These tests pin the second half: the properties that
 * decide whether a stored file is still readable.
 *
 * The scenario that matters most in production: VAULT_ENCRYPTION_ROOT_KEY is
 * declared `sync: false` in render.yaml, so it is set by hand in the dashboard,
 * and until it is, files are encrypted with a publicly known development key.
 * The day someone sets that key, every previously uploaded file must still open
 * — otherwise turning on encryption silently destroys every document in the
 * vault.
 */
import {
  encryptBufferForUser,
  decryptBufferForUser,
  isVaultEncryptionConfigured,
} from '../../../../backend/src/features/vault/vault.storage';

const REAL_KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

const OWNER = 'owner-user-id';
const DOC_ID = 'doc-11111111-2222-3333-4444-555555555555';
const PLAINTEXT = Buffer.from('statement totals and account numbers', 'utf8');

/** The module reads process.env on every call, so scenarios can be staged. */
const withKeys = <T>(vaultKey: string | undefined, aaKey: string | undefined, fn: () => T): T => {
  const prevVault = process.env.VAULT_ENCRYPTION_ROOT_KEY;
  const prevAa = process.env.AA_ENCRYPTION_ROOT_KEY;
  if (vaultKey === undefined) delete process.env.VAULT_ENCRYPTION_ROOT_KEY;
  else process.env.VAULT_ENCRYPTION_ROOT_KEY = vaultKey;
  if (aaKey === undefined) delete process.env.AA_ENCRYPTION_ROOT_KEY;
  else process.env.AA_ENCRYPTION_ROOT_KEY = aaKey;
  try {
    return fn();
  } finally {
    if (prevVault === undefined) delete process.env.VAULT_ENCRYPTION_ROOT_KEY;
    else process.env.VAULT_ENCRYPTION_ROOT_KEY = prevVault;
    if (prevAa === undefined) delete process.env.AA_ENCRYPTION_ROOT_KEY;
    else process.env.AA_ENCRYPTION_ROOT_KEY = prevAa;
  }
};

describe('vault file encryption', () => {
  it('round-trips a document bound to its document id', () => {
    withKeys(REAL_KEY, undefined, () => {
      const sealed = encryptBufferForUser(OWNER, PLAINTEXT, DOC_ID);
      expect(sealed.equals(PLAINTEXT)).toBe(false); // actually encrypted
      expect(decryptBufferForUser(OWNER, sealed, DOC_ID)).toEqual(PLAINTEXT);
    });
  });

  it('SURVIVES the root key being configured after upload', () => {
    // The exact production sequence: uploaded while the key was unset (public
    // dev key), opened after someone set a real key in the Render dashboard.
    // The fallback stays a decrypt candidate precisely so this keeps working;
    // if it ever stops, enabling encryption destroys every existing document.
    const sealedUnderFallback = withKeys(undefined, undefined, () =>
      encryptBufferForUser(OWNER, PLAINTEXT, DOC_ID));

    const opened = withKeys(REAL_KEY, undefined, () =>
      decryptBufferForUser(OWNER, sealedUnderFallback, DOC_ID));

    expect(opened).toEqual(PLAINTEXT);
  });

  it('opens a file written under AA_ENCRYPTION_ROOT_KEY once VAULT key is set', () => {
    const sealedUnderAa = withKeys(undefined, OTHER_KEY, () =>
      encryptBufferForUser(OWNER, PLAINTEXT, DOC_ID));

    const opened = withKeys(REAL_KEY, OTHER_KEY, () =>
      decryptBufferForUser(OWNER, sealedUnderAa, DOC_ID));

    expect(opened).toEqual(PLAINTEXT);
  });

  it('refuses a file encrypted under a key this server does not hold', () => {
    const sealedElsewhere = withKeys(OTHER_KEY, undefined, () =>
      encryptBufferForUser(OWNER, PLAINTEXT, DOC_ID));

    // REAL_KEY only — no AA key, and the payload was not written under the
    // public fallback either. GCM authenticates, so this fails loudly rather
    // than returning garbage that would be served to the user as a "document".
    expect(() =>
      withKeys(REAL_KEY, undefined, () => decryptBufferForUser(OWNER, sealedElsewhere, DOC_ID)),
    ).toThrow(/unable to decrypt/i);
  });

  it('does not let one user open another user\'s document', () => {
    // Keys are derived per user via HKDF, so ownership is enforced by the
    // cryptography and not only by the authorization check in front of it.
    withKeys(REAL_KEY, undefined, () => {
      const sealed = encryptBufferForUser(OWNER, PLAINTEXT, DOC_ID);
      expect(() => decryptBufferForUser('a-different-user', sealed, DOC_ID)).toThrow();
    });
  });

  it('rejects a payload presented under the wrong document id', () => {
    // AAD binds the ciphertext to its document, so a file cannot be swapped
    // onto a different document row.
    withKeys(REAL_KEY, undefined, () => {
      const sealed = encryptBufferForUser(OWNER, PLAINTEXT, DOC_ID);
      expect(() => decryptBufferForUser(OWNER, sealed, 'some-other-doc-id')).toThrow();
    });
  });

  it('still opens a legacy version bound to `<id>_v<n>`', () => {
    // Versions uploaded before 2026-09-20 used this AAD. streamDocumentFile
    // passes it as a fallback candidate for documents past version 1; the
    // INITIAL upload always used the plain id, which is why a v1 document needs
    // no legacy candidate.
    withKeys(REAL_KEY, undefined, () => {
      const legacyAad = `${DOC_ID}_v2`;
      const sealed = encryptBufferForUser(OWNER, PLAINTEXT, legacyAad);

      expect(() => decryptBufferForUser(OWNER, sealed, DOC_ID)).toThrow();
      expect(decryptBufferForUser(OWNER, sealed, legacyAad)).toEqual(PLAINTEXT);
    });
  });

  it('detects a tampered payload', () => {
    withKeys(REAL_KEY, undefined, () => {
      const sealed = encryptBufferForUser(OWNER, PLAINTEXT, DOC_ID);
      sealed[sealed.length - 1] ^= 0xff;
      expect(() => decryptBufferForUser(OWNER, sealed, DOC_ID)).toThrow();
    });
  });

  it('reports whether a real key is configured', () => {
    // The single most useful fact when diagnosing an unreadable file, and now
    // logged alongside every failure.
    expect(withKeys(REAL_KEY, undefined, isVaultEncryptionConfigured)).toBe(true);
    expect(withKeys(undefined, OTHER_KEY, isVaultEncryptionConfigured)).toBe(true);
    expect(withKeys(undefined, undefined, isVaultEncryptionConfigured)).toBe(false);
  });
});
