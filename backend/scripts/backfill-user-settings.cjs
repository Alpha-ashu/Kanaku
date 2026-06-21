/**
 * One-time backfill for UserSettings (Phase B of the schema de-duplication work).
 *
 * Fixes two historical problems in the `UserSettings` table:
 *   1. Double-encoding — `settings` was stored as a JSON *string* inside a Json
 *      column, so the API returned `settings: "{...}"` instead of an object.
 *   2. Duplicated keys — the blob repeated values that already have dedicated
 *      columns (`timezone`, `currency`/`defaultCurrency`, `language`/`languageLabel`,
 *      `theme`), so the same value lived in two places.
 *
 * For every row this script:
 *   - parses the blob (string → object),
 *   - lifts a real blob value into its column when the column is still at its
 *     default (so we don't lose a user's currency/language/timezone),
 *   - strips the column-owned keys from the blob,
 *   - rewrites `settings` as a real object.
 *
 * Idempotent — safe to run more than once. Dry-run by default; pass --apply to write.
 *
 *   node ./scripts/backfill-user-settings.cjs            # dry run (no writes)
 *   node ./scripts/backfill-user-settings.cjs --apply    # persist changes
 */
const path = require('node:path');
const { PrismaClient } = require('../generated/prisma');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const COLUMN_OWNED_BLOB_KEYS = ['theme', 'language', 'languageLabel', 'currency', 'defaultCurrency', 'timezone'];
const COLUMN_DEFAULTS = { theme: 'light', language: 'en', currency: 'USD', timezone: 'UTC' };
const LANGUAGE_LABEL_TO_CODE = {
  english: 'en', hindi: 'hi', spanish: 'es', french: 'fr', arabic: 'ar',
};

function toObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function resolveLanguageCode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return undefined;
  return LANGUAGE_LABEL_TO_CODE[v] || (v.length <= 3 ? v : undefined);
}

async function main() {
  const rows = await prisma.userSettings.findMany();
  console.log(`Found ${rows.length} UserSettings row(s). Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  let changed = 0;
  for (const row of rows) {
    const blob = toObject(row.settings);
    const columnUpdates = {};

    // Lift blob values into columns only when the column is still at default.
    if (row.theme === COLUMN_DEFAULTS.theme && blob.theme) columnUpdates.theme = String(blob.theme);
    if (row.currency === COLUMN_DEFAULTS.currency && (blob.currency || blob.defaultCurrency)) {
      columnUpdates.currency = String(blob.currency || blob.defaultCurrency).toUpperCase();
    }
    if (row.timezone === COLUMN_DEFAULTS.timezone && blob.timezone) columnUpdates.timezone = String(blob.timezone);
    if (row.language === COLUMN_DEFAULTS.language) {
      const code = resolveLanguageCode(blob.language || blob.languageLabel);
      if (code) columnUpdates.language = code;
    }

    // Strip column-owned keys from the blob.
    const cleanedBlob = { ...blob };
    for (const key of COLUMN_OWNED_BLOB_KEYS) delete cleanedBlob[key];

    const blobWasString = typeof row.settings === 'string';
    const blobHadOwnedKeys = COLUMN_OWNED_BLOB_KEYS.some((k) => k in blob);
    const needsWrite = blobWasString || blobHadOwnedKeys || Object.keys(columnUpdates).length > 0;

    if (!needsWrite) continue;
    changed++;

    console.log(
      `  user ${row.userId}: ${blobWasString ? '[decode] ' : ''}` +
      `${blobHadOwnedKeys ? `[strip ${COLUMN_OWNED_BLOB_KEYS.filter((k) => k in blob).join(',')}] ` : ''}` +
      `${Object.keys(columnUpdates).length ? `[lift ${JSON.stringify(columnUpdates)}] ` : ''}`,
    );

    if (APPLY) {
      await prisma.userSettings.update({
        where: { id: row.id },
        data: { ...columnUpdates, settings: cleanedBlob },
      });
    }
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'} ${changed} row(s).`);
  if (!APPLY && changed > 0) console.log('Re-run with --apply to persist.');
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
