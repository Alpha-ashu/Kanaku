/**
 * Offline-First Sync Engine
 *
 * Architecture:
 *  1. Every CRUD mutation writes to IndexedDB immediately (offline-safe).
 *  2. A SyncQueueItem is appended to the `syncQueue` Dexie table.
 *  3. When online, the engine drains the queue  pushes to Supabase.
 *  4. A periodic pull fetches cloud changes and merges via "last-write-wins".
 *  5. Conflict resolution: highest `version` (or latest `updatedAt`) wins.
 *
 * Syncable tables:
 *   accounts, transactions, goals, loans, investments,
 *   groupExpenses, friends, toDoLists, toDoItems
 */

import { db, SyncQueueItem, SyncEventLog } from './database';
import supabase from '@/utils/supabase/client';
import { useState, useEffect, useCallback } from 'react';
import { TokenManager } from './api';

// NOTE: Offline-first sync expects Supabase tables to include `local_id` columns.
// Our current schema does not include those fields, so running this engine
// causes duplicate rows via conflicting sync strategies. Keep it disabled
// unless the backend schema is upgraded to match.
const OFFLINE_SYNC_ENABLED = import.meta.env.VITE_ENABLE_OFFLINE_SYNC === 'true';

//  Public types 

export type OverallSyncStatus = 'idle' | 'offline' | 'syncing' | 'synced' | 'error';

export interface SyncStats {
  pendingCount: number;
  lastSyncedAt: Date | null;
  status: OverallSyncStatus;
  errorMessage?: string;
}

//  Constants 

const SYNC_INTERVAL_MS   = 30_000;  // periodic pull every 30 s
const MAX_RETRIES        = 3;
const RETRY_DELAY_MS     = 5_000;
const BATCH_SIZE         = 50;

// Maps local Dexie table name  Supabase table name
const TABLE_MAP: Record<string, string> = {
  accounts:      'accounts',
  transactions:  'transactions',
  goals:         'goals',
  loans:         'loans',
  investments:   'investments',
  groupExpenses: 'group_expenses',
  friends:       'friends',
  toDoLists:     'todo_lists',
  toDoItems:     'todo_items',
};

//  Field transformers (local camelCase  cloud snake_case) 

function toCloud(table: string, local: Record<string, any>, userId: string): Record<string, any> {
  const now = new Date().toISOString();
  const base = {
    user_id:    userId,
    local_id:   local.id,
    updated_at: local.updatedAt ? (local.updatedAt instanceof Date ? local.updatedAt.toISOString() : local.updatedAt) : now,
    created_at: local.createdAt ? (local.createdAt instanceof Date ? local.createdAt.toISOString() : local.createdAt) : now,
  };

  switch (table) {
    case 'accounts':
      return {
        ...base,
        name:          local.name,
        type:          local.type,
        balance:       local.balance,
        currency:      local.currency,
        is_active:     local.isActive,
      };

    case 'transactions':
      return {
        ...base,
        account_id:              String(local.accountId),
        type:                    local.type,
        amount:                  local.amount,
        category:                local.category,
        subcategory:             local.subcategory ?? null,
        description:             local.description,
        merchant:                local.merchant ?? null,
        date:                    local.date instanceof Date ? local.date.toISOString() : local.date,
        tags:                    local.tags ?? null,
        transfer_to_account_id:  local.transferToAccountId ? String(local.transferToAccountId) : null,
        transfer_type:           local.transferType ?? null,
      };

    case 'goals':
      return {
        ...base,
        name:           local.name,
        target_amount:  local.targetAmount,
        current_amount: local.currentAmount,
        target_date:    local.targetDate instanceof Date ? local.targetDate.toISOString() : local.targetDate,
        category:       local.category,
        is_group_goal:  local.isGroupGoal,
      };

    case 'loans':
      return {
        ...base,
        type:                local.type,
        name:                local.name,
        principal_amount:    local.principalAmount,
        outstanding_balance: local.outstandingBalance,
        interest_rate:       local.interestRate ?? null,
        emi_amount:          local.emiAmount ?? null,
        due_date:            local.dueDate instanceof Date ? local.dueDate.toISOString() : (local.dueDate ?? null),
        frequency:           local.frequency ?? null,
        status:              local.status,
        contact_person:      local.contactPerson ?? null,
      };

    case 'investments':
      return {
        ...base,
        asset_type:      local.assetType,
        asset_name:      local.assetName,
        quantity:        local.quantity,
        buy_price:       local.buyPrice,
        current_price:   local.currentPrice,
        total_invested:  local.totalInvested,
        current_value:   local.currentValue,
        profit_loss:     local.profitLoss,
        purchase_date:   local.purchaseDate instanceof Date ? local.purchaseDate.toISOString() : local.purchaseDate,
        last_updated:    local.lastUpdated instanceof Date ? local.lastUpdated.toISOString() : (local.lastUpdated ?? now),
      };

    case 'groupExpenses':
    case 'group_expenses':
      return {
        ...base,
        name:         local.name,
        total_amount: local.totalAmount,
        paid_by:      String(local.paidBy),
        date:         local.date instanceof Date ? local.date.toISOString() : local.date,
        members:      JSON.stringify(local.members ?? []),
        items:        JSON.stringify(local.items ?? []),
      };

    case 'friends':
      return {
        ...base,
        name:   local.name,
        email:  local.email ?? null,
        phone:  local.phone ?? null,
      };

    case 'toDoLists':
    case 'todo_lists':
      return {
        owner_id:    userId,
        local_id:    local.id,
        name:        local.name,
        description: local.description ?? null,
        archived:    local.archived ?? false,
        updated_at:  base.updated_at,
        created_at:  base.created_at,
      };

    case 'toDoItems':
    case 'todo_items':
      return {
        user_id:      userId,
        local_id:     local.id,
        list_id:      String(local.listId),
        title:        local.title,
        description:  local.description ?? null,
        completed:    local.completed ?? false,
        priority:     local.priority ?? 'medium',
        due_date:     local.dueDate instanceof Date ? local.dueDate.toISOString() : (local.dueDate ?? null),
        updated_at:   base.updated_at,
        created_at:   base.created_at,
      };

    default:
      return { ...local, ...base };
  }
}

// Maps cloud record back to local format
function toLocal(table: string, cloud: Record<string, any>): Record<string, any> {
  const base = {
    cloudId:   cloud.id,
    updatedAt: cloud.updated_at ? new Date(cloud.updated_at) : new Date(),
    createdAt: cloud.created_at ? new Date(cloud.created_at) : new Date(),
    syncStatus: 'synced' as const,
  };

  switch (table) {
    case 'accounts':
      return {
        ...base,
        name:     cloud.name,
        type:     cloud.type,
        balance:  Number(cloud.balance),
        currency: cloud.currency,
        isActive: cloud.is_active,
      };

    case 'transactions':
      return {
        ...base,
        type:        cloud.type,
        amount:      Number(cloud.amount),
        accountId:   Number(cloud.account_id),
        category:    cloud.category,
        subcategory: cloud.subcategory ?? undefined,
        description: cloud.description,
        merchant:    cloud.merchant ?? undefined,
        date:        new Date(cloud.date),
        tags:        cloud.tags ?? undefined,
        transferToAccountId: cloud.transfer_to_account_id ? Number(cloud.transfer_to_account_id) : undefined,
        transferType: cloud.transfer_type ?? undefined,
      };

    case 'goals':
      return {
        ...base,
        name:          cloud.name,
        targetAmount:  Number(cloud.target_amount),
        currentAmount: Number(cloud.current_amount),
        targetDate:    new Date(cloud.target_date),
        category:      cloud.category,
        isGroupGoal:   cloud.is_group_goal ?? false,
      };

    case 'loans':
      return {
        ...base,
        type:               cloud.type,
        name:               cloud.name,
        principalAmount:    Number(cloud.principal_amount),
        outstandingBalance: Number(cloud.outstanding_balance),
        interestRate:       cloud.interest_rate != null ? Number(cloud.interest_rate) : undefined,
        emiAmount:          cloud.emi_amount != null ? Number(cloud.emi_amount) : undefined,
        dueDate:            cloud.due_date ? new Date(cloud.due_date) : undefined,
        frequency:          cloud.frequency ?? undefined,
        status:             cloud.status,
        contactPerson:      cloud.contact_person ?? undefined,
      };

    case 'investments':
      return {
        ...base,
        assetType:     cloud.asset_type,
        assetName:     cloud.asset_name,
        quantity:      Number(cloud.quantity),
        buyPrice:      Number(cloud.buy_price),
        currentPrice:  Number(cloud.current_price),
        totalInvested: Number(cloud.total_invested),
        currentValue:  Number(cloud.current_value),
        profitLoss:    Number(cloud.profit_loss),
        purchaseDate:  new Date(cloud.purchase_date),
        lastUpdated:   new Date(cloud.last_updated),
      };

    case 'groupExpenses':
    case 'group_expenses':
      return {
        ...base,
        name:        cloud.name,
        totalAmount: Number(cloud.total_amount),
        paidBy:      Number(cloud.paid_by),
        date:        new Date(cloud.date),
        members:     typeof cloud.members === 'string' ? JSON.parse(cloud.members) : (cloud.members ?? []),
        items:       typeof cloud.items   === 'string' ? JSON.parse(cloud.items)   : (cloud.items ?? []),
      };

    case 'friends':
      return {
        ...base,
        name:  cloud.name,
        email: cloud.email ?? undefined,
        phone: cloud.phone ?? undefined,
      };

    case 'toDoLists':
    case 'todo_lists':
      return {
        ...base,
        name:        cloud.name,
        description: cloud.description ?? undefined,
        ownerId:     cloud.owner_id,
        archived:    cloud.archived ?? false,
      };

    case 'toDoItems':
    case 'todo_items':
      return {
        ...base,
        listId:      Number(cloud.list_id),
        title:       cloud.title,
        description: cloud.description ?? undefined,
        completed:   cloud.completed ?? false,
        priority:    cloud.priority ?? 'medium',
        dueDate:     cloud.due_date ? new Date(cloud.due_date) : undefined,
        createdBy:   cloud.user_id,
      };

    default:
      return { ...cloud, ...base };
  }
}

// Returns the Dexie table for a local table name
function getDexieTable(table: string): any {
  const map: Record<string, any> = {
    accounts:      db.accounts,
    transactions:  db.transactions,
    goals:         db.goals,
    loans:         db.loans,
    investments:   db.investments,
    groupExpenses: db.groupExpenses,
    friends:       db.friends,
    toDoLists:     db.toDoLists,
    toDoItems:     db.toDoItems,
  };
  return map[table] ?? null;
}

//  Sync Engine Class 

class OfflineSyncEngine {
  private isOnline   = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing  = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners  = new Set<(stats: SyncStats) => void>();
  private lastSyncedAt: Date | null = null;
  private lastError: string | undefined;
  private pendingCount = 0;
  // Circuit breaker with exponential backoff - persisted to localStorage.
  // 4xx (schema broken): base 1 h, doubles to 24 h cap after ~5 failures  silent.
  // 5xx (transient):     base 5 min, doubles to 24 h cap.
  private readonly COOLDOWN_STORAGE_KEY = 'sync_table_cooldowns';
  private readonly COOLDOWN_MAX_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    if (!OFFLINE_SYNC_ENABLED || typeof window === 'undefined') return;
    window.addEventListener('online',  this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  /** Raw entry stored per table: retry timestamp + consecutive fail count. */
  private loadCooldowns(): Map<string, { until: number; count: number }> {
    try {
      const raw = localStorage.getItem(this.COOLDOWN_STORAGE_KEY);
      if (!raw) return new Map();
      return new Map(
        Object.entries(
          JSON.parse(raw) as Record<string, { until: number; count: number }>
        )
      );
    } catch {
      return new Map();
    }
  }

  private saveCooldowns(map: Map<string, { until: number; count: number }>): void {
    try {
      const obj: Record<string, { until: number; count: number }> = {};
      map.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(this.COOLDOWN_STORAGE_KEY, JSON.stringify(obj));
    } catch { /* quota exceeded - ignore */ }
  }

  private isTableOnCooldown(cloudTable: string): boolean {
    const entry = this.loadCooldowns().get(cloudTable);
    return !!entry && Date.now() < entry.until;
  }

  /**
   * Record a failure for `cloudTable` and apply exponential backoff.
   * @param httpStatus  HTTP status code from Supabase (400, 500, etc.)
   *   4xx  base 1 hour  (schema / table missing - won't self-heal)
   *   5xx  base 5 min   (transient server error)
   * Each consecutive failure doubles the delay, capped at 24 h.
   */
  private setTableCooldown(cloudTable: string, httpStatus = 400): void {
    const cooldowns = this.loadCooldowns();
    const prev = cooldowns.get(cloudTable);
    const count = (prev?.count ?? 0) + 1;
    const baseMs = httpStatus >= 400 && httpStatus < 500
      ? 60 * 60 * 1000          // 4xx: 1 hour base
      : 5 * 60 * 1000;          // 5xx: 5 minute base
    const delay = Math.min(baseMs * Math.pow(2, count - 1), this.COOLDOWN_MAX_MS);
    cooldowns.set(cloudTable, { until: Date.now() + delay, count });
    this.saveCooldowns(cooldowns);
  }

  private clearTableCooldown(cloudTable: string): void {
    const cooldowns = this.loadCooldowns();
    if (cooldowns.has(cloudTable)) {
      cooldowns.delete(cloudTable);
      this.saveCooldowns(cooldowns);
    }
  }

  //  Lifecycle 

  start() {
    if (!OFFLINE_SYNC_ENABLED) return;
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      if (this.isOnline && !this.isSyncing) this.sync();
    }, SYNC_INTERVAL_MS);
  }

  stop() {
    if (!OFFLINE_SYNC_ENABLED) return;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  destroy() {
    if (!OFFLINE_SYNC_ENABLED) return;
    this.stop();
    if (typeof window === 'undefined') return;
    window.removeEventListener('online',  this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  //  Event listeners 

  subscribe(cb: (stats: SyncStats) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    const stats = this.getStats();
    this.listeners.forEach(cb => cb(stats));
  }

  //  Network handlers 

  private handleOnline = () => {
    this.isOnline = true;
    this.notify();
    this.sync();
  };

  private handleOffline = () => {
    this.isOnline = false;
    this.notify();
  };

  private handleVisibility = () => {
    if (document.visibilityState === 'visible' && this.isOnline) {
      this.sync();
    }
  };

  //  Queue management 

  /**
   * Enqueue a mutation for sync.  Called by callers after writing to local DB.
   */
  async enqueue(
    userId: string,
    table: string,
    operation: 'create' | 'update' | 'delete',
    localId: number,
    payload: Record<string, any>,
    cloudId?: string,
    version = 1,
  ): Promise<void> {
    if (!OFFLINE_SYNC_ENABLED) return;
    // Skip tables we don't sync to the cloud
    if (!TABLE_MAP[table]) return;

    // Deduplicate: if a pending item exists for the same record, update it
    const existing = await db.syncQueue
      .where('userId').equals(userId)
      .filter(item => item.status === 'pending' && item.table === table && item.localId === localId)
      .first()
      .catch(() => undefined);

    if (existing?.id) {
      await db.syncQueue.update(existing.id, {
        operation,
        payload:    JSON.stringify(payload),
        cloudId:    cloudId ?? existing.cloudId,
        version:    Math.max(version, existing.version),
        retries:    0,
        status:     'pending',
      });
    } else {
      await db.syncQueue.add({
        userId,
        table,
        operation,
        localId,
        cloudId,
        payload:   JSON.stringify(payload),
        createdAt: new Date(),
        retries:   0,
        status:    'pending',
        version,
      });
    }

    await this.updatePendingCount(userId);
    this.notify();

    // Attempt immediate sync if online
    if (this.isOnline && !this.isSyncing) {
      this.sync();
    }
  }

  //  Main sync cycle 

  async sync(): Promise<void> {
    if (!OFFLINE_SYNC_ENABLED) return;
    if (this.isSyncing || !this.isOnline) return;

    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
      }
    } catch {
      // ignore
    }

    if (!userId) {
      const customToken = TokenManager.getAccessToken();
      if (customToken) {
        try {
          const parts = customToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            userId = payload.userId || payload.sub;
          }
        } catch {
          // ignore
        }
      }
    }

    if (!userId) return;

    this.isSyncing = true;
    this.notify();

    const startTime = Date.now();

    try {
      // 1. Push local changes
      const pushed = await this.processPushQueue(userId);

      // 2. Pull cloud changes
      const pulled = await this.pullFromCloud(userId);

      this.lastSyncedAt = new Date();
      this.lastError    = undefined;
      localStorage.setItem('last_sync_at', this.lastSyncedAt.toISOString());

      await this.updatePendingCount(userId);
      await this.logEvent(userId, 'sync_success', undefined, pushed + pulled, undefined, Date.now() - startTime);
    } catch (err: any) {
      this.lastError = err?.message ?? 'Unknown sync error';
      await this.logEvent(userId, 'sync_failure', undefined, 0, this.lastError);
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  //  Push queue  cloud 

  private async processPushQueue(userId: string): Promise<number> {
    const items = await db.syncQueue
      .where('userId').equals(userId)
      .filter(item => item.status === 'pending')
      .limit(BATCH_SIZE)
      .toArray()
      .catch(() => [] as SyncQueueItem[]);

    if (items.length === 0) return 0;

    let processed = 0;

    for (const item of items) {
      if (item.id == null) continue;
      try {
        await db.syncQueue.update(item.id, { status: 'processing' });
        await this.pushItem(userId, item);
        await db.syncQueue.update(item.id, { status: 'succeeded' });
        processed++;
      } catch (err: any) {
        const retries = item.retries + 1;
        if (retries >= MAX_RETRIES) {
          await db.syncQueue.update(item.id, { status: 'failed', errorMessage: err?.message, retries });
        } else {
          await db.syncQueue.update(item.id, { status: 'pending', retries, errorMessage: err?.message });
          // Exponential back-off (non-blocking)
          setTimeout(() => this.sync(), RETRY_DELAY_MS * retries);
        }
      }
    }

    return processed;
  }

  private async pushItem(userId: string, item: SyncQueueItem): Promise<void> {
    const cloudTable = TABLE_MAP[item.table];
    if (!cloudTable) return;

    const localRecord = JSON.parse(item.payload);
    const cloudRecord = toCloud(item.table, localRecord, userId);

    if (item.operation === 'delete') {
      if (item.cloudId) {
        const { error } = await supabase.from(cloudTable).delete().eq('id', item.cloudId);
        if (error) throw new Error(error.message);
      }
      return;
    }

    if (item.operation === 'create' || !item.cloudId) {
      // Upsert (handles create + idempotent retries)
      const { data, error } = await supabase.from(cloudTable).upsert(cloudRecord, { onConflict: 'local_id,user_id' }).select('id').single();
      if (error) throw new Error(error.message);
      if (data?.id) {
        // Store the cloud UUID back on the local record
        const dexieTable = getDexieTable(item.table);
        if (dexieTable && item.localId) {
          await dexieTable.update(item.localId, { cloudId: data.id, syncStatus: 'synced' });
        }
      }
    } else {
      // Update existing cloud record
      const { error } = await supabase.from(cloudTable).update(cloudRecord).eq('id', item.cloudId).eq('user_id', userId);
      if (error) throw new Error(error.message);

      const dexieTable = getDexieTable(item.table);
      if (dexieTable && item.localId) {
        await dexieTable.update(item.localId, { syncStatus: 'synced' });
      }
    }
  }

  //  Pull cloud  local 

  private async pullFromCloud(userId: string): Promise<number> {
    const rawLastSync = localStorage.getItem('last_sync_at');
    const lastSync    = rawLastSync ? new Date(rawLastSync) : null;

    let total = 0;

    for (const [localTable, cloudTable] of Object.entries(TABLE_MAP)) {
      // Circuit breaker: skip tables that recently failed with a 4xx/5xx error
      if (this.isTableOnCooldown(cloudTable)) continue;

      try {
        const dexieTable = getDexieTable(localTable);
        if (!dexieTable) continue;

        let query = supabase.from(cloudTable).select('*');

        // Pull by user_id (owner_id for todo_lists)
        if (localTable === 'toDoLists') {
          query = (query as any).eq('owner_id', userId);
        } else {
          query = (query as any).eq('user_id', userId);
        }

        // Only fetch records changed since last sync (delta pull)
        if (lastSync) {
          query = (query as any).gt('updated_at', lastSync.toISOString());
        }

        const { data, error, status } = await query;
        if (error) {
          // Exponential backoff: 4xx (bad schema) starts at 1 h, 5xx starts at 5 min
          this.setTableCooldown(cloudTable, status ?? 400);
          continue;
        }

        // Successful response - clear any previous cooldown
        this.clearTableCooldown(cloudTable);
        if (!data?.length) continue;

        for (const cloudRecord of data) {
          await this.mergeRecord(localTable, cloudRecord);
          total++;
        }
      } catch (err) {
        // Unexpected local error - don't suppress, but don't crash the whole pull
        console.error(`[SyncEngine] pull failed for ${localTable}:`, err);
      }
    }

    return total;
  }

  private async mergeRecord(localTable: string, cloudRecord: Record<string, any>): Promise<void> {
    const dexieTable = getDexieTable(localTable);
    if (!dexieTable) return;

    const cloudId = cloudRecord.id as string;
    const cloudTs = new Date(cloudRecord.updated_at ?? 0).getTime();

    // Try match by cloudId first - use .filter() so no index is required
    let existing: any = cloudId
      ? await dexieTable.filter((r: any) => r.cloudId === cloudId).first().catch(() => undefined)
      : undefined;

    // Fallback: match by localId
    if (!existing && cloudRecord.local_id != null) {
      existing = await dexieTable.get(cloudRecord.local_id).catch(() => undefined);
    }

    const localRecord = toLocal(localTable, cloudRecord);

    if (!existing) {
      // New record from cloud - insert
      await dexieTable.add(localRecord);
    } else {
      const localTs = new Date(existing.updatedAt ?? 0).getTime();
      // Last-write-wins: only overwrite if cloud is newer
      if (cloudTs >= localTs) {
        await dexieTable.update(existing.id, localRecord);
      }
      // If local is newer it has already been (or will be) pushed
    }
  }

  //  Utilities 

  private async updatePendingCount(userId: string): Promise<void> {
    this.pendingCount = await db.syncQueue
      .where('userId').equals(userId)
      .filter(item => item.status === 'pending')
      .count()
      .catch(() => 0);
  }

  private async logEvent(
    userId: string,
    eventType: SyncEventLog['eventType'],
    affectedTable?: string,
    recordsProcessed = 0,
    errorMessage?: string,
    durationMs?: number,
  ): Promise<void> {
    try {
      await db.syncEventLogs.add({
        userId,
        eventType,
        affectedTable,
        recordsProcessed,
        errorMessage,
        timestamp: new Date(),
        durationMs,
      });

      // Keep only last 500 log entries
      const count = await db.syncEventLogs.count();
      if (count > 500) {
        const oldest = await db.syncEventLogs.orderBy('timestamp').limit(count - 500).primaryKeys();
        await db.syncEventLogs.bulkDelete(oldest as number[]);
      }
    } catch {
      // Logging errors must not throw
    }
  }

  getStats(): SyncStats {
    if (!OFFLINE_SYNC_ENABLED) {
      return {
        pendingCount: 0,
        lastSyncedAt: null,
        status: 'idle',
        errorMessage: 'Offline sync disabled (schema incompatible).',
      };
    }
    if (!this.isOnline) return { pendingCount: this.pendingCount, lastSyncedAt: this.lastSyncedAt, status: 'offline' };
    if (this.isSyncing)  return { pendingCount: this.pendingCount, lastSyncedAt: this.lastSyncedAt, status: 'syncing' };
    if (this.lastError)  return { pendingCount: this.pendingCount, lastSyncedAt: this.lastSyncedAt, status: 'error', errorMessage: this.lastError };
    if (this.pendingCount > 0) return { pendingCount: this.pendingCount, lastSyncedAt: this.lastSyncedAt, status: 'syncing' };
    return { pendingCount: 0, lastSyncedAt: this.lastSyncedAt, status: 'synced' };
  }

  isNetworkOnline(): boolean { return this.isOnline; }

  //  Admin: fetch sync logs 

  async getSyncLogs(userId: string, limit = 100): Promise<SyncEventLog[]> {
    return db.syncEventLogs
      .where('userId').equals(userId)
      .reverse()
      .limit(limit)
      .toArray()
      .catch(() => []);
  }

  async getFailedQueueItems(userId: string): Promise<SyncQueueItem[]> {
    return db.syncQueue
      .where('userId').equals(userId)
      .filter(item => item.status === 'failed')
      .toArray()
      .catch(() => []);
  }

  async retryFailed(userId: string): Promise<void> {
    if (!OFFLINE_SYNC_ENABLED) return;
    const failed = await this.getFailedQueueItems(userId);
    for (const item of failed) {
      if (item.id != null) {
        await db.syncQueue.update(item.id, { status: 'pending', retries: 0, errorMessage: undefined });
      }
    }
    await this.updatePendingCount(userId);
    this.notify();
    if (this.isOnline) this.sync();
  }

  /** Force a full resync by clearing local data and pulling everything from cloud */
  async forceFullResync(userId: string): Promise<void> {
    if (!OFFLINE_SYNC_ENABLED) return;
    localStorage.removeItem('last_sync_at');
    await this.sync();
  }
}

//  Singleton export 

export const offlineSyncEngine = new OfflineSyncEngine();

//  React hook 

export function useSyncStats(): SyncStats {
  const [stats, setStats] = useState<SyncStats>(offlineSyncEngine.getStats());

  useEffect(() => {
    const unsub = offlineSyncEngine.subscribe(setStats);
    return unsub;
  }, []);

  return stats;
}

//  Helper: wrap a local DB write to also enqueue for sync 

export async function withSync<T>(
  userId: string,
  table: string,
  operation: 'create' | 'update' | 'delete',
  dbWrite: () => Promise<T>,
  resolveId: (result: T) => number,
  resolvePayload: (result: T) => Record<string, any>,
  cloudId?: string,
): Promise<T> {
  const result = await dbWrite();
  const localId = resolveId(result);
  const payload = resolvePayload(result);

  await offlineSyncEngine.enqueue(userId, table, operation, localId, payload, cloudId, (payload as any).version ?? 1);

  return result;
}

//  useOfflineSync hook 
/**
 * Convenience hook for page components that need to enqueue sync operations.
 *
 * Usage:
 *   const { enqueueMutation } = useOfflineSync(userId);
 *   await enqueueMutation('transactions', 'create', newId, payload);
 */
export function useOfflineSync(userId: string | undefined) {
  const enqueueMutation = useCallback(
    async (
      table: string,
      operation: 'create' | 'update' | 'delete',
      localId: number,
      payload: Record<string, any>,
      cloudId?: string,
    ) => {
      if (!userId) return;
      await offlineSyncEngine.enqueue(
        userId, table, operation, localId, payload, cloudId, (payload.version as number) ?? 1,
      );
    },
    [userId],
  );

  const triggerSync = useCallback(() => {
    offlineSyncEngine.sync();
  }, []);

  return { enqueueMutation, triggerSync };
}
