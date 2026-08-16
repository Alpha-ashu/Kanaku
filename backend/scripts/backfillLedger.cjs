const path = require('path');
const dotenv = require('dotenv');
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const { PrismaClient, Prisma } = require('../generated/prisma');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Decimal } = Prisma;

async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const separator = url.includes('?') ? '&' : '?';
    const cleanedUrl = url.replace(/[\?&]connection_limit=\d+/g, '');
    process.env.DATABASE_URL = cleanedUrl + separator + 'connection_limit=1';
  }

  // Prisma 7 requires a driver adapter — schema.prisma no longer carries a url
  // (see src/db/prisma.ts). Built from process.env.DATABASE_URL *after* the
  // connection_limit=1 rewrite above, so the adapter actually gets the capped URL.
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });
  const apply = process.argv.includes('--apply');

  console.log(`[Backfill] Starting ledger backfill (Mode: ${apply ? 'APPLY' : 'DRY-RUN / AUDIT-ONLY'})`);
  await prisma.$connect();

  // 1. Warm caches in exactly 2 DB queries to avoid sequential queries inside loop
  console.log('[Backfill] Warming cache for in-memory lookup...');
  const existingTransactionsList = await prisma.transaction.findMany({
    where: {
      deletedAt: null,
      idempotencyKey: { startsWith: 'backfill-' }
    },
    select: { idempotencyKey: true }
  });
  const existingTxKeys = new Set(existingTransactionsList.map(t => t.idempotencyKey));
  console.log(`[DEBUG-BACKFILL] Loaded ${existingTxKeys.size} existing backfill transaction keys. Sample:`, Array.from(existingTxKeys).slice(0, 5));

  const activeAccountsList = await prisma.account.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true }
  });
  const firstAccountMap = new Map();
  for (const acc of activeAccountsList) {
    if (!firstAccountMap.has(acc.userId)) {
      firstAccountMap.set(acc.userId, acc.id);
    }
  }

  const getFirstActiveAccount = (userId) => {
    return firstAccountMap.get(userId) || null;
  };

  const report = {
    groups: { processed: 0, missing: 0, items: [] },
    settlements: { processed: 0, missing: 0, items: [] },
    goals: { processed: 0, missing: 0, items: [] },
    investments: { processed: 0, missing: 0, items: [] },
    loans: { processed: 0, missing: 0, items: [] },
    loanPayments: { processed: 0, missing: 0, items: [] },
    accountAdjustments: new Map() // accountId -> Dec balance change
  };

  // Helper to record a pending ledger transaction leg
  const stageAdjustment = (accountId, type, amountVal) => {
    const amount = new Decimal(amountVal);
    const current = report.accountAdjustments.get(accountId) || new Decimal(0);
    const change = type === 'income' ? amount : amount.negated();
    report.accountAdjustments.set(accountId, current.add(change));
  };

  // ─── 1. Group Expenses ───
  const groupExpenses = await prisma.groupExpense.findMany({ where: { deletedAt: null } });
  for (const exp of groupExpenses) {
    report.groups.processed++;
    const key = `backfill-group-expense-${exp.id}`;
    const exists = existingTxKeys.has(key);
    console.log(`[DEBUG-BACKFILL] Group expense ${exp.id}: exists=${exists}, paidBy=${exp.paidBy}`);
    if (!exists) {
      report.groups.missing++;
      if (exp.paidBy) {
        stageAdjustment(exp.paidBy, 'expense', exp.totalAmount);
        report.groups.items.push({
          userId: exp.userId,
          accountId: exp.paidBy,
          amount: Number(exp.totalAmount),
          description: `Group Expense: ${exp.name}`,
          idempotencyKey: key,
          referenceId: exp.id,
          referenceType: 'GROUP_EXPENSE'
        });
      }
    }
  }

  // ─── 2. Group Settlements ───
  const groupMembers = await prisma.groupExpenseMember.findMany({
    where: { hasPaid: true, deletedAt: null },
    include: { groupExpense: true }
  });
  for (const m of groupMembers) {
    if (!m.groupExpense || m.groupExpense.deletedAt !== null) continue;
    report.settlements.processed++;
    const key = `backfill-group-settlement-${m.id}`;
    const exists = existingTxKeys.has(key);
    if (!exists) {
      report.settlements.missing++;
      const accountId = m.groupExpense.paidBy;
      if (accountId) {
        stageAdjustment(accountId, 'income', m.shareAmount);
        report.settlements.items.push({
          userId: m.groupExpense.userId,
          accountId,
          amount: Number(m.shareAmount),
          description: `Group Settlement: ${m.name} share paid`,
          idempotencyKey: key,
          referenceId: m.groupExpenseId,
          referenceType: 'GROUP_SETTLEMENT'
        });
      }
    }
  }

  // ─── 3. Goals (Historical currentAmount) ───
  const goals = await prisma.goal.findMany({ where: { deletedAt: null } });
  for (const goal of goals) {
    const currentAmt = Number(goal.currentAmount);
    if (currentAmt <= 0) continue;
    report.goals.processed++;
    const key = `backfill-goal-deposit-${goal.id}`;
    const exists = existingTxKeys.has(key);
    if (!exists) {
      const accountId = getFirstActiveAccount(goal.userId);
      if (accountId) {
        report.goals.missing++;
        stageAdjustment(accountId, 'expense', currentAmt);
        report.goals.items.push({
          userId: goal.userId,
          accountId,
          amount: currentAmt,
          description: `Backfilled contribution for goal: ${goal.name}`,
          idempotencyKey: key,
          referenceId: goal.id,
          referenceType: goal.isGroupGoal ? 'GROUP_GOAL' : 'GOAL'
        });
      }
    }
  }

  // ─── 4. Investments ───
  const investments = await prisma.investment.findMany({ where: { deletedAt: null } });
  for (const inv of investments) {
    report.investments.processed++;
    const key = `backfill-investment-${inv.id}`;
    const exists = existingTxKeys.has(key);
    if (!exists) {
      const accountId = getFirstActiveAccount(inv.userId);
      if (accountId) {
        report.investments.missing++;
        stageAdjustment(accountId, 'expense', inv.totalInvested);
        report.investments.items.push({
          userId: inv.userId,
          accountId,
          amount: Number(inv.totalInvested),
          description: `Investment Purchase: ${inv.assetName}`,
          idempotencyKey: key,
          referenceId: inv.id,
          referenceType: 'INVESTMENT'
        });
      }
    }
  }

  // ─── 5. Loans ───
  const loans = await prisma.loan.findMany({ where: { deletedAt: null } });
  for (const loan of loans) {
    report.loans.processed++;
    const key = `backfill-loan-disburse-${loan.id}`;
    const exists = existingTxKeys.has(key);
    if (!exists) {
      const accountId = getFirstActiveAccount(loan.userId);
      if (accountId) {
        report.loans.missing++;
        // If we borrowed, disbursement is income (cash came in); if we lent, disbursement is expense
        const type = loan.type === 'borrowed' ? 'income' : 'expense';
        stageAdjustment(accountId, type, loan.principalAmount);
        report.loans.items.push({
          userId: loan.userId,
          accountId,
          amount: Number(loan.principalAmount),
          type,
          description: `Loan Disbursement: ${loan.name}`,
          idempotencyKey: key,
          referenceId: loan.id,
          referenceType: 'LOAN'
        });
      }
    }
  }

  // ─── 6. Loan Payments ───
  const loanPayments = await prisma.loanPayment.findMany({
    where: { deletedAt: null },
    include: { loan: true }
  });
  for (const p of loanPayments) {
    if (!p.loan || p.loan.deletedAt !== null) continue;
    report.loanPayments.processed++;
    const key = `backfill-loan-payment-${p.id}`;
    const exists = existingTxKeys.has(key);
    if (!exists) {
      const accountId = p.accountId || getFirstActiveAccount(p.loan.userId);
      if (accountId) {
        report.loanPayments.missing++;
        // If loan was borrowed, paying it is an expense. If lent, receiving payment is income.
        const type = p.loan.type === 'borrowed' ? 'expense' : 'income';
        stageAdjustment(accountId, type, p.amount);
        report.loanPayments.items.push({
          userId: p.loan.userId,
          accountId,
          amount: Number(p.amount),
          type,
          description: `Loan Payment EMI: ${p.loan.name}`,
          idempotencyKey: key,
          referenceId: p.id,
          referenceType: 'LOAN_PAYMENT'
        });
      }
    }
  }

  // ─── Print Audit Report ───
  console.log('\n====================================================');
  console.log('            LEDGER BACKFILL AUDIT REPORT            ');
  console.log('====================================================');
  console.log(`Groups:      ${report.groups.processed} items processed, ${report.groups.missing} missing ledger entries.`);
  console.log(`Settlements: ${report.settlements.processed} items processed, ${report.settlements.missing} missing ledger entries.`);
  console.log(`Goals:       ${report.goals.processed} items processed, ${report.goals.missing} missing ledger entries.`);
  console.log(`Investments: ${report.investments.processed} items processed, ${report.investments.missing} missing ledger entries.`);
  console.log(`Loans:       ${report.loans.processed} items processed, ${report.loans.missing} missing ledger entries.`);
  console.log(`Payments:    ${report.loanPayments.processed} items processed, ${report.loanPayments.missing} missing ledger entries.`);
  console.log('----------------------------------------------------');
  console.log('Account Balance Changes (Expected adjustment):');
  for (const [accId, change] of report.accountAdjustments.entries()) {
    const acc = await prisma.account.findUnique({ where: { id: accId } });
    const accName = acc ? acc.name : 'Unknown Account';
    const oldBal = acc ? Number(acc.balance) : 0;
    console.log(`  - Account "${accName}" (${accId}): Change of ₹${change.toFixed(2)} (Current: ₹${oldBal.toFixed(2)} -> Expected: ₹${(oldBal + change.toNumber()).toFixed(2)})`);
  }
  console.log('====================================================\n');

  if (!apply) {
    console.log('[Backfill] Running in DRY-RUN mode. No database modifications have been made.');
    console.log('[Backfill] To apply these missing ledger entries and adjust balances, run with the --apply flag:');
    console.log('  node scripts/backfillLedger.cjs --apply');
    await prisma.$disconnect();
    return;
  }

  // ─── Apply Modifications ───
  console.log('[Backfill] Manual Approval Check: --apply flag active. Starting transaction block...');
  
  const allStaged = [
    ...report.groups.items.map(i => ({ ...i, module: 'GROUPS' })),
    ...report.settlements.items.map(i => ({ ...i, module: 'GROUPS' })),
    ...report.goals.items.map(i => ({ ...i, module: 'GOALS' })),
    ...report.investments.items.map(i => ({ ...i, module: 'INVESTMENTS' })),
    ...report.loans.items.map(i => ({ ...i, module: 'LOANS' })),
    ...report.loanPayments.items.map(i => ({ ...i, module: 'LOANS' }))
  ];

  if (allStaged.length === 0) {
    console.log('[Backfill] Ledger is already 100% complete. No pending entries to write.');
    await prisma.$disconnect();
    return;
  }

  // Capture account balances before applying updates
  const balancesBefore = new Map();
  for (const accId of report.accountAdjustments.keys()) {
    const acc = await prisma.account.findUnique({ where: { id: accId } });
    if (acc) {
      balancesBefore.set(accId, new Decimal(acc.balance));
    }
  }

  const { FinancialLedgerService } = require('../src/features/transactions/ledger.service');
  for (const item of allStaged) {
    await prisma.$transaction(async (tx) => {
      await FinancialLedgerService.postJournalEntry(
        tx,
        {
          userId: item.userId,
          sourceModule: item.module,
          referenceType: item.referenceType,
          referenceId: item.referenceId,
          description: item.description,
          createdBy: 'system-backfill',
          createdFrom: 'scripts/backfillLedger.cjs'
        },
        [{
          accountId: item.accountId,
          type: item.type || (item.referenceType === 'GROUP_SETTLEMENT' ? 'income' : 'expense'),
          amount: item.amount,
          category: item.referenceType === 'GROUP_SETTLEMENT' ? 'Group Settlement' : (item.referenceType === 'LOAN_PAYMENT' ? 'Loan EMI' : item.referenceType),
          description: item.description,
          idempotencyKey: item.idempotencyKey
        }]
      );
    }, { timeout: 30000 });
  }

  console.log('[Backfill] Transaction committed successfully! All missing ledger logs created.');

  // Verification phase
  console.log('[Backfill] Starting post-backfill verification...');
  let totalMismatches = 0;
  for (const [accId, change] of report.accountAdjustments.entries()) {
    const acc = await prisma.account.findUnique({ where: { id: accId } });
    if (acc) {
      const oldBal = balancesBefore.get(accId) || new Decimal(0);
      const actualChange = new Decimal(acc.balance).sub(oldBal);
      
      if (!actualChange.equals(change)) {
        console.error(`[Backfill] [Reconcile Error] Balance mismatch on Account "${acc.name}": Expected change ${change.toFixed(2)}, Found change ${actualChange.toFixed(2)}`);
        totalMismatches++;
      } else {
        console.log(`[Backfill] Account "${acc.name}" reconciled successfully.`);
      }
    }
  }

  if (totalMismatches > 0) {
    console.error(`[Backfill] Verification failed: ${totalMismatches} account drift issues found.`);
    process.exit(1);
  } else {
    console.log('[Backfill] Verification PASSED. Zero balance drift detected.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[Backfill] Script failed:', err);
  process.exit(1);
});
