/**
 * add-opening-balance-column.cjs
 *
 * Permanent fix: introduces a stored `openingBalance` on accounts so the opening
 * balance can never be silently zeroed again, and the invariant
 *     balance = openingBalance + Σ(transaction deltas)
 * is explicit and auditable.
 *
 * Steps (idempotent):
 *   1. ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "openingBalance" ...
 *   2. Backfill openingBalance = balance − ledgerNet for every account, so the
 *      CURRENT balance is preserved exactly and the opening is recovered.
 *
 * Run AFTER fix-demo-account-balances.cjs so demo openings come out as the
 * intended figures (₹5,000 cash, ₹2,85,000 savings, …).
 *
 * Print-only by default. Pass --apply to execute.
 *   node scripts/add-opening-balance-column.cjs
 *   node scripts/add-opening-balance-column.cjs --apply
 *
 * After applying, run `npx prisma generate` so the client picks up the field.
 */

'use strict';

try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch { /* optional */ }

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const ADD_COLUMN = `
  ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;
`;

// balance − ledgerNet, mirroring transaction.service.ts getBalanceImpactDeltas.
const BACKFILL = `
  UPDATE "accounts" a
  SET "openingBalance" = a."balance" - COALESCE((
    SELECT SUM(
      CASE
        WHEN t."type" = 'transfer' AND t."accountId" = a."id"           THEN -ABS(t."amount")
        WHEN t."type" = 'transfer' AND t."transferToAccountId" = a."id" THEN  ABS(t."amount")
        WHEN t."type" = 'income'   AND t."accountId" = a."id"           THEN  ABS(t."amount")
        WHEN t."accountId" = a."id"                                     THEN -ABS(t."amount")
        ELSE 0
      END
    )
    FROM "transactions" t
    WHERE (t."accountId" = a."id" OR t."transferToAccountId" = a."id")
      AND t."deletedAt" IS NULL
  ), 0);
`;

async function main() {
  if (!APPLY) {
    console.log('[opening-balance] DRY-RUN. The following SQL would run with --apply:\n');
    console.log(ADD_COLUMN);
    console.log(BACKFILL);
    console.log('[opening-balance] Re-run with --apply to execute, then `npx prisma generate`.');
    return;
  }

  console.log('[opening-balance] Adding "openingBalance" column...');
  await prisma.$executeRawUnsafe(ADD_COLUMN);
  console.log('[opening-balance] Backfilling openingBalance = balance − ledgerNet...');
  const affected = await prisma.$executeRawUnsafe(BACKFILL);
  console.log(`[opening-balance] Backfilled ${affected} account row(s).`);

  // Spot-check
  const sample = await prisma.$queryRawUnsafe(
    `SELECT name, "openingBalance", balance FROM "accounts" ORDER BY "createdAt" DESC LIMIT 8;`
  );
  console.log('\n[opening-balance] Sample after backfill:');
  for (const r of sample) {
    console.log(`   ${String(r.name).padEnd(28)} opening ${r.openingBalance}   balance ${r.balance}`);
  }
  console.log('\n[opening-balance] Done. Run `npx prisma generate` to update the client.');
}

main()
  .catch((err) => { console.error('[opening-balance] Fatal:', err.message); console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
