import React, { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';
import { Avatar, AvatarFallback } from '@/app/components/ui/avatar';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { SegmentedTabs } from '@/app/components/ui/PageHeader';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { ArrowLeft, ShieldCheck, UserCircle2, Mail, Phone, Save, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface FriendExpense {
  groupExpenseId: string;
  name: string;
  date: string;
  category: string | null;
  totalAmount: number;
  shareAmount: number;
  status: 'paid' | 'pending';
  paidAt: string | null;
}

interface FriendDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isRegistered: boolean;
  expenses: FriendExpense[];
  totalOutstanding: number;
  totalPaid: number;
  totalExpenses: number;
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));

export const FriendProfile: React.FC = () => {
  const { setCurrentPage, triggerSync, currency } = useApp();
  const [friend, setFriend] = useState<FriendDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);
  const friendId = localStorage.getItem('viewingFriendId');

  const loadFriend = async () => {
    if (!friendId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await backendService.getFriendDetail(friendId);
      setFriend(data);
      setForm({ name: data.name, email: data.email || '', phone: data.phone || '' });
    } catch (error) {
      console.error('Failed to load friend profile', error);
      toast.error('Failed to load friend profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFriend();
  }, [friendId]);

  const handleSave = async () => {
    if (!friendId || !form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      await backendService.updateFriendRemote(friendId, {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
      });
      toast.success('Friend details updated');
      setEditing(false);
      await loadFriend();
      triggerSync();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to update friend');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <CenteredLayout>
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="animate-spin" size={28} />
        </div>
      </CenteredLayout>
    );
  }

  if (!friend) {
    return (
      <CenteredLayout>
        <div className="space-y-4">
          <button onClick={() => setCurrentPage('friends')} className="flex items-center gap-2 text-sm text-slate-600">
            <ArrowLeft size={16} /> Back to Friends
          </button>
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center">
            <p className="text-sm text-gray-500">Friend not found. They may not have synced yet — try again once online.</p>
          </div>
        </div>
      </CenteredLayout>
    );
  }

  return (
    <CenteredLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentPage('friends')} title="Back" className="p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Friend Profile</h1>
        </div>

        <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-sky-100 text-sky-700 text-lg font-bold">
              {friend.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-gray-900 truncate">{friend.name}</p>
              {friend.isRegistered ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <ShieldCheck size={11} /> Kanaku User
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                  <UserCircle2 size={11} /> Guest
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">{friend.email || friend.phone || 'No contact info'}</p>
          </div>
          <Button variant="secondary" onClick={() => setEditing((v) => !v)} className="h-9 px-3 rounded-xl">
            <Pencil size={14} className="mr-1" /> Edit
          </Button>
        </div>

        {editing && (
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-slate-50 rounded-xl py-2.5 px-3 text-sm font-medium" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Email</label>
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full bg-slate-50 rounded-xl py-2.5 px-3 text-sm font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Phone</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full bg-slate-50 rounded-xl py-2.5 px-3 text-sm font-medium" />
              </div>
            </div>
            <p className="text-xs text-slate-400">Changes update across all expenses this friend is part of.</p>
            <Button onClick={handleSave} disabled={saving} className="bg-gray-900 hover:bg-gray-800 text-white h-10 px-4 rounded-xl font-bold flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
            </Button>
          </div>
        )}

        <SegmentedTabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'expenses', label: 'Expenses' },
            { id: 'activity', label: 'Activity' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-400 flex items-center gap-1"><Mail size={12} /> Email</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{friend.email || '—'}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={12} /> Phone</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{friend.phone || '—'}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-xs text-rose-500">Total Pending</p>
              <p className="text-lg font-bold text-rose-700 mt-1">{formatCurrency(friend.totalOutstanding)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs text-emerald-500">Total Paid</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">{formatCurrency(friend.totalPaid)}</p>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="space-y-2">
            {friend.expenses.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center">
                <p className="text-sm text-gray-500">No expenses with this friend yet.</p>
              </div>
            ) : (
              friend.expenses.map((expense) => (
                <div key={expense.groupExpenseId} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{expense.name}</p>
                    <p className="text-xs text-gray-400">{formatDate(expense.date)}{expense.category ? ` · ${expense.category}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900">{formatCurrency(expense.shareAmount)}</p>
                    <span className={`text-[10px] font-bold uppercase ${expense.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {expense.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 space-y-3">
            <p className="text-sm text-gray-600">
              {friend.isRegistered
                ? `${friend.name} has a Kanaku account and receives in-app + email notifications when added to a new expense.`
                : `${friend.name} is not yet registered with Kanaku. They receive an email invite each time they're added to an expense.`}
            </p>
            <p className="text-xs text-gray-400">{friend.totalExpenses} total expense{friend.totalExpenses === 1 ? '' : 's'} shared so far.</p>
          </div>
        )}
      </div>
    </CenteredLayout>
  );
};
