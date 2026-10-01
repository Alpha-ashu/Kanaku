/**
 * Data portability (GDPR Art. 20 / DPDP): everything a user owns, in one JSON
 * document they can keep, inspect, or import back into KANAKU.
 *
 * Shape (format 'kanaku-export', schemaVersion 2):
 *   - `accounts` and `transactions` sit at the TOP level, with transactions
 *     referring to accounts by `accountId` / `transferToAccountId`, which is the
 *     "structured ledger" shape the in-app importer already understands — an
 *     export is also a restorable backup.
 *   - Only allowlisted user fields leave the server: no password hash, sync
 *     token or internal status flags. Storage paths, encryption IVs, device push
 *     tokens and provider payment ids are dropped everywhere.
 *   - Soft-deleted rows are left out: the user deleted them.
 *   - Large tables are capped; `truncated` says which ones hit the cap.
 */
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';

export const EXPORT_FORMAT = 'kanaku-export';
export const EXPORT_SCHEMA_VERSION = 2;

const CAPS = {
  transactions: 50_000,
  goalContributions: 50_000,
  loanPayments: 50_000,
  notifications: 5_000,
  walletTransactions: 50_000,
} as const;

/** Keys that are sync/idempotency/crypto plumbing, never user data. */
const INTERNAL_KEYS = new Set([
  'userId', 'deviceId', 'syncStatus', 'synced', 'clientRequestId', 'dedupHash', 'version',
  'idempotencyKey', 'ledgerVersion', 'sequenceNumber', 'journalEntryId', 'encryptedPayload',
  'errorMessage', 'attempts', 'nextRetryAt', 'requestId', 'deliveryStatus', 'dedupKey',
  'storagePath', 'encryptionIv', 'sha256', 'fcmToken', 'apnsToken', 'publicKey',
  'providerOrderId', 'providerPaymentId', 'providerRefundId', 'actorId',
  'panDocumentPath', 'aadhaarDocumentPath', 'certDocumentPath', 'scanResult',
]);

const clean = <T extends Record<string, unknown>>(row: T): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!INTERNAL_KEYS.has(key)) out[key] = value;
  }
  return out;
};
const cleanAll = <T extends Record<string, unknown>>(rows: T[]) => rows.map(clean);

const hasTable = async (name: string) => {
  const [row] = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT to_regclass('public.${name}') IS NOT NULL AS ok`,
  );
  return Boolean(row?.ok);
};

export async function buildUserExport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, role: true, emailVerified: true,
      city: true, state: true, country: true, gender: true, avatarId: true,
      createdAt: true, updatedAt: true,
    },
  });
  if (!user) throw AppError.notFound('User');

  const live = { userId, deletedAt: null };
  const [
    profileRows, settings, accounts, transactions, categories, budgets, goals, goalContributions,
    loans, loanPayments, investments, goldAssets, friends, groupExpenses, recurringTransactions,
    todos, notifications, expenseBills, vaultFolders, vaultDocuments, application,
    bookings, wallet, walletTransactions, purchases, withdrawals, payoutMethod, devices, aaConsents,
  ] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM public.profiles WHERE id::text = ${userId} LIMIT 1`,
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.account.findMany({ where: live, orderBy: { createdAt: 'asc' } }),
    prisma.transaction.findMany({ where: live, orderBy: [{ date: 'asc' }, { id: 'asc' }], take: CAPS.transactions + 1 }),
    prisma.category.findMany({ where: live, orderBy: { name: 'asc' } }),
    prisma.budget.findMany({ where: live }),
    prisma.goal.findMany({ where: live }),
    prisma.goalContribution.findMany({ where: { userId }, orderBy: { date: 'asc' }, take: CAPS.goalContributions + 1 }),
    prisma.loan.findMany({ where: live }),
    prisma.loanPayment.findMany({ where: live, orderBy: { date: 'asc' }, take: CAPS.loanPayments + 1 }),
    prisma.investment.findMany({ where: live }),
    prisma.goldAsset.findMany({ where: live }),
    prisma.friend.findMany({ where: live }),
    prisma.groupExpense.findMany({ where: live, include: { groupMembers: { where: { deletedAt: null } } } }),
    prisma.recurringTransaction.findMany({ where: live }),
    prisma.todo.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: live, orderBy: { createdAt: 'desc' }, take: CAPS.notifications }),
    prisma.expenseBill.findMany({ where: { userId } }),
    prisma.vaultFolder.findMany({ where: live }),
    prisma.vaultDocument.findMany({ where: live }),
    prisma.advisorApplication.findUnique({ where: { userId } }),
    prisma.bookingRequest.findMany({
      where: { OR: [{ clientId: userId }, { advisorId: userId }] },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, clientId: true, advisorId: true, sessionType: true, description: true,
        proposedDate: true, proposedTime: true, duration: true, amount: true, status: true,
        startsAt: true, endsAt: true, timeZone: true, coinCost: true, paymentStatus: true,
        paidAt: true, refundedAt: true, cancelledAt: true, cancelReason: true, createdAt: true,
      },
    }),
    prisma.wallet.findUnique({ where: { userId }, select: { availableBalance: true, pendingBalance: true, status: true, createdAt: true } }),
    prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: CAPS.walletTransactions + 1 }),
    prisma.paymentOrder.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    // Never the encrypted account details — the masked label identifies the account.
    prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, coins: true, amountMinor: true, currency: true, status: true, method: true, payoutLabel: true,
        payoutReference: true, decisionNote: true, createdAt: true, approvedAt: true, paidAt: true, rejectedAt: true, cancelledAt: true,
      },
    }),
    prisma.payoutMethod.findUnique({ where: { userId }, select: { method: true, label: true, updatedAt: true } }),
    prisma.device.findMany({ where: { userId } }),
    prisma.aaConsent.findMany({ where: { userId } }),
  ]);

  // Runtime-created raw tables (todo lists and their items).
  let todoLists: Array<Record<string, unknown>> = [];
  let todoItems: Array<Record<string, unknown>> = [];
  if (await hasTable('todo_lists')) {
    todoLists = await prisma.$queryRawUnsafe('SELECT * FROM public.todo_lists WHERE user_id::text = $1 ORDER BY id', userId);
    if (await hasTable('todo_items')) {
      todoItems = await prisma.$queryRawUnsafe(
        'SELECT * FROM public.todo_items WHERE list_id IN (SELECT id FROM public.todo_lists WHERE user_id::text = $1) ORDER BY id',
        userId,
      );
    }
  }

  const capped = <T>(rows: T[], cap: number) => ({ rows: rows.slice(0, cap), truncated: rows.length > cap });
  const tx = capped(transactions, CAPS.transactions);
  const contributions = capped(goalContributions, CAPS.goalContributions);
  const payments = capped(loanPayments, CAPS.loanPayments);
  const ledger = capped(walletTransactions, CAPS.walletTransactions);

  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    // Kept for older KANAKU importers, which key on a string `version`.
    version: `${EXPORT_SCHEMA_VERSION}.0.0`,
    exportedAt: new Date().toISOString(),
    user,
    profile: profileRows[0] ? clean(profileRows[0]) : null,
    settings: settings ? clean(settings) : null,
    accounts: cleanAll(accounts),
    transactions: cleanAll(tx.rows),
    categories: cleanAll(categories),
    budgets: cleanAll(budgets),
    goals: cleanAll(goals),
    goalContributions: cleanAll(contributions.rows),
    loans: cleanAll(loans),
    loanPayments: cleanAll(payments.rows),
    investments: cleanAll(investments),
    goldAssets: cleanAll(goldAssets),
    friends: cleanAll(friends),
    groupExpenses: groupExpenses.map(({ groupMembers, ...expense }) => ({
      ...clean(expense),
      members: cleanAll(groupMembers),
    })),
    recurringTransactions: cleanAll(recurringTransactions),
    todos: cleanAll(todos),
    todoLists: todoLists.map(clean),
    todoItems: todoItems.map(clean),
    notifications: cleanAll(notifications),
    bills: cleanAll(expenseBills),
    vault: { folders: cleanAll(vaultFolders), documents: cleanAll(vaultDocuments) },
    advisor: {
      application: application ? clean(application) : null,
      bookings,
    },
    wallet: {
      balance: wallet,
      transactions: cleanAll(ledger.rows),
      purchases: cleanAll(purchases),
      withdrawals,
      payoutMethod,
    },
    devices: cleanAll(devices),
    aaConsents: cleanAll(aaConsents),
    truncated: {
      transactions: tx.truncated,
      goalContributions: contributions.truncated,
      loanPayments: payments.truncated,
      walletTransactions: ledger.truncated,
    },
  };
}

/**
 * One CSV cell. Quoted always; a value a spreadsheet would run as a formula
 * (leading = + - @, tab or CR — CWE-1236) is prefixed with an apostrophe so it
 * opens as text. A merchant called `=HYPERLINK(...)` must not become a link.
 */
export const csvCell = (value: unknown): string => {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const TRANSACTION_CSV_HEADERS = [
  'ID', 'Date', 'Type', 'Category', 'Subcategory', 'Amount', 'Description', 'Merchant',
  'Account', 'To Account', 'Currency',
];

/**
 * Keyset-paged walk over a user's live transactions, oldest first. Offset paging
 * over (date, createdAt) skipped or repeated rows that tied on both.
 */
export async function* iterateTransactionsForExport(userId: string, batchSize = 1000) {
  let cursor: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const batch: Awaited<ReturnType<typeof prisma.transaction.findMany>> = await prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        category: { not: 'Personal Share Offset' },
        ...(cursor
          ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });
    if (batch.length === 0) return;
    yield batch;
    if (batch.length < batchSize) return;
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }
}
