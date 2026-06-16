/**
 * Backend-First Sync Service
 * 
 * This service prioritizes backend sync over frontend operations to:
 * - Prevent UI refreshes on tab switching
 * - Maintain stable app state
 * - Reduce frontend processing load
 * - Improve overall performance
 */

import { db } from './database';
import { buildApiUrl, getConfiguredApiBase, shouldSkipOptionalBackendRequests } from './apiBase';
import supabase from '@/utils/supabase/client';
import { toast } from 'sonner';
import { TokenManager } from './api';
import { backendService } from './backend-api';

export interface BackendSyncStatus {
  isOnline: boolean;
  lastBackendSync: Date | null;
  pendingOperations: number;
  syncInProgress: boolean;
}

class BackendSyncService {
  private static instance: BackendSyncService;
  private readonly apiBase = getConfiguredApiBase();
  private syncInProgress: boolean = false;
  private lastSyncTime: Date | null = null;
  private pendingOperations: Set<string> = new Set();
  private syncInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupNetworkListeners();
    this.startPeriodicBackendSync();
  }

  static getInstance(): BackendSyncService {
    if (!BackendSyncService.instance) {
      BackendSyncService.instance = new BackendSyncService();
    }
    return BackendSyncService.instance;
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.info('[BackendSync] Back online  initiating backend sync.');
      this.syncWithBackend();
    });

    window.addEventListener('offline', () => {
      console.info('[BackendSync] Offline  backend sync paused.');
    });
  }

  // Start periodic backend sync (less frequent than frontend)
  private startPeriodicBackendSync() {
    if (this.syncInterval) return;
    
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && this.pendingOperations.size > 0) {
        this.syncWithBackend();
      }
    }, 60000); // 1 minute intervals instead of 30 seconds
  }

  // Add operation to pending queue
  addPendingOperation(operationId: string): void {
    this.pendingOperations.add(operationId);
    console.info(`[BackendSync] Pending operation queued: ${operationId}`);

    setTimeout(() => {
      if (this.pendingOperations.size > 0) {
        this.syncWithBackend();
      }
    }, 2000);
  }

  // Remove operation from pending queue
  removePendingOperation(operationId: string): void {
    this.pendingOperations.delete(operationId);
  }

  // Main backend sync method
  async syncWithBackend(): Promise<boolean> {
    if (this.syncInProgress || !navigator.onLine) {
      return false;
    }

    if (shouldSkipOptionalBackendRequests(this.apiBase)) {
      console.info(' Backend sync skipped while backend is unavailable in development mode.');
      return false;
    }

    this.syncInProgress = true;
    console.info('[BackendSync] Starting backend sync...');

    try {
      // Get user authentication
      let accessToken = TokenManager.getAccessToken();
      let userObj: any = null;

      if (accessToken) {
        try {
          const parts = accessToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            userObj = { id: payload.userId || payload.sub, email: payload.email };
          }
        } catch (e) {
          // ignore
        }
      }

      if (!userObj) {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (user && !authError) {
            userObj = user;
            const session = await supabase.auth.getSession();
            accessToken = session.data.session?.access_token || null;
          }
        } catch (e) {
          // ignore
        }
      }

      if (!userObj || !accessToken) {
        console.warn(' Backend sync failed: User not authenticated');
        return false;
      }

      const response = await fetch(buildApiUrl(this.apiBase, '/sync/pull'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          deviceId: this.getDeviceId(),
          lastSyncedAt: this.lastSyncTime?.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend sync failed: ${response.statusText}`);
      }

      const syncData = await response.json();

      // Process backend response
      await this.processBackendSyncData(syncData.data);

      // Self-heal: retry any friends that never got a cloudId because their
      // original creation silently fell back to local-only storage (e.g. the
      // backend was briefly unreachable). Best-effort — never blocks/fails
      // the main sync.
      backendService.retrySyncAllPendingFriends().catch(() => {});

      this.lastSyncTime = new Date();
      this.pendingOperations.clear();

      console.info('[BackendSync] Sync completed successfully.');
      return true;

    } catch (error) {
      console.error('[BackendSync] Sync error:', error);
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  // Process data received from backend
  private async processBackendSyncData(data: any): Promise<void> {
    if (!data) return;

    const { accounts, transactions, goals, loans, investments } = data;

    // Process each data type in parallel
    await Promise.all([
      this.processTableData('accounts', accounts),
      this.processTableData('transactions', transactions),
      this.processTableData('goals', goals),
      this.processTableData('loans', loans),
      this.processTableData('investments', investments),
    ]);
  }

  // Process individual table data
  private async processTableData(table: string, records: any[]): Promise<void> {
    if (!records || records.length === 0) return;

    const tableMap: Record<string, any> = {
      accounts: db.accounts,
      transactions: db.transactions,
      goals: db.goals,
      loans: db.loans,
      investments: db.investments,
    };

    const dexieTable = tableMap[table];
    if (!dexieTable) return;

    for (const record of records) {
      try {
        const existingRecord = await dexieTable.where('cloudId').equals(record.id).first();
        
        if (!existingRecord) {
          // New record - add to local DB
          await dexieTable.add({
            ...this.mapBackendToLocal(record),
            cloudId: record.id,
            synced: true,
            updatedAt: new Date(),
          });
        } else {
          // Existing record - update if backend is newer
          const backendTime = new Date(record.updated_at).getTime();
          const localTime = new Date(existingRecord.updatedAt || 0).getTime();
          
          if (backendTime > localTime) {
            await dexieTable.update(existingRecord.id, {
              ...this.mapBackendToLocal(record),
              synced: true,
              updatedAt: new Date(),
            });
          }
        }
      } catch (error) {
        console.error(`Failed to process ${table} record:`, error);
      }
    }
  }

  // Map backend data to local format
  private mapBackendToLocal(record: any): any {
    return {
      ...record,
      createdAt: record.created_at ? new Date(record.created_at) : new Date(),
      updatedAt: record.updated_at ? new Date(record.updated_at) : new Date(),
      // Remove backend-specific fields
      id: undefined, // Remove backend ID
      cloudId: record.id, // Store as cloudId
      user_id: undefined, // Remove user_id from local
    };
  }

  // Get or generate device ID
  private getDeviceId(): string {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  }

  // Get current sync status
  getSyncStatus(): BackendSyncStatus {
    return {
      isOnline: navigator.onLine,
      lastBackendSync: this.lastSyncTime,
      pendingOperations: this.pendingOperations.size,
      syncInProgress: this.syncInProgress,
    };
  }

  // Force manual sync
  async forceSync(): Promise<boolean> {
    console.log(' Manual backend sync triggered');
    const success = await this.syncWithBackend();
    
    if (success) {
      toast.success('Data synced successfully!');
    } else {
      toast.error('Sync failed. Please try again.');
    }
    
    return success;
  }

  // Cleanup on page unload
  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// Export singleton instance
export const backendSyncService = BackendSyncService.getInstance();

// Hook for React components
import { useState, useEffect } from 'react';

export function useBackendSyncStatus(): BackendSyncStatus {
  const [status, setStatus] = useState<BackendSyncStatus>(backendSyncService.getSyncStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(backendSyncService.getSyncStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return status;
}
