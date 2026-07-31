import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOptionalApp } from '@/contexts/AppContext';

/**
 * Persistent "offline" indicator.
 *
 * The app is offline-first: Dexie keeps working, writes queue, and everything syncs
 * on reconnect — so nothing visibly breaks when the network drops. That is the
 * problem. Without an indicator the user cannot tell whether a balance they are
 * looking at is live or last-known, and `isOnline` already existed on AppContext
 * with no component consuming it.
 *
 * Deliberately quiet: a slim inline strip rather than a modal or toast, because
 * being offline is a supported state here, not an error. It reassures rather than
 * interrupts — the work is saved, it just has not left the device yet.
 *
 * Distinct from the `dataSyncError` banner below it in App.tsx: that one means a
 * sync attempt failed while (probably) online and offers a retry. This one means
 * the browser reports no connection at all, so retrying is pointless.
 */
export const OfflineBadge: React.FC = () => {
  const app = useOptionalApp();

  // Render nothing when online, or before the provider is available (public pages).
  if (!app || app.isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-badge"
      className="px-4 sm:px-6 pt-3"
    >
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-600 shadow-sm">
        <WifiOff size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
        <span>
          <span className="font-semibold text-slate-700">Offline</span>
          {' — your changes are saved on this device and will sync when you reconnect.'}
        </span>
      </div>
    </div>
  );
};
