import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { Shield, Brain, Layers, Search, Settings, Activity, Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { backendService } from '@/lib/backend-api';
import { ROLE_FEATURES, SUB_FEATURE_DEFINITIONS, AI_MODULE_DEFINITIONS, UserRole, AIModuleKey, AIModuleDef } from '@/lib/featureFlags';
import { AdminAIFeatureSection } from './AdminAIFeatureSection';

const ADMIN_FEATURE_SETTINGS_KEY = 'admin_global_feature_settings';
const ADMIN_AI_FEATURE_SETTINGS_KEY = 'admin_ai_feature_settings';
const FEATURE_BROADCAST_CHANNEL = 'feature_settings_channel';
const AI_FEATURE_BROADCAST_CHANNEL = 'ai_feature_settings_channel';

interface SubFeatureControl {
  name: string;
  key: string;
  enabled: boolean;
  roleAccess: {
    admin: boolean;
    manager: boolean;
    advisor: boolean;
    user: boolean;
  };
}

interface FeatureControl {
  name: string;
  key: string;
  enabled: boolean;
  description: string;
  lastUpdated: Date;
  roleAccess: {
    admin: boolean;
    manager: boolean;
    advisor: boolean;
    user: boolean;
  };
  children?: Record<string, SubFeatureControl>;
}

interface FeatureControlBase {
  name: string;
  key: string;
  description: string;
}

// DENY-BY-DEFAULT: Admin is the single source of truth.
// All feature modules start as admin-only. Admin must explicitly grant access
// to manager/advisor/user roles via this panel.
//
// Structural shell features (panels, profile, settings, notifications,
// dashboard) retain role-appropriate access so the app shell is usable
// before admin configures application features.
const FEATURE_DEFAULT_ROLE_ACCESS: Record<string, Record<UserRole, boolean>> = {
  // ── Structural (shell) features — role-appropriate access maintained ──
  dashboard:              { admin: true, manager: true,  advisor: true,  user: true  },
  userProfile:            { admin: true, manager: true,  advisor: true,  user: true  },
  settings:               { admin: true, manager: true,  advisor: true,  user: true  },
  notifications:          { admin: true, manager: true,  advisor: true,  user: true  },
  adminPanel:             { admin: true, manager: false, advisor: false, user: false },
  managerPanel:           { admin: true, manager: true,  advisor: false, user: false },
  advisorPanel:           { admin: true, manager: false, advisor: true,  user: false },
  aiManagement:           { admin: true, manager: false, advisor: false, user: false },
  // ── Application features — DENY-BY-DEFAULT for non-admin ──
  accounts:               { admin: true, manager: false, advisor: false, user: false },
  transactions:           { admin: true, manager: false, advisor: false, user: false },
  loans:                  { admin: true, manager: false, advisor: false, user: false },
  goals:                  { admin: true, manager: false, advisor: false, user: false },
  groups:                 { admin: true, manager: false, advisor: false, user: false },
  calendar:               { admin: true, manager: false, advisor: false, user: false },
  reports:                { admin: true, manager: false, advisor: false, user: false },
  todoLists:              { admin: true, manager: false, advisor: false, user: false },
  investments:            { admin: true, manager: false, advisor: false, user: false },
  transfer:               { admin: true, manager: false, advisor: false, user: false },
  bookAdvisor:            { admin: true, manager: false, advisor: false, user: false },
  payments:               { admin: true, manager: false, advisor: false, user: false },
  clientManagement:       { admin: true, manager: false, advisor: false, user: false },
  aiInsights:             { admin: true, manager: false, advisor: false, user: false },
  recurringTransactions:  { admin: true, manager: false, advisor: false, user: false },
  budgetAlerts:           { admin: true, manager: false, advisor: false, user: false },
};

const FEATURES_BASE: FeatureControlBase[] = [
  { name: 'Dashboard', key: 'dashboard', description: 'Main overview with financial summary and quick actions' },
  { name: 'Accounts', key: 'accounts', description: 'Bank accounts, wallets, and financial account management' },
  { name: 'Transactions', key: 'transactions', description: 'Income and expense tracking with categorization' },
  { name: 'Loans & EMIs', key: 'loans', description: 'Loan tracking, EMI calculations, and payment schedules' },
  { name: 'Goals', key: 'goals', description: 'Financial goal setting and progress tracking' },
  { name: 'Group Expenses', key: 'groups', description: 'Split bills and manage shared expenses with friends' },
  { name: 'Investments', key: 'investments', description: 'Portfolio tracking for stocks, crypto, and mutual funds' },
  { name: 'Calendar', key: 'calendar', description: 'Visual calendar view of transactions and recurring payments' },
  { name: 'Reports', key: 'reports', description: 'Financial reports and analytics with charts' },
  { name: 'Todo Lists', key: 'todoLists', description: 'Task management and collaboration features' },
  { name: 'Book Advisor', key: 'bookAdvisor', description: 'Users can book financial advisors for sessions' },
  { name: 'Payments', key: 'payments', description: 'In-app payments for advisor sessions and subscriptions (deferred — Phase 4)' },
  { name: 'Notifications', key: 'notifications', description: 'Alerts for bills, budgets, and financial reminders' },
  { name: 'User Profile', key: 'userProfile', description: 'Personal profile and account settings' },
  { name: 'Settings', key: 'settings', description: 'App preferences, currency, and theme settings' },
  { name: 'AI Insights', key: 'aiInsights', description: 'AI-powered spending insights and recommendations' },
  { name: 'Recurring Transactions', key: 'recurringTransactions', description: 'Automatic recurring income and expense entries' },
  { name: 'Budget Alerts', key: 'budgetAlerts', description: 'Notifications when spending exceeds budget limits' },
  { name: 'Client Management', key: 'clientManagement', description: 'Advisors and Managers can manage assigned clients' },
  { name: 'AI Management', key: 'aiManagement', description: 'Centralized control panel for AI models and insights' },
  { name: 'Advisor Verification', key: 'managerPanel', description: 'Manager module for approving advisor applications' },
];

const FEATURES: FeatureControl[] = FEATURES_BASE.map(f => {
  const defaults = SUB_FEATURE_DEFINITIONS[f.key];
  const children = defaults
    ? Object.keys(defaults).reduce((acc, childKey) => {
        const child = defaults[childKey];
        acc[childKey] = {
          name: child.name,
          key: child.key,
          enabled: child.enabled,
          roleAccess: { ...child.roleAccess },
        };
        return acc;
      }, {} as Record<string, SubFeatureControl>)
    : undefined;

  return {
    ...f,
    enabled: true,
    roleAccess: FEATURE_DEFAULT_ROLE_ACCESS[f.key] ?? { admin: true, manager: true, advisor: true, user: true },
    lastUpdated: new Date(),
    children
  };
});

export const AdminFeaturePanel: React.FC = () => {
  const { setCurrentPage, setVisibleFeatures } = useApp();
  const { role, loading, dataReady, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'app' | 'ai'>('app');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [selectedSubFeatureModule, setSelectedSubFeatureModule] = useState<FeatureControl | null>(null);

  // ── App features state (initialized from localStorage cache) ──────────────
  const [features, setFeatures] = useState<FeatureControl[]>(() => {
    const saved = localStorage.getItem(ADMIN_FEATURE_SETTINGS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return FEATURES.map(f => {
          const isEnabled = typeof parsed[f.key]?.enabled === 'boolean' ? parsed[f.key].enabled : f.enabled;
          const defaultAccess = FEATURE_DEFAULT_ROLE_ACCESS[f.key] ?? { admin: true, manager: true, advisor: true, user: true };
          const savedAccess = parsed[f.key]?.roleAccess;
          const mergedAccess = savedAccess ? { ...defaultAccess, ...savedAccess } : defaultAccess;

          const defaultChildren = SUB_FEATURE_DEFINITIONS[f.key];
          let mergedChildren = f.children;
          if (defaultChildren) {
            const savedChildren = parsed[f.key]?.children || {};
            mergedChildren = Object.keys(defaultChildren).reduce((acc, childKey) => {
              const defChild = defaultChildren[childKey];
              const savChild = savedChildren[childKey] || {};
              acc[childKey] = {
                name: defChild.name,
                key: defChild.key,
                enabled: typeof savChild.enabled === 'boolean' ? savChild.enabled : defChild.enabled,
                roleAccess: {
                  ...defChild.roleAccess,
                  ...(savChild.roleAccess || {}),
                },
              };
              return acc;
            }, {} as Record<string, SubFeatureControl>);
          }

          return {
            ...f,
            enabled: isEnabled,
            roleAccess: mergedAccess,
            children: mergedChildren,
            lastUpdated: parsed[f.key]?.lastUpdated ? new Date(parsed[f.key].lastUpdated) : f.lastUpdated
          };
        });
      } catch {
        return FEATURES;
      }
    }
    return FEATURES;
  });

  // ── AI features state — lifted from AdminAIFeatureSection into this parent ─
  // Previously AdminAIFeatureSection fetched /admin/ai-features on every mount
  // because the tab switcher used a ternary (unmount/remount on each switch).
  // Now the parent owns the data: one fetch per page load, zero on tab switch.
  const [aiFeatures, setAiFeatures] = useState<Record<AIModuleKey, AIModuleDef>>(() => {
    const saved = localStorage.getItem(ADMIN_AI_FEATURE_SETTINGS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged = { ...AI_MODULE_DEFINITIONS };
        (Object.keys(AI_MODULE_DEFINITIONS) as AIModuleKey[]).forEach((key) => {
          if (parsed[key]) {
            merged[key] = {
              ...merged[key],
              enabled: typeof parsed[key].enabled === 'boolean' ? parsed[key].enabled : merged[key].enabled,
              roleAccess: { ...merged[key].roleAccess, ...(parsed[key].roleAccess || {}) },
              capabilities: Object.keys(merged[key].capabilities).reduce((acc, capKey) => {
                const defaultCap = merged[key].capabilities[capKey];
                const savedCap = parsed[key].capabilities?.[capKey] || {};
                acc[capKey] = {
                  ...defaultCap,
                  enabled: typeof savedCap.enabled === 'boolean' ? savedCap.enabled : defaultCap.enabled,
                  roleAccess: { ...defaultCap.roleAccess, ...(savedCap.roleAccess || {}) }
                };
                return acc;
              }, {} as Record<string, any>)
            };
          }
        });
        return merged;
      } catch {
        return AI_MODULE_DEFINITIONS;
      }
    }
    return AI_MODULE_DEFINITIONS;
  });
  const [aiLoading, setAiLoading] = useState(false);

  // ── Broadcast channels ───────────────────────────────────────────────────
  const broadcastChannel = React.useMemo(() => {
    try { return new BroadcastChannel(FEATURE_BROADCAST_CHANNEL); } catch { return null; }
  }, []);

  const aiBroadcastChannel = React.useMemo(() => {
    try { return new BroadcastChannel(AI_FEATURE_BROADCAST_CHANNEL); } catch { return null; }
  }, []);

  // ── Race-condition guards ────────────────────────────────────────────────
  // Once the admin has made any local change, ignore late-arriving results
  // from the initial matrix fetch (GET-after-POST race prevention).
  const userInteractedRef = useRef(false);
  const aiUserInteractedRef = useRef(false);
  // Prevent double-fetch in React StrictMode / HMR (one ref per matrix fetch)
  const hasFetchedMatrixRef = useRef(false);
  const hasFetchedAIMatrixRef = useRef(false);

  const applyFeatureVisibility = useCallback((featureList: FeatureControl[]) => {
    const newVisibility: Record<string, boolean> = {};
    featureList.forEach(feature => {
      newVisibility[feature.key] = feature.enabled && (feature.roleAccess[role as keyof typeof feature.roleAccess] ?? true);
    });
    setVisibleFeatures((prev: any) => ({ ...prev, ...newVisibility }));
  }, [role, setVisibleFeatures]);

  // ── Fetch app feature RBAC matrix on mount (once, from dedicated endpoint) ─
  // Uses GET /admin/features/matrix instead of GET /admin/features so the admin
  // panel gets the full role-access matrix without sharing the startup endpoint.
  useEffect(() => {
    if (loading || !user || hasFetchedMatrixRef.current) return;
    hasFetchedMatrixRef.current = true;

    const loadFromDb = async () => {
      try {
        const dbFlags = await backendService.getFeatureFlagsMatrix();
        if (userInteractedRef.current) {
          // Admin toggled something while fetch was in flight — don't overwrite.
          return;
        }
        if (dbFlags && Object.keys(dbFlags).length > 0) {
          localStorage.setItem(ADMIN_FEATURE_SETTINGS_KEY, JSON.stringify(dbFlags));
          const updatedFeatures = FEATURES.map(f => {
            const isEnabled = typeof dbFlags[f.key]?.enabled === 'boolean' ? dbFlags[f.key].enabled : f.enabled;

            const defaultChildren = SUB_FEATURE_DEFINITIONS[f.key];
            let mergedChildren = f.children;
            if (defaultChildren) {
              const savedChildren = dbFlags[f.key]?.children || {};
              mergedChildren = Object.keys(defaultChildren).reduce((acc, childKey) => {
                const defChild = defaultChildren[childKey];
                const savChild = savedChildren[childKey] || {};
                acc[childKey] = {
                  name: defChild.name,
                  key: defChild.key,
                  enabled: typeof savChild.enabled === 'boolean' ? savChild.enabled : defChild.enabled,
                  roleAccess: {
                    ...defChild.roleAccess,
                    ...(savChild.roleAccess || {}),
                  },
                };
                return acc;
              }, {} as Record<string, SubFeatureControl>);
            }

            return {
              ...f,
              enabled: isEnabled,
              roleAccess: dbFlags[f.key]?.roleAccess
                ? { ...(FEATURE_DEFAULT_ROLE_ACCESS[f.key] || f.roleAccess), ...dbFlags[f.key].roleAccess }
                : (FEATURE_DEFAULT_ROLE_ACCESS[f.key] || f.roleAccess),
              children: mergedChildren,
              lastUpdated: dbFlags[f.key]?.lastUpdated ? new Date(dbFlags[f.key].lastUpdated) : f.lastUpdated
            };
          });
          setFeatures(updatedFeatures);
          applyFeatureVisibility(updatedFeatures);
        }
      } catch (err) {
        console.error('Failed to load global feature flags from backend database:', err);
      }
    };
    void loadFromDb();
  }, [applyFeatureVisibility, user, loading]);

  // ── Lazy-fetch the AI feature RBAC matrix on first AI-tab open ─────────────
  // GET /admin/ai-features/matrix is admin-only and returns the full RBAC matrix.
  // It is DEFERRED until the AI Intelligence Systems tab is actually opened, so
  // viewing the Application Features tab never loads AI data. Both panels stay
  // mounted (CSS hidden) and the ref guard fires this exactly once — subsequent
  // tab switches reuse the cached parent state and issue zero requests.
  useEffect(() => {
    if (loading || !user || activeTab !== 'ai' || hasFetchedAIMatrixRef.current) return;
    hasFetchedAIMatrixRef.current = true;

    const loadAIMatrix = async () => {
      setAiLoading(true);
      try {
        const dbFlags = await backendService.getAIFeatureFlagsMatrix();
        if (aiUserInteractedRef.current) return;
        if (dbFlags && Object.keys(dbFlags).length > 0) {
          localStorage.setItem(ADMIN_AI_FEATURE_SETTINGS_KEY, JSON.stringify(dbFlags));
          const merged = { ...AI_MODULE_DEFINITIONS };
          (Object.keys(AI_MODULE_DEFINITIONS) as AIModuleKey[]).forEach((key) => {
            if (dbFlags[key]) {
              merged[key] = {
                ...merged[key],
                enabled: typeof dbFlags[key].enabled === 'boolean' ? dbFlags[key].enabled : merged[key].enabled,
                roleAccess: { ...merged[key].roleAccess, ...(dbFlags[key].roleAccess || {}) },
                capabilities: Object.keys(merged[key].capabilities).reduce((acc, capKey) => {
                  const defaultCap = merged[key].capabilities[capKey];
                  const savedCap = dbFlags[key].capabilities?.[capKey] || {};
                  acc[capKey] = {
                    ...defaultCap,
                    enabled: typeof savedCap.enabled === 'boolean' ? savedCap.enabled : defaultCap.enabled,
                    roleAccess: { ...defaultCap.roleAccess, ...(savedCap.roleAccess || {}) }
                  };
                  return acc;
                }, {} as Record<string, any>)
              };
            }
          });
          setAiFeatures(merged);
        }
      } catch (err) {
        console.error('[AdminFeaturePanel] Failed to load AI feature matrix from backend:', err);
      } finally {
        setAiLoading(false);
      }
    };
    void loadAIMatrix();
  }, [user, loading, activeTab]);

  // ── AI save handler (owned by parent, passed as prop to child) ────────────
  const handleSaveAIFeatures = useCallback((updated: Record<AIModuleKey, AIModuleDef>) => {
    aiUserInteractedRef.current = true;
    setAiFeatures(updated);
    localStorage.setItem(ADMIN_AI_FEATURE_SETTINGS_KEY, JSON.stringify(updated));

    if (aiBroadcastChannel) {
      aiBroadcastChannel.postMessage({
        type: 'AI_FEATURE_UPDATE',
        features: updated,
        timestamp: new Date().toISOString()
      });
    }

    void backendService.saveAIFeatureFlagsMatrix(updated).catch((err) => {
      console.error('[AdminFeaturePanel] Failed to sync AI feature flags matrix to backend:', err);
      toast.error('Failed to save AI feature settings');
    });

    window.dispatchEvent(new CustomEvent('adminAIFeatureUpdate', { detail: { features: updated } }));
  }, [aiBroadcastChannel]);

  // Sync listener
  useEffect(() => {
    if (!broadcastChannel) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'FEATURE_UPDATE') {
        setFeatures(event.data.features);
        applyFeatureVisibility(event.data.features);
        toast.info('Feature settings updated by admin');
      }
    };

    broadcastChannel.addEventListener('message', handleMessage);
    return () => broadcastChannel.removeEventListener('message', handleMessage);
  }, [broadcastChannel, applyFeatureVisibility]);

  // Storage listener
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ADMIN_FEATURE_SETTINGS_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          const updatedFeatures = FEATURES.map(f => {
            const isEnabled = typeof parsed[f.key]?.enabled === 'boolean' ? parsed[f.key].enabled : f.enabled;
            const defaultAccess = FEATURE_DEFAULT_ROLE_ACCESS[f.key] ?? { admin: true, manager: true, advisor: true, user: true };

            const defaultChildren = SUB_FEATURE_DEFINITIONS[f.key];
            let mergedChildren = f.children;
            if (defaultChildren) {
              const savedChildren = parsed[f.key]?.children || {};
              mergedChildren = Object.keys(defaultChildren).reduce((acc, childKey) => {
                const defChild = defaultChildren[childKey];
                const savChild = savedChildren[childKey] || {};
                acc[childKey] = {
                  name: defChild.name,
                  key: defChild.key,
                  enabled: typeof savChild.enabled === 'boolean' ? savChild.enabled : defChild.enabled,
                  roleAccess: {
                    ...defChild.roleAccess,
                    ...(savChild.roleAccess || {}),
                  },
                };
                return acc;
              }, {} as Record<string, SubFeatureControl>);
            }

            return {
              ...f,
              enabled: isEnabled,
              roleAccess: parsed[f.key]?.roleAccess ? { ...defaultAccess, ...parsed[f.key].roleAccess } : defaultAccess,
              children: mergedChildren,
              lastUpdated: parsed[f.key]?.lastUpdated ? new Date(parsed[f.key].lastUpdated) : f.lastUpdated
            };
          });
          setFeatures(updatedFeatures);
          applyFeatureVisibility(updatedFeatures);
        } catch {
          // parse error
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [applyFeatureVisibility]);

  // Redirect non-admins
  useEffect(() => {
    if (dataReady && role !== 'admin') {
      setCurrentPage('dashboard');
    }
  }, [dataReady, role, setCurrentPage]);

  const saveAndBroadcastFeatures = (updatedFeatures: FeatureControl[]) => {
    userInteractedRef.current = true;
    setFeatures(updatedFeatures);
    applyFeatureVisibility(updatedFeatures);

    const settingsToSave = updatedFeatures.reduce((acc, f) => {
      acc[f.key] = { enabled: f.enabled, roleAccess: f.roleAccess, children: f.children, lastUpdated: f.lastUpdated.toISOString() };
      return acc;
    }, {} as Record<string, { enabled: boolean; roleAccess: any; children: any; lastUpdated: string }>);

    localStorage.setItem(ADMIN_FEATURE_SETTINGS_KEY, JSON.stringify(settingsToSave));

    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'FEATURE_UPDATE',
        features: updatedFeatures,
        timestamp: new Date().toISOString()
      });
    }

    void backendService.saveFeatureFlagsMatrix(settingsToSave).catch((err) => {
      console.error('Failed to sync global feature flags matrix to backend database:', err);
    });

    window.dispatchEvent(new CustomEvent('adminFeatureUpdate', { detail: { features: updatedFeatures } }));
  };

  const handleToggleFeatureEnabled = (key: string, isEnabled: boolean) => {
    const updatedFeatures = features.map(f => {
      if (f.key === key) {
        return { ...f, enabled: isEnabled, lastUpdated: new Date() };
      }
      return f;
    });
    saveAndBroadcastFeatures(updatedFeatures);
    toast.success(`Feature "${key}" is now ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleToggleRoleAccess = (key: string, roleKey: UserRole, isGranted: boolean) => {
    const updatedFeatures = features.map(f => {
      if (f.key === key) {
        return {
          ...f,
          roleAccess: {
            ...f.roleAccess,
            [roleKey]: isGranted
          },
          lastUpdated: new Date()
        };
      }
      return f;
    });
    saveAndBroadcastFeatures(updatedFeatures);
    toast.success(`Access to "${key}" for ${roleKey} is now ${isGranted ? 'GRANTED' : 'REVOKED'}`);
  };

  const handleToggleSubFeatureEnabled = (moduleKey: string, childKey: string, isEnabled: boolean) => {
    const updatedFeatures = features.map(f => {
      if (f.key === moduleKey && f.children) {
        return {
          ...f,
          children: {
            ...f.children,
            [childKey]: {
              ...f.children[childKey],
              enabled: isEnabled
            }
          },
          lastUpdated: new Date()
        };
      }
      return f;
    });
    saveAndBroadcastFeatures(updatedFeatures);
    toast.success(`Sub-feature "${childKey}" is now ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleToggleSubFeatureRoleAccess = (moduleKey: string, childKey: string, roleKey: UserRole, isGranted: boolean) => {
    const updatedFeatures = features.map(f => {
      if (f.key === moduleKey && f.children) {
        return {
          ...f,
          children: {
            ...f.children,
            [childKey]: {
              ...f.children[childKey],
              roleAccess: {
                ...f.children[childKey].roleAccess,
                [roleKey]: isGranted
              }
            }
          },
          lastUpdated: new Date()
        };
      }
      return f;
    });
    saveAndBroadcastFeatures(updatedFeatures);
    toast.success(`Sub-feature "${childKey}" access for ${roleKey} is now ${isGranted ? 'GRANTED' : 'REVOKED'}`);
  };

  const filteredFeatures = React.useMemo(() => {
    return features.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        f.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [features, searchQuery]);

  if (loading || !dataReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-gray-200 border-t-indigo-600 rounded-full" />
      </div>
    );
  }

  if (role !== 'admin') {
    return null;
  }

  return (
    <CenteredLayout>
      <div className="min-h-screen pb-20">
        <PageHeader
          title="System Gating Control"
          subtitle="Configure global features, sub-capabilities, and AI models."
        />

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-3xl w-fit mb-8 border border-slate-200/50 shadow-sm shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('app')}
            data-testid="admin-tab-app-button"
            className={cn(
              "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2",
              activeTab === 'app'
                ? "bg-white text-slate-900 shadow-md shadow-slate-100"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Settings size={14} />
            Application Features
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            data-testid="admin-tab-ai-button"
            className={cn(
              "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2",
              activeTab === 'ai'
                ? "bg-white text-slate-900 shadow-md shadow-slate-100"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Brain size={14} />
            AI Intelligence Systems
          </button>
        </div>

        {/* Both panels always rendered — CSS hidden prevents unmount/remount.
             This is the fix: previously, the ternary caused <AdminAIFeatureSection>
             to unmount on tab-away and remount on return, firing a useEffect DB
             fetch on every switch. With CSS visibility both panels stay mounted. */}

        {/* ── Application Features Tab ── */}
        <div className={activeTab === 'app' ? '' : 'hidden'}>
          <div className="space-y-6">
            {/* Search Header */}
            <div className="relative max-w-md">
              <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
              <input
                type="text"
                id="admin-feature-search"
                name="admin-feature-search"
                placeholder="Search application modules..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                data-testid="admin-feature-search-input"
                className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3 text-sm font-medium outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all duration-200 shadow-sm"
              />
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFeatures.map(f => {
                const isExpanded = expandedFeature === f.key;
                const children = f.children ? Object.values(f.children) : [];

                return (
                  <div
                    key={f.key}
                    className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">{f.name}</h3>
                        <p className="text-slate-500 text-sm font-medium mt-1 leading-relaxed min-h-[40px]">
                          {f.description}
                        </p>
                      </div>
                    </div>

                    {/* Master switch */}
                    <div className="flex items-center justify-between mb-6 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gating Status</span>
                      <button
                        type="button"
                        title={f.enabled ? `Disable ${f.name}` : `Enable ${f.name}`}
                        onClick={() => handleToggleFeatureEnabled(f.key, !f.enabled)}
                        data-testid={`admin-feature-${f.key}-toggle-button`}
                        className={cn(
                          "w-11 h-6 rounded-full relative transition-all duration-200",
                          f.enabled ? "bg-indigo-600" : "bg-slate-200"
                        )}
                      >
                        <div
                          className={cn(
                            "absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
                            f.enabled ? "right-1" : "left-1"
                          )}
                        />
                      </button>
                    </div>

                    {/* Role Permission Matrix */}
                    <div className="mb-6 py-4 border-y border-slate-100">
                      <div className="flex items-center gap-1.5 mb-3 text-slate-400">
                        <Shield size={12} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Role Visibility Matrix</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {(['admin', 'manager', 'advisor', 'user'] as const).map(role => (
                          <div key={role} className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-bold text-slate-500 capitalize">{role}</span>
                            <button
                              type="button"
                              title={`${f.roleAccess[role] ? 'Revoke' : 'Grant'} ${role} access to ${f.name}`}
                              onClick={() => handleToggleRoleAccess(f.key, role, !f.roleAccess[role])}
                              disabled={!f.enabled}
                              data-testid={`admin-feature-${f.key}-role-${role}-button`}
                              className={cn(
                                "w-8 h-4.5 rounded-full relative transition-all duration-200",
                                f.roleAccess[role] && f.enabled ? "bg-indigo-600" : "bg-slate-200",
                                !f.enabled && "opacity-40 cursor-not-allowed"
                              )}
                            >
                              <div
                                className={cn(
                                  "absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-200",
                                  f.roleAccess[role] && f.enabled ? "right-0.5" : "left-0.5"
                                )}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sub-features configuration trigger button */}
                    {children.length > 0 && (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() => setSelectedSubFeatureModule(f)}
                          data-testid={`admin-feature-${f.key}-subfeatures-button`}
                          className="w-full flex items-center justify-center gap-2 text-indigo-600 hover:text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/70 active:scale-[0.98] transition-all font-black text-[10px] uppercase tracking-widest py-3.5 rounded-2xl border border-indigo-100/50"
                        >
                          <Layers size={13} />
                          Configure Sub-features ({children.length})
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── AI Intelligence Systems Tab ── */}
        <div className={activeTab === 'ai' ? '' : 'hidden'}>
          <AdminAIFeatureSection
            aiFeatures={aiFeatures}
            onSave={handleSaveAIFeatures}
            loading={aiLoading}
          />
        </div>
      </div>

      <AnimatePresence>
        {selectedSubFeatureModule && (
          <>
            {/* Backdrop */}
            <motion.div data-testid="admin-feature-panel-div"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
              onClick={() => setSelectedSubFeatureModule(null)}
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="fixed inset-x-4 top-[10%] bottom-[10%] md:inset-x-auto md:left-1/2 md:top-[15%] md:bottom-[15%] md:-translate-x-1/2 md:w-[600px] bg-white rounded-[32px] shadow-2xl border border-slate-100 z-[101] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <Layers className="text-indigo-600" size={20} />
                    {selectedSubFeatureModule.name} Sub-features
                  </h3>
                  <p className="text-slate-500 text-xs font-semibold mt-1">
                    Manage granular capabilities and role visibilities.
                  </p>
                </div>
                <button
                  type="button"
                  title="Close sub-features panel"
                  onClick={() => setSelectedSubFeatureModule(null)}
                  data-testid="admin-subfeature-modal-close-button"
                  className="rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 w-9 h-9 flex items-center justify-center transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {(() => {
                  const currentModule = features.find(feat => feat.key === selectedSubFeatureModule.key);
                  const childrenList = currentModule?.children ? Object.values(currentModule.children) : [];

                  if (childrenList.length === 0) {
                    return (
                      <div className="text-center text-slate-400 py-8 text-sm">
                        No sub-features available for this module.
                      </div>
                    );
                  }

                  return childrenList.map(child => (
                    <div
                      key={child.key}
                      className={cn(
                        "bg-slate-50 border border-slate-100 rounded-3xl p-5 hover:border-slate-200/50 transition-all",
                        !currentModule?.enabled && "opacity-60"
                      )}
                    >
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div>
                          <span className="text-sm font-black text-slate-900">{child.name}</span>
                          <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{child.key}</span>
                        </div>
                        <button
                          type="button"
                          title={child.enabled ? `Disable ${child.name}` : `Enable ${child.name}`}
                          onClick={() => handleToggleSubFeatureEnabled(currentModule!.key, child.key, !child.enabled)}
                          disabled={!currentModule?.enabled}
                          data-testid={`admin-subfeature-${child.key}-toggle-button`}
                          className={cn(
                            "w-11 h-6 rounded-full relative transition-all duration-200",
                            child.enabled && currentModule?.enabled ? "bg-indigo-600" : "bg-slate-200",
                            !currentModule?.enabled && "cursor-not-allowed"
                          )}
                        >
                          <div
                            className={cn(
                              "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200",
                              child.enabled && currentModule?.enabled ? "right-1" : "left-1"
                            )}
                          />
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-200/50">
                        {(['admin', 'manager', 'advisor', 'user'] as const).map(r => (
                          <div key={r} className="flex flex-col items-center gap-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{r}</span>
                            <button
                              type="button"
                              title={`${child.roleAccess[r] ? 'Revoke' : 'Grant'} ${r} access to ${child.name}`}
                              onClick={() => handleToggleSubFeatureRoleAccess(currentModule!.key, child.key, r, !child.roleAccess[r])}
                              disabled={!child.enabled || !currentModule?.enabled}
                              data-testid={`admin-subfeature-${child.key}-role-${r}-button`}
                              className={cn(
                                "w-9 h-5 rounded-full relative transition-all duration-200",
                                child.roleAccess[r] && child.enabled && currentModule?.enabled ? "bg-indigo-600" : "bg-slate-200",
                                (!child.enabled || !currentModule?.enabled) && "opacity-40 cursor-not-allowed"
                              )}
                            >
                              <div
                                className={cn(
                                  "absolute top-0.5 w-4 h-4 shadow-sm bg-white rounded-full transition-all duration-200",
                                  child.roleAccess[r] && child.enabled && currentModule?.enabled ? "right-0.5" : "left-0.5"
                                )}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedSubFeatureModule(null)}
                  data-testid="admin-subfeature-modal-done-button"
                  className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md shadow-slate-200"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </CenteredLayout>
  );
};
