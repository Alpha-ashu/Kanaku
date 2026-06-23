/**
 * fix-demo-account-balances.cjs
 *
 * Repairs the demo/mock accounts whose opening balance was lost — their stored
 * `balance` is currently the bare sum of transactions (opening = 0), which is
 * why cash/wallet accounts show negative figures.
 *
 * For each demo account it restores the INTENDED opening balance (from the seed
 * config) by setting:
 *     balance = openingBalance + ledgerNet
 * so that the displayed balance reconciles as
 *     Opening + Income + TransfersIn − Expenses − TransfersOut = Current.
 *
 * The backend has no `openingBalance` column, so the opening is encoded into the
 * stored balance; the frontend then back-derives the same opening (balance −
 * ledger) and shows Opening · Previous · Current correctly.
 *
 * DRY-RUN by default. Pass --apply to persist.
 *   node scripts/fix-demo-account-balances.cjs
 *   node scripts/fix-demo-account-balances.cjs --apply
 */

'use strict';

try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch { /* optional */ }

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

// Intended OPENING balances, keyed by user email → account name.
// Mirrors seedAccounts() in seed-mock-data.cjs.
const OPENINGS = {
  'admin@kanaku.com': {
    'HDFC Savings – Arjun': 285000,
    'HDFC Regalia Credit Card': -18500,
    'Cash on Hand': 5000,
    'GPay Wallet': 3200,
  },
  'manager@kanaku.com': {
    'SBI Savings – Priya': 142000,
    'SBI SimplyCLICK Card': -9200,
    'Cash Wallet': 2500,
    'Paytm Wallet': 1800,
  },
  'advisor@kanaku.com': {
    'Axis Bank Savings – Vikram': 380000,
    'Axis Bank Privilege Card': -24000,
    'Cash on Hand': 8000,
    'PhonePe Wallet': 4500,
  },
  'user@kanaku.com': {
    'ICICI Savings – Ananya': 45000,
    'ICICI Platinum Card': -6800,
    'Cash Wallet': 1500,
    'Paytm Wallet': 800,
  },
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function deltaForAccount(tx, accountId) {
  const amount = Math.abs(Number(tx.amount) || 0);
  if (amount <= 0) return 0;
  if (tx.type === 'transfer') {
    if (tx.accountId === accountId) return -amount;
    if (tx.transferToAccountId === accountId) return amount;
    return 0;
  }
  if (tx.accountId !== accountId) return 0;
  return tx.type === 'income' ? amount : -amount;
}

async function main() {
  console.log(`[fix-balances] ${APPLY ? 'APPLYING' : 'DRY-RUN'} — restoring opening balances for demo accounts.\n`);
  let changed = 0;

  for (const [email, openings] of Object.entries(OPENINGS)) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) { console.log(`  (skip) ${email} not found`); continue; }

    const accounts = await prisma.account.findMany({
      where: { userId: user.id, isActive: true, deletedAt: null },
      // Explicit select so the repair runs whether or not openingBalance exists yet.
      select: { id: true, name: true, balance: true },
    });

    console.log(`USER ${email}`);
    for (const account of accounts) {
      const opening = openings[account.name];
      if (opening === undefined) { console.log(`   · ${account.name}: no opening config — skipped`); continue; }

      const txns = await prisma.transaction.findMany({
        where: { userId: user.id, deletedAt: null, OR: [{ accountId: account.id }, { transferToAccountId: account.id }] },
      });
      const ledgerNet = round2(txns.reduce((sum, tx) => sum + deltaForAccount(tx, account.id), 0));
      const target = round2(opening + ledgerNet);
      const current = round2(account.balance);

      if (current === target) {
        console.log(`   ✓ ${account.name}: already correct (${money(current)})`);
        continue;
      }

      console.log(`   → ${account.name}: ${money(current)}  ⇒  ${money(target)}   (opening ${money(opening)} + ledger ${money(ledgerNet)})`);
      changed += 1;
      if (APPLY) {
        await prisma.account.update({ where: { id: account.id }, data: { balance: target, updatedAt: new Date() } });
      }
    }
    console.log('');
  }

  console.log(`[fix-balances] ${APPLY ? 'Updated' : 'Would update'} ${changed} account(s).`);
  if (!APPLY && changed > 0) console.log('[fix-balances] Re-run with --apply to persist.');
}

main()
  .catch((err) => { console.error('[fix-balances] Fatal:', err.message); console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
