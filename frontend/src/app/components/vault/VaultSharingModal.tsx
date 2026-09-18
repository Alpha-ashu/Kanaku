import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Share2,
  Users,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Check,
  AlertTriangle,
  Lock,
  Clock,
  Eye,
  Edit3,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/database';
import { vaultService, VaultShare } from '@/services/vaultService';

interface VaultSharingModalProps {
  documentId?: string | null;
  documentTitle?: string;
  isSensitive?: boolean;
  folderId?: string | null;
  folderName?: string;
  isOpen: boolean;
  onClose: () => void;
  onShareUpdated?: () => void;
}

export const VaultSharingModal: React.FC<VaultSharingModalProps> = ({
  documentId,
  documentTitle,
  isSensitive = false,
  folderId,
  folderName,
  isOpen,
  onClose,
  onShareUpdated,
}) => {
  const [recipientInput, setRecipientInput] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'editor'>('viewer');
  const [canDownload, setCanDownload] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [activeShares, setActiveShares] = useState<VaultShare[]>([]);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSensitiveWarning, setShowSensitiveWarning] = useState(false);

  // Read trusted friends from local Dexie database for autocomplete
  const friends =
    useLiveQuery(() => db.friends.filter((f) => !f.deletedAt && Boolean(f.email)).toArray(), []) || [];

  const targetName = documentTitle ? `Document: "${documentTitle}"` : folderName ? `Folder: "${folderName}"` : 'Item';

  useEffect(() => {
    if (!isOpen) return;
    loadShares();
  }, [isOpen, documentId, folderId]);

  const loadShares = async () => {
    setIsLoadingShares(true);
    try {
      const allShares = await vaultService.getShares();
      const filtered = allShares.filter((s) => {
        if (documentId) return s.documentId === documentId;
        if (folderId) return s.folderId === folderId;
        return false;
      });
      setActiveShares(filtered);
    } catch {
      // ignore
    } finally {
      setIsLoadingShares(false);
    }
  };

  if (!isOpen) return null;

  const handleInitiateShare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientInput.trim()) {
      toast.error('Please enter the recipient email or select a contact');
      return;
    }

    // Sensitive document warning gate
    if (isSensitive) {
      setShowSensitiveWarning(true);
      return;
    }

    executeShare();
  };

  const executeShare = async () => {
    setIsSubmitting(true);
    setShowSensitiveWarning(false);
    try {
      await vaultService.createShare({
        sharedWithUserEmailOrId: recipientInput.trim(),
        documentId: documentId || undefined,
        folderId: folderId || undefined,
        permission,
        canDownload,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });

      toast.success(`Access granted to ${recipientInput.trim()}`);
      setRecipientInput('');
      setExpiresAt('');
      loadShares();
      if (onShareUpdated) onShareUpdated();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to share');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeShare = async (shareId: string, userName: string) => {
    try {
      await vaultService.revokeShare(shareId);
      toast.success(`Revoked access for ${userName}`);
      loadShares();
      if (onShareUpdated) onShareUpdated();
    } catch {
      toast.error('Failed to revoke access');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6"
      >
        {/* Sensitive Document Conscious Confirmation Dialog */}
        <AnimatePresence>
          {showSensitiveWarning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-6 flex flex-col items-center justify-center text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mb-4">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                Sensitive Document Warning
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mb-6 leading-relaxed">
                This document contains sensitive personal identity or financial information. Only share it with trusted
                people or legal representatives.
              </p>
              <div className="flex gap-3 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => setShowSensitiveWarning(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeShare}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md active:scale-95 transition-all"
                >
                  Confirm & Share
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Share Vault Access</h3>
              <p className="text-xs text-slate-500 truncate max-w-xs">{targetName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sharing Form */}
        <div className="p-6 space-y-5">
          <form onSubmit={handleInitiateShare} className="space-y-4">
            {/* Recipient Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Share with Kanakku User (Email or Account ID)
              </label>
              <input
                type="text"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder="e.g. family.member@example.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* Quick Contact Chips from Friends list */}
              {friends.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400">Trusted Contacts:</span>
                  {friends.slice(0, 4).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setRecipientInput(f.email || '')}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-[11px] font-medium text-slate-600 dark:text-slate-300 transition-colors"
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Permission Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Permission Level
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPermission('viewer')}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    permission === 'viewer'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs mb-1">
                    <Eye className="w-4 h-4 text-indigo-600" />
                    <span>Viewer</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Can view & preview document. Cannot edit or delete.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setPermission('editor')}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    permission === 'editor'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs mb-1">
                    <Edit3 className="w-4 h-4 text-indigo-600" />
                    <span>Editor</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Can update metadata & upload new document versions.</p>
                </button>
              </div>
            </div>

            {/* Download permission & Expiry */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canDownload}
                  onChange={(e) => setCanDownload(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Allow file download</span>
              </label>

              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  placeholder="Expires (optional)"
                  className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Grant Access</span>
                </>
              )}
            </button>
          </form>

          {/* Active Shares Section */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
              People With Access ({activeShares.length})
            </h4>

            {isLoadingShares ? (
              <div className="py-4 text-center text-xs text-slate-400">Loading access list...</div>
            ) : activeShares.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                <Lock className="w-3.5 h-3.5 text-emerald-500" />
                <span>Private to you only. Not shared with anyone.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activeShares.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {s.sharedWithUser?.name || s.sharedWithUser?.email || s.sharedWithUserId}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span className="capitalize font-medium text-indigo-600 dark:text-indigo-400">
                          {s.permission}
                        </span>
                        <span>•</span>
                        <span>{s.canDownload ? 'Download permitted' : 'View only'}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRevokeShare(s.id, s.sharedWithUser?.name || 'user')}
                      className="px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 font-semibold text-[11px] transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
