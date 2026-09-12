import React, { useEffect, useMemo, useState } from 'react';
import { db, Goal, GoalContribution } from '@/lib/database';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { getGoalCategoryMeta, getGoalProgress, getMilestoneLabel, getMonthlySuggestion } from '@/lib/goal-utils';
import { ArrowDownLeft, MessageSquare, Plus, Target, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { takeVoiceDraft, VOICE_GOAL_DRAFT_KEY, type VoiceGoalDraft } from '@/lib/voiceDrafts';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { backendService } from '@/lib/backend-api';
import { queueRecordUpsertSync, processPendingSyncQueue } from '@/lib/auth-sync-integration';
import { cn } from '@/lib/utils';

const SELECTED_GOAL_ID_KEY = 'selected_goal_id';

type MemberContribution = {
 name: string;
 amount: number;
 status: 'paid' | 'pending';
};

export const GoalDetail: React.FC = () => {
 const { setCurrentPage, currency, accounts } = useApp();
 const [goal, setGoal] = useState<Goal | null>(null);
 const [contributions, setContributions] = useState<GoalContribution[]>([]);
 const [activeTab, setActiveTab] = useState<'contribute' | 'withdraw'>('contribute');
 const [amount, setAmount] = useState(0);
 const [accountId, setAccountId] = useState<number>(accounts[0]?.id || 0);
 const [memberName, setMemberName] = useState<string>('');
 const [notes, setNotes] = useState('');
 const [withdrawAmount, setWithdrawAmount] = useState(0);
 const [withdrawAccountId, setWithdrawAccountId] = useState<number>(accounts[0]?.id || 0);
 const [withdrawNotes, setWithdrawNotes] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);

 useEffect(() => {
 const selectedId = Number(localStorage.getItem(SELECTED_GOAL_ID_KEY));
 if (!Number.isFinite(selectedId)) {
 setCurrentPage('goals');
 return;
 }

 const load = async () => {
 const foundGoal = await db.goals.get(selectedId);
 if (!foundGoal) {
 setCurrentPage('goals');
 return;
 }

 const rows = await db.goalContributions.where('goalId').equals(selectedId).reverse().sortBy('date');
 setGoal(foundGoal);
 setContributions(rows.reverse());
 setMemberName(foundGoal.members?.[0]?.name || '');
 };

 void load();
 }, [setCurrentPage]);

 useEffect(() => {
 if (!goal?.id) {
 return;
 }

 const draft = takeVoiceDraft<VoiceGoalDraft>(VOICE_GOAL_DRAFT_KEY);
 if (!draft?.amount) {
 return;
 }

 setAmount(draft.amount);
 setNotes(draft.description || '');
 toast.info(`Voice contribution draft loaded for ${goal.name}`);
 }, [goal?.id, goal?.name]);

 const formatCurrency = (value: number) =>
    formatCurrencyAmount(value, currency);

 const progress = goal ? getGoalProgress(goal.currentAmount, goal.targetAmount) : 0;
 const category = getGoalCategoryMeta(goal?.category);
 const milestone = getMilestoneLabel(progress);
 const monthlySuggestion = goal
 ? getMonthlySuggestion(goal.targetAmount, goal.currentAmount, new Date(goal.targetDate))
 : { months: 1, monthlyAmount: 0, remaining: 0 };

 const timeline = useMemo(() => {
 const grouped = new Map<string, number>();
 for (const contribution of contributions) {
 const month = new Date(contribution.date).toLocaleDateString('en-US', { month: 'short' });
 grouped.set(month, (grouped.get(month) || 0) + contribution.amount);
 }
 return [...grouped.entries()].map(([month, total]) => ({ month, total }));
 }, [contributions]);

 const memberRows: MemberContribution[] = useMemo(() => {
 if (!goal?.members || goal.members.length === 0) return [];

 return goal.members.map((member) => {
 const sum = contributions
 .filter((item) => item.memberName === member.name)
 .reduce((acc, item) => acc + item.amount, 0);

 return {
 name: member.name,
 amount: sum,
 status: sum > 0 ? 'paid' : 'pending',
 };
 });
 }, [goal?.members, contributions]);

 const sortedContributions = useMemo(
 () => [...contributions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
 [contributions],
 );

 const lastContributionDate = sortedContributions.length > 0
 ? new Date(sortedContributions[sortedContributions.length - 1].date)
 : null;

 const completedOnDate = useMemo(() => {
 if (!goal) return null;
 let runningTotal = 0;
 for (const contribution of sortedContributions) {
 runningTotal += contribution.amount;
 if (runningTotal >= goal.targetAmount) {
 return new Date(contribution.date);
 }
 }
 if (goal.currentAmount >= goal.targetAmount && lastContributionDate) {
 return lastContributionDate;
 }
 return null;
 }, [goal, sortedContributions, lastContributionDate]);

  const addContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal?.id) return;
    if (amount <= 0) {
      toast.error('Enter a valid contribution amount');
      return;
    }

    const account = accounts.find((item) => item.id === accountId);
    if (!account) {
      toast.error('Select an account for this contribution');
      return;
    }

    if (account.balance < amount) {
      toast.error('Selected account does not have enough balance');
      return;
    }

    setIsSubmitting(true);
    try {
      if (goal.cloudId && account.cloudId && navigator.onLine) {
        try {
          await backendService.api.post(`/goals/${goal.cloudId}/contribute`, {
            amount,
            accountId: account.cloudId,
            memberName: goal.isGroupGoal ? memberName : undefined,
            notes: notes.trim() || undefined,
          });
        } catch (backendError) {
          console.warn('[GoalDetail] Direct contribution sync failed, falling back to sync queue:', backendError);
        }
      }

      await db.goalContributions.add({
        goalId: goal.id,
        amount,
        accountId,
        date: new Date(),
        memberName: goal.isGroupGoal ? memberName : undefined,
        status: goal.isGroupGoal ? 'paid' : undefined,
        notes: notes.trim() || undefined,
      });

      await db.goals.update(goal.id, {
        currentAmount: goal.currentAmount + amount,
        updatedAt: new Date(),
      });

      await applyAccountBalanceDeltas(new Map([[accountId, -amount]]));

      queueRecordUpsertSync('goals', goal.id);
      queueRecordUpsertSync('accounts', accountId);
      void processPendingSyncQueue();

      toast.success('Contribution added');
      setAmount(0);
      setNotes('');

      const updatedGoal = await db.goals.get(goal.id);
      const rows = await db.goalContributions.where('goalId').equals(goal.id).reverse().sortBy('date');
      setGoal(updatedGoal || null);
      setContributions(rows.reverse());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal?.id) return;
    if (withdrawAmount <= 0) {
      toast.error('Enter a valid withdrawal amount');
      return;
    }

    if (withdrawAmount > goal.currentAmount) {
      toast.error('Withdrawal amount exceeds goal balance');
      return;
    }

    const account = accounts.find((item) => item.id === withdrawAccountId);
    if (!account) {
      toast.error('Select an account to receive this withdrawal');
      return;
    }

    setIsSubmitting(true);
    try {
      if (goal.cloudId && account.cloudId && navigator.onLine) {
        try {
          await backendService.api.post(`/goals/${goal.cloudId}/withdraw`, {
            amount: withdrawAmount,
            accountId: account.cloudId,
            notes: withdrawNotes.trim() || undefined,
          });
        } catch (backendError) {
          console.warn('[GoalDetail] Direct withdrawal sync failed, falling back to sync queue:', backendError);
        }
      }

      await db.goalContributions.add({
        goalId: goal.id,
        amount: -withdrawAmount,
        accountId: withdrawAccountId,
        date: new Date(),
        status: 'paid',
        notes: withdrawNotes.trim() ? `Withdrawal: ${withdrawNotes.trim()}` : 'Withdrawal from savings goal',
      });

      await db.goals.update(goal.id, {
        currentAmount: Math.max(0, goal.currentAmount - withdrawAmount),
        updatedAt: new Date(),
      });

      await applyAccountBalanceDeltas(new Map([[withdrawAccountId, withdrawAmount]]));

      queueRecordUpsertSync('goals', goal.id);
      queueRecordUpsertSync('accounts', withdrawAccountId);
      void processPendingSyncQueue();

      toast.success('Funds withdrawn to account');
      setWithdrawAmount(0);
      setWithdrawNotes('');

      const updatedGoal = await db.goals.get(goal.id);
      const rows = await db.goalContributions.where('goalId').equals(goal.id).reverse().sortBy('date');
      setGoal(updatedGoal || null);
      setContributions(rows.reverse());
    } finally {
      setIsSubmitting(false);
    }
  };

 if (!goal) {
 return null;
 }

  return (
  <CenteredLayout>
  <div className="space-y-6">
  
  <div className="flex items-center justify-between gap-3 w-full">
    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
      <button
        type="button"
        onClick={() => setCurrentPage('goals')}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
        aria-label="Back to Goals"
        title="Back to Goals"
        data-testid="goals-detail-back-button"
      >
        <ArrowLeft size={18} className="text-slate-700" />
      </button>
      <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none truncate">
        {goal.name}
      </h1>
    </div>
  </div>

  <div className="space-y-6">
  <div className="bg-white dark:bg-card rounded-[28px] sm:rounded-[32px] p-6 lg:p-8 border border-slate-100/80 dark:border-border/60 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] space-y-6">
  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40">
  <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mb-1">Target</p>
  <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(goal.targetAmount)}</p>
  </div>
  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40">
  <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mb-1">Saved</p>
  <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(goal.currentAmount)}</p>
  </div>
  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40">
  <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mb-1">Remaining</p>
  <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(Math.max(0, goal.targetAmount - goal.currentAmount))}</p>
  </div>
  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40">
  <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mb-1">Goal Type</p>
  <p className="text-2xl font-bold text-slate-900 dark:text-white">{goal.isGroupGoal ? 'Group' : 'Individual'}</p>
  </div>
  </div>

  <div>
    <div className="w-full h-3 bg-slate-100 dark:bg-muted rounded-full overflow-hidden">
      <div
        className="h-3 bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
    <div className="flex items-center justify-between text-xs sm:text-sm font-semibold mt-2.5">
      <span className="text-slate-600 dark:text-slate-300">{progress.toFixed(0)}% completed</span>
      {milestone && <span className="font-bold text-emerald-600">{milestone}</span>}
    </div>
  </div>

  <div className="rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-100/60 p-4 flex items-start gap-3">
  <Target className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
  <div>
  <p className="text-sm font-semibold text-slate-900 dark:text-white">Suggested Saving</p>
  <p className="text-sm text-slate-500">{formatCurrency(monthlySuggestion.monthlyAmount)} / month for {monthlySuggestion.months} month(s)</p>
  </div>
  </div>

  <div className="rounded-2xl border border-slate-100 dark:border-border/40 bg-slate-50/50 dark:bg-muted/20 p-4">
  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Timeline Insights</p>
  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
  <span className="flex items-center gap-2">
  <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
  Last contribution: {lastContributionDate
  ? lastContributionDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : 'No contribution yet'}
  </span>
  {completedOnDate && (
  <span className="flex items-center gap-2 font-semibold text-emerald-600">
  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
  Completed on: {completedOnDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
  </span>
  )}
  </div>
  </div>
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <div className="space-y-6">
        <div className="bg-white dark:bg-card rounded-[28px] sm:rounded-[32px] p-6 lg:p-8 border border-slate-100/80 dark:border-border/60 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              {activeTab === 'contribute' ? 'Add Contribution' : 'Withdraw Funds'}
            </h3>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full">
              <button
                type="button"
                onClick={() => setActiveTab('contribute')}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5',
                  activeTab === 'contribute' ? 'bg-[#18181B] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                <Plus size={13} /> Add
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('withdraw')}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5',
                  activeTab === 'withdraw' ? 'bg-[#18181B] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                <ArrowDownLeft size={13} /> Withdraw
              </button>
            </div>
          </div>

          {activeTab === 'contribute' ? (
            <form data-testid="goal-detail-form" onSubmit={addContribution} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  data-testid="goals-detail-amount-input"
                  className="w-full bg-slate-50/70 border border-slate-200/80 rounded-2xl px-4 py-3.5 text-slate-900 font-semibold text-lg placeholder-slate-400 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 transition-all"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">From Account</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(parseInt(e.target.value, 10))}
                  data-testid="goals-detail-account-select"
                  className="w-full bg-slate-50/70 border border-slate-200/80 rounded-2xl px-4 py-3.5 text-slate-900 font-medium focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 transition-all appearance-none"
                >
                  {accounts.map((account) => (
                    <option data-testid={`goal-detail-option-${account.id}`} key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
              {goal.isGroupGoal && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Group Member</label>
                  <select
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    data-testid="goals-detail-member-select"
                    className="w-full bg-slate-50/70 border border-slate-200/80 rounded-2xl px-4 py-3.5 text-slate-900 font-medium focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 transition-all appearance-none"
                  >
                    {(goal.members || []).map((member) => (
                      <option data-testid={`goal-detail-option-2-${member.name}`} key={member.name} value={member.name}>{member.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  data-testid="goals-detail-notes-textarea"
                  className="w-full resize-none rounded-2xl bg-slate-50/70 border border-slate-200/80 px-4 py-3.5 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
                  rows={3}
                  placeholder="Optional note for this contribution"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="goals-detail-submit-button"
                className="w-full py-3.5 rounded-full bg-[#18181B] hover:bg-black disabled:opacity-50 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 mt-2 shadow-xs"
              >
                <Plus size={18} /> Add Contribution
              </button>
            </form>
          ) : (
            <form data-testid="goal-detail-withdraw-form" onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Withdraw Amount</label>
                  <span className="text-xs text-gray-500 font-medium">Available: {formatCurrency(goal.currentAmount)}</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  max={goal.currentAmount}
                  value={withdrawAmount || ''}
                  onChange={(e) => setWithdrawAmount(parseFloat(e.target.value) || 0)}
                  data-testid="goals-detail-withdraw-input"
                  className="w-full bg-white border-0 rounded-2xl px-4 py-3.5 text-gray-900 font-medium text-lg placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Deposit To Account</label>
                <select
                  value={withdrawAccountId}
                  onChange={(e) => setWithdrawAccountId(parseInt(e.target.value, 10))}
                  data-testid="goals-detail-withdraw-account-select"
                  className="w-full bg-white border-0 rounded-2xl px-4 py-3.5 text-gray-900 font-medium focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all appearance-none"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</label>
                <textarea
                  value={withdrawNotes}
                  onChange={(e) => setWithdrawNotes(e.target.value)}
                  data-testid="goals-detail-withdraw-notes"
                  className="w-full resize-none rounded-2xl bg-white px-4 py-3.5 text-sm font-medium text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:ring-2 focus:ring-gray-900"
                  rows={3}
                  placeholder="Reason for withdrawal"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || goal.currentAmount <= 0}
                data-testid="goals-detail-withdraw-submit-button"
                className="w-full py-3.5 rounded-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 mt-2 shadow-xs"
              >
                <ArrowDownLeft size={18} /> Withdraw Funds
              </button>
            </form>
          )}
        </div>

  {goal.isGroupGoal && (
  <div className="bg-white dark:bg-card rounded-[28px] sm:rounded-[32px] p-6 lg:p-8 border border-slate-100/80 dark:border-border/60 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)]">
  <div className="flex items-center justify-between mb-6">
  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Group Members</h3>
  <button data-testid="goal-detail-chat" className="text-sm font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-2">
  <MessageSquare size={16} /> Chat
  </button>
  </div>
  <div className="space-y-4">
  {memberRows.map((row) => (
  <div key={row.name} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40">
  <div className="flex items-center gap-3">
  <div className="w-10 h-10 rounded-full bg-white dark:bg-card border border-slate-200 flex items-center justify-center text-slate-700 font-bold">
  {row.name.charAt(0).toUpperCase()}
  </div>
  <div>
  <p className="font-bold text-slate-900 dark:text-white text-sm">{row.name}</p>
  <p className="text-xs text-slate-400">{row.status === 'paid' ? 'Contributed' : 'Pending'}</p>
  </div>
  </div>
  <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(row.amount)}</span>
  </div>
  ))}
  </div>
  </div>
  )}
  </div>

  <div className="bg-white dark:bg-card rounded-[28px] sm:rounded-[32px] p-6 lg:p-8 border border-slate-100/80 dark:border-border/60 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] h-fit">
  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Contribution History</h3>
  <div className="space-y-4">
  {timeline.length === 0 && (
  <div className="text-center py-12">
  <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
  <Target className="w-8 h-8" />
  </div>
  <p className="text-sm text-slate-400 font-medium">No contributions yet</p>
  </div>
  )}
  {timeline.map((item) => {
    const percent = Math.min(100, (item.total / Math.max(goal.targetAmount, 1)) * 100);
    return (
      <div key={item.month} className="flex items-center gap-3 sm:gap-4 group">
        <div className="w-10 sm:w-12 text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">{item.month}</div>
        <div className="flex-1 h-2.5 sm:h-3 bg-slate-100 dark:bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] rounded-full transition-all group-hover:opacity-90"
            style={{ width: `${Math.max(4, percent)}%` }}
          />
        </div>
        <div className="w-24 text-right font-bold text-slate-900 dark:text-white text-xs sm:text-sm">{formatCurrency(item.total)}</div>
      </div>
    );
  })}
  </div>
  </div></div>
 </div>
 </div>
 </CenteredLayout>
 );
};
