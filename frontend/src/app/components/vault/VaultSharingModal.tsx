import React, { useState, useEffect } from 'react';
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
      setSensitiveAcknowledged(false);
      setRecipientEmail('');
      setPermission('viewer');
      setCanDownload(true);
      setExpiresAt('');
      loadExistingShares();
    }
  }, [isOpen, documentId, folderId]);

  const loadExistingShares = async () => {
    setIsLoadingShares(true);
    try {
      const all = await vaultService.getShares();
      const filtered = all.filter((s) =>
        documentId ? s.documentId === documentId : s.folderId === folderId,
      );
      setExistingShares(filtered);
    } catch {
      // silent
    } finally {
      setIsLoadingShares(false);
    }
  };

  const handleShare = async () => {
    if (!recipientEmail.trim()) {
      toast.error('Please enter the recipient\'s email');
      return;
    }

    if (isSensitive && !sensitiveAcknowledged) {
      toast.error('Please acknowledge the sensitive document warning');
      return;
    }

    setIsSharing(true);
    try {
      await vaultService.createShare({
        sharedWithUserEmailOrId: recipientEmail.trim(),
        documentId: documentId || undefined,
        folderId: folderId || undefined,
        permission,
        canDownload,
        expiresAt: expiresAt || null,
      });
      toast.success(`Shared with ${recipientEmail}`);
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
      toast.success('Access revoked immediately');
      loadExistingShares();
      onShareUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{
          background: 'var(--glass-modal-bg)',
          backdropFilter: 'var(--glass-modal-blur)',
          border: 'var(--glass-modal-border)',
          boxShadow: 'var(--glass-modal-shadow)',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 pb-3 bg-white/95 backdrop-blur-md rounded-t-3xl border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Share2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-section-title">Share {isDocument ? 'Document' : 'Folder'}</h2>
              <p className="text-caption truncate max-w-[250px]">{targetName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Sensitive Warning */}
          {isSensitive && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-body-sm text-amber-800 font-semibold">Sensitive Document</p>
                  <p className="text-caption text-amber-600 mt-0.5">
                    This document is marked as sensitive. Only share it with people you fully trust.
                  </p>
                  <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sensitiveAcknowledged}
                      onChange={(e) => setSensitiveAcknowledged(e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-600"
                    />
                    <span className="text-body-sm font-semibold text-amber-800">
                      I understand the risks and wish to proceed
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Recipient Email */}
          <div>
            <label className="KANAKU-label flex items-center gap-1">
              <UserPlus className="w-3 h-3" /> Recipient Email
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="Enter the Kanaku user's email"
                className="KANAKU-input !pl-10"
              />
            </div>
          </div>

          {/* Permission Selection */}
          <div>
            <label className="KANAKU-label">Permission Level</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPermission('viewer')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  permission === 'viewer'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-4 h-4 text-purple-600" />
                  <span className="text-card-title">Viewer</span>
                </div>
                <p className="text-caption">Can view and preview only</p>
              </button>
              <button
                type="button"
                onClick={() => setPermission('editor')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  permission === 'editor'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Edit3 className="w-4 h-4 text-purple-600" />
                  <span className="text-card-title">Editor</span>
                </div>
                <p className="text-caption">Can view, edit metadata, and upload versions</p>
              </button>
            </div>
          </div>

          {/* Download Permission & Expiry */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
              <Download className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-body-sm font-semibold text-slate-700 flex-1">Allow Download</span>
              <input
                type="checkbox"
                checked={canDownload}
                onChange={(e) => setCanDownload(e.target.checked)}
                className="w-4 h-4 rounded accent-purple-600"
              />
            </label>
            <div>
              <label className="KANAKU-label flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Expires On
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="KANAKU-input"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Share Button */}
          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing || !recipientEmail.trim() || (isSensitive && !sensitiveAcknowledged)}
            className="KANAKU-btn KANAKU-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSharing ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Sharing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                Share Securely
              </span>
            )}
          </button>

          {/* Existing Shares */}
          {existingShares.length > 0 && (
            <div>
              <h4 className="text-label mb-2">CURRENT ACCESS</h4>
              <div className="KANAKU-card !p-0 divide-y divide-slate-100 overflow-hidden">
                {existingShares.map((share) => (
                  <div key={share.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-card-title truncate">
                        {share.sharedWithUser?.name || share.sharedWithUser?.email}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-caption uppercase font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">
                          {share.permission}
                        </span>
                        <span className="text-caption">
                          {share.canDownload ? '· Download OK' : '· View only'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(share.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors shrink-0"
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
            <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-caption text-emerald-700">
              You retain full ownership. Access can be revoked instantly at any time.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
