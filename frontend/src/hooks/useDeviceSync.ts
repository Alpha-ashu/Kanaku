/**
 * Device Sync Hook
 * Manages cross-device sync lifecycle and updates
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { deviceSyncManager, SyncEvent, SyncPollingConfig } from '@/lib/device-sync-manager';

interface UseDeviceSyncOptions {
  pollingInterval?: number;
  autoStart?: boolean;
  onSync?: (event: SyncEvent) => void;
  onError?: (error: Error) => void;
}

interface UseDeviceSyncReturn {
  isPolling: boolean;
  lastSyncTime: Date | null;
  syncCount: number;
  error: Error | null;
  startPolling: () => void;
  stopPolling: () => void;
  syncNow: () => Promise<void>;
  setSyncConfig: (config: Partial<SyncPollingConfig>) => void;
  onSyncEvent: (
    eventType: string,
    handler: (event: SyncEvent) => void
  ) => () => void;
}

/**
 * Hook for managing cross-device sync
 */
export function useDeviceSync(
  options: UseDeviceSyncOptions = {}
): UseDeviceSyncReturn {
  const {
    pollingInterval = 30 * 1000, // 30 seconds default
    autoStart = true,
    onSync,
    onError,
  } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncCount, setSyncCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const unsubscribeRef = useRef<() => void | null>(null);
  const startedRef = useRef(false);

  /**
   * Handle sync events
   */
  const handleSyncEvent = useCallback(
    (event: SyncEvent) => {
      setSyncCount((prev) => prev + 1);
      setLastSyncTime(new Date());
      onSync?.(event);
    },
    [onSync]
  );

  /**
   * Start polling
   */
  const startPolling = useCallback(() => {
    if (isPolling) {
      return;
    }

    console.log('Starting device sync polling');

    // Configure sync manager
    deviceSyncManager.setSyncConfig({
      enabled: true,
      interval: pollingInterval,
      maxRetries: 3,
      retryBackoffMs: 1000,
    });

    // Register event handler
    if (onSync) {
      unsubscribeRef.current = deviceSyncManager.onSyncEvent('*', handleSyncEvent);
    }

    // Start polling
    deviceSyncManager.startPolling();
    setIsPolling(true);
  }, [isPolling, pollingInterval, handleSyncEvent, onSync]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (!isPolling) {
      return;
    }

    console.log('Stopping device sync polling');

    deviceSyncManager.stopPolling();

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    setIsPolling(false);
  }, [isPolling]);

  /**
   * Trigger manual sync
   */
  const syncNow = useCallback(async () => {
    try {
      setError(null);
      await deviceSyncManager.syncNow();
      setSyncCount((prev) => prev + 1);
      setLastSyncTime(new Date());
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
    }
  }, [onError]);

  /**
   * Update sync configuration
   */
  const setSyncConfig = useCallback(
    (config: Partial<SyncPollingConfig>) => {
      deviceSyncManager.setSyncConfig(config);
    },
    []
  );

  /**
   * Register event handler
   */
  const onSyncEvent = useCallback(
    (eventType: string, handler: (event: SyncEvent) => void): (() => void) => {
      return deviceSyncManager.onSyncEvent(eventType, handler);
    },
    []
  );

  /**
   * Auto-start polling on mount
   */
  useEffect(() => {
    if (!autoStart || startedRef.current) {
      return;
    }

    startedRef.current = true;
    startPolling();
  }, [autoStart, startPolling]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    isPolling,
    lastSyncTime,
    syncCount,
    error,
    startPolling,
    stopPolling,
    syncNow,
    setSyncConfig,
    onSyncEvent,
  };
}

export type { SyncEvent };
