/**
 * Audits — and optionally backfills — at-rest encryption of advisor/client chat.
 *
 * Until 2026-09-24, `encryptMessageBody()` fell back to storing the PLAINTEXT
 * when `AA_ENCRYPTION_ROOT_KEY` was unset, and that key is not provisioned in
 * `render.yaml`. So the question "were production consultations stored in the
 * clear?" cannot be answered by reading the code — it has to be counted. This
 * script counts it.
 *
 * Rows written by the encrypting path carry the `enc:v1:` prefix. Anything
 * without it is either genuinely plaintext or predates encryption entirely;
 * both are equally readable to anyone holding a database dump, so both are
 * reported together.
 *
 *   npx tsx scripts/audit-chat-encryption.ts           # read-only: counts only
 *   npx tsx scripts/audit-chat-encryption.ts --apply   # encrypt the plaintext rows
 *
 * The backfill is idempotent and resumable: it selects only unprefixed rows,
 * encrypts each under the sender's DEK with `AAD = sessionId` — the exact
 * derivation the live path uses — verifies the ciphertext decrypts back to the
 * original before writing, and updates one row at a time. A row that fails
 * verification is left untouched and reported.
 *
 * NOTE: backend/.env points at PRODUCTION. Run the read-only pass first, and
 * run --apply with the same root key the deployed API uses, or the rows become
 * unreadable to it.
 */
import { prisma } from '../src/db/prisma';
import { isCryptoConfigured } from '../src/security/crypto';
import {
  encryptMessageBody,
  decryptMessageBody,
  isEncryptedMessage,
} from '../src/features/sessions/message.crypto';

const apply = process.argv.includes('--apply');

/** Never print message bodies — this is a confidentiality audit, not a dump. */
const preview = (value: string): string => `${value.length} chars`;

async function main() {
  const total = await prisma.chatMessage.count();

  // Pull only what is needed to classify and re-encrypt. `message` is required
  // for both, but it never leaves this process.
  const rows = await prisma.chatMessage.findMany({
    select: { id: true, senderId: true, sessionId: true, message: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  });

  const plaintext = rows.filter((r) => r.message !== '' && !isEncryptedMessage(r.message));
  const encrypted = rows.filter((r) => isEncryptedMessage(r.message));
  const empty = rows.filter((r) => r.message === '');

  console.log('── Chat message encryption audit ──────────────────────────────');
  console.log(`  database rows      : ${total}`);
  console.log(`  encrypted (enc:v1:): ${encrypted.length}`);
  console.log(`  PLAINTEXT          : ${plaintext.length}`);
  console.log(`  empty (attachments): ${empty.length}`);
  console.log(`  root key configured: ${isCryptoConfigured()}`);

  if (plaintext.length > 0) {
    const first = plaintext[0];
    const last = plaintext[plaintext.length - 1];
    console.log(
      `  plaintext spans    : ${first.timestamp.toISOString()} … ${last.timestamp.toISOString()}`,
    );
    const sessions = new Set(plaintext.map((r) => r.sessionId));
    console.log(`  across sessions    : ${sessions.size}`);
  }

  if (plaintext.length === 0) {
    console.log('\n✓ No plaintext message bodies. Nothing to backfill.');
    return;
  }

  if (!isCryptoConfigured()) {
    console.error(
      '\nRefusing to backfill: AA_ENCRYPTION_ROOT_KEY is not set in this environment.',
    );
    console.error('Set the SAME key the deployed API uses, then re-run with --apply.');
    process.exit(1);
  }

  if (!apply) {
    console.log(`\nDry run. Re-run with --apply to encrypt ${plaintext.length} row(s) in place.`);
    return;
  }

  const counts = { encrypted: 0, failed: 0 };

  for (const row of plaintext) {
    try {
      const ciphertext = encryptMessageBody(row.senderId, row.sessionId, row.message);

      // Verify BEFORE writing. An unverifiable rewrite would turn a readable
      // message into an unreadable one — strictly worse than leaving it.
      const roundTrip = decryptMessageBody(row.senderId, row.sessionId, ciphertext);
      if (roundTrip !== row.message) {
        counts.failed += 1;
        console.warn(`  ! ${row.id}: round-trip mismatch (${preview(row.message)}) — left as-is`);
        continue;
      }

      await prisma.chatMessage.update({
        where: { id: row.id },
        data: { message: ciphertext },
      });
      counts.encrypted += 1;
    } catch (err) {
      counts.failed += 1;
      console.warn(
        `  ! ${row.id}: ${err instanceof Error ? err.message : String(err)} — left as-is`,
      );
    }
  }

  console.log(`\n✓ Encrypted ${counts.encrypted} row(s); ${counts.failed} left untouched.`);
  if (counts.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
