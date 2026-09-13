import React, { useState, useMemo, useEffect } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { FinancialAmount } from '@/app/components/ui/FinancialAmount';
import {
  Bell, CheckCircle2, ShieldAlert, Sliders, Mail, Smartphone,
  MessageSquare, Plus, Trash2, ArrowLeft, ShieldCheck, Wallet,
  TrendingUp, AlertTriangle, X, Sparkles, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';
import { syncBudgets, pushBudgetUpdate, deleteBudgetEverywhere } from '@/services/featureSyncService';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { cn } from '@/lib/utils';

interface BudgetLimit {
  id: string;
  category: string;
  limit: number;
  spent: number;
  threshold: number;
}

interface AlertEvent {
  id: number;
  category: string;
  message: string;
  type: 'warning' | 'critical';
  timestamp: string;
}

const CATEGORY_PRESETS = [
  'Food & Dining', 'Groceries', 'Utilities', 'Shopping',
  'Entertainment', 'Transportation', 'Healthcare', 'Housing'
];

export const BudgetAlertsPage: React.FC = () => {
  const { currency, setCurrentPage } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newLimit, setNewLimit] = useState<number>(0);
  const [newThreshold, setNewThreshold] = useState<number>(85);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  // Reconcile with the backend on open
  useEffect(() => {
    void syncBudgets();
  }, []);

  // Notification channel preferences — persisted to Dexie settings
  const notifPrefs = useLiveQuery(async () => {
    const [email, push, sms] = await Promise.all([
      db.settings.get('budget_alert_email'),
      db.settings.get('budget_alert_push'),
      db.settings.get('budget_alert_sms'),
    ]);
    return {
      email: email?.value ?? true,
      push: push?.value ?? true,
      sms: sms?.value ?? false,
    };
  }, []) ?? { email: true, push: true, sms: false };

  const emailAlerts = notifPrefs.email;
  const pushAlerts = notifPrefs.push;
  const smsAlerts = notifPrefs.sms;

  // Live Query from Dexie DB
  const limits = useLiveQuery(async () => {
    const dbBudgets = await db.budgets.toArray();
    
    if (dbBudgets.length === 0) {
      return [];
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const currentMonthExpenses = await db.transactions
      .filter(t => t.type === 'expense' && new Date(t.date) >= startOfMonth && new Date(t.date) <= endOfMonth)
      .toArray();

    return dbBudgets.map(b => {
      const spent = currentMonthExpenses
        .filter(t => t.category.toLowerCase() === b.category.toLowerCase())
        .reduce((sum, t) => sum + t.amount, 0);
      return {
        id: b.id,
        category: b.category,
        limit: b.amount,
        spent,
        threshold: (b as any).threshold || 85,
      };
    });
  }, []) || [];

  // Aggregated stats
  const totalBudgetCap = useMemo(() => limits.reduce((sum, l) => sum + l.limit, 0), [limits]);
  const totalSpent = useMemo(() => limits.reduce((sum, l) => sum + l.spent, 0), [limits]);
  const safeBuffer = Math.max(0, totalBudgetCap - totalSpent);
  const breachesCount = useMemo(() => limits.filter(l => l.spent > l.limit).length, [limits]);
  const warningsCount = useMemo(() => limits.filter(l => l.spent <= l.limit && (l.limit > 0 ? (l.spent / l.limit) * 100 : 0) >= l.threshold).length, [limits]);

  // Dynamically calculate alert events based on current budget limits
  const alerts = useMemo<AlertEvent[]>(() => {
    const list: AlertEvent[] = [];
    limits.forEach((limit, idx) => {
      if (dismissedAlerts.includes(limit.category)) return;

      const pct = limit.limit > 0 ? (limit.spent / limit.limit) * 100 : 0;
      const currencySymbol = currency === 'INR' ? '₹' : currency;

      if (limit.spent > limit.limit) {
        list.push({
          id: idx,
          category: limit.category,
          message: `CRITICAL: ${limit.category} spending of ${currencySymbol}${limit.spent.toLocaleString()} has breached the limit of ${currencySymbol}${limit.limit.toLocaleString()}!`,
          type: 'critical',
          timestamp: 'Just now',
        });
      } else if (pct >= limit.threshold) {
        list.push({
          id: idx,
          category: limit.category,
          message: `WARNING: ${limit.category} spend is at ${pct.toFixed(0)}% of your ${currencySymbol}${limit.limit.toLocaleString()} budget.`,
          type: 'warning',
          timestamp: 'Just now',
        });
      }
    });
    return list;
  }, [limits, dismissedAlerts, currency]);

  const handleUpdateThreshold = async (id: string, val: number) => {
    try {
      const budget = await db.budgets.get(id);
      if (!budget) return;

      await db.budgets.update(id, { threshold: val, updatedAt: new Date() });
      await pushBudgetUpdate({ id, cloudId: budget.cloudId }, { threshold: val });
      toast.success('Warning threshold updated');
    } catch (error) {
      console.error('Failed to update threshold:', error);
      toast.error('Could not update the threshold');
    }
  };

  const handleToggleChannel = async (key: 'budget_alert_email' | 'budget_alert_push' | 'budget_alert_sms', current: boolean, label: string) => {
    const next = !current;
    await db.settings.put({ key, value: next, timestamp: new Date() });
    toast.success(`${label} notifications ${next ? 'Enabled' : 'Disabled'}`);
  };

  const handleDismissAlert = (category: string) => {
    setDismissedAlerts(prev => [...prev, category]);
    toast.info('Alert event dismissed');
  };

  const handleAddBudget = async () => {
    if (!newCategory.trim()) {
      toast.error('Category is required');
      return;
    }
    if (newLimit <= 0) {
      toast.error('Limit must be greater than 0');
      return;
    }

    try {
      const budgetId = crypto.randomUUID();
      await db.budgets.put({
        id: budgetId,
        category: newCategory.trim(),
        amount: newLimit,
        period: 'monthly',
        spent: 0,
        createdAt: new Date(),
        threshold: newThreshold,
        syncStatus: 'pending',
      });

      toast.success('Budget ceiling added successfully');
      setNewCategory('');
      setNewLimit(0);
      setNewThreshold(85);
      setShowAddModal(false);

      try {
        const resp = await backendService.createBudget({
          category: newCategory.trim(),
          amount: newLimit,
          period: 'monthly',
          threshold: newThreshold,
        });
        if (resp?.id) {
          await db.budgets.update(budgetId, { cloudId: resp.id, syncStatus: 'synced' });
        }
      } catch {
        // Left pending — syncBudgets() retries it on next visit
      }
    } catch (error) {
      console.error('Failed to add budget:', error);
      toast.error('Failed to save budget');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    try {
      const budget = await db.budgets.get(id);
      if (!budget) return;
      await deleteBudgetEverywhere(budget);
      toast.success('Budget deleted successfully');
    } catch (error) {
      console.error('Failed to delete budget:', error);
      toast.error('Failed to delete budget');
    }
  };

  return (
    <CenteredLayout enablePullToRefresh={false} className="pb-32">
      <div className="space-y-6 w-full">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">
              Budget Alerts
            </h1>
          </div>
          <button
            data-testid="budget-alerts-page-add-budget"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 sm:px-5 h-9 sm:h-10 bg-[#18181B] hover:bg-black text-white rounded-full active:scale-95 transition-all font-bold text-xs sm:text-sm shadow-xs cursor-pointer shrink-0"
          >
            <Plus size={16} />
            <span>Add Budget</span>
          </button>
        </div>

        {/* High-Density 2x2 / 4-Metric Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 w-full">
          {/* Card 1: Total Cap */}
          <div className="p-4 sm:p-5 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest truncate">Monthly Cap</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                <Wallet size={14} />
              </div>
            </div>
            <div>
              <p className="text-base sm:text-xl font-black text-slate-900 tracking-tight truncate">
                {formatCurrencyAmount(totalBudgetCap, currency, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">Across {limits.length} categories</p>
            </div>
          </div>

          {/* Card 2: Spent MTD */}
          <div className="p-4 sm:p-5 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest truncate">Total Spent</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <TrendingUp size={14} />
              </div>
            </div>
            <div>
              <p className="text-base sm:text-xl font-black text-slate-900 tracking-tight truncate">
                {formatCurrencyAmount(totalSpent, currency, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                {totalBudgetCap > 0 ? `${((totalSpent / totalBudgetCap) * 100).toFixed(0)}% of ceiling` : 'No ceiling set'}
              </p>
            </div>
          </div>

          {/* Card 3: Safe Buffer */}
          <div className="p-4 sm:p-5 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest truncate">Safe Buffer</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <ShieldCheck size={14} />
              </div>
            </div>
            <div>
              <p className="text-base sm:text-xl font-black text-emerald-600 tracking-tight truncate">
                {formatCurrencyAmount(safeBuffer, currency, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">Remaining unspent</p>
            </div>
          </div>

          {/* Card 4: Active Breaches */}
          <div className="p-4 sm:p-5 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest truncate">Alert Status</span>
              <div className={cn(
                "w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center shrink-0",
                breachesCount > 0 ? "bg-rose-50 border-rose-100 text-rose-600" :
                warningsCount > 0 ? "bg-amber-50 border-amber-100 text-amber-600" :
                "bg-emerald-50 border-emerald-100 text-emerald-600"
              )}>
                {breachesCount > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              </div>
            </div>
            <div>
              <p className={cn(
                "text-base sm:text-xl font-black tracking-tight truncate",
                breachesCount > 0 ? "text-rose-600" : warningsCount > 0 ? "text-amber-600" : "text-slate-900"
              )}>
                {breachesCount > 0 ? `${breachesCount} Breached` : warningsCount > 0 ? `${warningsCount} Warning` : 'All Healthy'}
              </p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">{alerts.length} active alerts</p>
            </div>
          </div>
        </div>

        {/* Categories grid & Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
          
          {/* Main Budgets monitor (lg:col-span-8) */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">Category Ceilings</h3>
              <span className="text-xs font-bold text-slate-400">{limits.length} active</span>
            </div>

            {limits.length === 0 ? (
              <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-[28px] sm:rounded-[32px] p-6 shadow-xs">
                <Wallet className="mx-auto text-slate-300 mb-3" size={36} />
                <p className="text-sm font-bold text-slate-700">No active category budgets yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Set monthly spending limits for categories like Food, Shopping, or Utilities to prevent budget overruns.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 px-4 py-2 bg-[#18181B] text-white rounded-full font-bold text-xs hover:bg-black transition-all cursor-pointer shadow-xs"
                >
                  + Add First Budget
                </button>
              </div>
            ) : (
              limits.map(limit => {
                const pct = limit.limit > 0 ? (limit.spent / limit.limit) * 100 : 0;
                const isOver = limit.spent > limit.limit;
                const isNear = pct >= limit.threshold;

                return (
                  <Card
                    data-testid={`budget-alerts-page-card-${limit.id}`}
                    key={limit.id}
                    className="p-5 sm:p-6 rounded-[28px] sm:rounded-[32px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative group/card"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-base text-slate-900 tracking-tight">{limit.category}</h4>
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                            isOver ? "bg-rose-50 text-rose-700 border border-rose-200/60" :
                            isNear ? "bg-amber-50 text-amber-700 border border-amber-200/60" :
                            "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                          )}>
                            {isOver ? "Exceeded" : isNear ? "Warning" : "Safe"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                          Alert Trigger: {limit.threshold}% limit
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Spent / Cap</span>
                          <div className="flex items-center gap-1 mt-0.5 justify-end">
                            <FinancialAmount value={limit.spent} currency={currency} size="sm" className="font-black text-slate-900" />
                            <span className="text-slate-300 font-bold text-xs">/</span>
                            <FinancialAmount value={limit.limit} currency={currency} size="sm" className="font-bold text-slate-400" />
                          </div>
                        </div>
                        <button
                          data-testid={`budget-alerts-page-delete-budget-${limit.id}`}
                          onClick={() => handleDeleteBudget(limit.id)}
                          className="w-8 h-8 rounded-full bg-slate-50 hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-1"
                          title="Delete Budget"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Continuous Gradient Progress Track */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-4">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isOver ? "bg-gradient-to-r from-rose-500 via-rose-600 to-red-600 shadow-xs" :
                          isNear ? "bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 shadow-xs" :
                          "bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 shadow-xs"
                        )}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>

                    {/* Slider Configuration */}
                    <div className="flex items-center justify-between gap-4 flex-wrap border-t border-slate-100 pt-3.5">
                      <div className="flex items-center gap-2">
                        <Sliders size={14} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-500">Alert threshold:</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          data-testid={`budget-alerts-page-input-${limit.id}`}
                          type="range"
                          min="50"
                          max="95"
                          step="5"
                          value={limit.threshold}
                          onChange={e => handleUpdateThreshold(limit.id, parseInt(e.target.value))}
                          className="w-28 sm:w-36 accent-[#18181B] cursor-pointer"
                        />
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-xs font-black text-slate-900 min-w-[40px] text-center">
                          {limit.threshold}%
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {/* Delivery Channels and Recent Alerts Side Panel (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Delivery Channels Card */}
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mb-3">Delivery Channels</h3>
              <Card data-testid="budget-alerts-page-card-2" className="p-5 sm:p-6 rounded-[28px] sm:rounded-[32px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Mail size={18} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Email Alerts</span>
                      <p className="text-[10px] text-slate-400 font-medium">Daily digest & ceiling warnings</p>
                    </div>
                  </div>
                  <button
                    data-testid="budget-alerts-page-button"
                    onClick={() => handleToggleChannel('budget_alert_email', emailAlerts, 'Email')}
                    className={cn(
                      "w-11 h-6 rounded-full relative transition-all cursor-pointer",
                      emailAlerts ? "bg-[#18181B]" : "bg-slate-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-sm",
                      emailAlerts ? "right-0.5" : "left-0.5"
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Push Notifications</span>
                      <p className="text-[10px] text-slate-400 font-medium">Instant mobile alerts</p>
                    </div>
                  </div>
                  <button
                    data-testid="budget-alerts-page-button-2"
                    onClick={() => handleToggleChannel('budget_alert_push', pushAlerts, 'Push')}
                    className={cn(
                      "w-11 h-6 rounded-full relative transition-all cursor-pointer",
                      pushAlerts ? "bg-[#18181B]" : "bg-slate-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-sm",
                      pushAlerts ? "right-0.5" : "left-0.5"
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <MessageSquare size={18} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">SMS Warnings</span>
                      <p className="text-[10px] text-slate-400 font-medium">Urgent critical threshold texts</p>
                    </div>
                  </div>
                  <button
                    data-testid="budget-alerts-page-button-3"
                    onClick={() => handleToggleChannel('budget_alert_sms', smsAlerts, 'SMS')}
                    className={cn(
                      "w-11 h-6 rounded-full relative transition-all cursor-pointer",
                      smsAlerts ? "bg-[#18181B]" : "bg-slate-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-sm",
                      smsAlerts ? "right-0.5" : "left-0.5"
                    )} />
                  </button>
                </div>
              </Card>
            </div>

            {/* Recent Breaches */}
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mb-3">Recent Breaches</h3>
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="text-center py-8 bg-white border border-slate-100 rounded-[28px] sm:rounded-[32px] p-6 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
                    <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={28} />
                    <p className="text-xs font-bold text-slate-800">All category budgets healthy</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">No spending ceilings have been breached.</p>
                  </div>
                ) : (
                  alerts.map(alert => (
                    <Card
                      data-testid={`budget-alerts-page-card-3-${alert.id}`}
                      key={alert.id}
                      className={cn(
                        "p-4 rounded-2xl border shadow-xs transition-all",
                        alert.type === 'critical'
                          ? "bg-rose-50/50 border-rose-200/80 text-rose-900"
                          : "bg-amber-50/50 border-amber-200/80 text-amber-900"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <span className="text-[9px] font-black uppercase tracking-widest block opacity-70">
                            {alert.category} • {alert.timestamp}
                          </span>
                          <p className="text-xs font-bold leading-relaxed mt-1">{alert.message}</p>
                        </div>
                        <button
                          data-testid={`budget-alerts-page-dismiss-${alert.id}`}
                          onClick={() => handleDismissAlert(alert.category)}
                          className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg hover:bg-black/5 transition-all shrink-0 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Budget Modal */}
      {showAddModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div
            data-testid="budget-alerts-page-div" 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => setShowAddModal(false)} 
          />
          <div className="relative bg-white rounded-[28px] sm:rounded-[36px] p-6 sm:p-8 w-full max-w-md border border-slate-100 shadow-2xl z-10 max-h-[calc(100dvh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Set Category Budget</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200/80 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Category selector */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Category *
                </label>
                <input
                  data-testid="budget-alerts-page-e-g-food-shopping"
                  type="text"
                  name="category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g., Food & Dining"
                  className="w-full h-11 px-4 border border-slate-200/80 rounded-2xl bg-slate-50 text-slate-900 text-sm font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                />
                
                {/* Category Preset Pills */}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {CATEGORY_PRESETS.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCategory(cat)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer border",
                        newCategory === cat
                          ? "bg-[#18181B] text-white border-black"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/60"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Limit Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Limit Amount ({currency}) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {currency === 'INR' ? '₹' : currency}
                  </span>
                  <input
                    data-testid="budget-alerts-page-e-g-5000"
                    type="number"
                    name="amount"
                    value={newLimit || ''}
                    onChange={(e) => setNewLimit(parseFloat(e.target.value) || 0)}
                    placeholder="e.g., 5000"
                    className="w-full h-11 pl-9 pr-4 border border-slate-200/80 rounded-2xl bg-slate-50 text-slate-900 text-sm font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                  />
                </div>
              </div>

              {/* Warning Threshold */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Alert Warning Threshold
                  </label>
                  <span className="text-xs font-black text-slate-900">{newThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(parseInt(e.target.value))}
                  className="w-full accent-[#18181B] cursor-pointer"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  data-testid="budget-alerts-page-cancel"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 h-11 border border-slate-200/80 rounded-full hover:bg-slate-50 active:scale-95 transition-all font-bold text-xs sm:text-sm text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  data-testid="budget-alerts-page-save-budget"
                  onClick={handleAddBudget}
                  className="flex-1 h-11 bg-[#18181B] text-white rounded-full hover:bg-black active:scale-95 transition-all font-bold text-xs sm:text-sm shadow-xs cursor-pointer"
                >
                  Save Budget
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </CenteredLayout>
  );
};

export default BudgetAlertsPage;

