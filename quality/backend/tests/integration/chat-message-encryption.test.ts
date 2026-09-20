/**
 * Chat messages are encrypted at rest.
 *
 * The guarantee has two halves and both matter: new messages must not be
 * readable in the database, and the rows written before encryption existed must
 * keep rendering — a "secure" change that blanks every historical consultation
 * would be worse than the problem it fixes.
 */
import {
  encryptMessageBody,
  decryptMessageBody,
  decryptMessageRow,
  isEncryptedMessage,
} from '../../../../backend/src/features/sessions/message.crypto';

const SENDER = 'user-sender-1';
const SESSION = 'session-abc';

describe('Chat message encryption', () => {
  const ROOT_KEY = 'a'.repeat(64);
  let previousKey: string | undefined;

  beforeAll(() => {
    previousKey = process.env.AA_ENCRYPTION_ROOT_KEY;
    process.env.AA_ENCRYPTION_ROOT_KEY = ROOT_KEY;
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.AA_ENCRYPTION_ROOT_KEY;
    else process.env.AA_ENCRYPTION_ROOT_KEY = previousKey;
  });

  it('does not store the message text in readable form', () => {
    const plaintext = 'My salary is 250000 and I want to invest in ELSS';
    const stored = encryptMessageBody(SENDER, SESSION, plaintext);

    expect(stored).not.toContain('salary');
    expect(stored).not.toContain('250000');
    expect(stored).not.toContain('ELSS');
    expect(isEncryptedMessage(stored)).toBe(true);
  });

  it('round-trips the exact text the sender typed', () => {
    const plaintext = 'Unicode ✓ emoji 🙂 and "quotes" — all of it';
    const stored = encryptMessageBody(SENDER, SESSION, plaintext);
    expect(decryptMessageBody(SENDER, SESSION, stored)).toBe(plaintext);
  });

  it('produces different ciphertext for the same text (random IV)', () => {
    const a = encryptMessageBody(SENDER, SESSION, 'same words');
    const b = encryptMessageBody(SENDER, SESSION, 'same words');
    expect(a).not.toBe(b);
    expect(decryptMessageBody(SENDER, SESSION, a)).toBe('same words');
    expect(decryptMessageBody(SENDER, SESSION, b)).toBe('same words');
  });

  it('refuses a ciphertext lifted into a different thread (AAD binding)', () => {
    const stored = encryptMessageBody(SENDER, SESSION, 'confidential');
    // Moving the row to another session must not decrypt — it returns the
    // placeholder rather than the text.
    expect(decryptMessageBody(SENDER, 'session-other', stored)).toBe(
      '[This message could not be decrypted]',
    );
  });

  it('refuses a ciphertext attributed to a different sender', () => {
    const stored = encryptMessageBody(SENDER, SESSION, 'confidential');
    expect(decryptMessageBody('user-other', SESSION, stored)).toBe(
      '[This message could not be decrypted]',
    );
  });

  it('still renders rows written before encryption existed', () => {
    // A legacy row: plaintext, no marker prefix, no backfill performed.
    const legacy = 'this row predates encryption';
    expect(isEncryptedMessage(legacy)).toBe(false);
    expect(decryptMessageBody(SENDER, SESSION, legacy)).toBe(legacy);
  });

  it('never blanks a whole thread because one row is unreadable', () => {
    const rows = [
      { senderId: SENDER, sessionId: SESSION, message: encryptMessageBody(SENDER, SESSION, 'first') },
      { senderId: SENDER, sessionId: SESSION, message: 'enc:v1:not-actually-valid-base64-payload' },
      { senderId: SENDER, sessionId: SESSION, message: 'legacy plaintext' },
    ];
    const rendered = rows.map(decryptMessageRow).map((r) => r.message);

    expect(rendered[0]).toBe('first');
    expect(rendered[1]).toBe('[This message could not be decrypted]');
    expect(rendered[2]).toBe('legacy plaintext');
  });
});
