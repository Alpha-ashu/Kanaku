/**
 * SyncMonitorDashboard
 *
 * Admin-only page for monitoring the offline-first sync health.
 * Shows: status overview, event log, failed queue items, and
 * provides controls to retry or force-resync.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
 RefreshCw, AlertTriangle, CheckCircle2, Clock, WifiOff,
 RotateCcw, Trash2, ChevronLeft, Activity, Database,
} from 'lucide-react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db, SyncQueueItem, SyncEventLog } from '@/lib/database';
import { offlineSyncEngine, useSyncStats } from '@/lib/offline-sync-engine';
import { toast } from 'sonner';

// Status badge 
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
 const map: Record<string, string> = {
 pending: 'bg-amber-100 text-amber-700',
 processing: 'bg-blue-100 text-blue-700',
 succeeded: 'bg-green-100 text-green-700',
 failed: 'bg-red-100 text-red-700',
 sync_success: 'bg-green-100 text-green-700',
 sync_failure: 'bg-red-100 text-red-700',
 sync_start: 'bg-blue-100 text-blue-700',
 conflict: 'bg-orange-100 text-orange-700',
 queue_flush: 'bg-gray-100 text-gray-600',
 offline: 'bg-amber-100 text-amber-700',
 syncing: 'bg-blue-100 text-blue-700',
 synced: 'bg-green-100 text-green-700',
 error: 'bg-red-100 text-red-700',
 idle: 'bg-gray-100 text-gray-500',
 };
 const cls = map[status] ?? 'bg-gray-100 text-gray-600';
 return (
 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
 {status}
 </span>
 );
};

// Queue item row 
const QueueRow: React.FC<{ item: SyncQueueItem }> = ({ item }) => (
 <tr className="border-b border-gray-100 hover:bg-gray-50 text-sm">
 <td className="py-2 px-3 font-mono text-xs text-gray-400">{item.id}</td>
 <td className="py-2 px-3">{item.table}</td>
 <td className="py-2 px-3">
 <span className={[
 'inline-block px-2 py-0.5 rounded text-xs font-medium',
 item.operation === 'create' ? 'bg-blue-50 text-blue-700'
 : item.operation === 'update' ? 'bg-violet-50 text-violet-700'
 : 'bg-red-50 text-red-700',
 ].join(' ')}>
 {item.operation}
 </span>
 </td>
 <td className="py-2 px-3 font-mono text-xs">{item.localId}</td>
 <td className="py-2 px-3"><StatusBadge status={item.status} /></td>
 <td className="py-2 px-3 text-xs text-gray-500">{item.retries}</td>
 <td className="py-2 px-3 text-xs text-gray-500">
 {item.createdAt instanceof Date
 ? item.createdAt.toLocaleTimeString()
 : new Date(item.createdAt).toLocaleTimeString()}
 </td>
 {item.errorMessage && (
 <td className="py-2 px-3 text-xs text-red-600 max-w-xs truncate" title={item.errorMessage}>
 {item.errorMessage}
 </td>
 )}
 </tr>
);

// Event log row 
const LogRow: React.FC<{ log: SyncEventLog }> = ({ log }) => (
 <tr className="border-b border-gray-100 hover:bg-gray-50 text-sm">
 <td className="py-2 px-3 font-mono text-xs text-gray-400">{log.id}</td>
 <td className="py-2 px-3"><StatusBadge status={log.eventType} /></td>
 <td className="py-2 px-3 text-xs text-gray-600">{log.affectedTable ?? '-'}</td>
 <td className="py-2 px-3 text-xs text-gray-600">{log.recordsProcessed ?? 0}</td>
 <td className="py-2 px-3 text-xs text-gray-500">
 {log.durationMs != null ? `${log.durationMs} ms` : '-'}
 </td>
 <td className="py-2 px-3 text-xs text-gray-500">
 {log.timestamp instanceof Date
 ? log.timestamp.toLocaleString()
 : new Date(log.timestamp).toLocaleString()}
 </td>
 {log.errorMessage && (
 <td className="py-2 px-3 text-xs text-red-600 max-w-xs truncate" title={log.errorMessage}>
 {log.errorMessage}
 </td>
 )}
 </tr>
);

// Main component 
export const SyncMonitorDashboard: React.FC = () => {
 const { setCurrentPage } = useApp();
 const { user, role, loading: authLoading, dataReady } = useAuth();
 const syncStats = useSyncStats();
 const [activeTab, setActiveTab] = useState<'queue' | 'logs'>('queue');
 const [isForceSyncing, setIsForceSyncing] = useState(false);

 // Live queries from IndexedDB
 const allQueueItems = useLiveQuery(
 () => user?.id
 ? db.syncQueue.where('userId').equals(user.id).reverse().limit(200).toArray()
 : Promise.resolve([] as SyncQueueItem[]),
 [user?.id],
 ) ?? [];

 const syncLogs = useLiveQuery(
 () => user?.id
 ? db.syncEventLogs.where('userId').equals(user.id).reverse().limit(200).toArray()
 : Promise.resolve([] as SyncEventLog[]),
 [user?.id],
 ) ?? [];

 // Derived counts
 const pendingCount = allQueueItems.filter(i => i.status === 'pending').length;
 const processingCount = allQueueItems.filter(i => i.status === 'processing').length;
 const failedCount = allQueueItems.filter(i => i.status === 'failed').length;
 const succeededCount = allQueueItems.filter(i => i.status === 'succeeded').length;

 const successLogs = syncLogs.filter(l => l.eventType === 'sync_success').length;
 const failLogs = syncLogs.filter(l => l.eventType === 'sync_failure').length;
 const conflictLogs = syncLogs.filter(l => l.eventType === 'conflict').length;

 if (authLoading || !dataReady) {
   return (
     <CenteredLayout>
       <div className="flex items-center justify-center py-20">
         <div className="animate-spin w-10 h-10 border-4 border-gray-200 border-t-indigo-600 rounded-full" />
       </div>
     </CenteredLayout>
   );
 }

 // Only admins can access this page
 if (role !== 'admin') {
 return (
 <CenteredLayout>
 <div className="text-center py-12">
 <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
 <p className="text-gray-600 mb-4">Only admins can access the sync monitoring panel.</p>
 <button
 onClick={() => setCurrentPage('dashboard')}
 className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
 >
 Go to Dashboard
 </button>
 </div>
 </CenteredLayout>
 );
 }

 const handleRetryFailed = async () => {
 if (!user?.id) return;
 await offlineSyncEngine.retryFailed(user.id);
 toast.success('Failed items re-queued for sync');
 };

 const handleForceResync = async () => {
 if (!user?.id) return;
 setIsForceSyncing(true);
 try {
 await offlineSyncEngine.forceFullResync(user.id);
 toast.success('Full resync triggered - this may take a moment');
 } finally {
 setIsForceSyncing(false);
 }
 };

 const handleClearSucceeded = async () => {
 if (!user?.id) return;
 const ids = allQueueItems.filter(i => i.status === 'succeeded').map(i => i.id as number);
 await db.syncQueue.bulkDelete(ids);
 toast.success(`Cleared ${ids.length} completed items`);
 };

 const handleManualSync = () => {
 offlineSyncEngine.sync();
 toast.info('Sync triggered');
 };

 return (
 <CenteredLayout>
 <div className="space-y-6 pb-8">
 {/* Header */}
 <div className="flex items-center gap-3">
 <button
 onClick={() => setCurrentPage('admin-panel')}
 className="p-2 hover:bg-gray-100 rounded-lg transition-colors md:!hidden"
 aria-label="Back to admin panel"
 >
 <ChevronLeft size={24} className="text-gray-600" />
 </button>
 <div>
 <h2 className="text-2xl font-bold text-gray-900">Sync Monitor</h2>
 <p className="text-gray-500 mt-0.5 text-sm">Offline-first sync health dashboard</p>
 </div>
 </div>

 {/* Current status card */}
 <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
 <div className="flex items-center justify-between mb-4">
 <h3 className="font-semibold text-gray-900 flex items-center gap-2">
 <Activity size={18} className="text-blue-500" />
 Current Sync Status
 </h3>
 <div className="flex items-center gap-2">
 <StatusBadge status={syncStats.status} />
 <button
 onClick={handleManualSync}
 className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
 title="Trigger sync now"
 >
 <RefreshCw size={16} className="text-gray-500" />
 </button>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
 {[
 { label: 'Pending', value: pendingCount, color: 'text-amber-600', icon: Clock },
 { label: 'Processing', value: processingCount, color: 'text-blue-600', icon: RefreshCw },
 { label: 'Failed', value: failedCount, color: 'text-red-600', icon: AlertTriangle },
 { label: 'Completed', value: succeededCount, color: 'text-green-600', icon: CheckCircle2 },
 ].map(({ label, value, color, icon: Icon }) => (
 <div key={label} className="flex flex-col gap-1 p-3 bg-white rounded-xl">
 <div className="flex items-center gap-2">
 <Icon size={14} className={color} />
 <span className="text-xs text-gray-500">{label}</span>
 </div>
 <span className={`text-2xl font-bold ${color}`}>{value}</span>
 </div>
 ))}
 </div>

 {syncStats.lastSyncedAt && (
 <p className="text-xs text-gray-400 mt-3">
 Last synced: {syncStats.lastSyncedAt.toLocaleString()}
 </p>
 )}
 {syncStats.errorMessage && (
 <div className="mt-3 px-3 py-2 bg-red-50 rounded-lg text-sm text-red-700">
 <AlertTriangle size={14} className="inline mr-1" />
 {syncStats.errorMessage}
 </div>
 )}
 </div>

 {/* Event log summary */}
 <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
 <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
 <Database size={18} className="text-violet-500" />
 Sync Log Summary
 </h3>
 <div className="grid grid-cols-3 gap-4">
 {[
 { label: 'Successful syncs', value: successLogs, color: 'text-green-600' },
 { label: 'Failed syncs', value: failLogs, color: 'text-red-600' },
 { label: 'Conflicts', value: conflictLogs, color: 'text-orange-600' },
 ].map(({ label, value, color }) => (
 <div key={label} className="p-3 bg-white rounded-xl">
 <p className="text-xs text-gray-500 mb-1">{label}</p>
 <p className={`text-2xl font-bold ${color}`}>{value}</p>
 </div>
 ))}
 </div>
 </div>

 {/* Action buttons */}
 <div className="flex flex-wrap gap-3">
 <button
 onClick={handleRetryFailed}
 disabled={failedCount === 0}
 className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-xl text-sm font-medium hover:bg-amber-200 transition-colors disabled:opacity-50"
 >
 <RotateCcw size={15} />
 Retry {failedCount} Failed
 </button>
 <button
 onClick={handleClearSucceeded}
 disabled={succeededCount === 0}
 className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
 >
 <Trash2 size={15} />
 Clear Completed
 </button>
 <button
 onClick={handleForceResync}
 disabled={isForceSyncing}
 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
 >
 <RefreshCw size={15} className={isForceSyncing ? 'animate-spin' : ''} />
 {isForceSyncing ? 'Resyncing...' : 'Force Full Resync'}
 </button>
 </div>

 {/* Tabs */}
 <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
 <div className="flex border-b border-gray-100">
 {(['queue', 'logs'] as const).map(tab => (
 <button
 key={tab}
 onClick={() => setActiveTab(tab)}
 className={[
 'flex-1 py-3 text-sm font-medium transition-colors',
 activeTab === tab
 ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50'
 : 'text-gray-500 hover:text-gray-700',
 ].join(' ')}
 >
 {tab === 'queue' ? `Sync Queue (${allQueueItems.length})` : `Event Logs (${syncLogs.length})`}
 </button>
 ))}
 </div>

 <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
 {activeTab === 'queue' ? (
 allQueueItems.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12 text-gray-400">
 <CheckCircle2 size={32} className="mb-2 text-green-400" />
 <p className="text-sm">Sync queue is empty</p>
 </div>
 ) : (
 <table className="w-full min-w-[640px]">
 <thead className="sticky top-0 bg-white border-b border-gray-200">
 <tr className="text-xs text-gray-500 font-medium">
 <th className="py-2 px-3 text-left">ID</th>
 <th className="py-2 px-3 text-left">Table</th>
 <th className="py-2 px-3 text-left">Operation</th>
 <th className="py-2 px-3 text-left">Local ID</th>
 <th className="py-2 px-3 text-left">Status</th>
 <th className="py-2 px-3 text-left">Retries</th>
 <th className="py-2 px-3 text-left">Time</th>
 </tr>
 </thead>
 <tbody>
 {allQueueItems.map(item => (
 <QueueRow key={item.id} item={item} />
 ))}
 </tbody>
 </table>
 )
 ) : (
 syncLogs.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12 text-gray-400">
 <Activity size={32} className="mb-2" />
 <p className="text-sm">No sync events recorded yet</p>
 </div>
 ) : (
 <table className="w-full min-w-[640px]">
 <thead className="sticky top-0 bg-white border-b border-gray-200">
 <tr className="text-xs text-gray-500 font-medium">
 <th className="py-2 px-3 text-left">ID</th>
 <th className="py-2 px-3 text-left">Event</th>
 <th className="py-2 px-3 text-left">Table</th>
 <th className="py-2 px-3 text-left">Records</th>
 <th className="py-2 px-3 text-left">Duration</th>
 <th className="py-2 px-3 text-left">Time</th>
 </tr>
 </thead>
 <tbody>
 {syncLogs.map(log => (
 <LogRow key={log.id} log={log} />
 ))}
 </tbody>
 </table>
 )
 )}
 </div>
 </div>
 </div>
 </CenteredLayout>
 );
};

