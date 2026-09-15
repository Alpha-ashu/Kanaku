import React, { useState, useMemo, useEffect } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import {
  Sliders, Mail, Smartphone,
  MessageSquare, Plus, Trash2, ShieldCheck, Wallet,
  AlertTriangle, X, BellRing
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';
import { syncBudgets, pushBudgetUpdate, deleteBudgetEverywhere } from '@/services/featureSyncService';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { cn } from '@/lib/utils';
import { getCategoryCartoonIcon, getCategoryColor } from '@/app/components/ui/CartoonCategoryIcons';

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

/** Open ring (gap at the bottom) showing how much of the month's budgets is used. */
const BudgetGauge: React.FC<{ pct: number; over: boolean; value: string; caption: string }> = ({ pct, over, value, caption }) => {
  const size = 132;
  const stroke = 13;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.75;
  const filled = (arc * Math.max(0, Math.min(pct, 100))) / 100;
  return (
    <div className="relative shrink-0 w-[112px] h-[112px] sm:w-[132px] sm:h-[132px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ transform: 'rotate(135deg)' }} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={over ? '#FFE4E6' : '#EDE9FE'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
        />
        {filled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={over ? '#E11D48' : '#7C3AED'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            className="transition-all duration-700"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <span className={cn('text-sm sm:text-base font-black leading-tight truncate max-w-full', over ? 'text-rose-600' : 'text-slate-900')}>
          {value}
        </span>
        <span className="text-[11px] font-medium text-slate-400">{caption}</span>
      </div>
    </div>
  );
};

export const BudgetAlertsPage: React.FC = () => {
  const { currency } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newLimit, setNewLimit] = useState<number>(0);
  const [newThreshold, setNewThreshold] = useState<number>(85);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [expandedBudgetId, setExpandedBudgetId] = useState<string | null>(null);

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

  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  // Whole-rupee amounts. minimumFractionDigits must be lowered together with the maximum,
  // otherwise Intl throws and formatCurrencyAmount falls back to an ungrouped "₹28000.00".
  const formatWhole = (amount: number) =>
    formatCurrencyAmount(amount, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const usedPct = totalBudgetCap > 0 ? (totalSpent / totalBudgetCap) * 100 : 0;
  const overBy = Math.max(0, totalSpent - totalBudgetCap);
  const cardClass =
    'bg-white border border-slate-100 rounded-[24px] sm:rounded-[28px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.10)]';
  const channels = [
    { key: 'budget_alert_email' as const, value: emailAlerts, name: 'Email', label: 'Email alerts', description: 'Daily digest & limit warnings', icon: Mail, tint: 'bg-indigo-50 text-indigo-600', testId: 'budget-alerts-page-button' },
    { key: 'budget_alert_push' as const, value: pushAlerts, name: 'Push', label: 'Push notifications', description: 'Instant alerts on this device', icon: Smartphone, tint: 'bg-purple-50 text-purple-600', testId: 'budget-alerts-page-button-2' },
    { key: 'budget_alert_sms' as const, value: smsAlerts, name: 'SMS', label: 'SMS warnings', description: 'Texts when a limit is crossed', icon: MessageSquare, tint: 'bg-emerald-50 text-emerald-600', testId: 'budget-alerts-page-button-3' },
  ];

  return (
    <CenteredLayout enablePullToRefresh={false} className="pb-32">
      <div className="space-y-5 sm:space-y-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-slate-400 truncate">{monthLabel}</p>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-tight truncate">Budgets</h1>
          </div>
          <button
            type="button"
            data-testid="budget-alerts-page-add-budget"
            onClick={() => setShowAddModal(true)}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#18181B] hover:bg-black text-white flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(15,23,42,0.45)] active:scale-95 transition-all cursor-pointer shrink-0"
            aria-label="Add budget"
            title="Add budget"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 w-full items-start">
          <div className="lg:col-span-7 xl:col-span-8 space-y-4 sm:space-y-5 min-w-0">
            {/* Month summary */}
            <div className={cn(cardClass, 'p-5 sm:p-6 flex items-center gap-4 sm:gap-6')}>
              <BudgetGauge
                pct={usedPct}
                over={overBy > 0}
                value={overBy > 0 ? formatWhole(overBy) : formatWhole(safeBuffer)}
                caption={overBy > 0 ? 'over' : 'left'}
              />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-slate-400">Spent so far</p>
                <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight truncate">{formatWhole(totalSpent)}</p>
                <p className="text-xs sm:text-sm font-medium text-slate-400 mt-0.5">
                  of {formatWhole(totalBudgetCap)} across {limits.length} {limits.length === 1 ? 'budget' : 'budgets'}
                </p>
                <span
                  className={cn(
                    'mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold',
                    breachesCount > 0
                      ? 'bg-rose-50 text-rose-700'
                      : warningsCount > 0
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'
                  )}
                >
                  {breachesCount > 0 ? <AlertTriangle size={12} /> : warningsCount > 0 ? <BellRing size={12} /> : <ShieldCheck size={12} />}
                  {breachesCount > 0
                    ? `${breachesCount} over limit`
                    : warningsCount > 0
                    ? `${warningsCount} near limit`
                    : 'All budgets healthy'}
                </span>
              </div>
            </div>

            {/* Active alerts */}
            {alerts.map((alert) => {
              const limit = limits.find((l) => l.category === alert.category);
              const critical = alert.type === 'critical';
              const pct = limit && limit.limit > 0 ? Math.round((limit.spent / limit.limit) * 100) : 0;
              return (
                <div
                  key={`${alert.category}-${alert.id}`}
                  data-testid={`budget-alerts-page-card-3-${alert.id}`}
                  role="alert"
                  className={cn(
                    'flex items-center gap-3 rounded-[20px] sm:rounded-[24px] border p-3.5 sm:p-4',
                    critical ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
                  )}
                >
                  <span
                    className={cn(
                      'w-10 h-10 sm:w-11 sm:h-11 rounded-[12px] flex items-center justify-center shrink-0',
                      critical ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                    )}
                  >
                    {critical ? <AlertTriangle size={18} /> : <BellRing size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm sm:text-base font-bold truncate', critical ? 'text-rose-900' : 'text-amber-900')}>
                      {critical ? `${alert.category} is over budget` : `${alert.category} is at ${pct}%`}
                    </p>
                    {limit && (
                      <p className={cn('text-xs sm:text-sm font-medium truncate', critical ? 'text-rose-700' : 'text-amber-700')}>
                        {critical
                          ? `${formatWhole(limit.spent - limit.limit)} over the ${formatWhole(limit.limit)} limit`
                          : `${formatWhole(Math.max(0, limit.limit - limit.spent))} left for this month`}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid={`budget-alerts-page-dismiss-${alert.id}`}
                    onClick={() => handleDismissAlert(alert.category)}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                      critical ? 'text-rose-500 hover:bg-rose-100' : 'text-amber-600 hover:bg-amber-100'
                    )}
                    aria-label={`Dismiss ${alert.category} alert`}
                    title="Dismiss"
                  >
                    <X size={15} />
                  </button>
                </div>
              );
            })}

            {/* Category budgets */}
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-400">Category budgets</p>
                <span className="text-[11px] sm:text-xs font-bold text-slate-400">{limits.length} active</span>
              </div>

              {limits.length === 0 ? (
                <div className={cn(cardClass, 'text-center py-12 px-6')}>
                  <span className="mx-auto w-14 h-14 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 mb-3">
                    <Wallet size={26} />
                  </span>
                  <p className="text-sm font-bold text-slate-800">No budgets yet</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Set monthly spending limits for categories like Food, Shopping, or Utilities and get alerted before you overspend.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="mt-4 px-5 py-2.5 bg-[#18181B] text-white rounded-full font-bold text-xs hover:bg-black transition-all cursor-pointer shadow-xs"
                  >
                    + Add first budget
                  </button>
                </div>
              ) : (
                <>
                  <div className={cn(cardClass, 'px-4 sm:px-5 divide-y divide-slate-100')}>
                    {limits.map((limit) => {
                      const pct = limit.limit > 0 ? (limit.spent / limit.limit) * 100 : 0;
                      const isOver = limit.spent > limit.limit;
                      const isNear = !isOver && pct >= limit.threshold;
                      const categoryColor = getCategoryColor(limit.category);
                      const barColor = isOver ? '#E11D48' : isNear ? '#F59E0B' : categoryColor;
                      const expanded = expandedBudgetId === limit.id;
                      return (
                        <div key={limit.id} data-testid={`budget-alerts-page-card-${limit.id}`} className="py-3.5 sm:py-4">
                          <button
                            type="button"
                            onClick={() => setExpandedBudgetId(expanded ? null : limit.id)}
                            aria-expanded={expanded}
                            className="w-full flex items-center gap-3 sm:gap-4 text-left cursor-pointer"
                          >
                            <span
                              className="w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${categoryColor}1A` }}
                            >
                              {getCategoryCartoonIcon(limit.category, 22)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="block text-sm sm:text-base font-bold text-slate-900 truncate">{limit.category}</span>
                                {(isOver || isNear) && (
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0',
                                      isOver ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                                    )}
                                  >
                                    {isOver ? 'Exceeded' : 'Warning'}
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs sm:text-sm font-medium text-slate-400 truncate">
                                {formatWhole(limit.spent)} of {formatWhole(limit.limit)}
                              </span>
                            </span>
                            <span
                              className={cn(
                                'text-sm sm:text-base font-extrabold shrink-0',
                                isOver ? 'text-rose-600' : isNear ? 'text-amber-600' : 'text-slate-900'
                              )}
                            >
                              {Math.round(pct)}%
                            </span>
                          </button>
                          <div className="mt-2.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
                            />
                          </div>
                          {expanded && (
                            <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                              <Sliders size={14} className="text-slate-400 shrink-0" />
                              <span className="text-xs font-bold text-slate-500 shrink-0">Alert at</span>
                              <input
                                data-testid={`budget-alerts-page-input-${limit.id}`}
                                type="range"
                                min="50"
                                max="95"
                                step="5"
                                value={limit.threshold}
                                onChange={(e) => handleUpdateThreshold(limit.id, parseInt(e.target.value))}
                                className="flex-1 min-w-0 accent-[#18181B] cursor-pointer"
                                aria-label={`Alert threshold for ${limit.category}`}
                              />
                              <span className="px-2 py-0.5 bg-white border border-slate-200/70 rounded-md text-xs font-black text-slate-900 min-w-[42px] text-center">
                                {limit.threshold}%
                              </span>
                              <button
                                type="button"
                                data-testid={`budget-alerts-page-delete-budget-${limit.id}`}
                                onClick={() => handleDeleteBudget(limit.id)}
                                className="w-8 h-8 rounded-full bg-white border border-slate-200/70 text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                                title="Delete budget"
                                aria-label={`Delete ${limit.category} budget`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 px-1 text-[11px] font-medium text-slate-400">Tap a budget to change its alert level or remove it.</p>
                </>
              )}
            </div>
          </div>

          {/* Alert channels */}
          <div className="lg:col-span-5 xl:col-span-4 min-w-0">
            <p className="px-1 mb-2 text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-400">Alert channels</p>
            <div data-testid="budget-alerts-page-card-2" className={cn(cardClass, 'px-4 sm:px-5 divide-y divide-slate-100')}>
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <div key={channel.key} className="flex items-center justify-between gap-3 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn('w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0', channel.tint)}>
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900 truncate">{channel.label}</span>
                        <span className="block text-xs font-medium text-slate-400 truncate">{channel.description}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid={channel.testId}
                      onClick={() => handleToggleChannel(channel.key, channel.value, channel.name)}
                      role="switch"
                      aria-checked={channel.value}
                      aria-label={channel.label}
                      className={cn(
                        'w-11 h-6 rounded-full relative transition-all cursor-pointer shrink-0',
                        channel.value ? 'bg-[#18181B]' : 'bg-slate-200'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-sm',
                          channel.value ? 'right-0.5' : 'left-0.5'
                        )}
                      />
                    </button>
                  </div>
                );
              })}
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

