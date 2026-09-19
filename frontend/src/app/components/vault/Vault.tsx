import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  FolderLock,
  LayoutDashboard,
  Folder,
  Share2,
  ShieldCheck,
  Lock,
  Plus,
  Download,
  Eye,
  KeyRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, SegmentedTabs, PrimaryActionButton } from '@/app/components/ui/PageHeader';
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

export type VaultTab = 'overview' | 'documents' | 'shared' | 'security';

const VAULT_TABS: { id: string; label: string; icon?: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'documents', label: 'Documents', icon: <Folder className="w-3.5 h-3.5" /> },
  { id: 'shared', label: 'Shared', icon: <Share2 className="w-3.5 h-3.5" /> },
  { id: 'security', label: 'Security', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
];

const formatStorageSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

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

  // Shared tab sub-view
  const [sharedSubView, setSharedSubView] = useState<'received' | 'sent'>('received');

  useEffect(() => {
    loadAllVaultData();
    checkLockStatus();
  }, []);

  const checkLockStatus = async () => {
    try {
      const status = await vaultService.getLockStatus();
      setLockStatus(status);
      if (status.isLockEnabled) {
        const sessionUnlocked = sessionStorage.getItem('kanaku_vault_unlocked');
        if (!sessionUnlocked) {
          setIsLocked(true);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadAllVaultData = useCallback(async () => {
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
      // Deduplicate documents by ID
      const uniqueDocs = Array.from(new Map(dList.map(d => [d.id, d])).values());
      setDocuments(uniqueDocs);
      setSharedWithMe(swm);
      setActiveShares(sCreated);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load Vault data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectCategory = (categoryName: string) => {
    const targetFolder = folders.find((f) => f.name === categoryName);
    if (targetFolder) {
      setCurrentFolderId(targetFolder.id);
    } else {
      setCurrentFolderId(null);
    }
    setActiveTab('documents');
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

  const storageUsedBytes = dashboardData?.totalStorageBytes || 0;
  const storageLimitBytes = dashboardData?.storageLimitBytes || 500 * 1024 * 1024;
  const storagePercent = Math.min(100, Math.round((storageUsedBytes / storageLimitBytes) * 100));

  return (
    <CenteredLayout>
      {/* Vault Lock Overlay if locked */}
      {isLocked && (
        <VaultLockOverlay
          onUnlocked={() => {
            sessionStorage.setItem('kanaku_vault_unlocked', 'true');
            setIsLocked(false);
          }}
        />
      )}

      {/* Main Container */}
      <div className="space-y-5 pb-20">
        {/* Page Header */}
        <PageHeader
          title="Kanaku Vault"
          subtitle="Private & encrypted document organizer"
          icon={<FolderLock className="w-5 h-5" />}
        >
          <PrimaryActionButton
            onClick={() => {
              setUploadFolderId(currentFolderId);
              setIsUploadModalOpen(true);
            }}
            icon={<Plus className="w-4 h-4" />}
          >
            Upload
          </PrimaryActionButton>
        </PageHeader>

        {/* Storage Usage Bar */}
        <div className="KANAKU-card !p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-caption">VAULT STORAGE</span>
              <span className="text-body-sm font-semibold">
                {formatStorageSize(storageUsedBytes)} / {formatStorageSize(storageLimitBytes)}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${storagePercent}%`,
                  background: storagePercent >= 90
                    ? 'linear-gradient(90deg, #EF4444, #DC2626)'
                    : storagePercent >= 70
                    ? 'linear-gradient(90deg, #F59E0B, #D97706)'
                    : 'linear-gradient(90deg, #7C3AED, #6D28D9)',
                }}
              />
            </div>
          </div>
          <Lock className="w-4 h-4 text-slate-400 shrink-0" />
        </div>

        {/* Tab Navigation — App standard SegmentedTabs */}
        <SegmentedTabs
          tabs={VAULT_TABS}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as VaultTab)}
        />

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <VaultDashboard
            data={dashboardData}
            isLoading={isLoading}
            onSelectCategory={handleSelectCategory}
            onPreviewDocument={(id) => setPreviewDocId(id)}
            onUploadClick={() => setIsUploadModalOpen(true)}
          />
        )}

        {activeTab === 'documents' && (
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

        {/* Shared Tab — Received & Sent sub-views */}
        {activeTab === 'shared' && (
          <div className="space-y-4">
            {/* Sub-view toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSharedSubView('received')}
                className={`px-4 py-2 rounded-full text-body-sm font-bold transition-all ${
                  sharedSubView === 'received'
                    ? 'bg-[#18181B] text-white shadow-xs'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                Shared With Me ({sharedWithMe.length})
              </button>
              <button
                type="button"
                onClick={() => setSharedSubView('sent')}
                className={`px-4 py-2 rounded-full text-body-sm font-bold transition-all ${
                  sharedSubView === 'sent'
                    ? 'bg-[#18181B] text-white shadow-xs'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                Shared By Me ({activeShares.length})
              </button>
            </div>

            {/* Shared With Me */}
            {sharedSubView === 'received' && (
              <>
                {sharedWithMe.length === 0 ? (
                  <div className="KANAKU-card !items-center !text-center !py-16">
                    <Users className="w-10 h-10 text-slate-300 mb-3" />
                    <h4 className="text-card-title text-slate-800">No shared documents yet</h4>
                    <p className="text-body-sm text-slate-400 mt-1 max-w-sm">
                      When a trusted contact shares a vault document or folder with you, it will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sharedWithMe.map((share) => {
                      const doc = share.document;
                      const folder = share.folder;
                      const owner = share.owner;
                      return (
                        <div key={share.id} className="KANAKU-card !p-4 justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                  {doc ? <FolderLock className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0">
                                  <h5 className="text-card-title truncate">
                                    {doc?.title || folder?.name || 'Shared Item'}
                                  </h5>
                                  <span className="text-caption">
                                    From: {owner?.name || owner?.email || 'Owner'}
                                  </span>
                                </div>
                              </div>
                              <span className="text-caption px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold capitalize shrink-0">
                                {share.permission}
                              </span>
                            </div>
                          </div>
                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-caption">
                              {share.canDownload ? 'Download permitted' : 'View only'}
                            </span>
                            {doc && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setPreviewDocId(doc.id)}
                                  className="px-2.5 py-1 bg-purple-50 text-purple-600 text-body-sm font-semibold rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-1"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Preview
                                </button>
                                {share.canDownload && (
                                  <button
                                    type="button"
                                    onClick={() => vaultService.downloadDocument(doc.id, doc.originalFileName)}
                                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-600"
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
              </>
            )}

            {/* Shared By Me / Active Shares */}
            {sharedSubView === 'sent' && (
              <>
                {activeShares.length === 0 ? (
                  <div className="KANAKU-card !items-center !text-center !py-16">
                    <Lock className="w-10 h-10 text-emerald-500 mb-3" />
                    <h4 className="text-card-title text-slate-800">100% Private</h4>
                    <p className="text-body-sm text-slate-400 mt-1 max-w-sm">
                      You have not shared any documents. Only you can access your vault contents.
                    </p>
                  </div>
                ) : (
                  <div className="KANAKU-card !p-0 divide-y divide-slate-100 overflow-hidden">
                    {activeShares.map((share) => (
                      <div key={share.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-card-title">
                              {share.sharedWithUser?.name || share.sharedWithUser?.email}
                            </span>
                            <span className="text-caption uppercase font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                              {share.permission}
                            </span>
                          </div>
                          <p className="text-body-sm text-slate-500 mt-1">
                            {share.document?.title ? `Document "${share.document.title}"` : `Folder "${share.folder?.name}"`}
                          </p>
                          <span className="text-caption">
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
                          className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-body-sm font-semibold transition-colors"
                        >
                          Revoke Access
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Security Tab — Audit Trail + Vault Lock */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Vault Lock Configuration */}
            <div className="KANAKU-card max-w-xl mx-auto space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-section-title">Vault Lock</h3>
                  <p className="text-body-sm text-slate-500">
                    Protect your documents behind a secondary PIN.
                  </p>
                </div>
              </div>

              <form onSubmit={handleConfigureLock} className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div>
                    <h4 className="text-card-title">PIN Lock</h4>
                    <p className="text-caption mt-0.5">
                      Require PIN verification before accessing documents.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className={`px-4 py-2 rounded-xl text-body-sm font-bold transition-colors ${
                      lockStatus?.isLockEnabled
                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-[#18181B] text-white hover:bg-black'
                    }`}
                  >
                    {lockStatus?.isLockEnabled ? 'Disable Lock' : 'Enable Lock'}
                  </button>
                </div>

                <div>
                  <label className="KANAKU-label">
                    {lockStatus?.hasPin ? 'Change Vault PIN (Optional)' : 'Set Vault PIN (4-12 digits)'}
                  </label>
                  <input
                    type="password"
                    value={newVaultPin}
                    onChange={(e) => setNewVaultPin(e.target.value)}
                    placeholder="Enter 4 to 12 digits"
                    className="KANAKU-input"
                  />
                </div>

                <div>
                  <label className="KANAKU-label">Auto-lock Timeout</label>
                  <select
                    value={autoLockMinutes}
                    onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                    className="w-full"
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
                    className="KANAKU-btn KANAKU-btn-primary w-full"
                  >
                    Save New PIN
                  </button>
                )}
              </form>
            </div>

            {/* Security Audit Trail */}
            <VaultAuditTrailView />
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
