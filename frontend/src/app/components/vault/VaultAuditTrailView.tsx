import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Upload,
  Eye,
  Download,
  Share2,
  Trash2,
  FolderPlus,
  Lock,
  AlertTriangle,
  XCircle,
  Edit3,
  RefreshCw,
} from 'lucide-react';
import { vaultService, VaultAuditLog } from '@/services/vaultService';

const ACTION_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  UPLOAD: { icon: Upload, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Upload' },
  PREVIEW: { icon: Eye, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Preview' },
  DOWNLOAD: { icon: Download, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Download' },
  SHARE_GRANT: { icon: Share2, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Share Granted' },
  SHARE_REVOKE: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Share Revoked' },
  SHARE_UPDATE: { icon: Edit3, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Share Updated' },
  DELETE: { icon: Trash2, color: 'text-red-600', bg: 'bg-red-50', label: 'Delete' },
  FOLDER_CREATE: { icon: FolderPlus, color: 'text-teal-600', bg: 'bg-teal-50', label: 'Folder Created' },
  FOLDER_RENAME: { icon: Edit3, color: 'text-slate-600', bg: 'bg-slate-100', label: 'Folder Renamed' },
  FOLDER_DELETE: { icon: Trash2, color: 'text-red-500', bg: 'bg-red-50', label: 'Folder Deleted' },
  ACCESS_DENIED: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'Access Denied' },
  LOCK_SETUP: { icon: Lock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Lock Setup' },
  LOCK_VERIFY: { icon: Lock, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Lock Verified' },
};

const getActionConfig = (action: string) => {
  return ACTION_CONFIG[action] || {
    icon: ShieldCheck,
    color: 'text-slate-500',
    bg: 'bg-slate-50',
    label: action,
  };
};

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

export const VaultAuditTrailView: React.FC = () => {
  const [logs, setLogs] = useState<VaultAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.getAuditLogs();
      setLogs(data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-section-title flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          Security Audit Trail
        </h3>
        <button
          type="button"
          onClick={loadLogs}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <p className="text-body-sm text-slate-500">
        Immutable record of every action on your vault. Cannot be edited or deleted.
      </p>

      {logs.length === 0 ? (
        <div className="KANAKU-card !items-center !text-center !py-12">
          <ShieldCheck className="w-10 h-10 text-emerald-300 mb-2" />
          <h4 className="text-card-title text-slate-700">No activity yet</h4>
          <p className="text-body-sm text-slate-400 mt-1">
            All vault operations will be recorded here automatically.
          </p>
        </div>
      ) : (
        <div className="KANAKU-card !p-0 divide-y divide-slate-100 overflow-hidden">
          {logs.map((log, i) => {
            const config = getActionConfig(log.action);
            const Icon = config.icon;
            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="p-3.5 flex items-start gap-3"
              >
                <div className={`w-8 h-8 rounded-xl ${config.bg} ${config.color} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-caption uppercase font-bold px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-caption">{formatRelativeTime(log.createdAt)}</span>
                  </div>
                  {log.details && (
                    <p className="text-body-sm text-slate-600 mt-1 truncate">{log.details}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {log.actor && (
                      <span className="text-caption">by {log.actor.name || log.actor.email}</span>
                    )}
                    {log.document && (
                      <span className="text-caption">· {log.document.title}</span>
                    )}
                    {log.folder && (
                      <span className="text-caption">· {log.folder.name}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
