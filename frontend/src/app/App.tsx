import React, { useEffect, useState, Suspense, lazy, useRef } from 'react';
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
import { canAccessPage } from '@/lib/featureFlags';
import { syncUserDataFromCloud, SyncedTableName } from '@/lib/auth-sync-integration';


//  Shell components (always visible - eager load) 
import { Sidebar } from '@/app/components/core/Sidebar';
import { TopBar } from '@/app/components/ui/TopBar';
import { BottomNav } from '@/app/components/core/BottomNav';
import { QuickActionModal } from '@/app/components/shared/QuickActionModal';
import { PWAInstallPrompt } from '@/app/components/shared/PWAInstallPrompt';
import { LimitedModeBanner } from '@/app/components/shared/LimitedModeBanner';
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
const Transfer = lazy(() => import('@/app/components/transactions/Transfer').then(m => ({ default: m.Transfer })));
const VoiceInput = lazy(() => import('@/app/components/features/VoiceInput').then(m => ({ default: m.VoiceInput })));
const VoiceReview = lazy(() => import('@/app/components/features/VoiceReview').then(m => ({ default: m.VoiceReview })));
const AuthCallback = lazy(() => import('@/app/components/auth/AuthCallback').then(m => ({ default: m.AuthCallback })));
const AdminDashboard = lazy(() => import('@/app/components/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AdminAIDashboard = lazy(() => import('@/app/components/admin/AdminAIDashboard').then(m => ({ default: m.AdminAIDashboard })));
const SyncMonitorDashboard = lazy(() => import('@/app/components/admin/SyncMonitorDashboard').then(m => ({ default: m.SyncMonitorDashboard })));
const AdvisorWorkspace = lazy(() => import('@/app/components/advisor/AdvisorWorkspace').then(m => ({ default: m.AdvisorWorkspace })));
const AdminFeaturePanel = lazy(() => import('@/app/components/admin/AdminFeaturePanel').then(m => ({ default: m.AdminFeaturePanel })));
const AdvisorPanel = lazy(() => import('@/app/components/advisor/AdvisorPanel').then(m => ({ default: m.AdvisorPanel })));
const BookAdvisor = lazy(() => import('@/app/components/advisor/BookAdvisor').then(m => ({ default: m.BookAdvisor })));
const AdminAdvisorVerification = lazy(() => import('@/app/components/admin/AdminAdvisorVerification').then(m => ({ default: m.AdminAdvisorVerification })));
const PayEMI = lazy(() => import('@/app/components/transactions/PayEMI').then(m => ({ default: m.PayEMI })));
const Diagnostics = lazy(() => import('@/app/components/shared/Diagnostics').then(m => ({ default: m.Diagnostics })));
const ManagerAdvisorVerification = lazy(() => import('@/app/components/manager/ManagerAdvisorVerification').then(m => ({ default: m.ManagerAdvisorVerification })));
const ExportReports = lazy(() => import('@/app/components/features/ExportReports').then(m => ({ default: m.ExportReports })));
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
const AddLoan = lazy(() => import('@/app/components/loans/AddLoan').then(m => ({ default: m.AddLoan })));
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
const TaxCalculator = lazy(() => import('@/app/components/features/TaxCalculatorPage').then(m => ({ default: m.TaxCalculator })));
const AIInsightsPage = lazy(() => import('@/app/components/features/AIInsightsPage').then(m => ({ default: m.AIInsightsPage })));
const RecurringTransactions = lazy(() => import('@/app/components/features/RecurringTransactions').then(m => ({ default: m.RecurringTransactions })));
const BudgetAlertsPage = lazy(() => import('@/app/components/features/BudgetAlertsPage').then(m => ({ default: m.BudgetAlertsPage })));
const ClientManagementPage = lazy(() => import('@/app/components/features/ClientManagementPage').then(m => ({ default: m.ClientManagementPage })));
const ReceiptScannerPage = lazy(() => import('@/app/components/features/ReceiptScannerPage').then(m => ({ default: m.ReceiptScannerPage })));

//  Capacitor (native only) 
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

//  Minimal page-transition spinner shown while lazy chunk loads 
const PageLoader = () => (
  <div className="flex items-center justify-center h-48 w-full pt-12">
    <div className="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
  </div>
);

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
  'tax-calculator': ['transactions', 'accounts'],
  loans: ['loans', 'accounts', 'friends'],
  'add-loan': ['loans', 'accounts', 'friends'],
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
  'export-reports': ['transactions', 'accounts'],
  'data-export': ['transactions', 'accounts'],
  calendar: ['transactions', 'accounts'],
  'ai-insights': ['transactions', 'accounts', 'goals', 'investments'],
  'budget-alerts': ['accounts', 'transactions'],
};

type PublicPage = 'landing' | 'about' | 'pricing' | 'contact' | 'privacy' | 'terms';

const AppContent: React.FC = () => {
  const appContext = useOptionalApp();
  const { user, role, loading: authLoading, dataReady, dataSyncing, dataSyncError, triggerDataSync } = useAuth();
  const { isAuthenticated, setAuthenticated } = useSecurity();

  // All hooks must be called before any conditional early returns (React Rules of Hooks)
  const currentPage = appContext?.currentPage ?? 'dashboard';
  const [isInitialized, setIsInitialized] = useState(false);
  const [showQuickAction, setShowQuickAction] = useState(false);

  // Auto scroll to top when page changes
  useScrollToTopOnPageChange(currentPage);

  // Landing page: shown only to confirmed unauthenticated visitors (set via effect
  // so we never show it during the async auth-loading window)
  const [showLanding, setShowLanding] = useState(true);
  const [publicPage, setPublicPage] = useState<PublicPage>('landing');
  const [authInitialStep, setAuthInitialStep] = useState<'welcome' | 'signin' | 'signup'>('welcome');
  const [criticalPagesPrefetched, setCriticalPagesPrefetched] = useState(false);
  const hasModuleReloaded = useRef(false);
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


  // Show landing page only once we KNOW the user is not signed in
  useEffect(() => {
    if (!authLoading && !user) {
      setShowLanding((prev) => (prev ? prev : true));
    }
  }, [authLoading, user]);

  // Static initialization (runs once)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      setupNativeFeatures();
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add-expense') {
      setShowQuickAction(true);
    }

    registerServiceWorker();
    setupPWAInstallPrompt();
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
        // Preload critical pages right after login to avoid first-click lag
        void import('@/app/components/core/Dashboard');
        void import('@/app/components/core/Transactions');
        setCriticalPagesPrefetched(true);
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
  useEffect(() => {
    if (user && isAuthenticated) {
      void Promise.resolve().then(() => initializeNotifications());
      void Promise.resolve().then(() => initializeSmsTransactionDetection());
    }
  }, [user, isAuthenticated]);

  // Trigger data sync after PIN verification
  useEffect(() => {
    if (user && isAuthenticated && !dataReady && !dataSyncing) {
      const requiredTables = PAGE_REQUIRED_TABLES[currentPage] || [];
      void triggerDataSync(requiredTables);
    }
  }, [user, isAuthenticated, dataReady, dataSyncing, triggerDataSync, currentPage]);

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

  // Handle background sync when page changes
  useEffect(() => {
    if (user && isAuthenticated && dataReady && currentPage) {
      const requiredTables = PAGE_REQUIRED_TABLES[currentPage] || [];
      if (requiredTables.length > 0) {
        void syncUserDataFromCloud(user.id, requiredTables);
      }
    }
  }, [currentPage, user, isAuthenticated, dataReady]);

  // Ensure we land on dashboard after login when the URL is a stale auth path
  // ALSO: Guard against disabled features
  useEffect(() => {
    if (!user || authLoading) return;
    const staleAuthPaths = new Set(['login', 'signin', 'auth-callback', '']);

    // 1. Handle stale auth paths (safe to do before dataReady)
    if (staleAuthPaths.has(currentPage)) {
      if (visibleFeatures.dashboard) {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('settings');
      }
      return;
    }

    // 2. Guard against disabled features — but ONLY once the backend role is resolved.
    // Without this check, the provisional role (set on permission-fetch timeout) fires
    // the guard and bounces the user off the correct page before the real role arrives.
    if (!dataReady) return;

    const normalizedRole = role?.toLowerCase();
    const isAdmin = normalizedRole === 'admin';
    const isManager = normalizedRole === 'manager';

    const isSystemAdminPage = ['admin', 'admin-feature-panel', 'admin-ai', 'ai-management', 'sync-monitor'].includes(currentPage);
    const isManagerPage = ['manager-advisor-verification', 'admin-advisor-verification', 'advisor-verification'].includes(currentPage);
    const isPublicPage = ['privacy-policy', 'terms', 'diagnostics', 'auth-callback', 'settings', 'user-profile', 'notifications'].includes(currentPage);

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
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#2563eb' });
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack) CapacitorApp.exitApp();
        else window.history.back();
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
        setCurrentPage('add-loan');
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
    return <PINAuth onAuthenticated={setAuthenticated} />;
  }

  // Gate 3: Data Ready (heavy sync & permissions) - only after PIN is verified!
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
      'privacy-policy',
      'terms',
      'diagnostics',
    ]);

    // Enhanced data guard: Show loading if user is authenticated but data isn't ready yet
    if (user && !dataReady && !bypassDataGatePages.has(currentPage)) {
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
    const isPublicPage = ['privacy-policy', 'terms', 'diagnostics', 'auth-callback', 'settings', 'user-profile', 'notifications'].includes(currentPage);

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
      case 'add-loan': return <AddLoan />;
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
      case 'export-reports': return <ExportReports />;
      case 'calendar': return <Calendar />;
      case 'todo-lists': return <ToDoLists />;
      case 'todo-list-detail': return <ToDoListDetail />;
      case 'todo-list-share': return <ToDoListShare />;
      case 'settings': return <Settings />;
      case 'notifications': return <Notifications />;
      case 'user-profile': return <UserProfile />;
      case 'privacy-policy': return (
        <PrivacyPolicy
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
      case 'admin-feature-panel': return <AdminFeaturePanel />;
      case 'admin': return <AdminDashboard />;
      case 'advisor-panel': return <AdvisorWorkspace />;
      case 'ai-management':
      case 'admin-ai': return <AdminAIDashboard />;
      case 'sync-monitor': return <SyncMonitorDashboard />;
      case 'admin-advisor-verification': return <AdminAdvisorVerification />;
      case 'advisor-verification':
      case 'manager-advisor-verification': return <ManagerAdvisorVerification />;
      case 'advisor': return <AdvisorWorkspace />;
      case 'voice-input': return <VoiceInput />;
      case 'voice-review': return <VoiceReview />;
      case 'pay-emi': return <PayEMI />;
      case 'transfer': return <Transfer />;
      case 'tax-calculator': return <TaxCalculator />;
      case 'ai-insights': return <AIInsightsPage />;
      case 'data-export': return <ExportReports />;
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
                    <button data-testid="app-button"
                      type="button"
                      onClick={() => void triggerDataSync()}
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
                {renderPage()}
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


