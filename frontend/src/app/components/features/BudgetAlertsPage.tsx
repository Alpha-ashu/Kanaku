import React, { useState, useMemo } from 'react';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { Bell, CheckCircle2, ShieldAlert, Sliders, Mail, Smartphone, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';

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

export const BudgetAlertsPage: React.FC = () => {
  const { currency } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newLimit, setNewLimit] = useState<number>(0);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

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

  // Live Query from Dexie DB.
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

  // Dynamically calculate alert events based on current budget limits
  const alerts = useMemo<AlertEvent[]>(() => {
    const list: AlertEvent[] = [];
    limits.forEach((limit, idx) => {
      if (dismissedAlerts.includes(limit.category)) return;

      const pct = (limit.spent / limit.limit) * 100;
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
      if (budget) {
        await db.budgets.update(id, { ...budget, threshold: val } as any);
        toast.success('Warning threshold updated');
      }
    } catch (error) {
      console.error('Failed to update threshold:', error);
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
        threshold: 85,
      } as any);

      toast.success('Budget ceiling added successfully');
      setNewCategory('');
      setNewLimit(0);
      setShowAddModal(false);

      // Background sync to backend
      try {
        const resp = await backendService.createBudget({
          category: newCategory.trim(),
          amount: newLimit,
          period: 'monthly',
          threshold: 85,
        });
        if (resp?.id) {
          await db.budgets.update(budgetId, { id: resp.id } as any);
        }
      } catch {
        // Keep locally — backend sync will retry on next session
      }
    } catch (error) {
      console.error('Failed to add budget:', error);
      toast.error('Failed to save budget');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    try {
      await db.budgets.delete(id);
      toast.success('Budget deleted successfully');

      try { await backendService.deleteBudget(id); } catch { /* offline */ }
    } catch (error) {
      console.error('Failed to delete budget:', error);
      toast.error('Failed to delete budget');
    }
  };

  const currencySymbol = currency === 'INR' ? '₹' : currency;

  return (
    <CenteredLayout>
      <div className="w-full">
        <div className="pb-4 lg:pb-6">
          <PageHeader
            title="Budget Alerts"
            subtitle="Configure intelligent warning thresholds, notification mediums, and inspect breach reports"
            icon={<Bell className="text-rose-600" size={20} />}
          >
            <button data-testid="budget-alerts-page-add-budget"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-900 transition-colors font-medium text-xs font-black uppercase tracking-widest"
            >
              <Plus size={16} />
              Add Budget
            </button>
          </PageHeader>
        </div>

        {/* Global Overview banner */}
        <div className="bg-gradient-to-br from-rose-900 via-rose-950 to-slate-900 rounded-[32px] p-8 shadow-xl relative overflow-hidden mb-8 group border border-rose-500/20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/20 text-white mb-4">
                <ShieldAlert size={12} /> Real-time Protection Active
              </span>
              <h3 className="text-2xl font-black text-white tracking-tight mb-2">Limit Breaches Prevented</h3>
              <p className="text-rose-100 text-sm leading-relaxed font-medium">
                The system evaluates every transaction and triggers instant notifications when category ceilings are approached. Configure warning thresholds on demand.
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 text-center shrink-0">
              <span className="text-[10px] font-black uppercase text-rose-200 tracking-wider block">Active Alerts</span>
              <p className="text-3xl font-black text-white mt-1">{alerts.length} Breaches</p>
            </div>
          </div>
        </div>

        {/* Categories grid & Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Budgets monitor */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Ceiling Metrics</h3>
            {limits.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 border border-slate-100 rounded-2xl">
                <p className="text-sm font-medium text-slate-500">No active category budgets yet.</p>
              </div>
            ) : (
              limits.map(limit => {
                const pct = limit.limit > 0 ? (limit.spent / limit.limit) * 100 : 0;
                const isOver = limit.spent > limit.limit;
                const isNear = pct >= limit.threshold;

                return (
                  <Card data-testid={`budget-alerts-page-card-${limit.id}`} key={limit.id} variant="glass" className="p-6 border-white/40 shadow-sm relative group/card">
                    <div className="absolute right-4 top-4 opacity-0 group-hover/card:opacity-100 transition-opacity">
                      <button data-testid={`budget-alerts-page-delete-budget-${limit.id}`}
                        onClick={() => handleDeleteBudget(limit.id)}
                        className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg transition-colors"
                        title="Delete Budget"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mb-3 pr-8">
                      <div>
                        <h4 className="font-black text-slate-900 tracking-tight">{limit.category}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Alert Trigger: {limit.threshold}% limit</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-400 block">Spent / Cap</span>
                        <p className="text-sm font-black text-slate-900 mt-0.5">
                          {currencySymbol}{limit.spent.toLocaleString()} <span className="text-slate-400">/ {currencySymbol}{limit.limit.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-4">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : isNear ? 'bg-amber-500' : 'bg-indigo-600'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>

                    {/* Slider configuration */}
                    <div className="flex items-center justify-between gap-4 flex-wrap border-t border-slate-50 pt-4">
                      <div className="flex items-center gap-2">
                        <Sliders size={14} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-500">Tune warning point:</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input data-testid={`budget-alerts-page-input-${limit.id}`}
                          type="range"
                          min="50"
                          max="95"
                          step="5"
                          value={limit.threshold}
                          onChange={e => handleUpdateThreshold(limit.id, parseInt(e.target.value))}
                          className="w-32 accent-indigo-600 cursor-pointer"
                        />
                        <span className="text-xs font-black text-slate-900">{limit.threshold}%</span>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {/* Settings and Alerts list */}
          <div className="space-y-6">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Delivery Channels</h3>
            
            {/* Channels Card */}
            <Card data-testid="budget-alerts-page-card-2" variant="glass" className="p-6 border-white/40 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Mail size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Email Alerts</span>
                    <p className="text-[9px] text-slate-400 font-medium">Daily digest summaries</p>
                  </div>
                </div>
                <button data-testid="budget-alerts-page-button"
                  onClick={() => handleToggleChannel('budget_alert_email', emailAlerts, 'Email')}
                  className={`w-10 h-5 rounded-full relative transition-all ${emailAlerts ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${emailAlerts ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Smartphone size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Push Notifications</span>
                    <p className="text-[9px] text-slate-400 font-medium">Instant phone notifications</p>
                  </div>
                </div>
                <button data-testid="budget-alerts-page-button-2"
                  onClick={() => handleToggleChannel('budget_alert_push', pushAlerts, 'Push')}
                  className={`w-10 h-5 rounded-full relative transition-all ${pushAlerts ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${pushAlerts ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">SMS Warnings</span>
                    <p className="text-[9px] text-slate-400 font-medium">Text notifications</p>
                  </div>
                </div>
                <button data-testid="budget-alerts-page-button-3"
                  onClick={() => handleToggleChannel('budget_alert_sms', smsAlerts, 'SMS')}
                  className={`w-10 h-5 rounded-full relative transition-all ${smsAlerts ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${smsAlerts ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            </Card>

            {/* Recent alerts card */}
            <h3 className="text-lg font-black text-slate-900 tracking-tight pt-2">Recent Breaches</h3>
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 border border-slate-100 rounded-2xl">
                  <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={24} />
                  <p className="text-xs font-bold text-slate-600">All category budgets healthy!</p>
                </div>
              ) : (
                alerts.map(alert => (
                  <Card data-testid={`budget-alerts-page-card-3-${alert.id}`}
                    key={alert.id}
                    variant="glass"
                    className={`p-4 border-white/40 shadow-sm border-l-4 ${alert.type === 'critical' ? 'border-l-rose-500 bg-rose-50/20' : 'border-l-amber-500 bg-amber-50/20'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{alert.category} • {alert.timestamp}</span>
                        <p className="text-xs text-slate-700 font-medium leading-relaxed mt-1">{alert.message}</p>
                      </div>
                      <button data-testid={`budget-alerts-page-dismiss-${alert.id}`}
                        onClick={() => handleDismissAlert(alert.category)}
                        className="text-[10px] font-black text-indigo-600 uppercase tracking-wider hover:text-indigo-800 shrink-0"
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

      {/* Add Budget Modal */}
      {showAddModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div data-testid="budget-alerts-page-div" 
            className="absolute inset-0 bg-black/50" 
            onClick={() => setShowAddModal(false)} 
          />
          <div className="relative bg-white rounded-2xl p-8 w-full max-w-md border border-gray-200 shadow-lg z-10 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Set Category Budget</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category *
                </label>
                <input data-testid="budget-alerts-page-e-g-food-shopping"
                  type="text"
                  name="category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g., Food, Shopping"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Limit Amount *
                </label>
                <input data-testid="budget-alerts-page-e-g-5000"
                  type="number"
                  name="amount"
                  value={newLimit || ''}
                  onChange={(e) => setNewLimit(parseFloat(e.target.value) || 0)}
                  placeholder="e.g., 5000"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button data-testid="budget-alerts-page-cancel"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium text-gray-700"
                >
                  Cancel
                </button>
                <button data-testid="budget-alerts-page-save-budget"
                  onClick={handleAddBudget}
                  className="flex-1 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-900 transition-colors font-medium"
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
