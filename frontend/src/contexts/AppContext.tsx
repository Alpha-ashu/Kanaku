import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, Account, Transaction, Loan, Goal, Investment, GroupExpense, Friend } from '@/lib/database';
import { ingestServerNotification } from '@/lib/notifications';
import { isBoilerplateDescription } from '@/services/smartExpenseImportService';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { getVisibleFeaturesForRole, mergeVisibleFeatures, normalizeFeatures, FeatureVisibility, FeatureKey, computeSubFeatureMap, AIModuleKey, computeAICapabilityMap } from '@/lib/featureFlags';
import { type SyncStats, useSyncStats, offlineSyncEngine } from '@/lib/offline-sync-engine';
import { deduplicateLocalData, saveAccountWithBackendSync, syncUserDataFromCloud, updateAccountWithBackendSync } from '@/lib/auth-sync-integration';
import { computeDerivedBalances } from '@/lib/transactionAggregation';
import { backendSyncService } from '@/lib/backend-sync-service';
import {
  mergeStoredUserSettings,
  readStoredAppPreferences,
} from '@/lib/userPreferences';
import socketClient from '@/lib/socket-client';
import { compareByRecency } from '@/lib/dateUtils';
import { getSessionId } from '@/lib/clientErrorReporter';
import {
  relinkBillsToTransactions,
  syncBills,
  syncBudgets,
  syncCategories,
  syncRecurringTransactions,
} from '@/services/featureSyncService';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

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

/**
 * Features that belong to the person, not to their platform role.
 *
 * Every account holder — user, advisor, manager, admin — has their own money to
 * track, so these surfaces (bank accounts and wallets, the spending ledger, the
 * home summary, and moving money between one's own accounts) are never revoked
 * by a per-role toggle. The admin's global on/off switch still applies.
 */
const CORE_PERSONAL_FINANCE_FEATURES: string[] = [
  'accounts',      // bank accounts AND wallets
  'accountSetup',  // without this, "accounts" is read-only and unusable on a new account
  'transactions',
  'transfer',
  'dashboard',
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const historyStackRef = useRef<string[]>([]);
  const isFirstSettingsMountRef = useRef(true);
  const skipBackendSyncRef = useRef(false);
  const lastFetchTimeRef = useRef<number>(0);

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
    
    // Fallback: use browser history so back works after page refresh (historyStack is in-memory only)
    navigate(-1);
  }, [navigate]);

  const initialPreferences = readStoredAppPreferences();
  const [currency, setCurrency] = useState(() => initialPreferences.currency);
  const [language, setLanguage] = useState(() => initialPreferences.language);
  const prevSettingsRef = useRef({ currency, language });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [manualRefreshToken, setManualRefreshToken] = useState(0);

  // One-time migration: clear stale admin feature settings when schema changes.
  // This forces a re-fetch from the backend DB with correct role defaults.
  const FEATURE_SCHEMA_VERSION = 'v6_android_nav_fix';
  if (localStorage.getItem('feature_schema_version') !== FEATURE_SCHEMA_VERSION) {
    localStorage.removeItem('admin_global_feature_settings');
    localStorage.removeItem('visibleFeatures');
    localStorage.removeItem('admin_ai_feature_settings');
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
  const { role, user, dataReady, dataSyncing } = useAuth();
  const { isAuthenticated } = useSecurity();
  const attemptedBalanceRepairKeyRef = useRef<string | null>(null);
  const syncStats = useSyncStats();

  const applyStoredPreferences = useCallback(() => {
    const preferences = readStoredAppPreferences();
    setCurrency((current) => current === preferences.currency ? current : preferences.currency);
    setLanguage((current) => current === preferences.language ? current : preferences.language);
    return preferences;
  }, []);

  const rawAccounts = useLiveQuery(
    () => db.accounts.filter(acc => !acc.deletedAt && acc.isActive !== false).toArray(),
    [manualRefreshToken]
  ) || [];
  const friends = useLiveQuery(
    () => db.friends.filter(f => !f.deletedAt).toArray(),
    [manualRefreshToken]
  ) || [];
  const transactions = useLiveQuery(
    // Newest first. Ordering on `date` alone ties every entry made on the same
    // day (a date picker yields midnight), so fall back to createdAt/id — that
    // is what puts a just-added transaction at the top.
    async () => (await db.transactions.filter(txn => !txn.deletedAt).toArray()).sort(compareByRecency),
    [manualRefreshToken]
  ) || [];
  // Bills and transactions hydrate from the server independently, so whichever
  // lands second has to complete the link — otherwise an attachment uploaded on
  // another device shows up as a document with nothing pointing at it.
  useEffect(() => {
    if (transactions.length === 0) return;
    void relinkBillsToTransactions();
  }, [transactions.length]);

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
  // Money movements that adjust an account balance WITHOUT a `transactions`
  // row. They must feed the canonical balance engine alongside transactions.
  const goalContributions = useLiveQuery(
    () => db.goalContributions.toArray(),
    [manualRefreshToken]
  ) || [];
  const loanPayments = useLiveQuery(
    () => db.loanPayments.toArray(),
    [manualRefreshToken]
  ) || [];

  // SINGLE SOURCE OF TRUTH for every screen: derive each account's balance
  // from openingBalance + the full ledger, so Dashboard, Accounts,
  // Transactions, Analytics, Net Worth and Reports always read the identical,
  // recalculated value. Because it is recomputed (not accumulated) it can
  // never double-count an expense.
  const accounts = useMemo(() => {
    const derived = computeDerivedBalances(rawAccounts, transactions, goalContributions, loanPayments);
    return rawAccounts.map((account) => {
      if (!account.id) return account;
      const balance = derived.get(account.id);
      return balance == null || balance === account.balance ? account : { ...account, balance };
    });
  }, [rawAccounts, transactions, goalContributions, loanPayments]);

  const totalBalance = useMemo(() => (
    accounts.filter(acc => acc.isActive).reduce((sum, acc) => sum + Number(acc.balance || 0), 0)
  ), [accounts]);

  // Run V2 Investment Module database migration on startup
  useEffect(() => {
    import('@/lib/v2InvestmentMigration').then(m => m.runV2InvestmentMigration()).catch(err => {
      console.error('V2 Investment migration error:', err);
    });
  }, []);

  // One-time: repair imported transaction titles that have boilerplate descriptions.
  // Uses the stored merchant field that was saved alongside the transaction.
  useEffect(() => {
    if (transactions.length === 0) return;
    const REPAIR_KEY = 'KANAKU_description_repair_v2';
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

  // Persist the derived balances back to Dexie so the stored `balance` column
  // stays equal to the single-source-of-truth value. This keeps any code that
  // reads the DB directly — or that computes `account.balance + delta` when
  // recording investments/loans — working off the same correct number. The
  // write is idempotent (only runs when a value actually changed) and uses a
  // raw account update so it does not enqueue redundant cloud syncs.
  useEffect(() => {
    if (rawAccounts.length === 0) return;

    const derived = computeDerivedBalances(rawAccounts, transactions, goalContributions, loanPayments);
    const changed = rawAccounts.filter((account) => {
      if (!account.id) return false;
      const next = derived.get(account.id);
      return next != null && next !== account.balance;
    });
    if (changed.length === 0) return;

    const reconcileKey = changed.map((account) => `${account.id}:${derived.get(account.id!)}`).join(',');
    if (attemptedBalanceRepairKeyRef.current === reconcileKey) return;
    attemptedBalanceRepairKeyRef.current = reconcileKey;

    void db.transaction('rw', db.accounts, async () => {
      const now = new Date();
      for (const account of changed) {
        if (!account.id) continue;
        const next = derived.get(account.id);
        if (next == null) continue;
        await db.accounts.update(account.id, { balance: next, updatedAt: now });
      }
    });
  }, [rawAccounts, transactions, goalContributions, loanPayments]);

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

    const handleSettingsUpdate = (e: Event) => {
      const isExternal = (e as CustomEvent)?.detail?.isExternal;
      if (isExternal) {
        skipBackendSyncRef.current = true;
      }
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
      // NOTE: deduplicateLocalData is now called automatically at the END of syncUserDataFromCloud
      // and syncUserDataFromBackend, so we don't need to call it here explicitly
    }
  }, [applyStoredPreferences, dataReady, user?.id]);

  useEffect(() => {
    try {
      const channel = new BroadcastChannel('kanaku-system');
      channel.onmessage = (event) => {
        if (event.data?.type === 'clear-all-data') {
          console.log('Detected clear-all-data from another tab. Reloading...');
          window.location.reload();
        }
      };
      return () => {
        channel.close();
      };
    } catch (e) {
      // Ignore if BroadcastChannel is not supported
    }
  }, []);

  const refreshData = useCallback(() => {
    setManualRefreshToken(prev => prev + 1);
  }, []);

  const triggerSync = useCallback(() => {
    if (user?.id) {
      // Use backend-first sync instead of immediate frontend refresh
      void backendSyncService.syncWithBackend().then((success) => {
        if (success) {
          // Only refresh local data if backend sync was successful
          void syncUserDataFromCloud(user.id, undefined, true);
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

    if (skipBackendSyncRef.current) {
      skipBackendSyncRef.current = false;
      return;
    }

    // Only sync if currency or language has actually changed from previous values
    if (currency === prevSettingsRef.current.currency && language === prevSettingsRef.current.language) {
      return;
    }
    prevSettingsRef.current = { currency, language };

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

  // Debounce ref to prevent computeVisibleFeatures firing multiple times in rapid succession
  const computeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocalAdminSaveTimeRef = useRef<number>(0);

  // Single source of truth: role defaults + admin overrides (admin can only restrict, not grant beyond role)
  const computeVisibleFeatures = useCallback(() => {
    if (computeTimerRef.current) {
      clearTimeout(computeTimerRef.current);
    }
    computeTimerRef.current = setTimeout(() => {
      computeTimerRef.current = null;
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
        console.info('[AppContext] No admin settings — using role defaults for:', role);
        setVisibleFeaturesState(roleFeatures);
        setSubFeatures(computeSubFeatureMap(role, null));
        return;
      }

      try {
        const parsed = JSON.parse(adminSettings);

        // CRITICAL FIX: Always start from role defaults.
        // Admin settings can only DISABLE features (restrict access),
        // never enable features beyond what the role normally allows.
        // This prevents stale/corrupt admin data from blocking all navigation.
        const merged: Record<string, boolean> = { ...roleFeatures };

        // 1. Role-centric format ({ user: { accounts: true, ... }, admin: { ... } })
        if (parsed && typeof parsed === 'object') {
          const roleDict = parsed[role] || (role === 'user' && parsed.user ? parsed.user : null);
          if (roleDict && typeof roleDict === 'object' && !('enabled' in roleDict)) {
            Object.entries(roleDict).forEach(([key, value]) => {
              // Admin can only restrict (set false), not grant beyond role defaults
              if (typeof value === 'boolean') {
                // Only apply if it restricts — if role default is false, keep false
                // If admin says false, override to false (restriction wins)
                if (!value && merged[key] === true) {
                  if (role !== 'admin') {
                    merged[key] = false; // Admin disabled this feature for non-admin
                  }
                }
                // If admin says true but role says false, keep role false (role is ceiling)
              } else if (value && typeof (value as any).enabled === 'boolean' && !(value as any).enabled) {
                if (role !== 'admin') {
                  merged[key] = false; // Admin disabled this feature for non-admin
                }
              }
            });
          }
        }

        // 2. Feature-centric format ({ accounts: { enabled: true/false, roleAccess: {...} } })
        Object.entries(parsed).forEach(([key, value]: [string, any]) => {
          if (['admin', 'manager', 'advisor', 'user'].includes(key)) {
            return; // Already handled in step 1
          }

          // Only apply restrictions — never expand beyond role defaults
          const roleDefault = (merged as Record<string, boolean>)[key];

          if (typeof value === 'boolean') {
            // If admin explicitly set false and role allows it, respect the restriction
            if (!value && role !== 'admin') merged[key] = false;
            return;
          }

          // Everyone's own money, whatever job they do on the platform.
          //
          // An advisor, a manager and an admin each still have their own bank
          // accounts, wallets and spending — these are personal-finance
          // surfaces, not platform privileges, so a per-role toggle must not be
          // able to take them away. This floor already existed but applied ONLY
          // to admin, so an admin who unticked "accounts" for advisor left every
          // advisor without their wallet and no way to get it back themselves.
          //
          // The global `enabled` switch still turns a feature off for everyone
          // (that is a product decision, not an RBAC one).
          const isCorePersonalFinance = CORE_PERSONAL_FINANCE_FEATURES.includes(key);

          if (role === 'admin') {
            // Admin role: apply full RBAC logic
            let isVisible = roleFeatures[key as FeatureKey] ?? true;
            if (value?.readiness === 'deprecated') {
              isVisible = false;
            } else if (value && typeof value.enabled === 'boolean' && !value.enabled) {
              isVisible = false; // globally disabled
            } else if (value?.roleAccess && typeof value.roleAccess['admin'] === 'boolean') {
              if (isCorePersonalFinance) {
                isVisible = value.enabled !== false;
              } else {
                isVisible = value.roleAccess['admin'];
              }
            }
            merged[key] = isVisible;
          } else {
            // Non-admin roles (user, advisor, manager):
            // Check global toggle and role-specific access toggle
            let isAllowed = (roleFeatures as unknown as Record<string, boolean>)[key] ?? false;

            // 1. If globally disabled by admin, force to false
            if (typeof value?.enabled === 'boolean' && !value.enabled) {
              isAllowed = false;
            }

            // 2. If explicitly configured for this role in roleAccess, respect it
            //    — except for the core personal-finance set, which no role
            //    toggle may revoke.
            if (isCorePersonalFinance) {
              isAllowed = value?.enabled !== false;
            } else if (value?.roleAccess && typeof value.roleAccess[role] === 'boolean') {
              if (!value.roleAccess[role]) {
                isAllowed = false; // Admin disabled for this role
              } else if (value.enabled !== false && (roleFeatures as unknown as Record<string, boolean>)[key]) {
                isAllowed = true;
              }
            }

            merged[key] = isAllowed;
          }
        });

        console.info('[AppContext] Feature visibility computed for role:', role,
          '| accounts:', merged['accounts'],
          '| transactions:', merged['transactions'],
          '| dashboard:', merged['dashboard']);

        setVisibleFeaturesState(merged as unknown as FeatureVisibility);
        // CRITICAL: Also recompute sub-features whenever module visibility changes
        setSubFeatures(computeSubFeatureMap(role, parsed));
      } catch (e) {
        console.error('[AppContext] Failed to apply admin feature settings — falling back to role defaults:', e);
        setVisibleFeaturesState(roleFeatures);
        setSubFeatures(computeSubFeatureMap(role, null));
      }
    }, 40);
  }, [role]);

  useEffect(() => {
    computeVisibleFeatures();
  }, [computeVisibleFeatures]);

  // Fetch and apply both global and AI feature flags from the backend DB.
  // Exposed as a stable callback so it can be triggered both by the polling
  // interval below and by the real-time WebSocket subscriber.
  const fetchGlobalFlags = useCallback(async (scope: 'app' | 'ai' | 'all' = 'app', force = false) => {
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }
    // Throttle rapid render-triggered fetches so they don't hammer the backend —
    // but a real-time `feature_flags_updated` broadcast (force) is an authoritative
    // "flags changed now" signal and must bypass the throttle to apply immediately.
    if (!force && Date.now() - lastFetchTimeRef.current < 4000) {
      return;
    }
    lastFetchTimeRef.current = Date.now();

    try {
      const { backendService } = await import('@/lib/backend-api');

      let changed = false;

      // 1. Fetch app feature flags (drives app-wide nav/route gating). Skipped
      //    when scope === 'ai' (an AI-only broadcast).
      const flags = (scope === 'app' || scope === 'all')
        ? await backendService.getGlobalFeatureFlags()
        : null;
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
      const aiFlags = (scope === 'ai' || scope === 'all')
        ? await backendService.getAIFeatureFlags()
        : null;
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

  // Multi-lifecycle feature flag sync:
  // 1. Initial mount & auth resolution
  // 2. Real-time WebSocket 'feature_flags_updated' broadcasts
  // 3. Native Android / iOS foreground resume (appStateChange)
  // 4. Tab visibility change (browser/PWA resume)
  // 5. Network reconnect (online event)
  // 6. Periodic 20s background fallback interval
  useEffect(() => {
    if (!user?.id || !dataReady) return;

    // 1. Immediate fetch
    if (typeof document !== 'undefined' && !document.hidden) {
      void fetchGlobalFlags('all', true);
    }

    // 2. Fallback polling interval (20 seconds)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        void fetchGlobalFlags('all', false);
      }
    }, 20000);

    // 3. Tab visibility change handler
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        void fetchGlobalFlags('all', true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. Network reconnect handler
    const handleOnline = () => {
      void fetchGlobalFlags('all', true);
    };
    window.addEventListener('online', handleOnline);

    // 5. Native Android / iOS resume handler
    let nativeCleanup: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.info('[AppContext] Native app resumed to foreground — syncing feature flags');
          void fetchGlobalFlags('all', true);
        }
      }).then(handle => {
        nativeCleanup = () => handle.remove();
      }).catch(err => {
        console.warn('[AppContext] Failed to attach native appStateChange listener:', err);
      });
    }

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      nativeCleanup?.();
    };
  }, [user?.id, dataReady, fetchGlobalFlags]);

  // Real-time feature flag sync via WebSocket.
  // When the admin saves flags the backend broadcasts 'feature_flags_updated'
  // to all connected clients, which triggers an immediate re-fetch here.
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = socketClient.on('feature_flags_updated', (payload: any) => {
      // If this client just saved flags locally within 3.5s, skip redundant echo re-fetch
      if (Date.now() - lastLocalAdminSaveTimeRef.current < 3500) {
        return;
      }
      const scope = payload?.type === 'ai' ? 'ai' : 'all';
      console.log(`[AppContext] feature_flags_updated (${scope}) — re-fetching feature flags`);
      void fetchGlobalFlags(scope, true);
    });

    return unsubscribe;
  }, [user?.id, fetchGlobalFlags]);

  // Real-time data sync via WebSocket.
  // Listening for friend requests, group expenses, and todos changes.
  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;

    const unsubFriend = socketClient.on('friend_accepted', () => {
      console.log('[AppContext] friend_accepted received via WebSocket — syncing friends');
      void syncUserDataFromCloud(user.id, ['friends']);
    });

    const unsubGroup = socketClient.on('group_expense_updated', () => {
      console.log('[AppContext] group_expense_updated received via WebSocket — syncing group expenses');
      void syncUserDataFromCloud(user.id, ['group_expenses', 'accounts', 'transactions']);
    });

    const unsubTodo = socketClient.on('todo_updated', () => {
      console.log('[AppContext] todo_updated received via WebSocket — syncing todos');
      void syncUserDataFromCloud(user.id, ['to_do_lists', 'to_do_items', 'to_do_list_shares']);
    });

    // Bills are not one of the Dexie sync engine's tables — they reconcile via
    // featureSyncService.syncBills(), which otherwise runs only once per session
    // and on pull-to-refresh. Without this listener a receipt uploaded on
    // another device stayed invisible here until the app was relaunched.
    /**
     * Ignore the echo of a change this device just made.
     *
     * Not an optimisation — a correctness requirement. A local create writes its
     * Dexie row first and stamps the server id onto it only once the POST
     * returns. In that window the row has no cloudId, so a pull cannot match it
     * to the server row and inserts a duplicate instead. The server emits at the
     * moment the write commits, which is squarely inside that window. This
     * device already updates its own state through its own code path.
     */
    const isOwnEcho = (payload?: { originSessionId?: string }) =>
      Boolean(payload?.originSessionId) && payload!.originSessionId === getSessionId();

    const unsubBills = socketClient.on('bills_updated', (payload) => {
      if (isOwnEcho(payload)) return;
      console.log('[AppContext] bills_updated received via WebSocket — syncing bills');
      void syncBills().catch((err) => {
        console.warn('[AppContext] Bill sync after socket event failed', err);
      });
    });

    // Same story for the other backend-owned mirrors: featureSyncService pulls
    // them once per session, so without a live signal a budget or category
    // created on another device stayed invisible here until a reload.
    const mirrorSyncs = [
      ['budgets_updated', syncBudgets],
      ['recurring_updated', syncRecurringTransactions],
      ['categories_updated', syncCategories],
    ] as const;
    const unsubMirrors = mirrorSyncs.map(([event, sync]) =>
      socketClient.on(event, (payload) => {
        if (isOwnEcho(payload)) return;
        console.log(`[AppContext] ${event} received via WebSocket — re-syncing`);
        void Promise.resolve(sync()).catch((err) => {
          console.warn(`[AppContext] Sync after ${event} failed`, err);
        });
      }),
    );

    // Listen for real-time notification events from the backend (friend requests, todo shares, etc.)
    const unsubNotification = socketClient.on('notification', (payload: any) => {
      if (!payload?.id) return;
      // Same store-and-announce path as the poll and foreground pushes, keyed on
      // the server id so one notification never appears twice.
      void ingestServerNotification(payload).catch((err) => {
        console.warn('[AppContext] Failed to store socket notification', err);
      });
    });

    return () => {
      unsubFriend();
      unsubGroup();
      unsubTodo();
      unsubBills();
      unsubMirrors.forEach((off) => off());
      unsubNotification();
    };
  }, [user?.id, isAuthenticated]);

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
      lastLocalAdminSaveTimeRef.current = Date.now();
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
  // DENY-BY-DEFAULT: unknown sub-feature or missing context → blocked
  if (!ctx) return false;
  return ctx.subFeatures?.[moduleKey]?.[childKey] ?? false;
}

export function useAICapability(moduleKey: AIModuleKey, capabilityKey?: string): boolean {
  const ctx = useContext(AppContext);
  // DENY-BY-DEFAULT: unknown AI capability → blocked
  if (!ctx) return false;

  if (!capabilityKey) {
    return ctx.aiCapabilities?.[moduleKey]?.enabled ?? false;
  }
  return ctx.aiCapabilities?.[moduleKey]?.[capabilityKey] ?? false;
}
