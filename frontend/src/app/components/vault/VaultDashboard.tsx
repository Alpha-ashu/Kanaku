import React from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  FolderLock,
  FileText,
  AlertCircle,
  Share2,
  Calendar,
  Lock,
  UserCheck,
  Home,
  Shield,
  Coins,
  Scale,
  Activity,
  Folder,
  ArrowRight,
  Clock,
  Sparkles,
} from 'lucide-react';
import { VaultDashboardData, VaultDocument } from '@/services/vaultService';

interface VaultDashboardProps {
  data: VaultDashboardData | null;
  isLoading: boolean;
  onSelectCategory: (category: string) => void;
  onPreviewDocument: (docId: string) => void;
  onUploadClick: () => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  'Personal Documents': UserCheck,
  'Property Documents': Home,
  Insurance: Shield,
  'Financial Documents': Coins,
  'Legal Documents': Scale,
  'Medical Documents': Activity,
  Other: Folder,
};

const CATEGORY_COLORS: Record<string, string> = {
  'Personal Documents': 'from-blue-500 to-indigo-600',
  'Property Documents': 'from-emerald-500 to-teal-600',
  Insurance: 'from-purple-500 to-violet-600',
  'Financial Documents': 'from-amber-500 to-orange-600',
  'Legal Documents': 'from-pink-500 to-rose-600',
  'Medical Documents': 'from-red-500 to-rose-600',
  Other: 'from-slate-500 to-slate-600',
};

export const VaultDashboard: React.FC<VaultDashboardProps> = ({
  data,
  isLoading,
  onSelectCategory,
  onPreviewDocument,
  onUploadClick,
}) => {
  if (isLoading || !data) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Securing and loading your vault...</span>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Top Hero Privacy Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 shadow-xl">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-400/30 mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Private by default • AES-256 Encrypted</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Kanakku Vault
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
              Your important documents are organized here and remain private unless you choose to share them.
            </p>
          </div>

          <button
            type="button"
            onClick={onUploadClick}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold shadow-lg shadow-indigo-500/30 active:scale-95 transition-all flex items-center gap-2 flex-shrink-0"
          >
            <FolderLock className="w-4 h-4" />
            <span>Upload Document</span>
          </button>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-xs">
          <div>
            <span className="text-slate-400">Total Documents</span>
            <p className="text-xl font-black mt-0.5">{data.totalDocuments}</p>
          </div>
          <div>
            <span className="text-slate-400">Storage Used</span>
            <p className="text-xl font-black mt-0.5">{formatBytes(data.totalStorageBytes)}</p>
          </div>
          <div>
            <span className="text-slate-400">Shared With Others</span>
            <p className="text-xl font-black mt-0.5">{data.sharedWithOthersCount}</p>
          </div>
          <div>
            <span className="text-slate-400">Shared With Me</span>
            <p className="text-xl font-black mt-0.5">{data.sharedWithMeCount}</p>
          </div>
        </div>
      </div>

      {/* Expiring Soon Banner (If any) */}
      {data.expiringDocuments && data.expiringDocuments.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-bold mb-2">
            <AlertCircle className="w-4 h-4" />
            <span>Expiring Documents Alert ({data.expiringDocuments.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {data.expiringDocuments.map((doc) => (
              <div
                key={doc.id}
                onClick={() => onPreviewDocument(doc.id)}
                className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-900/60 shadow-sm cursor-pointer hover:border-amber-400 transition-all flex items-center justify-between"
              >
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate">{doc.title}</h5>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    Expires {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : ''}
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-2" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categories Grid (Requirement 27: MY VAULT) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            My Vault Categories
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {Object.entries(data.categoryBreakdown).map(([category, count]) => {
            const Icon = CATEGORY_ICONS[category] || Folder;
            const gradient = CATEGORY_COLORS[category] || 'from-slate-500 to-slate-600';

            return (
              <motion.div
                key={category}
                whileHover={{ y: -2 }}
                onClick={() => onSelectCategory(category)}
                className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${gradient} text-white flex items-center justify-center shadow-md`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                    {count}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate" title={category}>
                    {category}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">{count} {count === 1 ? 'document' : 'documents'}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Recently Added Section */}
      {data.recentlyAdded && data.recentlyAdded.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Recently Added
          </h3>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {data.recentlyAdded.map((doc) => (
              <div
                key={doc.id}
                onClick={() => onPreviewDocument(doc.id)}
                className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[10px] uppercase flex-shrink-0">
                    {doc.originalFileName.split('.').pop() || 'DOC'}
                  </div>
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {doc.title}
                    </h5>
                    <span className="text-[10px] text-slate-400">{doc.category}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-right">
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
