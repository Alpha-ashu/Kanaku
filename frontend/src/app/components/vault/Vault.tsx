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
  CheckCircle2,
  Clock,
  Files,
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
import { VaultBulkUploadModal } from './VaultBulkUploadModal';
import { VaultDocumentPreviewModal } from './VaultDocumentPreviewModal';
import { VaultSharingModal } from './VaultSharingModal';
import { VaultAuditTrailView } from './VaultAuditTrailView';
import { VaultLockOverlay } from './VaultLockOverlay';

export type VaultTab = 'overview' | 'documents' | 'shared' | 'security';

const VAULT_TABS: { id: string; label: string; mobileLabel?: string; icon?: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', mobileLabel: 'Overview', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'documents', label: 'Documents', mobileLabel: 'Docs', icon: <Folder className="w-3.5 h-3.5" /> },
  { id: 'shared', label: 'Shared', mobileLabel: 'Shared', icon: <Share2 className="w-3.5 h-3.5" /> },
  { id: 'security', label: 'Security', mobileLabel: 'Security', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
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
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
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

      // Deduplicate folders by ID and by lowercase name for root categories
      const uniqueFoldersMap = new Map<string, VaultFolder>();
      for (const f of fList) {
        const key = f.parentId ? `sub_${f.id}` : `root_${f.name.toLowerCase().trim()}`;
        if (!uniqueFoldersMap.has(key)) {
          uniqueFoldersMap.set(key, f);
        } else {
          const existing = uniqueFoldersMap.get(key)!;
          if ((f._count?.documents || 0) > (existing._count?.documents || 0)) {
            uniqueFoldersMap.set(key, f);
          }
        }
      }
      setFolders(Array.from(uniqueFoldersMap.values()));

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
    const targetFolder = folders.find((f) => f.name.toLowerCase() === categoryName.toLowerCase());
    if (targetFolder) {
      setCurrentFolderId(targetFolder.id);
    } else {
      setCurrentFolderId(null);
    }
    setActiveTab('documents');
  };

  const handleToggleLock = async () => {
    if (!lockStatus?.isLockEnabled && !lockStatus?.hasPin && !newVaultPin) {
      toast.info('Please enter a 4 to 12 digit PIN below first');
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
        updated.isLockEnabled ? 'Vault PIN Lock activated' : 'Vault Lock disabled',
      );
      if (newVaultPin) setNewVaultPin('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update Vault Lock');
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVaultPin || newVaultPin.length < 4 || newVaultPin.length > 12) {
      toast.error('PIN must be between 4 and 12 digits');
      return;
    }
    try {
      const updated = await vaultService.configureLock({
        isLockEnabled: true,
        vaultPin: newVaultPin,
        autoLockMinutes,
      });
      setLockStatus(updated);
      toast.success('Vault PIN saved and lock enabled');
      setNewVaultPin('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save PIN');
    }
  };

  const handleUpdateTimeout = async (minutes: number) => {
    setAutoLockMinutes(minutes);
    try {
      const updated = await vaultService.configureLock({
        isLockEnabled: lockStatus?.isLockEnabled ?? true,
        autoLockMinutes: minutes,
      });
      setLockStatus(updated);
      toast.success(`Auto-lock timeout set to ${minutes}m`);
    } catch {
      // ignore
    }
  };

  const storageUsedBytes = dashboardData?.totalStorageBytes || 0;
  const storageLimitBytes = dashboardData?.storageLimitBytes || 500 * 1024 * 1024;
  const storagePercent = Math.min(100, Math.round((storageUsedBytes / storageLimitBytes) * 100));

  if (isLocked) {
    return (
      <CenteredLayout
        noBottomPadding
        className="flex items-center justify-center min-h-[calc(100dvh-var(--bottom-reserved-space,76px)-60px)]"
      >
        <VaultLockOverlay
          expectedPinLength={lockStatus?.pinLength || 8}
          onUnlocked={() => {
            sessionStorage.setItem('kanaku_vault_unlocked', 'true');
            setIsLocked(false);
          }}
        />
      </CenteredLayout>
    );
  }

  return (
    <CenteredLayout>

      {/* Main Container */}
      <div className="space-y-5 pb-36 sm:pb-28">
        {/* Page Header */}
        <PageHeader
          title="Kanaku Vault"
          subtitle="Encrypted & Private Document Vault"
          icon={<FolderLock className="w-5 h-5 text-blue-600" />}
        >
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setUploadFolderId(currentFolderId);
                setIsBulkUploadModalOpen(true);
              }}
              className="h-9 sm:h-10 px-3 sm:px-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Bulk Document Upload"
            >
              <Files className="w-4 h-4 text-blue-600" />
              <span className="hidden sm:inline">Bulk Upload</span>
              <span className="sm:hidden">Bulk</span>
            </button>
            <PrimaryActionButton
              onClick={() => {
                setUploadFolderId(currentFolderId);
                setIsUploadModalOpen(true);
              }}
              icon={<Plus className="w-4 h-4" />}
            >
              Upload
            </PrimaryActionButton>
          </div>
        </PageHeader>

        {/* Storage Usage Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">
                Vault Storage
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-bold text-slate-800">
                {formatStorageSize(storageUsedBytes)}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                / {formatStorageSize(storageLimitBytes)}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 ml-1">
                {storagePercent}%
              </span>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(1.5, storagePercent)}%`,
                background: storagePercent >= 90
                  ? 'linear-gradient(90deg, #EF4444, #DC2626)'
                  : storagePercent >= 70
                  ? 'linear-gradient(90deg, #F59E0B, #D97706)'
                  : 'linear-gradient(90deg, #7C3AED, #6D28D9)',
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
            <span>500 MB Encrypted Quota</span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              AES-256 Protected
            </span>
          </div>
        </div>

        {/* Tab Navigation — Responsive Brand Segmented Tabs */}
        <div className="w-full p-1 bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-full border border-slate-200/80 shadow-xs grid grid-cols-4 gap-1">
          {VAULT_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as VaultTab)}
                className={`flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 sm:px-3 rounded-xl sm:rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer select-none ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-slate-400 shrink-0'}>
                  {tab.icon}
                </span>
                <span className="truncate hidden sm:inline">{tab.label}</span>
                <span className="truncate sm:hidden">{tab.mobileLabel || tab.label}</span>
              </button>
            );
          })}
        </div>

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
            onBulkUploadClick={(fId) => {
              setUploadFolderId(fId || null);
              setIsBulkUploadModalOpen(true);
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
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl max-w-sm">
              <button
                type="button"
                onClick={() => setSharedSubView('received')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer text-center ${
                  sharedSubView === 'received'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Shared With Me ({sharedWithMe.length})
              </button>
              <button
                type="button"
                onClick={() => setSharedSubView('sent')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer text-center ${
                  sharedSubView === 'sent'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Shared By Me ({activeShares.length})
              </button>
            </div>

            {/* Shared With Me */}
            {sharedSubView === 'received' && (
              <>
                {sharedWithMe.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center text-center py-16 px-4">
                    <Users className="w-10 h-10 text-slate-300 mb-3" />
                    <h4 className="text-sm sm:text-base font-bold text-slate-800">No shared documents yet</h4>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-sm">
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
                        <div key={share.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                  {doc ? <FolderLock className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0">
                                  <h5 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                    {doc?.title || folder?.name || 'Shared Item'}
                                  </h5>
                                  <span className="text-xs text-slate-400">
                                    From: {owner?.name || owner?.email || 'Owner'}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold capitalize shrink-0">
                                {share.permission}
                              </span>
                            </div>
                          </div>
                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              {share.canDownload ? 'Download permitted' : 'View only'}
                            </span>
                            {doc && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setPreviewDocId(doc.id)}
                                  className="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"
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
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center text-center py-16 px-4">
                    <Lock className="w-10 h-10 text-emerald-500 mb-3" />
                    <h4 className="text-sm sm:text-base font-bold text-slate-800">100% Private</h4>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-sm">
                      You have not shared any documents. Only you can access your vault contents.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-0 divide-y divide-slate-100 overflow-hidden">
                    {activeShares.map((share) => (
                      <div key={share.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-slate-900">
                              {share.sharedWithUser?.name || share.sharedWithUser?.email}
                            </span>
                            <span className="text-caption uppercase font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
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

        {/* Security Tab — Privacy Center + Vault Lock + Audit Trail */}
        {activeTab === 'security' && (
          <div className="space-y-5 max-w-xl mx-auto">
            {/* Security Assurance Badges */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="p-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-1.5">
                  <Lock className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-900">AES-256</span>
                <span className="text-[10px] text-slate-400 font-medium">Encrypted</span>
              </div>
              <div className="p-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-900">Private</span>
                <span className="text-[10px] text-slate-400 font-medium">Zero-Knowledge</span>
              </div>
              <div className="p-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-900">Immutable</span>
                <span className="text-[10px] text-slate-400 font-medium">Audit Trail</span>
              </div>
            </div>

            {/* Vault Lock Controls Card */}
            <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] overflow-hidden">
              {/* Header with Switch */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">Vault PIN Protection</h3>
                      {lockStatus?.isLockEnabled ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                      Require PIN verification before opening documents
                    </p>
                  </div>
                </div>

                {/* iOS/Kanaku-style toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={lockStatus?.isLockEnabled}
                  onClick={handleToggleLock}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    lockStatus?.isLockEnabled ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      lockStatus?.isLockEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Settings Rows */}
              <div className="divide-y divide-slate-100">
                {/* Set/Change PIN Row */}
                <div className="p-4 sm:p-5 space-y-3">
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-900">
                      {lockStatus?.hasPin ? 'Change Vault PIN' : 'Set Master Vault PIN'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {lockStatus?.hasPin
                        ? 'Enter a new 4–12 digit numeric passcode to update your PIN'
                        : 'Create a 4–12 digit numeric passcode to lock your vault'}
                    </p>
                  </div>

                  <form onSubmit={handleSavePin} className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        value={newVaultPin}
                        onChange={(e) => setNewVaultPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                        placeholder="Enter 4 to 12 digits"
                        className="w-full h-10 pl-9 pr-3.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all tracking-wider"
                        maxLength={12}
                        pattern="[0-9]*"
                        inputMode="numeric"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={newVaultPin.length < 4}
                      className="h-10 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs shadow-blue-500/20 transition-all shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {lockStatus?.hasPin ? 'Update PIN' : 'Set PIN'}
                    </button>
                  </form>
                </div>

                {/* Auto-Lock Inactivity Timeout Row */}
                <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">Auto-Lock Inactivity</p>
                      <p className="text-xs text-slate-400">Lock vault after idle timeout</p>
                    </div>
                  </div>

                  <select
                    value={autoLockMinutes}
                    onChange={(e) => handleUpdateTimeout(Number(e.target.value))}
                    className="h-9 px-3 rounded-xl border border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 shrink-0 cursor-pointer"
                  >
                    <option value={1}>1 Minute</option>
                    <option value={5}>5 Minutes (Default)</option>
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                  </select>
                </div>
              </div>
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
        onSwitchToBulk={() => {
          setIsUploadModalOpen(false);
          setIsBulkUploadModalOpen(true);
        }}
      />

      {/* Bulk Upload Document Modal */}
      <VaultBulkUploadModal
        folders={folders}
        defaultFolderId={uploadFolderId}
        isOpen={isBulkUploadModalOpen}
        onClose={() => setIsBulkUploadModalOpen(false)}
        onSuccess={loadAllVaultData}
        onFolderCreated={loadAllVaultData}
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
