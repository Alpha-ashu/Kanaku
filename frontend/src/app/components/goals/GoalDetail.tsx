import React, { useEffect, useMemo, useState } from 'react';
import { db, Goal, GoalContribution } from '@/lib/database';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import { addGoalContribution } from '@/lib/goalContributions';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { getGoalCategoryMeta, getGoalProgress, getMilestoneLabel, getMonthlySuggestion } from '@/lib/goal-utils';
import { 
  ArrowDownLeft, MessageSquare, Plus, Target, ArrowLeft,
  Plane, Car, Laptop, Heart, GraduationCap, Briefcase, Smile, ShieldAlert, TrendingUp, Sparkles, Users, Calendar
} from 'lucide-react';
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

const AVATAR_PALETTE = [
  { bg: 'bg-[#C4B5FD]', text: 'text-[#4C1D95]' }, // lavender / purple (You)
  { bg: 'bg-[#67E8F9]', text: 'text-[#164E63]' }, // cyan
  { bg: 'bg-[#FCD34D]', text: 'text-[#78350F]' }, // amber / yellow
  { bg: 'bg-[#6EE7B7]', text: 'text-[#064E3B]' }, // emerald / mint
  { bg: 'bg-[#F472B6]', text: 'text-[#831843]' }, // pink
  { bg: 'bg-[#FDBA74]', text: 'text-[#7C2D12]' }, // orange
];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const getCategoryIcon = (categoryKey?: string) => {
  switch (categoryKey) {
    case 'travel':
      return <Plane className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
    case 'emergency':
      return <ShieldAlert className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
    case 'gadget':
      return <Laptop className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
    case 'wedding':
      return <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
    case 'education':
      return <GraduationCap className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
    case 'investment':
      return <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
    case 'vehicle':
      return <Car className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
    case 'business':
      return <Briefcase className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
    case 'personal':
      return <Smile className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
    default:
      return <Target className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.2]" />;
  }
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
      try {
        await addGoalContribution({
          goal,
          account,
          amount,
          notes,
          memberName: goal.isGroupGoal ? memberName : undefined,
          status: goal.isGroupGoal ? 'paid' : undefined,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not add the contribution');
        return;
      }

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
      <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">
        {goal.name}
      </h1>
    </div>
  </div>

  <div className="space-y-6">
    {/* TOP HERO CARD — Matches Reference Image 2 */}
    <div className="bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#9333EA] rounded-[28px] sm:rounded-[36px] p-6 sm:p-8 text-white relative overflow-hidden shadow-[0_20px_50px_-12px_rgba(124,58,237,0.35)] border border-purple-400/20">
      {/* Ambient decorative glow */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-white/10 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-purple-950/30 blur-3xl rounded-full pointer-events-none" />

      {/* Top Row: Amount & Translucent Squircle Icon (Matches Image 2) */}
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] sm:text-xs font-semibold text-purple-100/90 tracking-wide uppercase">
            Saved so far
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white mt-0.5">
            {formatCurrency(goal.currentAmount)}
          </h2>
        </div>

        {/* Squircle category icon badge matching Image 2 */}
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center text-white shadow-xs shrink-0">
          {getCategoryIcon(goal.category)}
        </div>
      </div>

      {/* Middle: Progress Bar with High-Contrast Indicator */}
      <div className="relative z-10 my-4 sm:my-5">
        <div className="w-full h-2.5 bg-black/25 backdrop-blur-xs rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-white via-purple-100 to-emerald-300 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] sm:text-xs font-semibold text-purple-100/90 mt-1.5">
          <span>{progress.toFixed(0)}% completed {milestone ? `• ${milestone}` : ''}</span>
          <span>Target: {formatCurrency(goal.targetAmount)}</span>
        </div>
      </div>

      {/* Bottom Row: Overlapping Avatars (Left) & Pill Badge (Right) */}
      <div className="relative z-10 flex items-center justify-between gap-3 pt-1 flex-wrap sm:flex-nowrap">
        {/* Overlapping Avatars: You, RS, MK, VN (Matches Image 2) */}
        <div className="flex items-center -space-x-2">
          {/* (You) Bubble */}
          <div
            className={cn(
              "w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-black text-[11px] sm:text-xs ring-2 ring-[#7C3AED] shadow-xs shrink-0 z-10",
              AVATAR_PALETTE[0].bg,
              AVATAR_PALETTE[0].text
            )}
            title="You"
          >
            You
          </div>

          {/* Collaborator member bubbles */}
          {goal.isGroupGoal && goal.members && goal.members.length > 0 && (
            goal.members.slice(0, 3).map((m, idx) => {
              const palette = AVATAR_PALETTE[(idx + 1) % AVATAR_PALETTE.length];
              const initials = getInitials(m.name);
              return (
                <div
                  key={m.name}
                  className={cn(
                    "w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-black text-[11px] sm:text-xs ring-2 ring-[#7C3AED] shadow-xs shrink-0",
                    palette.bg,
                    palette.text
                  )}
                  style={{ zIndex: 9 - idx }}
                  title={m.name}
                >
                  {initials}
                </div>
              );
            })
          )}

          {goal.isGroupGoal && goal.members && goal.members.length > 3 && (
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-black text-[10px] sm:text-[11px] bg-[#F472B6] text-[#831843] ring-2 ring-[#7C3AED] shadow-xs shrink-0 z-0"
              title={`${goal.members.length - 3} more collaborators`}
            >
              +{goal.members.length - 3}
            </div>
          )}

          {!goal.isGroupGoal && (
            <span className="ml-3 pl-2 text-xs font-semibold text-purple-200">Solo Goal</span>
          )}
        </div>

        {/* Pill Badge matching "You are owed ₹4,850" from Reference Image 2 */}
        <div className="bg-white/20 hover:bg-white/25 backdrop-blur-md px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold text-white text-[10px] sm:text-xs tracking-wide shadow-xs border border-white/10 shrink-0">
          {Math.max(0, goal.targetAmount - goal.currentAmount) <= 0
            ? 'Goal Completed 🎉'
            : `${formatCurrency(Math.max(0, goal.targetAmount - goal.currentAmount))} remaining`}
        </div>
      </div>
    </div>

    {/* Financial Metric Cards */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
      <div className="p-3 sm:p-4 rounded-[20px] bg-white dark:bg-card border border-slate-100/80 dark:border-border/60 shadow-2xs">
        <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-0.5">Target</p>
        <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">{formatCurrency(goal.targetAmount)}</p>
      </div>
      <div className="p-3 sm:p-4 rounded-[20px] bg-white dark:bg-card border border-slate-100/80 dark:border-border/60 shadow-2xs">
        <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-0.5">Saved</p>
        <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">{formatCurrency(goal.currentAmount)}</p>
      </div>
      <div className="p-3 sm:p-4 rounded-[20px] bg-white dark:bg-card border border-slate-100/80 dark:border-border/60 shadow-2xs">
        <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-0.5">Monthly</p>
        <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
          {formatCurrency(monthlySuggestion.monthlyAmount)}<span className="text-[10px] font-semibold text-slate-400">/mo</span>
        </p>
      </div>
      <div className="p-3 sm:p-4 rounded-[20px] bg-white dark:bg-card border border-slate-100/80 dark:border-border/60 shadow-2xs">
        <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-0.5">Due Date</p>
        <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
          {new Date(goal.targetDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </div>

    {/* Suggested Saving and Timeline Insights Banner */}
    <div className="rounded-[20px] border border-slate-100/90 dark:border-border/40 bg-white dark:bg-card p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
        <span className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-200">
          Suggested: <span className="text-purple-600 font-extrabold">{formatCurrency(monthlySuggestion.monthlyAmount)}/mo</span> for {monthlySuggestion.months} month(s)
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs text-slate-500 font-medium">
        <span className="flex items-center gap-1">
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          Last: {lastContributionDate
            ? lastContributionDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            : 'None'}
        </span>
        {completedOnDate && (
          <span className="flex items-center gap-1 font-bold text-emerald-600">
            <div className="w-1 h-1 rounded-full bg-emerald-500" />
            Done: {completedOnDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>
    </div>

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
  <div className="space-y-4">
        <div className="bg-white dark:bg-card rounded-[24px] sm:rounded-[28px] p-4 sm:p-5 border border-slate-100/80 dark:border-border/60 shadow-[0_6px_20px_-4px_rgba(112,144,176,0.08)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
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
            <form data-testid="goal-detail-form" onSubmit={addContribution} className="space-y-3">
              <div>
                <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  data-testid="goals-detail-amount-input"
                  className="w-full bg-slate-50/70 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-slate-900 font-semibold text-sm sm:text-base placeholder-slate-400 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 transition-all"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">From Account</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(parseInt(e.target.value, 10))}
                  data-testid="goals-detail-account-select"
                  className="w-full bg-slate-50/70 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 font-medium focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 transition-all appearance-none"
                >
                  {accounts.map((account) => (
                    <option data-testid={`goal-detail-option-${account.id}`} key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
              {goal.isGroupGoal && (
                <div>
                  <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Group Member</label>
                  <select
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    data-testid="goals-detail-member-select"
                    className="w-full bg-slate-50/70 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 font-medium focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 transition-all appearance-none"
                  >
                    {/* "Me" — current user's own contribution */}
                    <option data-testid="goal-detail-option-2-me" value="Me">Me (You)</option>
                    {(goal.members || []).map((member) => (
                      <option data-testid={`goal-detail-option-2-${member.name}`} key={member.name} value={member.name}>{member.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  data-testid="goals-detail-notes-textarea"
                  className="w-full resize-none rounded-xl bg-slate-50/70 border border-slate-200/80 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
                  rows={2}
                  placeholder="Optional note for this contribution"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="goals-detail-submit-button"
                className="w-full py-2.5 sm:py-3 rounded-full bg-[#18181B] hover:bg-black disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                <Plus size={16} /> Add Contribution
              </button>
            </form>
          ) : (
            <form data-testid="goal-detail-withdraw-form" onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">Withdraw Amount</label>
                  <span className="text-[10px] sm:text-xs text-gray-500 font-medium">Available: {formatCurrency(goal.currentAmount)}</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  max={goal.currentAmount}
                  value={withdrawAmount || ''}
                  onChange={(e) => setWithdrawAmount(parseFloat(e.target.value) || 0)}
                  data-testid="goals-detail-withdraw-input"
                  className="w-full bg-white border-0 rounded-xl px-3.5 py-2.5 text-gray-900 font-medium text-sm sm:text-base placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Deposit To Account</label>
                <select
                  value={withdrawAccountId}
                  onChange={(e) => setWithdrawAccountId(parseInt(e.target.value, 10))}
                  data-testid="goals-detail-withdraw-account-select"
                  className="w-full bg-white border-0 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-gray-900 font-medium focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all appearance-none"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea
                  value={withdrawNotes}
                  onChange={(e) => setWithdrawNotes(e.target.value)}
                  data-testid="goals-detail-withdraw-notes"
                  className="w-full resize-none rounded-xl bg-white px-3.5 py-2.5 text-xs sm:text-sm font-medium text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:ring-2 focus:ring-gray-900"
                  rows={2}
                  placeholder="Reason for withdrawal"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || goal.currentAmount <= 0}
                data-testid="goals-detail-withdraw-submit-button"
                className="w-full py-2.5 sm:py-3 rounded-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                <ArrowDownLeft size={16} /> Withdraw Funds
              </button>
            </form>
          )}
        </div>

  {goal.isGroupGoal && (
  <div className="bg-white dark:bg-card rounded-[24px] sm:rounded-[28px] p-4 sm:p-5 border border-slate-100/80 dark:border-border/60 shadow-[0_6px_20px_-4px_rgba(112,144,176,0.08)]">
  <div className="flex items-center justify-between mb-4">
  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Group Members</h3>
  <button data-testid="goal-detail-chat" className="text-xs font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-1.5">
  <MessageSquare size={14} /> Chat
  </button>
  </div>
  <div className="space-y-2.5">
  {memberRows.map((row) => (
  <div key={row.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40">
  <div className="flex items-center gap-2.5">
  <div className="w-8 h-8 rounded-full bg-white dark:bg-card border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs">
  {row.name.charAt(0).toUpperCase()}
  </div>
  <div>
  <p className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">{row.name}</p>
  <p className="text-[10px] text-slate-400">{row.status === 'paid' ? 'Contributed' : 'Pending'}</p>
  </div>
  </div>
  <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">{formatCurrency(row.amount)}</span>
  </div>
  ))}
  </div>
  </div>
  )}
  </div>

  <div className="bg-white dark:bg-card rounded-[24px] sm:rounded-[28px] p-4 sm:p-5 border border-slate-100/80 dark:border-border/60 shadow-[0_6px_20px_-4px_rgba(112,144,176,0.08)] h-fit">
  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-4">Contribution History</h3>
  <div className="space-y-3">
  {timeline.length === 0 && (
  <div className="text-center py-8">
  <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-2">
  <Target className="w-6 h-6" />
  </div>
  <p className="text-xs text-slate-400 font-medium">No contributions yet</p>
  </div>
  )}
  {timeline.map((item) => {
    const percent = Math.min(100, (item.total / Math.max(goal.targetAmount, 1)) * 100);
    return (
      <div key={item.month} className="flex items-center gap-2.5 sm:gap-3 group">
        <div className="w-8 sm:w-10 text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">{item.month}</div>
        <div className="flex-1 h-2 sm:h-2.5 bg-slate-100 dark:bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] rounded-full transition-all group-hover:opacity-90"
            style={{ width: `${Math.max(4, percent)}%` }}
          />
        </div>
        <div className="w-20 sm:w-24 text-right font-bold text-slate-900 dark:text-white text-[10px] sm:text-xs">{formatCurrency(item.total)}</div>
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
