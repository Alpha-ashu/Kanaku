/**
 * Re-encrypts every stored Vault file under the current root key.
 *
 * Until VAULT_ENCRYPTION_ROOT_KEY (or AA_ENCRYPTION_ROOT_KEY) was set, vault
 * files were encrypted with a publicly known fallback key
 * (features/vault/vault.storage.ts). Setting the key protects new uploads, and
 * old files stay readable because decryption tries every candidate key — but
 * they remain encrypted under the public key until this script rewrites them.
 * It also rebinds versions uploaded before 2026-09-20 from the `<id>_v<n>` AAD to
 * the document id.
 *
 * Each file is downloaded, decrypted, re-encrypted, verified to decrypt under
 * the current key alone, and only then written back to the same storage path.
 * Files already under the current key are skipped, so re-running is safe.
 *
 *   npx tsx scripts/reencrypt-vault-files.ts           # dry run: counts only
 *   npx tsx scripts/reencrypt-vault-files.ts --apply   # rewrite files
 *
 * NOTE: backend/.env points at PRODUCTION. Run this deliberately, with the same
 * root key the deployed API uses, or files become unreadable to it.
 */
import { prisma } from '../src/db/prisma';
import { downloadBuffer, uploadBuffer } from '../src/utils/storage';
import {
  decryptBufferForUser,
  isVaultEncryptionConfigured,
  reencryptForCurrentKey,
} from '../src/features/vault/vault.storage';

const apply = process.argv.includes('--apply');

async function main() {
  if (!isVaultEncryptionConfigured()) {
    console.error('Refusing to run: set VAULT_ENCRYPTION_ROOT_KEY (the key the API uses) first.');
    process.exit(1);
  }

  const documents = await prisma.vaultDocument.findMany({
    where: { deletedAt: null, isEncrypted: true },
    select: {
      id: true,
      userId: true,
      storagePath: true,
      currentVersion: true,
      versions: { select: { storagePath: true, versionNumber: true } },
    },
  });

  const counts = { files: 0, alreadyCurrent: 0, reencrypted: 0, missing: 0, failed: 0 };

  for (const doc of documents) {
    // The live file plus every stored version, each with the AAD it may carry.
    const files = new Map<string, string[]>();
    files.set(doc.storagePath, [`${doc.id}_v${doc.currentVersion}`]);
    for (const v of doc.versions) {
      if (!files.has(v.storagePath)) files.set(v.storagePath, [`${doc.id}_v${v.versionNumber}`]);
    }

    for (const [storagePath, legacyAads] of files) {
      counts.files += 1;
      try {
        const stored = await downloadBuffer(storagePath);
        if (!stored?.buffer) {
          counts.missing += 1;
          continue;
        }
        const rewritten = reencryptForCurrentKey(doc.userId, stored.buffer, doc.id, legacyAads);
        if (!rewritten) {
          counts.alreadyCurrent += 1;
          continue;
        }
        // Never write back something the API could not read.
        decryptBufferForUser(doc.userId, rewritten, doc.id);
        if (apply) await uploadBuffer(storagePath, rewritten, 'application/octet-stream');
        counts.reencrypted += 1;
      } catch (err) {
        counts.failed += 1;
        console.error(`  ${storagePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log(`${apply ? 'Applied' : 'Dry run'}: ${documents.length} documents`, counts);
  if (!apply && counts.reencrypted > 0) console.log('Re-run with --apply to rewrite these files.');
  await prisma.$disconnect();
  process.exit(counts.failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
