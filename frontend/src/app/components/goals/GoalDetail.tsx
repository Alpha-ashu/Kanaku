import React, { useEffect, useMemo, useState } from 'react';
import { db, Goal, GoalContribution } from '@/lib/database';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { getGoalCategoryMeta, getGoalProgress, getMilestoneLabel, getMonthlySuggestion } from '@/lib/goal-utils';
import { MessageSquare, Plus, Target } from 'lucide-react';
import { toast } from 'sonner';
import { takeVoiceDraft, VOICE_GOAL_DRAFT_KEY, type VoiceGoalDraft } from '@/lib/voiceDrafts';

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
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState<number>(accounts[0]?.id || 0);
  const [memberName, setMemberName] = useState<string>('');
  const [notes, setNotes] = useState('');

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
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

  const getWidthClass = (value: number) => {
    const safe = Math.max(0, Math.min(100, value));
    const bucket = Math.round(safe / 10) * 10;

    switch (bucket) {
      case 0: return 'w-0';
      case 10: return 'w-[10%]';
      case 20: return 'w-[20%]';
      case 30: return 'w-[30%]';
      case 40: return 'w-[40%]';
      case 50: return 'w-1/2';
      case 60: return 'w-[60%]';
      case 70: return 'w-[70%]';
      case 80: return 'w-[80%]';
      case 90: return 'w-[90%]';
      default: return 'w-full';
    }
  };

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

    await db.accounts.update(accountId, { balance: account.balance - amount });

    toast.success('Contribution added');
    setAmount(0);
    setNotes('');

    const updatedGoal = await db.goals.get(goal.id);
    const rows = await db.goalContributions.where('goalId').equals(goal.id).reverse().sortBy('date');
    setGoal(updatedGoal || null);
    setContributions(rows.reverse());
  };

  if (!goal) {
    return null;
  }

  return (
    <CenteredLayout>
      <div className="space-y-6">
        
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
              {goal.name}
            </h1>
          </div>
          <button
            onClick={() => setCurrentPage('goals')}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-2xl transition-colors"
          >
            Back to Goals
          </button>
        </div>

      <div className="space-y-6">
        <div className="bg-white rounded-[32px] p-6 lg:p-8 ring-1 ring-gray-100 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)] space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Target</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(goal.targetAmount)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Saved</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(goal.currentAmount)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Remaining</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(Math.max(0, goal.targetAmount - goal.currentAmount))}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Goal Type</p>
              <p className="text-2xl font-bold text-gray-900">{goal.isGroupGoal ? 'Group' : 'Individual'}</p>
            </div>
          </div>

          <div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-3 bg-gray-900 rounded-full transition-all duration-1000 ${getWidthClass(progress)}`} />
            </div>
            <p className="text-sm mt-3 text-gray-600 font-medium">{progress.toFixed(0)}% completed</p>
            {milestone && <p className="text-sm font-bold text-emerald-600 mt-1">{milestone} </p>}
          </div>

          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 flex items-start gap-3">
            <Target className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Suggested Saving</p>
              <p className="text-sm text-gray-500">{formatCurrency(monthlySuggestion.monthlyAmount)} / month for {monthlySuggestion.months} month(s)</p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">Timeline Insights</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
              <span className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
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
            <div className="bg-white rounded-[32px] p-6 lg:p-8 ring-1 ring-gray-100 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)]">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Add Contribution</h3>
              <form onSubmit={addContribution} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-50 border-0 rounded-2xl px-4 py-3.5 text-gray-900 font-medium text-lg placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">From Account</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(parseInt(e.target.value, 10))}
                    className="w-full bg-gray-50 border-0 rounded-2xl px-4 py-3.5 text-gray-900 font-medium focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all appearance-none"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
                {goal.isGroupGoal && (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Group Member</label>
                    <select
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                      className="w-full bg-gray-50 border-0 rounded-2xl px-4 py-3.5 text-gray-900 font-medium focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all appearance-none"
                    >
                      {(goal.members || []).map((member) => (
                        <option key={member.name} value={member.name}>{member.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full resize-none rounded-2xl bg-gray-50 px-4 py-3.5 text-sm font-medium text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:ring-2 focus:ring-gray-900"
                    rows={3}
                    placeholder="Optional note for this contribution"
                  />
                </div>
                <button type="submit" className="w-full py-4 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 mt-2">
                  <Plus size={18} /> Add Contribution
                </button>
              </form>
            </div>

            {goal.isGroupGoal && (
              <div className="bg-white rounded-[32px] p-6 lg:p-8 ring-1 ring-gray-100 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Group Members</h3>
                  <button className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center gap-2">
                    <MessageSquare size={16} /> Chat
                  </button>
                </div>
                <div className="space-y-4">
                  {memberRows.map((row) => (
                    <div key={row.name} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 font-bold">
                          {row.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{row.name}</p>
                          <p className="text-xs text-gray-500">{row.status === 'paid' ? 'Contributed' : 'Pending'}</p>
                        </div>
                      </div>
                      <span className="font-bold text-gray-900">{formatCurrency(row.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-[32px] p-6 lg:p-8 ring-1 ring-gray-100 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)] h-fit">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Contribution History</h3>
            <div className="space-y-4">
              {timeline.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Target className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">No contributions yet</p>
                </div>
              )}
              {timeline.map((item) => (
                <div key={item.month} className="flex items-center gap-4 group">
                  <div className="w-12 text-xs font-bold text-gray-400 uppercase tracking-wider">{item.month}</div>
                  <div className="flex-1 h-3 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                    <div 
                      className={`h-full bg-gray-900 rounded-full transition-all group-hover:bg-gray-800 ${getWidthClass((item.total / Math.max(goal.targetAmount, 1)) * 100)}`} 
                    />
                  </div>
                  <div className="w-24 text-right font-bold text-gray-900 text-sm">{formatCurrency(item.total)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </CenteredLayout>
  );
};
