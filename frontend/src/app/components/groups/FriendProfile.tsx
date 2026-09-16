import React, { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';
import { db } from '@/lib/database';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { SegmentedTabs } from '@/app/components/ui/PageHeader';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { ArrowLeft, ShieldCheck, UserCircle2, Mail, Phone, Save, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

const avatarGradients = [
  'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-xs',
  'bg-gradient-to-tr from-rose-500 to-pink-600 text-white shadow-xs',
  'bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-xs',
  'bg-gradient-to-tr from-amber-500 to-orange-600 text-white shadow-xs',
  'bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-xs',
  'bg-gradient-to-tr from-purple-500 to-fuchsia-600 text-white shadow-xs',
];

const getToneClass = (seed: string) => {
  const sum = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return avatarGradients[sum % avatarGradients.length];
};

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

  const friendId = localStorage.getItem('viewingFriendId');

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

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
      console.warn('Backend friend lookup failed, checking local database:', error);
      const local = await db.friends
        .filter((f) => !f.deletedAt && (f.cloudId === friendId || String(f.id) === friendId))
        .first();
      if (local) {
        setFriend({
          id: local.cloudId || String(local.id),
          name: local.name,
          email: local.email || null,
          phone: local.phone || null,
          isRegistered: false,
          expenses: [],
          totalOutstanding: 0,
          totalPaid: 0,
          totalExpenses: 0,
        });
        setForm({ name: local.name, email: local.email || '', phone: local.phone || '' });
      } else {
        toast.error('Failed to load friend profile.');
      }
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
          <Loader2 className="animate-spin text-purple-600" size={32} />
        </div>
      </CenteredLayout>
    );
  }

  if (!friend) {
    return (
      <CenteredLayout>
        <div className="space-y-4 pb-36">
          <button
            data-testid="friend-profile-back-to-friends"
            onClick={() => setCurrentPage('friends')}
            className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft size={16} /> Back to Friends
          </button>
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white/80 backdrop-blur-md px-4 py-12 text-center">
            <p className="text-sm text-gray-500">Friend not found. They may not have synced yet — try again once online.</p>
          </div>
        </div>
      </CenteredLayout>
    );
  }

  return (
    <CenteredLayout>
      <div className="space-y-4 sm:space-y-6 pb-36">
        {/* Page Header */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            data-testid="friend-profile-back"
            onClick={() => setCurrentPage('friends')}
            title="Back to Friends"
            aria-label="Back to Friends"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/80 hover:bg-slate-100 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
          >
            <ArrowLeft size={18} className="text-slate-700" />
          </button>
          <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate text-lg sm:text-2xl font-bold">
            Friend Profile
          </h1>
        </div>

        {/* Profile Card - Responsive layout that never breaks badge text */}
        <div className="rounded-[24px] sm:rounded-[32px] border border-slate-100 bg-white/95 backdrop-blur-md p-4 sm:p-6 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex items-center justify-between gap-3 sm:gap-5">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div
              className={cn(
                "w-13 h-13 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-bold text-xl sm:text-2xl ring-2 ring-white shadow-xs shrink-0",
                getToneClass(friend.name)
              )}
            >
              {friend.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                <h2 className="text-lg sm:text-2xl font-bold text-slate-900 truncate">
                  {friend.name}
                </h2>
                {friend.isRegistered ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-0.5 text-xs font-bold shrink-0 whitespace-nowrap">
                    <ShieldCheck size={12} /> Kanaku User
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 px-2.5 py-0.5 text-xs font-semibold shrink-0 whitespace-nowrap">
                    <UserCircle2 size={12} /> Guest
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1 truncate">
                {friend.email || friend.phone || 'No contact info'}
              </p>
            </div>
          </div>
          <Button
            data-testid="friend-profile-edit"
            variant="secondary"
            onClick={() => setEditing((v) => !v)}
            className="h-8.5 sm:h-9.5 px-3.5 sm:px-4 rounded-full border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm shadow-xs cursor-pointer active:scale-95 transition-all shrink-0"
          >
            <Pencil size={12} className="mr-1.5" /> Edit
          </Button>
        </div>

        {/* Inline Edit Card */}
        {editing && (
          <div className="rounded-[24px] sm:rounded-[28px] border border-purple-100 bg-white/95 backdrop-blur-md p-4 sm:p-6 shadow-md space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="friend-edit-name" className="text-xs font-bold text-slate-500 uppercase tracking-wide">Name</label>
              <input
                id="friend-edit-name"
                name="name"
                aria-label="Friend name"
                data-testid="friend-profile-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="friend-edit-email" className="text-xs font-bold text-slate-500 uppercase tracking-wide">Email</label>
                <input
                  id="friend-edit-email"
                  name="email"
                  aria-label="Friend email"
                  data-testid="friend-profile-input-2"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="friend-edit-phone" className="text-xs font-bold text-slate-500 uppercase tracking-wide">Phone</label>
                <input
                  id="friend-edit-phone"
                  name="phone"
                  aria-label="Friend phone"
                  data-testid="friend-profile-input-3"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
                />
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">Changes update across all expenses this friend is part of.</p>
            <div className="flex gap-2">
              <Button
                data-testid="friend-profile-save-changes"
                onClick={handleSave}
                disabled={saving}
                className="bg-slate-900 hover:bg-black text-white h-10 px-5 rounded-full font-bold flex items-center gap-2 shadow-xs cursor-pointer active:scale-95 transition-all"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
              </Button>
              <Button
                variant="secondary"
                onClick={() => setEditing(false)}
                className="h-10 px-5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <SegmentedTabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'expenses', label: 'Expenses' },
            { id: 'activity', label: 'Activity' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {/* Overview Tab - 2x2 Clean Dashboard Grid */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
            <div className="rounded-[20px] sm:rounded-[24px] border border-slate-100 bg-white/95 backdrop-blur-sm p-3.5 sm:p-5 shadow-[0_4px_20px_-4px_rgba(112,144,176,0.06)]">
              <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Mail size={13} className="shrink-0 text-slate-400" /> Email
              </p>
              <p className="text-xs sm:text-sm font-bold text-slate-900 mt-1.5 truncate">
                {friend.email || '—'}
              </p>
            </div>
            <div className="rounded-[20px] sm:rounded-[24px] border border-slate-100 bg-white/95 backdrop-blur-sm p-3.5 sm:p-5 shadow-[0_4px_20px_-4px_rgba(112,144,176,0.06)]">
              <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Phone size={13} className="shrink-0 text-slate-400" /> Phone
              </p>
              <p className="text-xs sm:text-sm font-bold text-slate-900 mt-1.5 truncate">
                {friend.phone || '—'}
              </p>
            </div>
            <div className="rounded-[20px] sm:rounded-[24px] border border-rose-100/80 bg-gradient-to-br from-rose-50/90 to-rose-100/40 p-3.5 sm:p-5 shadow-2xs">
              <p className="text-xs font-bold text-rose-500 uppercase tracking-wider">
                Total Pending
              </p>
              <p className="text-base sm:text-xl font-black text-rose-700 mt-1.5 tracking-tight truncate">
                {formatCurrency(friend.totalOutstanding)}
              </p>
            </div>
            <div className="rounded-[20px] sm:rounded-[24px] border border-emerald-100/80 bg-gradient-to-br from-emerald-50/90 to-emerald-100/40 p-3.5 sm:p-5 shadow-2xs">
              <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">
                Total Paid
              </p>
              <p className="text-base sm:text-xl font-black text-emerald-700 mt-1.5 tracking-tight truncate">
                {formatCurrency(friend.totalPaid)}
              </p>
            </div>
          </div>
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && (
          <div className="space-y-2.5 sm:space-y-3">
            {friend.expenses.length === 0 ? (
              <div className="rounded-[24px] sm:rounded-[28px] border border-dashed border-slate-200 bg-white/80 backdrop-blur-md px-4 py-14 text-center">
                <p className="text-sm font-medium text-slate-500">No expenses with this friend yet.</p>
              </div>
            ) : (
              friend.expenses.map((expense) => (
                <div
                  key={expense.groupExpenseId}
                  className="flex items-center justify-between rounded-[20px] sm:rounded-[24px] border border-slate-100 bg-white/95 backdrop-blur-md p-3.5 sm:p-4.5 shadow-[0_4px_20px_-4px_rgba(112,144,176,0.06)] hover:border-purple-200 transition-all"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-bold text-slate-900 truncate text-sm sm:text-base">{expense.name}</p>
                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{formatDate(expense.date)}{expense.category ? ` · ${expense.category}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-900 text-sm sm:text-base">{formatCurrency(expense.shareAmount)}</p>
                    <span className={cn(
                      "text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-block mt-0.5",
                      expense.status === 'paid' ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"
                    )}>
                      {expense.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="rounded-[24px] sm:rounded-[28px] border border-slate-100 bg-white/95 backdrop-blur-md p-5 sm:p-7 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-3">
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              {friend.isRegistered
                ? `${friend.name} has a Kanaku account and receives in-app + email notifications when added to a new expense.`
                : `${friend.name} is not yet registered with Kanaku. They receive an email invite each time they're added to an expense.`}
            </p>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">
              {friend.totalExpenses} total expense{friend.totalExpenses === 1 ? '' : 's'} shared so far.
            </p>
          </div>
        )}
      </div>
    </CenteredLayout>
  );
};
