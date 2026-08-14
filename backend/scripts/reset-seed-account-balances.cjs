#!/usr/bin/env node
/**
 * Reset nonsensical negative balances on SEED accounts only.
 *
 * Context (audited 2026-08-14): 31 accounts carry a negative balance. Nine of
 * them are `credit` accounts, where negative is correct and expected —
 * NEGATIVE_BALANCE_ALLOWED_TYPES in backend/src/utils/money.ts exempts
 * credit/credit_card/overdraft/loan from the no-overdraw rule, so a credit card
 * at -5,429 is simply an outstanding balance. Those are left alone.
 *
 * The other 22 are `bank`, `cash` and `wallet` accounts, which the same rule
 * says may never go below zero — a savings account at -9,933,838 or a
 * "Cash on Hand" at -1,050 is impossible, not merely unusual. They come from
 * two seed batches (2026-06-23 and 2026-06-27), have zero transactions, and
 * 21 of the 22 belong to @kanaku.com role fixtures.
 *
 * The 22nd belongs to a real address (shaik.job.details@gmail.com) and is NOT
 * touched here — see SEED_EMAIL_PATTERN. Decide that one deliberately.
 *
 * Safety: dry-run by default (rolls back and prints the diff). Pass --apply to
 * commit. Three independent guards, all in the WHERE clause, so none can be
 * skipped by accident:
 *   1. balance < 0                     — never touches a healthy account
 *   2. type not in the negative-allowed set — never touches a credit/loan account
 *   3. no transactions whatsoever      — never rewrites an account with history,
 *                                        whose balance is real bookkeeping
 * plus an owner-email allowlist.
 *
 * Usage:
 *   node backend/scripts/reset-seed-account-balances.cjs            # dry run
 *   node backend/scripts/reset-seed-account-balances.cjs --apply    # commit
 */
const path = require('path');
const fs = require('fs');
const { Client } = require(path.join(__dirname, '../../node_modules/pg'));

const APPLY = process.argv.includes('--apply');

// Only @kanaku.com role fixtures. Widen deliberately, never casually.
const SEED_EMAIL_PATTERN = '%@kanaku.com';

// Mirrors NEGATIVE_BALANCE_ALLOWED_TYPES in backend/src/utils/money.ts.
const NEGATIVE_ALLOWED = ['credit', 'credit_card', 'overdraft', 'loan'];

// Sensible opening figures per account type, in INR.
const SEED_BALANCE_BY_TYPE = { bank: 50000, wallet: 2000, cash: 1500 };
const SEED_BALANCE_DEFAULT = 5000;

function connectionString() {
  const envPath = path.join(__dirname, '../.env');
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const pick = (k) => {
    const m = raw.match(new RegExp('^' + k + '\\s*=\\s*"?([^"\\r\\n]+)"?', 'm'));
    return m && m[1];
  };
  return process.env.DIRECT_URL || pick('DIRECT_URL') || process.env.DATABASE_URL || pick('DATABASE_URL');
}

(async () => {
  const c = new Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await c.connect();

  const selection = `
    FROM public."Account" a
    JOIN public."User" u ON u.id = a."userId"
    WHERE a.balance < 0
      AND lower(a.type) <> ALL($1::text[])
      AND u.email LIKE $2
      AND NOT EXISTS (
        SELECT 1 FROM public."Transaction" t
        WHERE t."accountId" = a.id OR t."transferToAccountId" = a.id
      )`;

  const targets = await c.query(
    `SELECT a.id, a.name, a.type, a.balance, u.email ${selection} ORDER BY a.balance ASC`,
    [NEGATIVE_ALLOWED, SEED_EMAIL_PATTERN]);

  if (!targets.rowCount) {
    console.log('Nothing to do — no seed account matches all guards.');
    await c.end();
    return;
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${targets.rowCount} seed account(s):\n`);
  console.table(targets.rows.map((r) => ({
    email: r.email,
    account: r.name,
    type: r.type,
    from: r.balance,
    to: SEED_BALANCE_BY_TYPE[String(r.type).toLowerCase()] ?? SEED_BALANCE_DEFAULT,
  })));

  await c.query('BEGIN');

  // openingBalance moves with balance: these accounts have no transactions, so
  // the invariant balance = openingBalance + ledger requires the two to match.
  // Leaving openingBalance behind would immediately re-break what
  // 20260814010000_backfill_opening_balance just fixed.
  const res = await c.query(
    `UPDATE public."Account" acc
        SET balance = v.amount, "openingBalance" = v.amount, "updatedAt" = NOW()
       FROM (
         SELECT a.id,
                COALESCE(
                  (SELECT amount FROM (VALUES
                     ('bank', ${SEED_BALANCE_BY_TYPE.bank}::numeric),
                     ('wallet', ${SEED_BALANCE_BY_TYPE.wallet}::numeric),
                     ('cash', ${SEED_BALANCE_BY_TYPE.cash}::numeric)
                   ) AS m(t, amount) WHERE m.t = lower(a.type)),
                  ${SEED_BALANCE_DEFAULT}::numeric
                ) AS amount
         ${selection}
       ) v
      WHERE acc.id = v.id`,
    [NEGATIVE_ALLOWED, SEED_EMAIL_PATTERN]);

  // Post-condition: no non-seed or credit account may have been caught.
  const strayed = await c.query(
    `SELECT count(*)::int n FROM public."Account" a JOIN public."User" u ON u.id=a."userId"
      WHERE a."updatedAt" > NOW() - INTERVAL '1 minute'
        AND (u.email NOT LIKE $1 OR lower(a.type) = ANY($2::text[]))`,
    [SEED_EMAIL_PATTERN, NEGATIVE_ALLOWED]);
  if (strayed.rows[0].n > 0) {
    await c.query('ROLLBACK');
    console.error(`\nABORTED: ${strayed.rows[0].n} out-of-scope account(s) would change.`);
    process.exit(1);
  }

  if (APPLY) {
    await c.query('COMMIT');
    console.log(`\nCOMMITTED — ${res.rowCount} account(s) reset.`);
  } else {
    await c.query('ROLLBACK');
    console.log(`\nROLLED BACK — ${res.rowCount} would change. Re-run with --apply to commit.`);
  }

  await c.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
