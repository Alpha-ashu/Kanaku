import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, Shield, Bell, ChevronRight, Loader2, AlertTriangle, Target, Zap } from 'lucide-react';
import { backendService } from '@/lib/backend-api';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

interface Recommendation {
 type: string;
 title: string;
 message: string;
 priority: number;
 actionLabel?: string;
}

interface Insight {
 category: string;
 label: string;
 value: string | number;
}

interface AIInsightsData {
 healthScore?: number;
 recommendations: Recommendation[];
 insights: Insight[];
 fraudAlerts: Array<{ reason: string; severity: string; amount: number; message?: string }>;
 upcomingBills: Array<{ merchant: string; predictedAmount: number; predictedDate: string }>;
}

const scoreColor = (score: number) => {
 if (score >= 75) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
 if (score >= 50) return 'text-amber-600 bg-amber-50 border-amber-200';
 return 'text-rose-600 bg-rose-50 border-rose-200';
};

const recommendationIcon = (type: string) => {
 switch (type) {
 case 'budget_alert': return <AlertTriangle size={14} className="text-amber-500" />;
 case 'goal_suggestion': return <Target size={14} className="text-purple-500" />;
 case 'investment_tip': return <TrendingUp size={14} className="text-teal-500" />;
 default: return <Zap size={14} className="text-indigo-500" />;
 }
};

export const AIInsightsCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
 const { aiCapabilities, currency } = useApp();
 const { user, loading: authLoading } = useAuth();
 const [data, setData] = useState<AIInsightsData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 1; // Only retry once

  const isAIDisabled = aiCapabilities?.aiAutomation?.enabled === false;

  useEffect(() => {
    if (isAIDisabled) {
      setLoading(false);
      return;
    }

    if (authLoading) {
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    const fetchInsights = async () => {
      try {
        setLoading(true);
        setError(false);
        const result = await backendService.get<AIInsightsData>('/ai/insights');
        // Older servers could omit a list; the card must not crash on that.
        setData(result ? {
          ...result,
          recommendations: result.recommendations ?? [],
          insights: result.insights ?? [],
          fraudAlerts: result.fraudAlerts ?? [],
          upcomingBills: result.upcomingBills ?? [],
        } : null);
        setRetryCount(0); // Reset retry count on success
      } catch (err: any) {
        console.warn('[AIInsightsCard] Failed to fetch insights (non-critical):', err?.status, err?.message);
        setError(true);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [isAIDisabled, user, authLoading]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-3">
        <Loader2 size={18} className="animate-spin text-slate-400" />
        <span className="text-sm text-slate-500">Analyzing your finances...</span>
      </div>
    );
  }

  // Silently fail without showing error UI
  if (error || !data) {
    return null;
  }

 const topRecs = data.recommendations.slice(0, compact ? 2 : 4);

  return (
  <div className="bg-white rounded-[28px] sm:rounded-[32px] border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] overflow-hidden">
  {/* Header */}
  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
  <div className="flex items-center gap-3">
  <div className="w-9 h-9 rounded-2xl bg-purple-50 text-[#8B5CF6] border border-purple-100/60 flex items-center justify-center">
  <Brain size={16} />
  </div>
  <div>
  <p className="text-sm font-bold text-slate-900">AI Insights</p>
  <p className="text-2xs text-slate-400">Powered by KANAKU Intelligence</p>
  </div>
  </div>
  {data.healthScore !== undefined && (
  <div className={cn('px-3 py-1 rounded-full border text-xs font-bold', scoreColor(data.healthScore))}>
  {data.healthScore}/100
  </div>
  )}
  </div>

  {/* Fraud Alerts */}
  {data.fraudAlerts.length > 0 && (
  <div className="mx-4 mt-4 rounded-2xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 flex items-start gap-2">
  <Shield size={14} className="text-rose-500 mt-0.5 shrink-0" />
  <div>
  <p className="text-xs font-bold text-rose-700 mb-0.5">
  {data.fraudAlerts.length === 1 ? '1 unusually large expense' : `${data.fraudAlerts.length} unusually large expenses`}
  </p>
  <p className="text-xs text-rose-600">{data.fraudAlerts[0]?.message ?? 'Review your recent transactions for anything you don\'t recognise.'}</p>
  </div>
  </div>
  )}

  {/* Upcoming Bills */}
  {data.upcomingBills.length > 0 && !compact && (
  <div className="px-4 pt-4">
  <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 mb-2">Upcoming Bills</p>
  <div className="space-y-1.5">
  {data.upcomingBills.slice(0, 3).map((bill, idx) => (
  <div key={idx} className="flex items-center justify-between py-2 px-3.5 bg-purple-50/50 rounded-2xl border border-purple-100/60">
  <div className="flex items-center gap-2">
  <Bell size={12} className="text-purple-500" />
  <span className="text-xs font-medium text-purple-900 capitalize">{bill.merchant}</span>
  </div>
  <span className="text-xs font-bold text-purple-700">{formatCurrencyAmount(bill.predictedAmount, currency, { maximumFractionDigits: 0 })} · {new Date(bill.predictedDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
  </div>
  ))}
  </div>
  </div>
  )}

  {/* Recommendations */}
  {topRecs.length > 0 && (
  <div className="px-4 pt-4 pb-4 space-y-2">
  {!compact && <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 mb-2">Recommendations</p>}
  {topRecs.map((rec, idx) => (
  <div key={idx} className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100">
  <div className="mt-0.5 shrink-0">{recommendationIcon(rec.type)}</div>
  <div className="flex-1 min-w-0">
  <p className="text-xs font-bold text-slate-800">{rec.title}</p>
  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{rec.message}</p>
  </div>
  {rec.actionLabel && <ChevronRight size={14} className="text-slate-400 mt-1 shrink-0" />}
  </div>
  ))}
  </div>
  )}

  {topRecs.length === 0 && data.fraudAlerts.length === 0 && (
  <div className="px-5 py-4 text-center">
  <p className="text-sm text-slate-500">Your finances look healthy! ✨</p>
  </div>
  )}
  </div>
 );
};
