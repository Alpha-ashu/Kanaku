/**
 * What sign-out deletes from this device, and how each table comes back.
 *
 * Signing out empties Dexie so one person's data cannot leak into the next
 * session on a shared device. That is correct — but it is only safe for a table
 * that can be refilled from the server. Until 2026-09-24 nobody had checked:
 * `clearLocalUserData()` wiped 30+ tables while only 14 had any pull path, so
 * EMI repayments, goal contributions and bank-statement import history were
 * destroyed by an ordinary logout and existed nowhere the user could reach.
 *
 * The defect was structural, not a missed line: the clear list and the sync
 * layer were separate, hand-maintained lists, so every new table silently
 * defaulted to "cleared, never restored". This registry removes that default.
 * `clearLocalUserData()` iterates THIS list — adding a table to the clear path
 * now means declaring how it is restored — and `localDataRegistry.test.ts`
 * fails if any entry claims a strategy it does not have.
 *
 * Adding a table? Pick the honest strategy. If it is genuinely irrecoverable,
 * use `device-local` and say why in `note`; do not label it `on-demand-api`
 * because an endpoint exists somewhere.
 */
import { db } from '@/lib/database';

/**
 * The only two members this registry needs from a Dexie table: its name (so the
 * test can prove the entry points at the store it claims to) and `clear()`.
 * Structural rather than `Table<any, any>` — the row type is irrelevant here,
 * and naming it would mean thirty generic parameters for no benefit.
 */
export interface ClearableTable {
  readonly name: string;
  clear(): Promise<void>;
}

export type RestoreStrategy =
  /** Pulled by the Dexie sync engine — one of the SyncedTableName tables. */
  | 'core-sync'
  /** Pulled by featureSyncService / the loans merge during hydration. */
  | 'feature-sync'
  /** Not mirrored into Dexie on login; the feature fetches it when opened. */
  | 'on-demand-api'
  /** Exists only on this device by design. Losing it on logout is acceptable. */
  | 'device-local'
  /** Recomputed from other local tables, or vestigial; holds no source data. */
  | 'derived';

export interface LocalTablePolicy {
  /** Dexie table name, as declared in database.ts. */
  readonly name: string;
  readonly table: () => ClearableTable;
  readonly restore: RestoreStrategy;
  readonly note: string;
}

export const LOGOUT_CLEARED_TABLES: readonly LocalTablePolicy[] = [
  // ── Pulled by the Dexie sync engine ────────────────────────────────────────
  { name: 'accounts', table: () => db.accounts, restore: 'core-sync', note: 'SyncedTableName' },
  { name: 'transactions', table: () => db.transactions, restore: 'core-sync', note: 'SyncedTableName' },
  { name: 'loans', table: () => db.loans, restore: 'core-sync', note: 'SyncedTableName' },
  { name: 'goals', table: () => db.goals, restore: 'core-sync', note: 'SyncedTableName' },
  { name: 'investments', table: () => db.investments, restore: 'core-sync', note: 'SyncedTableName' },
  { name: 'groupExpenses', table: () => db.groupExpenses, restore: 'core-sync', note: 'SyncedTableName (group_expenses)' },
  { name: 'friends', table: () => db.friends, restore: 'core-sync', note: 'SyncedTableName' },
  { name: 'toDoLists', table: () => db.toDoLists, restore: 'core-sync', note: 'SyncedTableName (to_do_lists)' },
  { name: 'toDoItems', table: () => db.toDoItems, restore: 'core-sync', note: 'SyncedTableName (to_do_items)' },
  { name: 'toDoListShares', table: () => db.toDoListShares, restore: 'core-sync', note: 'SyncedTableName (to_do_list_shares)' },

  // ── Backend-owned, mirrored by featureSyncService ──────────────────────────
  { name: 'budgets', table: () => db.budgets, restore: 'feature-sync', note: 'syncBudgets()' },
  { name: 'recurringTransactions', table: () => db.recurringTransactions, restore: 'feature-sync', note: 'syncRecurringTransactions()' },
  { name: 'documents', table: () => db.documents, restore: 'feature-sync', note: 'syncBills() — metadata; blob stays server-side behind a signed URL' },
  {
    name: 'loanPayments',
    table: () => db.loanPayments,
    restore: 'feature-sync',
    note: 'mergeLoanPaymentsFromBackend() — embedded in GET /loans. NOTE: no client path POSTs a repayment yet, so rows created offline are still push-orphaned; see ROOT_CAUSE_REPORT §4.',
  },
  {
    name: 'goalContributions',
    table: () => db.goalContributions,
    restore: 'feature-sync',
    note: 'syncGoalContributions() — GET /goals/:id/contributions',
  },

  // ── Fetched by their own feature when opened, not mirrored on login ────────
  { name: 'notifications', table: () => db.notifications, restore: 'on-demand-api', note: 'GET /notifications (lib/notifications.ts)' },
  { name: 'chatMessages', table: () => db.chatMessages, restore: 'on-demand-api', note: 'GET /sessions/:id/messages' },
  { name: 'chatConversations', table: () => db.chatConversations, restore: 'on-demand-api', note: 'derived from GET /sessions' },
  { name: 'bookingRequests', table: () => db.bookingRequests, restore: 'on-demand-api', note: 'GET /bookings' },
  { name: 'advisorSessions', table: () => db.advisorSessions, restore: 'on-demand-api', note: 'GET /advisors/me/sessions' },
  { name: 'advisorAssignments', table: () => db.advisorAssignments, restore: 'on-demand-api', note: 'GET /bookings/workspace/clients' },

  // ── Device-local by design ────────────────────────────────────────────────
  {
    name: 'smsTransactions',
    table: () => db.smsTransactions,
    restore: 'device-local',
    note: 'Read from this handset\'s SMS inbox (full APK only). Re-derived by rescanning; never leaves the device.',
  },
  {
    name: 'merchantProfiles',
    table: () => db.merchantProfiles,
    restore: 'device-local',
    note: 'Learned categorisation hints. Rebuilt from the user\'s own transactions after they sync back.',
  },
  {
    name: 'userCategoryPreferences',
    table: () => db.userCategoryPreferences,
    restore: 'device-local',
    note: 'Same as merchantProfiles — a local learning cache, not source data.',
  },
  {
    name: 'importHistories',
    table: () => db.importHistories,
    restore: 'device-local',
    note: 'KNOWN GAP: no ImportHistory model or list endpoint exists, so bank-statement import history really is lost on logout. The imported TRANSACTIONS survive (core-sync); only the audit trail of which file produced them does not. See ROOT_CAUSE_REPORT §3.3.',
  },
  {
    name: 'gold',
    table: () => db.gold,
    restore: 'device-local',
    note: 'KNOWN GAP: GET /gold exists and backendSyncService can fill this table, but nothing requests it during hydration and no UI writes to it. Read-only in WealthVaultDashboard. See ROOT_CAUSE_REPORT §3.3.',
  },
  {
    name: 'investmentDocuments',
    table: () => db.investmentDocuments,
    restore: 'device-local',
    note: 'KNOWN GAP: no server endpoint. Investment attachments are local-only.',
  },
  {
    name: 'investmentLinks',
    table: () => db.investmentLinks,
    restore: 'device-local',
    note: 'KNOWN GAP: no server endpoint. Cross-module links are local-only.',
  },

  // ── Derived / vestigial ───────────────────────────────────────────────────
  {
    name: 'budgetAlerts',
    table: () => db.budgetAlerts,
    restore: 'derived',
    note: 'No writer in the app; the server owns alert evaluation (budget.listener.ts). Cleared for hygiene.',
  },
  {
    name: 'expenseBills',
    table: () => db.expenseBills,
    restore: 'derived',
    note: 'Superseded by `documents`. No reader or writer remains; cleared so old rows do not linger.',
  },
  {
    name: 'groups',
    table: () => db.groups,
    restore: 'derived',
    note: 'Superseded by `groupExpenses`. No reader or writer remains.',
  },
] as const;

/** Strategies that mean "the server can give this back". */
export const RECOVERABLE_STRATEGIES: readonly RestoreStrategy[] = [
  'core-sync',
  'feature-sync',
  'on-demand-api',
];

export const isRecoverable = (policy: LocalTablePolicy): boolean =>
  RECOVERABLE_STRATEGIES.includes(policy.restore);
