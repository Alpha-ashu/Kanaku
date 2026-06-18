import type { RealtimeChannel } from '@supabase/supabase-js';
import supabase from '@/utils/supabase/client';
import { db } from '@/lib/database';
import { apiClient } from '@/lib/api';
import { markOptionalBackendUnavailable, shouldSkipOptionalBackendRequests } from '@/lib/apiBase';
import {
  applyTransactionAccountImpact,
  getTransactionAccountDeltas,
  rebuildAccountBalances,
} from '@/lib/transactionAggregation';
import {
  clearSupabaseTemporaryUnavailable,
  filterAvailableSupabaseTables,
  isSupabaseConnectivityError,
  isSupabaseTableUnavailable,
  markSupabaseTemporarilyUnavailable,
  rememberMissingSupabaseTable,
  shouldSkipDirectSupabaseRequests,
} from '@/lib/supabase-runtime';

const DIRECT_CLOUD_SYNC_ENABLED =
  import.meta.env.VITE_ENABLE_DIRECT_CLOUD_SYNC === 'true';

const isBackendFirstSyncMode = () => !DIRECT_CLOUD_SYNC_ENABLED;

export type SyncedTableName =
  | 'accounts'
  | 'friends'
  | 'transactions'
  | 'loans'
  | 'goals'
  | 'group_expenses'
  | 'investments'
  | 'to_do_lists'
  | 'to_do_items'
  | 'to_do_list_shares';

const REMOTE_TABLE_NAMES: Record<SyncedTableName, string> = {
  accounts: 'accounts',
  friends: 'friends_sync',
  transactions: 'transactions',
  loans: 'loans',
  goals: 'goals',
  group_expenses: 'group_expenses_sync',
  investments: 'investments',
  to_do_lists: 'todo_lists',
  to_do_items: 'todo_items',
  to_do_list_shares: 'todo_list_shares',
};

type SyncOperation = 'upsert' | 'delete';

interface SyncQueueItem {
  key: string;
  table: SyncedTableName;
  operation: SyncOperation;
  localId: number;
  remoteId?: number;
  queuedAt: string;
  retryCount?: number;
}

const MAX_SYNC_RETRIES = 10;

const SYNC_QUEUE_STORAGE_KEY = 'KANAKU_sync_queue_v3';
const CORE_SYNC_TABLES: SyncedTableName[] = [
  'accounts',
  'friends',
  'transactions',
  'loans',
  'goals',
  'group_expenses',
  'investments',
  'to_do_lists',
  'to_do_items',
  'to_do_list_shares',
];

const TABLE_PRIORITY: Record<SyncedTableName, number> = {
  accounts: 1,
  friends: 2,
  goals: 3,
  loans: 4,
  transactions: 5,
  group_expenses: 6,
  investments: 7,
  to_do_lists: 8,
  to_do_items: 9,
  to_do_list_shares: 10,
};

const DEFAULT_DELETED_AT_SUPPORT: Partial<Record<SyncedTableName, boolean>> = {
  // Legacy schema does not include deleted_at for these tables.
  friends: false,
  group_expenses: false,
  to_do_lists: false,
  to_do_items: false,
  to_do_list_shares: false,
};

const DEFAULT_UPDATED_AT_SUPPORT: Partial<Record<SyncedTableName, boolean>> = {
  // Legacy schema does not include updated_at for these tables.
  friends: false,
  group_expenses: false,
  to_do_lists: false,
  to_do_items: false,
  to_do_list_shares: false,
};

const deletedAtSupport = new Map<SyncedTableName, boolean>();
const updatedAtSupport = new Map<SyncedTableName, boolean>();
const unsupportedRemoteColumns = new Map<SyncedTableName, Set<string>>();

const OPTIONAL_REMOTE_COLUMNS: Partial<Record<SyncedTableName, string[]>> = {
  accounts: ['provider', 'country', 'sub_type', 'color_id', 'custom_color'],
  transactions: ['expense_mode', 'group_expense_id', 'group_name', 'split_type', 'import_source', 'import_metadata', 'original_category', 'imported_at'],
};

const expandTablesForSync = (tables: SyncedTableName[]) => {
  const expanded = new Set<SyncedTableName>(tables);

  if (expanded.has('transactions')) {
    expanded.add('accounts');
    expanded.add('group_expenses');
  }

  if (expanded.has('loans')) {
    expanded.add('accounts');
    expanded.add('friends');
  }

  if (expanded.has('group_expenses')) {
    expanded.add('accounts');
    expanded.add('friends');
    expanded.add('transactions');
  }

  if (expanded.has('investments')) {
    expanded.add('accounts');
    expanded.add('transactions');
  }

  if (expanded.has('to_do_items')) {
    expanded.add('to_do_lists');
  }

  if (expanded.has('to_do_list_shares')) {
    expanded.add('to_do_lists');
  }

  return [...expanded];
};

const syncState = {
  hooksInstalled: false,
  processingQueue: false,
  syncingFromCloud: false,
  suppressionDepth: 0,
  queueTimer: null as ReturnType<typeof setTimeout> | null,
  pullTimer: null as ReturnType<typeof setTimeout> | null,
  activeChannel: null as RealtimeChannel | null,
  activeUserId: null as string | null,
  browserListenersBound: false,
  pendingPullTables: new Set<SyncedTableName>(),
};

const getLocalTable = (table: SyncedTableName) => {
  switch (table) {
    case 'accounts':
      return db.accounts;
    case 'friends':
      return db.friends;
    case 'transactions':
      return db.transactions;
    case 'loans':
      return db.loans;
    case 'goals':
      return db.goals;
    case 'group_expenses':
      return db.groupExpenses;
    case 'investments':
      return db.investments;
    case 'to_do_lists':
      return db.toDoLists;
    case 'to_do_items':
      return db.toDoItems;
    case 'to_do_list_shares':
      return db.toDoListShares;
  }
};

const toIsoString = (value?: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const toArray = <T,>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);

const supportsDeletedAt = (table: SyncedTableName) =>
  deletedAtSupport.get(table) ?? DEFAULT_DELETED_AT_SUPPORT[table] ?? true;

const supportsUpdatedAt = (table: SyncedTableName) =>
  updatedAtSupport.get(table) ?? DEFAULT_UPDATED_AT_SUPPORT[table] ?? true;

const attachRemoteTimestamps = (table: SyncedTableName, payload: Record<string, any>, record: any) => {
  const next = { ...payload };

  if (supportsUpdatedAt(table)) {
    next.updated_at = toIsoString(record.updatedAt) ?? new Date().toISOString();
  }

  if (supportsDeletedAt(table)) {
    next.deleted_at = toIsoString(record.deletedAt);
  }

  return next;
};

const toDate = (value?: string | Date | null) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeText = (value?: string | null) => (value || '').trim().toLowerCase();

const sameInstant = (left?: Date | string | null, right?: Date | string | null) => {
  const leftTime = toDate(left)?.getTime();
  const rightTime = toDate(right)?.getTime();
  if (!leftTime || !rightTime) return false;
  return Math.abs(leftTime - rightTime) < 60_000;
};

const isConnectivityError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  return (
    isSupabaseConnectivityError(error) ||
    name.includes('abort') ||
    name.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out')
  );
};

const isMissingRemoteRow = (error: any) =>
  error?.code === 'PGRST116' ||
  error?.details === 'The result contains 0 rows' ||
  String(error?.message || '').toLowerCase().includes('0 rows');

const getRemoteTableName = (table: SyncedTableName) => REMOTE_TABLE_NAMES[table];

const normalizeArray = <T,>(value: T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : [];

const isMissingColumnError = (error: any, column: string) => {
  const target = column.toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();

  const mentionsColumn = message.includes('column') || details.includes('column');
  const mentionsSchema = message.includes('schema') || details.includes('schema');
  const mentionsTarget = message.includes(target) || details.includes(target) || hint.includes(target);

  return mentionsTarget && (mentionsColumn || mentionsSchema);
};

const fetchUserRows = async (table: SyncedTableName, userId: string) => {
  if (shouldSkipDirectSupabaseRequests() || isSupabaseTableUnavailable(table)) {
    return [];
  }

  const runQuery = async (withDeletedAt: boolean) => {
    let query = supabase.from(getRemoteTableName(table)).select('*').eq('user_id', userId);
    if (withDeletedAt) {
      query = query.is('deleted_at', null);
    }
    return query;
  };

  const supportsDeletedAtFlag = supportsDeletedAt(table);
  let { data, error } = await runQuery(supportsDeletedAtFlag);

  if (supportsDeletedAtFlag && error && isMissingColumnError(error, 'deleted_at')) {
    deletedAtSupport.set(table, false);
    updatedAtSupport.set(table, false);
    const fallback = await runQuery(false);
    data = fallback.data;
    error = fallback.error;
  } else if (supportsDeletedAtFlag && !error) {
    deletedAtSupport.set(table, true);
    updatedAtSupport.set(table, true);
  }

  if (error) {
    if (rememberMissingSupabaseTable(table, error)) {
      return [];
    }

    if (isConnectivityError(error)) {
      markSupabaseTemporarilyUnavailable(error);
    }
    throw error;
  }

  clearSupabaseTemporaryUnavailable();
  return normalizeArray(data as any[]);
};

const readSyncQueue = (): SyncQueueItem[] => {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_QUEUE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeSyncQueue = (items: SyncQueueItem[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(items));
};

const enqueueSyncItem = (item: SyncQueueItem) => {
  const items = readSyncQueue();
  const index = items.findIndex((entry) => entry.key === item.key);

  if (index >= 0) {
    const previous = items[index];
    items[index] = {
      ...previous,
      ...item,
      remoteId: item.remoteId ?? previous.remoteId,
    };
  } else {
    items.push(item);
  }

  writeSyncQueue(items);
  scheduleQueueProcessing();
};

const removeSyncQueueKeys = (keys: string[]) => {
  if (keys.length === 0) return;
  const keySet = new Set(keys);
  writeSyncQueue(readSyncQueue().filter((item) => !keySet.has(item.key)));
};

export const isCloudSyncSuppressed = () => syncState.suppressionDepth > 0;

export async function runWithCloudSyncSuppressed<T>(work: () => Promise<T>): Promise<T> {
  syncState.suppressionDepth += 1;

  try {
    return await work();
  } finally {
    syncState.suppressionDepth = Math.max(0, syncState.suppressionDepth - 1);
  }
}

function scheduleQueueProcessing(delay = 250) {
  if (syncState.queueTimer) {
    clearTimeout(syncState.queueTimer);
  }

  syncState.queueTimer = setTimeout(() => {
    syncState.queueTimer = null;
    void processPendingSyncQueue();
  }, delay);
}

function getUnsupportedColumns(table: SyncedTableName) {
  return unsupportedRemoteColumns.get(table) ?? new Set<string>();
}

function markUnsupportedColumn(table: SyncedTableName, column: string) {
  const columns = getUnsupportedColumns(table);
  columns.add(column);
  unsupportedRemoteColumns.set(table, columns);
}

function buildRemotePayloadForTable(table: SyncedTableName, payload: any) {
  const unsupportedColumns = getUnsupportedColumns(table);
  if (unsupportedColumns.size === 0) return payload;

  const nextPayload = { ...payload };

  for (const column of unsupportedColumns) {
    delete nextPayload[column];
  }

  return nextPayload;
}

function parseMissingColumnName(error: any): string | null {
  if (!error || error.code !== 'PGRST204' || typeof error.message !== 'string') {
    return null;
  }

  const match = error.message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

export function queueRecordUpsertSync(table: SyncedTableName, localId: number, remoteId?: number) {
  enqueueSyncItem({
    key: `${table}:${localId}`,
    table,
    operation: 'upsert',
    localId,
    remoteId,
    queuedAt: new Date().toISOString(),
  });
}

export function queueRecordDeleteSync(table: SyncedTableName, localId: number, remoteId?: number) {
  enqueueSyncItem({
    key: `${table}:${localId}`,
    table,
    operation: 'delete',
    localId,
    remoteId,
    queuedAt: new Date().toISOString(),
  });
}

function bindTableHooks(table: SyncedTableName) {
  const localTable: any = getLocalTable(table);

  localTable.hook('creating', function (this: any, _primKey: any, obj: any) {
    if (isCloudSyncSuppressed()) return;

    this.onsuccess = (primaryKey: number) => {
      queueRecordUpsertSync(table, Number(primaryKey), toNumber(obj?.remoteId));
    };
  });

  localTable.hook('updating', function (this: any, _mods: any, primKey: any, obj: any) {
    if (isCloudSyncSuppressed()) return;

    this.onsuccess = () => {
      queueRecordUpsertSync(table, Number(primKey), toNumber(obj?.remoteId));
    };
  });

  localTable.hook('deleting', function (this: any, primKey: any, obj: any) {
    if (isCloudSyncSuppressed()) return;

    this.onsuccess = () => {
      queueRecordDeleteSync(table, Number(primKey), toNumber(obj?.remoteId));
    };
  });
}

export function initializeBackendSync() {
  if (syncState.hooksInstalled) return;

  CORE_SYNC_TABLES.forEach(bindTableHooks);
  syncState.hooksInstalled = true;

  if (!syncState.browserListenersBound && typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      scheduleQueueProcessing(100);

      if (syncState.activeUserId) {
        scheduleCloudPull(syncState.activeUserId, CORE_SYNC_TABLES, 350);
      }
    });

    // document.addEventListener('visibilitychange', () => {
    // if (document.visibilityState !== 'visible') return;
    // scheduleQueueProcessing(100);
    // if (syncState.activeUserId) {
    //   scheduleCloudPull(syncState.activeUserId, CORE_SYNC_TABLES, 350);
    // }
    // });

    syncState.browserListenersBound = true;
  }
}

async function resolveRemoteAccountId(localId?: number): Promise<number | null | undefined> {
  if (!localId) return null;
  const account = await db.accounts.get(localId);
  if (!account) return undefined;

  const remoteId = toNumber(account.remoteId);
  if (remoteId) return remoteId;

  queueRecordUpsertSync('accounts', localId);
  return undefined;
}

async function resolveRemoteFriendId(localId?: number): Promise<number | null | undefined> {
  if (!localId) return null;
  const friend = await db.friends.get(localId);
  if (!friend) return undefined;

  const remoteId = toNumber(friend.remoteId);
  if (remoteId) return remoteId;

  queueRecordUpsertSync('friends', localId);
  return undefined;
}

async function resolveRemoteTransactionId(localId?: number): Promise<number | null | undefined> {
  if (!localId) return null;
  const transaction = await db.transactions.get(localId);
  if (!transaction) return undefined;

  const remoteId = toNumber(transaction.remoteId);
  if (remoteId) return remoteId;

  queueRecordUpsertSync('transactions', localId);
  return undefined;
}

async function resolveRemoteGroupExpenseId(localId?: number): Promise<number | null | undefined> {
  if (!localId) return null;
  const groupExpense = await db.groupExpenses.get(localId);
  if (!groupExpense) return undefined;

  const remoteId = toNumber(groupExpense.remoteId);
  if (remoteId) return remoteId;

  queueRecordUpsertSync('group_expenses', localId);
  return undefined;
}

async function mapGroupMembersToRemote(members: any[] | undefined) {
  if (!Array.isArray(members)) return [];

  const mappedMembers: any[] = [];

  for (const member of members) {
    if (member?.friendId) {
      const remoteFriendId = await resolveRemoteFriendId(Number(member.friendId));
      if (remoteFriendId === undefined) return null;

      mappedMembers.push({
        ...member,
        friendId: remoteFriendId ?? undefined,
      });
    } else {
      mappedMembers.push(member);
    }
  }

  return mappedMembers;
}

async function mapLocalRecordToRemote(table: SyncedTableName, record: any, userId: string) {
  switch (table) {
    case 'accounts': {
      // SECURITY: Server sets created_at, updated_at, and recomputes balance from transactions
      // Client should NEVER send these fields
      const base = {
        user_id: userId,
        local_id: record.id,
        name: record.name,
        type: record.type,
        provider: record.provider ?? null,
        country: record.country ?? null,
        sub_type: record.subType ?? null,
        color_id: record.colorId ?? null,
        custom_color: record.customColor ?? null,
        // Balance is computed server-side - do NOT send client balance
        currency: record.currency || 'INR',
        is_active: record.isActive ?? true,
      };

      return attachRemoteTimestamps('accounts', base, record);
    }

    case 'friends': {
      // SECURITY: Server sets created_at, updated_at
      const base = {
        user_id: userId,
        local_id: record.id,
        name: record.name,
        email: record.email ?? null,
        phone: record.phone ?? null,
        avatar: record.avatar ?? null,
        notes: record.notes ?? null,
      };

      return attachRemoteTimestamps('friends', base, record);
    }

    case 'transactions': {
      const remoteAccountId = await resolveRemoteAccountId(record.accountId);
      if (!remoteAccountId) return null;

      const remoteTransferAccountId = record.transferToAccountId
        ? await resolveRemoteAccountId(record.transferToAccountId)
        : null;

      if (record.transferToAccountId && remoteTransferAccountId === undefined) {
        return null;
      }

      const remoteGroupExpenseId = record.groupExpenseId
        ? await resolveRemoteGroupExpenseId(record.groupExpenseId)
        : null;

      if (record.groupExpenseId && remoteGroupExpenseId === undefined) {
        return null;
      }

      // SECURITY: Server sets created_at, updated_at
      const base = {
        user_id: userId,
        local_id: record.id,
        type: record.type,
        amount: Number(record.amount ?? 0),
        account_id: remoteAccountId,
        category: record.category || 'Other',
        subcategory: record.subcategory ?? null,
        description: record.description ?? '',
        merchant: record.merchant ?? null,
        date: toIsoString(record.date) ?? new Date().toISOString(),
        tags: Array.isArray(record.tags) ? record.tags : null,
        attachment: record.attachment ?? null,
        transfer_to_account_id: remoteTransferAccountId ?? null,
        transfer_type: record.transferType ?? null,
        expense_mode: record.expenseMode ?? null,
        group_expense_id: remoteGroupExpenseId ?? null,
        group_name: record.groupName ?? null,
        split_type: record.splitType ?? null,
        import_source: record.importSource ?? null,
        import_metadata: record.importMetadata ?? null,
        original_category: record.originalCategory ?? null,
        imported_at: toIsoString(record.importedAt),
      };

      return attachRemoteTimestamps('transactions', base, record);
    }

    case 'loans': {
      const remoteFriendId = record.friendId ? await resolveRemoteFriendId(record.friendId) : null;
      if (record.friendId && remoteFriendId === undefined) return null;

      const remoteAccountId = record.accountId ? await resolveRemoteAccountId(record.accountId) : null;
      if (record.accountId && remoteAccountId === undefined) return null;

      // SECURITY: Server sets created_at, updated_at
      const base = {
        user_id: userId,
        local_id: record.id,
        type: record.type,
        name: record.name,
        principal_amount: Number(record.principalAmount ?? 0),
        outstanding_balance: Number(record.outstandingBalance ?? 0),
        interest_rate: record.interestRate ?? null,
        total_payable: record.totalPayable ?? null,
        emi_amount: record.emiAmount ?? null,
        due_date: toIsoString(record.dueDate),
        loan_date: toIsoString(record.loanDate),
        frequency: record.frequency ?? null,
        status: record.status ?? 'active',
        contact_person: record.contactPerson ?? null,
        friend_id: remoteFriendId ?? null,
        contact_email: record.contactEmail ?? null,
        contact_phone: record.contactPhone ?? null,
        account_id: remoteAccountId ?? null,
        notes: record.notes ?? null,
      };

      return attachRemoteTimestamps('loans', base, record);
    }

    case 'goals': {
      // SECURITY: Server sets created_at, updated_at
      const base = {
        user_id: userId,
        local_id: record.id,
        name: record.name,
        description: record.description ?? null,
        target_amount: Number(record.targetAmount ?? 0),
        current_amount: Number(record.currentAmount ?? 0),
        target_date: toIsoString(record.targetDate),
        category: record.category ?? 'other',
        is_group_goal: record.isGroupGoal ?? false,
      };

      return attachRemoteTimestamps('goals', base, record);
    }

    case 'group_expenses': {
      const remotePaidBy = await resolveRemoteAccountId(record.paidBy);
      if (!remotePaidBy) return null;

      const remoteMembers = await mapGroupMembersToRemote(record.members);
      if (remoteMembers === null) return null;

      const remoteExpenseTransactionId = record.expenseTransactionId
        ? await resolveRemoteTransactionId(record.expenseTransactionId)
        : null;

      if (record.expenseTransactionId && remoteExpenseTransactionId === undefined) {
        return null;
      }

      // SECURITY: Server sets created_at, updated_at
      const base = {
        user_id: userId,
        local_id: record.id,
        name: record.name,
        total_amount: Number(record.totalAmount ?? 0),
        paid_by: remotePaidBy,
        date: toIsoString(record.date) ?? new Date().toISOString(),
        members: remoteMembers,
        items: Array.isArray(record.items) ? record.items : null,
        description: record.description ?? null,
        category: record.category ?? null,
        subcategory: record.subcategory ?? null,
        split_type: record.splitType ?? null,
        your_share: record.yourShare ?? null,
        expense_transaction_id: remoteExpenseTransactionId ?? null,
        created_by: record.createdBy ?? null,
        created_by_name: record.createdByName ?? null,
        status: record.status ?? null,
        notification_status: record.notificationStatus ?? null,
      };

      return attachRemoteTimestamps('group_expenses', base, record);
    }

    case 'investments': {
      const remoteFundingAccountId = record.fundingAccountId
        ? await resolveRemoteAccountId(record.fundingAccountId)
        : null;
      if (record.fundingAccountId && remoteFundingAccountId === undefined) return null;

      const remoteSettlementAccountId = record.settlementAccountId
        ? await resolveRemoteAccountId(record.settlementAccountId)
        : null;
      if (record.settlementAccountId && remoteSettlementAccountId === undefined) return null;

      const remotePurchaseTransactionId = record.purchaseTransactionId
        ? await resolveRemoteTransactionId(record.purchaseTransactionId)
        : null;
      if (record.purchaseTransactionId && remotePurchaseTransactionId === undefined) return null;

      const remotePurchaseFeeTransactionId = record.purchaseFeeTransactionId
        ? await resolveRemoteTransactionId(record.purchaseFeeTransactionId)
        : null;
      if (record.purchaseFeeTransactionId && remotePurchaseFeeTransactionId === undefined) return null;

      const remoteSaleTransactionId = record.saleTransactionId
        ? await resolveRemoteTransactionId(record.saleTransactionId)
        : null;
      if (record.saleTransactionId && remoteSaleTransactionId === undefined) return null;

      const remoteSaleFeeTransactionId = record.saleFeeTransactionId
        ? await resolveRemoteTransactionId(record.saleFeeTransactionId)
        : null;
      if (record.saleFeeTransactionId && remoteSaleFeeTransactionId === undefined) return null;

      // SECURITY: Server sets created_at, updated_at
      const base = {
        user_id: userId,
        local_id: record.id,
        asset_type: record.assetType,
        asset_name: record.assetName,
        quantity: Number(record.quantity ?? 0),
        buy_price: Number(record.buyPrice ?? 0),
        current_price: Number(record.currentPrice ?? 0),
        total_invested: Number(record.totalInvested ?? 0),
        current_value: Number(record.currentValue ?? 0),
        profit_loss: Number(record.profitLoss ?? 0),
        purchase_date: toIsoString(record.purchaseDate) ?? new Date().toISOString(),
        last_updated: toIsoString(record.lastUpdated) ?? new Date().toISOString(),
        broker: record.broker ?? null,
        description: record.description ?? null,
        asset_currency: record.assetCurrency ?? null,
        base_currency: record.baseCurrency ?? null,
        buy_fx_rate: record.buyFxRate ?? null,
        last_known_fx_rate: record.lastKnownFxRate ?? null,
        total_invested_native: record.totalInvestedNative ?? null,
        current_value_native: record.currentValueNative ?? null,
        valuation_version: record.valuationVersion ?? null,
        position_status: record.positionStatus ?? null,
        closed_at: toIsoString(record.closedAt),
        close_price: record.closePrice ?? null,
        close_fx_rate: record.closeFxRate ?? null,
        gross_sale_value: record.grossSaleValue ?? null,
        net_sale_value: record.netSaleValue ?? null,
        funding_account_id: remoteFundingAccountId ?? null,
        purchase_fees: record.purchaseFees ?? null,
        purchase_transaction_id: remotePurchaseTransactionId ?? null,
        purchase_fee_transaction_id: remotePurchaseFeeTransactionId ?? null,
        sale_transaction_id: remoteSaleTransactionId ?? null,
        sale_fee_transaction_id: remoteSaleFeeTransactionId ?? null,
        closing_fees: record.closingFees ?? null,
        realized_profit_loss: record.realizedProfitLoss ?? null,
        settlement_account_id: remoteSettlementAccountId ?? null,
        close_notes: record.closeNotes ?? null,
        metadata: record.metadata ?? null,
      };

      return attachRemoteTimestamps('investments', base, record);
    }

    case 'to_do_lists': {
      const base = {
        user_id: userId,
        local_id: record.id,
        name: record.name,
        description: record.description ?? null,
        archived: record.archived ?? false,
      };
      return attachRemoteTimestamps('to_do_lists', base, record);
    }

    case 'to_do_items': {
      const remoteList = await db.toDoLists.get(record.listId);
      const remoteListId = remoteList?.cloudId ? toNumber(remoteList.cloudId) : null;
      if (!remoteListId) return null;

      const base = {
        user_id: userId,
        local_id: record.id,
        list_id: remoteListId,
        title: record.title,
        description: record.description ?? null,
        completed: record.completed ?? false,
        priority: record.priority ?? 'medium',
        due_date: toIsoString(record.dueDate),
        completed_at: toIsoString(record.completedAt),
        created_by: record.createdBy || userId,
      };
      return attachRemoteTimestamps('to_do_items', base, record);
    }

    case 'to_do_list_shares': {
      const remoteList = await db.toDoLists.get(record.listId);
      const remoteListId = remoteList?.cloudId ? toNumber(remoteList.cloudId) : null;
      if (!remoteListId) return null;

      const base = {
        local_id: record.id,
        list_id: remoteListId,
        shared_with_user_id: record.sharedWithUserId,
        permission: record.permission ?? 'view',
        shared_at: toIsoString(record.sharedAt),
        shared_by: record.sharedBy || userId,
      };
      return attachRemoteTimestamps('to_do_list_shares', base, record);
    }
  }
}

async function syncLocalRecordToCloud(userId: string, table: SyncedTableName, localId: number) {
  if (shouldSkipDirectSupabaseRequests() || isSupabaseTableUnavailable(table)) {
    return true;
  }

  const localTable: any = getLocalTable(table);
  const localRecord = await localTable.get(localId);
  if (!localRecord) return true;

  const mappedPayload = await mapLocalRecordToRemote(table, localRecord, userId);
  if (!mappedPayload) return false;

  const currentRemoteId = toNumber(localRecord.remoteId);

  // Use UPSERT with onConflict for all sync operations to prevent duplication
  // This handles both new records (INSERT) and existing ones (UPDATE)
  let payload = buildRemotePayloadForTable(table, mappedPayload);
  // OPTIMIZATION: Only select 'id' to reduce bandwidth (Bug #8 fix)
  let { data: remoteRecord, error } = await supabase
    .from(getRemoteTableName(table))
    .upsert(payload, { onConflict: 'user_id,local_id' })
    .select('id,updated_at')
    .single();

  // Backward compatibility: if the remote table schema is behind, strip the
  // missing column and retry.  Loop handles cascading missing-column errors.
  const MAX_COLUMN_RETRIES = 5;
  for (let colRetry = 0; colRetry < MAX_COLUMN_RETRIES && error; colRetry++) {
    const missingColumn = parseMissingColumnName(error);
    if (!missingColumn || !(missingColumn in payload)) break;

    markUnsupportedColumn(table, missingColumn);
    payload = buildRemotePayloadForTable(table, mappedPayload);

    // OPTIMIZATION: Only select 'id' to reduce bandwidth (Bug #8 fix)
    const retry = await supabase
      .from(getRemoteTableName(table))
      .upsert(payload, { onConflict: 'user_id,local_id' })
      .select('id,updated_at')
      .single();

    remoteRecord = retry.data;
    error = retry.error;
  }

  if (error) {
    if (rememberMissingSupabaseTable(table, error)) {
      return true;
    }
    if (isConnectivityError(error)) throw error;
    console.error(`Upsert failed for ${table}:${localId}`, error);
    return false;
  }

  clearSupabaseTemporaryUnavailable();
  const remoteId = toNumber(remoteRecord?.id);
  if (!remoteId) return true;

  await runWithCloudSyncSuppressed(async () => {
    await localTable.update(localId, {
      remoteId,
      updatedAt: toDate(remoteRecord.updated_at) ?? localRecord.updatedAt ?? new Date(),
    });
  });

  return true;
}

async function deleteRemoteRecord(userId: string, item: SyncQueueItem) {
  if (shouldSkipDirectSupabaseRequests() || isSupabaseTableUnavailable(item.table)) {
    return true;
  }

  const remoteId = item.remoteId;
  if (!remoteId) return true;

  const { error } = await supabase
    .from(getRemoteTableName(item.table))
    .delete()
    .eq('id', remoteId)
    .eq('user_id', userId);

  if (error && !isMissingRemoteRow(error)) {
    if (rememberMissingSupabaseTable(item.table, error)) {
      return true;
    }

    if (isConnectivityError(error)) {
      markSupabaseTemporarilyUnavailable(error);
    }

    throw error;
  }

  clearSupabaseTemporaryUnavailable();
  return true;
}

export async function processPendingSyncQueue() {
  if (!DIRECT_CLOUD_SYNC_ENABLED) return;

  initializeBackendSync();

  if (syncState.processingQueue || isCloudSyncSuppressed()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (shouldSkipDirectSupabaseRequests()) return;

  const pendingItems = readSyncQueue();
  if (pendingItems.length === 0) return;

  let user = null as { id: string } | null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user ? { id: session.user.id } : null;

    if (!user) {
      const { data } = await supabase.auth.getUser();
      user = data.user ? { id: data.user.id } : null;
    }
  } catch (error) {
    if (isConnectivityError(error)) {
      markSupabaseTemporarilyUnavailable(error);
      return;
    }
    throw error;
  }

  if (!user) return;

  syncState.processingQueue = true;

  try {
    const queue = [...pendingItems].sort((left, right) => {
      const byPriority = TABLE_PRIORITY[left.table] - TABLE_PRIORITY[right.table];
      if (byPriority !== 0) return byPriority;
      return left.queuedAt.localeCompare(right.queuedAt);
    });

    const completedKeys: string[] = [];
    const deferredItems: SyncQueueItem[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      const retryCount = item.retryCount ?? 0;

      if (retryCount >= MAX_SYNC_RETRIES) {
        console.warn(`Dropping ${item.table}:${item.localId} after ${retryCount} failed retries`);
        completedKeys.push(item.key);
        continue;
      }

      try {
        const synced = item.operation === 'delete'
          ? await deleteRemoteRecord(user.id, item)
          : await syncLocalRecordToCloud(user.id, item.table, item.localId);

        if (synced) {
          completedKeys.push(item.key);
        } else {
          deferredItems.push({ ...item, retryCount: retryCount + 1 });
        }
      } catch (error) {
        if (isConnectivityError(error)) {
          deferredItems.push(...queue.slice(index));
          break;
        }

        console.warn(`Cloud sync failed for ${item.table}:${item.localId}`, error);
        deferredItems.push({ ...item, retryCount: retryCount + 1 });
      }
    }

    if (completedKeys.length > 0) {
      removeSyncQueueKeys(completedKeys);
    }

    if (deferredItems.length > 0) {
      const currentQueue = readSyncQueue().filter((item) => !completedKeys.includes(item.key));
      writeSyncQueue(
        [...currentQueue, ...deferredItems].reduce<SyncQueueItem[]>((items, item) => {
          const existingIndex = items.findIndex((entry) => entry.key === item.key);
          if (existingIndex >= 0) {
            items[existingIndex] = {
              ...items[existingIndex],
              ...item,
              remoteId: item.remoteId ?? items[existingIndex].remoteId,
            };
          } else {
            items.push(item);
          }
          return items;
        }, [])
      );

      const maxRetry = Math.max(...deferredItems.map((i) => i.retryCount ?? 0), 1);
      const backoff = Math.min(500 * 2 ** (maxRetry - 1), 30_000);
      scheduleQueueProcessing(backoff);
    }
  } finally {
    syncState.processingQueue = false;
  }
}

/**
 * Deduplicates all tables in the local Dexie database.
 * Groups records by remoteId (hard match) and by name+key fields (soft match),
 * keeping the canonical record and deleting orphan duplicates.
 */
export async function deduplicateLocalData() {
  await runWithCloudSyncSuppressed(async () => {
    const backfillRemoteIds = async (localTable: any) => {
      const rows: any[] = await localTable.filter((r: any) => !r.remoteId && r.cloudId != null).toArray();
      if (rows.length === 0) return;
      await Promise.all(rows.map((row) => {
        const nextRemoteId = toNumber(row.cloudId);
        if (!nextRemoteId || !row.id) return Promise.resolve();
        return localTable.update(row.id, { remoteId: nextRemoteId });
      }));
    };

    await backfillRemoteIds(db.accounts);
    await backfillRemoteIds(db.transactions);
    await backfillRemoteIds(db.goals);
    await backfillRemoteIds(db.loans);
    await backfillRemoteIds(db.investments);
    await backfillRemoteIds(db.friends);
    await backfillRemoteIds(db.groupExpenses);

    const dedupTable = async (localTable: any, nameKeyFn: (row: any) => string) => {
      const all: any[] = await localTable.toArray();
      if (all.length === 0) return;

      const toDelete = new Set<number>();
      const seenByRemoteId = new Map<number, number>(); // remoteId -> localId
      const seenByCloudId = new Map<string, number>();  // cloudId -> localId
      const seenByNameKey = new Map<string, number>();  // nameKey -> localId

      // Sort: prefer records with remoteId or cloudId (canonical link to server), then by latest updatedAt
      const sorted = [...all].sort((a, b) => {
        const ridA = toNumber(a.remoteId) || a.cloudId;
        const ridB = toNumber(b.remoteId) || b.cloudId;
        if (ridA && !ridB) return -1;
        if (!ridA && ridB) return 1;
        return (toDate(b.updatedAt)?.getTime() ?? 0) - (toDate(a.updatedAt)?.getTime() ?? 0);
      });

      for (const row of sorted) {
        const rid = toNumber(row.remoteId);
        const cid = row.cloudId ? String(row.cloudId).trim() : undefined;
        const nameKey = nameKeyFn(row);
        const lid = Number(row.id);

        if (rid) {
          if (seenByRemoteId.has(rid)) {
            toDelete.add(lid);
            continue;
          }
          seenByRemoteId.set(rid, lid);
        }

        if (cid) {
          if (seenByCloudId.has(cid)) {
            toDelete.add(lid);
            continue;
          }
          seenByCloudId.set(cid, lid);
        }

        if (nameKey) {
          if (seenByNameKey.has(nameKey)) {
            // If the existing one has a remoteId/cloudId but this one doesn't, we definitely delete this one
            // If both have/don't have, we delete this one because it's sorted after (older/less canonical)
            toDelete.add(lid);
            continue;
          }
          seenByNameKey.set(nameKey, lid);
        }
      }

      if (toDelete.size > 0) {
        console.log(` Local dedup: deleting ${toDelete.size} duplicates from ${localTable.name}`);
        await localTable.bulkDelete(Array.from(toDelete));
      }
    };

    await dedupTable(db.accounts, (r) =>
      `${normalizeText(r.name)}|${r.type}|${normalizeText(r.currency)}`
    );
    await dedupTable(db.transactions, (r) =>
      `${r.type}|${Number(r.amount ?? 0)}|${normalizeText(r.category)}|${normalizeText(r.description)}|${toIsoString(r.date)}`
    );
    await dedupTable(db.goals, (r) =>
      `${normalizeText(r.name)}|${Number(r.targetAmount ?? 0)}`
    );
    await dedupTable(db.loans, (r) =>
      `${normalizeText(r.name)}|${r.type}|${Number(r.principalAmount ?? 0)}`
    );
    await dedupTable(db.investments, (r) =>
      `${normalizeText(r.assetName)}|${r.assetType}|${Number(r.quantity ?? 0)}`
    );
    await dedupTable(db.friends, (r) =>
      `${normalizeText(r.name)}|${normalizeText(r.email)}|${normalizeText(r.phone)}`
    );
    await dedupTable(db.groupExpenses, (r) =>
      `${normalizeText(r.name)}|${Number(r.totalAmount ?? 0)}|${toIsoString(r.date)?.slice(0, 10)}`
    );

    // Rebuild account balances from openingBalance + all surviving transactions
    // so any double-applied impacts from duplicate records are corrected.
    await rebuildAccountBalances();
  });
}

function findMatchingAccount(remote: any, localAccounts: any[]) {
  return localAccounts.find((account) =>
    !account.remoteId &&
    normalizeText(account.name) === normalizeText(remote.name) &&
    account.type === remote.type &&
    normalizeText(account.currency) === normalizeText(remote.currency)
  );
}

function findMatchingFriend(remote: any, localFriends: any[]) {
  return localFriends.find((friend) =>
    !friend.remoteId &&
    normalizeText(friend.name) === normalizeText(remote.name) &&
    normalizeText(friend.email) === normalizeText(remote.email) &&
    normalizeText(friend.phone) === normalizeText(remote.phone)
  );
}

function findMatchingGoal(remote: any, localGoals: any[]) {
  return localGoals.find((goal) =>
    !goal.remoteId &&
    normalizeText(goal.name) === normalizeText(remote.name) &&
    Number(goal.targetAmount ?? 0) === Number(remote.target_amount ?? 0)
  );
}

function findMatchingLoan(remote: any, localLoans: any[]) {
  return localLoans.find((loan) =>
    !loan.remoteId &&
    normalizeText(loan.name) === normalizeText(remote.name) &&
    loan.type === remote.type &&
    Number(loan.principalAmount ?? 0) === Number(remote.principal_amount ?? 0)
  );
}

function findMatchingTransaction(remote: any, localTransactions: any[], accountId?: number) {
  return localTransactions.find((transaction) =>
    !transaction.remoteId &&
    transaction.type === remote.type &&
    Number(transaction.amount ?? 0) === Number(remote.amount ?? 0) &&
    normalizeText(transaction.category) === normalizeText(remote.category) &&
    normalizeText(transaction.description) === normalizeText(remote.description) &&
    (!accountId || transaction.accountId === accountId) &&
    sameInstant(transaction.date, remote.date)
  );
}

function findMatchingGroupExpense(remote: any, localGroups: any[], paidBy?: number) {
  return localGroups.find((group) =>
    !group.remoteId &&
    normalizeText(group.name) === normalizeText(remote.name) &&
    Number(group.totalAmount ?? 0) === Number(remote.total_amount ?? 0) &&
    (!paidBy || group.paidBy === paidBy) &&
    sameInstant(group.date, remote.date)
  );
}

function findMatchingInvestment(remote: any, localInvestments: any[]) {
  return localInvestments.find((investment) =>
    !investment.remoteId &&
    normalizeText(investment.assetName) === normalizeText(remote.asset_name) &&
    investment.assetType === remote.asset_type &&
    Number(investment.quantity ?? 0) === Number(remote.quantity ?? 0) &&
    sameInstant(investment.purchaseDate, remote.purchase_date)
  );
}

function resolveLocalId(remote: any, existingRows: any[], matcher?: (rows: any[]) => any) {
  const remoteId = remote.id;

  // 1. Try matching by remoteId (UUID/String or Numeric)
  const byRemoteId = existingRows.find((row) => {
    const rId = row.remoteId;
    return rId === remoteId || (toNumber(rId) === toNumber(remoteId) && rId != null);
  });
  if (byRemoteId?.id) return Number(byRemoteId.id);

  // 2. Try matching by the local_id field we expressly synced to the cloud
  const cloudLocalId = toNumber(remote.local_id);
  if (cloudLocalId) {
    const byLocalId = existingRows.find((row) => Number(row.id) === cloudLocalId);
    if (byLocalId) return Number(byLocalId.id);
  }

  // 3. Fallback to soft-matching (name, amount, date, etc.)
  const matched = matcher ? matcher(existingRows) : undefined;
  if (matched?.id) return Number(matched.id);

  return undefined;
}

/**
 * IDEMPOTENT merge: prevents duplicate records by checking remoteId before insert/update.
 * Fixes race conditions and refresh duplicates by ensuring:
 * 1. Only one record per remoteId exists
 * 2. Records with matching remoteId are updated, not duplicated
 * 3. New records get proper IDs to match existing local records
 */
async function mergeRemoteTable(table: SyncedTableName, remoteRows: any[], nextRows: any[], existingRows: any[]) {
  const remoteIds = new Set(remoteRows.map((row) => Number(row.id)).filter(Number.isFinite));
  const staleLocalIds = existingRows
    .filter((row) => {
      const remoteId = toNumber(row.remoteId);
      return remoteId && !remoteIds.has(remoteId);
    })
    .map((row) => Number(row.id))
    .filter(Number.isFinite);

  const localTable: any = getLocalTable(table);

  // CRITICAL FIX: Use idempotent upsert instead of bulkPut to prevent duplicates
  // bulkPut creates new records if id is undefined, causing duplicates on refresh
  if (nextRows.length > 0) {
    // Build a map of existing records by remoteId for quick lookup
    const existingByRemoteId = new Map<number, any>();
    for (const row of existingRows) {
      const rid = toNumber(row.remoteId);
      if (rid) {
        existingByRemoteId.set(rid, row);
      }
    }

    // Separate into updates and inserts
    const toUpdate: any[] = [];
    const toInsert: any[] = [];

    for (const nextRow of nextRows) {
      const remoteId = nextRow.remoteId;
      if (!remoteId) {
        // No remoteId = local-only record, insert as-is
        toInsert.push(nextRow);
        continue;
      }

      const existing = existingByRemoteId.get(remoteId);
      if (existing?.id) {
        // Record with this remoteId exists - update it with the existing local ID
        toUpdate.push({
          ...nextRow,
          id: existing.id,  // Preserve the local ID to avoid creating duplicates
        });
      } else {
        // New remoteId - insert (bulkAdd will assign auto ID if not provided)
        toInsert.push(nextRow);
      }
    }

    // Execute updates first (safer than inserts when dealing with FK constraints)
    if (toUpdate.length > 0) {
      await localTable.bulkUpdate(toUpdate.map(row => ({
        key: row.id,
        changes: row,
      })));
    }

    // Then insert new records
    if (toInsert.length > 0) {
      await localTable.bulkAdd(toInsert, { allKeys: true });
    }
  }

  // Delete stale records (from cloud) that are no longer in remoteIds set
  if (staleLocalIds.length > 0) {
    await localTable.bulkDelete(staleLocalIds);
  }
}

const resolveLocalBackendId = (cloudId: string | undefined, existingRows: any[], matcher?: () => any) => {
  if (cloudId) {
    const byCloudId = existingRows.find((row) => row.cloudId === cloudId);
    if (byCloudId?.id) return Number(byCloudId.id);
  }

  const matched = matcher?.();
  if (matched?.id) return Number(matched.id);

  return undefined;
};

const mergeBackendTable = async (table: SyncedTableName, backendRows: any[], nextRows: any[], existingRows: any[]) => {
  const backendCloudIds = new Set(
    backendRows
      .map((row) => String(row.id || '').trim())
      .filter(Boolean),
  );

  const staleLocalIds = existingRows
    .filter((row) => row.cloudId && !backendCloudIds.has(String(row.cloudId)))
    .map((row) => Number(row.id))
    .filter(Number.isFinite);

  const localTable: any = getLocalTable(table);

  // IDEMPOTENT merge: prevent duplicates by checking cloudId before insert/update
  if (nextRows.length > 0) {
    // Build a map of existing records by cloudId for quick lookup
    const existingByCloudId = new Map<string, any>();
    for (const row of existingRows) {
      if (row.cloudId) {
        existingByCloudId.set(String(row.cloudId), row);
      }
    }

    // Separate into updates and inserts
    const toUpdate: any[] = [];
    const toInsert: any[] = [];

    for (const nextRow of nextRows) {
      const cloudId = nextRow.cloudId;
      if (!cloudId) {
        // No cloudId = local-only record, insert as-is
        toInsert.push(nextRow);
        continue;
      }

      const existing = existingByCloudId.get(String(cloudId));
      if (existing?.id) {
        // Record with this cloudId exists - update it with the existing local ID
        toUpdate.push({
          ...nextRow,
          id: existing.id,  // Preserve the local ID to avoid duplicates
        });
      } else {
        // New cloudId - insert (will assign auto ID if not provided)
        toInsert.push(nextRow);
      }
    }

    // Execute updates first
    if (toUpdate.length > 0) {
      await localTable.bulkUpdate(toUpdate.map(row => ({
        key: row.id,
        changes: row,
      })));
    }

    // Then insert new records
    if (toInsert.length > 0) {
      await localTable.bulkAdd(toInsert, { allKeys: true });
    }
  }

  // Delete stale records
  if (staleLocalIds.length > 0) {
    await localTable.bulkDelete(staleLocalIds);
  }
};

async function fetchBackendRows(path: string) {
  if (shouldSkipOptionalBackendRequests()) {
    return [];
  }

  try {
    const response = await apiClient.get<any[]>(path, { showErrorToast: false });
    return toArray(response.data);
  } catch {
    markOptionalBackendUnavailable();
    return [];
  }
}

const LAST_FULL_SYNC_KEY = 'KANAKU_last_full_sync_at';
const FULL_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

async function shouldSkipFullSync(requestedTables: SyncedTableName[]): Promise<boolean> {
  const isFullSync = requestedTables.length >= CORE_SYNC_TABLES.length;
  if (!isFullSync) return false;

  const lastSyncStr = localStorage.getItem(LAST_FULL_SYNC_KEY);
  if (!lastSyncStr) return false;

  const lastSync = Number(lastSyncStr);
  if (isNaN(lastSync) || Date.now() - lastSync < 0 || Date.now() - lastSync >= FULL_SYNC_COOLDOWN_MS) {
    return false;
  }

  try {
    const localAccountsCount = await db.accounts.count();
    return localAccountsCount > 0;
  } catch {
    return false;
  }
}

async function syncUserDataFromBackend(
  requestedTables?: SyncedTableName[],
  force = false
) {
  initializeBackendSync();

  const tablesToSync = requestedTables === undefined ? CORE_SYNC_TABLES : requestedTables;

  // Clean up any local duplicates before merging backend data
  await deduplicateLocalData();

  const skipFull = !force && await shouldSkipFullSync(tablesToSync);
  if (skipFull) {
    console.info('[Sync] Skipping full backend pull; last sync was <5m ago and local data exists.');
    return;
  }

  // Filter out tables that were synced recently during non-forced syncs
  const targetTables = tablesToSync;
  let finalTablesToSync = targetTables;
  if (!force) {
    const cooldownMs = 5 * 60 * 1000; // 5 minutes
    finalTablesToSync = targetTables.filter(table => {
      const lastSyncStr = localStorage.getItem(`KANAKU_last_sync_at_${table}`);
      if (!lastSyncStr) return true;
      const lastSync = Number(lastSyncStr);
      if (isNaN(lastSync) || Date.now() - lastSync < 0 || Date.now() - lastSync >= cooldownMs) {
        return true;
      }
      return false;
    });
  }

  if (finalTablesToSync.length === 0) {
    if (import.meta.env.DEV) {
      console.info('[Sync] Skipping backend sync; all requested tables synced <5m ago.');
    }
    return;
  }

  const expandedTables = expandTablesForSync(finalTablesToSync);
  const mergeTargets = new Set<SyncedTableName>(finalTablesToSync);
  const shouldFetch = (table: SyncedTableName) => expandedTables.includes(table);

  const [
    backendAccounts,
    backendFriends,
    backendTransactions,
    backendLoans,
    backendGoals,
    backendInvestments,
    backendGroups,
    backendTodoLists,
    backendTodoItems,
    backendTodoShares,
    localAccounts,
    localFriends,
    localTransactions,
    localLoans,
    localGoals,
    localInvestments,
    localGroups,
    localTodoLists,
    localTodoItems,
    localTodoShares,
  ] = await Promise.all([
    shouldFetch('accounts') ? fetchBackendRows('/accounts') : Promise.resolve([]),
    shouldFetch('friends') ? fetchBackendRows('/friends') : Promise.resolve([]),
    shouldFetch('transactions') ? fetchBackendRows('/transactions?limit=200') : Promise.resolve([]),
    shouldFetch('loans') ? fetchBackendRows('/loans') : Promise.resolve([]),
    shouldFetch('goals') ? fetchBackendRows('/goals') : Promise.resolve([]),
    shouldFetch('investments') ? fetchBackendRows('/investments') : Promise.resolve([]),
    shouldFetch('group_expenses') ? fetchBackendRows('/groups') : Promise.resolve([]),
    shouldFetch('to_do_lists') ? fetchBackendRows('/todos/lists') : Promise.resolve([]),
    shouldFetch('to_do_items') ? fetchBackendRows('/todos/items') : Promise.resolve([]),
    shouldFetch('to_do_list_shares') ? fetchBackendRows('/todos/shares') : Promise.resolve([]),
    shouldFetch('accounts') ? db.accounts.toArray() : Promise.resolve([]),
    shouldFetch('friends') ? db.friends.toArray() : Promise.resolve([]),
    shouldFetch('transactions') ? db.transactions.toArray() : Promise.resolve([]),
    shouldFetch('loans') ? db.loans.toArray() : Promise.resolve([]),
    shouldFetch('goals') ? db.goals.toArray() : Promise.resolve([]),
    shouldFetch('investments') ? db.investments.toArray() : Promise.resolve([]),
    shouldFetch('group_expenses') ? db.groupExpenses.toArray() : Promise.resolve([]),
    shouldFetch('to_do_lists') ? db.toDoLists.toArray() : Promise.resolve([]),
    shouldFetch('to_do_items') ? db.toDoItems.toArray() : Promise.resolve([]),
    shouldFetch('to_do_list_shares') ? db.toDoListShares.toArray() : Promise.resolve([]),
  ]);

  const accountCloudToLocal = new Map<string, number>();
  const friendCloudToLocal = new Map<string, number>();
  const groupCloudToLocal = new Map<string, number>();
  const listCloudToLocal = new Map<string, number>();

  const mappedAccounts = backendAccounts.map((account: any) => {
    const cloudId = String(account.id);
    const localId = resolveLocalBackendId(cloudId, localAccounts, () =>
      localAccounts.find((row) =>
        !row.cloudId &&
        normalizeText(row.name) === normalizeText(account.name) &&
        row.type === account.type &&
        normalizeText(row.currency) === normalizeText(account.currency),
      )
    );

    const next = {
      id: localId,
      cloudId,
      name: account.name,
      type: account.type,
      provider: account.provider ?? undefined,
      country: account.country ?? undefined,
      balance: Number(account.balance ?? 0),
      currency: account.currency ?? 'INR',
      isActive: account.isActive ?? true,
      createdAt: toDate(account.createdAt) ?? new Date(),
      updatedAt: toDate(account.updatedAt),
      deletedAt: toDate(account.deletedAt),
      syncStatus: 'synced' as const,
    };

    if (next.id) {
      accountCloudToLocal.set(cloudId, next.id);
    }

    return next;
  });

  mappedAccounts.forEach((account) => {
    if (account.id && account.cloudId) {
      accountCloudToLocal.set(account.cloudId, account.id);
    }
  });

  const mappedFriends = backendFriends.map((friend: any) => {
    const cloudId = String(friend.id);
    const localId = resolveLocalBackendId(cloudId, localFriends, () =>
      localFriends.find((row) =>
        !row.cloudId &&
        normalizeText(row.name) === normalizeText(friend.name) &&
        normalizeText(row.email) === normalizeText(friend.email) &&
        normalizeText(row.phone) === normalizeText(friend.phone),
      )
    );

    const next = {
      id: localId,
      cloudId,
      name: friend.name,
      email: friend.email ?? undefined,
      phone: friend.phone ?? undefined,
      avatar: friend.avatar ?? undefined,
      notes: friend.notes ?? undefined,
      createdAt: toDate(friend.createdAt) ?? new Date(),
      updatedAt: toDate(friend.updatedAt),
      deletedAt: toDate(friend.deletedAt),
      syncStatus: 'synced' as const,
    };

    if (next.id) {
      friendCloudToLocal.set(cloudId, next.id);
    }

    return next;
  });

  mappedFriends.forEach((friend) => {
    if (friend.id && friend.cloudId) {
      friendCloudToLocal.set(friend.cloudId, friend.id);
    }
  });

  const mappedGoals = backendGoals.map((goal: any) => ({
    id: resolveLocalBackendId(String(goal.id), localGoals, () =>
      localGoals.find((row) =>
        !row.cloudId &&
        normalizeText(row.name) === normalizeText(goal.name) &&
        Number(row.targetAmount ?? 0) === Number(goal.targetAmount ?? 0),
      )
    ),
    cloudId: String(goal.id),
    name: goal.name,
    description: goal.description ?? undefined,
    targetAmount: Number(goal.targetAmount ?? 0),
    currentAmount: Number(goal.currentAmount ?? 0),
    targetDate: toDate(goal.targetDate) ?? new Date(),
    category: goal.category ?? 'other',
    isGroupGoal: goal.isGroupGoal ?? false,
    createdAt: toDate(goal.createdAt) ?? new Date(),
    updatedAt: toDate(goal.updatedAt),
    deletedAt: toDate(goal.deletedAt),
    syncStatus: 'synced' as const,
  }));

  const mappedInvestments = backendInvestments.map((investment: any) => ({
    id: resolveLocalBackendId(String(investment.id), localInvestments, () =>
      localInvestments.find((row) =>
        !row.cloudId &&
        normalizeText(row.assetName) === normalizeText(investment.assetName) &&
        row.assetType === investment.assetType &&
        Number(row.quantity ?? 0) === Number(investment.quantity ?? 0),
      )
    ),
    cloudId: String(investment.id),
    assetType: investment.assetType,
    assetName: investment.assetName,
    quantity: Number(investment.quantity ?? 0),
    buyPrice: Number(investment.buyPrice ?? 0),
    currentPrice: Number(investment.currentPrice ?? 0),
    totalInvested: Number(investment.totalInvested ?? 0),
    currentValue: Number(investment.currentValue ?? 0),
    profitLoss: Number(investment.profitLoss ?? 0),
    purchaseDate: toDate(investment.purchaseDate) ?? new Date(),
    lastUpdated: toDate(investment.lastUpdated) ?? new Date(),
    broker: investment.broker ?? undefined,
    description: investment.description ?? undefined,
    assetCurrency: investment.assetCurrency ?? undefined,
    baseCurrency: investment.baseCurrency ?? undefined,
    buyFxRate: investment.buyFxRate ?? undefined,
    lastKnownFxRate: investment.lastKnownFxRate ?? undefined,
    totalInvestedNative: investment.totalInvestedNative ?? undefined,
    currentValueNative: investment.currentValueNative ?? undefined,
    valuationVersion: investment.valuationVersion ?? undefined,
    positionStatus: investment.positionStatus ?? undefined,
    closedAt: toDate(investment.closedAt),
    closePrice: investment.closePrice ?? undefined,
    closeFxRate: investment.closeFxRate ?? undefined,
    grossSaleValue: investment.grossSaleValue ?? undefined,
    netSaleValue: investment.netSaleValue ?? undefined,
    fundingAccountId: investment.fundingAccountId ? accountCloudToLocal.get(String(investment.fundingAccountId)) : undefined,
    purchaseFees: investment.purchaseFees ?? undefined,
    purchaseTransactionId: undefined,
    purchaseFeeTransactionId: undefined,
    saleTransactionId: undefined,
    saleFeeTransactionId: undefined,
    closingFees: investment.closingFees ?? undefined,
    realizedProfitLoss: investment.realizedProfitLoss ?? undefined,
    settlementAccountId: investment.settlementAccountId ? accountCloudToLocal.get(String(investment.settlementAccountId)) : undefined,
    closeNotes: investment.closeNotes ?? undefined,
    metadata: investment.metadata ?? undefined,
    createdAt: toDate(investment.createdAt) ?? new Date(),
    updatedAt: toDate(investment.updatedAt),
    deletedAt: toDate(investment.deletedAt),
    syncStatus: 'synced' as const,
  }));

  const mappedGroups = backendGroups.map((group: any) => {
    const cloudId = String(group.id);
    const localPaidBy = group.paidBy ? accountCloudToLocal.get(String(group.paidBy)) : undefined;
    const localId = resolveLocalBackendId(cloudId, localGroups, () =>
      localGroups.find((row) =>
        !row.cloudId &&
        normalizeText(row.name) === normalizeText(group.name) &&
        Number(row.totalAmount ?? 0) === Number(group.totalAmount ?? 0),
      )
    );

    const next = {
      id: localId,
      cloudId,
      name: group.name,
      totalAmount: Number(group.totalAmount ?? 0),
      paidBy: localPaidBy ?? 0,
      date: toDate(group.date) ?? new Date(),
      members: Array.isArray(group.members)
        ? group.members.map((member: any) => ({
          ...member,
          friendId: member?.friendId ? friendCloudToLocal.get(String(member.friendId)) : undefined,
        }))
        : [],
      items: Array.isArray(group.items) ? group.items : [],
      description: group.description ?? undefined,
      category: group.category ?? undefined,
      subcategory: group.subcategory ?? undefined,
      splitType: group.splitType ?? undefined,
      yourShare: group.yourShare ?? undefined,
      expenseTransactionId: undefined,
      createdBy: group.createdBy ?? undefined,
      createdByName: group.createdByName ?? undefined,
      status: group.status ?? undefined,
      notificationStatus: group.notificationStatus ?? undefined,
      createdAt: toDate(group.createdAt) ?? new Date(),
      updatedAt: toDate(group.updatedAt),
      deletedAt: toDate(group.deletedAt),
      syncStatus: 'synced' as const,
    };

    if (next.id) {
      groupCloudToLocal.set(cloudId, next.id);
    }

    return next;
  });

  mappedGroups.forEach((group) => {
    if (group.id && group.cloudId) {
      groupCloudToLocal.set(group.cloudId, group.id);
    }
  });

  const mappedTransactions = backendTransactions.map((transaction: any) => ({
    id: resolveLocalBackendId(String(transaction.id), localTransactions, () =>
      localTransactions.find((row) =>
        !row.cloudId &&
        row.type === transaction.type &&
        Number(row.amount ?? 0) === Number(transaction.amount ?? 0) &&
        normalizeText(row.category) === normalizeText(transaction.category) &&
        normalizeText(row.description) === normalizeText(transaction.description) &&
        sameInstant(row.date, transaction.date),
      )
    ),
    cloudId: String(transaction.id),
    type: transaction.type,
    amount: Number(transaction.amount ?? 0),
    accountId: accountCloudToLocal.get(String(transaction.accountId)) ?? 0,
    category: transaction.category ?? 'Other',
    subcategory: transaction.subcategory ?? undefined,
    description: transaction.description ?? '',
    merchant: transaction.merchant ?? undefined,
    date: toDate(transaction.date) ?? new Date(),
    tags: Array.isArray(transaction.tags) ? transaction.tags : undefined,
    attachment: transaction.attachment ?? undefined,
    transferToAccountId: transaction.transferToAccountId ? accountCloudToLocal.get(String(transaction.transferToAccountId)) : undefined,
    transferType: transaction.transferType ?? undefined,
    expenseMode: transaction.expenseMode ?? undefined,
    groupExpenseId: transaction.groupExpenseId ? groupCloudToLocal.get(String(transaction.groupExpenseId)) : undefined,
    groupName: transaction.groupName ?? undefined,
    splitType: transaction.splitType ?? undefined,
    importSource: transaction.importSource ?? undefined,
    importMetadata: transaction.importMetadata ?? undefined,
    originalCategory: transaction.originalCategory ?? undefined,
    importedAt: toDate(transaction.importedAt),
    createdAt: toDate(transaction.createdAt) ?? new Date(),
    updatedAt: toDate(transaction.updatedAt),
    deletedAt: toDate(transaction.deletedAt),
    syncStatus: 'synced' as const,
    version: transaction.version ?? undefined,
  })).filter((transaction) => transaction.accountId > 0);

  const mappedLoans = backendLoans.map((loan: any) => ({
    id: resolveLocalBackendId(String(loan.id), localLoans, () =>
      localLoans.find((row) =>
        !row.cloudId &&
        normalizeText(row.name) === normalizeText(loan.name) &&
        row.type === loan.type &&
        Number(row.principalAmount ?? 0) === Number(loan.principalAmount ?? 0),
      )
    ),
    cloudId: String(loan.id),
    type: loan.type,
    name: loan.name,
    principalAmount: Number(loan.principalAmount ?? 0),
    outstandingBalance: Number(loan.outstandingBalance ?? 0),
    interestRate: loan.interestRate ?? undefined,
    totalPayable: loan.totalPayable ?? undefined,
    emiAmount: loan.emiAmount ?? undefined,
    dueDate: toDate(loan.dueDate),
    loanDate: toDate(loan.loanDate),
    frequency: loan.frequency ?? undefined,
    status: loan.status ?? 'active',
    contactPerson: loan.contactPerson ?? undefined,
    friendId: loan.friendId ? friendCloudToLocal.get(String(loan.friendId)) : undefined,
    contactEmail: loan.contactEmail ?? undefined,
    contactPhone: loan.contactPhone ?? undefined,
    accountId: loan.accountId ? accountCloudToLocal.get(String(loan.accountId)) : undefined,
    notes: loan.notes ?? undefined,
    createdAt: toDate(loan.createdAt) ?? new Date(),
    updatedAt: toDate(loan.updatedAt),
    deletedAt: toDate(loan.deletedAt),
    syncStatus: 'synced' as const,
    version: loan.version ?? undefined,
  }));

  const mappedTodoLists = backendTodoLists.map((list: any) => {
    const cloudId = String(list.id);
    const localId = resolveLocalBackendId(cloudId, localTodoLists, () =>
      localTodoLists.find((row) =>
        !row.cloudId &&
        normalizeText(row.name) === normalizeText(list.name) &&
        row.ownerId === list.userId
      )
    );

    const next = {
      id: localId,
      cloudId,
      name: list.name,
      description: list.description ?? undefined,
      ownerId: list.userId,
      createdAt: toDate(list.createdAt) ?? new Date(),
      updatedAt: toDate(list.updatedAt),
      archived: list.archived ?? false,
      syncStatus: 'synced' as const,
    };

    if (next.id) {
      listCloudToLocal.set(cloudId, next.id);
    }

    return next;
  });

  mappedTodoLists.forEach((list) => {
    if (list.id && list.cloudId) {
      listCloudToLocal.set(list.cloudId, list.id);
    }
  });

  const mappedTodoItems = backendTodoItems.map((item: any) => {
    const localListId = listCloudToLocal.get(String(item.listId));
    const cloudId = String(item.id);
    const localId = resolveLocalBackendId(cloudId, localTodoItems, () =>
      localTodoItems.find((row) =>
        !row.cloudId &&
        row.listId === localListId &&
        normalizeText(row.title) === normalizeText(item.title)
      )
    );

    return {
      id: localId,
      cloudId,
      listId: localListId ?? 0,
      title: item.title,
      description: item.description ?? undefined,
      completed: item.completed ?? false,
      priority: item.priority ?? 'medium',
      dueDate: toDate(item.dueDate),
      createdBy: item.createdBy,
      createdAt: toDate(item.createdAt) ?? new Date(),
      updatedAt: toDate(item.updatedAt),
      completedAt: toDate(item.completedAt),
      syncStatus: 'synced' as const,
    };
  });

  const mappedTodoShares = backendTodoShares.map((share: any) => {
    const localListId = listCloudToLocal.get(String(share.listId));
    const cloudId = String(share.id);
    const localId = localTodoShares.find((row) =>
      row.listId === localListId &&
      row.sharedWithUserId === share.sharedWithUserId
    )?.id;

    return {
      id: localId,
      cloudId,
      listId: localListId ?? 0,
      sharedWithUserId: share.sharedWithUserId,
      permission: share.permission,
      sharedAt: toDate(share.sharedAt) ?? new Date(),
      sharedBy: share.sharedBy,
      syncStatus: 'synced' as const,
    };
  });

  await runWithCloudSyncSuppressed(async () => {
    if (mergeTargets.has('accounts')) {
      await mergeBackendTable('accounts', backendAccounts, mappedAccounts, localAccounts);
    }
    if (mergeTargets.has('friends')) {
      await mergeBackendTable('friends', backendFriends, mappedFriends, localFriends);
    }
    if (mergeTargets.has('transactions')) {
      await mergeBackendTable('transactions', backendTransactions, mappedTransactions, localTransactions);
    }
    if (mergeTargets.has('loans')) {
      await mergeBackendTable('loans', backendLoans, mappedLoans, localLoans);
    }
    if (mergeTargets.has('goals')) {
      await mergeBackendTable('goals', backendGoals, mappedGoals, localGoals);
    }
    if (mergeTargets.has('investments')) {
      await mergeBackendTable('investments', backendInvestments, mappedInvestments, localInvestments);
    }
    if (mergeTargets.has('group_expenses')) {
      await mergeBackendTable('group_expenses', backendGroups, mappedGroups, localGroups);
    }

    if (mergeTargets.has('to_do_lists')) {
      await mergeBackendTable('to_do_lists', backendTodoLists, mappedTodoLists, localTodoLists);
      
      const dbLists = await db.toDoLists.toArray();
      for (const list of dbLists) {
        if (list.id && list.cloudId) {
          listCloudToLocal.set(list.cloudId, list.id);
        }
      }

      const finalTodoItems = mappedTodoItems.map(item => {
        const resolvedListId = listCloudToLocal.get(String(backendTodoItems.find((bi: any) => String(bi.id) === item.cloudId)?.listId));
        return {
          ...item,
          listId: resolvedListId ?? item.listId,
        };
      }).filter(item => item.listId > 0);

      const finalTodoShares = mappedTodoShares.map(share => {
        const resolvedListId = listCloudToLocal.get(String(backendTodoShares.find((bs: any) => String(bs.id) === share.cloudId)?.listId));
        return {
          ...share,
          listId: resolvedListId ?? share.listId,
        };
      }).filter(share => share.listId > 0);

      if (mergeTargets.has('to_do_items')) {
        await mergeBackendTable('to_do_items', backendTodoItems, finalTodoItems, localTodoItems);
      }
      if (mergeTargets.has('to_do_list_shares')) {
        await mergeBackendTable('to_do_list_shares', backendTodoShares, finalTodoShares, localTodoShares);
      }
    } else {
      if (mergeTargets.has('to_do_items')) {
        await mergeBackendTable('to_do_items', backendTodoItems, mappedTodoItems.filter(item => item.listId > 0), localTodoItems);
      }
      if (mergeTargets.has('to_do_list_shares')) {
        await mergeBackendTable('to_do_list_shares', backendTodoShares, mappedTodoShares.filter(share => share.listId > 0), localTodoShares);
      }
    }
  });

  // CRITICAL: Deduplicate AFTER all merges to catch any stragglers from race conditions
  await deduplicateLocalData();

  const now = Date.now().toString();
  finalTablesToSync.forEach(table => {
    localStorage.setItem(`KANAKU_last_sync_at_${table}`, now);
  });

  if (tablesToSync.length >= CORE_SYNC_TABLES.length) {
    localStorage.setItem(LAST_FULL_SYNC_KEY, now);
  }
}

export async function syncUserDataFromCloud(
  userId: string,
  requestedTables?: SyncedTableName[],
  force = false
) {
  if (isBackendFirstSyncMode()) {
    await syncUserDataFromBackend(requestedTables, force);
    return;
  }

  if (!DIRECT_CLOUD_SYNC_ENABLED) return;

  const tablesToSync = requestedTables === undefined ? CORE_SYNC_TABLES : requestedTables;

  if (syncState.syncingFromCloud) return;
  if (shouldSkipDirectSupabaseRequests()) return;

  const skipFull = !force && await shouldSkipFullSync(tablesToSync);
  if (skipFull) {
    console.info('[Sync] Skipping full cloud pull; last sync was <5m ago and local data exists.');
    try {
      await deduplicateLocalData();
      await processPendingSyncQueue();
    } catch (err) {
      console.warn('[Sync] Queue processing on skipped sync failed:', err);
    }
    return;
  }

  const targetTables = filterAvailableSupabaseTables(tablesToSync) as SyncedTableName[];
  let finalTablesToSync = targetTables;
  if (!force) {
    const cooldownMs = 5 * 60 * 1000; // 5 minutes
    finalTablesToSync = targetTables.filter(table => {
      const lastSyncStr = localStorage.getItem(`KANAKU_last_sync_at_${table}`);
      if (!lastSyncStr) return true;
      const lastSync = Number(lastSyncStr);
      if (isNaN(lastSync) || Date.now() - lastSync < 0 || Date.now() - lastSync >= cooldownMs) {
        return true;
      }
      return false;
    });
  }

  if (finalTablesToSync.length === 0) {
    console.info('[Sync] Skipping cloud sync; all requested tables synced <5m ago.');
    try {
      await deduplicateLocalData();
      await processPendingSyncQueue();
    } catch (err) {
      console.warn('[Sync] Queue processing on skipped sync failed:', err);
    }
    return;
  }

  syncState.syncingFromCloud = true;

  try {
    initializeBackendSync();
    // Run deduplication pass first to clean up any existing duplicates in local DB
    await deduplicateLocalData();
    await processPendingSyncQueue();

    const currentSyncTables = finalTablesToSync;
    const expandedTables = filterAvailableSupabaseTables(expandTablesForSync(currentSyncTables)) as SyncedTableName[];
    const mergeTargets = new Set<SyncedTableName>(currentSyncTables);
    const shouldFetch = (table: SyncedTableName) => expandedTables.includes(table);

    const [
      remoteAccounts,
      remoteFriends,
      remoteTransactions,
      remoteLoans,
      remoteGoals,
      remoteInvestments,
      remoteGroupExpenses,
      localAccounts,
      localFriends,
      localTransactions,
      localLoans,
      localGoals,
      localInvestments,
      localGroupExpenses,
    ] = await Promise.all([
      shouldFetch('accounts') ? fetchUserRows('accounts', userId) : Promise.resolve([]),
      shouldFetch('friends') ? fetchUserRows('friends', userId) : Promise.resolve([]),
      shouldFetch('transactions') ? fetchUserRows('transactions', userId) : Promise.resolve([]),
      shouldFetch('loans') ? fetchUserRows('loans', userId) : Promise.resolve([]),
      shouldFetch('goals') ? fetchUserRows('goals', userId) : Promise.resolve([]),
      shouldFetch('investments') ? fetchUserRows('investments', userId) : Promise.resolve([]),
      shouldFetch('group_expenses') ? fetchUserRows('group_expenses', userId) : Promise.resolve([]),
      shouldFetch('accounts') ? db.accounts.toArray() : Promise.resolve([]),
      shouldFetch('friends') ? db.friends.toArray() : Promise.resolve([]),
      shouldFetch('transactions') ? db.transactions.toArray() : Promise.resolve([]),
      shouldFetch('loans') ? db.loans.toArray() : Promise.resolve([]),
      shouldFetch('goals') ? db.goals.toArray() : Promise.resolve([]),
      shouldFetch('investments') ? db.investments.toArray() : Promise.resolve([]),
      shouldFetch('group_expenses') ? db.groupExpenses.toArray() : Promise.resolve([]),
    ]);

    const accountRemoteToLocal = new Map<number, number>();
    const friendRemoteToLocal = new Map<number, number>();
    const groupExpenseRemoteToLocal = new Map<number, number>();
    const transactionRemoteToLocal = new Map<number, number>();

    const localAccountIdSet = new Set(localAccounts.map(a => Number(a.id)));

    const mappedAccounts = remoteAccounts.map((account: any) => {
      const resolvedId = resolveLocalId(account, localAccounts, (rows) => findMatchingAccount(account, rows));
      const remoteNumericId = Number(account.id);
      // Only use the remote numeric ID as local key if no existing local record would be overwritten
      // (i.e., no local record with that ID exists OR it already maps to this remote account)
      const hasConflict = resolvedId === undefined &&
        localAccountIdSet.has(remoteNumericId) &&
        !localAccounts.some(r => Number(r.id) === remoteNumericId && toNumber(r.remoteId) === remoteNumericId);
      const localId = resolvedId ?? (hasConflict ? undefined : remoteNumericId);
      accountRemoteToLocal.set(remoteNumericId, resolvedId ?? remoteNumericId);

      return {
        id: localId,
        remoteId: Number(account.id),
        name: account.name,
        type: account.type,
        provider: account.provider ?? undefined,
        country: account.country ?? undefined,
        balance: Number(account.balance ?? 0),
        currency: account.currency ?? 'INR',
        isActive: account.is_active ?? true,
        createdAt: toDate(account.created_at) ?? new Date(),
        updatedAt: toDate(account.updated_at),
        deletedAt: toDate(account.deleted_at),
      };
    });

    const mappedFriends = remoteFriends.map((friend: any) => {
      const localId = resolveLocalId(friend, localFriends, (rows) => findMatchingFriend(friend, rows)) ?? Number(friend.id);
      friendRemoteToLocal.set(Number(friend.id), localId);

      return {
        id: localId,
        remoteId: Number(friend.id),
        name: friend.name,
        email: friend.email ?? undefined,
        phone: friend.phone ?? undefined,
        avatar: friend.avatar ?? undefined,
        notes: friend.notes ?? undefined,
        createdAt: toDate(friend.created_at) ?? new Date(),
        updatedAt: toDate(friend.updated_at),
        deletedAt: toDate(friend.deleted_at),
      };
    });

    remoteGroupExpenses.forEach((group: any) => {
      const localPaidBy = accountRemoteToLocal.get(Number(group.paid_by)) ?? Number(group.paid_by);
      const localId = resolveLocalId(group, localGroupExpenses, (rows) => findMatchingGroupExpense(group, rows, localPaidBy)) ?? Number(group.id);

      groupExpenseRemoteToLocal.set(Number(group.id), localId);
    });

    const mappedTransactions = remoteTransactions.map((transaction: any) => {
      const localAccountId = accountRemoteToLocal.get(Number(transaction.account_id)) ?? Number(transaction.account_id);
      const localTransferAccountId = transaction.transfer_to_account_id
        ? accountRemoteToLocal.get(Number(transaction.transfer_to_account_id)) ?? Number(transaction.transfer_to_account_id)
        : undefined;
      const localGroupExpenseId = transaction.group_expense_id
        ? groupExpenseRemoteToLocal.get(Number(transaction.group_expense_id)) ?? undefined
        : undefined;
      const localId = resolveLocalId(transaction, localTransactions, (rows) => findMatchingTransaction(transaction, rows, localAccountId)) ?? Number(transaction.id);

      transactionRemoteToLocal.set(Number(transaction.id), localId);

      return {
        id: localId,
        remoteId: Number(transaction.id),
        type: transaction.type,
        amount: Number(transaction.amount ?? 0),
        accountId: localAccountId,
        category: transaction.category ?? 'Other',
        subcategory: transaction.subcategory ?? undefined,
        description: transaction.description ?? '',
        merchant: transaction.merchant ?? undefined,
        date: toDate(transaction.date) ?? new Date(),
        tags: Array.isArray(transaction.tags) ? transaction.tags : undefined,
        attachment: transaction.attachment ?? undefined,
        transferToAccountId: localTransferAccountId,
        transferType: transaction.transfer_type ?? undefined,
        expenseMode: transaction.expense_mode ?? undefined,
        groupExpenseId: localGroupExpenseId,
        groupName: transaction.group_name ?? undefined,
        splitType: transaction.split_type ?? undefined,
        importSource: transaction.import_source ?? undefined,
        importMetadata: transaction.import_metadata ?? undefined,
        originalCategory: transaction.original_category ?? undefined,
        importedAt: toDate(transaction.imported_at),
        createdAt: toDate(transaction.created_at) ?? new Date(),
        updatedAt: toDate(transaction.updated_at),
        deletedAt: toDate(transaction.deleted_at),
      };
    });

    const mappedLoans = remoteLoans.map((loan: any) => {
      const localFriendId = loan.friend_id
        ? friendRemoteToLocal.get(Number(loan.friend_id)) ?? undefined
        : undefined;
      const localAccountId = loan.account_id
        ? accountRemoteToLocal.get(Number(loan.account_id)) ?? undefined
        : undefined;
      const localId = resolveLocalId(loan, localLoans, (rows) => findMatchingLoan(loan, rows)) ?? Number(loan.id);

      return {
        id: localId,
        remoteId: Number(loan.id),
        type: loan.type,
        name: loan.name,
        principalAmount: Number(loan.principal_amount ?? 0),
        outstandingBalance: Number(loan.outstanding_balance ?? 0),
        interestRate: loan.interest_rate ?? undefined,
        totalPayable: loan.total_payable ?? undefined,
        emiAmount: loan.emi_amount ?? undefined,
        dueDate: toDate(loan.due_date),
        loanDate: toDate(loan.loan_date),
        frequency: loan.frequency ?? undefined,
        status: loan.status ?? 'active',
        contactPerson: loan.contact_person ?? undefined,
        friendId: localFriendId,
        contactEmail: loan.contact_email ?? undefined,
        contactPhone: loan.contact_phone ?? undefined,
        accountId: localAccountId,
        notes: loan.notes ?? undefined,
        createdAt: toDate(loan.created_at) ?? new Date(),
        updatedAt: toDate(loan.updated_at),
        deletedAt: toDate(loan.deleted_at),
      };
    });

    const mappedGoals = remoteGoals.map((goal: any) => {
      const localId = resolveLocalId(goal, localGoals, (rows) => findMatchingGoal(goal, rows)) ?? Number(goal.id);

      return {
        id: localId,
        remoteId: Number(goal.id),
        name: goal.name,
        description: goal.description ?? undefined,
        targetAmount: Number(goal.target_amount ?? 0),
        currentAmount: Number(goal.current_amount ?? 0),
        targetDate: toDate(goal.target_date) ?? new Date(),
        category: goal.category ?? 'other',
        isGroupGoal: goal.is_group_goal ?? false,
        createdAt: toDate(goal.created_at) ?? new Date(),
        updatedAt: toDate(goal.updated_at),
        deletedAt: toDate(goal.deleted_at),
      };
    });

    const mappedGroupExpenses = remoteGroupExpenses.map((group: any) => {
      const localPaidBy = accountRemoteToLocal.get(Number(group.paid_by)) ?? Number(group.paid_by);
      const localId = groupExpenseRemoteToLocal.get(Number(group.id)) ?? Number(group.id);

      const members = Array.isArray(group.members)
        ? group.members.map((member: any) => ({
          ...member,
          friendId: member?.friendId
            ? friendRemoteToLocal.get(Number(member.friendId)) ?? undefined
            : undefined,
        }))
        : [];

      return {
        id: localId,
        remoteId: Number(group.id),
        name: group.name,
        totalAmount: Number(group.total_amount ?? 0),
        paidBy: localPaidBy,
        date: toDate(group.date) ?? new Date(),
        members,
        items: Array.isArray(group.items) ? group.items : [],
        description: group.description ?? undefined,
        category: group.category ?? undefined,
        subcategory: group.subcategory ?? undefined,
        splitType: group.split_type ?? undefined,
        yourShare: group.your_share ?? undefined,
        expenseTransactionId: group.expense_transaction_id
          ? transactionRemoteToLocal.get(Number(group.expense_transaction_id)) ?? undefined
          : undefined,
        createdBy: group.created_by ?? undefined,
        createdByName: group.created_by_name ?? undefined,
        status: group.status ?? undefined,
        notificationStatus: group.notification_status ?? undefined,
        createdAt: toDate(group.created_at) ?? new Date(),
        updatedAt: toDate(group.updated_at),
        deletedAt: toDate(group.deleted_at),
      };
    });

    const mappedInvestments = remoteInvestments.map((investment: any) => {
      const localId = resolveLocalId(investment, localInvestments, (rows) => findMatchingInvestment(investment, rows)) ?? Number(investment.id);

      return {
        id: localId,
        remoteId: Number(investment.id),
        assetType: investment.asset_type,
        assetName: investment.asset_name,
        quantity: Number(investment.quantity ?? 0),
        buyPrice: Number(investment.buy_price ?? 0),
        currentPrice: Number(investment.current_price ?? 0),
        totalInvested: Number(investment.total_invested ?? 0),
        currentValue: Number(investment.current_value ?? 0),
        profitLoss: Number(investment.profit_loss ?? 0),
        purchaseDate: toDate(investment.purchase_date) ?? new Date(),
        lastUpdated: toDate(investment.last_updated) ?? new Date(),
        broker: investment.broker ?? undefined,
        description: investment.description ?? undefined,
        assetCurrency: investment.asset_currency ?? undefined,
        baseCurrency: investment.base_currency ?? undefined,
        buyFxRate: investment.buy_fx_rate ?? undefined,
        lastKnownFxRate: investment.last_known_fx_rate ?? undefined,
        totalInvestedNative: investment.total_invested_native ?? undefined,
        currentValueNative: investment.current_value_native ?? undefined,
        valuationVersion: investment.valuation_version ?? undefined,
        positionStatus: investment.position_status ?? undefined,
        closedAt: toDate(investment.closed_at),
        closePrice: investment.close_price ?? undefined,
        closeFxRate: investment.close_fx_rate ?? undefined,
        grossSaleValue: investment.gross_sale_value ?? undefined,
        netSaleValue: investment.net_sale_value ?? undefined,
        fundingAccountId: investment.funding_account_id
          ? accountRemoteToLocal.get(Number(investment.funding_account_id)) ?? undefined
          : undefined,
        purchaseFees: investment.purchase_fees ?? undefined,
        purchaseTransactionId: investment.purchase_transaction_id
          ? transactionRemoteToLocal.get(Number(investment.purchase_transaction_id)) ?? undefined
          : undefined,
        purchaseFeeTransactionId: investment.purchase_fee_transaction_id
          ? transactionRemoteToLocal.get(Number(investment.purchase_fee_transaction_id)) ?? undefined
          : undefined,
        saleTransactionId: investment.sale_transaction_id
          ? transactionRemoteToLocal.get(Number(investment.sale_transaction_id)) ?? undefined
          : undefined,
        saleFeeTransactionId: investment.sale_fee_transaction_id
          ? transactionRemoteToLocal.get(Number(investment.sale_fee_transaction_id)) ?? undefined
          : undefined,
        closingFees: investment.closing_fees ?? undefined,
        realizedProfitLoss: investment.realized_profit_loss ?? undefined,
        settlementAccountId: investment.settlement_account_id
          ? accountRemoteToLocal.get(Number(investment.settlement_account_id)) ?? undefined
          : undefined,
        closeNotes: investment.close_notes ?? undefined,
        createdAt: toDate(investment.created_at) ?? new Date(),
        updatedAt: toDate(investment.updated_at),
        deletedAt: toDate(investment.deleted_at),
      };
    });

    await runWithCloudSyncSuppressed(async () => {
      if (mergeTargets.has('accounts')) {
        await mergeRemoteTable('accounts', remoteAccounts, mappedAccounts, localAccounts);
      }
      if (mergeTargets.has('friends')) {
        await mergeRemoteTable('friends', remoteFriends, mappedFriends, localFriends);
      }
      if (mergeTargets.has('transactions')) {
        await mergeRemoteTable('transactions', remoteTransactions, mappedTransactions, localTransactions);
      }
      if (mergeTargets.has('loans')) {
        await mergeRemoteTable('loans', remoteLoans, mappedLoans, localLoans);
      }
      if (mergeTargets.has('goals')) {
        await mergeRemoteTable('goals', remoteGoals, mappedGoals, localGoals);
      }
      if (mergeTargets.has('group_expenses')) {
        await mergeRemoteTable('group_expenses', remoteGroupExpenses, mappedGroupExpenses, localGroupExpenses);
      }
      if (mergeTargets.has('investments')) {
        await mergeRemoteTable('investments', remoteInvestments, mappedInvestments, localInvestments);
      }
    });

    // CRITICAL: Deduplicate AFTER all merges to catch any stragglers from race conditions
    await deduplicateLocalData();

    const now = Date.now().toString();
    currentSyncTables.forEach(table => {
      localStorage.setItem(`KANAKU_last_sync_at_${table}`, now);
    });

    if (tablesToSync.length >= CORE_SYNC_TABLES.length) {
      localStorage.setItem(LAST_FULL_SYNC_KEY, now);
    }
  } finally {
    syncState.syncingFromCloud = false;
  }
}

function scheduleCloudPull(userId: string, tables: SyncedTableName[] = CORE_SYNC_TABLES, delay = 400) {
  if (shouldSkipDirectSupabaseRequests()) {
    return;
  }

  const schedulableTables = filterAvailableSupabaseTables(tables) as SyncedTableName[];
  if (schedulableTables.length === 0) {
    return;
  }

  schedulableTables.forEach((table) => syncState.pendingPullTables.add(table));

  if (syncState.pullTimer) {
    clearTimeout(syncState.pullTimer);
  }

  syncState.pullTimer = setTimeout(() => {
    syncState.pullTimer = null;
    const pendingTables = (
      syncState.pendingPullTables.size > 0
        ? [...syncState.pendingPullTables]
        : [...CORE_SYNC_TABLES]
    ).filter((table) => !isSupabaseTableUnavailable(table)) as SyncedTableName[];
    syncState.pendingPullTables.clear();

    if (pendingTables.length === 0 || shouldSkipDirectSupabaseRequests()) {
      return;
    }

    void (async () => {
      try {
        await syncUserDataFromCloud(userId, pendingTables);
      } catch (error) {
        if (isConnectivityError(error)) {
          markSupabaseTemporarilyUnavailable(error);
          if (syncState.activeChannel) {
            void supabase.removeChannel(syncState.activeChannel);
            syncState.activeChannel = null;
          }
        } else {
          console.warn('Cloud pull failed:', error);
        }
      }
    })();
  }, delay);
}

export function subscribeToUserCloudSync(userId: string) {
  if (!DIRECT_CLOUD_SYNC_ENABLED) {
    return () => { };
  }

  initializeBackendSync();
  syncState.activeUserId = userId;

  if (syncState.activeChannel) {
    void supabase.removeChannel(syncState.activeChannel);
    syncState.activeChannel = null;
  }

  if (shouldSkipDirectSupabaseRequests()) {
    return () => {
      if (syncState.activeUserId === userId) {
        syncState.activeUserId = null;
      }
    };
  }

  const subscribableTables = filterAvailableSupabaseTables(CORE_SYNC_TABLES) as SyncedTableName[];
  if (subscribableTables.length === 0) {
    return () => {
      if (syncState.activeUserId === userId) {
        syncState.activeUserId = null;
      }
    };
  }

  const channel = supabase.channel(`KANAKU-user-sync-${userId}`);

  for (const table of subscribableTables) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: getRemoteTableName(table),
        filter: `user_id=eq.${userId}`,
      },
      () => {
        scheduleCloudPull(userId, [table], 250);
      }
    );
  }

  channel.subscribe((status: any) => {
    if (status === 'SUBSCRIBED') {
      clearSupabaseTemporaryUnavailable();
      scheduleCloudPull(userId, subscribableTables, 200);
    }
  });

  syncState.activeChannel = channel;

  return () => {
    if (syncState.activeChannel === channel) {
      void supabase.removeChannel(channel);
      syncState.activeChannel = null;
    }

    if (syncState.activeUserId === userId) {
      syncState.activeUserId = null;
    }
  };
}

export function queueTransactionInsertSync(localId: number, transaction?: any) {
  queueRecordUpsertSync('transactions', localId, toNumber(transaction?.remoteId));
}

export function queueTransactionUpdateSync(localId: number, transaction?: any) {
  queueRecordUpsertSync('transactions', localId, toNumber(transaction?.remoteId));
}

export function queueTransactionDeleteSync(localId: number, remoteId?: number) {
  queueRecordDeleteSync('transactions', localId, remoteId);
}

export async function handleLoginSuccess(userId: string, _token: string) {
  initializeBackendSync();
  if (!DIRECT_CLOUD_SYNC_ENABLED) return;
  await processPendingSyncQueue();
  await syncUserDataFromCloud(userId);
}

export async function handleLogout() {
  if (syncState.queueTimer) {
    clearTimeout(syncState.queueTimer);
    syncState.queueTimer = null;
  }

  if (syncState.pullTimer) {
    clearTimeout(syncState.pullTimer);
    syncState.pullTimer = null;
  }

  if (syncState.activeChannel) {
    await supabase.removeChannel(syncState.activeChannel);
    syncState.activeChannel = null;
  }

  syncState.activeUserId = null;
  writeSyncQueue([]);
}

export async function saveTransactionWithBackendSync(transaction: any) {
  initializeBackendSync();

  const activeDedupHash = transaction.dedupHash || crypto.randomUUID();

  if (isBackendFirstSyncMode()) {
    const sourceAccount = await db.accounts.get(Number(transaction.accountId));

    // If the account doesn't have a cloudId (saved locally while backend was down),
    // fall through to local-only storage and queue for sync
    const canSyncToBackend = !!sourceAccount?.cloudId;

    const transferTargetAccount = transaction.transferToAccountId
      ? await db.accounts.get(Number(transaction.transferToAccountId))
      : null;

    if (canSyncToBackend) {
      if (transaction.transferToAccountId && !transferTargetAccount?.cloudId) {
        // Fall through to local save  target account not yet synced
      } else {
        try {
          const response = await apiClient.post('/transactions', {
            accountId: sourceAccount!.cloudId,
            type: transaction.type,
            amount: Number(transaction.amount ?? 0),
            category: transaction.category,
            subcategory: transaction.subcategory,
            description: transaction.description,
            merchant: transaction.merchant,
            date: toIsoString(transaction.date) ?? new Date().toISOString(),
            tags: Array.isArray(transaction.tags) ? transaction.tags : [],
            transferToAccountId: transferTargetAccount?.cloudId,
            transferType: transaction.transferType,
            dedupHash: activeDedupHash,
          }, {
            showErrorToast: false,
          });

          const remote = response.data as any;
          const now = new Date();
          const dbTransaction = {
            ...transaction,
            cloudId: remote?.id,
            dedupHash: activeDedupHash,
            createdAt: toDate(remote?.createdAt) ?? transaction.createdAt ?? now,
            updatedAt: toDate(remote?.updatedAt) ?? now,
            syncStatus: 'synced' as const,
            version: remote?.version ?? transaction.version,
          };

          const savedId = await db.transactions.add(dbTransaction);
          return { ...dbTransaction, id: savedId };
        } catch (backendError: any) {
          const isUnavailable =
            backendError?.status === 503 ||
            backendError?.status === 0 ||
            backendError?.code === 'DATABASE_UNAVAILABLE' ||
            backendError?.code === 'NETWORK_ERROR' ||
            backendError?.code === 'TIMEOUT_ERROR';

          if (!isUnavailable) throw backendError;

          console.warn('[saveTransactionWithBackendSync] Backend unavailable, saving locally and queuing for sync.', backendError?.code);
          markOptionalBackendUnavailable();
          // Fall through to local save below
        }
      }
    }
  }

  // Local-only save (also used as fallback from backend-unavailable path above)
  const now = new Date();
  const dbTransaction = {
    ...transaction,
    dedupHash: activeDedupHash,
    syncStatus: 'pending' as const,
    createdAt: transaction.createdAt ?? now,
    updatedAt: now,
  };

  const savedId = await db.transactions.add(dbTransaction);
  queueRecordUpsertSync('transactions', savedId, toNumber(transaction?.remoteId));

  return { ...dbTransaction, id: savedId };
}

export async function updateTransactionWithBackendSync(localId: number, updates: any) {
  initializeBackendSync();

  const existing = await db.transactions.get(localId);
  if (!existing) {
    throw new Error('Transaction not found');
  }

  if (isBackendFirstSyncMode() && existing.cloudId) {
    const transferTargetAccount = updates.transferToAccountId != null
      ? await db.accounts.get(Number(updates.transferToAccountId))
      : null;

    if (updates.transferToAccountId != null && !transferTargetAccount?.cloudId) {
      throw new Error('Transfer destination account must be synced before updating a backend transaction');
    }

    const response = await apiClient.put(`/transactions/${existing.cloudId}`, {
      type: updates.type ?? existing.type,
      amount: Number(updates.amount ?? existing.amount ?? 0),
      category: updates.category ?? existing.category,
      subcategory: updates.subcategory ?? existing.subcategory,
      description: updates.description ?? existing.description,
      merchant: updates.merchant ?? existing.merchant,
      date: toIsoString(updates.date ?? existing.date) ?? new Date().toISOString(),
      tags: Array.isArray(updates.tags) ? updates.tags : (existing.tags ?? []),
      transferToAccountId: transferTargetAccount?.cloudId ?? undefined,
      transferType: updates.transferType ?? existing.transferType,
    }, {
      showErrorToast: false,
    });

    const remote = response.data as any;
    await db.transactions.update(localId, {
      ...updates,
      cloudId: remote?.id ?? existing.cloudId,
      createdAt: toDate(remote?.createdAt) ?? existing.createdAt,
      updatedAt: toDate(remote?.updatedAt) ?? new Date(),
      syncStatus: 'synced' as const,
      version: remote?.version ?? existing.version,
    });
    return;
  }

  await db.transactions.update(localId, {
    ...updates,
    updatedAt: new Date(),
  });

  queueRecordUpsertSync('transactions', localId, toNumber(existing.remoteId));
}

export async function deleteTransactionWithBackendSync(localId: number) {
  initializeBackendSync();

  const existing = await db.transactions.get(localId);
  if (!existing) {
    return;
  }

  if (isBackendFirstSyncMode() && existing.cloudId) {
    await apiClient.delete(`/transactions/${existing.cloudId}`, {
      showErrorToast: false,
    });
    await db.transactions.delete(localId);
    return;
  }

  await db.transactions.delete(localId);
  queueRecordDeleteSync('transactions', localId, toNumber(existing.remoteId));
}

export async function saveTransactionAndUpdateAccountWithBackendSync(
  transaction: any,
  accountId: number,
  _nextAccountBalance: number,
) {
  initializeBackendSync();

  const now = new Date();
  const dbTransaction: any = {
    ...transaction,
    createdAt: transaction.createdAt ?? now,
    updatedAt: now,
  };

  const savedId = await db.transaction('rw', [db.transactions, db.accounts], async () => {
    const transactionId = await db.transactions.add(dbTransaction);
    await applyTransactionAccountImpact(dbTransaction, now);
    return transactionId;
  });

  queueRecordUpsertSync('transactions', savedId, toNumber(transaction?.remoteId));
  for (const impactedAccountId of getTransactionAccountDeltas(dbTransaction).keys()) {
    queueRecordUpsertSync('accounts', impactedAccountId);
  }
  if (!getTransactionAccountDeltas(dbTransaction).has(accountId)) {
    queueRecordUpsertSync('accounts', accountId);
  }

  return { ...dbTransaction, id: savedId };
}

export async function saveAccountWithBackendSync(account: any) {
  initializeBackendSync();

  const activeClientRequestId = account.clientRequestId || crypto.randomUUID();

  if (isBackendFirstSyncMode()) {
    try {
      const response = await apiClient.post('/accounts', {
        name: account.name,
        type: account.type,
        provider: account.provider ?? undefined,
        country: account.country ?? undefined,
        balance: Number(account.balance ?? 0),
        currency: account.currency,
        clientRequestId: activeClientRequestId,
      }, {
        showErrorToast: false,
      });

      const remote = response.data as any;
      const dbAccount = {
        ...account,
        cloudId: remote?.id,
        clientRequestId: activeClientRequestId,
        balance: Number(remote?.balance ?? account.balance ?? 0),
        isActive: remote?.isActive ?? account.isActive ?? true,
        createdAt: toDate(remote?.createdAt) ?? account.createdAt ?? new Date(),
        updatedAt: toDate(remote?.updatedAt) ?? new Date(),
        deletedAt: toDate(remote?.deletedAt),
        syncStatus: 'synced' as const,
      };

      const savedId = await db.accounts.add(dbAccount);
      return { ...dbAccount, id: savedId };
    } catch (backendError: any) {
      // If the backend is unavailable (503, network error, timeout), fall back
      // to local-only storage and queue the record for sync when it recovers.
      const isUnavailable =
        backendError?.status === 503 ||
        backendError?.status === 0 ||
        backendError?.code === 'DATABASE_UNAVAILABLE' ||
        backendError?.code === 'NETWORK_ERROR' ||
        backendError?.code === 'TIMEOUT_ERROR' ||
        backendError?.name === 'AbortError';

      if (!isUnavailable) {
        // Surface real client errors (400, 401, 403, etc.) to the caller
        throw backendError;
      }

      console.warn('[saveAccountWithBackendSync] Backend unavailable, saving locally and queuing for sync.', backendError?.code);
      markOptionalBackendUnavailable();

      const now = new Date();
      const dbAccount = {
        ...account,
        clientRequestId: activeClientRequestId,
        cloudId: undefined,
        syncStatus: 'pending' as const,
        createdAt: account.createdAt ?? now,
        updatedAt: now,
      };


      const savedId = await db.accounts.add(dbAccount);
      queueRecordUpsertSync('accounts', savedId, toNumber(account?.remoteId));
      return { ...dbAccount, id: savedId };
    }
  }

  const now = new Date();
  const dbAccount = {
    ...account,
    createdAt: account.createdAt ?? now,
    updatedAt: now,
  };

  const savedId = await db.accounts.add(dbAccount);
  queueRecordUpsertSync('accounts', savedId, toNumber(account?.remoteId));

  return { ...dbAccount, id: savedId };
}

export async function updateAccountWithBackendSync(accountId: number, updates: any) {
  initializeBackendSync();

  if (isBackendFirstSyncMode()) {
    const existing = await db.accounts.get(accountId);
    if (!existing) {
      throw new Error('Account not found');
    }

    let nextUpdates = {
      ...updates,
      updatedAt: new Date(),
      syncStatus: 'synced' as const,
    };

    if (existing.cloudId) {
      try {
        const response = await apiClient.put(`/accounts/${existing.cloudId}`, {
          name: updates.name,
          type: updates.type,
          provider: updates.provider,
          country: updates.country,
          balance: updates.balance,
          currency: updates.currency,
          sub_type: updates.subType,
          color_id: updates.colorId,
          custom_color: updates.customColor,
        }, {
          showErrorToast: false,
        });

        const remote = response.data as any;
        nextUpdates = {
          ...nextUpdates,
          cloudId: remote?.id ?? existing.cloudId,
          balance: Number(remote?.balance ?? updates.balance ?? existing.balance),
          isActive: remote?.isActive ?? updates.isActive ?? existing.isActive,
          subType: remote?.sub_type ?? updates.subType ?? existing.subType,
          colorId: remote?.color_id ?? updates.colorId ?? existing.colorId,
          customColor: remote?.custom_color ?? updates.customColor ?? existing.customColor,
          updatedAt: toDate(remote?.updatedAt) ?? new Date(),
          deletedAt: toDate(remote?.deletedAt) ?? existing.deletedAt,
        };
      } catch (backendError: any) {
        const isUnavailable =
          backendError?.status === 503 ||
          backendError?.status === 0 ||
          backendError?.code === 'DATABASE_UNAVAILABLE' ||
          backendError?.code === 'NETWORK_ERROR' ||
          backendError?.code === 'TIMEOUT_ERROR';

        if (!isUnavailable) throw backendError;

        console.warn('[updateAccountWithBackendSync] Backend unavailable, updating locally and queuing for sync.');
        markOptionalBackendUnavailable();
        nextUpdates = { ...nextUpdates, syncStatus: 'pending' as const };
        queueRecordUpsertSync('accounts', accountId, toNumber(existing?.remoteId));
      }
    }

    await db.accounts.update(accountId, nextUpdates);
    return;
  }

  await db.accounts.update(accountId, {
    ...updates,
    updatedAt: new Date(),
  });

  queueRecordUpsertSync('accounts', accountId, toNumber(updates?.remoteId));
}

export async function saveGoalWithBackendSync(goal: any) {
  initializeBackendSync();

  const activeClientRequestId = goal.clientRequestId || crypto.randomUUID();

  if (isBackendFirstSyncMode()) {
    const response = await apiClient.post('/goals', {
      name: goal.name,
      targetAmount: Number(goal.targetAmount ?? 0),
      targetDate: toIsoString(goal.targetDate) ?? new Date().toISOString(),
      category: goal.category,
      isGroupGoal: goal.isGroupGoal ?? false,
      clientRequestId: activeClientRequestId,
    }, {
      showErrorToast: false,
    });

    const remote = response.data as any;
    const dbGoal = {
      ...goal,
      cloudId: remote?.id,
      clientRequestId: activeClientRequestId,
      currentAmount: Number(remote?.currentAmount ?? goal.currentAmount ?? 0),
      createdAt: toDate(remote?.createdAt) ?? goal.createdAt ?? new Date(),
      updatedAt: toDate(remote?.updatedAt) ?? new Date(),
      deletedAt: toDate(remote?.deletedAt),
      syncStatus: 'synced' as const,
    };

    const savedId = await db.goals.add(dbGoal);
    return { ...dbGoal, id: savedId };
  }

  const now = new Date();
  const dbGoal = {
    ...goal,
    clientRequestId: activeClientRequestId,
    createdAt: goal.createdAt ?? now,
    updatedAt: now,
  };

  const savedId = await db.goals.add(dbGoal);
  queueRecordUpsertSync('goals', savedId, toNumber(goal?.remoteId));

  return { ...dbGoal, id: savedId };
}

export async function checkBackendConnectivity(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  } catch {
    return false;
  }
}

export async function saveToDoListWithBackendSync(list: any) {
  initializeBackendSync();

  if (isBackendFirstSyncMode()) {
    try {
      const response = await apiClient.post<any>('/todos/lists', {
        name: list.name,
        description: list.description ?? undefined,
      }, {
        showErrorToast: false,
      });

      const remote = response.data?.data || response.data;
      const dbList = {
        ...list,
        cloudId: String(remote?.id),
        createdAt: toDate(remote?.createdAt) ?? list.createdAt ?? new Date(),
        updatedAt: toDate(remote?.updatedAt) ?? new Date(),
        syncStatus: 'synced' as const,
      };

      const savedId = await db.toDoLists.add(dbList);
      return { ...dbList, id: savedId };
    } catch (backendError: any) {
      const isUnavailable =
        backendError?.status === 503 ||
        backendError?.status === 0 ||
        backendError?.code === 'DATABASE_UNAVAILABLE' ||
        backendError?.code === 'NETWORK_ERROR' ||
        backendError?.code === 'TIMEOUT_ERROR' ||
        backendError?.name === 'AbortError';

      if (!isUnavailable) throw backendError;

      console.warn('[saveToDoListWithBackendSync] Backend unavailable, saving locally.');
      markOptionalBackendUnavailable();

      const now = new Date();
      const dbList = {
        ...list,
        cloudId: undefined,
        syncStatus: 'pending' as const,
        createdAt: list.createdAt ?? now,
        updatedAt: now,
      };

      const savedId = await db.toDoLists.add(dbList);
      queueRecordUpsertSync('to_do_lists', savedId);
      return { ...dbList, id: savedId };
    }
  }

  const now = new Date();
  const dbList = {
    ...list,
    createdAt: list.createdAt ?? now,
    updatedAt: now,
  };
  const savedId = await db.toDoLists.add(dbList);
  queueRecordUpsertSync('to_do_lists', savedId);
  return { ...dbList, id: savedId };
}

export async function updateToDoListWithBackendSync(listId: number, updates: any) {
  initializeBackendSync();

  const existing = await db.toDoLists.get(listId);
  if (!existing) {
    throw new Error('ToDo list not found');
  }

  if (isBackendFirstSyncMode()) {
    let nextUpdates = {
      ...updates,
      updatedAt: new Date(),
      syncStatus: 'synced' as const,
    };

    if (existing.cloudId) {
      try {
        const response = await apiClient.put<any>(`/todos/lists/${existing.cloudId}`, {
          name: updates.name,
          description: updates.description,
          archived: updates.archived,
        }, {
          showErrorToast: false,
        });

        const remote = response.data?.data || response.data;
        nextUpdates = {
          ...nextUpdates,
          cloudId: remote?.id ? String(remote.id) : existing.cloudId,
          updatedAt: toDate(remote?.updatedAt) ?? new Date(),
        };
      } catch (backendError: any) {
        const isUnavailable =
          backendError?.status === 503 ||
          backendError?.status === 0 ||
          backendError?.code === 'DATABASE_UNAVAILABLE' ||
          backendError?.code === 'NETWORK_ERROR' ||
          backendError?.code === 'TIMEOUT_ERROR';

        if (!isUnavailable) throw backendError;

        console.warn('[updateToDoListWithBackendSync] Backend unavailable, queuing for sync.');
        markOptionalBackendUnavailable();
        nextUpdates = { ...nextUpdates, syncStatus: 'pending' as const };
        queueRecordUpsertSync('to_do_lists', listId);
      }
    }

    await db.toDoLists.update(listId, nextUpdates);
    return;
  }

  await db.toDoLists.update(listId, {
    ...updates,
    updatedAt: new Date(),
  });
  queueRecordUpsertSync('to_do_lists', listId);
}

export async function deleteToDoListWithBackendSync(listId: number) {
  initializeBackendSync();

  const existing = await db.toDoLists.get(listId);
  if (!existing) return;

  if (isBackendFirstSyncMode() && existing.cloudId) {
    try {
      await apiClient.delete(`/todos/lists/${existing.cloudId}`, {
        showErrorToast: false,
      });
    } catch (backendError: any) {
      console.warn('[deleteToDoListWithBackendSync] Backend unavailable/error:', backendError);
    }
  }

  await db.toDoLists.delete(listId);
  await db.toDoItems.where('listId').equals(listId).delete();
  await db.toDoListShares.where('listId').equals(listId).delete();
  
  if (existing.cloudId) {
    queueRecordDeleteSync('to_do_lists', listId, toNumber(existing.cloudId));
  }
}

export async function saveToDoItemWithBackendSync(item: any) {
  initializeBackendSync();

  const list = await db.toDoLists.get(item.listId);
  if (!list) {
    throw new Error('ToDo list not found');
  }

  if (isBackendFirstSyncMode() && list.cloudId) {
    try {
      const response = await apiClient.post<any>('/todos/items', {
        listId: list.cloudId,
        title: item.title,
        description: item.description ?? undefined,
        priority: item.priority ?? 'medium',
        dueDate: item.dueDate ? toIsoString(item.dueDate) : undefined,
      }, {
        showErrorToast: false,
      });

      const remote = response.data?.data || response.data;
      const dbItem = {
        ...item,
        cloudId: String(remote?.id),
        createdAt: toDate(remote?.createdAt) ?? item.createdAt ?? new Date(),
        updatedAt: toDate(remote?.updatedAt) ?? new Date(),
        syncStatus: 'synced' as const,
      };

      const savedId = await db.toDoItems.add(dbItem);
      return { ...dbItem, id: savedId };
    } catch (backendError: any) {
      const isUnavailable =
        backendError?.status === 503 ||
        backendError?.status === 0 ||
        backendError?.code === 'DATABASE_UNAVAILABLE' ||
        backendError?.code === 'NETWORK_ERROR' ||
        backendError?.code === 'TIMEOUT_ERROR';

      if (!isUnavailable) throw backendError;

      console.warn('[saveToDoItemWithBackendSync] Backend unavailable, saving locally.');
      markOptionalBackendUnavailable();

      const now = new Date();
      const dbItem = {
        ...item,
        cloudId: undefined,
        syncStatus: 'pending' as const,
        createdAt: item.createdAt ?? now,
        updatedAt: now,
      };

      const savedId = await db.toDoItems.add(dbItem);
      queueRecordUpsertSync('to_do_items', savedId);
      return { ...dbItem, id: savedId };
    }
  }

  const now = new Date();
  const dbItem = {
    ...item,
    createdAt: item.createdAt ?? now,
    updatedAt: now,
  };
  const savedId = await db.toDoItems.add(dbItem);
  queueRecordUpsertSync('to_do_items', savedId);
  return { ...dbItem, id: savedId };
}

export async function updateToDoItemWithBackendSync(itemId: number, updates: any) {
  initializeBackendSync();

  const existing = await db.toDoItems.get(itemId);
  if (!existing) {
    throw new Error('ToDo item not found');
  }

  if (isBackendFirstSyncMode()) {
    let nextUpdates = {
      ...updates,
      updatedAt: new Date(),
      syncStatus: 'synced' as const,
    };

    if (existing.cloudId) {
      try {
        const titleVal = updates.title !== undefined ? updates.title : existing.title;
        const descVal = updates.description !== undefined ? updates.description : existing.description;
        const completedVal = updates.completed !== undefined ? updates.completed : existing.completed;
        const priorityVal = updates.priority !== undefined ? updates.priority : existing.priority;
        const rawDueDate = updates.dueDate !== undefined ? updates.dueDate : existing.dueDate;
        
        const response = await apiClient.put<any>(`/todos/items/${existing.cloudId}`, {
          title: titleVal,
          description: descVal,
          completed: completedVal,
          priority: priorityVal,
          dueDate: rawDueDate ? toIsoString(rawDueDate) : undefined,
        }, {
          showErrorToast: false,
        });

        const remote = response.data?.data || response.data;
        nextUpdates = {
          ...nextUpdates,
          cloudId: remote?.id ? String(remote.id) : existing.cloudId,
          updatedAt: toDate(remote?.updatedAt) ?? new Date(),
          completedAt: toDate(remote?.completedAt) ?? (updates.completed ? new Date() : undefined),
        };
      } catch (backendError: any) {
        const isUnavailable =
          backendError?.status === 503 ||
          backendError?.status === 0 ||
          backendError?.code === 'DATABASE_UNAVAILABLE' ||
          backendError?.code === 'NETWORK_ERROR' ||
          backendError?.code === 'TIMEOUT_ERROR';

        if (!isUnavailable) throw backendError;

        console.warn('[updateToDoItemWithBackendSync] Backend unavailable, queuing for sync.');
        markOptionalBackendUnavailable();
        nextUpdates = { ...nextUpdates, syncStatus: 'pending' as const };
        queueRecordUpsertSync('to_do_items', itemId);
      }
    }

    await db.toDoItems.update(itemId, nextUpdates);
    return;
  }

  await db.toDoItems.update(itemId, {
    ...updates,
    updatedAt: new Date(),
  });
  queueRecordUpsertSync('to_do_items', itemId);
}

export async function deleteToDoItemWithBackendSync(itemId: number) {
  initializeBackendSync();

  const existing = await db.toDoItems.get(itemId);
  if (!existing) return;

  if (isBackendFirstSyncMode() && existing.cloudId) {
    try {
      await apiClient.delete(`/todos/items/${existing.cloudId}`, {
        showErrorToast: false,
      });
    } catch (backendError: any) {
      console.warn('[deleteToDoItemWithBackendSync] Backend unavailable/error:', backendError);
    }
  }

  await db.toDoItems.delete(itemId);
  if (existing.cloudId) {
    queueRecordDeleteSync('to_do_items', itemId, toNumber(existing.cloudId));
  }
}

export async function saveToDoListShareWithBackendSync(listId: number, sharedWithEmail: string, permission: 'view' | 'edit') {
  initializeBackendSync();

  const list = await db.toDoLists.get(listId);
  if (!list) {
    throw new Error('ToDo list not found');
  }

  if (isBackendFirstSyncMode() && list.cloudId) {
    try {
      const response = await apiClient.post<any>(`/todos/lists/${list.cloudId}/share`, {
        sharedWithEmail,
        permission,
      }, {
        showErrorToast: false,
      });

      const remote = response.data?.data || response.data;
      const dbShare = {
        listId,
        sharedWithUserId: remote?.sharedWithUserId,
        permission: remote?.permission || permission,
        sharedAt: toDate(remote?.sharedAt) ?? new Date(),
        sharedBy: remote?.sharedBy || '',
        cloudId: String(remote?.id),
        syncStatus: 'synced' as const,
      };

      const savedId = await db.toDoListShares.add(dbShare);
      return { ...dbShare, id: savedId };
    } catch (backendError: any) {
      const isUnavailable =
        backendError?.status === 503 ||
        backendError?.status === 0 ||
        backendError?.code === 'DATABASE_UNAVAILABLE' ||
        backendError?.code === 'NETWORK_ERROR' ||
        backendError?.code === 'TIMEOUT_ERROR';

      if (!isUnavailable) throw backendError;

      console.warn('[saveToDoListShareWithBackendSync] Backend unavailable, saving locally.');
      markOptionalBackendUnavailable();

      const dbShare = {
        listId,
        sharedWithUserId: sharedWithEmail,
        permission,
        sharedAt: new Date(),
        sharedBy: 'local',
        cloudId: undefined,
        syncStatus: 'pending' as const,
      };

      const savedId = await db.toDoListShares.add(dbShare);
      queueRecordUpsertSync('to_do_list_shares', savedId);
      return { ...dbShare, id: savedId };
    }
  }

  const dbShare = {
    listId,
    sharedWithUserId: sharedWithEmail,
    permission,
    sharedAt: new Date(),
    sharedBy: 'local',
  };
  const savedId = await db.toDoListShares.add(dbShare);
  queueRecordUpsertSync('to_do_list_shares', savedId);
  return { ...dbShare, id: savedId };
}

export async function updateToDoListShareWithBackendSync(shareId: number, permission: 'view' | 'edit') {
  initializeBackendSync();

  const existing = await db.toDoListShares.get(shareId);
  if (!existing) {
    throw new Error('Share not found');
  }

  if (isBackendFirstSyncMode() && existing.cloudId) {
    try {
      const response = await apiClient.put<any>(`/todos/shares/${existing.cloudId}`, {
        permission,
      }, {
        showErrorToast: false,
      });

      const remote = response.data?.data || response.data;
      await db.toDoListShares.update(shareId, {
        permission: remote?.permission || permission,
        syncStatus: 'synced' as const,
      });
      return;
    } catch (backendError: any) {
      const isUnavailable =
        backendError?.status === 503 ||
        backendError?.status === 0 ||
        backendError?.code === 'DATABASE_UNAVAILABLE' ||
        backendError?.code === 'NETWORK_ERROR' ||
        backendError?.code === 'TIMEOUT_ERROR';

      if (!isUnavailable) throw backendError;

      console.warn('[updateToDoListShareWithBackendSync] Backend unavailable.');
      markOptionalBackendUnavailable();
      await db.toDoListShares.update(shareId, {
        permission,
        syncStatus: 'pending' as const,
      });
      queueRecordUpsertSync('to_do_list_shares', shareId);
      return;
    }
  }

  await db.toDoListShares.update(shareId, { permission });
  queueRecordUpsertSync('to_do_list_shares', shareId);
}

export async function deleteToDoListShareWithBackendSync(shareId: number) {
  initializeBackendSync();

  const existing = await db.toDoListShares.get(shareId);
  if (!existing) return;

  if (isBackendFirstSyncMode() && existing.cloudId) {
    try {
      await apiClient.delete(`/todos/shares/${existing.cloudId}`, {
        showErrorToast: false,
      });
    } catch (backendError: any) {
      console.warn('[deleteToDoListShareWithBackendSync] Backend unavailable/error:', backendError);
    }
  }

  await db.toDoListShares.delete(shareId);
  if (existing.cloudId) {
    queueRecordDeleteSync('to_do_list_shares', shareId, toNumber(existing.cloudId));
  }
}

