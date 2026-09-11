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
          <button data-testid="friend-profile-back-to-friends" onClick={() => setCurrentPage('friends')} className="flex items-center gap-2 text-sm text-slate-600">
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
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            data-testid="friend-profile-back"
            onClick={() => setCurrentPage('friends')}
            title="Back to Friends"
            aria-label="Back to Friends"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
          >
            <ArrowLeft size={18} className="text-slate-700" />
          </button>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none truncate">Friend Profile</h1>
        </div>

        <div className="rounded-[28px] sm:rounded-[32px] border border-slate-100 bg-white p-5 sm:p-6 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex items-center gap-4 sm:gap-5">
          <Avatar className="h-16 w-16 rounded-2xl shadow-xs shrink-0">
            <AvatarFallback className="bg-sky-100 text-sky-700 text-lg font-bold rounded-2xl">
              {friend.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-slate-900 truncate">{friend.name}</p>
              {friend.isRegistered ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  <ShieldCheck size={11} /> Kanaku User
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                  <UserCircle2 size={11} /> Guest
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{friend.email || friend.phone || 'No contact info'}</p>
          </div>
          <Button data-testid="friend-profile-edit" variant="secondary" onClick={() => setEditing((v) => !v)} className="h-9 px-4 rounded-full border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm shadow-xs cursor-pointer active:scale-95 transition-all">
            <Pencil size={13} className="mr-1" /> Edit
          </Button>
        </div>

        {editing && (
          <div className="rounded-[28px] sm:rounded-[32px] border border-slate-100 bg-white p-5 sm:p-6 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Name</label>
              <input id="friend-edit-name" name="name" aria-label="Friend name" data-testid="friend-profile-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Email</label>
                <input id="friend-edit-email" name="email" aria-label="Friend email" data-testid="friend-profile-input-2" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Phone</label>
                <input id="friend-edit-phone" name="phone" aria-label="Friend phone" data-testid="friend-profile-input-3" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
              </div>
            </div>
            <p className="text-xs text-slate-400">Changes update across all expenses this friend is part of.</p>
            <Button data-testid="friend-profile-save-changes" onClick={handleSave} disabled={saving} className="bg-slate-900 hover:bg-black text-white h-10 px-5 rounded-full font-bold flex items-center gap-2 shadow-xs cursor-pointer active:scale-95 transition-all">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="rounded-[24px] sm:rounded-[28px] border border-slate-100 bg-white p-4 sm:p-5 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
              <p className="text-xs text-slate-400 flex items-center gap-1.5"><Mail size={13} /> Email</p>
              <p className="text-sm font-bold text-slate-900 mt-1.5">{friend.email || '—'}</p>
            </div>
            <div className="rounded-[24px] sm:rounded-[28px] border border-slate-100 bg-white p-4 sm:p-5 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
              <p className="text-xs text-slate-400 flex items-center gap-1.5"><Phone size={13} /> Phone</p>
              <p className="text-sm font-bold text-slate-900 mt-1.5">{friend.phone || '—'}</p>
            </div>
            <div className="rounded-[24px] sm:rounded-[28px] border border-rose-100 bg-rose-50/60 p-4 sm:p-5">
              <p className="text-xs font-bold text-rose-500 uppercase tracking-wide">Total Pending</p>
              <p className="text-lg font-black text-rose-700 mt-1.5">{formatCurrency(friend.totalOutstanding)}</p>
            </div>
            <div className="rounded-[24px] sm:rounded-[28px] border border-emerald-100 bg-emerald-50/60 p-4 sm:p-5">
              <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide">Total Paid</p>
              <p className="text-lg font-black text-emerald-700 mt-1.5">{formatCurrency(friend.totalPaid)}</p>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="space-y-3">
            {friend.expenses.length === 0 ? (
              <div className="rounded-[28px] sm:rounded-[32px] border border-dashed border-slate-200 bg-white px-4 py-16 text-center">
                <p className="text-sm text-slate-500">No expenses with this friend yet.</p>
              </div>
            ) : (
              friend.expenses.map((expense) => (
                <div key={expense.groupExpenseId} className="flex items-center justify-between rounded-[22px] sm:rounded-[26px] border border-slate-100 bg-white p-4 sm:p-5 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] hover:border-slate-200 transition-all">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{expense.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(expense.date)}{expense.category ? ` · ${expense.category}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-slate-900">{formatCurrency(expense.shareAmount)}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${expense.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {expense.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="rounded-[28px] sm:rounded-[32px] border border-slate-100 bg-white p-6 sm:p-8 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-3">
            <p className="text-sm text-slate-600 leading-relaxed">
              {friend.isRegistered
                ? `${friend.name} has a Kanaku account and receives in-app + email notifications when added to a new expense.`
                : `${friend.name} is not yet registered with Kanaku. They receive an email invite each time they're added to an expense.`}
            </p>
            <p className="text-xs text-slate-400 font-medium">{friend.totalExpenses} total expense{friend.totalExpenses === 1 ? '' : 's'} shared so far.</p>
          </div>
        )}
      </div>
    </CenteredLayout>
  );
};
