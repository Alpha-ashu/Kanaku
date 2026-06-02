import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, Account, Transaction, Loan, Goal, Investment, GroupExpense, Friend } from '@/lib/database';
import { isBoilerplateDescription } from '@/services/smartExpenseImportService';
import { useAuth } from '@/contexts/AuthContext';
import { getVisibleFeaturesForRole, mergeVisibleFeatures, normalizeFeatures, FeatureVisibility, computeSubFeatureMap, AIModuleKey, computeAICapabilityMap } from '@/lib/featureFlags';
import { type SyncStats, useSyncStats, offlineSyncEngine } from '@/lib/offline-sync-engine';
import { deduplicateLocalData, saveAccountWithBackendSync, syncUserDataFromCloud, updateAccountWithBackendSync } from '@/lib/auth-sync-integration';
import { backendSyncService } from '@/lib/backend-sync-service';
import {
  mergeStoredUserSettings,
  readStoredAppPreferences,
} from '@/lib/userPreferences';
import socketClient from '@/lib/socket-client';

interface AppContextType {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  accounts: Account[];
  friends: Friend[];
  transactions: Transaction[];
  loans: Loan[];
  goals: Goal[];
  investments: Investment[];
  groupExpenses: GroupExpense[];
  totalBalance: number;
  currency: string;
  setCurrency: (currency: string) => void;
  language: string;
  setLanguage: (language: string) => void;
  refreshData: () => void;
  isOnline: boolean;
  addTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<void>;
  updateAccount: (accountId: number, updates: Partial<Account>) => Promise<void>;
  addAccount: (account: Omit<Account, 'id'>) => Promise<number>;
  visibleFeatures: FeatureVisibility;
  setVisibleFeatures: (features: FeatureVisibility | ((prev: FeatureVisibility) => FeatureVisibility)) => void;
  /** Level-2 sub-feature visibility: { module: { childKey: boolean } } */
  subFeatures: Record<string, Record<string, boolean>>;
  /** Level-3 AI capability visibility: { moduleKey: { capabilityKey: boolean } } */
  aiCapabilities: Record<string, Record<string, boolean>>;
  // Navigation
  goBack: () => void;
  historyStack: string[];
  // Offline-first sync
  syncStats: SyncStats;
  triggerSync: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const historyStackRef = useRef<string[]>([]);
  const isFirstSettingsMountRef = useRef(true);

  const currentPage = location.pathname.length > 1
    ? location.pathname.substring(1).split('?')[0].split('#')[0]
    : 'dashboard';

  const setCurrentPage = useCallback((page: string) => {
    const targetPath = page === 'dashboard' ? '/' : `/${page}`;
    if (location.pathname !== targetPath) {
      // Track history before navigating
      if (currentPage && currentPage !== page) {
        historyStackRef.current.push(currentPage);
        // Keep history manageable
        if (historyStackRef.current.length > 20) {
          historyStackRef.current.shift();
        }
      }
      navigate(targetPath);
    }
  }, [navigate, location.pathname, currentPage]);

  const goBack = useCallback(() => {
    const stack = historyStackRef.current;
    if (stack.length > 0) {
      const prevPage = stack.pop();
      if (prevPage) {
        const targetPath = prevPage === 'dashboard' ? '/' : `/${prevPage}`;
        navigate(targetPath);
        return;
      }
    }
    
    // Fallback if no history
    if (location.pathname !== '/') {
      navigate('/');
    } else {
      // If already at root, maybe we came from a sub-page that wasn't tracked
      window.history.back();
    }
  }, [navigate, location.pathname]);

  const initialPreferences = readStoredAppPreferences();
  const [currency, setCurrency] = useState(() => initialPreferences.currency);
  const [language, setLanguage] = useState(() => initialPreferences.language);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [manualRefreshToken, setManualRefreshToken] = useState(0);

  // One-time migration: clear stale admin feature settings when schema changes.
  // This forces a re-fetch from the backend DB with correct role defaults.
  const FEATURE_SCHEMA_VERSION = 'v2_role_access_fix';
  if (localStorage.getItem('feature_schema_version') !== FEATURE_SCHEMA_VERSION) {
    localStorage.removeItem('admin_global_feature_settings');
    localStorage.setItem('feature_schema_version', FEATURE_SCHEMA_VERSION);
  }

  const [visibleFeatures, setVisibleFeaturesState] = useState<FeatureVisibility>(() => {
    const stored = localStorage.getItem('visibleFeatures');
    const parsed = stored ? JSON.parse(stored) : {};
    return normalizeFeatures(parsed);
  });

  const [subFeatures, setSubFeatures] = useState<Record<string, Record<string, boolean>>>(() => {
    try {
      const raw = localStorage.getItem('admin_global_feature_settings');
      const saved = raw ? JSON.parse(raw) : null;
      return computeSubFeatureMap('user', saved);
    } catch {
      return computeSubFeatureMap('user', null);
    }
  });

  const [aiCapabilities, setAiCapabilities] = useState<Record<string, Record<string, boolean>>>(() => {
    try {
      const raw = localStorage.getItem('admin_ai_feature_settings');
      const saved = raw ? JSON.parse(raw) : null;
      return computeAICapabilityMap('user', saved);
    } catch {
      return computeAICapabilityMap('user', null);
    }
  });
  const { role, user, dataReady } = useAuth();
  const attemptedBalanceRepairKeyRef = useRef<string | null>(null);
  const syncStats = useSyncStats();

  const applyStoredPreferences = useCallback(() => {
    const preferences = readStoredAppPreferences();
    setCurrency((current) => current === preferences.currency ? current : preferences.currency);
    setLanguage((current) => current === preferences.language ? current : preferences.language);
    return preferences;
  }, []);

  const accounts = useLiveQuery(
    () => db.accounts.filter(acc => !acc.deletedAt && acc.isActive !== false).toArray(),
    [manualRefreshToken]
  ) || [];
  const friends = useLiveQuery(
    () => db.friends.filter(f => !f.deletedAt).toArray(),
    [manualRefreshToken]
  ) || [];
  const transactions = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().filter(txn => !txn.deletedAt).toArray(),
    [manualRefreshToken]
  ) || [];
  const loans = useLiveQuery(
    () => db.loans.filter(loan => !loan.deletedAt).toArray(),
    [manualRefreshToken]
  ) || [];
  const goals = useLiveQuery(
    () => db.goals.filter(goal => !goal.deletedAt).toArray(),
    [manualRefreshToken]
  ) || [];
  const investments = useLiveQuery(
    () => db.investments.filter(inv => !inv.deletedAt).toArray(),
    [manualRefreshToken]
  ) || [];
  const groupExpenses = useLiveQuery(
    () => db.groupExpenses.filter(ge => !ge.deletedAt).toArray(),
    [manualRefreshToken]
  ) || [];

  const totalBalance = useMemo(() => (
    accounts.filter(acc => acc.isActive).reduce((sum, acc) => sum + acc.balance, 0)
  ), [accounts]);

  // One-time: repair imported transaction titles that have boilerplate descriptions.
  // Uses the stored merchant field that was saved alongside the transaction.
  useEffect(() => {
    if (transactions.length === 0) return;
    const REPAIR_KEY = 'KANKU_description_repair_v2';
    if (localStorage.getItem(REPAIR_KEY)) return;

    const toRepair = transactions.filter(
      (txn) =>
        !txn.deletedAt &&
        isBoilerplateDescription(txn.description) &&
        Boolean(txn.merchant?.trim() || txn.importSource),
    );

    localStorage.setItem(REPAIR_KEY, 'done');
    if (toRepair.length === 0) return;

    void db.transaction('rw', db.transactions, async () => {
      const now = new Date();
      for (const txn of toRepair) {
        if (!txn.id) continue;
        const repaired = txn.merchant?.trim() || txn.category || 'Imported expense';
        await db.transactions.update(txn.id, { description: repaired, updatedAt: now });
      }
    });
  }, [transactions]);

  useEffect(() => {
    if (accounts.length === 0 || transactions.length === 0) return;

    const activeAccounts = accounts.filter((account) => account.isActive !== false && !account.deletedAt);
    if (activeAccounts.length === 0) return;

    const allZeroBalances = activeAccounts.every((account) => Math.abs(account.balance) < 0.000001);

    const importedNegativeNonCardAccounts = activeAccounts.filter(
      (account) => account.type !== 'card' && account.balance < 0,
    );

    const shouldAttemptNegativeImportRepair = importedNegativeNonCardAccounts.some((account) => {
      if (!account.id) return false;
      return transactions.some(
        (txn) => txn.accountId === account.id && !txn.deletedAt && Boolean(txn.importSource || txn.importedAt),
      );
    });

    if (!allZeroBalances && !shouldAttemptNegativeImportRepair) return;

    const repairKey = `${activeAccounts.map((account) => `${account.id}:${Number(account.balance).toFixed(2)}`).join(',')}::${transactions.length}`;
    if (attemptedBalanceRepairKeyRef.current === repairKey) return;
    attemptedBalanceRepairKeyRef.current = repairKey;

    const balanceByAccountId = new Map<number, number>();
    const flowByAccountId = new Map<number, { inflow: number; outflow: number }>();
    const latestSnapshotByAccountId = new Map<number, { date: Date; balance: number }>();

    for (const txn of transactions) {
      if (!txn.accountId || txn.deletedAt) continue;

      const snapshotValue = txn.importMetadata?.['Account Balance'];
      if (snapshotValue) {
        const parsedSnapshot = Number.parseFloat(
          String(snapshotValue)
            .replace(/[()]/g, '')
            .replace(/[^\d.,-]/g, '')
            .replace(/,(?=\d{3}\b)/g, ''),
        );
        const txDate = new Date(txn.date);
        if (Number.isFinite(parsedSnapshot) && !Number.isNaN(txDate.getTime())) {
          const existing = latestSnapshotByAccountId.get(txn.accountId);
          if (!existing || txDate.getTime() >= existing.date.getTime()) {
            latestSnapshotByAccountId.set(txn.accountId, {
              date: txDate,
              balance: parsedSnapshot,
            });
          }
        }
      }

      const currentFlow = flowByAccountId.get(txn.accountId) ?? { inflow: 0, outflow: 0 };

      if (txn.type === 'income') {
        balanceByAccountId.set(txn.accountId, (balanceByAccountId.get(txn.accountId) ?? 0) + txn.amount);
        currentFlow.inflow += txn.amount;
        flowByAccountId.set(txn.accountId, currentFlow);
        continue;
      }

      if (txn.type === 'expense') {
        balanceByAccountId.set(txn.accountId, (balanceByAccountId.get(txn.accountId) ?? 0) - txn.amount);
        currentFlow.outflow += txn.amount;
        flowByAccountId.set(txn.accountId, currentFlow);
        continue;
      }

      if (txn.type === 'transfer') {
        balanceByAccountId.set(txn.accountId, (balanceByAccountId.get(txn.accountId) ?? 0) - txn.amount);
        currentFlow.outflow += txn.amount;
        flowByAccountId.set(txn.accountId, currentFlow);
        if (txn.transferToAccountId) {
          balanceByAccountId.set(
            txn.transferToAccountId,
            (balanceByAccountId.get(txn.transferToAccountId) ?? 0) + txn.amount,
          );
          const destinationFlow = flowByAccountId.get(txn.transferToAccountId) ?? { inflow: 0, outflow: 0 };
          destinationFlow.inflow += txn.amount;
          flowByAccountId.set(txn.transferToAccountId, destinationFlow);
        }
      }

    }

    const hasNonZeroDerivedBalance = Array.from(balanceByAccountId.values()).some((value) => Math.abs(value) > 0.000001);
    if (!hasNonZeroDerivedBalance && !shouldAttemptNegativeImportRepair) return;

    void db.transaction('rw', db.accounts, async () => {
      const now = new Date();
      for (const account of activeAccounts) {
        if (!account.id) continue;

        const latestSnapshot = latestSnapshotByAccountId.get(account.id);
        if (latestSnapshot) {
          await db.accounts.update(account.id, {
            balance: Number(latestSnapshot.balance.toFixed(2)),
            updatedAt: now,
          });
          continue;
        }

        const derivedBalance = balanceByAccountId.get(account.id);
        if (derivedBalance == null) continue;

        const flows = flowByAccountId.get(account.id) ?? { inflow: 0, outflow: 0 };
        const hasImportedRows = transactions.some(
          (txn) => txn.accountId === account.id && !txn.deletedAt && Boolean(txn.importSource || txn.importedAt),
        );

        let repairedBalance = derivedBalance;
        if (
          hasImportedRows
          && account.type !== 'card'
          && repairedBalance < 0
          && flows.inflow <= 0
        ) {
          repairedBalance = 0;
        }

        await db.accounts.update(account.id, {
          balance: Number(repairedBalance.toFixed(2)),
          updatedAt: now,
        });
      }
    });
  }, [accounts, transactions]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleOnboardingComplete = () => {
      applyStoredPreferences();
      setManualRefreshToken(prev => prev + 1);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key
        && ['onboarding_refresh_timestamp', 'currency', 'language', 'user_settings'].includes(e.key)
      ) {
        applyStoredPreferences();
        setManualRefreshToken(prev => prev + 1);
      }
    };

    const handleSettingsUpdate = () => {
      applyStoredPreferences();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('ONBOARDING_COMPLETED', handleOnboardingComplete);
    window.addEventListener('APP_SETTINGS_UPDATED', handleSettingsUpdate);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('ONBOARDING_COMPLETED', handleOnboardingComplete);
      window.removeEventListener('APP_SETTINGS_UPDATED', handleSettingsUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [applyStoredPreferences]);

  useEffect(() => {
    if (user?.id && dataReady) {
      applyStoredPreferences();
      // Run deduplication pass to clean up any existing sync artifacts
      void deduplicateLocalData();
    }
  }, [applyStoredPreferences, dataReady, user?.id]);

  const refreshData = useCallback(() => {
    setManualRefreshToken(prev => prev + 1);
  }, []);

  const triggerSync = useCallback(() => {
    if (user?.id) {
      // Use backend-first sync instead of immediate frontend refresh
      void backendSyncService.syncWithBackend().then((success) => {
        if (success) {
          // Only refresh local data if backend sync was successful
          void syncUserDataFromCloud(user.id);
        }
      });
    }
  }, [user?.id]);

  const addTransaction = useCallback(async (transaction: Omit<Transaction, 'id'>) => {
    try {
      const account = await db.accounts.get(Number(transaction.accountId));
      if (!account) {
        throw new Error('Account not found');
      }

      let nextBalance = account.balance;
      if (transaction.type === 'income') {
        nextBalance += transaction.amount;
      } else if (transaction.type === 'expense') {
        nextBalance -= transaction.amount;
      } else if (transaction.type === 'transfer') {
        nextBalance -= transaction.amount;
      }

      const { saveTransactionAndUpdateAccountWithBackendSync } = await import('@/lib/auth-sync-integration');
      await saveTransactionAndUpdateAccountWithBackendSync(
        transaction,
        account.id!,
        nextBalance
      );
    } catch (error) {
      console.error('Failed to add transaction:', error);
      throw error;
    }
  }, []);

  const updateAccount = useCallback(async (accountId: number, updates: Partial<Account>) => {
    try {
      await updateAccountWithBackendSync(accountId, updates);
    } catch (error) {
      console.error('Failed to update account:', error);
      throw error;
    }
  }, []);

  const addAccount = useCallback(async (account: Omit<Account, 'id'>) => {
    try {
      const saved = await saveAccountWithBackendSync(account);
      return saved.id as number;
    } catch (error) {
      console.error('Failed to add account:', error);
      throw error;
    }
  }, []);

  const shouldPersistUserSettings = useCallback(() => {
    if (localStorage.getItem('user_settings')) {
      return true;
    }

    if (localStorage.getItem('user_profile')) {
      return true;
    }

    return localStorage.getItem('onboarding_completed') === 'true';
  }, []);

  // Save currency and language to localStorage
  useEffect(() => {
    localStorage.setItem('currency', currency);
    if (!shouldPersistUserSettings()) {
      return;
    }

    localStorage.setItem('user_settings', JSON.stringify(
      mergeStoredUserSettings({
        currency,
        defaultCurrency: currency,
      }),
    ));
  }, [currency, shouldPersistUserSettings]);

  useEffect(() => {
    localStorage.setItem('language', language);
    if (!shouldPersistUserSettings()) {
      return;
    }

    localStorage.setItem('user_settings', JSON.stringify(
      mergeStoredUserSettings({
        language,
      }),
    ));
  }, [language, shouldPersistUserSettings]);

  useEffect(() => {
    if (isFirstSettingsMountRef.current) {
      isFirstSettingsMountRef.current = false;
      return;
    }

    if (user?.id) {
      const syncSettingsToBackend = async () => {
        try {
          const { apiClient } = await import('@/lib/api');
          await apiClient.put('/settings', {
            currency,
            language,
          }, {
            showErrorToast: false,
          });
        } catch (err) {
          console.warn('[AppContext] Failed to sync settings to backend:', err);
        }
      };
      void syncSettingsToBackend();
    }
  }, [currency, language, user?.id]);

  // Debounce ref to prevent computeVisibleFeatures firing multiple times per tick
  const computeScheduledRef = useRef(false);

  // Single source of truth: role defaults + admin overrides (admin wins)
  const computeVisibleFeatures = useCallback(() => {
    // Deduplicate: if already scheduled for this tick, skip
    if (computeScheduledRef.current) return;
    computeScheduledRef.current = true;
    // Use queueMicrotask so all synchronous state batches settle first
    queueMicrotask(() => {
      computeScheduledRef.current = false;
      const roleFeatures = getVisibleFeaturesForRole(role, import.meta.env.MODE);
      const adminSettings = localStorage.getItem('admin_global_feature_settings');
      const adminAISettings = localStorage.getItem('admin_ai_feature_settings');

      let parsedAI = null;
      if (adminAISettings) {
        try {
          parsedAI = JSON.parse(adminAISettings);
        } catch (e) {
          console.warn('[AppContext] Failed to parse admin_ai_feature_settings:', e);
        }
      }
      setAiCapabilities(computeAICapabilityMap(role, parsedAI));

      if (!adminSettings) {
        setVisibleFeaturesState(roleFeatures);
        setSubFeatures(computeSubFeatureMap(role, null));
        return;
      }

      try {
        const parsed = JSON.parse(adminSettings);
        const merged: Record<string, boolean> = { ...roleFeatures };

        Object.entries(parsed).forEach(([key, value]: [string, any]) => {
          const readiness = value?.readiness;
          let isVisible: boolean;
          switch (readiness) {
            case 'unreleased':
              isVisible = role === 'admin';
              break;
            case 'beta':
              isVisible = role === 'admin' || role === 'advisor' || role === 'manager';
              break;
            case 'released':
              isVisible = true;
              break;
            case 'deprecated':
              isVisible = false;
              break;
            default:
              isVisible = (roleFeatures as unknown as Record<string, boolean>)[key] ?? true;
          }

          // Explicit role-specific override if present. We must ensure we safely fallback if the object exists but lacks the role key
          if (value?.roleAccess && typeof value.roleAccess[role] === 'boolean') {
            isVisible = value.roleAccess[role];
          } else if (value?.roleAccess) {
            // The object exists, but this role is missing (older saved state). Use the baseline features.
            isVisible = (roleFeatures as unknown as Record<string, boolean>)[key] ?? isVisible;
          }

          merged[key] = isVisible;
        });

        setVisibleFeaturesState(merged as unknown as FeatureVisibility);
        // CRITICAL: Also recompute sub-features whenever module visibility changes
        // This ensures feature gate toggles in admin panel immediately reflect in app
        setSubFeatures(computeSubFeatureMap(role, parsed));
      } catch (e) {
        console.error('[AppContext] Failed to apply admin feature settings:', e);
        setVisibleFeaturesState(roleFeatures);
        setSubFeatures(computeSubFeatureMap(role, null));
      }
    });
  }, [role]);

  useEffect(() => {
    computeVisibleFeatures();
  }, [computeVisibleFeatures]);

  // Fetch and apply both global and AI feature flags from the backend DB.
  // Exposed as a stable callback so it can be triggered both by the polling
  // interval below and by the real-time WebSocket subscriber.
  const fetchGlobalFlags = useCallback(async () => {
    try {
      const { backendService } = await import('@/lib/backend-api');

      let changed = false;

      // 1. Fetch normal feature flags
      const flags = await backendService.getGlobalFeatureFlags();
      if (flags && Object.keys(flags).length > 0) {
        const currentFlags = localStorage.getItem('admin_global_feature_settings');

        let isStale = false;
        if (currentFlags && role === 'admin') {
          try {
            const localFlags = JSON.parse(currentFlags);
            for (const key of Object.keys(localFlags)) {
              const localTime = new Date(localFlags[key]?.lastUpdated || 0).getTime();
              const remoteTime = new Date(flags[key]?.lastUpdated || 0).getTime();
              if (localTime > remoteTime + 1000) {
                isStale = true;
                break;
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        if (!isStale) {
          const newFlags = JSON.stringify(flags);
          if (currentFlags !== newFlags) {
            localStorage.setItem('admin_global_feature_settings', newFlags);
            changed = true;
          }
        }
      }

      // 2. Fetch AI feature flags
      const aiFlags = await backendService.getAIFeatureFlags();
      if (aiFlags && Object.keys(aiFlags).length > 0) {
        const currentAIFlags = localStorage.getItem('admin_ai_feature_settings');

        let isAIStale = false;
        if (currentAIFlags && role === 'admin') {
          try {
            const localAIFlags = JSON.parse(currentAIFlags);
            for (const key of Object.keys(localAIFlags)) {
              const localTime = new Date(localAIFlags[key]?.lastUpdated || 0).getTime();
              const remoteTime = new Date(aiFlags[key]?.lastUpdated || 0).getTime();
              if (localTime > remoteTime + 1000) {
                isAIStale = true;
                break;
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        if (!isAIStale) {
          const newAIFlags = JSON.stringify(aiFlags);
          if (currentAIFlags !== newAIFlags) {
            localStorage.setItem('admin_ai_feature_settings', newAIFlags);
            changed = true;
          }
        }
      }

      if (changed) {
        computeVisibleFeatures();
      }
    } catch (error) {
      console.warn('[AppContext] Failed to sync global feature flags from DB:', error);
    }
  }, [role, computeVisibleFeatures]);

  // Sync global feature flags from the backend on mount and every 30 s as a fallback.
  // Real-time updates come from the WebSocket subscriber below.
  useEffect(() => {
    if (!user?.id) return;

    // Fetch immediately on mount/auth
    void fetchGlobalFlags();

    // Keep polling as a fallback for missed socket events (e.g. reconnect gaps)
    const interval = setInterval(fetchGlobalFlags, 30000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, fetchGlobalFlags]);

  // Real-time feature flag sync via WebSocket.
  // When the admin saves flags the backend broadcasts 'feature_flags_updated'
  // to all connected clients, which triggers an immediate re-fetch here.
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = socketClient.on('feature_flags_updated', () => {
      console.log('[AppContext] feature_flags_updated received via WebSocket — re-fetching flags');
      void fetchGlobalFlags();
    });

    return unsubscribe;
  }, [user?.id, fetchGlobalFlags]);

  // Listen for real-time feature flag changes from admin panel (same-tab + cross-tab)
  useEffect(() => {
    let broadcastChannel: BroadcastChannel | null = null;
    let aiBroadcastChannel: BroadcastChannel | null = null;
    try {
      broadcastChannel = new BroadcastChannel('feature_settings_channel');
    } catch {
      // BroadcastChannel not supported
    }

    try {
      aiBroadcastChannel = new BroadcastChannel('ai_feature_settings_channel');
    } catch {
      // BroadcastChannel not supported
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === 'admin_global_feature_settings' ||
        e.key === 'featureFlagsOverride' ||
        e.key === 'admin_ai_feature_settings'
      ) {
        computeVisibleFeatures();
      }
    };

    const handleAdminFeatureUpdate = (e: Event) => {
      console.log('[AppContext] Admin feature update detected, recomputing visible features');
      computeVisibleFeatures();
    };

    const handleBroadcastMessage = (event: MessageEvent) => {
      if (event.data.type === 'FEATURE_UPDATE') {
        console.log('[AppContext] Feature broadcast received from another tab/session', event.data.timestamp);
        computeVisibleFeatures();
      }
    };

    const handleAIBroadcastMessage = (event: MessageEvent) => {
      if (event.data.type === 'AI_FEATURE_UPDATE') {
        console.log('[AppContext] AI Feature broadcast received from another tab/session', event.data.timestamp);
        computeVisibleFeatures();
      }
    };

    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', handleBroadcastMessage);
    }
    if (aiBroadcastChannel) {
      aiBroadcastChannel.addEventListener('message', handleAIBroadcastMessage);
    }

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('adminFeatureUpdate', handleAdminFeatureUpdate as EventListener);
    window.addEventListener('adminAIFeatureUpdate', handleAdminFeatureUpdate as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('adminFeatureUpdate', handleAdminFeatureUpdate as EventListener);
      window.removeEventListener('adminAIFeatureUpdate', handleAdminFeatureUpdate as EventListener);
      if (broadcastChannel) {
        broadcastChannel.removeEventListener('message', handleBroadcastMessage);
        broadcastChannel.close();
      }
      if (aiBroadcastChannel) {
        aiBroadcastChannel.removeEventListener('message', handleAIBroadcastMessage);
        aiBroadcastChannel.close();
      }
    };
  }, [computeVisibleFeatures]);

  // Save visible features to localStorage
  useEffect(() => {
    localStorage.setItem('visibleFeatures', JSON.stringify(visibleFeatures));
  }, [visibleFeatures]);

  const setVisibleFeatures = useCallback((features: FeatureVisibility | ((prev: FeatureVisibility) => FeatureVisibility)) => {
    // Directly update state — do NOT call computeVisibleFeatures here as it creates
    // a re-render loop: setVisibleFeatures → computeVisibleFeatures → setVisibleFeaturesState
    // → visibleFeatures change → storage effect → BroadcastChannel → computeVisibleFeatures again.
    setVisibleFeaturesState((prev) => {
      const next = typeof features === 'function' ? features(prev) : features;
      return normalizeFeatures(next);
    });
  }, []);

  const contextValue = useMemo(() => ({
    currentPage,
    setCurrentPage,
    accounts,
    friends,
    transactions,
    loans,
    goals,
    investments,
    groupExpenses,
    totalBalance,
    currency,
    setCurrency,
    language,
    setLanguage,
    refreshData,
    isOnline,
    addTransaction,
    updateAccount,
    addAccount,
    visibleFeatures,
    setVisibleFeatures,
    subFeatures,
    aiCapabilities,
    goBack,
    historyStack: historyStackRef.current,
    syncStats,
    triggerSync,
  }), [
    currentPage,
    setCurrentPage,
    accounts,
    friends,
    transactions,
    loans,
    goals,
    investments,
    groupExpenses,
    totalBalance,
    currency,
    setCurrency,
    language,
    setLanguage,
    refreshData,
    isOnline,
    addTransaction,
    updateAccount,
    addAccount,
    visibleFeatures,
    setVisibleFeatures,
    subFeatures,
    aiCapabilities,
    goBack,
    syncStats,
    triggerSync,
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context !== undefined) return context;

  if (import.meta.env.DEV) {
    console.warn('useApp called without AppProvider; returning fallback context.');
    return {
      currentPage: 'dashboard',
      setCurrentPage: () => { },
      accounts: [],
      friends: [],
      transactions: [],
      loans: [],
      goals: [],
      investments: [],
      groupExpenses: [],
      totalBalance: 0,
      currency: 'INR',
      setCurrency: () => { },
      language: 'en',
      setLanguage: () => { },
      refreshData: () => { },
      isOnline: true,
      addTransaction: async () => { },
      updateAccount: async () => { },
      addAccount: async () => 0,
      visibleFeatures: getVisibleFeaturesForRole('user', import.meta.env.MODE),
      setVisibleFeatures: () => { },
      subFeatures: computeSubFeatureMap('user', null),
      aiCapabilities: computeAICapabilityMap('user', null),
      goBack: () => { },
      historyStack: [],
      syncStats: { pendingCount: 0, lastSyncedAt: null, status: 'idle' as const },
      triggerSync: () => { },
    } as AppContextType;
  }

  throw new Error('useApp must be used within an AppProvider');
};

export const useOptionalApp = () => useContext(AppContext);

/**
 * Hook: returns whether a specific sub-feature is enabled for the current user.
 *
 * @param moduleKey  - e.g. 'accounts'
 * @param childKey   - e.g. 'deleteAccount'
 *
 * @example
 *   const canDelete = useSubFeature('accounts', 'deleteAccount');
 *   // Use in JSX: {canDelete && <DeleteButton />}
 */
export function useSubFeature(moduleKey: string, childKey: string): boolean {
  const ctx = useContext(AppContext);
  if (!ctx) return true; // outside provider → allow (fail-open)
  return ctx.subFeatures?.[moduleKey]?.[childKey] ?? true;
}

export function useAICapability(moduleKey: AIModuleKey, capabilityKey?: string): boolean {
  const ctx = useContext(AppContext);
  if (!ctx) return true; // outside provider → allow (fail-open)
  
  if (!capabilityKey) {
    // Check master toggle
    return ctx.aiCapabilities?.[moduleKey]?.enabled ?? true;
  }
  return ctx.aiCapabilities?.[moduleKey]?.[capabilityKey] ?? true;
}
