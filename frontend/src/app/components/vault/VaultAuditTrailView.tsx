import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Upload,
  Eye,
  Download,
  Trash2,
  Share2,
  UserX,
  Edit,
  FolderPlus,
  Clock,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { vaultService, VaultAuditLog } from '@/services/vaultService';
import { toast } from 'sonner';

export const VaultAuditTrailView: React.FC = () => {
  const [logs, setLogs] = useState<VaultAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAction, setSelectedAction] = useState<string>('ALL');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.getAuditLogs();
      setLogs(data);
    } catch {
      toast.error('Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (selectedAction === 'ALL') return true;
    return log.action === selectedAction;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'UPLOAD':
        return {
          icon: Upload,
          color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
          label: 'Uploaded',
        };
      case 'VIEW':
        return {
          icon: Eye,
          color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          label: 'Viewed',
        };
      case 'DOWNLOAD':
        return {
          icon: Download,
          color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
          label: 'Downloaded',
        };
      case 'UPDATE':
        return {
          icon: Edit,
          color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
          label: 'Updated',
        };
      case 'DELETE':
        return {
          icon: Trash2,
          color: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
          label: 'Deleted',
        };
      case 'SHARE_GRANT':
        return {
          icon: Share2,
          color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
          label: 'Share Granted',
        };
      case 'SHARE_REVOKE':
        return {
          icon: UserX,
          color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
          label: 'Access Revoked',
        };
      case 'ACCESS_DENIED':
        return {
          icon: ShieldAlert,
          color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
          label: 'Access Denied',
        };
      default:
        return {
          icon: Clock,
          color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          label: action,
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* Top filter & refresh bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Immutable Security Audit Log</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Every view, download, update, and access change is cryptographically audited.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <option value="ALL">All Actions</option>
            <option value="VIEW">Views</option>
            <option value="DOWNLOAD">Downloads</option>
            <option value="UPLOAD">Uploads</option>
            <option value="SHARE_GRANT">Share Grants</option>
            <option value="SHARE_REVOKE">Share Revocations</option>
            <option value="ACCESS_DENIED">Access Denials</option>
          </select>
          <button
            type="button"
            onClick={loadLogs}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading audit trail...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No audit records found matching the filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLogs.map((log) => {
              const badge = getActionBadge(log.action);
              const Icon = badge.icon;
              return (
                <div
                  key={log.id}
                  className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl ${badge.color} mt-0.5`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {log.actor?.name || log.actor?.email || 'User'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        {log.details || `Performed ${log.action}`}
                      </p>
                      {log.document && (
                        <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                          📄 {log.document.title}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-400 flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto">
                    <span>{new Date(log.createdAt).toLocaleDateString()}</span>
                    <span>{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
