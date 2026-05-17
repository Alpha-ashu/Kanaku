import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { ChevronLeft, Settings, ToggleRight, ToggleLeft, Shield, RefreshCw, Brain, BarChart2, ChevronRight, Activity, User, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { backendService } from '@/lib/backend-api';
import { ROLE_FEATURES } from '@/lib/featureFlags';

// Storage key for admin feature settings (shared globally)
const ADMIN_FEATURE_SETTINGS_KEY = 'admin_global_feature_settings';
const FEATURE_BROADCAST_CHANNEL = 'feature_settings_channel';

/**
 * Admin Feature Control Panel
 * Only accessible to admin role (shake.job.atgmail.com)
 * Changes here immediately propagate to all users via BroadcastChannel
 */
interface FeatureControl {
 name: string;
 key: string;
 readiness: 'unreleased' | 'beta' | 'released' | 'deprecated';
 description: string;
 lastUpdated: Date;
 roleAccess: {
 admin: boolean;
 manager: boolean;
 advisor: boolean;
 user: boolean;
 };
}

interface FeatureControlBase {
 name: string;
 key: string;
 readiness: 'unreleased' | 'beta' | 'released' | 'deprecated';
 description: string;
 lastUpdated: Date;
}

const getDefaultRoleAccess = (key: string, readiness: 'unreleased' | 'beta' | 'released' | 'deprecated') => {
 if (readiness === 'unreleased') {
 return { admin: true, manager: false, advisor: false, user: false };
 }
 if (readiness === 'deprecated') {
 return { admin: false, manager: false, advisor: false, user: false };
 }
 
 return {
 admin: ROLE_FEATURES.admin[key as keyof typeof ROLE_FEATURES.admin] ?? true,
 manager: ROLE_FEATURES.manager[key as keyof typeof ROLE_FEATURES.manager] ?? false,
 advisor: ROLE_FEATURES.advisor[key as keyof typeof ROLE_FEATURES.advisor] ?? false,
 user: ROLE_FEATURES.user[key as keyof typeof ROLE_FEATURES.user] ?? false,
 };
};

const FEATURES_BASE: FeatureControlBase[] = [
 // Core Navigation Features
 {
 name: 'Dashboard',
 key: 'dashboard',
 readiness: 'released',
 description: 'Main overview with financial summary and quick actions',
 lastUpdated: new Date(),
 },
 {
 name: 'Accounts',
 key: 'accounts',
 readiness: 'released',
 description: 'Bank accounts, wallets, and financial account management',
 lastUpdated: new Date(),
 },
 {
 name: 'Transactions',
 key: 'transactions',
 readiness: 'released',
 description: 'Income and expense tracking with categorization',
 lastUpdated: new Date(),
 },
 {
 name: 'Loans & EMIs',
 key: 'loans',
 readiness: 'released',
 description: 'Loan tracking, EMI calculations, and payment schedules',
 lastUpdated: new Date(),
 },
 {
 name: 'Goals',
 key: 'goals',
 readiness: 'released',
 description: 'Financial goal setting and progress tracking',
 lastUpdated: new Date(),
 },
 {
 name: 'Group Expenses',
 key: 'groups',
 readiness: 'released',
 description: 'Split bills and manage shared expenses with friends',
 lastUpdated: new Date(),
 },
 {
 name: 'Investments',
 key: 'investments',
 readiness: 'released',
 description: 'Portfolio tracking for stocks, crypto, and mutual funds',
 lastUpdated: new Date(),
 },
 {
 name: 'Calendar',
 key: 'calendar',
 readiness: 'released',
 description: 'Visual calendar view of transactions and recurring payments',
 lastUpdated: new Date(),
 },
 {
 name: 'Reports',
 key: 'reports',
 readiness: 'released',
 description: 'Financial reports and analytics with charts',
 lastUpdated: new Date(),
 },
 {
 name: 'Todo Lists',
 key: 'todoLists',
 readiness: 'released',
 description: 'Task management and collaboration features',
 lastUpdated: new Date(),
 },
 {
 name: 'Book Advisor',
 key: 'bookAdvisor',
 readiness: 'released',
 description: 'Users can book financial advisors for sessions',
 lastUpdated: new Date(),
 },
 {
 name: 'Notifications',
 key: 'notifications',
 readiness: 'released',
 description: 'Alerts for bills, budgets, and financial reminders',
 lastUpdated: new Date(),
 },
 {
 name: 'User Profile',
 key: 'userProfile',
 readiness: 'released',
 description: 'Personal profile and account settings',
 lastUpdated: new Date(),
 },
 {
 name: 'Settings',
 key: 'settings',
 readiness: 'released',
 description: 'App preferences, currency, and theme settings',
 lastUpdated: new Date(),
 },
 // Advanced Features
 {
 name: 'Tax Calculator',
 key: 'taxCalculator',
 readiness: 'released',
 description: 'Estimate tax liability for different countries',
 lastUpdated: new Date(),
 },
 {
 name: 'AI Insights',
 key: 'aiInsights',
 readiness: 'unreleased',
 description: 'AI-powered spending insights and recommendations',
 lastUpdated: new Date(),
 },
 {
 name: 'Data Export',
 key: 'dataExport',
 readiness: 'released',
 description: 'Export transactions and reports to CSV/PDF',
 lastUpdated: new Date(),
 },
 {
 name: 'Recurring Transactions',
 key: 'recurringTransactions',
 readiness: 'released',
 description: 'Automatic recurring income and expense entries',
 lastUpdated: new Date(),
 },
 {
 name: 'Budget Alerts',
 key: 'budgetAlerts',
 readiness: 'released',
 description: 'Notifications when spending exceeds budget limits',
 lastUpdated: new Date(),
 },
 {
 name: 'Client Management',
 key: 'clientManagement',
 readiness: 'released',
 description: 'Advisors and Managers can manage their assigned clients and portfolios',
 lastUpdated: new Date(),
 },
 {
 name: 'AI Management',
 key: 'aiManagement',
 readiness: 'unreleased',
 description: 'Centralized control panel for AI models and insights configuration',
 lastUpdated: new Date(),
 },
 {
 name: 'Advisor Verification',
 key: 'managerPanel',
 readiness: 'released',
 description: 'Manager module for approving and verifying advisor applications',
 lastUpdated: new Date(),
 },
];

const FEATURES: FeatureControl[] = FEATURES_BASE.map(f => ({
 ...f,
 roleAccess: getDefaultRoleAccess(f.key, f.readiness)
}));

export const AdminFeaturePanel: React.FC = () => {
 const { setCurrentPage, visibleFeatures, setVisibleFeatures } = useApp();
 const { role, user, loading } = useAuth();
 const [features, setFeatures] = useState<FeatureControl[]>(() => {
 // Load saved settings from localStorage
 const saved = localStorage.getItem(ADMIN_FEATURE_SETTINGS_KEY);
 if (saved) {
 try {
 const parsed = JSON.parse(saved);
 return FEATURES.map(f => {
 const readiness = parsed[f.key]?.readiness || f.readiness;
 const defaultAccess = getDefaultRoleAccess(f.key, readiness);
 return {
 ...f,
 readiness,
 roleAccess: parsed[f.key]?.roleAccess ? { ...defaultAccess, ...parsed[f.key].roleAccess } : defaultAccess,
 lastUpdated: parsed[f.key]?.lastUpdated ? new Date(parsed[f.key].lastUpdated) : f.lastUpdated
 };
 });
 } catch {
 return FEATURES;
 }
 }
 // Fallback: no saved data in localStorage → use hardcoded defaults
 return FEATURES;
 });

 const [searchQuery, setSearchQuery] = useState('');
 const [readinessFilter, setReadinessFilter] = useState<'all' | 'unreleased' | 'beta' | 'released' | 'deprecated'>('all');
 const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'manager' | 'advisor' | 'user'>('all');

 const filteredFeatures = React.useMemo(() => {
 return features.filter(f => {
 // 1. Search Query filter (matches name or description, case-insensitive)
 const matchesSearch = 
 f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
 f.description.toLowerCase().includes(searchQuery.toLowerCase());
 
 // 2. Readiness State filter
 const matchesReadiness = readinessFilter === 'all' || f.readiness === readinessFilter;
 
 // 3. Role Access filter
 const matchesRole = roleFilter === 'all' || f.roleAccess[roleFilter as keyof typeof f.roleAccess] === true;
 
 return matchesSearch && matchesReadiness && matchesRole;
 });
 }, [features, searchQuery, readinessFilter, roleFilter]);

 // Create broadcast channel for real-time sync across tabs/sessions
 const broadcastChannel = React.useMemo(() => {
 try {
 return new BroadcastChannel(FEATURE_BROADCAST_CHANNEL);
 } catch {
 return null; // BroadcastChannel not supported
 }
 }, []);

 // Apply feature visibility based on readiness and user role
 // NOTE: Uses functional update to avoid closing over visibleFeatures state,
 // which would cause this callback to recreate on every render and trigger a loop.
 const applyFeatureVisibility = useCallback((featureList: FeatureControl[]) => {
 const newVisibility: Record<string, boolean> = {};

 featureList.forEach(feature => {
 // Determine visibility based on roleAccess
 let isVisible = false;
 if (feature.roleAccess && typeof feature.roleAccess[role as keyof typeof feature.roleAccess] === 'boolean') {
 isVisible = feature.roleAccess[role as keyof typeof feature.roleAccess];
 } else {
 switch (feature.readiness) {
 case 'unreleased':
 isVisible = role === 'admin';
 break;
 case 'beta':
 isVisible = role === 'admin' || role === 'advisor';
 break;
 case 'released':
 isVisible = true;
 break;
 case 'deprecated':
 isVisible = false;
 break;
 }
 }

 newVisibility[feature.key] = isVisible;
 });

 // Use functional form to avoid closing over stale visibleFeatures
 setVisibleFeatures((prev: any) => ({ ...prev, ...newVisibility }));
 }, [role, setVisibleFeatures]);

 // Load global feature settings from the database on mount to ensure we have the absolute latest state
 useEffect(() => {
 const loadFromDb = async () => {
 try {
 const dbFlags = await backendService.getGlobalFeatureFlags();
 if (dbFlags && Object.keys(dbFlags).length > 0) {
 localStorage.setItem(ADMIN_FEATURE_SETTINGS_KEY, JSON.stringify(dbFlags));
 const updatedFeatures = FEATURES.map(f => {
 const readiness = dbFlags[f.key]?.readiness || f.readiness;
 return {
 ...f,
 readiness,
 roleAccess: dbFlags[f.key]?.roleAccess || getDefaultRoleAccess(f.key, readiness),
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
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []); // Intentionally empty to run only once on mount
 
 // Listen for changes from other tabs/sessions
 useEffect(() => {
 if (!broadcastChannel) return;

 const handleMessage = (event: MessageEvent) => {
 if (event.data.type === 'FEATURE_UPDATE') {
 // Feature update received via broadcast
 setFeatures(event.data.features);
 // Also update the app context visible features
 applyFeatureVisibility(event.data.features);
 toast.info('Feature settings updated by admin');
 }
 };

 broadcastChannel.addEventListener('message', handleMessage);
 return () => broadcastChannel.removeEventListener('message', handleMessage);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [broadcastChannel]);

 // Also listen for storage changes (for cross-session sync)
 useEffect(() => {
 const handleStorageChange = (e: StorageEvent) => {
 if (e.key === ADMIN_FEATURE_SETTINGS_KEY && e.newValue) {
 // Storage change detected
 try {
 const parsed = JSON.parse(e.newValue);
 const updatedFeatures = FEATURES.map(f => {
 const readiness = parsed[f.key]?.readiness || f.readiness;
 const defaultAccess = getDefaultRoleAccess(f.key, readiness);
 return {
 ...f,
 readiness,
 roleAccess: parsed[f.key]?.roleAccess ? { ...defaultAccess, ...parsed[f.key].roleAccess } : defaultAccess,
 lastUpdated: parsed[f.key]?.lastUpdated ? new Date(parsed[f.key].lastUpdated) : f.lastUpdated
 };
 });
 setFeatures(updatedFeatures);
 applyFeatureVisibility(updatedFeatures);
 } catch {
 // Ignore parse errors
 }
 }
 };

 window.addEventListener('storage', handleStorageChange);
 return () => window.removeEventListener('storage', handleStorageChange);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // Redirect non-admins silently to dashboard
 useEffect(() => {
 if (!loading && role !== 'admin') {
 setCurrentPage('dashboard');
 }
 }, [loading, role, setCurrentPage]);

 // Show loading state while auth is loading
 if (loading) {
 return (
 <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-4 sm:p-6 lg:p-8">
 <div className="max-w-5xl mx-auto">
 <div className="flex items-center justify-center py-20">
 <div className="animate-spin w-10 h-10 border-4 border-gray-200 border-t-purple-600 rounded-full"></div>
 </div>
 </div>
 </div>
 );
 }

 // Don't render anything for non-admins (redirect will happen via useEffect)
 if (role !== 'admin') {
 return null;
 }

 const saveAndBroadcastFeatures = (updatedFeatures: FeatureControl[]) => {
 setFeatures(updatedFeatures);

 // Save to localStorage for persistence
 const settingsToSave = updatedFeatures.reduce((acc, f) => {
 acc[f.key] = { readiness: f.readiness, roleAccess: f.roleAccess, lastUpdated: f.lastUpdated.toISOString() };
 return acc;
 }, {} as Record<string, { readiness: string; roleAccess: any; lastUpdated: string }>);

 localStorage.setItem(ADMIN_FEATURE_SETTINGS_KEY, JSON.stringify(settingsToSave));

 // Broadcast to other tabs/sessions immediately
 if (broadcastChannel) {
 broadcastChannel.postMessage({
 type: 'FEATURE_UPDATE',
 features: updatedFeatures,
 timestamp: new Date().toISOString()
 });
 }

 // Save to backend database for permanent persistence across sessions and roles
 void backendService.saveGlobalFeatureFlags(settingsToSave).catch((err) => {
 console.error('Failed to sync global feature flags to backend database:', err);
 });
 };

 const handleToggleFeature = (key: string, newReadiness: FeatureControl['readiness']) => {
 const updatedFeatures = features.map((f) =>
 f.key === key
 ? { ...f, readiness: newReadiness, roleAccess: getDefaultRoleAccess(f.key, newReadiness), lastUpdated: new Date() }
 : f
 );

 saveAndBroadcastFeatures(updatedFeatures);

 // Dispatch custom event for same-tab listeners
 window.dispatchEvent(new CustomEvent('adminFeatureUpdate', {
 detail: { features: updatedFeatures, key, newReadiness }
 }));

 // Apply visibility changes immediately
 applyFeatureVisibility(updatedFeatures);

 toast.success(`Feature"${key}" updated to"${newReadiness}" - Changes applied to all users!`);
 };

 const handleToggleRoleAccess = (key: string, roleKey: keyof FeatureControl['roleAccess'], isGranted: boolean) => {
 const updatedFeatures = features.map((f) =>
 f.key === key
 ? { ...f, roleAccess: { ...f.roleAccess, [roleKey]: isGranted }, lastUpdated: new Date() }
 : f
 );

 saveAndBroadcastFeatures(updatedFeatures);

 // Dispatch custom event for same-tab listeners
 window.dispatchEvent(new CustomEvent('adminFeatureUpdate', {
 detail: { features: updatedFeatures, key }
 }));

 // Apply visibility changes immediately
 applyFeatureVisibility(updatedFeatures);

 toast.success(`Access for ${roleKey} to feature"${key}" updated!`);
 };

 const getReadinessBadgeColor = (readiness: FeatureControl['readiness']) => {
 switch (readiness) {
 case 'unreleased':
 return 'bg-gray-100 text-gray-700';
 case 'beta':
 return 'bg-blue-100 text-blue-700';
 case 'released':
 return 'bg-green-100 text-green-700';
 case 'deprecated':
 return 'bg-red-100 text-red-700';
 default:
 return 'bg-gray-100 text-gray-700';
 }
 };

 return (
 <CenteredLayout maxWidth="max-w-[1920px]">
 <div className="w-full">
 <div className="pb-4 lg:pb-6">
 <PageHeader
 title="Admin Panel"
 subtitle="System monitoring & feature control"
 icon={<Shield size={20} className="sm:w-6 sm:h-6" />}
 showBack
 />
 </div>
 <div className="space-y-8">
 {/* Admin Info */}
 <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-[32px] p-8 shadow-xl relative overflow-hidden group">
 <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
 <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
 
 <div className="relative z-10">
 <div className="flex items-center gap-4 mb-2">
 <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
 <User size={24} className="text-white" />
 </div>
 <div>
 <h3 className="text-xl font-black text-white tracking-tight">Active Session</h3>
 <p className="text-sm font-medium text-slate-300">{user?.email}</p>
 </div>
 </div>
 <p className="text-slate-400 text-sm mt-4 font-medium max-w-2xl leading-relaxed">
 You have unrestricted administrative access. Control feature visibility, readiness states, and system boundaries across all user segments globally.
 </p>
 </div>
 </div>

 {/* Quick Access */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

 {/* AI Intelligence Dashboard card */}
 <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm group hover:border-indigo-100 hover:shadow-xl hover:shadow-indigo-50 transition-all flex flex-col">
 <div className="flex items-center gap-4 mb-6">
 <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
 <Brain size={28} />
 </div>
 <div>
 <h3 className="text-lg font-black text-slate-900 tracking-tight">AI Intelligence</h3>
 <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900 text-white mt-1">Admin Only</span>
 </div>
 </div>
 <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8 flex-1">
 Spending pattern analytics, user intelligence, risk alerts, AI accuracy monitor, prediction engine controls, and raw AI data viewer.
 </p>
 <button
 id="open-ai-dashboard-btn"
 onClick={() => setCurrentPage('admin-ai')}
 className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200"
 >
 <Activity size={16} />
 Open AI Dashboard
 </button>
 </div>

 {/* Sync Monitor card */}
 <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm group hover:border-violet-100 hover:shadow-xl hover:shadow-violet-50 transition-all flex flex-col">
 <div className="flex items-center gap-4 mb-6">
 <div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
 <BarChart2 size={28} />
 </div>
 <div>
 <h3 className="text-lg font-black text-slate-900 tracking-tight">Sync Monitor</h3>
 <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900 text-white mt-1">Admin Only</span>
 </div>
 </div>
 <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8 flex-1">
 Monitor offline-first sync health, view the sync queue, inspect event logs, retry failed items, and trigger force-resyncs.
 </p>
 <button
 id="open-sync-monitor-btn"
 onClick={() => setCurrentPage('sync-monitor')}
 className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-violet-700 active:scale-95 transition-all shadow-lg shadow-violet-200"
 >
 <RefreshCw size={16} />
 Open Sync Monitor
 </button>
 </div>
 </div>

 {/* Divider */}
 <div className="flex items-center gap-4 py-4 mb-6">
 <div className="flex-1 h-px bg-slate-100" />
 <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Master Feature Matrix</span>
 <div className="flex-1 h-px bg-slate-100" />
 </div>

 {/* Filters Bar */}
 <div className="bg-white/80 backdrop-blur-md rounded-[32px] border border-slate-100 p-6 sm:p-8 mb-8 flex flex-col gap-6 shadow-sm">
 <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
 {/* Search Field */}
 <div className="flex-1 relative">
 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
 <input
 type="text"
 placeholder="Search features by name or description..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-slate-300 focus:bg-white rounded-2xl text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-all"
 />
 {searchQuery && (
 <button 
 onClick={() => setSearchQuery('')}
 className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 hover:text-slate-900 transition-colors"
 >
 CLEAR
 </button>
 )}
 </div>

 {/* Counter Indicator */}
 <div className="flex items-center justify-between lg:justify-end gap-3 text-xs font-black text-slate-500 uppercase tracking-widest px-2 lg:px-0">
 <span>Total Matches:</span>
 <span className="bg-slate-950 text-white px-3 py-1.5 rounded-xl">
 {filteredFeatures.length} of {features.length}
 </span>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-50">
 {/* Readiness Filter */}
 <div>
 <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Filter by Readiness</span>
 <div className="flex flex-wrap gap-2">
 {(['all', 'unreleased', 'beta', 'released', 'deprecated'] as const).map((state) => (
 <button
 key={state}
 onClick={() => setReadinessFilter(state)}
 className={cn(
"px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
 readinessFilter === state
 ?"bg-slate-900 text-white shadow-md shadow-slate-200"
 :"bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
 )}
 >
 {state}
 </button>
 ))}
 </div>
 </div>

 {/* Role Access Filter */}
 <div>
 <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Filter by Role Access</span>
 <div className="flex flex-wrap gap-2">
 {(['all', 'admin', 'manager', 'advisor', 'user'] as const).map((roleKey) => (
 <button
 key={roleKey}
 onClick={() => setRoleFilter(roleKey)}
 className={cn(
"px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
 roleFilter === roleKey
 ?"bg-violet-600 text-white shadow-md shadow-violet-200"
 :"bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-955"
 )}
 >
 {roleKey === 'all' ? 'All Roles' : `${roleKey} access`}
 </button>
 ))}
 </div>
 </div>
 </div>
 </div>

 {/* Features Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
 {filteredFeatures.map((feature) => (
 <div
 key={feature.key}
 className="bg-white rounded-[32px] border border-slate-100 p-8 hover:shadow-xl hover:shadow-slate-100/50 transition-all flex flex-col"
 >
 <div className="flex items-start justify-between mb-6">
 <div className="flex-1 pr-4">
 <h3 className="text-xl font-black text-slate-900 tracking-tight">{feature.name}</h3>
 <p className="text-slate-500 text-sm mt-2 font-medium leading-relaxed min-h-[40px]">{feature.description}</p>
 </div>
 </div>

 {/* Readiness Status */}
 <div className="mb-6">
 <span className={cn("inline-block px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest",
 feature.readiness === 'unreleased' ?"bg-slate-100 text-slate-500" :
 feature.readiness === 'beta' ?"bg-blue-50 text-blue-600" :
 feature.readiness === 'released' ?"bg-emerald-50 text-emerald-600" :
"bg-rose-50 text-rose-600"
 )}>
 {feature.readiness} State
 </span>
 </div>

 {/* Status Buttons */}
 <div className="grid grid-cols-2 gap-3 mb-6 mt-auto">
 {(['unreleased', 'beta', 'released', 'deprecated'] as const).map((status) => (
 <button
 key={status}
 onClick={() => handleToggleFeature(feature.key, status)}
 className={cn(
"px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
 feature.readiness === status
 ?"bg-slate-900 text-white shadow-lg shadow-slate-200 scale-100"
 :"bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900 scale-[0.98]"
 )}
 >
 {status}
 </button>
 ))}
 </div>

 {/* Role-Specific Access Matrix */}
 <div className="mb-6 bg-slate-50 rounded-2xl p-4 border border-slate-100">
 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Role Visibility Override</p>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
 {(['admin', 'manager', 'advisor', 'user'] as const).map((r) => (
 <div key={r} className="flex flex-col items-center gap-2">
 <span className="text-xs font-bold text-slate-700 capitalize">{r}</span>
 <button
 onClick={() => handleToggleRoleAccess(feature.key, r, !feature.roleAccess[r])}
 className={cn(
"w-12 h-6 rounded-full relative transition-all",
 feature.roleAccess[r] ?"bg-indigo-600" :"bg-slate-300"
 )}
 >
 <div className={cn(
"absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
 feature.roleAccess[r] ?"right-1" :"left-1"
 )} />
 </button>
 </div>
 ))}
 </div>
 </div>

 {/* Last Updated */}
 <div className="flex items-center justify-between mt-auto pt-6 border-t border-slate-50">
 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last modified</span>
 <span className="text-xs font-bold text-slate-900">
 {feature.lastUpdated.toLocaleDateString()}
 </span>
 </div>
 </div>
 ))}

 {/* Empty State */}
 {filteredFeatures.length === 0 && (
 <div className="col-span-full py-16 flex flex-col items-center justify-center text-center bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm">
 <div className="w-16 h-16 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mb-4">
 <Search size={28} />
 </div>
 <h4 className="text-lg font-black text-slate-900 uppercase tracking-wide">No Features Found</h4>
 <p className="text-slate-400 text-sm font-medium mt-2 max-w-md leading-relaxed">
 We couldn't find any features matching your search query or selected filter criteria. Try resetting your filters.
 </p>
 <button
 onClick={() => {
 setSearchQuery('');
 setReadinessFilter('all');
 setRoleFilter('all');
 }}
 className="mt-6 px-6 py-3 bg-slate-950 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 active:scale-95 transition-all"
 >
 Clear Filters
 </button>
 </div>
 )}
 </div>

 {/* Feature Readiness Guide */}
 <div className="bg-slate-50 rounded-[32px] p-8 border border-slate-100 mt-12">
 <div className="flex items-center gap-3 mb-8">
 <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">
 <Shield size={20} className="text-slate-700" />
 </div>
 <h3 className="text-lg font-black text-slate-900 tracking-tight">Deployment Strategy Guide</h3>
 </div>
 
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
 <div className="bg-white p-6 rounded-3xl shadow-sm">
 <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Stage 1</p>
 <p className="font-black text-slate-900 mb-1">Unreleased</p>
 <p className="text-xs text-slate-500 font-medium leading-relaxed">Hidden locally. Visible exclusively to system administrators for internal verification.</p>
 </div>
 <div className="bg-white p-6 rounded-3xl shadow-sm border border-blue-50">
 <p className="text-xs font-black text-blue-400 uppercase tracking-widest mb-2">Stage 2</p>
 <p className="font-black text-blue-900 mb-1">Beta</p>
 <p className="text-xs text-slate-500 font-medium leading-relaxed">Soft launch mode. Accessible to both administrators and registered advisors for pilot testing.</p>
 </div>
 <div className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-50">
 <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-2">Stage 3</p>
 <p className="font-black text-emerald-900 mb-1">Released</p>
 <p className="text-xs text-slate-500 font-medium leading-relaxed">Production ready. Unrestricted access granted to all verified system users globally.</p>
 </div>
 <div className="bg-white p-6 rounded-3xl shadow-sm border border-rose-50">
 <p className="text-xs font-black text-rose-400 uppercase tracking-widest mb-2">Archived</p>
 <p className="font-black text-rose-900 mb-1">Deprecated</p>
 <p className="text-xs text-slate-500 font-medium leading-relaxed">End of lifecycle. Component is completely hidden from all interfaces pending hard removal.</p>
 </div>
 </div>
 </div>
 </div>
 </div>
 </CenteredLayout>
 );
};

export default AdminFeaturePanel;
