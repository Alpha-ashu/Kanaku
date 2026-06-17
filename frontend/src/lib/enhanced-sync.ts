import { db } from './database';
import { getDeviceInfo } from '../utils/device';
import { TokenManager } from './api';


export interface SyncEntity {
  entityType:
    | 'accounts'
    | 'transactions'
    | 'goals'
    | 'loans'
    | 'budgets'
    | 'investments'
    | 'recurringTransactions'
    | 'goldAssets'
    | 'friends';
  operation: 'create' | 'update' | 'delete';
  entityId: string;
  data?: any;
  timestamp: string;
}

export interface SyncResponse {
  success: boolean;
  data?: {
    accounts: any[];
    transactions: any[];
    goals: any[];
    loans: any[];
    budgets?: any[];
    investments?: any[];
    recurringTransactions?: any[];
    goldAssets?: any[];
    friends?: any[];
    settings?: any;
    lastSyncedAt: string;
    serverTimestamp?: string;
  };
  conflicts?: {
    entityType: string;
    entityId: string;
    localData: any;
    remoteData: any;
  }[];
  errors?: string[];
}

class EnhancedSyncService {
  private deviceId: string;
  private syncInProgress = false;
  private lastSyncAt: string | null = null;
  private syncQueue: SyncEntity[] = [];

  constructor() {
    try {
      const deviceInfo = getDeviceInfo();
      this.deviceId = deviceInfo.deviceId;
    } catch (error) {
      console.warn('Failed to get device info for sync service:', error);
      // Use fallback device ID
      this.deviceId = `sync_device_${Date.now()}`;
    }
  }

  /**
   * Initialize sync service and register device
   */
  async initialize(token: string, userId: string): Promise<void> {
    try {
      // Register device with backend
      await this.registerDevice(userId);

      // Load any pending sync operations from localStorage
      this.loadSyncQueue();

      console.log(' Enhanced sync service initialized');
    } catch (error) {
      console.error(' Failed to initialize sync service:', error);
    }
  }

  /**
   * Register current device with backend
   */
  private async registerDevice(userId: string): Promise<void> {
    try {
      const deviceInfo = getDeviceInfo();

      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/sync/register-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TokenManager.getAccessToken()}`,
        },
        body: JSON.stringify({
          ...deviceInfo,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to register device');
      }

      const result = await response.json();
      console.log(' Device registered:', result.device);
    } catch (error) {
      console.error(' Device registration failed:', error);
      throw error;
    }
  }

  /**
   * Pull data from backend (source of truth)
   */
  async pullFromBackend(userId: string): Promise<SyncResponse> {
    try {
      console.log(' Pulling data from backend...');

      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/sync/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TokenManager.getAccessToken()}`,
        },
        body: JSON.stringify({
          deviceId: this.deviceId,
          lastSyncedAt: this.lastSyncAt,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to pull data from backend');
      }

      const result: SyncResponse = await response.json();

      if (result.success && result.data) {
        await this.mergeRemoteData(result.data);
        this.lastSyncAt = result.data.lastSyncedAt;
        localStorage.setItem('last_sync', this.lastSyncAt);
      }

      console.log(' Pull completed:', result);
      return result;
    } catch (error) {
      console.error(' Pull failed:', error);
      throw error;
    }
  }

  /**
   * Push local changes to backend
   */
  async pushToBackend(userId: string): Promise<SyncResponse> {
    try {
      if (this.syncQueue.length === 0) {
        console.log(' No changes to push');
        return { success: true };
      }

      console.log(` Pushing ${this.syncQueue.length} changes to backend...`);

      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          deviceId: this.deviceId,
          entities: this.syncQueue,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to push data to backend');
      }

      const result: SyncResponse = await response.json();

      if (result.success) {
        // Clear sync queue on successful push
        this.syncQueue = [];
        this.saveSyncQueue();
        console.log(' Push completed successfully');
      } else {
        console.error(' Push completed with conflicts/errors:', result);
      }

      return result;
    } catch (error) {
      console.error(' Push failed:', error);
      throw error;
    }
  }

  /**
   * Full bidirectional sync
   */
  async fullSync(userId: string): Promise<SyncResponse> {
    if (this.syncInProgress) {
      console.log(' Sync already in progress');
      return { success: false, errors: ['Sync already in progress'] };
    }

    this.syncInProgress = true;

    try {
      // 1. Push local changes first
      const pushResult = await this.pushToBackend(userId);

      if (!pushResult.success && pushResult.errors?.length) {
        console.error(' Push failed, aborting pull');
        return pushResult;
      }

      // 2. Pull remote changes
      const pullResult = await this.pullFromBackend(userId);

      // 3. Handle conflicts if any
      if (pullResult.conflicts?.length) {
        await this.handleConflicts(pullResult.conflicts);
      }

      this.syncInProgress = false;
      return pullResult;
    } catch (error) {
      this.syncInProgress = false;
      console.error(' Full sync failed:', error);
      throw error;
    }
  }

  /**
   * Queue an entity for sync
   */
  queueEntitySync(entity: SyncEntity): void {
    // Remove any existing operation for the same entity
    this.syncQueue = this.syncQueue.filter(
      item => !(item.entityType === entity.entityType && item.entityId === entity.entityId)
    );

    // Add new operation to queue
    this.syncQueue.push(entity);
    this.saveSyncQueue();

    console.log(` Queued ${entity.operation} for ${entity.entityType}:${entity.entityId}`);
  }

  /**
   * Merge remote data into local database
   */
  private async mergeRemoteData(data: any): Promise<void> {
    try {
      console.log(' Merging remote data into local database...');

      // Note: We use bulkPut instead of clear() + bulkAdd() to preserve local records
      // that might be in the middle of a sync or have different local IDs.

      // Add/Update accounts
      if (data.accounts?.length) {
        await db.accounts.bulkPut(data.accounts.map((acc: any) => ({
          ...acc,
          createdAt: new Date(acc.createdAt),
          updatedAt: new Date(acc.updatedAt),
          deletedAt: acc.deletedAt ? new Date(acc.deletedAt) : null,
        })));
        console.log(` Synced ${data.accounts.length} accounts`);
      }

      // Add/Update transactions
      if (data.transactions?.length) {
        await db.transactions.bulkPut(data.transactions.map((txn: any) => ({
          ...txn,
          date: new Date(txn.date),
          createdAt: new Date(txn.createdAt),
          updatedAt: new Date(txn.updatedAt),
          deletedAt: txn.deletedAt ? new Date(txn.deletedAt) : null,
        })));
        console.log(` Synced ${data.transactions.length} transactions`);
      }

      // Add/Update goals
      if (data.goals?.length) {
        await db.goals.bulkPut(data.goals.map((goal: any) => ({
          ...goal,
          targetDate: new Date(goal.targetDate),
          createdAt: new Date(goal.createdAt),
          updatedAt: new Date(goal.updatedAt),
          deletedAt: goal.deletedAt ? new Date(goal.deletedAt) : null,
        })));
        console.log(` Synced ${data.goals.length} goals`);
      }

      // Add/Update loans
      if (data.loans?.length) {
        await db.loans.bulkPut(data.loans.map((loan: any) => ({
          ...loan,
          dueDate: loan.dueDate ? new Date(loan.dueDate) : null,
          createdAt: new Date(loan.createdAt),
          updatedAt: new Date(loan.updatedAt),
          deletedAt: loan.deletedAt ? new Date(loan.deletedAt) : null,
        })));
        console.log(` Synced ${data.loans.length} loans`);
      }

      // Add/Update budgets (string primary key = backend id, so put() upserts cleanly).
      // The cloudId-keyed tables (investments, recurringTransactions, friends) are
      // merged by backendSyncService's pull path, which uses the correct
      // cloudId/++id dedup pattern for those tables.
      if (data.budgets?.length) {
        await db.budgets.bulkPut(data.budgets.map((b: any) => ({
          id: String(b.id),
          category: b.category,
          amount: Number(b.amount ?? 0),
          period: b.period ?? 'monthly',
          spent: Number(b.spent ?? 0),
          createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
        })));
        console.log(` Synced ${data.budgets.length} budgets`);
      }

      // Store settings
      if (data.settings) {
        localStorage.setItem('user_settings', JSON.stringify(data.settings));
        console.log(' Loaded user settings');
      }

      console.log(' Remote data merged successfully');
    } catch (error) {
      console.error(' Failed to merge remote data:', error);
      throw error;
    }
  }

  /**
   * Handle sync conflicts
   */
  private async handleConflicts(conflicts: any[]): Promise<void> {
    console.log(' Handling conflicts:', conflicts);

    for (const conflict of conflicts) {
      // For now, use "latest timestamp wins" strategy
      const localTimestamp = new Date(conflict.localData.updatedAt);
      const remoteTimestamp = new Date(conflict.remoteData.updatedAt);

      if (remoteTimestamp > localTimestamp) {
        // Remote is newer, accept remote data
        console.log(` Accepting remote data for ${conflict.entityType}:${conflict.entityId}`);
        await this.acceptRemoteConflictResolution(conflict);
      } else {
        // Local is newer, push it again
        console.log(` Keeping local data for ${conflict.entityType}:${conflict.entityId}`);
        await this.acceptLocalConflictResolution(conflict);
      }
    }
  }

  /**
   * Accept remote conflict resolution
   */
  private async acceptRemoteConflictResolution(conflict: any): Promise<void> {
    // Update local database with remote data
    switch (conflict.entityType) {
      case 'accounts':
        await db.accounts.put(conflict.remoteData);
        break;
      case 'transactions':
        await db.transactions.put(conflict.remoteData);
        break;
      case 'goals':
        await db.goals.put(conflict.remoteData);
        break;
      case 'loans':
        await db.loans.put(conflict.remoteData);
        break;
    }
  }

  /**
   * Accept local conflict resolution
   */
  private async acceptLocalConflictResolution(conflict: any): Promise<void> {
    // Re-queue local data for pushing
    this.queueEntitySync({
      entityType: conflict.entityType,
      operation: 'update',
      entityId: conflict.entityId,
      data: conflict.localData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Save sync queue to localStorage
   */
  private saveSyncQueue(): void {
    localStorage.setItem('sync_queue', JSON.stringify(this.syncQueue));
  }

  /**
   * Load sync queue from localStorage
   */
  private loadSyncQueue(): void {
    const saved = localStorage.getItem('sync_queue');
    if (saved) {
      try {
        this.syncQueue = JSON.parse(saved);
        console.log(` Loaded ${this.syncQueue.length} pending sync operations`);
      } catch (error) {
        console.error(' Failed to load sync queue:', error);
        this.syncQueue = [];
      }
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    isInProgress: boolean;
    lastSyncAt: string | null;
    pendingOperations: number;
  } {
    return {
      isInProgress: this.syncInProgress,
      lastSyncAt: this.lastSyncAt,
      pendingOperations: this.syncQueue.length,
    };
  }

  /**
   * Clear all sync data
   */
  async clearAll(): Promise<void> {
    this.syncQueue = [];
    this.lastSyncAt = null;
    this.saveSyncQueue();
    localStorage.removeItem('last_sync');
    localStorage.removeItem('sync_queue');

    // Clear local database
    await db.accounts.clear();
    await db.transactions.clear();
    await db.goals.clear();
    await db.loans.clear();

    console.log(' All sync data cleared');
  }
}

export const enhancedSyncService = new EnhancedSyncService();
