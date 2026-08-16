import React, { useState, useEffect } from 'react';
import { db } from '@/lib/database';
import {
  Upload, Trash2, Database, Globe,
  Bell, ExternalLink, FileText,
  Smartphone, RefreshCw, Coins, Lock, Fingerprint,
  Settings as SettingsIcon, ShieldCheck,
  Download, Check, AlertTriangle, Layers,
  LogOut, ChevronRight, User, KeyRound, BellRing,
  Sparkles, CheckCircle2, SlidersHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { Card } from '@/app/components/ui/card';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { cn } from '@/lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { resolveAvatarSelection } from '@/lib/avatar-gallery';
import { backupPINKeys, restorePINKeys } from '@/lib/encryption';
import {
  createBackup,
  downloadBackup,
  listBackups,
  purgeLegacyBackupRecords,
  restoreBackup
} from '@/lib/importExport';
import {
  type BiometricAvailability,
  disableBiometricUnlock,
  getBiometricAvailability,
  isBiometricEnabled,
  restoreBiometricOffer,
} from '@/services/biometricAuthService';
import { api, apiClient } from '@/lib/api';
import { permissionService } from '@/services/permissionService';
import { ImportDataModal } from '@/app/components/shared/ImportDataModal';
import { CustomCategoriesSection } from '@/app/components/profile/CustomCategoriesSection';
import {
  clearSmsDetectedTransactions,
  disableSmsTransactionDetection,
  enableSmsTransactionDetection,
  getSmsDetectionStatus,
  scanHistoricalSmsTransactions,
  type SmsDetectionStatus,
} from '@/services/smsTransactionDetectionService';
import { runWithCloudSyncSuppressed } from '@/lib/auth-sync-integration';

// Factory reset budget.
const CLEAR_DATA_TIMEOUT_MS = 180_000;
const CLEAR_DATA_IDEMPOTENCY_STORAGE_KEY = 'KANAKU_clear_data_idempotency_key';

type SettingsCategory = 'all' | 'general' | 'security' | 'notifications' | 'data' | 'categories' | 'sms' | 'legal';

export const Settings: React.FC = () => {
  const { currency, setCurrency, language, setLanguage, visibleFeatures, accounts, refreshData, setCurrentPage } = useApp();
  const { user, role } = useAuth();
  const { lockTimeout, setLockTimeout } = useSecurity();

  // Desktop active tab / Mobile filter category
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory>('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [backups, setBackups] = useState<Array<any>>([]);
  const [showBackups, setShowBackups] = useState(false);
  const [importHistory, setImportHistory] = useState<Array<any>>([]);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // Biometric unlock
  const [biometric, setBiometric] = useState<BiometricAvailability | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const availability = await getBiometricAvailability();
      if (!mounted) return;
      setBiometric(availability);
      setBiometricEnabled(isBiometricEnabled());
    })();
    return () => { mounted = false; };
  }, []);

  const handleBiometricToggle = async () => {
    if (biometricBusy) return;
    setBiometricBusy(true);
    try {
      if (biometricEnabled) {
        await disableBiometricUnlock();
        setBiometricEnabled(false);
        toast.success(`${biometric?.label ?? 'Biometric'} unlock turned off`);
      } else {
        restoreBiometricOffer();
        toast.info(`You'll be asked to enable ${biometric?.label ?? 'biometrics'} at your next unlock`);
      }
    } finally {
      setBiometricBusy(false);
    }
  };

  const [smsStatus, setSmsStatus] = useState<SmsDetectionStatus>({
    supported: false,
    enabled: false,
    permissionState: 'unavailable',
    historicalScanCompleted: false,
  });
  const [isSmsBusy, setIsSmsBusy] = useState(false);

  const [notifSettings, setNotifSettings] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('notificationSettings');
      return stored ? JSON.parse(stored) : {
        transactionAlerts: true,
        budgetAlerts: true,
        loanReminders: true,
        groupExpenseUpdates: true,
        goalProgressAlerts: true,
        appUpdates: true,
      };
    } catch {
      return {
        transactionAlerts: true,
        budgetAlerts: true,
        loanReminders: true,
        groupExpenseUpdates: true,
        goalProgressAlerts: true,
        appUpdates: true,
      };
    }
  });

  const toggleNotif = (key: string) => {
    const updated = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(updated);
    localStorage.setItem('notificationSettings', JSON.stringify(updated));
    toast.success(`Notification preference updated`);
  };

  useEffect(() => {
    void loadBackups();
    void loadImportHistory();
    void loadSmsStatus();
  }, []);

  const loadSmsStatus = async () => {
    const status = await getSmsDetectionStatus();
    setSmsStatus(status);
  };

  const loadBackups = async () => {
    await purgeLegacyBackupRecords();
    const backupList = await listBackups();
    setBackups(backupList);
  };

  const handleDownloadBackup = async (backupId: string) => {
    try {
      await downloadBackup(backupId);
      toast.success('Backup file downloaded');
    } catch (error) {
      console.error('Failed to download backup:', error);
      toast.error('Failed to download backup');
    }
  };

  const handleRestoreBackup = async (backupId: string, label: string) => {
    if (!confirm(`Restore ${label}? This replaces all current data on this device.`)) return;
    try {
      await restoreBackup(backupId);
      toast.success('Backup restored successfully');
      refreshData();
      window.location.reload();
    } catch (error) {
      console.error('Failed to restore backup:', error);
      toast.error('Failed to restore backup');
    }
  };

  const loadImportHistory = async () => {
    const history = await db.importHistories.orderBy('createdAt').reverse().limit(8).toArray();
    setImportHistory(history);
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    toast.info('Signing out...');

    try {
      const signOutPromise = (async () => {
        try {
          await api.auth.logout();
        } catch (e) {
          console.warn('Backend logout failed (continuing local cleanup):', e);
        }
      })();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sign out timeout')), 5000)
      );

      try {
        await Promise.race([signOutPromise, timeoutPromise]);
      } catch (e) {
        console.warn('SignOut timed out (non-blocking):', e);
      }

      try {
        permissionService.clearPermissions();
      } catch (e) {
        console.warn('Permission clear error (non-blocking):', e);
      }

      try {
        const pinBackup = backupPINKeys();
        localStorage.clear();
        sessionStorage.clear();
        restorePINKeys(pinBackup);
      } catch (e) {
        console.warn('Storage clear error (non-blocking):', e);
      }

      try {
        await Promise.race([
          Promise.all([
            db.accounts.clear(),
            db.transactions.clear(),
            db.loans.clear(),
            db.goals.clear(),
            db.investments.clear(),
            db.notifications.clear(),
            db.groupExpenses.clear(),
            db.friends.clear(),
            db.smsTransactions.clear(),
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('DB clear timeout')), 3000))
        ]);
      } catch (e) {
        console.warn('DB clear error (non-blocking):', e);
      }

      try {
        window.indexedDB.deleteDatabase('KANAKUDB');
      } catch (e) {
        console.warn('IndexedDB delete error (non-blocking):', e);
      }

      toast.success('Signed out successfully');
      window.location.href = window.location.origin + '/login?logged_out=1';
    } catch (error) {
      console.error('Sign out failed:', error);
      try {
        const pinBackup = backupPINKeys();
        localStorage.clear();
        sessionStorage.clear();
        restorePINKeys(pinBackup);
      } catch {
        // Ignore
      }
      window.location.href = window.location.origin + '/login';
    }
  };

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      await createBackup();
      await loadBackups();
      toast.success('Backup snapshot created successfully');
    } catch (error) {
      toast.error('Failed to create backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleClearAllData = async () => {
    if (confirm('This will delete ALL local & cloud transaction and account records. This action cannot be undone. Are you sure?')) {
      if (confirm('Are you ABSOLUTELY sure? This is your final warning!')) {
        try {
          let idempotencyKey = sessionStorage.getItem(CLEAR_DATA_IDEMPOTENCY_STORAGE_KEY);
          if (!idempotencyKey) {
            idempotencyKey = crypto.randomUUID();
            sessionStorage.setItem(CLEAR_DATA_IDEMPOTENCY_STORAGE_KEY, idempotencyKey);
          }

          const res = await apiClient.post<any>('/settings/clear-data', undefined, {
            timeout: CLEAR_DATA_TIMEOUT_MS,
            idempotencyKey,
            showErrorToast: false,
          });
          if (!res.success) {
            throw new Error(res.message || 'Failed to clear cloud data');
          }

          localStorage.removeItem('KANAKU_sync_queue_v3');

          await runWithCloudSyncSuppressed(async () => {
            await Promise.all([
              db.accounts.clear(),
              db.friends.clear(),
              db.transactions.clear(),
              db.loans.clear(),
              db.loanPayments.clear(),
              db.goals.clear(),
              db.goalContributions.clear(),
              db.groupExpenses.clear(),
              db.investments.clear(),
              db.notifications.clear(),
              db.categories.clear(),
              db.importHistories.clear(),
              db.smsTransactions.clear(),
              db.documents.clear(),
              db.merchantProfiles.clear(),
              db.userCategoryPreferences.clear(),
              db.expenseBills.clear(),
              db.expenseCategories.clear(),
              db.budgets.clear(),
              db.gold.clear(),
              db.groups.clear(),
              db.toDoItems.clear(),
              db.toDoLists.clear(),
              db.toDoListShares.clear(),
              db.chatMessages.clear(),
              db.chatConversations.clear(),
              db.bookingRequests.clear(),
              db.advisorAssignments.clear(),
              db.advisorSessions.clear(),
              db.financeAdvisors.clear(),
              db.logs.clear(),
              db.errorReports.clear(),
              db.backups.clear(),
            ]);
          });

          for (const key of Object.keys(localStorage)) {
            if (!['auth_token', 'refresh_token', 'accessToken', 'refreshToken', 'token', 'user'].includes(key)) {
              localStorage.removeItem(key);
            }
          }
          sessionStorage.clear();

          try {
            const channel = new BroadcastChannel('kanaku-system');
            channel.postMessage({ type: 'clear-all-data' });
          } catch {
            // Ignore
          }

          toast.success('All user records cleared. Profile identity preserved.');
          refreshData();
          window.location.reload();
        } catch (error) {
          console.error('Failed to clear all data:', error);
          const status = (error as { status?: number } | null)?.status;
          const code = (error as { code?: string } | null)?.code;
          if (status === 409) {
            toast.error('A data reset is already running. Give it a moment, then try again.');
          } else if (code === 'TIMEOUT_ERROR') {
            toast.error('The reset is taking longer than expected. Please check back in a moment.');
          } else {
            toast.error('Failed to clear all data');
          }
        }
      }
    }
  };

  const handleToggleSmsDetection = async () => {
    setIsSmsBusy(true);
    try {
      if (!smsStatus.enabled) {
        toast.info('KANAKU reads bank transaction SMS messages locally on device.');
        const result = await enableSmsTransactionDetection(30);
        setSmsStatus(result.status);

        if (!result.status.supported) {
          toast.error('SMS detection is available only on Android devices.');
          return;
        }

        if (!result.status.enabled) {
          toast.error('SMS permission is required to enable transaction detection.');
          return;
        }

        if (result.historicalScan.scanned > 0) {
          toast.success(`${result.historicalScan.created} SMS transactions detected from the last 30 days.`);
        } else {
          toast.success('SMS transaction detection enabled.');
        }
        return;
      }

      const status = await disableSmsTransactionDetection();
      setSmsStatus(status);
      toast.success('SMS transaction detection disabled.');
    } catch (error) {
      console.error('Failed to toggle SMS detection:', error);
      toast.error('Unable to update SMS transaction detection.');
    } finally {
      setIsSmsBusy(false);
    }
  };

  const handleRescanSms = async () => {
    setIsSmsBusy(true);
    try {
      const result = await scanHistoricalSmsTransactions(30, 300);
      await loadSmsStatus();
      toast.success(`${result.created} transactions detected from the last 30 days.`);
    } catch (error) {
      console.error('Historical SMS scan failed:', error);
      toast.error('Historical SMS scan failed.');
    } finally {
      setIsSmsBusy(false);
    }
  };

  const handleClearSmsData = async () => {
    await clearSmsDetectedTransactions();
    toast.success('Stored SMS detections cleared.');
  };

  // Profile info & Avatar
  const [profileData, setProfileData] = useState(() => {
    let displayName = 'User';
    let email = user?.email || 'user@KANAKU.com';
    let avatarUrl: string | null = null;

    try {
      const profileStr = typeof window !== 'undefined' ? localStorage.getItem('user_profile') : null;
      if (profileStr) {
        const parsed = JSON.parse(profileStr);
        displayName = parsed.full_name || parsed.displayName || displayName;
        email = parsed.email || email;

        const resolved = resolveAvatarSelection({
          avatarUrl: parsed.profilePhoto || parsed.avatarUrl || parsed.avatar_url,
          avatarId: parsed.avatarId || parsed.avatar_id,
        });
        avatarUrl = resolved?.url || parsed.profilePhoto || parsed.avatarUrl || null;
      }
    } catch {
      // Ignore
    }

    if (!avatarUrl && user?.user_metadata?.avatar_url) {
      avatarUrl = user.user_metadata.avatar_url;
    }

    return { displayName, email, avatarUrl };
  });

  useEffect(() => {
    const updateProfile = () => {
      let displayName = 'User';
      let email = user?.email || 'user@KANAKU.com';
      let avatarUrl: string | null = null;

      try {
        const profileStr = typeof window !== 'undefined' ? localStorage.getItem('user_profile') : null;
        if (profileStr) {
          const parsed = JSON.parse(profileStr);
          displayName = parsed.full_name || parsed.displayName || displayName;
          email = parsed.email || email;

          const resolved = resolveAvatarSelection({
            avatarUrl: parsed.profilePhoto || parsed.avatarUrl || parsed.avatar_url,
            avatarId: parsed.avatarId || parsed.avatar_id,
          });
          avatarUrl = resolved?.url || parsed.profilePhoto || parsed.avatarUrl || null;
        }
      } catch {
        // Ignore
      }

      if (!avatarUrl && user?.user_metadata?.avatar_url) {
        avatarUrl = user.user_metadata.avatar_url;
      }

      setProfileData({ displayName, email, avatarUrl });
    };

    updateProfile();
    window.addEventListener('storage', updateProfile);
    return () => window.removeEventListener('storage', updateProfile);
  }, [user]);

  const categoryTabs = [
    { id: 'all' as const, label: 'All', icon: SlidersHorizontal },
    { id: 'general' as const, label: 'Preferences', icon: Globe },
    { id: 'security' as const, label: 'Security', icon: Lock },
    { id: 'notifications' as const, label: 'Alerts', icon: Bell, hidden: visibleFeatures?.notifications === false },
    { id: 'data' as const, label: 'Data & Backup', icon: Database },
    { id: 'categories' as const, label: 'Categories', icon: Layers },
    { id: 'sms' as const, label: 'SMS Sync', icon: Smartphone },
    { id: 'legal' as const, label: 'Legal', icon: FileText },
  ].filter(t => !t.hidden);

  const shouldShowSection = (sectionKey: SettingsCategory) => {
    return selectedCategory === 'all' || selectedCategory === sectionKey;
  };

  return (
    <CenteredLayout>
      <div className="space-y-4 sm:space-y-6 pb-28 max-w-4xl mx-auto w-full px-2 sm:px-4">
        {/* Header */}
        <PageHeader
          title="Settings"
          subtitle="Preferences, security, backups & alerts"
          icon={<SettingsIcon className="text-slate-900" size={22} />}
        />

        {/* ─── Compact Native Profile Header ─────────────────────────────── */}
        <div className="rounded-2xl sm:rounded-3xl bg-slate-900 text-white p-4 sm:p-5 shadow-lg border border-slate-800 flex items-center justify-between gap-3">
          <div
            onClick={() => setCurrentPage('user-profile')}
            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 overflow-hidden shadow-md shrink-0 relative flex items-center justify-center border border-white/10">
              {profileData.avatarUrl ? (
                <img
                  src={profileData.avatarUrl}
                  alt={profileData.displayName}
                  className="w-full h-full object-cover relative z-10"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : null}
              <span className="absolute z-0 text-lg font-black text-white">
                {profileData.displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm sm:text-base font-bold text-white truncate group-hover:text-indigo-200 transition-colors">
                  {profileData.displayName}
                </p>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-white/15 text-indigo-200">
                  {role ? role.toUpperCase() : 'USER'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">{profileData.email}</p>
            </div>
            <ChevronRight size={18} className="text-slate-500 group-hover:text-white transition-colors shrink-0" />
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 active:scale-95 transition-all shrink-0"
            title="Sign Out"
            data-testid="settings-sign-out-btn"
          >
            <LogOut size={16} />
          </button>
        </div>

        {/* ─── Horizontal Filter Category Pills ──────────────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 -mx-2 px-2">
          {categoryTabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                data-testid={`settings-pill-${tab.id}`}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 border",
                  isSelected
                    ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50"
                )}
              >
                <Icon size={13} className={isSelected ? "text-indigo-400" : "text-slate-400"} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ─── Grouped Native Settings Sections ──────────────────────────── */}
        <div className="space-y-5">
          {/* 1. GENERAL PREFERENCES */}
          {shouldShowSection('general') && (
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2">
                Preferences
              </p>
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm divide-y divide-slate-100 overflow-hidden">
                {/* Language Row */}
                <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                      <Globe size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">App Language</p>
                      <p className="text-[11px] text-slate-400">Display language across views</p>
                    </div>
                  </div>
                  <select
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      toast.success(`Language set to ${e.target.value.toUpperCase()}`);
                    }}
                    className="app-select-compact shrink-0 max-w-[125px]"
                    aria-label="Select language"
                    data-testid="settings-language-select"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="it">Italiano</option>
                    <option value="pt">Português</option>
                    <option value="ja">日本語</option>
                    <option value="zh">中文</option>
                    <option value="hi">हिंदी</option>
                    <option value="ar">العربية</option>
                  </select>
                </div>

                {/* Currency Row */}
                <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                      <Coins size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">Primary Currency</p>
                      <p className="text-[11px] text-slate-400">Default money unit</p>
                    </div>
                  </div>
                  <select
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      toast.success(`Currency changed to ${e.target.value}`);
                    }}
                    className="app-select-compact shrink-0 max-w-[120px]"
                    aria-label="Select currency"
                    data-testid="settings-currency-select"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="JPY">JPY (¥)</option>
                    <option value="AUD">AUD (A$)</option>
                    <option value="CAD">CAD (C$)</option>
                    <option value="SGD">SGD (S$)</option>
                    <option value="CHF">CHF (CHF)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 2. SECURITY & ACCESS */}
          {shouldShowSection('security') && (
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2">
                Security & Access
              </p>
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm divide-y divide-slate-100 overflow-hidden">
                {/* Auto-lock */}
                <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                      <Lock size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">Auto-Lock Inactivity</p>
                      <p className="text-[11px] text-slate-400">Lock app when idle</p>
                    </div>
                  </div>
                  <select
                    value={lockTimeout}
                    onChange={(e) => {
                      const minutes = Number(e.target.value);
                      setLockTimeout(minutes);
                      toast.success(minutes === 0 ? 'Auto-lock disabled' : `Auto-lock: ${minutes}m`);
                    }}
                    className="app-select-compact shrink-0 max-w-[110px]"
                    aria-label="Select auto-lock timeout"
                    data-testid="settings-autolock-select"
                  >
                    <option value={0}>Disabled</option>
                    <option value={1}>1 min</option>
                    <option value={5}>5 min</option>
                    <option value={10}>10 min</option>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                  </select>
                </div>

                {/* Biometric */}
                {biometric?.available && (
                  <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                        <Fingerprint size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-slate-900">{biometric.label} Unlock</p>
                        <p className="text-[11px] text-slate-400">Fast biometric authorization</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={biometricEnabled}
                      onClick={() => void handleBiometricToggle()}
                      disabled={biometricBusy}
                      data-testid="settings-biometric-toggle"
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        biometricEnabled ? "bg-slate-900" : "bg-slate-200"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                          biometricEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                )}

                {/* Change PIN Link */}
                <div
                  onClick={() => setCurrentPage('user-profile')}
                  className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                      <KeyRound size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">Change PIN & Credentials</p>
                      <p className="text-[11px] text-slate-400">Security passcode settings</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-400 shrink-0" />
                </div>
              </div>
            </div>
          )}

          {/* 3. NOTIFICATIONS */}
          {shouldShowSection('notifications') && visibleFeatures?.notifications !== false && (
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2">
                Alerts & Notifications
              </p>
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm divide-y divide-slate-100 overflow-hidden">
                {[
                  { key: 'transactionAlerts', label: 'Transaction Alerts', desc: 'Real-time alert on expense/income' },
                  { key: 'budgetAlerts', label: 'Budget Threshold Warnings', desc: 'Alert when exceeding category limits' },
                  { key: 'loanReminders', label: 'Loan & EMI Due Reminders', desc: 'Upcoming repayment schedule alerts' },
                  { key: 'groupExpenseUpdates', label: 'Group Split Updates', desc: 'Shared activity & balance settlements' },
                  { key: 'goalProgressAlerts', label: 'Goal Milestone Celebrations', desc: 'Savings milestones and reminders' },
                  { key: 'appUpdates', label: 'Feature Announcements', desc: 'Updates and system notices' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{label}</p>
                      <p className="text-[11px] text-slate-400 truncate">{desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifSettings[key]}
                      onClick={() => toggleNotif(key)}
                      data-testid={`settings-notif-toggle-${key}`}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        notifSettings[key] ? "bg-slate-900" : "bg-slate-200"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                          notifSettings[key] ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. DATA & BACKUP */}
          {shouldShowSection('data') && (
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2">
                Data & Backups
              </p>
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm divide-y divide-slate-100 overflow-hidden">
                {/* Import Row */}
                <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                      <Upload size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">Import Statements</p>
                      <p className="text-[11px] text-slate-400">CSV, Excel, or JSON files</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    data-testid="settings-import-button"
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 active:scale-95 transition-all shadow-sm shrink-0"
                  >
                    Import
                  </button>
                </div>

                {/* Backup Row */}
                <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                      <Database size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">Create Snapshot Backup</p>
                      <p className="text-[11px] text-slate-400">Save full ledger data</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateBackup}
                    disabled={isBackingUp}
                    data-testid="settings-create-backup-button"
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 active:scale-95 transition-all shadow-sm shrink-0"
                  >
                    {isBackingUp ? 'Saving...' : 'Backup'}
                  </button>
                </div>

                {/* Backups List Toggle */}
                {backups.length > 0 && (
                  <div className="p-3.5 sm:p-4 space-y-3">
                    <div
                      onClick={() => setShowBackups(!showBackups)}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <p className="text-xs font-bold text-slate-700">Previous Backups ({backups.length})</p>
                      <span className="text-xs font-bold text-indigo-600">{showBackups ? 'Hide' : 'Show'}</span>
                    </div>

                    {showBackups && (
                      <div className="space-y-2 pt-1">
                        {backups.map((backup, idx) => (
                          <div key={backup.id ?? idx} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{backup.filename}</p>
                              <p className="text-[10px] text-slate-400">
                                {new Date(backup.timestamp).toLocaleDateString()} • {(backup.size / 1024).toFixed(0)} KB
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleDownloadBackup(backup.id)}
                                data-testid="settings-download-backup-button"
                                className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100"
                                title="Download"
                              >
                                <Download size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRestoreBackup(backup.id, backup.filename)}
                                data-testid="settings-restore-backup-button"
                                className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                                title="Restore"
                              >
                                <RefreshCw size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. CUSTOM CATEGORIES */}
          {shouldShowSection('categories') && (
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2">
                Category Customization
              </p>
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
                <CustomCategoriesSection />
              </div>
            </div>
          )}

          {/* 6. SMS AUTOMATION */}
          {shouldShowSection('sms') && (
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2">
                SMS Transaction Tracking
              </p>
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                      <Smartphone size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">Auto-Detect Bank SMS</p>
                      <p className="text-[11px] text-slate-400">On-device local parsing</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleSmsDetection}
                    disabled={isSmsBusy}
                    data-testid="settings-sms-toggle"
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0",
                      smsStatus.enabled ? "bg-slate-900 text-white" : "bg-teal-600 text-white shadow-sm"
                    )}
                  >
                    {isSmsBusy ? '...' : smsStatus.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleRescanSms}
                    disabled={isSmsBusy}
                    className="text-indigo-600 font-bold hover:underline"
                  >
                    Rescan last 30 days
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSmsData}
                    className="text-rose-600 font-bold hover:underline"
                  >
                    Clear cached SMS
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 7. LEGAL & POLICIES */}
          {shouldShowSection('legal') && (
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2">
                Legal & Privacy
              </p>
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm divide-y divide-slate-100 overflow-hidden">
                <div
                  onClick={() => setCurrentPage('privacy-policy')}
                  data-testid="settings-privacy-link"
                  className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <span className="text-xs sm:text-sm font-bold text-slate-800">Privacy Policy</span>
                  <ExternalLink size={14} className="text-slate-400" />
                </div>
                <div
                  onClick={() => setCurrentPage('terms')}
                  data-testid="settings-terms-link"
                  className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <span className="text-xs sm:text-sm font-bold text-slate-800">Terms & Conditions</span>
                  <ExternalLink size={14} className="text-slate-400" />
                </div>
                <div
                  onClick={() => setCurrentPage('data-deletion')}
                  className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <span className="text-xs sm:text-sm font-bold text-slate-800">Data Deletion Policy</span>
                  <ExternalLink size={14} className="text-slate-400" />
                </div>
              </div>
            </div>
          )}

          {/* 8. DANGER ZONE */}
          {(selectedCategory === 'all' || selectedCategory === 'legal') && (
            <div className="space-y-2 pt-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-rose-500 px-2">
                Danger Zone
              </p>
              <div className="bg-rose-50/60 rounded-2xl border border-rose-200/80 p-3.5 sm:p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-rose-950">Factory Reset / Clear All</p>
                  <p className="text-[11px] text-rose-700">Wipe all local and cloud ledger data</p>
                </div>
                <button
                  type="button"
                  onClick={handleClearAllData}
                  data-testid="settings-clear-data-button"
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0 shadow-sm"
                >
                  Clear Data
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Import Data Modal ─────────────────────────────────────────── */}
        {showImportModal && (
          <ImportDataModal
            accounts={accounts}
            userId={user?.id}
            onClose={() => setShowImportModal(false)}
            onImported={async () => {
              await loadImportHistory();
              await refreshData();
            }}
          />
        )}
      </div>
    </CenteredLayout>
  );
};

export default Settings;
