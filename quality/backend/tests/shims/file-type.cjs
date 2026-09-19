/**
 * Test-only stand-in for the ESM-only `file-type` package.
 *
 * backend/src/utils/uploadPolicy.ts loads `file-type` with a dynamic import that
 * TypeScript compiles to require(). Production (Node 22) can require() an ES
 * module, but Jest's CommonJS runtime cannot ("Must use import to load ES
 * Module"), so every test that reached a bill upload crashed with a 500 before
 * any assertion. jest.config.cjs maps `file-type` here.
 *
 * Covers the magic numbers the upload policies act on; like the real package it
 * returns undefined for plain text.
 */
const startsWith = (buf, bytes, offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

async function fileTypeFromBuffer(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { ext: 'jpg', mime: 'image/jpeg' };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', mime: 'image/png' };
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return { ext: 'gif', mime: 'image/gif' };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return { ext: 'pdf', mime: 'application/pdf' };
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return { ext: 'zip', mime: 'application/zip' };
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { ext: 'cfb', mime: 'application/x-cfb' };
  if (startsWith(buf, [0x4d, 0x5a])) return { ext: 'exe', mime: 'application/x-msdownload' };
  return undefined;
}

module.exports = { fileTypeFromBuffer };
