import React, { useState, useMemo, useEffect } from 'react';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Calendar, Plus, RefreshCw, ShieldCheck, CreditCard, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, RecurringTransaction } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { FinancialAmount } from '@/app/components/ui/FinancialAmount';
import { backendService } from '@/lib/backend-api';
import { syncRecurringTransactions } from '@/services/featureSyncService';

type Frequency = 'weekly' | 'monthly' | 'yearly';
type TxType = 'expense' | 'income' | 'transfer';

const FREQUENCY_MONTHLY_FACTOR: Record<Frequency, number> = {
  weekly: 4.33,
  monthly: 1,
  yearly: 1 / 12,
};

function nextDateFromFrequency(freq: Frequency, from: Date): Date {
  const d = new Date(from);
  if (freq === 'weekly') d.setDate(d.getDate() + 7);
  else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

export const RecurringTransactions: React.FC = () => {
  const { currency, accounts } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    amount: '',
    type: 'expense' as TxType,
    category: 'utilities',
    frequency: 'monthly' as Frequency,
    nextDueDate: new Date().toISOString().slice(0, 10),
    accountId: '',
    notes: '',
  });

  const items = useLiveQuery(
    () => db.recurringTransactions.filter((r) => !r.deletedAt).reverse().sortBy('nextDueDate'),
    []
  ) ?? [];

  // Pull the server's rules and retry anything that never made it up. The
  // backend worker executes from its own copy, so a rule that only exists in
  // this browser never actually runs.
  useEffect(() => {
    void syncRecurringTransactions();
  }, []);

  const totalMonthlyCommitment = useMemo(() => {
    return items
      .filter((r) => r.status === 'active')
      .reduce((sum, r) => {
        const freq = (r.frequency as Frequency) in FREQUENCY_MONTHLY_FACTOR
          ? (r.frequency as Frequency)
          : 'monthly';
        return sum + r.amount * FREQUENCY_MONTHLY_FACTOR[freq];
      }, 0);
  }, [items]);

  const handleCreate = async (e: React.FormEvent) => {
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
      setForm({ name: '', amount: '', type: 'expense', category: 'utilities', frequency: 'monthly', nextDueDate: new Date().toISOString().slice(0, 10), accountId: '', notes: '' });
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
  };

  const handleToggleStatus = async (item: RecurringTransaction) => {
    if (!item.id) return;
    const newStatus = item.status === 'active' ? 'paused' : 'active';
    await db.recurringTransactions.update(item.id, {
      status: newStatus,
      updatedAt: new Date(),
      // Marked pending when the rule has never reached the server, so the next
      // sync pushes it instead of leaving the worker running the old state.
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
      // Never pushed — nothing on the server to delete, and keeping a
      // tombstone would make the next sync re-push it as a new rule.
      await db.recurringTransactions.delete(item.id);
      toast.success(`"${item.name}" deleted`);
      return;
    }

    try {
      await backendService.deleteRecurringTransaction(item.cloudId);
      await db.recurringTransactions.delete(item.id);
      toast.success(`"${item.name}" deleted`);
    } catch {
      // The rule still exists on the server and its worker will keep firing, so
      // say so rather than showing a success the backend never agreed to.
      await db.recurringTransactions.update(item.id, { deletedAt: new Date(), syncStatus: 'pending' });
      toast.warning(`"${item.name}" removed here — it will stop running once you are back online`);
    }
  };

  const fc = (amount: number) => formatCurrencyAmount(amount, currency);

  return (
    <CenteredLayout>
      <div className="w-full">
        <div className="pb-4 lg:pb-6">
          <PageHeader
            title="Recurring Transactions"
          >
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="bg-[#18181B] hover:bg-black text-white px-3.5 sm:px-5 h-9 sm:h-10 rounded-full text-xs sm:text-sm font-bold active:scale-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              data-testid="recurring-toggle-form-button"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">{showAddForm ? 'Close' : 'Create Recurring'}</span>
              <span className="sm:hidden">{showAddForm ? 'Close' : 'Create'}</span>
            </button>
          </PageHeader>
        </div>

        {/* Forecast Card */}
        <div className="bg-[#18181B] rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0_10px_30px_-4px_rgba(0,0,0,0.2)] relative overflow-hidden mb-6 sm:mb-8 border border-white/5">
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-400" /> Auto-Pay Liquidity Protection
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {fc(Math.round(totalMonthlyCommitment))}<span className="text-slate-400 text-base sm:text-lg font-semibold">/mo</span>
              </h3>
              <p className="text-slate-300 text-xs sm:text-sm mt-1.5 font-medium leading-relaxed max-w-xl">
                Aggregate monthly projection of active recurring liabilities. Ensure your linked accounts retain sufficient balance before the due date.
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/10 shrink-0">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Active schedules</span>
              <p className="text-2xl font-black text-white mt-1">{items.filter((i) => i.status === 'active').length} Profiles</p>
            </div>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div data-testid="recurring-transactions-card" className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] mb-6 sm:mb-8">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight mb-6">Create New Recurring Schedule</h3>
            <form data-testid="recurring-transactions-form" onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Schedule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Spotify Premium, Rent"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-medium focus:outline-none focus:border-slate-900 transition-colors"
                  data-testid="recurring-form-name-input"
                />
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-medium focus:outline-none focus:border-slate-900 transition-colors"
                  data-testid="recurring-form-amount-input"
                />
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TxType }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-medium focus:outline-none focus:border-slate-900 transition-colors"
                  data-testid="recurring-form-type-select"
                >
                  <option data-testid="recurring-transactions-expense" value="expense">Expense</option>
                  <option data-testid="recurring-transactions-income" value="income">Income</option>
                  <option data-testid="recurring-transactions-transfer" value="transfer">Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Rent & Housing"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-medium focus:outline-none focus:border-slate-900 transition-colors"
                  data-testid="recurring-form-category-input"
                />
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Billing Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-medium focus:outline-none focus:border-slate-900 transition-colors"
                  data-testid="recurring-form-frequency-select"
                >
                  <option data-testid="recurring-transactions-weekly" value="weekly">Weekly</option>
                  <option data-testid="recurring-transactions-monthly" value="monthly">Monthly</option>
                  <option data-testid="recurring-transactions-yearly" value="yearly">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Next Due Date</label>
                <input
                  type="date"
                  value={form.nextDueDate}
                  onChange={(e) => setForm((f) => ({ ...f, nextDueDate: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-medium focus:outline-none focus:border-slate-900 transition-colors"
                  data-testid="recurring-form-date-input"
                />
              </div>

              {accounts.length > 0 && (
                <div>
                  <label className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Account</label>
                  <select
                    value={form.accountId}
                    onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-medium focus:outline-none focus:border-slate-900 transition-colors"
                    data-testid="recurring-form-account-select"
                  >
                    <option data-testid="recurring-transactions-select-account" value="">— Select account —</option>
                    {accounts.map((a) => (
                      <option data-testid={`recurring-transactions-option-${a.id}`} key={a.id} value={String(a.id)}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="md:col-span-2 lg:col-span-3 pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#18181B] hover:bg-black text-white px-6 py-3 rounded-full text-xs font-bold active:scale-95 transition-all shadow-xs flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                  data-testid="recurring-form-submit-button"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  <span>Create Schedule</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Schedule List */}
        {items.length === 0 ? (
          <div className="rounded-[28px] sm:rounded-[32px] border border-dashed border-slate-200 bg-white px-4 py-16 text-center shadow-xs">
            <RefreshCw className="mx-auto mb-3 text-slate-300" size={32} />
            <p className="text-sm font-semibold text-slate-500">No recurring schedules yet.</p>
            <p className="text-xs text-slate-400 mt-1">Add rent, subscriptions, salaries — anything that repeats.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {items.map((item) => (
              <div
                data-testid={`recurring-transactions-card-2-${item.id}`}
                key={item.id}
                className={`bg-white rounded-[24px] sm:rounded-[28px] p-5 sm:p-6 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] hover:shadow-md hover:border-slate-200/80 transition-all flex flex-col justify-between gap-5 ${item.status === 'paused' ? 'opacity-65' : ''}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-700 shadow-2xs">
                        <CreditCard size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-slate-900 tracking-tight flex items-center gap-2">
                          {item.name}
                          {item.status === 'paused' && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-400 tracking-wider">Paused</span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            item.type === 'income' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            item.type === 'transfer' ? 'bg-sky-50 text-sky-700 border border-sky-100' :
                            'bg-rose-50 text-rose-700 border border-rose-100'
                          }`}>{item.type}</span>
                        </h4>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mt-0.5">{item.category}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleStatus(item)}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          item.status === 'active'
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            : 'bg-[#18181B] hover:bg-black text-white'
                        }`}
                        data-testid={`recurring-card-toggle-${item.id}`}
                      >
                        {item.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
                        title="Delete"
                        data-testid={`recurring-card-delete-${item.id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <span className="text-xs font-bold text-slate-500 capitalize bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">{item.frequency}</span>
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                      <Calendar size={12} className="text-slate-400" /> Next: {item.nextDueDate instanceof Date
                        ? item.nextDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : String(item.nextDueDate).slice(0, 10)}
                    </span>
                    {item.syncStatus === 'pending' && (
                      <span className="text-[9px] text-amber-600 font-bold uppercase">⏳ Pending sync</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
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
