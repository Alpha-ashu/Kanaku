/**
 * Paytm checksum — a TypeScript port of Paytm's published `PaytmChecksum` helper
 * (paytm/Paytm_Node_Checksum), used for every API request signature and to
 * verify callbacks and webhooks:
 *
 *   hash      = SHA256(payload + "|" + salt) as hex, followed by the 4-char salt
 *   checksum  = base64( AES-128-CBC(hash, key = merchant key, iv = "@@@@&&&&####$$$$") )
 *   verify    = decrypt(checksum), take the last 4 chars as the salt, recompute
 *
 * For key/value payloads (callbacks, webhooks) the payload string is the values
 * sorted by key and joined with "|", with null / "null" as empty. JSON API calls
 * sign `JSON.stringify(body)` exactly as sent.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

const IV = '@@@@&&&&####$$$$';

const encrypt = (input: string, key: string) => {
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(IV, 'utf8'));
  return cipher.update(input, 'latin1', 'base64') + cipher.final('base64');
};

const decrypt = (encrypted: string, key: string): string | null => {
  try {
    const decipher = createDecipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(IV, 'utf8'));
    return decipher.update(encrypted, 'base64', 'latin1') + decipher.final('latin1');
  } catch {
    return null; // wrong key or tampered checksum
  }
};

const calculateHash = (payload: string, salt: string) =>
  createHash('sha256').update(`${payload}|${salt}`).digest('hex') + salt;

/** Values sorted by key, joined with "|"; null and the string "null" become empty. */
export function paramsToString(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      if (value === null || value === undefined) return '';
      const text = String(value);
      return text.toLowerCase() === 'null' ? '' : text;
    })
    .join('|');
}

/** A checksum for `payload` (a JSON body string, or key/value params). */
export function generateSignature(payload: string | Record<string, unknown>, key: string): string {
  const text = typeof payload === 'string' ? payload : paramsToString(payload);
  const salt = randomBytes(3).toString('base64'); // 4 characters
  return encrypt(calculateHash(text, salt), key);
}

/** True when `checksum` was made with `key` over exactly `payload` (CHECKSUMHASH itself excluded). */
export function verifySignature(payload: string | Record<string, unknown>, key: string, checksum: string): boolean {
  if (!checksum || !key) return false;
  let text: string;
  if (typeof payload === 'string') {
    text = payload;
  } else {
    const { CHECKSUMHASH: _ignored, ...rest } = payload;
    text = paramsToString(rest);
  }
  const decrypted = decrypt(checksum, key);
  if (!decrypted || decrypted.length < 5) return false;
  const expected = Buffer.from(calculateHash(text, decrypted.slice(-4)), 'latin1');
  const given = Buffer.from(decrypted, 'latin1');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
