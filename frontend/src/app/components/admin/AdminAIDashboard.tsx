import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
 adminAIService,
 AIAccuracyDto,
 AIInsightFeedDto,
 AIOverviewDto,
 AIPatternAnalyticsDto,
 AIRawUserDataDto,
 AIUserIntelligenceDto,
} from '@/services/adminAIService';
import {
 Users,
 Brain,
 AlertTriangle,
 TrendingUp,
 RefreshCw,
 Play,
 Zap,
 ChevronLeft,
 ChevronRight,
 Clock,
 Target,
 BarChart2,
 Layers,
 ShieldAlert,
 Activity,
 Eye,
 ChevronDown,
 ChevronUp,
 Sparkles,
 Database,
 CheckCircle2,
 Settings,
 Trash2,
 Plus,
 AlertCircle,
} from 'lucide-react';
import {
 Area,
 AreaChart,
 Bar,
 BarChart,
 CartesianGrid,
 Cell,
 Legend,
 ResponsiveContainer,
 Tooltip,
 XAxis,
 YAxis,
} from 'recharts';

// KANAKUAI ADMIN DASHBOARD
// Enhanced with new AI learning metrics and insights

// Types 
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

// Helpers 
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatCurrency = (value: number) =>
 new Intl.NumberFormat('en-IN', {
 style: 'currency',
 currency: 'INR',
 notation: 'compact',
 maximumFractionDigits: 1,
 }).format(value);
const formatDateTime = (iso: string | null) => {
 if (!iso) return 'Not available';
 const d = new Date(iso);
 if (Number.isNaN(d.getTime())) return 'Not available';
 return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

// Risk badge 
const riskBadge = (score: number) => {
 if (score >= 70) return 'bg-red-100 text-red-700';
 if (score >= 40) return 'bg-amber-100 text-amber-700';
 return 'bg-green-100 text-green-700';
};
const riskLabel = (score: number) => {
 if (score >= 70) return 'High';
 if (score >= 40) return 'Medium';
 return 'Low';
};

// Insight type badge colour 
const insightBadge = (type: string): string => {
 const map: Record<string, string> = {
 spending_spike: 'bg-red-100 text-red-700',
 savings_opportunity: 'bg-green-100 text-green-700',
 risk_flag: 'bg-orange-100 text-orange-700',
 budget_exceeded: 'bg-rose-100 text-rose-700',
 investment_tip: 'bg-violet-100 text-violet-700',
 goal_progress: 'bg-sky-100 text-sky-700',
 };
 return map[type] ?? 'bg-blue-100 text-blue-700';
};

// Chart colours 
const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6'];

// Section card wrapper 
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
 <div className={`bg-white rounded-2xl border border-gray-200 p-5 shadow-sm ${className}`}>
 {children}
 </div>
);

// Section heading (matches SyncMonitor style) 
const SectionHeading: React.FC<{ icon: React.ReactNode; title: string; iconColor?: string; badge?: string }> = ({
 icon, title, iconColor = 'text-blue-500', badge,
}) => (
 <div className="flex items-center gap-2 mb-4">
 <span className={iconColor}>{icon}</span>
 <h3 className="font-semibold text-gray-900">{title}</h3>
 {badge && (
 <span className="ml-auto text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{badge}</span>
 )}
 </div>
);

// Stat mini-card (matches SyncMonitor style) 
const StatMini: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; color: string }> = ({
 icon, label, value, color,
}) => (
 <div className="flex flex-col gap-1 p-3 bg-white rounded-xl">
 <div className="flex items-center gap-2">
 <span className={color}>{icon}</span>
 <span className="text-xs text-gray-500">{label}</span>
 </div>
 <span className={`text-2xl font-bold ${color}`}>{value}</span>
 </div>
);

// Tooltip for charts 
const ChartTooltip: React.FC<{
 active?: boolean;
 payload?: Array<{ name: string; value: number; color: string }>;
 label?: string;
}> = ({ active, payload, label }) => {
 if (!active || !payload?.length) return null;
 return (
 <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs">
 <p className="mb-1 text-gray-500 font-medium">{label}</p>
 {payload.map((p) => (
 <p key={p.name} style={{ color: p.color }} className="font-semibold">
 {p.name}: {typeof p.value === 'number' && p.value > 1000 ? formatCurrency(p.value) : p.value}
 </p>
 ))}
 </div>
 );
};

// Main component 
export const AdminAIDashboard: React.FC = () => {
 const { setCurrentPage } = useApp();
 const { role, loading: authLoading, dataReady } = useAuth();

 const [state, setState] = useState<LoadState>('idle');
 const [error, setError] = useState<string>('');
 const [refreshing, setRefreshing] = useState(false);
 const [runningFeatures, setRunningFeatures] = useState(false);
 const [runningPredictions, setRunningPredictions] = useState(false);

 const [overview, setOverview] = useState<AIOverviewDto | null>(null);
 const [users, setUsers] = useState<AIUserIntelligenceDto[]>([]);
 const [insights, setInsights] = useState<AIInsightFeedDto[]>([]);
 const [patterns, setPatterns] = useState<AIPatternAnalyticsDto | null>(null);
 const [accuracy, setAccuracy] = useState<AIAccuracyDto | null>(null);

 const [selectedUserId, setSelectedUserId] = useState<string>('');
 const [rawData, setRawData] = useState<AIRawUserDataDto | null>(null);
 const [rawLoading, setRawLoading] = useState(false);
 const [expandedRaw, setExpandedRaw] = useState<'features' | 'insights' | 'events' | null>('features');
 const [insightFilter, setInsightFilter] = useState<string>('all');
 const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'insights' | 'ai-config'>('overview');

 // AI configurations tab state
 const [aiConfig, setAiConfig] = useState<any>(null);
 const [savingConfig, setSavingConfig] = useState(false);
 const [newKeyword, setNewKeyword] = useState('');
 const [newKeywordCategory, setNewKeywordCategory] = useState('Food & Dining');
 const [keywordSearch, setKeywordSearch] = useState('');

 const isFetching = useRef(false);

 const loadDashboard = useCallback(async () => {
   if (isFetching.current) return;
   isFetching.current = true;
   setState('loading');
   setError('');
   try {
     const [overviewData, usersData, insightsData, patternsData, accuracyData, configData] = await Promise.all([
       adminAIService.getOverview(),
       adminAIService.getUsers(40),
       adminAIService.getInsights(60),
       adminAIService.getPatterns(),
       adminAIService.getAccuracy(),
       adminAIService.getAIConfig().catch(() => null),
     ]);
     setOverview(overviewData ?? null);
     setUsers(usersData ?? []);
     setInsights(insightsData ?? []);
     setPatterns(patternsData ?? null);
     setAccuracy(accuracyData ?? null);
     if (configData && configData.success) {
       setAiConfig(configData.data);
     }
     setState('ready');
   } catch (e) {
     setState('error');
     setError(e instanceof Error ? e.message : 'Failed to load AI dashboard');
   } finally {
     isFetching.current = false;
   }
 }, []);

  useEffect(() => {
    if (authLoading || !dataReady || role !== 'admin') return;
    void loadDashboard();
  }, [loadDashboard, authLoading, dataReady, role]);

 const handleRefresh = async () => {
 setRefreshing(true);
 await loadDashboard();
 setRefreshing(false);
 };

 const handleRunFeatures = async () => {
 setRunningFeatures(true);
 try { await adminAIService.runFeatureEngine(); await loadDashboard(); }
 finally { setRunningFeatures(false); }
 };

 const handleRunPredictions = async () => {
 setRunningPredictions(true);
 try { await adminAIService.runPredictionEngine(); await loadDashboard(); }
 finally { setRunningPredictions(false); }
 };

 const loadRawUserData = async (userId: string) => {
 if (!userId) return;
 setRawLoading(true);
 try { setRawData(await adminAIService.getRawUserData(userId) ?? null); }
 catch (e) { setError(e instanceof Error ? e.message : 'Failed to load raw data'); }
 finally { setRawLoading(false); }
 };

 const updateConfigField = (section: string, field: string, value: any) => {
   setAiConfig((prev: any) => ({
     ...prev,
     [section]: {
       ...prev[section],
       [field]: value
     }
   }));
 };

 const updateImportAlias = (aliasField: string, csvString: string) => {
   const arr = csvString.split(',').map(s => s.trim()).filter(Boolean);
   setAiConfig((prev: any) => ({
     ...prev,
     import: {
       ...prev.import,
       columnAliases: {
         ...prev.import.columnAliases,
         [aliasField]: arr
       }
     }
   }));
 };

 const addKeywordRule = () => {
   if (!newKeyword.trim()) return;
   const kw = newKeyword.trim().toLowerCase();
   setAiConfig((prev: any) => ({
     ...prev,
     smartRules: {
       ...prev.smartRules,
       categoryKeywords: {
         ...prev.smartRules.categoryKeywords,
         [kw]: newKeywordCategory
       }
     }
   }));
   setNewKeyword('');
   toast.success(`Locally added rule: "${kw}" -> ${newKeywordCategory}. Remember to save.`);
 };

 const deleteKeywordRule = (kw: string) => {
   setAiConfig((prev: any) => {
     const updated = { ...prev.smartRules.categoryKeywords };
     delete updated[kw];
     return {
       ...prev,
       smartRules: {
         ...prev.smartRules,
         categoryKeywords: updated
       }
     };
   });
   toast.success(`Locally deleted rule for "${kw}". Remember to save.`);
 };

 const handleSaveConfig = async () => {
   if (!aiConfig) return;
   setSavingConfig(true);
   try {
     const res = await adminAIService.updateAIConfig(aiConfig);
     if (res.success) {
       setAiConfig(res.data);
       toast.success('AI configurations deployed and saved successfully');
     } else {
       toast.error(res.error || 'Failed to save configurations');
     }
   } catch (err: any) {
     toast.error(err.message || 'Failed to save configurations');
   } finally {
     setSavingConfig(false);
   }
 };

 // Derived
 const insightTypeCounts = useMemo(() =>
 insights.reduce<Record<string, number>>((acc, i) => {
 acc[i.insightType] = (acc[i.insightType] ?? 0) + 1;
 return acc;
 }, {}), [insights]);

 const uniqueTypes = useMemo(() => ['all', ...Object.keys(insightTypeCounts)], [insightTypeCounts]);

 const filteredInsights = useMemo(() => {
 if (insightFilter === 'all') return insights.slice(0, 15);
 return insights.filter((i) => i.insightType === insightFilter).slice(0, 15);
 }, [insights, insightFilter]);

  // Access guard 
  if (authLoading || !dataReady) {
    return (
      <CenteredLayout>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-10 h-10 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading AI telemetry...</p>
        </div>
      </CenteredLayout>
    );
  }

  if (role !== 'admin') {
  return (
  <CenteredLayout>
  <div className="text-center py-12">
  <ShieldAlert size={40} className="mx-auto mb-3 text-red-400" />
  <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
  <p className="text-gray-600 mb-4">Only admins can access the AI Intelligence Dashboard.</p>
  <button data-testid="admin-aidashboard-go-to-dashboard"
  onClick={() => setCurrentPage('dashboard')}
  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
  >
  Go to Dashboard
  </button>
  </div>
  </CenteredLayout>
  );
 }

 return (
 <CenteredLayout>
 <div className="space-y-6 pb-8">

 {/* Header */}
 <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
 <div className="flex items-start gap-3">
 <button data-testid="admin-aidashboard-back-to-admin-panel"
 onClick={() => setCurrentPage('admin-feature-panel')}
 className="md:!hidden p-2 hover:bg-gray-100 rounded-lg transition-colors mt-0.5 md:mt-0"
 aria-label="Back to admin panel"
 >
 <ChevronLeft size={24} className="text-gray-600" />
 </button>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <Brain size={22} className="text-indigo-600 shrink-0" />
 <h2 className="text-xl md:text-2xl font-bold text-gray-900 truncate">AI Intelligence Dashboard</h2>
 </div>
 <p className="text-gray-500 mt-0.5 text-xs md:text-sm">Backend AI engine Admin only</p>
 </div>
 </div>
 {/* Action buttons */}
 <div className="flex flex-wrap items-center gap-2 pl-[3.25rem] md:pl-0 shrink-0">
 <button data-testid="admin-aidashboard-refresh"
 id="ai-refresh-btn"
 onClick={() => void handleRefresh()}
 disabled={refreshing || state === 'loading'}
 className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
 >
 <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
 Refresh
 </button>
 <button data-testid="admin-aidashboard-button"
 id="ai-run-features-btn"
 onClick={() => void handleRunFeatures()}
 disabled={runningFeatures}
 className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
 >
 <Play size={14} className={runningFeatures ? 'animate-pulse' : ''} />
 {runningFeatures ? 'Running...' : 'Run Features'}
 </button>
 <button data-testid="admin-aidashboard-button-2"
 id="ai-run-predictions-btn"
 onClick={() => void handleRunPredictions()}
 disabled={runningPredictions}
 className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50"
 >
 <Zap size={14} className={runningPredictions ? 'animate-pulse' : ''} />
 {runningPredictions ? 'Running...' : 'Run Predictions'}
 </button>
 </div>
 </div>

 {/* Loading */}
 {state === 'loading' && (
 <Card data-testid="admin-aidashboard-card">
 <div className="flex flex-col items-center justify-center py-16 gap-3">
 <div className="w-10 h-10 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
 <p className="text-sm text-gray-500">Loading AI telemetry...</p>
 </div>
 </Card>
 )}

 {/* Error */}
 {state === 'error' && (
 <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
 <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
 <div>
 <p className="text-sm font-semibold text-red-800">Failed to load AI Dashboard</p>
 <p className="text-xs text-red-600 mt-0.5">{error}</p>
 </div>
 </div>
 )}

 {/* Ready */}
 {state === 'ready' && overview && patterns && accuracy && (
 <>
 {/* KPI overview row */}
 <Card data-testid="admin-aidashboard-card-2">
 <SectionHeading icon={<Activity size={18} />} title="AI Overview" iconColor="text-blue-500" />
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
 <StatMini
 icon={<Users size={14} />}
 label="Users Analyzed"
 value={overview.usersAnalyzed.toLocaleString()}
 color="text-indigo-600"
 />
 <StatMini
 icon={<Sparkles size={14} />}
 label="Insights Generated"
 value={overview.insightsGenerated.toLocaleString()}
 color="text-violet-600"
 />
 <StatMini
 icon={<AlertTriangle size={14} />}
 label="Risk Alerts"
 value={overview.riskAlerts.toLocaleString()}
 color="text-red-600"
 />
 <StatMini
 icon={<Clock size={14} />}
 label="Last Training"
 value={
 overview.lastTrainingTime
 ? new Date(overview.lastTrainingTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
 : 'N/A'
 }
 color="text-amber-600"
 />
 </div>
 {overview.lastTrainingTime && (
 <p className="text-xs text-gray-400 mt-3">
 Full timestamp: {formatDateTime(overview.lastTrainingTime)}
 </p>
 )}
 </Card>

 {/* AI Accuracy */}
 <Card data-testid="admin-aidashboard-card-3">
 <SectionHeading icon={<Target size={18} />} title="AI Accuracy Monitor" iconColor="text-emerald-500" />
 <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
 {[
 { label: 'Success Rate', value: formatPercent(accuracy.successRate), color: 'text-emerald-600', bg: 'bg-emerald-50' },
 { label: 'High Confidence', value: formatPercent(accuracy.highConfidenceRate), color: 'text-blue-600', bg: 'bg-blue-50' },
 { label: 'False Positives', value: formatPercent(accuracy.falsePositiveRate), color: 'text-rose-600', bg: 'bg-rose-50' },
 { label: 'Avg Confidence', value: accuracy.averageConfidence.toFixed(2), color: 'text-violet-600', bg: 'bg-violet-50' },
 { label: 'Total Predictions', value: accuracy.totalPredictions.toLocaleString(), color: 'text-gray-700', bg: 'bg-white' },
 ].map(({ label, value, color, bg }) => (
 <div key={label} className={`${bg} rounded-xl p-3`}>
 <p className="text-xs text-gray-500 mb-1">{label}</p>
 <p className={`text-xl font-bold ${color}`}>{value}</p>
 </div>
 ))}
 </div>
 </Card>

  {/* Tabs: Overview / Users / Insights / AI Config */}
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
  {/* Tab bar */}
  <div className="flex border-b border-gray-100 flex-wrap">
  {([
  { id: 'overview', label: 'Charts & Patterns' },
  { id: 'users', label: `User Intelligence (${users.length})` },
  { id: 'insights', label: `AI Insights Feed (${insights.length})` },
  { id: 'ai-config', label: 'AI Settings & Deployment' },
  ] as const).map((tab) => (
 <button data-testid={`admin-aidashboard-button-3-${tab.id}`}
 key={tab.id}
 onClick={() => setActiveTab(tab.id)}
 className={[
 'flex-1 py-3 text-sm font-medium transition-colors',
 activeTab === tab.id
 ? 'border-b-2 border-indigo-500 text-indigo-600 bg-indigo-50'
 : 'text-gray-500 hover:text-gray-700',
 ].join(' ')}
 >
 {tab.label}
 </button>
 ))}
 </div>

 <div className="p-5">

 {/* OVERVIEW TAB */}
 {activeTab === 'overview' && (
 <div className="space-y-6">

 {/* Monthly Trends */}
 <div>
 <div className="flex items-center gap-2 mb-4">
 <TrendingUp size={16} className="text-indigo-500" />
 <h4 className="font-semibold text-gray-900 text-sm">Monthly Financial Trends</h4>
 <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
 {patterns.monthlyGrowth.length} months
 </span>
 </div>
 {patterns.monthlyGrowth.length > 0 ? (
 <ResponsiveContainer width="100%" height={220}>
 <AreaChart data={patterns.monthlyGrowth} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id="incG" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
 <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
 </linearGradient>
 <linearGradient id="expG" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
 <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
 </linearGradient>
 <linearGradient id="netG" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
 <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
 <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
 <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
 tickFormatter={(v) => `INR${(v / 1000).toFixed(0)}k`} />
 <Tooltip content={<ChartTooltip />} />
 <Legend wrapperStyle={{ fontSize: 12 }} />
 <Area type="monotone" dataKey="income" stroke="#6366f1" strokeWidth={2} fill="url(#incG)" name="Income" />
 <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2} fill="url(#expG)" name="Expense" />
 <Area type="monotone" dataKey="net" stroke="#10b981" strokeWidth={2} fill="url(#netG)" name="Net" />
 </AreaChart>
 </ResponsiveContainer>
 ) : (
 <div className="flex items-center justify-center h-40 bg-white rounded-xl text-sm text-gray-400">
 No monthly trend data yet.
 </div>
 )}
 </div>

 {/* Two-column: category bar + insight trends */}
 <div className="grid gap-6 lg:grid-cols-2">
 {/* Category Distribution */}
 <div>
 <div className="flex items-center gap-2 mb-4">
 <BarChart2 size={16} className="text-violet-500" />
 <h4 className="font-semibold text-gray-900 text-sm">Category Distribution</h4>
 </div>
 {patterns.categoryDistribution.length > 0 ? (
 <ResponsiveContainer width="100%" height={200}>
 <BarChart
 data={patterns.categoryDistribution}
 margin={{ top: 4, right: 4, left: 0, bottom: 20 }}
 barCategoryGap="30%"
 >
 <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
 <XAxis dataKey="category" tick={{ fill: '#94a3b8', fontSize: 10 }}
 axisLine={false} tickLine={false} angle={-30} textAnchor="end" />
 <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
 <Tooltip content={<ChartTooltip />} />
 <Bar dataKey="users" name="Users" radius={[5, 5, 0, 0]}>
 {patterns.categoryDistribution.map((_, i) => (
 <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
 ))}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 ) : (
 <div className="flex items-center justify-center h-40 bg-white rounded-xl text-sm text-gray-400">
 No category data.
 </div>
 )}
 </div>

 {/* Category progress bars */}
 <div>
 <div className="flex items-center gap-2 mb-4">
 <Layers size={16} className="text-amber-500" />
 <h4 className="font-semibold text-gray-900 text-sm">Category User Count</h4>
 </div>
 <div className="space-y-3">
 {patterns.categoryDistribution.slice(0, 7).map((entry, idx) => {
 const mx = Math.max(...patterns.categoryDistribution.map((e) => e.users));
 const pct = mx > 0 ? Math.min(100, (entry.users / mx) * 100) : 0;
 return (
 <div key={entry.category} className="space-y-1">
 <div className="flex justify-between text-xs">
 <span className="text-gray-700">{entry.category}</span>
 <span className="text-gray-500">{entry.users} users</span>
 </div>
 <div className="h-1.5 rounded-full bg-gray-100">
 <div
 className="h-1.5 rounded-full transition-all"
 style={{
 width: `${pct}%`,
 backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
 }}
 />
 </div>
 </div>
 );
 })}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* USERS TAB */}
 {activeTab === 'users' && (
 <div className="space-y-5">
 <div className="overflow-x-auto rounded-xl">
 <table data-testid="admin-aidashboard-table" className="min-w-full text-sm">
 <thead>
 <tr className="border-b border-gray-100">
 {['User', 'Spend Score', 'Risk Score', 'Risk', 'Savings Rate', 'Top Category', 'Avg Spend', ''].map((h) => (
 <th key={h} className="py-2.5 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">
 {h}
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-50">
 {users.length === 0 ? (
 <tr>
 <td colSpan={8} className="py-10 text-center text-sm text-gray-400">
 No user data available.
 </td>
 </tr>
 ) : (
 users.map((u) => (
 <tr
 key={u.userId}
 className={`hover:bg-gray-50 transition-colors ${selectedUserId === u.userId ? 'bg-indigo-50' : ''}`}
 >
 <td className="py-3 pr-4">
 <p className="font-medium text-gray-900 truncate max-w-[140px]">{u.name}</p>
 <p className="text-[11px] text-gray-400 truncate max-w-[140px]">{u.email}</p>
 </td>
 <td className="py-3 pr-4">
 <div className="flex items-center gap-2">
 <div className="h-1.5 w-16 rounded-full bg-gray-100">
 <div
 className="h-1.5 rounded-full bg-indigo-500"
 style={{ width: `${Math.min(100, u.spendScore)}%` }}
 />
 </div>
 <span className="text-gray-700 text-xs">{u.spendScore.toFixed(1)}</span>
 </div>
 </td>
 <td className="py-3 pr-4 text-gray-700 text-xs">{u.riskScore.toFixed(1)}</td>
 <td className="py-3 pr-4">
 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${riskBadge(u.riskScore)}`}>
 {riskLabel(u.riskScore)}
 </span>
 </td>
 <td className="py-3 pr-4 text-gray-700 text-xs">{formatPercent(u.savingsRate * 100)}</td>
 <td className="py-3 pr-4">
 <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg">{u.topCategory}</span>
 </td>
 <td className="py-3 pr-4 text-gray-700 text-xs">{formatCurrency(u.avgSpend)}</td>
 <td className="py-3">
 <button data-testid={`admin-aidashboard-inspect-${u.userId}`}
 id={`inspect-user-${u.userId}`}
 onClick={() => {
 setSelectedUserId(u.userId);
 void loadRawUserData(u.userId);
 setActiveTab('overview');
 setTimeout(() => {
 document.getElementById('raw-viewer')?.scrollIntoView({ behavior: 'smooth' });
 }, 100);
 }}
 className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
 >
 <Eye size={11} /> Inspect
 </button>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* INSIGHTS TAB */}
 {activeTab === 'insights' && (
 <div className="space-y-4">
 {/* Filter chips */}
 <div className="flex flex-wrap gap-2">
 {uniqueTypes.slice(0, 7).map((type) => (
 <button data-testid={`admin-aidashboard-button-4-${type}`}
 key={type}
 onClick={() => setInsightFilter(type)}
 className={[
 'px-3 py-1 rounded-full text-xs font-medium transition-colors',
 insightFilter === type
 ? 'bg-indigo-600 text-white'
 : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
 ].join(' ')}
 >
 {type === 'all' ? 'All' : type.replace(/_/g, ' ')}
 {type !== 'all' && (
 <span className="ml-1 opacity-70">{insightTypeCounts[type]}</span>
 )}
 </button>
 ))}
 </div>

 {/* Insights list */}
 <div className="space-y-2 max-h-[460px] overflow-y-auto">
 {filteredInsights.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
 <Sparkles size={28} />
 <p className="text-sm">No insights for this filter.</p>
 </div>
 ) : (
 filteredInsights.map((insight) => (
 <div
 key={insight.id}
 className="border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition-colors text-sm"
 >
 <div className="flex items-center justify-between gap-3">
 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${insightBadge(insight.insightType)}`}>
 {insight.insightType.replace(/_/g, ' ')}
 </span>
 <span className="text-gray-400 text-xs shrink-0">
 {new Date(insight.createdAt).toLocaleDateString('en-IN')}
 </span>
 </div>
 <p className="text-gray-700 mt-1.5 truncate">{insight.userEmail}</p>
 <div className="mt-1.5 flex items-center gap-2">
 <div className="flex-1 h-1.5 rounded-full bg-gray-100">
 <div
 className="h-1.5 rounded-full bg-indigo-500"
 style={{ width: `${Math.round(insight.confidenceScore * 100)}%` }}
 />
 </div>
 <span className="text-xs text-gray-400 shrink-0">
 {formatPercent(insight.confidenceScore * 100)} confidence
 </span>
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 )}

 {/* AI CONFIGURATION TAB */}
 {activeTab === 'ai-config' && aiConfig && (
 <div className="space-y-6">
 {/* OCR Engine Config */}
 <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4">
 <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
 <Brain size={18} className="text-indigo-600" />
 <h4 className="font-semibold text-slate-800 text-sm">1. AI Bill Scanning Engine (OCR + Parsing)</h4>
 </div>
 <div className="grid gap-4 sm:grid-cols-2">
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">OCR Provider</label>
 <select data-testid="admin-aidashboard-select"
 value={aiConfig.ocr.provider}
 onChange={(e) => updateConfigField('ocr', 'provider', e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
 >
 <option data-testid="admin-aidashboard-tesseract-only-offline-local" value="tesseract">Tesseract-only (Offline/Local heuristic parsing)</option>
 <option data-testid="admin-aidashboard-gemini-only-direct-multimodal" value="gemini">Gemini-only (Direct multimodal LLM scanning)</option>
 <option data-testid="admin-aidashboard-hybrid-tesseract-ocr-gemini" value="hybrid">Hybrid (Tesseract OCR + Gemini 1.5 JSON mapper)</option>
 </select>
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">Gemini Model Version</label>
 <input data-testid="admin-aidashboard-e-g-gemini-1"
 type="text"
 value={aiConfig.ocr.model}
 onChange={(e) => updateConfigField('ocr', 'model', e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
 placeholder="e.g. gemini-1.5-flash"
 />
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">
 Confidence Acceptance Threshold: <span className="font-mono text-indigo-600 font-bold">{Math.round(aiConfig.ocr.confidenceThreshold * 100)}%</span>
 </label>
 <input data-testid="admin-aidashboard-input"
 type="range"
 min="0"
 max="1"
 step="0.05"
 value={aiConfig.ocr.confidenceThreshold}
 onChange={(e) => updateConfigField('ocr', 'confidenceThreshold', parseFloat(e.target.value))}
 className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
 />
 <span className="text-[10px] text-slate-400">Scans with confidence below this threshold will prompt manual review.</span>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">Max Retries</label>
 <input data-testid="admin-aidashboard-input-2"
 type="number"
 min="1"
 max="10"
 value={aiConfig.ocr.maxRetries}
 onChange={(e) => updateConfigField('ocr', 'maxRetries', parseInt(e.target.value))}
 className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none"
 />
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">Timeout (ms)</label>
 <input data-testid="admin-aidashboard-input-3"
 type="number"
 step="1000"
 value={aiConfig.ocr.timeoutMs}
 onChange={(e) => updateConfigField('ocr', 'timeoutMs', parseInt(e.target.value))}
 className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none font-mono"
 />
 </div>
 </div>
 </div>
 </div>

 {/* Spreadsheet Import Config */}
 <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4">
 <div className="flex items-center justify-between border-b border-slate-200 pb-3">
 <div className="flex items-center gap-2">
 <Database size={18} className="text-emerald-600" />
 <h4 className="font-semibold text-slate-800 text-sm">2. Smart Spreadsheet Import Pipeline</h4>
 </div>
 <label className="relative inline-flex items-center cursor-pointer">
 <input data-testid="admin-aidashboard-checkbox"
 type="checkbox"
 checked={aiConfig.import.enabled}
 onChange={(e) => updateConfigField('import', 'enabled', e.target.checked)}
 className="sr-only peer"
 />
 <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
 <span className="ml-2 text-xs font-semibold text-slate-600">Enabled</span>
 </label>
 </div>
 
 {aiConfig.import.enabled && (
 <div className="space-y-4">
 <div className="grid gap-4 sm:grid-cols-2">
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">Allowed File Extensions</label>
 <div className="flex items-center gap-4 mt-2">
 {['csv', 'xlsx', 'xls'].map((ext) => {
 const exists = aiConfig.import.formats.includes(ext);
 return (
 <label key={ext} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
 <input data-testid={`admin-aidashboard-checkbox-2-${ext}`}
 type="checkbox"
 checked={exists}
 onChange={(e) => {
 const next = e.target.checked
 ? [...aiConfig.import.formats, ext]
 : aiConfig.import.formats.filter((f: string) => f !== ext);
 updateConfigField('import', 'formats', next);
 }}
 className="rounded text-emerald-600 focus:ring-emerald-500"
 />
 <span className="font-mono uppercase font-bold text-xs">{ext}</span>
 </label>
 );
 })}
 </div>
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">Duplicate Entry Detection Window</label>
 <div className="flex items-center gap-2">
 <input data-testid="admin-aidashboard-input-4"
 type="number"
 min="0"
 max="60"
 value={aiConfig.import.duplicateCheckWindowDays}
 onChange={(e) => updateConfigField('import', 'duplicateCheckWindowDays', parseInt(e.target.value))}
 className="w-20 text-xs border border-slate-200 rounded-lg p-2 bg-white text-center focus:outline-none"
 />
 <span className="text-xs text-slate-500 font-semibold">days</span>
 </div>
 </div>
 </div>

 <div className="border-t border-slate-200/80 pt-3">
 <h5 className="text-xs font-bold text-slate-700 mb-2">Spreadsheet Header Aliases (for automatic column mapping)</h5>
 <div className="grid gap-4 sm:grid-cols-2">
 {[
 { key: 'amount', label: 'Amount column aliases' },
 { key: 'description', label: 'Description column aliases' },
 { key: 'date', label: 'Transaction Date column aliases' },
 { key: 'category', label: 'Category column aliases' }
 ].map((item) => (
 <div key={item.key}>
 <label className="block text-[11px] font-semibold text-slate-500 mb-1 capitalize">{item.label}</label>
 <input data-testid={`admin-aidashboard-e-g-amount-value-${item.key}`}
 type="text"
 defaultValue={aiConfig.import.columnAliases[item.key].join(', ')}
 onBlur={(e) => updateImportAlias(item.key, e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
 placeholder="e.g. amount, value, debit"
 />
 </div>
 ))}
 </div>
 <p className="text-[10px] text-slate-400 mt-2">Enter aliases separated by commas. These aliases are matched fuzzy style during import parsing.</p>
 </div>
 </div>
 )}
 </div>

 {/* Voice Assistant Config */}
 <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4">
 <div className="flex items-center justify-between border-b border-slate-200 pb-3">
 <div className="flex items-center gap-2">
 <Zap size={18} className="text-violet-600" />
 <h4 className="font-semibold text-slate-800 text-sm">3. Voice Financial NLP Assistant</h4>
 </div>
 <label className="relative inline-flex items-center cursor-pointer">
 <input data-testid="admin-aidashboard-checkbox-3"
 type="checkbox"
 checked={aiConfig.voice.enabled}
 onChange={(e) => updateConfigField('voice', 'enabled', e.target.checked)}
 className="sr-only peer"
 />
 <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
 <span className="ml-2 text-xs font-semibold text-slate-600">Enabled</span>
 </label>
 </div>

 {aiConfig.voice.enabled && (
 <div className="grid gap-4 sm:grid-cols-2">
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">ASR Speech Engine Provider</label>
 <select data-testid="admin-aidashboard-select-2"
 value={aiConfig.voice.provider}
 onChange={(e) => updateConfigField('voice', 'provider', e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-500"
 >
 <option data-testid="admin-aidashboard-web-speech-api-chrome" value="webkit">Web Speech API (Chrome local browser speech recognition)</option>
 <option data-testid="admin-aidashboard-open-ai-whisper-1" value="whisper">OpenAI Whisper-1 API (Requires backend API key)</option>
 <option data-testid="admin-aidashboard-google-gemini-audio-multimodal" value="gemini">Google Gemini Audio Multimodal (Requires backend API key)</option>
 </select>
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">ASR Model Name (Gemini/Whisper)</label>
 <input data-testid="admin-aidashboard-e-g-gemini-1-2"
 type="text"
 value={aiConfig.voice.model}
 onChange={(e) => updateConfigField('voice', 'model', e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
 placeholder="e.g. gemini-1.5-flash or whisper-1"
 />
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">Default Input Language</label>
 <input data-testid="admin-aidashboard-e-g-en-us"
 type="text"
 value={aiConfig.voice.language}
 onChange={(e) => updateConfigField('voice', 'language', e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
 placeholder="e.g. en-US, en-IN, hi-IN"
 />
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">
 Auto-save Confidence threshold: <span className="font-mono text-violet-600 font-bold">{Math.round(aiConfig.voice.autoSaveThreshold * 100)}%</span>
 </label>
 <input data-testid="admin-aidashboard-input-5"
 type="range"
 min="0"
 max="1"
 step="0.05"
 value={aiConfig.voice.autoSaveThreshold}
 onChange={(e) => updateConfigField('voice', 'autoSaveThreshold', parseFloat(e.target.value))}
 className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
 />
 <span className="text-[10px] text-slate-400">Transcribed segments with intent confidence below this will prompt approval.</span>
 </div>
 </div>
 )}
 </div>

 {/* Smart Keyword Mappings */}
 <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4">
 <div className="flex items-center justify-between border-b border-slate-200 pb-3">
 <div className="flex items-center gap-2">
 <Sparkles size={18} className="text-amber-500" />
 <h4 className="font-semibold text-slate-800 text-sm">4. Smart Categorization Rules & Keywords Mappings</h4>
 </div>
 <span className="text-xs text-slate-400 font-medium">
 {Object.keys(aiConfig.smartRules?.categoryKeywords || {}).length} rules configured
 </span>
 </div>

 {/* Add keyword rule */}
 <div className="bg-white border border-slate-200 rounded-xl p-3 grid gap-3 sm:grid-cols-3 items-end">
 <div>
 <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Keyword</label>
 <input data-testid="admin-aidashboard-e-g-starbucks-fuel"
 type="text"
 value={newKeyword}
 onChange={(e) => setNewKeyword(e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
 placeholder="e.g. starbucks, fuel, flat"
 />
 </div>
 <div>
 <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Map to Category</label>
 <select data-testid="admin-aidashboard-select-3"
 value={newKeywordCategory}
 onChange={(e) => setNewKeywordCategory(e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white focus:outline-none"
 >
 <option data-testid="admin-aidashboard-food-dining" value="Food & Dining">Food & Dining</option>
 <option data-testid="admin-aidashboard-transport" value="Transport">Transport</option>
 <option data-testid="admin-aidashboard-housing" value="Housing">Housing</option>
 <option data-testid="admin-aidashboard-shopping" value="Shopping">Shopping</option>
 <option data-testid="admin-aidashboard-health" value="Health">Health</option>
 <option data-testid="admin-aidashboard-entertainment" value="Entertainment">Entertainment</option>
 <option data-testid="admin-aidashboard-bills" value="Bills">Bills</option>
 <option data-testid="admin-aidashboard-groceries" value="Groceries">Groceries</option>
 <option data-testid="admin-aidashboard-education" value="Education">Education</option>
 <option data-testid="admin-aidashboard-salary" value="Salary">Salary</option>
 <option data-testid="admin-aidashboard-business" value="Business">Business</option>
 <option data-testid="admin-aidashboard-others" value="Others">Others</option>
 </select>
 </div>
 <button data-testid="admin-aidashboard-add-rule"
 type="button"
 onClick={addKeywordRule}
 className="w-full text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
 >
 <Plus size={14} /> Add Rule
 </button>
 </div>

 {/* Search keyword rules */}
 <div className="flex gap-2">
 <input data-testid="admin-aidashboard-search-keyword-mappings"
 type="text"
 value={keywordSearch}
 onChange={(e) => setKeywordSearch(e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none"
 placeholder="Search keyword mappings..."
 />
 </div>

 {/* Keyword list */}
 <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 font-sans">
 {Object.entries(aiConfig.smartRules?.categoryKeywords || {})
 .filter(([kw, cat]) => 
 kw.includes(keywordSearch.toLowerCase()) || 
 (cat as string).toLowerCase().includes(keywordSearch.toLowerCase())
 )
 .map(([kw, cat]) => (
 <div key={kw} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50 transition-colors">
 <span className="font-mono text-xs font-semibold text-slate-800">{kw}</span>
 <div className="flex items-center gap-3">
 <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-200">{cat as string}</span>
 <button data-testid={`admin-aidashboard-delete-rule-${kw}`}
 type="button"
 onClick={() => deleteKeywordRule(kw)}
 className="text-slate-400 hover:text-red-600 p-1 transition-colors"
 title="Delete rule"
 >
 <Trash2 size={13} />
 </button>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Rollout & Deployment Control */}
 <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4">
 <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
 <Settings size={18} className="text-slate-600" />
 <h4 className="font-semibold text-slate-800 text-sm">5. Deployments, Rollouts & Versioning</h4>
 </div>
 <div className="grid gap-4 sm:grid-cols-2">
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">
 Rollout Target Percentage: <span className="font-mono text-slate-700 font-bold">{aiConfig.deployment.rolloutPercentage}%</span>
 </label>
 <input data-testid="admin-aidashboard-input-6"
 type="range"
 min="0"
 max="100"
 step="5"
 value={aiConfig.deployment.rolloutPercentage}
 onChange={(e) => updateConfigField('deployment', 'rolloutPercentage', parseInt(e.target.value))}
 className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
 />
 <span className="text-[10px] text-slate-400">Controls what percentage of users receive the advanced AI feature set.</span>
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">Active Release Version</label>
 <input data-testid="admin-aidashboard-e-g-v1-0"
 type="text"
 value={aiConfig.deployment.activeVersion}
 onChange={(e) => updateConfigField('deployment', 'activeVersion', e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none font-mono"
 placeholder="e.g. v1.0.0"
 />
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">Target Environment</label>
 <select data-testid="admin-aidashboard-select-4"
 value={aiConfig.deployment.environment}
 onChange={(e) => updateConfigField('deployment', 'environment', e.target.value)}
 className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none"
 >
 <option data-testid="admin-aidashboard-development-sandbox" value="dev">Development / Sandbox</option>
 <option data-testid="admin-aidashboard-qa-testing" value="test">QA / Testing</option>
 <option data-testid="admin-aidashboard-staging-pre-prod" value="staging">Staging / Pre-prod</option>
 <option data-testid="admin-aidashboard-production" value="prod">Production</option>
 </select>
 </div>
 <div>
 <label className="block text-xs font-semibold text-slate-600 mb-1">Beta Testers (Emails, separated by commas)</label>
 <textarea data-testid="admin-aidashboard-user1-example-com-user2"
 value={aiConfig.deployment.betaUsers.join(', ')}
 onChange={(e) => {
 const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
 updateConfigField('deployment', 'betaUsers', list);
 }}
 rows={2}
 className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
 placeholder="user1@example.com, user2@example.com"
 />
 </div>
 </div>
 </div>

 {/* Save panel */}
 <div className="flex items-center justify-between border-t border-slate-200 pt-5">
 <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
 <AlertCircle size={14} className="shrink-0" />
 <span>Deploying configs updates these values globally for all users instantly.</span>
 </div>
 <button data-testid="admin-aidashboard-button-5"
 type="button"
 onClick={handleSaveConfig}
 disabled={savingConfig}
 className="flex items-center gap-2 px-5 py-3 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 text-xs shadow-md shadow-indigo-100"
 >
 {savingConfig ? (
 <>
 <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 Deploying...
 </>
 ) : (
 <>
 <CheckCircle2 size={14} /> Deploy Configurations
 </>
 )}
 </button>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Raw AI Data Viewer */}
 <Card data-testid="admin-aidashboard-card-4">
 <div id="raw-viewer">
 <SectionHeading icon={<Database size={18} />} title="Raw AI Data Viewer" iconColor="text-gray-500" />
 <p className="text-xs text-gray-500 mb-4">
 Click <strong>Inspect</strong> on any user in the User Intelligence tab to explore their features, insights, and event logs.
 </p>

 {selectedUserId && (
 <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
 <ChevronRight size={14} className="text-indigo-500" />
 Viewing user: <span className="font-mono text-indigo-600">{selectedUserId}</span>
 </div>
 )}

 {rawLoading && (
 <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
 <div className="w-4 h-4 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
 Loading raw AI data...
 </div>
 )}

 {!rawLoading && rawData && (
 <div className="space-y-2">
 {(
 [
 { key: 'features', label: 'User Features', data: rawData.features, icon: <Sparkles size={14} /> },
 { key: 'insights', label: 'AI Insights', data: rawData.insights, icon: <Brain size={14} /> },
 { key: 'events', label: 'Event Logs', data: rawData.events, icon: <Activity size={14} /> },
 ] as const
 ).map(({ key, label, data, icon }) => (
 <div key={key} className="rounded-xl border border-gray-100 overflow-hidden">
 <button data-testid={`admin-aidashboard-button-6-${key}`}
 onClick={() => setExpandedRaw(expandedRaw === key ? null : key)}
 className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
 >
 <span className="text-indigo-500">{icon}</span>
 {label}
 <span className="ml-auto text-gray-400">
 {expandedRaw === key
 ? <ChevronUp size={14} />
 : <ChevronDown size={14} />
 }
 </span>
 </button>
 {expandedRaw === key && (
 <div className="border-t border-gray-100 bg-white p-4">
 <pre className="max-h-56 overflow-auto text-xs text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
 {JSON.stringify(data, null, 2)}
 </pre>
 </div>
 )}
 </div>
 ))}
 </div>
 )}

 {!rawLoading && !rawData && !selectedUserId && (
 <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
 <Database size={28} />
 <p className="text-sm">No user selected. Go to User Intelligence tab and click Inspect.</p>
 </div>
 )}
 </div>
 </Card>
 </>
 )}
 </div>
 </CenteredLayout>
 );
};

export default AdminAIDashboard;

