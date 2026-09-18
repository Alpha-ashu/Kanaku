import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderLock,
  LayoutDashboard,
  Folder,
  Share2,
  Users,
  ShieldCheck,
  Lock,
  Plus,
  ArrowDownLeft,
  KeyRound,
  Download,
  Eye,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import {
  vaultService,
  VaultFolder,
  VaultDocument,
  VaultDashboardData,
  VaultShare,
  VaultLockStatus,
} from '@/services/vaultService';
import { VaultDashboard } from './VaultDashboard';
import { VaultFolderBrowser } from './VaultFolderBrowser';
import { VaultUploadModal } from './VaultUploadModal';
import { VaultDocumentPreviewModal } from './VaultDocumentPreviewModal';
import { VaultSharingModal } from './VaultSharingModal';
import { VaultAuditTrailView } from './VaultAuditTrailView';
import { VaultLockOverlay } from './VaultLockOverlay';

export type VaultTab = 'overview' | 'folders' | 'shared-with-me' | 'active-shares' | 'audit-trail' | 'security';

export const Vault: React.FC = () => {
  const [activeTab, setActiveTab] = useState<VaultTab>('overview');
  const [dashboardData, setDashboardData] = useState<VaultDashboardData | null>(null);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<VaultShare[]>([]);
  const [activeShares, setActiveShares] = useState<VaultShare[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Lock State
  const [lockStatus, setLockStatus] = useState<VaultLockStatus | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [newVaultPin, setNewVaultPin] = useState('');
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [sharingEntity, setSharingEntity] = useState<{
    docId?: string;
    docTitle?: string;
    isSensitive?: boolean;
    folderId?: string;
    folderName?: string;
  } | null>(null);

  useEffect(() => {
    loadAllVaultData();
    checkLockStatus();
  }, []);

  const checkLockStatus = async () => {
    try {
      const status = await vaultService.getLockStatus();
      setLockStatus(status);
      if (status.isLockEnabled) {
        // If locked and not unlocked in this session
        const sessionUnlocked = sessionStorage.getItem('kanakku_vault_unlocked');
        if (!sessionUnlocked) {
          setIsLocked(true);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadAllVaultData = async () => {
    setIsLoading(true);
    try {
      const [dash, fList, dList, swm, sCreated] = await Promise.all([
        vaultService.getDashboard(),
        vaultService.getFolders(),
        vaultService.getDocuments(),
        vaultService.getSharedWithMe(),
        vaultService.getShares(),
      ]);
      setDashboardData(dash);
      setFolders(fList);
      setDocuments(dList);
      setSharedWithMe(swm);
      setActiveShares(sCreated);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load Vault data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCategory = (categoryName: string) => {
    const targetFolder = folders.find((f) => f.name === categoryName);
    if (targetFolder) {
      setCurrentFolderId(targetFolder.id);
    } else {
      setCurrentFolderId(null);
    }
    setActiveTab('folders');
  };

  const handleConfigureLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newVaultPin && (newVaultPin.length < 4 || newVaultPin.length > 12)) {
      toast.error('PIN must be between 4 and 12 digits');
      return;
    }

    try {
      const updated = await vaultService.configureLock({
        isLockEnabled: !lockStatus?.isLockEnabled,
        vaultPin: newVaultPin || undefined,
        autoLockMinutes,
      });
      setLockStatus(updated);
      toast.success(
        updated.isLockEnabled ? 'Vault Lock PIN activated' : 'Vault Lock disabled',
      );
      setNewVaultPin('');
    } catch {
      toast.error('Failed to update Vault Lock');
    }
  };

  return (
    <CenteredLayout>
      {/* Vault Lock Overlay if locked */}
      {isLocked && (
        <VaultLockOverlay
          onUnlocked={() => {
            sessionStorage.setItem('kanakku_vault_unlocked', 'true');
            setIsLocked(false);
          }}
        />
      )}

      {/* Main Container */}
      <div className="space-y-6 pb-20">
        {/* Page Header with Action Button */}
        <PageHeader
          title="Kanakku Vault"
          subtitle="Your personal private digital document organizer • Encrypted storage"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUploadFolderId(currentFolderId);
                setIsUploadModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 active:scale-95 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Upload Document</span>
            </button>
          </div>
        </PageHeader>

        {/* Tab Navigation Navigation Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200/80 dark:border-slate-800 scrollbar-hide">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all flex-shrink-0 ${
              activeTab === 'overview'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('folders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all flex-shrink-0 ${
              activeTab === 'folders'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Folders & Files</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shared-with-me')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all flex-shrink-0 ${
              activeTab === 'shared-with-me'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Shared With Me ({sharedWithMe.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('active-shares')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all flex-shrink-0 ${
              activeTab === 'active-shares'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Shared By Me ({activeShares.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit-trail')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all flex-shrink-0 ${
              activeTab === 'audit-trail'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Security Audit</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all flex-shrink-0 ${
              activeTab === 'security'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-500" />
            <span>Vault Lock</span>
          </button>
        </div>

        {/* Tab Content Display */}
        {activeTab === 'overview' && (
          <VaultDashboard
            data={dashboardData}
            isLoading={isLoading}
            onSelectCategory={handleSelectCategory}
            onPreviewDocument={(id) => setPreviewDocId(id)}
            onUploadClick={() => setIsUploadModalOpen(true)}
          />
        )}

        {activeTab === 'folders' && (
          <VaultFolderBrowser
            folders={folders}
            documents={documents}
            currentFolderId={currentFolderId}
            onSelectFolder={(id) => setCurrentFolderId(id)}
            onRefresh={loadAllVaultData}
            onUploadClick={(fId) => {
              setUploadFolderId(fId || null);
              setIsUploadModalOpen(true);
            }}
            onPreviewDocument={(id) => setPreviewDocId(id)}
            onShareDocument={(d) =>
              setSharingEntity({
                docId: d.id,
                docTitle: d.title,
                isSensitive: d.isSensitive,
              })
            }
            onShareFolder={(f) =>
              setSharingEntity({
                folderId: f.id,
                folderName: f.name,
              })
            }
          />
        )}

        {/* Shared With Me Tab */}
        {activeTab === 'shared-with-me' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Documents Shared With You</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Secure access explicitly granted by other Kanakku members.
                </p>
              </div>
            </div>

            {sharedWithMe.length === 0 ? (
              <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6">
                <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">No shared documents yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  When a family member or trusted contact shares a vault document or folder with you, it will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sharedWithMe.map((share) => {
                  const doc = share.document;
                  const folder = share.folder;
                  const owner = share.owner;

                  return (
                    <div
                      key={share.id}
                      className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center font-bold text-[10px] uppercase flex-shrink-0">
                              {doc ? 'DOC' : 'DIR'}
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {doc?.title || folder?.name || 'Shared Item'}
                              </h5>
                              <span className="text-[10px] text-slate-400">
                                From: {owner?.name || owner?.email || 'Owner'}
                              </span>
                            </div>
                          </div>

                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold capitalize">
                            {share.permission}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">
                          {share.canDownload ? 'Download permitted' : 'View only'}
                        </span>

                        {doc && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewDocId(doc.id)}
                              className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> Preview
                            </button>
                            {share.canDownload && (
                              <button
                                type="button"
                                onClick={() => vaultService.downloadDocument(doc.id, doc.originalFileName)}
                                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600"
                                title="Download"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Active Shares Tab */}
        {activeTab === 'active-shares' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Active Shares Management</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  You retain complete ownership. You can revoke access immediately at any moment.
                </p>
              </div>
            </div>

            {activeShares.length === 0 ? (
              <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6">
                <Lock className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">100% Private</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  You have not shared any documents or folders. Only you can access your vault contents.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {activeShares.map((share) => (
                  <div
                    key={share.id}
                    className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {share.sharedWithUser?.name || share.sharedWithUser?.email}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
                          {share.permission}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Target: {share.document?.title ? `Document "${share.document.title}"` : `Folder "${share.folder?.name}"`}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        Granted on {new Date(share.grantedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        await vaultService.revokeShare(share.id);
                        toast.success('Access revoked immediately');
                        loadAllVaultData();
                      }}
                      className="px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors"
                    >
                      Revoke Access Immediately
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Security Audit Trail Tab */}
        {activeTab === 'audit-trail' && <VaultAuditTrailView />}

        {/* Vault Lock Security Tab */}
        {activeTab === 'security' && (
          <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Vault Lock & Security</h3>
                <p className="text-xs text-slate-500">
                  Protect your sensitive documents behind a secondary device PIN.
                </p>
              </div>
            </div>

            <form onSubmit={handleConfigureLock} className="space-y-4 pt-2">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Vault PIN Lock</h4>
                  <p className="text-[11px] text-slate-500">
                    Require PIN verification before accessing documents or folders.
                  </p>
                </div>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                    lockStatus?.isLockEnabled
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {lockStatus?.isLockEnabled ? 'Disable Lock' : 'Enable Lock'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lockStatus?.hasPin ? 'Change Vault PIN (Optional)' : 'Set Vault PIN (4-12 digits)'}
                </label>
                <input
                  type="password"
                  value={newVaultPin}
                  onChange={(e) => setNewVaultPin(e.target.value)}
                  placeholder="Enter 4 to 12 digits"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Auto-lock Inactivity Timeout
                </label>
                <select
                  value={autoLockMinutes}
                  onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value={1}>1 Minute</option>
                  <option value={5}>5 Minutes (Recommended)</option>
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                </select>
              </div>

              {newVaultPin && (
                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Save New Vault PIN
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Upload Document Modal */}
      <VaultUploadModal
        folders={folders}
        defaultFolderId={uploadFolderId}
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={loadAllVaultData}
      />

      {/* Document Preview Modal */}
      <VaultDocumentPreviewModal
        documentId={previewDocId}
        isOpen={Boolean(previewDocId)}
        onClose={() => setPreviewDocId(null)}
        onDocumentUpdated={loadAllVaultData}
      />

      {/* Sharing Modal */}
      <VaultSharingModal
        documentId={sharingEntity?.docId}
        documentTitle={sharingEntity?.docTitle}
        isSensitive={sharingEntity?.isSensitive}
        folderId={sharingEntity?.folderId}
        folderName={sharingEntity?.folderName}
        isOpen={Boolean(sharingEntity)}
        onClose={() => setSharingEntity(null)}
        onShareUpdated={loadAllVaultData}
      />
    </CenteredLayout>
  );
};
