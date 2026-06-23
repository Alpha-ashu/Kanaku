/**
 * verify-account-balances.cjs
 *
 * Read-only audit of every account's balance against its transaction ledger.
 * For each user (role) and account it reports:
 *   Opening (implied) · Income · Expenses · Transfers In · Transfers Out
 *   Ledger Net · Stored Balance · Δ mismatch · duplicate transactions
 *
 * The canonical formula (matches transaction.service.ts getBalanceImpactDeltas):
 *   Ledger Net   = Income + TransfersIn − Expenses − TransfersOut
 *   Implied Open = StoredBalance − Ledger Net
 * Because the backend has no `openingBalance` column, the stored balance is a
 * running total. This script surfaces the implied opening so you can confirm it
 * is a sensible starting figure, and flags content-duplicate transactions that
 * would inflate (often negatively) the running balance.
 *
 * Usage (Fly.io):
 *   fly ssh console --app kanaku
 *   > node scripts/verify-account-balances.cjs
 *   > node scripts/verify-account-balances.cjs --email user@kanaku.com
 *
 * Read-only: it never writes. Pair it with a follow-up repair once the report
 * confirms the root cause.
 */

'use strict';

// Load backend/.env when run locally (Fly already has env vars in scope).
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch { /* dotenv optional */ }

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const emailFilter = (() => {
  const i = args.indexOf('--email');
  return i !== -1 ? args[i + 1] : null;
})();

const money = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Signed effect of one transaction on `accountId`, mirroring the backend service. */
function deltaForAccount(tx, accountId) {
  const amount = Math.abs(Number(tx.amount) || 0);
  if (amount <= 0) return 0;
  if (tx.type === 'transfer') {
    if (tx.accountId === accountId) return -amount;
    if (tx.transferToAccountId === accountId) return amount;
    return 0;
  }
  if (tx.accountId !== accountId) return 0;
  if (tx.type === 'income') return amount;
  return -amount; // expense / withdrawal
}

async function auditUser(user) {
  const accounts = await prisma.account.findMany({
    where: { userId: user.id, isActive: true, deletedAt: null },
    // Explicit select so the audit runs whether or not openingBalance exists yet.
    select: { id: true, name: true, type: true, currency: true, balance: true },
    orderBy: { createdAt: 'asc' },
  });
  if (accounts.length === 0) return { mismatches: 0, duplicates: 0 };

  console.log(`\n──────────────────────────────────────────────────────────────`);
  console.log(`USER  ${user.email}  (${user.role || 'user'})  ${user.id}`);
  console.log(`──────────────────────────────────────────────────────────────`);

  let mismatches = 0;
  let duplicates = 0;

  for (const account of accounts) {
    const txns = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        OR: [{ accountId: account.id }, { transferToAccountId: account.id }],
      },
    });

    let income = 0, expenses = 0, transfersIn = 0, transfersOut = 0, net = 0;
    for (const tx of txns) {
      const amount = Math.abs(Number(tx.amount) || 0);
      if (amount <= 0) continue;
      if (tx.type === 'transfer') {
        if (tx.transferToAccountId === account.id) transfersIn += amount;
        if (tx.accountId === account.id) transfersOut += amount;
      } else if (tx.accountId === account.id) {
        if (tx.type === 'income') income += amount;
        else expenses += amount;
      }
      net += deltaForAccount(tx, account.id);
    }
    net = round2(net);

    const stored = round2(account.balance);
    const impliedOpening = round2(stored - net);

    // Content-duplicate detection: identical rows that escaped the dedupHash
    // unique constraint (e.g. null/divergent hashes from older imports/sync).
    const seen = new Map();
    const dupKeys = [];
    for (const tx of txns) {
      if (tx.accountId !== account.id) continue; // count each row once, on its source account
      const key = `${tx.type}|${round2(tx.amount)}|${new Date(tx.date).toISOString()}|${(tx.description || '').trim().toLowerCase()}`;
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      if (count === 2) dupKeys.push(key);
    }
    const dupCount = dupKeys.reduce((sum, k) => sum + (seen.get(k) - 1), 0);
    if (dupCount > 0) duplicates += dupCount;

    // A negative opening is normal for credit/card accounts (carried debt) but a
    // red flag for asset accounts (bank/cash/wallet). Duplicates are always bad.
    const isDebtAccount = account.type === 'credit' || account.type === 'card';
    const badOpening = impliedOpening < 0 && !isDebtAccount;
    const suspicious = dupCount > 0 || badOpening;
    if (suspicious) mismatches += 1;

    console.log(`\n  ${account.name}  [${account.type}]  ${account.currency}`);
    console.log(`    Stored Balance : ${money(stored)}`);
    console.log(`    Implied Opening: ${money(impliedOpening)}${badOpening ? '   ⚠ negative opening on an asset account' : ''}`);
    console.log(`    + Income       : ${money(income)}`);
    console.log(`    + Transfers In : ${money(transfersIn)}`);
    console.log(`    - Expenses     : ${money(expenses)}`);
    console.log(`    - Transfers Out: ${money(transfersOut)}`);
    console.log(`    = Ledger Net   : ${money(net)}   (${txns.filter(t => t.accountId === account.id).length} txns)`);
    console.log(`    Reconciles     : Opening ${money(impliedOpening)} + Net ${money(net)} = ${money(round2(impliedOpening + net))} vs stored ${money(stored)}  ${round2(impliedOpening + net) === stored ? '✓' : '✗ MISMATCH'}`);
    if (dupCount > 0) {
      console.log(`    ⚠ DUPLICATES   : ${dupCount} duplicate transaction row(s) detected — these double-count and skew the balance.`);
      for (const k of dupKeys) {
        const [type, amt, date] = k.split('|');
        console.log(`        × ${seen.get(k)} : ${type} ${money(amt)} on ${date.slice(0, 10)}`);
      }
    }
  }

  return { mismatches, duplicates };
}

async function main() {
  console.log('[verify-balances] Auditing account balances against the transaction ledger...');

  const where = emailFilter ? { email: emailFilter } : {};
  const users = await prisma.user.findMany({
    where,
    select: { id: true, email: true, role: true },
    orderBy: { email: 'asc' },
  });

  if (users.length === 0) {
    console.log(emailFilter ? `No user found for ${emailFilter}` : 'No users found.');
    return;
  }

  let totalMismatch = 0;
  let totalDup = 0;
  for (const user of users) {
    const { mismatches, duplicates } = await auditUser(user);
    totalMismatch += mismatches;
    totalDup += duplicates;
  }

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`[verify-balances] Done. Accounts flagged: ${totalMismatch} · duplicate rows: ${totalDup}`);
  if (totalDup > 0) {
    console.log('[verify-balances] Duplicates found → run the repair step to remove them and reverse their balance impact.');
  } else if (totalMismatch === 0) {
    console.log('[verify-balances] All accounts reconcile with their ledger. ✓');
  }
}

main()
  .catch((err) => {
    console.error('[verify-balances] Fatal error:', err.message);
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
