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
  Eye,
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

const CATEGORY_ACCENT: Record<string, { bg: string; text: string; ring: string }> = {
  'Personal Documents': { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-100' },
  'Property Documents': { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
  Insurance: { bg: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-100' },
  'Financial Documents': { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100' },
  'Legal Documents': { bg: 'bg-pink-50', text: 'text-pink-600', ring: 'ring-pink-100' },
  'Medical Documents': { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-100' },
  Other: { bg: 'bg-slate-50', text: 'text-slate-500', ring: 'ring-slate-100' },
};

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
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
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  const categories = Object.entries(data.categoryBreakdown);

  return (
    <div className="space-y-5">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Documents</span>
          <span className="text-fin-md text-slate-900">{data.totalDocuments}</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Folders</span>
          <span className="text-fin-md text-slate-900">{data.totalFolders}</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shared</span>
          <span className="text-fin-md text-slate-900">{data.sharedWithOthersCount + data.sharedWithMeCount}</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Storage</span>
          <span className="text-fin-md text-slate-900">{formatBytes(data.totalStorageBytes)}</span>
        </div>
      </div>

      {/* Privacy Badge */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 flex flex-row items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-slate-700 font-semibold">Private by default</p>
          <p className="text-xs text-slate-400 font-medium">Encrypted storage · Controlled sharing · You own your data</p>
        </div>
      </div>

      {/* Category Grid */}
      <div>
        <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3">Categories</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {categories.map(([name, count], i) => {
            const Icon = CATEGORY_ICONS[name] || Folder;
            const accent = CATEGORY_ACCENT[name] || CATEGORY_ACCENT['Other'];
            return (
              <motion.button
                key={name}
                type="button"
                onClick={() => onSelectCategory(name)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col items-start cursor-pointer hover:shadow-md hover:border-purple-200 transition-all group"
              >
                <div className={`w-9 h-9 rounded-xl ${accent.bg} ${accent.text} flex items-center justify-center mb-2.5`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <h4 className="text-xs sm:text-sm font-semibold text-slate-900 text-left leading-snug line-clamp-2 break-words">{name}</h4>
                <div className="flex items-center justify-between w-full mt-1.5">
                  <span className="text-xs text-slate-400 font-medium">{count} {count === 1 ? 'doc' : 'docs'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Expiring Soon */}
      {data.expiringDocuments.length > 0 && (
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
            Expiring Soon
          </h3>
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-0 divide-y divide-slate-100 overflow-hidden">
            {data.expiringDocuments.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onPreviewDocument(doc.id)}
                className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{doc.title}</p>
                    <p className="text-xs text-slate-400">
                      Expires {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : '—'}
                    </p>
                  </div>
                </div>
                <Eye className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recently Added */}
      {data.recentlyAdded.length > 0 && (
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Clock className="w-4.5 h-4.5 text-slate-400" />
            Recently Added
          </h3>
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-0 divide-y divide-slate-100 overflow-hidden">
            {data.recentlyAdded.slice(0, 5).map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onPreviewDocument(doc.id)}
                className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{doc.title}</p>
                    <p className="text-xs text-slate-400">{doc.category} · {formatBytes(doc.fileSize)}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.totalDocuments === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center text-center py-16 px-4">
          <FolderLock className="w-12 h-12 text-purple-300 mb-3" />
          <h3 className="text-base sm:text-lg font-bold text-slate-900">Your Vault is empty</h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-sm">
            Upload your first document — IDs, property papers, insurance policies. Everything stays encrypted and private.
          </p>
          <button
            type="button"
            onClick={onUploadClick}
            className="h-10 px-5 rounded-xl text-xs sm:text-sm font-semibold bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white shadow-sm shadow-purple-500/20 transition-all cursor-pointer mt-4 inline-flex items-center justify-center gap-2"
          >
            Upload Your First Document
          </button>
        </div>
      )}
    </div>
  );
};
