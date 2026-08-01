import React, { useEffect, useLayoutEffect, useState, Suspense, lazy, useRef } from 'react';
import { AppProvider, useOptionalApp } from '@/contexts/AppContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SecurityProvider, useSecurity } from '@/contexts/SecurityContext';
import { useScrollToTopOnPageChange } from '@/hooks/useScrollToTop';
import { Toaster } from 'sonner';
import { initializeNotifications } from '@/lib/notifications';
import { registerServiceWorker, setupPWAInstallPrompt, setupNetworkListener } from '@/lib/pwa';
import { HealthChecker } from '@/lib/health';
import { toast } from 'sonner';
import { initializeSmsTransactionDetection } from '@/services/smsTransactionDetectionService';
import { initializePushNotifications } from '@/services/pushNotificationService';
import { canAccessPage } from '@/lib/featureFlags';
import { ADMIN_UI_ENABLED } from '@/config/platform';

// Build-time boolean injected by Vite `define` (vite.config.ts; vitest provides
// it too). Referenced RAW at the lazy() sites below so esbuild folds
// `false ? lazy(() => import(...)) : null` and physically drops the Admin/Manager
// chunks from a user-surface (VITE_APP_SURFACE=user) build.
declare const __ADMIN_UI_ENABLED__: boolean;
import { syncUserDataFromCloud, SyncedTableName } from '@/lib/auth-sync-integration';
import { syncBudgets, syncRecurringTransactions } from '@/services/featureSyncService';


//  Shell components (always visible - eager load) 
import { Sidebar } from '@/app/components/core/Sidebar';
import { TopBar } from '@/app/components/ui/TopBar';
import { BottomNav } from '@/app/components/core/BottomNav';
import { QuickActionModal } from '@/app/components/shared/QuickActionModal';
import { PWAInstallPrompt } from '@/app/components/shared/PWAInstallPrompt';
import { LimitedModeBanner } from '@/app/components/shared/LimitedModeBanner';
import { OfflineBadge } from '@/app/components/shared/OfflineBadge';
import { OfflineBanner } from '@/app/components/shared/OfflineBanner';

//  Auth / Security (shown before app shell - eager load) 
import { AuthFlow } from '@/app/components/auth/AuthFlow';
import { PINAuth } from '@/app/components/auth/PINAuth';
import { PINSetup } from '@/app/components/auth/PINSetup';
import { LandingPage } from '@/app/components/marketing/LandingPage';
import { AboutPage } from '@/app/components/marketing/AboutPage';
import { PricingPage } from '@/app/components/marketing/PricingPage';
import { ContactPage } from '@/app/components/marketing/ContactPage';
import { PrivacyPolicy } from '@/app/components/marketing/PrivacyPolicy';
import { Terms } from '@/app/components/marketing/Terms';
import { DataDeletion } from '@/app/components/marketing/DataDeletion';

//  Page components - lazy loaded, each gets its own async chunk 
const Dashboard = lazy(() => import('@/app/components/core/Dashboard').then(m => ({ default: m.Dashboard })));
const Accounts = lazy(() => import('@/app/components/core/Accounts').then(m => ({ default: m.Accounts })));
const Transactions = lazy(() => import('@/app/components/core/Transactions').then(m => ({ default: m.Transactions })));
const Loans = lazy(() => import('@/app/components/loans/Loans').then(m => ({ default: m.Loans })));
const Goals = lazy(() => import('@/app/components/goals/Goals').then(m => ({ default: m.Goals })));
const GoalDetail = lazy(() => import('@/app/components/goals/GoalDetail').then(m => ({ default: m.GoalDetail })));
const Groups = lazy(() => import('@/app/components/groups/Groups').then(m => ({ default: m.Groups })));
const Investments = lazy(() => import('@/app/components/investments/Investments').then(m => ({ default: m.Investments })));
const Reports = lazy(() => import('@/app/components/features/Reports').then(m => ({ default: m.Reports })));
const Settings = lazy(() => import('@/app/components/profile/Settings').then(m => ({ default: m.Settings })));
const Calendar = lazy(() => import('@/app/components/features/Calendar').then(m => ({ default: m.Calendar })));
const VoiceInput = lazy(() => import('@/app/components/features/VoiceInput').then(m => ({ default: m.VoiceInput })));
const VoiceReview = lazy(() => import('@/app/components/features/VoiceReview').then(m => ({ default: m.VoiceReview })));
const AuthCallback = lazy(() => import('@/app/components/auth/AuthCallback').then(m => ({ default: m.AuthCallback })));
// Admin/Manager platform pages: on a VITE_APP_SURFACE=user build these resolve
// to null so the chunks are dropped from the customer bundle entirely
// (ADMIN_UI_ENABLED is a build-time constant — see src/config/platform.ts).
const AdminDashboard = __ADMIN_UI_ENABLED__ ? lazy(() => import('@/app/components/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard }))) : null;
const AdminAIDashboard = __ADMIN_UI_ENABLED__ ? lazy(() => import('@/app/components/admin/AdminAIDashboard').then(m => ({ default: m.AdminAIDashboard }))) : null;
const SyncMonitorDashboard = __ADMIN_UI_ENABLED__ ? lazy(() => import('@/app/components/admin/SyncMonitorDashboard').then(m => ({ default: m.SyncMonitorDashboard }))) : null;
const AdvisorWorkspace = lazy(() => import('@/app/components/advisor/AdvisorWorkspace').then(m => ({ default: m.AdvisorWorkspace })));
const AdminFeaturePanel = __ADMIN_UI_ENABLED__ ? lazy(() => import('@/app/components/admin/AdminFeaturePanel').then(m => ({ default: m.AdminFeaturePanel }))) : null;
const AdvisorPanel = lazy(() => import('@/app/components/advisor/AdvisorPanel').then(m => ({ default: m.AdvisorPanel })));
const BookAdvisor = lazy(() => import('@/app/components/advisor/BookAdvisor').then(m => ({ default: m.BookAdvisor })));
const AdminAdvisorVerification = __ADMIN_UI_ENABLED__ ? lazy(() => import('@/app/components/admin/AdminAdvisorVerification').then(m => ({ default: m.AdminAdvisorVerification }))) : null;
const PayEMI = lazy(() => import('@/app/components/transactions/PayEMI').then(m => ({ default: m.PayEMI })));
const Diagnostics = lazy(() => import('@/app/components/shared/Diagnostics').then(m => ({ default: m.Diagnostics })));
const ManagerAdvisorVerification = __ADMIN_UI_ENABLED__ ? lazy(() => import('@/app/components/manager/ManagerAdvisorVerification').then(m => ({ default: m.ManagerAdvisorVerification }))) : null;
const ToDoLists = lazy(() => import('@/app/components/features/ToDoLists').then(m => ({ default: m.ToDoLists })));
const ToDoListDetail = lazy(() => import('@/app/components/features/ToDoListDetail').then(m => ({ default: m.ToDoListDetail })));
const ToDoListShare = lazy(() => import('@/app/components/features/ToDoListShare').then(m => ({ default: m.ToDoListShare })));
const AddAccount = lazy(() => import('@/app/components/core/AddAccount').then(m => ({ default: m.AddAccount })));
const EditAccount = lazy(() => import('@/app/components/core/EditAccount').then(m => ({ default: m.EditAccount })));
const AddTransaction = lazy(() => import('@/app/components/transactions/AddTransaction').then(m => ({ default: m.AddTransaction })));
const AddGoal = lazy(() => import('@/app/components/goals/AddGoal').then(m => ({ default: m.AddGoal })));
const AddGroup = lazy(() => import('@/app/components/groups/AddGroup').then(m => ({ default: m.AddGroup })));
const AddInvestment = lazy(() => import('@/app/components/investments/AddInvestment').then(m => ({ default: m.AddInvestment })));
const EditInvestment = lazy(() => import('@/app/components/investments/EditInvestment').then(m => ({ default: m.EditInvestment })));
const AddGold = lazy(() => import('@/app/components/investments/AddGold').then(m => ({ default: m.AddGold })));
const AddFriends = lazy(() => import('@/app/components/groups/AddFriends').then(m => ({ default: m.AddFriends })));
const FriendsList = lazy(() => import('@/app/components/groups/FriendsList').then(m => ({ default: m.FriendsList })));
const FriendProfile = lazy(() => import('@/app/components/groups/FriendProfile').then(m => ({ default: m.FriendProfile })));
const UserProfile = lazy(() => import('@/app/components/profile/UserProfile').then(m => ({ default: m.UserProfile })));
const Notifications = lazy(() => import('@/app/components/profile/Notifications').then(m => ({ default: m.Notifications })));
const SimpleAutoTest = lazy(() => import('@/app/components/ui/SimpleAutoTest').then(m => ({ default: m.SimpleAutoTest })));
const NewUserOnboarding = lazy(() => import('@/app/components/auth/onboarding/NewUserOnboarding').then(m => ({ default: m.NewUserOnboarding })));
const AppFeatureSlides = lazy(() => import('@/app/components/auth/onboarding/AppFeatureSlides').then(m => ({ default: m.AppFeatureSlides })));

// Dynamic features pages
const AIInsightsPage = lazy(() => import('@/app/components/features/AIInsightsPage').then(m => ({ default: m.AIInsightsPage })));
const RecurringTransactions = lazy(() => import('@/app/components/features/RecurringTransactions').then(m => ({ default: m.RecurringTransactions })));
const BudgetAlertsPage = lazy(() => import('@/app/components/features/BudgetAlertsPage').then(m => ({ default: m.BudgetAlertsPage })));
const ClientManagementPage = lazy(() => import('@/app/components/features/ClientManagementPage').then(m => ({ default: m.ClientManagementPage })));
const ReceiptScannerPage = lazy(() => import('@/app/components/features/ReceiptScannerPage').then(m => ({ default: m.ReceiptScannerPage })));

//  Capacitor (native only)
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { registerNativeDeepLinks } from '@/lib/nativeDeepLinks';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/database';

//  Minimal page-transition spinner shown while a lazy chunk loads.
//  The spinner is delayed: for fast (cached/prefetched) navigations the chunk
//  resolves before the timer fires, so nothing is shown and the previous page
//  transitions straight into the next one — no spinner "flash" between pages.
//  A spinner only appears when loading genuinely takes a moment.
const PageLoader: React.FC<{ delayMs?: number }> = ({ delayMs = 220 }) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!show) return null;

  return (
    <div className="flex items-center justify-center h-48 w-full pt-12">
      <div className="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
    </div>
  );
};

class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; attemptCount: number }
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, attemptCount: 0 };
  }

  static getDerivedStateFromError(error: Error) {
    // Must return a plain state object (not a function) per React lifecycle rules
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log full technical details for developers  never show to users
    console.error('[PageErrorBoundary] Caught render error:', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      attemptCount: this.state.attemptCount,
    });

    // Increment attempt counter on each catch
    const nextAttemptCount = this.state.attemptCount + 1;
    this.setState({ attemptCount: nextAttemptCount });

    // Auto-retry on chunk load failures or module errors (common after service worker updates)
    const isModuleError = error.message.includes('Failed to fetch dynamically imported module') ||
                         error.message.includes('Expected a JavaScript-or-Wasm module script') ||
                         error.message.includes('Failed to import');

    if (isModuleError && nextAttemptCount <= 2) {
      console.warn(`[PageErrorBoundary] Auto-retrying after module load failure (attempt ${nextAttemptCount})...`);
      this.retryTimer = setTimeout(() => {
        this.setState({ error: null });
      }, 500);
    } else if (isModuleError && nextAttemptCount > 2) {
      // All retries exhausted for a stale-deployment chunk 404 — force reload to pick up latest build
      console.warn('[PageErrorBoundary] All retries failed for module load; forcing page reload...');
      window.location.reload();
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
  }

  render() {
    if (this.state.error) {
      const isModuleError = this.state.error.message.includes('Failed to fetch dynamically imported module') ||
                           this.state.error.message.includes('Expected a JavaScript-or-Wasm module script') ||
                           this.state.error.message.includes('Failed to import');

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
          <div className="text-4xl"></div>
          <h2 className="text-lg font-bold text-gray-900">
            {isModuleError ? 'Loading page...' : 'Something went wrong'}
          </h2>
          <p className="text-sm text-gray-500 max-w-sm">
            {isModuleError 
              ? 'The page is loading. Please wait a moment.'
              : 'We hit an unexpected problem loading this page. Please try again.'}
          </p>
          {isModuleError ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
              <span className="text-sm text-gray-600">
                {this.state.attemptCount <= 2 ? 'Auto-retrying...' : 'Reloading page...'}
              </span>
            </div>
          ) : (
            <button data-testid="app-try-again"
              onClick={() => {
                this.setState({ error: null, attemptCount: 0 });
              }}
              className="px-4 py-2 bg-black text-white rounded-xl text-sm font-medium"
            >
              Try again
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const PAGE_REQUIRED_TABLES: Record<string, SyncedTableName[]> = {
  dashboard: ['accounts', 'transactions'],
  accounts: ['accounts'],
  'add-account': ['accounts'],
  'edit-account': ['accounts'],
  transactions: ['transactions', 'accounts'],
  'add-transaction': ['transactions', 'accounts'],
  transfer: ['transactions', 'accounts'],
  'voice-input': ['transactions', 'accounts'],
  'receipt-scanner': ['transactions', 'accounts'],
  'pay-emi': ['transactions', 'accounts', 'loans'],
  'recurring-transactions': ['transactions', 'accounts'],
  loans: ['loans', 'accounts', 'friends'],
  goals: ['goals'],
  'goal-detail': ['goals'],
  'add-goal': ['goals'],
  groups: ['group_expenses', 'friends', 'accounts'],
  'add-group': ['group_expenses', 'friends', 'accounts'],
  'add-friends': ['friends'],
  friends: ['friends'],
  'friend-profile': ['friends'],
  investments: ['investments', 'accounts'],
  'add-investment': ['investments', 'accounts'],
  'add-gold': ['investments', 'accounts'],
  'edit-investment': ['investments', 'accounts'],
  'todo-lists': ['to_do_lists', 'to_do_items', 'to_do_list_shares'],
  'todo-list-detail': ['to_do_lists', 'to_do_items', 'to_do_list_shares'],
  'todo-list-share': ['to_do_lists', 'to_do_items', 'to_do_list_shares'],
  reports: ['transactions', 'accounts'],
  calendar: ['transactions', 'accounts'],
  'ai-insights': ['transactions', 'accounts', 'goals', 'investments'],
  'budget-alerts': ['accounts', 'transactions'],
};

type PublicPage = 'landing' | 'about' | 'pricing' | 'contact' | 'privacy' | 'privacy-policy' | 'terms' | 'data-deletion' | 'account-deletion' | 'delete-account';

const getInitialPublicPage = (): PublicPage => {
  const path = window.location.pathname.substring(1).split('?')[0].split('#')[0];
  if (['privacy', 'privacy-policy', 'terms', 'data-deletion', 'account-deletion', 'delete-account', 'about', 'pricing', 'contact'].includes(path)) {
    return path as PublicPage;
  }
  return 'landing';
};

const AppContent: React.FC = () => {
  const appContext = useOptionalApp();
  const { user, role, loading: authLoading, dataReady, dataSyncing, dataSyncError, triggerDataSync } = useAuth();
  const { isAuthenticated, setAuthenticated } = useSecurity();

  // All hooks must be called before any conditional early returns (React Rules of Hooks)
  const currentPage = appContext?.currentPage ?? 'dashboard';
  const [isInitialized, setIsInitialized] = useState(false);
  const [showQuickAction, setShowQuickAction] = useState(false);

  // Is the local store still empty? Reactive, so it flips to false the moment the first
  // accounts row lands and the content area swaps from the loader to the real page.
  // `undefined` while the very first count is in flight — treated as "not empty" so a
  // returning user with a warm cache never sees a loader.
  const localAccountCount = useLiveQuery(() => db.accounts.count(), [], undefined);
  const hasNoLocalData = localAccountCount === 0;

  // Auto scroll to top when page changes
  useScrollToTopOnPageChange(currentPage);

  // Landing page: shown only to confirmed unauthenticated visitors (set via effect
  // so we never show it during the async auth-loading window)
  const [showLanding, setShowLanding] = useState(true);
  const [publicPage, setPublicPage] = useState<PublicPage>(getInitialPublicPage);
  const [authInitialStep, setAuthInitialStep] = useState<'welcome' | 'signin' | 'signup'>('welcome');
  const [criticalPagesPrefetched, setCriticalPagesPrefetched] = useState(false);
  const hasModuleReloaded = useRef(false);
  // Live-state refs for the native hardware-back handler (registered once, so it
  // must read current values via refs rather than a stale closure).
  const lastBackPressRef = useRef(0);
  const currentPageRef = useRef<string>('dashboard');
  const goBackRef = useRef<(() => void) | undefined>(undefined);
  const closeOverlaysRef = useRef<() => boolean>(() => false);
  // Same reasoning for the deep-link listener: registered once at startup, so it
  // navigates through a ref rather than capturing the first render's setter.
  const setCurrentPageRef = useRef<((page: string) => void) | undefined>(undefined);
  const nativeDeepLinkCleanupRef = useRef<(() => void) | undefined>(undefined);
  const lastStateLogged = useRef<string | null>(null);
  const hasTriggeredSyncRef = useRef<string | null>(null);
  const hasSyncedFeatureTablesRef = useRef<string | null>(null);
  const hasAdminRedirectedRef = useRef(false);
  const [quickActionKey, setQuickActionKey] = useState(0);
  const [slidesViewed, setSlidesViewed] = useState(() => localStorage.getItem('onboarding_slides_viewed') === 'true');

  const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
    return localStorage.getItem('onboarding_completed') === 'true' ||
           user?.user_metadata?.onboarding_completed === true ||
           !!(localStorage.getItem('user_profile') || localStorage.getItem('user_settings'));
  });

  useEffect(() => {
    const hasLocalProfile = !!(localStorage.getItem('user_profile') || localStorage.getItem('user_settings'));
    setOnboardingCompleted(
      localStorage.getItem('onboarding_completed') === 'true' ||
      user?.user_metadata?.onboarding_completed === true ||
      hasLocalProfile
    );
  }, [user]);

  useEffect(() => {
    const handleOnboardingCompleted = () => {
      setOnboardingCompleted(true);
      // `onboarding_slides_viewed` is plain (unscoped) localStorage, not tied to
      // a specific account. If a different user previously completed onboarding
      // on this same browser, this flag would already be "true" and every
      // subsequent new registration would silently skip the App Feature Slides.
      // Force it false whenever a fresh onboarding just completed.
      localStorage.removeItem('onboarding_slides_viewed');
      setSlidesViewed(false);
    };
    window.addEventListener('ONBOARDING_COMPLETED', handleOnboardingCompleted);
    return () => {
      window.removeEventListener('ONBOARDING_COMPLETED', handleOnboardingCompleted);
    };
  }, []);

  if (!appContext) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-pink-500 to-rose-600">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p className="text-white text-base font-medium">Loading KANAKU...</p>
        </div>
      </div>
    );
  }

  const { setCurrentPage, visibleFeatures, aiCapabilities } = appContext;

  // Keep the native back handler's refs pointing at the latest values. Assigning
  // refs during render is safe and gives the once-registered listener current
  // state without re-registering it.
  currentPageRef.current = currentPage;
  goBackRef.current = appContext.goBack;
  setCurrentPageRef.current = setCurrentPage;
  closeOverlaysRef.current = () => {
    if (showQuickAction) { setShowQuickAction(false); return true; }
    return false;
  };


  // Show landing page only once we KNOW the user is not signed in
  useEffect(() => {
    if (!authLoading && !user) {
      setShowLanding((prev) => (prev ? prev : true));
    }
  }, [authLoading, user]);

  // Static initialization (runs once)
  useEffect(() => {
    console.log('[KANAKU Startup] App Started');
    const hasProfileDataVal = localStorage.getItem('user_profile') || localStorage.getItem('user_settings');
    console.log('[KANAKU Startup] Cache Restored:', {
      hasProfile: !!localStorage.getItem('user_profile'),
      hasSettings: !!localStorage.getItem('user_settings'),
      hasProfileData: !!hasProfileDataVal,
    });

    if (Capacitor.isNativePlatform()) {
      setupNativeFeatures();
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add-expense') {
      setShowQuickAction(true);
    }

    registerServiceWorker();
    setupPWAInstallPrompt();

    return () => {
      nativeDeepLinkCleanupRef.current?.();
      nativeDeepLinkCleanupRef.current = undefined;
    };
  }, []);

  // Recover from stale cached chunks (service worker or CDN mismatch)
  useEffect(() => {
    const handleModuleFailure = async () => {
      if (hasModuleReloaded.current) return;
      hasModuleReloaded.current = true;

      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.warn('Failed to clear SW cache after module error:', error);
      } finally {
        window.location.reload();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = String(event.reason?.message || event.reason || '');
      const isModuleLoadFailure =
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('Expected a JavaScript-or-Wasm module script');

      // Only reload for genuine Vite chunk-load failures, NOT for API/network errors
      // (API errors from 503/offline should be handled by the sync layer, not a page reload)
      const isApiError =
        event.reason?.name === 'APIError' ||
        event.reason?.code === 'DATABASE_UNAVAILABLE' ||
        event.reason?.code === 'NETWORK_ERROR' ||
        event.reason?.status >= 400;

      if (isModuleLoadFailure && !isApiError) {
        handleModuleFailure();
      }
    };

    const handleError = (event: ErrorEvent) => {
      const message = String(event.message || '');
      if (message.includes('Failed to fetch dynamically imported module') ||
        message.includes('Expected a JavaScript-or-Wasm module script')) {
        handleModuleFailure();
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  // User-dependent initialization
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token') && hash.includes('type=')) {
      setCurrentPage('auth-callback');
    }

    if (user) {
      // Render ASAP; run heavy init work in the background.
      // NOTE: notifications + SMS detection fetch user data — they are gated behind PIN
      // unlock in a separate effect below (not here), so nothing user-specific loads
      // before authentication.
      setIsInitialized(true);

      HealthChecker.checkHealth().catch(console.error);
      HealthChecker.startPeriodicCheck(60000).catch(console.error);

      if (!criticalPagesPrefetched) {
        setCriticalPagesPrefetched(true);
        // Warm the lazy chunks for every primary navigation target during idle
        // time. Once a chunk is in memory, switching to that tab renders
        // synchronously (no Suspense fallback), so navigation never flashes a
        // chunk-loading spinner. Deferred via requestIdleCallback so it never
        // competes with first paint of the current page.
        const prefetchPrimaryRoutes = () => {
          void import('@/app/components/core/Dashboard');
          void import('@/app/components/core/Accounts');
          void import('@/app/components/core/Transactions');
          void import('@/app/components/goals/Goals');
          void import('@/app/components/investments/Investments');
          void import('@/app/components/features/Reports');
          void import('@/app/components/profile/Settings');
        };
        const ric = (window as unknown as {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }).requestIdleCallback;
        if (typeof ric === 'function') {
          ric(prefetchPrimaryRoutes, { timeout: 2000 });
        } else {
          setTimeout(prefetchPrimaryRoutes, 300);
        }
      }
    } else if (!authLoading) {
      setIsInitialized(true);
    }

    const cleanupNetwork = setupNetworkListener(
      () => { },
      () => { }
    );
    return () => { cleanupNetwork(); };
  }, [user, authLoading, criticalPagesPrefetched]);

  // SECURITY: notifications + SMS detection fetch user data — start them only AFTER the
  // user has unlocked with their PIN (never on the pre-auth PIN screen).
  //
  // Push registration belongs here for the same reason: it binds a device token to
  // an authenticated user and the payloads that come back reference that user's data.
  useEffect(() => {
    if (user && isAuthenticated) {
      void Promise.resolve().then(() => initializeNotifications());
      void Promise.resolve().then(() => initializeSmsTransactionDetection());
      void Promise.resolve().then(() =>
        initializePushNotifications((page) => setCurrentPageRef.current?.(page)),
      );
    }
  }, [user, isAuthenticated]);

  // Trigger data sync after PIN verification — runs once per user+auth session.
  // currentPage is intentionally excluded from deps: we don't want to retrigger
  // the full sync on every page navigation. Per-page syncs are handled below.
  //
  // useLayoutEffect, not useEffect: triggerDataSync flips `dataReady` synchronously
  // before its first await. A passive effect runs *after* paint, so the data gate below
  // would paint its full-screen spinner for one frame on every unlock. Running before
  // paint makes the transition from the PIN screen to the dashboard seamless. The sync
  // itself is still async and off the critical path.
  useLayoutEffect(() => {
    if (user && isAuthenticated && !dataReady && !dataSyncing) {
      const syncKey = `${user.id}:${isAuthenticated}`;
      if (hasTriggeredSyncRef.current === syncKey) {
        return;
      }
      hasTriggeredSyncRef.current = syncKey;
      // Use empty tables on the admin page — admin console fetches its own data.
      const requiredTables = currentPage === 'admin' ? [] : (PAGE_REQUIRED_TABLES[currentPage] || []);
      void triggerDataSync(requiredTables);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAuthenticated, dataReady, dataSyncing, triggerDataSync]);

  // When the app LOCKS (PIN gate) or the user signs out, isAuthenticated flips to
  // false and AuthContext resets dataReady→false to re-engage the data gate. The
  // sync-trigger guard above is keyed only by `user.id:isAuthenticated`, so it is
  // never cleared on its own — meaning the SAME user could never re-trigger the
  // post-PIN sync after a lock, leaving the app stuck on "Loading your account..."
  // on the next unlock/re-login. Clearing it here lets the next authenticated
  // session run a fresh sync, matching handlePinLocked's contract in AuthContext.
  useEffect(() => {
    if (!isAuthenticated) {
      hasTriggeredSyncRef.current = null;
      hasSyncedFeatureTablesRef.current = null;
    }
  }, [isAuthenticated]);

  // Budgets and recurring rules are not part of the Dexie sync engine (they are
  // backend-owned tables mirrored locally), so they are reconciled once per
  // session here as well as on their own pages. Without this the dashboard and
  // AI insights judge budgets that exist only in this browser, while the
  // server-side alert engine and recurring worker run on a different set.
  useEffect(() => {
    if (!user || !isAuthenticated || !dataReady) return;
    if (hasSyncedFeatureTablesRef.current === user.id) return;
    hasSyncedFeatureTablesRef.current = user.id;

    void syncBudgets();
    void syncRecurringTransactions();
  }, [user, isAuthenticated, dataReady]);

  // SECURITY: re-sync the current page's tables when the network reconnects — only while
  // unlocked (replaces the eager re-sync removed from AuthContext.handleOnline).
  useEffect(() => {
    if (!user || !isAuthenticated || !dataReady) return;
    const handleReconnect = () => {
      const requiredTables = PAGE_REQUIRED_TABLES[currentPage] || [];
      if (requiredTables.length > 0) {
        void syncUserDataFromCloud(user.id, requiredTables);
      }
    };
    window.addEventListener('online', handleReconnect);
    return () => window.removeEventListener('online', handleReconnect);
  }, [user, isAuthenticated, dataReady, currentPage]);

  // Handle background sync when page changes.
  //
  // Skipped while `dataSyncing` is true: `dataReady` now flips the instant the PIN gate
  // passes (rendering no longer waits on the network), so without this guard the initial
  // post-unlock sync and this per-page sync would fire together on the first render.
  // syncUserDataFromCloud has an in-flight guard, so the duplicate is dropped rather than
  // double-fetched — but whichever call won the race decided whether the pull was forced.
  // Letting triggerDataSync own the first sync keeps that deterministic.
  useEffect(() => {
    if (user && isAuthenticated && dataReady && !dataSyncing && currentPage) {
      const requiredTables = PAGE_REQUIRED_TABLES[currentPage] || [];
      if (requiredTables.length > 0) {
        void syncUserDataFromCloud(user.id, requiredTables);
      }
    }
  }, [currentPage, user, isAuthenticated, dataReady, dataSyncing]);

  // Ensure we land on the correct default page after login, and guard disabled features.
  useEffect(() => {
    if (!user || authLoading) return;
    const staleAuthPaths = new Set(['login', 'signin', 'auth-callback', '']);

    const normalizedRole = role?.toLowerCase();
    const isAdmin = normalizedRole === 'admin';

    // 1. Handle stale auth paths (safe to do before dataReady).
    //    Admin default redirect: only redirect from dashboard to /admin ONCE per session
    //    using a ref to prevent an infinite loop (setCurrentPage → currentPage changes
    //    → effect re-fires → redirect again).
    if (staleAuthPaths.has(currentPage)) {
      if (isAdmin && ADMIN_UI_ENABLED) {
        setCurrentPage('admin');
      } else if (visibleFeatures.dashboard) {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('settings');
      }
      return;
    }

    // Admin landing on dashboard: redirect to /admin exactly once per session.
    if (currentPage === 'dashboard' && isAdmin && ADMIN_UI_ENABLED && !hasAdminRedirectedRef.current) {
      hasAdminRedirectedRef.current = true;
      setCurrentPage('admin');
      return;
    }

    // Reset the redirect guard when the user explicitly navigates away from admin pages,
    // so re-login always gets redirected correctly.
    if (!isAdmin) {
      hasAdminRedirectedRef.current = false;
    }

    // 2. Guard against disabled features — but ONLY once the backend role is resolved.
    // Without this check, the provisional role (set on permission-fetch timeout) fires
    // the guard and bounces the user off the correct page before the real role arrives.
    if (!dataReady) return;

    const isManager = normalizedRole === 'manager';

    const isSystemAdminPage = ['admin', 'admin-feature-panel', 'admin-ai', 'ai-management', 'sync-monitor'].includes(currentPage);
    const isManagerPage = ['manager-advisor-verification', 'admin-advisor-verification', 'advisor-verification'].includes(currentPage);
    const isPublicPage = ['privacy-policy', 'terms', 'diagnostics', 'auth-callback', 'settings', 'user-profile', 'notifications'].includes(currentPage);

    // User-surface build: the Admin/Manager UI is compiled out, so bounce off
    // those pages regardless of role (the back-office lives on the admin origin).
    if (!ADMIN_UI_ENABLED && (isSystemAdminPage || isManagerPage)) {
      console.warn(`[Route Guard] Admin/Manager UI not present on this platform build: ${currentPage}`);
      setCurrentPage(visibleFeatures.dashboard ? 'dashboard' : 'settings');
      return;
    }

    const hasAdminBypass = isAdmin && (isSystemAdminPage || isManagerPage);
    const hasManagerBypass = isManager && isManagerPage;

    // Gate AI/Voice assistant pages based on AI capability settings
    const isVoiceDisabled = aiCapabilities?.voiceAssistant?.enabled === false;
    const isAIDisabled = aiCapabilities?.aiAutomation?.enabled === false;

    if (isVoiceDisabled && (currentPage === 'voice-input' || currentPage === 'voice-review')) {
      console.warn(`[Route Guard] Redirecting from disabled voice page: ${currentPage}`);
      if (visibleFeatures.dashboard) {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('settings');
      }
      return;
    }

    if (isAIDisabled && currentPage === 'ai-insights') {
      console.warn(`[Route Guard] Redirecting from disabled AI insights page: ${currentPage}`);
      if (visibleFeatures.dashboard) {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('settings');
      }
      return;
    }

    if (!canAccessPage(currentPage, visibleFeatures) && !hasAdminBypass && !hasManagerBypass && !isPublicPage) {
      console.warn(`[Route Guard] Redirecting from disabled page: ${currentPage} (Role: ${role})`);
      if (visibleFeatures.dashboard && currentPage !== 'dashboard') {
        setCurrentPage('dashboard');
      } else if (currentPage !== 'settings') {
        setCurrentPage('settings');
      }
    }
  }, [user, authLoading, dataReady, currentPage, setCurrentPage, visibleFeatures, role, aiCapabilities]);

  const setupNativeFeatures = async () => {
    const platform = Capacitor.getPlatform();

    // Each block is guarded on its own. These used to share one try/catch, which
    // meant the first failure skipped everything after it — on iOS
    // setBackgroundColor throws (Android-only API), so the back-button and
    // lifecycle wiring below never ran at all.
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      if (platform === 'android') {
        // Android-only; on iOS the status bar takes its colour from the web view.
        await StatusBar.setBackgroundColor({ color: '#2563eb' });
      }
    } catch (error) {
      console.warn('[Capacitor] Status bar setup skipped:', error);
    }

    // The splash screen is configured to auto-hide after 2s. Hiding it here as
    // well means a fast device stops showing it the moment React is interactive
    // instead of idling on the brand screen.
    try {
      await SplashScreen.hide();
    } catch (error) {
      console.warn('[Capacitor] Splash hide skipped:', error);
    }

    // Notification taps and kanaku:// links route through the app's existing
    // deepLink convention.
    try {
      nativeDeepLinkCleanupRef.current = await registerNativeDeepLinks((page) => {
        setCurrentPageRef.current?.(page);
      });
    } catch (error) {
      console.warn('[Capacitor] Deep link setup skipped:', error);
    }

    // Keyboard: `resize: 'body'` in capacitor.config.json reflows the web view,
    // but the app needs to know the inset so bottom-anchored bars (BottomNav,
    // sticky form footers) can lift clear of the keyboard rather than sit under it.
    try {
      await Keyboard.addListener('keyboardWillShow', (info) => {
        document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
        document.body.classList.add('keyboard-open');
      });
      await Keyboard.addListener('keyboardWillHide', () => {
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        document.body.classList.remove('keyboard-open');
      });
    } catch (error) {
      console.warn('[Capacitor] Keyboard listeners skipped:', error);
    }

    if (platform !== 'android') {
      // Everything below is Android hardware-back handling; iOS has no back key.
      return;
    }

    try {
      // Hardware-back handling.
      //
      // IMPORTANT: never call exitApp() on a single back event. Android dismisses
      // the soft keyboard by dispatching a BACK key event, so right after login
      // (keyboard still open) a stray back would otherwise quit the app the moment
      // the Dashboard mounts — the "app closes after first login" bug. We instead:
      //   1) close any open overlay,
      //   2) navigate back in-app when we're not on a root page,
      //   3) require a deliberate double-press to exit from a root page.
      // `canGoBack` (WebView history) is unreliable here because navigation is
      // driven by react-router state, so we use the app's own navigation instead.
      const ROOT_PAGES = new Set(['dashboard', 'landing']);
      CapacitorApp.addListener('backButton', () => {
        if (closeOverlaysRef.current?.()) return;

        const page = currentPageRef.current;
        if (!ROOT_PAGES.has(page)) {
          goBackRef.current?.();
          return;
        }

        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          CapacitorApp.exitApp();
        } else {
          lastBackPressRef.current = now;
          toast('Press back again to exit');
        }
      });
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) console.info('[Capacitor] App resumed to foreground.');
      });
    } catch (error) {
      console.error('Error setting up native features:', error);
    }
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'add-expense':
        localStorage.setItem('quickFormType', 'expense');
        localStorage.setItem('quickExpenseMode', 'individual');
        localStorage.setItem('quickBackPage', 'transactions');
        setCurrentPage('add-transaction');
        setQuickActionKey(k => k + 1);
        break;
      case 'add-income':
        localStorage.setItem('quickFormType', 'income');
        localStorage.removeItem('quickExpenseMode');
        localStorage.setItem('quickBackPage', 'transactions');
        setCurrentPage('add-transaction');
        setQuickActionKey(k => k + 1);
        break;
      case 'pay-emi': setCurrentPage('pay-emi'); break;
      case 'split-bill':
        localStorage.setItem('quickFormType', 'expense');
        localStorage.setItem('quickExpenseMode', 'group');
        localStorage.setItem('quickBackPage', 'groups');
        setCurrentPage('add-transaction');
        setQuickActionKey(k => k + 1);
        break;
      case 'add-loan':
        localStorage.setItem('quickFormType', 'expense');
        localStorage.setItem('quickExpenseMode', 'loan');
        localStorage.setItem('quickBackPage', 'loans');
        setCurrentPage('add-transaction');
        setQuickActionKey(k => k + 1);
        break;
      case 'add-account': setCurrentPage('add-account'); break;
      case 'add-goal': setCurrentPage('add-goal'); break;
      case 'transfer':
        localStorage.setItem('quickFormType', 'transfer');
        localStorage.removeItem('quickExpenseMode');
        localStorage.setItem('quickBackPage', 'transactions');
        setCurrentPage('add-transaction');
        setQuickActionKey(k => k + 1);
        break;
      case 'todo-lists': setCurrentPage('todo-lists'); break;
      case 'voice-entry': setCurrentPage('voice-input'); break;
      case 'calendar': setCurrentPage('calendar'); break;
    }
  };

  //  Loading auth state 
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-pink-500 to-rose-600">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p className="text-white text-base font-medium">Loading KANAKU...</p>
        </div>
      </div>
    );
  }

  const hasProfileData = localStorage.getItem('user_profile') || localStorage.getItem('user_settings');

  // A user is new if they haven't completed onboarding.
  // Enforce onboarding completion (removed 15-minute bypass).
  const isNewUser = !onboardingCompleted;

  if (!user) {
    if (lastStateLogged.current !== 'login') {
      lastStateLogged.current = 'login';
      const hasToken = !!localStorage.getItem('auth_token');
      console.log('[KANAKU Startup] Redirected to Login: Reason = ' + (hasToken ? 'Invalid/Expired Token' : 'Missing Token'));
    }
    if (showLanding) {
      switch (publicPage) {
        case 'about':
          return (
            <AboutPage
              onBack={() => setPublicPage('landing')}
              onGetStarted={() => setShowLanding(false)}
              onNavigate={(page) => setPublicPage(page as PublicPage)}
              onLogin={() => {
                setAuthInitialStep('signin');
                setShowLanding(false);
              }}
            />
          );
        case 'pricing':
          return (
            <PricingPage
              onBack={() => setPublicPage('landing')}
              onGetStarted={() => setShowLanding(false)}
              onNavigate={(page) => setPublicPage(page as PublicPage)}
              onLogin={() => {
                setAuthInitialStep('signin');
                setShowLanding(false);
              }}
            />
          );
        case 'contact':
          return (
            <ContactPage
              onBack={() => setPublicPage('landing')}
              onGetStarted={() => setShowLanding(false)}
              onNavigate={(page) => setPublicPage(page as PublicPage)}
              onLogin={() => {
                setAuthInitialStep('signin');
                setShowLanding(false);
              }}
            />
          );
        case 'privacy':
        case 'privacy-policy':
          return (
            <PrivacyPolicy
              onBack={() => setPublicPage('landing')}
              onGetStarted={() => setShowLanding(false)}
              onNavigate={(page) => setPublicPage(page as PublicPage)}
              onLogin={() => {
                setAuthInitialStep('signin');
                setShowLanding(false);
              }}
            />
          );
        case 'data-deletion':
        case 'account-deletion':
        case 'delete-account':
          return (
            <DataDeletion
              onBack={() => setPublicPage('landing')}
              onGetStarted={() => setShowLanding(false)}
              onNavigate={(page) => setPublicPage(page as PublicPage)}
              onLogin={() => {
                setAuthInitialStep('signin');
                setShowLanding(false);
              }}
            />
          );
        case 'terms':
          return (
            <Terms
              onBack={() => setPublicPage('landing')}
              onGetStarted={() => setShowLanding(false)}
              onNavigate={(page) => setPublicPage(page as PublicPage)}
              onLogin={() => {
                setAuthInitialStep('signin');
                setShowLanding(false);
              }}
            />
          );
        default:
          return (
            <LandingPage
              onGetStarted={() => {
                setAuthInitialStep('welcome');
                setShowLanding(false);
              }}
              onLogin={() => {
                setAuthInitialStep('signin');
                setShowLanding(false);
              }}
              onNavigate={(page) => setPublicPage(page as PublicPage)}
            />
          );
      }
    }
    return (
      <AuthFlow
        onBack={() => setShowLanding(true)}
        initialStep={authInitialStep}
        onNavigate={(page) => {
          if (['landing', 'about', 'pricing', 'contact', 'privacy', 'terms'].includes(page)) {
            setPublicPage(page as PublicPage);
            setShowLanding(true);
          }
        }}
        onLogin={() => setAuthInitialStep('signin')}
        onGetStarted={() => setAuthInitialStep('signup')}
      />
    );
  }

  // Gate 1: Onboarding
  // Only redirect to onboarding if user has no local profile data at all.
  // hasProfileData is a synchronous localStorage read, so it's always accurate —
  // no need to wait for dataReady which caused redirect loops for returning users.
  if (user && !onboardingCompleted && isNewUser && !hasProfileData) {
    return (
      <Suspense fallback={<PageLoader />}>
        <NewUserOnboarding />
      </Suspense>
    );
  }

  // Gate 1.25: App Feature Slides for new users (after onboarding completes, before PIN setup)
  const needsPinSetup = localStorage.getItem('pin_setup_required') === 'true';
  if (user && needsPinSetup && !slidesViewed) {
    return (
      <Suspense fallback={<PageLoader />}>
        <AppFeatureSlides
          onComplete={() => {
            localStorage.setItem('onboarding_slides_viewed', 'true');
            setSlidesViewed(true);
          }}
        />
      </Suspense>
    );
  }

  // Gate 1.5: PIN setup for new users (after onboarding completes)
  // Positioned before the !isAuthenticated check to avoid locking out new users
  if (user && needsPinSetup) {
    return (
      <Suspense fallback={<PageLoader />}>
        <PINSetup
          onComplete={(pin) => {
            localStorage.removeItem('pin_setup_required');
            setAuthenticated(pin);
          }}
          existingPinRequired={false}
        />
      </Suspense>
    );
  }

  // Gate 2: PIN authentication
  if (user && !isAuthenticated) {
    if (lastStateLogged.current !== 'pin') {
      lastStateLogged.current = 'pin';
      console.log('[KANAKU Startup] PIN Required: Reason = App Locked');
    }
    return <PINAuth onAuthenticated={setAuthenticated} />;
  }

  // Gate 3: safety net only.
  //
  // This used to be the login bottleneck — `dataReady` waited on permissions + a full
  // cloud sync (12s budget, 30s retry), so the whole app sat behind this full-screen
  // spinner on every login and re-login. triggerDataSync now flips `dataReady` before its
  // first await and the trigger runs in a layout effect, so this should never paint.
  // Kept for the genuine edge cases (sync trigger not yet mounted, unexpected reset).
  if (user && !dataReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-pink-500 to-rose-600">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p className="text-white text-base font-medium">
            {dataSyncing ? 'Syncing your account...' : 'Loading your account...'}
          </p>
          {dataSyncError && (
            <p className="text-white/80 text-xs mt-2 max-w-xs">
              Having trouble refreshing cloud data. Using the last saved state when available.
            </p>
          )}
        </div>
      </div>
    );
  }



  if (authLoading || !isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-pink-500 to-rose-600">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p className="text-white text-base font-medium">Loading KANAKU...</p>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    const bypassDataGatePages = new Set([
      'auth-callback',
      'settings',
      'user-profile',
      'notifications',
      'privacy',
      'privacy-policy',
      'terms',
      'data-deletion',
      'account-deletion',
      'delete-account',
      'diagnostics',
    ]);

    // Data guard, scoped to the only case that still needs it.
    //
    // `dataReady` now flips as soon as the PIN gate passes, so this no longer blocks a
    // returning user whose Dexie cache survived — they get real content immediately.
    // It still catches the genuinely-empty case: signing out wipes Dexie, so straight
    // after a re-login there is nothing local to show. Rendering a ₹0 dashboard there
    // reads as "my data is gone", so the shell (header + nav) paints instantly and only
    // the content area waits for the first rows — which arrive reactively via useLiveQuery.
    const awaitingFirstRows = hasNoLocalData && dataSyncing;
    if (user && (!dataReady || awaitingFirstRows) && !bypassDataGatePages.has(currentPage)) {
      return (
        <div className="flex items-center justify-center h-[60vh] w-full">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-700 font-medium">
              {dataSyncing ? 'Syncing your data...' : 'Loading your data...'}
            </p>
            {dataSyncError && (
              <p className="text-xs text-gray-500 mt-1">
                Having trouble reaching the cloud. Using last saved data.
              </p>
            )}
          </div>
        </div>
      );
    }

    // Role-based feature gating
    const normalizedRole = role?.toLowerCase();
    const isAdmin = normalizedRole === 'admin';
    const isManager = normalizedRole === 'manager';

    const isSystemAdminPage = ['admin', 'admin-feature-panel', 'admin-ai', 'ai-management', 'sync-monitor'].includes(currentPage);
    const isManagerPage = ['manager-advisor-verification', 'admin-advisor-verification', 'advisor-verification'].includes(currentPage);
    const isPublicPage = ['privacy', 'privacy-policy', 'terms', 'data-deletion', 'account-deletion', 'delete-account', 'diagnostics', 'auth-callback', 'settings', 'user-profile', 'notifications'].includes(currentPage);

    // User-surface build: Admin/Manager pages are compiled out — render the
    // default surface instead (the route-guard effect also redirects).
    if (!ADMIN_UI_ENABLED && (isSystemAdminPage || isManagerPage)) {
      if (!visibleFeatures.dashboard) return <Settings />;
      return <Dashboard setCurrentPage={setCurrentPage} />;
    }

    const hasAdminBypass = isAdmin && (isSystemAdminPage || isManagerPage);
    const hasManagerBypass = isManager && isManagerPage;

    // Gate AI/Voice assistant pages based on AI capability settings
    const isVoiceDisabled = aiCapabilities?.voiceAssistant?.enabled === false;
    const isAIDisabled = aiCapabilities?.aiAutomation?.enabled === false;

    if (isVoiceDisabled && (currentPage === 'voice-input' || currentPage === 'voice-review')) {
      console.warn(`[Access Denied] Voice assistant is disabled. Cannot render page: ${currentPage}`);
      if (!visibleFeatures.dashboard) return <Settings />;
      return <Dashboard setCurrentPage={setCurrentPage} />;
    }

    if (isAIDisabled && currentPage === 'ai-insights') {
      console.warn(`[Access Denied] AI Insights is disabled. Cannot render page: ${currentPage}`);
      if (!visibleFeatures.dashboard) return <Settings />;
      return <Dashboard setCurrentPage={setCurrentPage} />;
    }

    if (!canAccessPage(currentPage, visibleFeatures) && !hasAdminBypass && !hasManagerBypass && !isPublicPage) {
      console.warn(`[Access Denied] User role ${role} cannot access page: ${currentPage}`);
      if (!visibleFeatures.dashboard) return <Settings />;
      return <Dashboard setCurrentPage={setCurrentPage} />;
    }

    switch (currentPage) {
      case 'dashboard': return <Dashboard setCurrentPage={setCurrentPage} />;
      case 'auto-sizing-test': return <SimpleAutoTest />;
      case 'accounts': return <Accounts />;
      case 'transactions': return <Transactions />;
      case 'add-account': return <AddAccount />;
      case 'edit-account': return <EditAccount />;
      case 'book-advisor': return <BookAdvisor />;
      case 'add-transaction': return <AddTransaction key={quickActionKey} />;
      case 'receipt-scanner': return <ReceiptScannerPage />;
      case 'loans': return <Loans />;
      case 'goals': return <Goals />;
      case 'goal-detail': return <GoalDetail />;
      case 'add-goal': return <AddGoal />;
      case 'groups': return <Groups />;
      case 'add-group': return <AddGroup />;
      case 'add-friends': return <AddFriends />;
      case 'friends': return <FriendsList />;
      case 'friend-profile': return <FriendProfile />;
      case 'investments': return <Investments />;
      case 'add-investment': return <AddInvestment />;
      case 'add-gold': return <AddGold />;
      case 'edit-investment': return <EditInvestment />;
      case 'reports': return <Reports />;
      case 'calendar': return <Calendar />;
      case 'todo-lists': return <ToDoLists />;
      case 'todo-list-detail': return <ToDoListDetail />;
      case 'todo-list-share': return <ToDoListShare />;
      case 'settings': return <Settings />;
      case 'notifications': return <Notifications />;
      case 'user-profile': return <UserProfile />;
      case 'privacy':
      case 'privacy-policy': return (
        <PrivacyPolicy
          hideNavbar
          onNavigate={(page) => setCurrentPage(page)}
        />
      );
      case 'data-deletion':
      case 'account-deletion':
      case 'delete-account': return (
        <DataDeletion
          hideNavbar
          onNavigate={(page) => setCurrentPage(page)}
        />
      );
      case 'terms': return (
        <Terms
          hideNavbar
          onNavigate={(page) => setCurrentPage(page)}
        />
      );
      case 'diagnostics': return <Diagnostics />;
      case 'auth-callback': return <AuthCallback />;
      // Admin/Manager pages: components are null on a user-surface build —
      // fall through to the Dashboard (the route guard also redirects).
      case 'admin-feature-panel': return AdminFeaturePanel ? <AdminFeaturePanel /> : <Dashboard setCurrentPage={setCurrentPage} />;
      case 'admin': return AdminDashboard ? <AdminDashboard /> : <Dashboard setCurrentPage={setCurrentPage} />;
      case 'advisor-panel': return <AdvisorWorkspace />;
      case 'ai-management':
      case 'admin-ai': return AdminAIDashboard ? <AdminAIDashboard /> : <Dashboard setCurrentPage={setCurrentPage} />;
      case 'sync-monitor': return SyncMonitorDashboard ? <SyncMonitorDashboard /> : <Dashboard setCurrentPage={setCurrentPage} />;
      case 'admin-advisor-verification': return AdminAdvisorVerification ? <AdminAdvisorVerification /> : <Dashboard setCurrentPage={setCurrentPage} />;
      case 'advisor-verification':
      case 'manager-advisor-verification': return ManagerAdvisorVerification ? <ManagerAdvisorVerification /> : <Dashboard setCurrentPage={setCurrentPage} />;
      case 'advisor': return <AdvisorWorkspace />;
      case 'voice-input': return <VoiceInput />;
      case 'voice-review': return <VoiceReview />;
      case 'pay-emi': return <PayEMI />;
      case 'ai-insights': return <AIInsightsPage />;
      case 'recurring-transactions': return <RecurringTransactions />;
      case 'budget-alerts': return <BudgetAlertsPage />;
      case 'client-management': return <ClientManagementPage />;
      default: return <Dashboard setCurrentPage={setCurrentPage} />;
    }
  };

  return (
    <div className="w-full min-h-screen flex overflow-x-hidden app-container">
      {/* OfflineBanner is fixed-position - stays outside document flow, never disrupts the flex row */}
      <OfflineBanner />

      {/* Desktop Sidebar */}
      <div className="hidden lg:block fixed left-0 top-0 h-full z-50 w-28">
        <Sidebar />
      </div>

      {/* Main Content Area - Center scaled for Desktop */}
      <div className="flex-1 lg:ml-28 flex flex-col min-h-screen relative overflow-x-hidden">
        <div className="w-full lg:max-w-[90%] xl:max-w-[85%] mx-auto flex flex-col flex-1 mobile-content relative">
          <LimitedModeBanner />
          <OfflineBadge />
          <TopBar />
          <main className="w-full pt-24 lg:pt-28 overflow-x-hidden mobile-safe-bottom mobile-main flex-1 bg-transparent">
            {dataSyncError && (
              <div className="px-4 sm:px-6 pt-4">
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
                  <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <div>
                    <p className="font-semibold">Offline or Cloud Unreachable</p>
                    <p className="text-amber-700">
                      Showing last saved data. Changes will sync when the connection is restored.
                    </p>
                    {/* Must pass the current page's tables: triggerDataSync() with no
                        argument skips syncFromSupabase entirely (it only runs when
                        requestedTables is non-empty), so the bare call refreshed
                        permissions and nothing else — a "Re-sync now" button that did
                        not re-sync any data. */}
                    <button data-testid="app-button"
                      type="button"
                      onClick={() => void triggerDataSync(PAGE_REQUIRED_TABLES[currentPage] || [])}
                      disabled={dataSyncing}
                      className="mt-2 inline-flex items-center rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {dataSyncing ? 'Syncing...' : 'Re-sync now'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <PageErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                {/* Keyed wrapper: gives every page a single, consistent, lightweight
                    fade-in (see .page-view in index.css) instead of an abrupt swap,
                    and reserves a min-height so the layout never collapses between
                    pages — removing the blank-frame "blink" and layout-shift jump. */}
                <div key={currentPage} className="page-view">
                  {renderPage()}
                </div>
              </Suspense>
            </PageErrorBoundary>
          </main>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="lg:hidden mobile-bottom-nav">
        <BottomNav onQuickAdd={() => setShowQuickAction(true)} />
      </div>

      <QuickActionModal
        isOpen={showQuickAction}
        onClose={() => setShowQuickAction(false)}
        onAction={handleQuickAction}
      />
      <PWAInstallPrompt />
    </div>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <SecurityProvider>
      <AppProvider>
        <AppContent />
        <Toaster position="top-center" richColors closeButton />
      </AppProvider>
    </SecurityProvider>
  </AuthProvider>
);

export default App;


