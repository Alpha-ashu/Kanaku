/**
 * Sync Status Indicator Component
 * Shows cross-device sync status and last sync time
 */

import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { useDeviceSync } from '@/hooks/useDeviceSync';

interface SyncStatusIndicatorProps {
  showLabel?: boolean;
  showLastSync?: boolean;
  tooltipDelay?: number;
}

/**
 * Sync Status Indicator Component
 */
export function SyncStatusIndicator({
  showLabel = false,
  showLastSync = true,
  tooltipDelay = 2000,
}: SyncStatusIndicatorProps) {
  const { isPolling, lastSyncTime, syncCount, error, syncNow } = useDeviceSync({
    autoStart: true,
    pollingInterval: 30 * 1000, // 30 seconds
  });

  const [showTooltip, setShowTooltip] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, tooltipDelay);
  };

  const handleMouseLeave = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    setShowTooltip(false);
  };

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      await syncNow();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const getStatusIcon = () => {
    if (error) {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    }

    if (isPolling) {
      return <Wifi className="w-5 h-5 text-green-500" />;
    }

    return <WifiOff className="w-5 h-5 text-gray-500" />;
  };

  const getStatusColor = () => {
    if (error) return 'text-red-500';
    if (isPolling) return 'text-green-500';
    return 'text-gray-500';
  };

  const getStatusText = () => {
    if (error) return 'Sync error';
    if (isPolling) return 'Syncing...';
    return 'Sync paused';
  };

  const formatLastSyncTime = (date: Date | null): string => {
    if (!date) return 'Never';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main Button */}
      <button data-testid="sync-status-indicator-error-sync-error-click"
        onClick={handleManualSync}
        disabled={isManualSyncing}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg
          border border-gray-200 hover:bg-gray-50
          transition-all duration-200
          ${isManualSyncing ? 'opacity-50 cursor-not-allowed' : ''}
          ${error ? 'bg-red-50 border-red-200' : 'bg-white'}
        `}
        title={
          error
            ? 'Sync error - click to retry'
            : 'Click to sync now'
        }
      >
        <div className="relative">
          {getStatusIcon()}
          {isManualSyncing && (
            <div className="absolute inset-0 animate-spin">
              <RefreshCw className="w-5 h-5 text-blue-500" />
            </div>
          )}
        </div>

        {showLabel && (
          <span className={`text-xs font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        )}

        {syncCount > 0 && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
            {syncCount} synced
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className={`
            absolute bottom-full right-0 mb-2 w-48
            bg-gray-900 text-white text-xs rounded-lg p-3
            z-50 shadow-lg
            animate-fadeIn
          `}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {error ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              )}
              <span className="font-semibold">
                {error ? 'Sync Error' : 'Sync Active'}
              </span>
            </div>

            {showLastSync && (
              <div className="text-gray-300">
                Last sync: {formatLastSyncTime(lastSyncTime)}
              </div>
            )}

            {syncCount > 0 && (
              <div className="text-gray-300">
                Total synced: {syncCount} events
              </div>
            )}

            {error && (
              <div className="text-red-300 text-xs">
                {error.message || 'Unknown sync error'}
              </div>
            )}

            <div className="pt-2 border-t border-gray-700 text-gray-400">
              Click button to sync now
            </div>
          </div>

          {/* Tooltip arrow */}
          <div className="absolute top-full right-4 w-2 h-2 bg-gray-900 transform rotate-45" />
        </div>
      )}
    </div>
  );
}

export default SyncStatusIndicator;
