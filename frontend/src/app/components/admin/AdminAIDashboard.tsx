import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
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

// KANKUAI ADMIN DASHBOARD
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
 const { role } = useAuth();

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
 const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'insights'>('overview');

 const loadDashboard = useCallback(async () => {
 setState('loading');
 setError('');
 try {
 const [overviewData, usersData, insightsData, patternsData, accuracyData] = await Promise.all([
 adminAIService.getOverview(),
 adminAIService.getUsers(40),
 adminAIService.getInsights(60),
 adminAIService.getPatterns(),
 adminAIService.getAccuracy(),
 ]);
 setOverview(overviewData);
 setUsers(usersData);
 setInsights(insightsData);
 setPatterns(patternsData);
 setAccuracy(accuracyData);
 setState('ready');
 } catch (e) {
 setState('error');
 setError(e instanceof Error ? e.message : 'Failed to load AI dashboard');
 }
 }, []);

 useEffect(() => { void loadDashboard(); }, [loadDashboard]);

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
 try { setRawData(await adminAIService.getRawUserData(userId)); }
 catch (e) { setError(e instanceof Error ? e.message : 'Failed to load raw data'); }
 finally { setRawLoading(false); }
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
 if (role !== 'admin') {
 return (
 <CenteredLayout>
 <div className="text-center py-12">
 <ShieldAlert size={40} className="mx-auto mb-3 text-red-400" />
 <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
 <p className="text-gray-600 mb-4">Only admins can access the AI Intelligence Dashboard.</p>
 <button
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
 <button
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
 <button
 id="ai-refresh-btn"
 onClick={() => void handleRefresh()}
 disabled={refreshing || state === 'loading'}
 className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
 >
 <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
 Refresh
 </button>
 <button
 id="ai-run-features-btn"
 onClick={() => void handleRunFeatures()}
 disabled={runningFeatures}
 className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
 >
 <Play size={14} className={runningFeatures ? 'animate-pulse' : ''} />
 {runningFeatures ? 'Running...' : 'Run Features'}
 </button>
 <button
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
 <Card>
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
 <Card>
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
 <Card>
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

 {/* Tabs: Overview / Users / Insights */}
 <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
 {/* Tab bar */}
 <div className="flex border-b border-gray-100">
 {([
 { id: 'overview', label: 'Charts & Patterns' },
 { id: 'users', label: `User Intelligence (${users.length})` },
 { id: 'insights', label: `AI Insights Feed (${insights.length})` },
 ] as const).map((tab) => (
 <button
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
 <table className="min-w-full text-sm">
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
 <button
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
 <button
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
 </div>
 </div>

 {/* Raw AI Data Viewer */}
 <Card>
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
 <button
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

