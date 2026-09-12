#!/usr/bin/env node
/**
 * Repair SEED accounts whose balance ≠ openingBalance + ledger.
 *
 * Context (audited 2026-09-13): the admin reconciler reported 26 drifting
 * accounts. 25 are fixtures written by two seed bugs, now fixed:
 *   - seed-demo-accounts.cjs created "HDFC Salary Account" (balance =
 *     openingBalance) and then createMany'd four transactions without booking
 *     them — all five demouser accounts off by exactly −90,550.
 *   - seed-test-users.cjs never set openingBalance (0) and created 11–16
 *     transactions per testadvisor without booking them — 20 accounts.
 * The 26th belongs to a real user and is deliberately out of scope (see
 * SEED_EMAIL_PATTERN): its drift is a client pushing a stale balance, not a seed.
 *
 * Repair rule: the figure the seed wrote into `balance` was the intended OPENING
 * balance, so
 *     openingBalance := balance
 *     balance        := balance + ledger
 * which restores the invariant and leaves transaction history untouched.
 *
 * Safety: dry-run by default (rolls back and prints before/after). Pass --apply
 * to commit. Every guard is in the WHERE clause:
 *   1. owner email matches SEED_EMAIL_PATTERN        — fixtures only
 *   2. the account currently drifts                  — never touches a clean one
 *   3. openingBalance is 0 or equals balance         — the two seed signatures
 *   4. every transaction on the account was created within an hour of the
 *      account itself                                — never rewrites an account
 *      someone has since used through the app, where the stored balance already
 *      includes real deltas and this rule would double-count them
 *
 * Usage:
 *   node backend/scripts/reconcile-seed-account-balances.cjs            # dry run
 *   node backend/scripts/reconcile-seed-account-balances.cjs --apply    # commit
 */
const path = require('path');
const fs = require('fs');
const { Client } = require(path.join(__dirname, '../../node_modules/pg'));

const APPLY = process.argv.includes('--apply');

// Only @kanaku.com role fixtures. Widen deliberately, never casually.
const SEED_EMAIL_PATTERN = '%@kanaku.com';

function connectionString() {
  const envPath = path.join(__dirname, '../.env');
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const pick = (k) => {
    const m = raw.match(new RegExp('^' + k + '\\s*=\\s*"?([^"\\r\\n]+)"?', 'm'));
    return m && m[1];
  };
  return process.env.DIRECT_URL || pick('DIRECT_URL') || process.env.DATABASE_URL || pick('DATABASE_URL');
}

// Mirrors reconcileLedger in src/features/admin/reconcile.controller.ts:
// POSTED, non-deleted rows; income/transfer_in credit, expense/transfer_out/
// transfer debit the row's account; a single-row transfer credits transferToAccountId.
const LEDGER_CTE = `
  ledger AS (
    SELECT account_id, SUM(delta) AS delta FROM (
      SELECT t."accountId" AS account_id,
             CASE lower(t.type)
               WHEN 'income' THEN t.amount
               WHEN 'transfer_in' THEN t.amount
               WHEN 'expense' THEN -t.amount
               WHEN 'transfer_out' THEN -t.amount
               WHEN 'transfer' THEN -t.amount
               ELSE 0
             END AS delta
        FROM "Transaction" t
       WHERE t.status = 'POSTED' AND t."deletedAt" IS NULL
      UNION ALL
      SELECT t."transferToAccountId", t.amount
        FROM "Transaction" t
       WHERE t.type = 'transfer' AND t."transferToAccountId" IS NOT NULL
         AND t.status = 'POSTED' AND t."deletedAt" IS NULL
    ) legs
    GROUP BY account_id
  )`;

const CANDIDATES = `
  WITH ${LEDGER_CTE}
  SELECT a.id, u.email, a.name, a.type,
         a.balance AS balance, a."openingBalance" AS opening,
         COALESCE(l.delta, 0) AS ledger
    FROM "Account" a
    JOIN "User" u ON u.id = a."userId"
    LEFT JOIN ledger l ON l.account_id = a.id
   WHERE u.email LIKE $1
     AND a."deletedAt" IS NULL
     AND a.balance <> a."openingBalance" + COALESCE(l.delta, 0)
     AND (a."openingBalance" = 0 OR a."openingBalance" = a.balance)
     AND NOT EXISTS (
       SELECT 1 FROM "Transaction" t
        WHERE (t."accountId" = a.id OR t."transferToAccountId" = a.id)
          AND t."createdAt" > a."createdAt" + interval '1 hour'
     )
   ORDER BY u.email, a.name`;

(async () => {
  const c = new Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(CANDIDATES, [SEED_EMAIL_PATTERN]);
    if (rows.length === 0) {
      console.log('No seed accounts drift. Nothing to do.');
      await c.query('ROLLBACK');
      return;
    }

    for (const r of rows) {
      const newBalance = Number(r.balance) + Number(r.ledger);
      console.log(
        `${r.email.padEnd(26)} ${r.name.padEnd(38)} ` +
        `opening ${Number(r.opening)} -> ${Number(r.balance)}   balance ${Number(r.balance)} -> ${newBalance}`,
      );
    }

    const ids = rows.map((r) => r.id);
    const res = await c.query(
      `WITH ${LEDGER_CTE}
       UPDATE "Account" a
          SET "openingBalance" = a.balance,
              balance = a.balance + COALESCE((SELECT delta FROM ledger WHERE account_id = a.id), 0),
              "updatedAt" = now()
        WHERE a.id = ANY($1::text[])`,
      [ids],
    );

    // Re-check inside the transaction: every repaired account must now satisfy the invariant.
    const { rows: still } = await c.query(
      `WITH ${LEDGER_CTE}
       SELECT a.id FROM "Account" a LEFT JOIN ledger l ON l.account_id = a.id
        WHERE a.id = ANY($1::text[]) AND a.balance <> a."openingBalance" + COALESCE(l.delta, 0)`,
      [ids],
    );
    if (still.length > 0) {
      throw new Error(`${still.length} account(s) still drift after repair — rolled back`);
    }

    if (APPLY) {
      await c.query('COMMIT');
      console.log(`\nCommitted: ${res.rowCount} seed account(s) repaired.`);
    } else {
      await c.query('ROLLBACK');
      console.log(`\nDry run: ${res.rowCount} seed account(s) would be repaired (rolled back). Re-run with --apply to commit.`);
    }
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
