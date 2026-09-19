import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  X,
  Share2,
  Search,
  Shield,
  AlertTriangle,
  Eye,
  Edit3,
  Download,
  Calendar,
  UserPlus,
  Lock,
  XCircle,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { vaultService, VaultShare } from '@/services/vaultService';

interface VaultSharingModalProps {
  documentId?: string;
  documentTitle?: string;
  isSensitive?: boolean;
  folderId?: string;
  folderName?: string;
  isOpen: boolean;
  onClose: () => void;
  onShareUpdated: () => void;
}

export const VaultSharingModal: React.FC<VaultSharingModalProps> = ({
  documentId,
  documentTitle,
  isSensitive,
  folderId,
  folderName,
  isOpen,
  onClose,
  onShareUpdated,
}) => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'editor'>('viewer');
  const [canDownload, setCanDownload] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [sensitiveAcknowledged, setSensitiveAcknowledged] = useState(false);
  const [existingShares, setExistingShares] = useState<VaultShare[]>([]);
  const [isLoadingShares, setIsLoadingShares] = useState(false);

  const targetName = documentTitle || folderName || 'Item';
  const isDocument = Boolean(documentId);

  useEffect(() => {
    if (isOpen) {
      loadExistingShares();
      setRecipientEmail('');
      setSensitiveAcknowledged(false);
      setExpiresAt('');
    }
  }, [isOpen, documentId, folderId]);

  const loadExistingShares = async () => {
    setIsLoadingShares(true);
    try {
      const allShares = await vaultService.getShares();
      const filtered = allShares.filter((s) =>
        isDocument ? s.documentId === documentId : s.folderId === folderId,
      );
      setExistingShares(filtered);
    } catch {
      // ignore
    } finally {
      setIsLoadingShares(false);
    }
  };

  const handleShare = async () => {
    if (!recipientEmail.trim()) {
      toast.error('Please enter a recipient email');
      return;
    }
    if (isSensitive && !sensitiveAcknowledged) {
      toast.error('Please acknowledge the sensitive nature of this document');
      return;
    }

    setIsSharing(true);
    try {
      await vaultService.createShare({
        sharedWithUserEmailOrId: recipientEmail.trim(),
        documentId: isDocument ? documentId : undefined,
        folderId: !isDocument ? folderId : undefined,
        permission,
        canDownload,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });

      toast.success(`Successfully shared with ${recipientEmail}`);
      setRecipientEmail('');
      loadExistingShares();
      onShareUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to share');
    } finally {
      setIsSharing(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      await vaultService.revokeShare(shareId);
      toast.success('Access revoked');
      loadExistingShares();
      onShareUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke');
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-1.5 sm:p-4 md:p-6 pointer-events-auto select-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Screen Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-[calc(100vw-12px)] sm:max-w-xl h-[95dvh] sm:h-[88vh] sm:max-h-[780px] flex flex-col bg-white rounded-[28px] sm:rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-100 bg-white/95 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Share2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Share {isDocument ? 'Document' : 'Folder'}</h2>
              <p className="text-xs text-slate-500 font-medium truncate max-w-[240px] sm:max-w-[300px]">{targetName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 overscroll-contain">
          {/* Sensitive Warning */}
          {isSensitive && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs sm:text-sm text-amber-900 font-bold">Sensitive Document</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                    This document is marked as sensitive. Only share it with people you fully trust.
                  </p>
                  <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sensitiveAcknowledged}
                      onChange={(e) => setSensitiveAcknowledged(e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-600 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-amber-900">
                      I understand the risks and wish to proceed
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Recipient Email */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-slate-400" /> Recipient Email <span className="text-blue-600">*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="Enter the Kanaku user's email"
                className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-sm text-slate-800 placeholder:text-slate-400 font-medium transition-all outline-none"
              />
            </div>
          </div>

          {/* Permission Selection */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Permission Level</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPermission('viewer')}
                className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                  permission === 'viewer'
                    ? 'border-blue-600 bg-blue-50/60 shadow-xs ring-2 ring-blue-100'
                    : 'border-slate-200 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${permission === 'viewer' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    <Eye className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-slate-900">Viewer</span>
                </div>
                <p className="text-xs text-slate-500 font-medium leading-tight">View & preview only</p>
              </button>

              <button
                type="button"
                onClick={() => setPermission('editor')}
                className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                  permission === 'editor'
                    ? 'border-blue-600 bg-blue-50/60 shadow-xs ring-2 ring-blue-100'
                    : 'border-slate-200 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${permission === 'editor' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-slate-900">Editor</span>
                </div>
                <p className="text-xs text-slate-500 font-medium leading-tight">Edit and upload new versions</p>
              </button>
            </div>
          </div>

          {/* Download Permission & Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
              <Download className="w-4 h-4 text-slate-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-slate-800">Allow Download</p>
                <p className="text-xs text-slate-400 font-medium">Permit saving copies</p>
              </div>
              <input
                type="checkbox"
                checked={canDownload}
                onChange={(e) => setCanDownload(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-sm text-slate-800 font-medium transition-all outline-none"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Existing Shares */}
          {existingShares.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current Access ({existingShares.length})</h4>
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden">
                {existingShares.map((share) => (
                  <div key={share.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {share.sharedWithUser?.name || share.sharedWithUser?.email}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-2xs uppercase font-black px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700">
                          {share.permission}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {share.canDownload ? '· Can download' : '· View only'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(share.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors shrink-0 cursor-pointer"
                      title="Revoke Access"
                    >
                      <XCircle className="w-4.5 h-4.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Notice */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100/60">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-700 font-medium">
              You retain full ownership. Access can be revoked instantly at any time.
            </p>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="shrink-0 p-4 sm:p-5 border-t border-slate-100 bg-white/95 backdrop-blur-md flex items-center gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSharing}
            className="h-11 px-5 rounded-xl border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing || !recipientEmail.trim() || (isSensitive && !sensitiveAcknowledged)}
            className="flex-1 h-11 px-5 rounded-xl bg-[#18181B] hover:bg-black active:bg-zinc-900 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSharing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sharing...</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>Share Securely</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
