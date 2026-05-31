/**
 * Device Sync Manager Service
 * Handles cross-device sync event management and polling
 * Integrates with Dexie for local-first database updates
 */

import axios, { AxiosInstance } from 'axios';
import { db } from '@/lib/database';
import { deviceManager } from '@/lib/device-manager';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

export interface SyncEvent {
  id: string;
  entityType: 'transaction' | 'account' | 'goal' | 'loan' | 'group' | string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  sourceDeviceId?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface SyncPollingConfig {
  enabled: boolean;
  interval: number; // milliseconds
  maxRetries: number;
  retryBackoffMs: number;
}

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string | null {
  try {
    const sbKey = Object.keys(localStorage).find(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
    );

    if (sbKey) {
      const sessionData = localStorage.getItem(sbKey);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        return session?.access_token || null;
      }
    }
  } catch (e) {
    console.warn('Failed to retrieve auth token:', e);
  }

  return null;
}

/**
 * Device Sync Manager
 */
export class DeviceSyncManager {
  private api: AxiosInstance;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private syncConfig: SyncPollingConfig = {
    enabled: true,
    interval: 30 * 1000, // 30 seconds default
    maxRetries: 3,
    retryBackoffMs: 1000,
  };

  private eventHandlers: Map<string, (event: SyncEvent) => void> = new Map();

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
    });

    // Add auth token to every request
    this.api.interceptors.request.use((config) => {
      const token = getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  /**
   * Configure sync polling behavior
   */
  setSyncConfig(config: Partial<SyncPollingConfig>): void {
    this.syncConfig = { ...this.syncConfig, ...config };
    console.log('Sync config updated:', this.syncConfig);
  }

  /**
   * Register event handler for specific sync event types
   */
  onSyncEvent(
    eventType: string,
    handler: (event: SyncEvent) => void
  ): () => void {
    const key = `${eventType}`;
    this.eventHandlers.set(key, handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.delete(key);
    };
  }

  /**
   * Emit sync event to registered handlers
   */
  private emitSyncEvent(event: SyncEvent): void {
    const key = `${event.entityType}:${event.action}`;
    const handler = this.eventHandlers.get(key);

    if (handler) {
      try {
        handler(event);
      } catch (err) {
        console.error('Sync event handler error:', err);
      }
    }

    // Also emit generic handler
    const genericHandler = this.eventHandlers.get('*');
    if (genericHandler) {
      try {
        genericHandler(event);
      } catch (err) {
        console.error('Generic sync event handler error:', err);
      }
    }
  }

  /**
   * Fetch pending syncs from backend
   */
  async fetchPendingSyncs(): Promise<SyncEvent[]> {
    try {
      const deviceId = deviceManager.getDeviceId();

      const response = await this.api.get<{
        success: boolean;
        data: SyncEvent[];
      }>(`/sync?deviceId=${deviceId}&limit=50`);

      if (response.data.success) {
        return response.data.data || [];
      }

      return [];
    } catch (error) {
      console.error('Failed to fetch pending syncs:', error);
      return [];
    }
  }

  /**
   * Apply sync event to local database
   */
  private async applySyncEvent(event: SyncEvent): Promise<void> {
    try {
      switch (event.entityType) {
        case 'transaction':
          await this.syncTransaction(event);
          break;

        case 'account':
          await this.syncAccount(event);
          break;

        case 'goal':
          await this.syncGoal(event);
          break;

        case 'group':
          await this.syncGroupExpense(event);
          break;

        default:
          console.warn('Unknown sync entity type:', event.entityType);
      }

      // Emit event for UI updates
      this.emitSyncEvent(event);

      // Mark sync as completed
      await this.markSyncCompleted(event.id);
    } catch (err) {
      console.error(`Failed to apply sync event for ${event.entityType}:`, err);
      throw err;
    }
  }

  /**
   * Sync transaction from another device
   */
  private async syncTransaction(event: SyncEvent): Promise<void> {
    try {
      // Fetch transaction details from backend
      const response = await this.api.get(`/transactions/${event.entityId}`);

      if (response.data?.success) {
        const transaction = response.data.data;

        // Update Dexie database
        if (event.action === 'delete') {
          await db.transactions.delete(parseInt(event.entityId));
        } else {
          await db.transactions.put({
            id: parseInt(event.entityId),
            ...transaction,
            syncedAt: new Date(),
          });
        }
      }
    } catch (err) {
      console.error('Transaction sync error:', err);
      throw err;
    }
  }

  /**
   * Sync account from another device
   */
  private async syncAccount(event: SyncEvent): Promise<void> {
    try {
      const response = await this.api.get(`/accounts/${event.entityId}`);

      if (response.data?.success) {
        const account = response.data.data;

        if (event.action === 'delete') {
          await db.accounts.delete(parseInt(event.entityId));
        } else {
          await db.accounts.put({
            id: parseInt(event.entityId),
            ...account,
            syncedAt: new Date(),
          });
        }
      }
    } catch (err) {
      console.error('Account sync error:', err);
      throw err;
    }
  }

  /**
   * Sync goal from another device
   */
  private async syncGoal(event: SyncEvent): Promise<void> {
    try {
      const response = await this.api.get(`/goals/${event.entityId}`);

      if (response.data?.success) {
        const goal = response.data.data;

        if (event.action === 'delete') {
          await db.goals.delete(parseInt(event.entityId));
        } else {
          await db.goals.put({
            id: parseInt(event.entityId),
            ...goal,
            syncedAt: new Date(),
          });
        }
      }
    } catch (err) {
      console.error('Goal sync error:', err);
      throw err;
    }
  }

  /**
   * Sync group expense from another device
   */
  private async syncGroupExpense(event: SyncEvent): Promise<void> {
    try {
      const response = await this.api.get(`/groups/${event.entityId}`);

      if (response.data?.success) {
        const group = response.data.data;

        if (event.action === 'delete') {
          await db.groupExpenses.delete(parseInt(event.entityId));
        } else {
          await db.groupExpenses.put({
            id: parseInt(event.entityId),
            ...group,
            syncedAt: new Date(),
          });
        }
      }
    } catch (err) {
      console.error('Group sync error:', err);
      throw err;
    }
  }

  /**
   * Mark sync event as completed
   */
  private async markSyncCompleted(syncId: string): Promise<void> {
    try {
      await this.api.patch(`/sync/${syncId}`, { status: 'completed' });
    } catch (err) {
      console.warn('Failed to mark sync as completed:', err);
    }
  }

  /**
   * Poll for pending syncs from other devices
   */
  async pollForSyncs(): Promise<void> {
    if (!this.syncConfig.enabled || this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const pendingSyncs = await this.fetchPendingSyncs();

      // Process each pending sync
      for (const sync of pendingSyncs) {
        try {
          await this.applySyncEvent(sync);
        } catch (err) {
          console.error(`Failed to process sync ${sync.id}:`, err);
        }
      }

      if (pendingSyncs.length > 0) {
        console.log(`Synced ${pendingSyncs.length} events from other devices`);
      }
    } catch (err) {
      console.error('Sync polling error:', err);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Start background sync polling
   */
  startPolling(): void {
    if (!this.syncConfig.enabled) {
      console.warn('Sync polling is disabled');
      return;
    }

    if (this.pollingInterval) {
      console.warn('Polling already started');
      return;
    }

    console.log(
      `Starting sync polling every ${this.syncConfig.interval}ms`
    );

    // Poll immediately on start
    this.pollForSyncs().catch((err) => {
      console.error('Initial sync poll failed:', err);
    });

    // Then poll at regular intervals
    this.pollingInterval = setInterval(() => {
      this.pollForSyncs().catch((err) => {
        console.error('Sync poll interval error:', err);
      });
    }, this.syncConfig.interval);
  }

  /**
   * Stop background sync polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('Sync polling stopped');
    }
  }

  /**
   * Check if polling is active
   */
  isPollingActive(): boolean {
    return this.pollingInterval !== null;
  }

  /**
   * Manually trigger sync
   */
  async syncNow(): Promise<void> {
    console.log('Manual sync triggered');
    await this.pollForSyncs();
  }

  /**
   * Broadcast sync event (when user performs action on current device)
   */
  async broadcastSyncEvent(
    entityType: string,
    entityId: string,
    action: 'create' | 'update' | 'delete'
  ): Promise<void> {
    try {
      const deviceId = deviceManager.getDeviceId();

      await this.api.post('/sync/broadcast', {
        entityType,
        entityId,
        action,
        sourceDeviceId: deviceId,
      });

      console.log(`Broadcast sync event: ${action} ${entityType} ${entityId}`);
    } catch (err) {
      console.error('Failed to broadcast sync event:', err);
    }
  }
}

// Export singleton instance
export const deviceSyncManager = new DeviceSyncManager();
