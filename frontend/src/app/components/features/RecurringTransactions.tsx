import React, { useState, useMemo } from 'react';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { Calendar, Plus, RefreshCw, ShieldCheck, CreditCard, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, RecurringTransaction } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { backendService } from '@/lib/backend-api';

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
        createdAt: now,
        updatedAt: now,
      } as RecurringTransaction);

      toast.success(`"${form.name.trim()}" created`);
      setForm({ name: '', amount: '', type: 'expense', category: 'utilities', frequency: 'monthly', nextDueDate: new Date().toISOString().slice(0, 10), accountId: '', notes: '' });
      setShowAddForm(false);

      // Background sync
      try {
        const account = accounts.find((a) => a.id === accountId);
        const resp = await backendService.createRecurringTransaction({
          title: form.name.trim(),
          amount,
          category: form.category,
          interval: form.frequency as 'weekly' | 'monthly' | 'yearly',
          nextDueDate: nextDue.toISOString(),
          accountId: account?.cloudId,
          description: form.notes.trim() || undefined,
        });
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
    await db.recurringTransactions.update(item.id, { status: newStatus, updatedAt: new Date() });
    toast.info(`"${item.name}" ${newStatus === 'active' ? 'resumed' : 'paused'}`);

    if (item.cloudId) {
      try { await backendService.toggleRecurringStatus(item.cloudId); } catch { /* offline */ }
    }
  };

  const handleDelete = async (item: RecurringTransaction) => {
    if (!item.id) return;
    await db.recurringTransactions.update(item.id, { deletedAt: new Date(), syncStatus: 'pending' });
    toast.success(`"${item.name}" deleted`);

    if (item.cloudId) {
      try { await backendService.deleteRecurringTransaction(item.cloudId); } catch { /* offline */ }
    }
  };

  const fc = (amount: number) => formatCurrencyAmount(amount, currency);

  return (
    <CenteredLayout>
      <div className="w-full">
        <div className="pb-4 lg:pb-6 flex items-center justify-between flex-wrap gap-4">
          <PageHeader
            title="Recurring Transactions"
            subtitle="Manage and forecast repeating income, bills, and subscription profiles"
            icon={<RefreshCw className="text-indigo-600" size={20} />}
          />
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="bg-indigo-600 text-white px-5 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
            data-testid="recurring-toggle-form-button"
          >
            <Plus size={16} />
            {showAddForm ? 'Close' : 'Create Recurring'}
          </button>
        </div>

        {/* Forecast Card */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-[32px] p-8 shadow-xl relative overflow-hidden mb-8 group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <ShieldCheck size={12} /> Auto-Pay Liquidity Protection
              </p>
              <h3 className="text-3xl font-black text-white tracking-tight">
                {fc(Math.round(totalMonthlyCommitment))}<span className="text-indigo-300 text-lg">/mo</span>
              </h3>
              <p className="text-indigo-200 text-sm mt-1.5 font-medium leading-relaxed max-w-xl">
                Aggregate monthly projection of active recurring liabilities. Ensure your linked accounts retain sufficient balance before the due date.
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/10 shrink-0">
              <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">Active schedules</span>
              <p className="text-2xl font-black text-white mt-1">{items.filter((i) => i.status === 'active').length} Profiles</p>
            </div>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <Card variant="glass" className="p-8 mb-8 border-white/40 shadow-xl">
            <h3 className="text-lg font-black text-slate-900 tracking-tight mb-6">Create New Recurring Schedule</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Schedule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Spotify Premium, Rent"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
                  data-testid="recurring-form-name-input"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
                  data-testid="recurring-form-amount-input"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TxType }))}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
                  data-testid="recurring-form-type-select"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Rent & Housing"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
                  data-testid="recurring-form-category-input"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Billing Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
                  data-testid="recurring-form-frequency-select"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Next Due Date</label>
                <input
                  type="date"
                  value={form.nextDueDate}
                  onChange={(e) => setForm((f) => ({ ...f, nextDueDate: e.target.value }))}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
                  data-testid="recurring-form-date-input"
                />
              </div>

              {accounts.length > 0 && (
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Account</label>
                  <select
                    value={form.accountId}
                    onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
                    data-testid="recurring-form-account-select"
                  >
                    <option value="">— Select account —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="md:col-span-2 lg:col-span-3 pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-600 text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 disabled:opacity-60"
                  data-testid="recurring-form-submit-button"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Create Schedule
                </button>
              </div>
            </form>
          </Card>
        )}

        {/* Schedule List */}
        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-4 py-16 text-center">
            <RefreshCw className="mx-auto mb-3 text-slate-300" size={32} />
            <p className="text-sm font-semibold text-slate-500">No recurring schedules yet.</p>
            <p className="text-xs text-slate-400 mt-1">Add rent, subscriptions, salaries — anything that repeats.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {items.map((item) => (
              <Card
                key={item.id}
                variant="glass"
                className={`p-6 border-white/40 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all ${item.status === 'paused' ? 'opacity-65' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${item.status === 'active' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 tracking-tight flex items-center gap-2">
                      {item.name}
                      {item.status === 'paused' && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-400 tracking-wider">Paused</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        item.type === 'income' ? 'bg-emerald-100 text-emerald-700' :
                        item.type === 'transfer' ? 'bg-sky-100 text-sky-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>{item.type}</span>
                    </h4>
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{item.category}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                      <span className="text-xs font-bold text-slate-500 capitalize">{item.frequency}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                      <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                        <Calendar size={12} /> Next: {item.nextDueDate instanceof Date
                          ? item.nextDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                          : String(item.nextDueDate).slice(0, 10)}
                      </span>
                      {item.syncStatus === 'pending' && (
                        <span className="text-[9px] text-amber-500 font-bold uppercase">⏳ Pending sync</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-none pt-4 md:pt-0">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                      {item.type === 'income' ? 'Income' : 'Liability'}
                    </span>
                    <p className={`text-lg font-black mt-0.5 ${item.type === 'income' ? 'text-emerald-700' : 'text-slate-900'}`}>
                      {fc(item.amount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleStatus(item)}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        item.status === 'active'
                          ? 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                          : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                      }`}
                      data-testid={`recurring-card-toggle-${item.id}`}
                    >
                      {item.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-2.5 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-all"
                      title="Delete"
                      data-testid={`recurring-card-delete-${item.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </CenteredLayout>
  );
};

export default RecurringTransactions;
