import React, { useState, useMemo, useEffect } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import {
  Calendar, Plus, RefreshCw, ShieldCheck, CreditCard, Loader2, Trash2,
  ArrowLeft, ArrowDownRight, ArrowUpRight, Clock, X
} from 'lucide-react';
import { toast } from 'sonner';
import { db, RecurringTransaction } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { FinancialAmount } from '@/app/components/ui/FinancialAmount';
import { backendService } from '@/lib/backend-api';
import { syncRecurringTransactions } from '@/services/featureSyncService';
import { cn } from '@/lib/utils';
import { useSubmitLock } from '@/hooks/useSubmitLock';

type Frequency = 'weekly' | 'monthly' | 'yearly';
type TxType = 'expense' | 'income' | 'transfer';

const FREQUENCY_MONTHLY_FACTOR: Record<Frequency, number> = {
  weekly: 4.33,
  monthly: 1,
  yearly: 1 / 12,
};

const CATEGORY_PRESETS = [
  'Utilities', 'Rent & Housing', 'Subscriptions', 'Insurance',
  'Salary', 'Loan EMI', 'Investments', 'Education'
];

export const RecurringTransactions: React.FC = () => {
  const guardSubmit = useSubmitLock();
  const { currency, accounts, setCurrentPage } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'expense' | 'income' | 'transfer' | 'active' | 'paused'>('all');
  const [form, setForm] = useState({
    name: '',
    amount: '',
    type: 'expense' as TxType,
    category: 'Utilities',
    frequency: 'monthly' as Frequency,
    nextDueDate: new Date().toISOString().slice(0, 10),
    accountId: '',
    notes: '',
  });

  const items = useLiveQuery(
    () => db.recurringTransactions.filter((r) => !r.deletedAt).reverse().sortBy('nextDueDate'),
    []
  ) ?? [];

  // Pull server rules and retry offline queue
  useEffect(() => {
    void syncRecurringTransactions();
  }, []);

  // Aggregated Outflow vs Inflow
  const totalMonthlyOutflow = useMemo(() => {
    return items
      .filter((r) => r.status === 'active' && r.type !== 'income')
      .reduce((sum, r) => {
        const freq = (r.frequency as Frequency) in FREQUENCY_MONTHLY_FACTOR
          ? (r.frequency as Frequency)
          : 'monthly';
        return sum + r.amount * FREQUENCY_MONTHLY_FACTOR[freq];
      }, 0);
  }, [items]);

  const totalMonthlyInflow = useMemo(() => {
    return items
      .filter((r) => r.status === 'active' && r.type === 'income')
      .reduce((sum, r) => {
        const freq = (r.frequency as Frequency) in FREQUENCY_MONTHLY_FACTOR
          ? (r.frequency as Frequency)
          : 'monthly';
        return sum + r.amount * FREQUENCY_MONTHLY_FACTOR[freq];
      }, 0);
  }, [items]);

  const activeCount = useMemo(() => items.filter((i) => i.status === 'active').length, [items]);

  const nextUpcoming = useMemo(() => {
    const activeItems = items.filter(i => i.status === 'active');
    if (activeItems.length === 0) return null;
    return activeItems[0];
  }, [items]);

  // Filtered schedules
  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    if (activeFilter === 'active') return items.filter(i => i.status === 'active');
    if (activeFilter === 'paused') return items.filter(i => i.status === 'paused');
    return items.filter(i => i.type === activeFilter);
  }, [items, activeFilter]);

  const handleCreate = guardSubmit(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error('Amount must be greater than 0'); return; }
    if (!form.nextDueDate) { toast.error('Next due date is required'); return; }

    setSaving(true);
    const now = new Date();
    const nextDue = new Date(form.nextDueDate);
    const accountId = parseInt(form.accountId) || (accounts[0]?.id ?? 0);

    const clientRequestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const localId = await db.recurringTransactions.add({
        name: form.name.trim(),
        type: form.type,
        amount,
        accountId,
        category: form.category,
        frequency: form.frequency,
        startDate: now,
        nextDueDate: nextDue,
        status: 'active',
        notes: form.notes.trim() || undefined,
        syncStatus: 'pending',
        clientRequestId,
        createdAt: now,
        updatedAt: now,
      } as any);

      toast.success(`"${form.name.trim()}" created`);
      setForm({ name: '', amount: '', type: 'expense', category: 'Utilities', frequency: 'monthly', nextDueDate: new Date().toISOString().slice(0, 10), accountId: '', notes: '' });
      setShowAddForm(false);

      // Background sync
      try {
        const account = accounts.find((a) => a.id === accountId);
        const resp = await backendService.createRecurringTransaction({
          title: form.name.trim(),
          amount,
          type: form.type as 'income' | 'expense' | 'transfer',
          category: form.category,
          interval: form.frequency as 'weekly' | 'monthly' | 'yearly',
          nextDueDate: nextDue.toISOString(),
          accountId: account?.cloudId,
          description: form.notes.trim() || undefined,
          notes: form.notes.trim() || undefined,
          clientRequestId,
        } as any);
        if (resp?.id) {
          await db.recurringTransactions.update(localId as number, { cloudId: String(resp.id), syncStatus: 'synced' });
        }
      } catch {
        // Keep syncStatus=pending for later retry
      }
    } catch (err) {
      console.error('Failed to create recurring transaction:', err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  });

  const handleToggleStatus = async (item: RecurringTransaction) => {
    if (!item.id) return;
    const newStatus = item.status === 'active' ? 'paused' : 'active';
    await db.recurringTransactions.update(item.id, {
      status: newStatus,
      updatedAt: new Date(),
      syncStatus: item.cloudId ? item.syncStatus : 'pending',
    });
    toast.info(`"${item.name}" ${newStatus === 'active' ? 'resumed' : 'paused'}`);

    if (item.cloudId) {
      try {
        await backendService.toggleRecurringStatus(item.cloudId);
      } catch {
        await db.recurringTransactions.update(item.id, { syncStatus: 'pending' });
      }
    }
  };

  const handleDelete = async (item: RecurringTransaction) => {
    if (!item.id) return;

    if (!item.cloudId) {
      await db.recurringTransactions.delete(item.id);
      toast.success(`"${item.name}" deleted`);
      return;
    }

    try {
      await backendService.deleteRecurringTransaction(item.cloudId);
      await db.recurringTransactions.delete(item.id);
      toast.success(`"${item.name}" deleted`);
    } catch {
      await db.recurringTransactions.update(item.id, { deletedAt: new Date(), syncStatus: 'pending' });
      toast.warning(`"${item.name}" removed here — it will stop running once you are back online`);
    }
  };

  const fc = (amount: number) => formatCurrencyAmount(amount, currency, { maximumFractionDigits: 0 });

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
              Recurring Schedules
            </h1>
          </div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="bg-[#18181B] hover:bg-black text-white px-3 sm:px-5 h-9 sm:h-10 rounded-full text-xs sm:text-sm font-bold active:scale-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
            data-testid="recurring-toggle-form-button"
          >
            <Plus size={16} className={cn("transition-transform duration-200", showAddForm ? "rotate-45" : "")} />
            <span className="hidden sm:inline">{showAddForm ? 'Close' : 'Create Recurring'}</span>
            <span className="sm:hidden">{showAddForm ? 'Close' : 'Create'}</span>
          </button>
        </div>

        {/* High-Density 4-Metric Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 w-full">
          {/* Outflow */}
          <div className="p-4 sm:p-5 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Monthly Outflow</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <ArrowDownRight size={14} />
              </div>
            </div>
            <div>
              <p className="text-base sm:text-xl font-black text-slate-900 tracking-tight truncate">
                {fc(Math.round(totalMonthlyOutflow))}<span className="text-slate-400 text-xs font-semibold">/mo</span>
              </p>
              <p className="text-2xs font-bold text-slate-400 mt-0.5">Subscriptions & bills</p>
            </div>
          </div>

          {/* Inflow */}
          <div className="p-4 sm:p-5 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Monthly Inflow</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <ArrowUpRight size={14} />
              </div>
            </div>
            <div>
              <p className="text-base sm:text-xl font-black text-emerald-600 tracking-tight truncate">
                {fc(Math.round(totalMonthlyInflow))}<span className="text-emerald-500/70 text-xs font-semibold">/mo</span>
              </p>
              <p className="text-2xs font-bold text-slate-400 mt-0.5">Recurring incomes</p>
            </div>
          </div>

          {/* Active Profiles */}
          <div className="p-4 sm:p-5 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Active Rules</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                <ShieldCheck size={14} />
              </div>
            </div>
            <div>
              <p className="text-base sm:text-xl font-black text-slate-900 tracking-tight truncate">
                {activeCount} Active
              </p>
              <p className="text-2xs font-bold text-slate-400 mt-0.5">of {items.length} total schedules</p>
            </div>
          </div>

          {/* Next Due */}
          <div className="p-4 sm:p-5 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Next Upcoming</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Clock size={14} />
              </div>
            </div>
            <div>
              <p className="text-base sm:text-xl font-black text-slate-900 tracking-tight truncate">
                {nextUpcoming ? nextUpcoming.name : 'None'}
              </p>
              <p className="text-2xs font-bold text-slate-400 mt-0.5 truncate">
                {nextUpcoming ? (
                  nextUpcoming.nextDueDate instanceof Date
                    ? nextUpcoming.nextDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                    : String(nextUpcoming.nextDueDate).slice(0, 10)
                ) : 'No due payments'}
              </p>
            </div>
          </div>
        </div>

        {/* Add Form Card */}
        {showAddForm && (
          <div data-testid="recurring-transactions-card" className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Create New Recurring Schedule</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Automate repeating expenses, subscriptions, or salaries</p>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form data-testid="recurring-transactions-form" onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Type toggle */}
              <div className="md:col-span-2 lg:col-span-3 space-y-2">
                <label className="block text-2xs font-bold text-slate-400 uppercase tracking-widest">Transaction Type</label>
                <div className="p-1 bg-slate-100/90 rounded-full flex gap-1 border border-slate-200/60 max-w-md">
                  {(['expense', 'income', 'transfer'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={cn(
                        "flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                        form.type === t
                          ? "bg-[#18181B] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {/* Hidden select for testid preservation */}
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TxType }))}
                  className="hidden"
                  data-testid="recurring-form-type-select"
                >
                  <option data-testid="recurring-transactions-expense" value="expense">Expense</option>
                  <option data-testid="recurring-transactions-income" value="income">Income</option>
                  <option data-testid="recurring-transactions-transfer" value="transfer">Transfer</option>
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="block text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Schedule Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Netflix, Apartment Rent, Gym"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-11 px-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                  data-testid="recurring-form-name-input"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Amount ({currency}) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {currency === 'INR' ? '₹' : currency}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full h-11 pl-9 pr-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                    data-testid="recurring-form-amount-input"
                  />
                </div>
              </div>

              {/* Billing Frequency */}
              <div>
                <label className="block text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Billing Frequency</label>
                <div className="flex gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/60 h-11 items-center">
                  {(['weekly', 'monthly', 'yearly'] as const).map(freq => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, frequency: freq }))}
                      className={cn(
                        "flex-1 py-1.5 rounded-xl text-2xs sm:text-xs font-bold capitalize transition-all cursor-pointer",
                        form.frequency === freq
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
                {/* Hidden select for testid preservation */}
                <select
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
                  className="hidden"
                  data-testid="recurring-form-frequency-select"
                >
                  <option data-testid="recurring-transactions-weekly" value="weekly">Weekly</option>
                  <option data-testid="recurring-transactions-monthly" value="monthly">Monthly</option>
                  <option data-testid="recurring-transactions-yearly" value="yearly">Yearly</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Utilities, Housing"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full h-11 px-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                  data-testid="recurring-form-category-input"
                />
              </div>

              {/* Next Due Date */}
              <div>
                <label className="block text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Next Due Date</label>
                <input
                  type="date"
                  value={form.nextDueDate}
                  onChange={(e) => setForm((f) => ({ ...f, nextDueDate: e.target.value }))}
                  className="w-full h-11 px-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                  data-testid="recurring-form-date-input"
                />
              </div>

              {/* Account */}
              {accounts.length > 0 && (
                <div>
                  <label className="block text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Funding Account</label>
                  <select
                    value={form.accountId}
                    onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all cursor-pointer"
                    data-testid="recurring-form-account-select"
                  >
                    <option data-testid="recurring-transactions-select-account" value="">— Select account —</option>
                    {accounts.map((a) => (
                      <option data-testid={`recurring-transactions-option-${a.id}`} key={a.id} value={String(a.id)}>
                        {a.name} ({formatCurrencyAmount(a.balance, currency, { maximumFractionDigits: 0 })})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="md:col-span-2 lg:col-span-3 pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-5 h-11 border border-slate-200/80 rounded-full hover:bg-slate-50 font-bold text-xs text-slate-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#18181B] hover:bg-black text-white px-6 h-11 rounded-full text-xs font-bold active:scale-95 transition-all shadow-xs flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                  data-testid="recurring-form-submit-button"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  <span>Create Schedule</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filter Pills - Device responsive & centric */}
        <div className="grid grid-cols-2 min-[420px]:grid-cols-3 md:flex md:items-center md:justify-center md:flex-wrap gap-1.5 sm:gap-2 w-full py-1">
          {[
            { id: 'all', label: 'All Schedules', count: items.length },
            { id: 'expense', label: 'Expenses', count: items.filter(i => i.type === 'expense').length },
            { id: 'income', label: 'Incomes', count: items.filter(i => i.type === 'income').length },
            { id: 'transfer', label: 'Transfers', count: items.filter(i => i.type === 'transfer').length },
            { id: 'active', label: 'Active', count: items.filter(i => i.status === 'active').length },
            { id: 'paused', label: 'Paused', count: items.filter(i => i.status === 'paused').length },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id as any)}
              data-testid={`recurring-filter-${f.id}`}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 shadow-2xs",
                activeFilter === f.id
                  ? "bg-[#18181B] text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100/70 border border-slate-200/70"
              )}
            >
              <span>{f.label}</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-2xs font-black",
                activeFilter === f.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Schedule Cards Grid */}
        {filteredItems.length === 0 ? (
          <div className="rounded-[28px] sm:rounded-[32px] border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-xs">
            <RefreshCw className="mx-auto mb-3 text-slate-300" size={36} />
            <p className="text-sm font-bold text-slate-700">No recurring schedules found</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {activeFilter === 'all'
                ? 'Add subscriptions, monthly rent, utilities, or recurring salary.'
                : `No schedules match the "${activeFilter}" filter.`}
            </p>
            {activeFilter !== 'all' && (
              <button
                onClick={() => setActiveFilter('all')}
                className="mt-3 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredItems.map((item) => (
              <div
                data-testid={`recurring-transactions-card-2-${item.id}`}
                key={item.id}
                className={cn(
                  "bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] hover:shadow-md transition-all flex flex-col justify-between gap-4",
                  item.status === 'paused' ? "opacity-70 bg-slate-50/60" : ""
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border shadow-2xs",
                        item.type === 'income' ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                        item.type === 'transfer' ? "bg-sky-50 border-sky-100 text-sky-600" :
                        "bg-slate-100 border-slate-200/60 text-slate-700"
                      )}>
                        <CreditCard size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 tracking-tight flex items-center gap-1.5">
                          <span className="truncate max-w-[140px] sm:max-w-[180px]">{item.name}</span>
                          {item.status === 'paused' && (
                            <span className="px-2 py-0.5 rounded-full text-2xs font-black uppercase bg-slate-100 text-slate-400">Paused</span>
                          )}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-2xs font-black uppercase tracking-wider",
                            item.type === 'income' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' :
                            item.type === 'transfer' ? 'bg-sky-50 text-sky-700 border border-sky-200/60' :
                            'bg-rose-50 text-rose-700 border border-rose-200/60'
                          )}>{item.type}</span>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{item.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleStatus(item)}
                        className={cn(
                          "px-3 py-1 rounded-full text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                          item.status === 'active'
                            ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                            : "bg-[#18181B] hover:bg-black text-white shadow-2xs"
                        )}
                        data-testid={`recurring-card-toggle-${item.id}`}
                      >
                        {item.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="w-8 h-8 rounded-full bg-slate-50 hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
                        title="Delete"
                        data-testid={`recurring-card-delete-${item.id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-xs font-bold text-slate-600 capitalize bg-slate-100/80 px-2.5 py-0.5 rounded-full">
                      {item.frequency}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                      <Calendar size={12} className="text-slate-400" />
                      Next: {item.nextDueDate instanceof Date
                        ? item.nextDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : String(item.nextDueDate).slice(0, 10)}
                    </span>
                    {item.syncStatus === 'pending' && (
                      <span className="text-2xs text-amber-600 font-bold uppercase">⏳ Pending sync</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-2xs font-black text-slate-400 uppercase tracking-widest">
                    {item.type === 'income' ? 'Recurring Income' : 'Recurring Liability'}
                  </span>
                  <FinancialAmount
                    value={item.amount}
                    currency={currency}
                    size="md"
                    className={item.type === 'income' ? 'text-emerald-700 font-black' : 'text-slate-900 font-black'}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CenteredLayout>
  );
};

export default RecurringTransactions;

