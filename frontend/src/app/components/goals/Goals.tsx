import React, { useEffect, useState } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import { getGoalCategoryMeta, getGoalProgress, getMilestoneLabel, getMonthlySuggestion } from '@/lib/goal-utils';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { Edit2, Plus, Target, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VOICE_GOAL_DRAFT_KEY, takeVoiceDraft, type VoiceGoalDraft } from '@/lib/voiceDrafts';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { backendService } from '@/lib/backend-api';
import { queueRecordUpsertSync, processPendingSyncQueue } from '@/lib/auth-sync-integration';

export const Goals: React.FC = () => {
 const { goals, accounts, currency, setCurrentPage } = useApp();
 const canCreateGoal = useSubFeature('goals', 'createGoal');
 const canEditGoal = useSubFeature('goals', 'editGoal');
 const canDeleteGoal = useSubFeature('goals', 'deleteGoal');
 const [showContributeModal, setShowContributeModal] = useState<number | null>(null);
 const [activeContributionDraft, setActiveContributionDraft] = useState<VoiceGoalDraft | null>(null);
 const [pendingVoiceGoalDraft, setPendingVoiceGoalDraft] = useState<VoiceGoalDraft | null>(null);
 const [showVoiceGoalPicker, setShowVoiceGoalPicker] = useState(false);
 const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
 const [editFormData, setEditFormData] = useState<any>({});
 const [deleteModalOpen, setDeleteModalOpen] = useState(false);
 const [goalToDelete, setGoalToDelete] = useState<{ id: number; name: string } | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);

 const selectedGoalKey = 'selected_goal_id';

 useEffect(() => {
 const draft = takeVoiceDraft<VoiceGoalDraft>(VOICE_GOAL_DRAFT_KEY);
 if (!draft?.amount) {
 return;
 }

 if (goals.length === 0) {
 localStorage.setItem(VOICE_GOAL_DRAFT_KEY, JSON.stringify(draft));
 toast.info('No goals found yet. Create a goal with your voice draft.');
 setCurrentPage('add-goal');
 return;
 }

 setPendingVoiceGoalDraft(draft);
 setShowVoiceGoalPicker(true);
 }, [goals.length, setCurrentPage]);

 const formatCurrency = (amount: number) => {
 return formatCurrencyAmount(amount, currency);
 };

 const getDaysRemaining = (targetDate: Date) => {
 const diff = new Date(targetDate).getTime() - new Date().getTime();
 return Math.ceil(diff / (1000 * 60 * 60 * 24));
 };

 const getProgressWidthClass = (value: number) => {
 const progress = Math.max(0, Math.min(100, value));
 const bucket = Math.round(progress / 10) * 10;

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

 const openGoalDetail = (goalId: number) => {
 localStorage.setItem(selectedGoalKey, String(goalId));
 setCurrentPage('goal-detail');
 };

 const openContributionModal = (goalId: number, draft?: VoiceGoalDraft | null) => {
 setActiveContributionDraft(draft || null);
 setShowContributeModal(goalId);
 };

 const handleUseVoiceDraftForGoal = (goalId: number) => {
 openContributionModal(goalId, pendingVoiceGoalDraft);
 setShowVoiceGoalPicker(false);
 setPendingVoiceGoalDraft(null);
 };

 const handleCreateGoalFromVoiceDraft = () => {
 if (pendingVoiceGoalDraft) {
 localStorage.setItem(VOICE_GOAL_DRAFT_KEY, JSON.stringify(pendingVoiceGoalDraft));
 }
 setShowVoiceGoalPicker(false);
 setPendingVoiceGoalDraft(null);
 setCurrentPage('add-goal');
 };

 const handleEditClick = (goal: any) => {
 setEditingGoalId(goal.id);
 setEditFormData({ ...goal });
 };

 const handleSaveEdit = async () => {
 if (!editingGoalId) return;
 try {
 const updated = await db.goals.update(editingGoalId, {
 name: editFormData.name,
 targetAmount: editFormData.targetAmount,
 currentAmount: editFormData.currentAmount,
 targetDate: editFormData.targetDate ? new Date(editFormData.targetDate) : undefined,
 category: editFormData.category,
 updatedAt: new Date(),
 });

 if (!updated) {
 throw new Error('Goal not found locally');
 }

 setEditingGoalId(null);
 toast.success('Goal updated successfully');
 } catch (error) {
 console.error('Failed to update goal:', error);
 toast.error('Failed to update goal');
 }
 };

 const handleDeleteGoal = (goalId: number, goalName: string) => {
 setGoalToDelete({ id: goalId, name: goalName });
 setDeleteModalOpen(true);
 };

 const confirmDeleteGoal = async () => {
 if (!goalToDelete) return;
 setIsDeleting(true);
 try {
 await db.goals.delete(goalToDelete.id);
 toast.success('Goal deleted successfully');
 setDeleteModalOpen(false);
 setGoalToDelete(null);
 } catch (error) {
 console.error('Failed to delete goal:', error);
 toast.error('Failed to delete goal');
 } finally {
 setIsDeleting(false);
 }
 };

  const totalGoalsAmount = goals.reduce((sum, goal) => sum + Number(goal.targetAmount || 0), 0);
  const totalSavedAmount = goals.reduce((sum, goal) => sum + Number(goal.currentAmount || 0), 0);
  const totalRemainingAmount = Math.max(0, totalGoalsAmount - totalSavedAmount);
  const overallProgress = totalGoalsAmount > 0 ? (totalSavedAmount / totalGoalsAmount) * 100 : 0;
 const completedGoals = goals.filter((goal) => goal.currentAmount >= goal.targetAmount).length;

 const cardClass =
  'bg-white border border-slate-100 rounded-[24px] sm:rounded-[28px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.10)]';
 const editInputClass =
  'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400';

 return (
  <CenteredLayout>
  <div className="space-y-5 sm:space-y-6">
    {/* Header */}
    <div className="flex items-center justify-between gap-3 w-full">
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-semibold text-slate-400 truncate">
          {goals.length} {goals.length === 1 ? 'goal' : 'goals'} · {completedGoals} completed
        </p>
        <h1 className="font-page-title text-slate-900 tracking-tight leading-tight truncate">Goals &amp; Savings</h1>
      </div>
      {canCreateGoal && (
        <button
          type="button"
          onClick={() => setCurrentPage('add-goal')}
          data-testid="goals-add-goal-button"
          aria-label="Add Goal"
          title="Add goal"
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#18181B] hover:bg-black text-white flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(15,23,42,0.45)] active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <Plus size={20} />
        </button>
      )}
    </div>

    {/* Savings summary */}
    {goals.length > 0 && (
      <div
        data-testid="goals-card"
        className="relative overflow-hidden rounded-[24px] sm:rounded-[28px] bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 p-5 sm:p-6 text-white shadow-[0_18px_40px_-18px_rgba(109,40,217,0.65)]"
      >
        <span className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-white/70">Total saved</p>
            <p data-testid="goals-card-2" className="text-3xl sm:text-4xl font-black tracking-tight truncate">
              {formatCurrency(totalSavedAmount)}
            </p>
            <p className="text-xs sm:text-sm font-medium text-white/70 mt-0.5 truncate">
              of {formatCurrency(totalGoalsAmount)} across {goals.length} {goals.length === 1 ? 'goal' : 'goals'}
            </p>
          </div>
          <span className="w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] border border-white/20 bg-white/15 flex items-center justify-center shrink-0">
            <Target size={20} />
          </span>
        </div>
        <div className="relative mt-4 h-2 rounded-full bg-white/20 overflow-hidden">
          <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${Math.min(100, overallProgress)}%` }} />
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <span data-testid="goals-card-4" className="rounded-full bg-white/20 px-3 py-1 text-[11px] sm:text-xs font-bold">
            {overallProgress.toFixed(0)}% overall
          </span>
          <span data-testid="goals-card-3" className="rounded-full bg-white/20 px-3 py-1 text-[11px] sm:text-xs font-bold">
            {formatCurrency(totalRemainingAmount)} to go
          </span>
          {completedGoals > 0 && (
            <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] sm:text-xs font-bold">
              {completedGoals} completed 🎉
            </span>
          )}
        </div>
      </div>
    )}

    {/* Goals */}
    <div className="space-y-2">
    {goals.length > 0 && (
      <p className="px-1 text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-400">Your goals</p>
    )}
    <AnimatePresence>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 items-stretch">
        {goals.map((goal, index) => {
          const progress = getGoalProgress(goal.currentAmount, goal.targetAmount);
          const daysRemaining = getDaysRemaining(goal.targetDate);
          const monthlyRequired = (goal.targetAmount - goal.currentAmount) / Math.max(1, daysRemaining / 30);
          const categoryMeta = getGoalCategoryMeta(goal.category);
          const membersCount = goal.members?.length || 0;
          const milestone = getMilestoneLabel(progress);
          const monthlySuggestion = getMonthlySuggestion(goal.targetAmount, goal.currentAmount, new Date(goal.targetDate));
          const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
          const achieved = progress >= 100;
          const detailRows = [
            { label: 'Remaining', value: formatCurrency(remainingAmount), tone: 'text-slate-900' },
            {
              label: 'Due date',
              value: new Date(goal.targetDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
              tone: 'text-slate-900',
            },
            {
              label: 'Time left',
              value: daysRemaining > 0 ? `${daysRemaining} days` : 'Due',
              tone: daysRemaining < 30 && !achieved ? 'text-rose-600' : 'text-slate-900',
            },
            ...(!achieved
              ? [{ label: 'Monthly target', value: formatCurrency(monthlySuggestion.monthlyAmount || monthlyRequired), tone: 'text-purple-700' }]
              : []),
          ];

          return (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="h-full"
            >
              <div data-testid={`goals-card-5-${goal.id}`} className={cn(cardClass, 'h-full p-4 sm:p-5 flex flex-col')}>
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 bg-purple-50 border border-purple-100/60">
                    {getCategoryCartoonIcon(goal.category, 24)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">{goal.name}</h3>
                    <p className="text-xs sm:text-sm font-medium text-slate-400 truncate">
                      {categoryMeta.label}
                      {goal.isGroupGoal && (
                        <span className="inline-flex items-center gap-1 ml-1.5 text-purple-600">
                          · <Users size={12} /> {membersCount} {membersCount === 1 ? 'member' : 'members'}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-bold shrink-0',
                      achieved ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'
                    )}
                  >
                    {progress.toFixed(0)}%
                  </span>
                </div>

                {editingGoalId === goal.id ? (
                  <div className="mt-4 space-y-3">
                    <input
                      type="text"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      placeholder="Goal name"
                      aria-label="Goal name"
                      title="Goal name"
                      data-testid="goals-edit-name-input"
                      className={editInputClass}
                    />
                    <input
                      type="number"
                      value={editFormData.targetAmount}
                      onChange={(e) => setEditFormData({ ...editFormData, targetAmount: parseFloat(e.target.value) })}
                      placeholder="Target amount"
                      aria-label="Target amount"
                      title="Target amount"
                      data-testid="goals-edit-target-input"
                      className={editInputClass}
                    />
                    <input
                      type="number"
                      value={editFormData.currentAmount}
                      onChange={(e) => setEditFormData({ ...editFormData, currentAmount: parseFloat(e.target.value) })}
                      placeholder="Current amount"
                      aria-label="Current amount"
                      title="Current amount"
                      data-testid="goals-edit-current-input"
                      className={editInputClass}
                    />
                    <input
                      type="date"
                      value={editFormData.targetDate ? new Date(editFormData.targetDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => setEditFormData({ ...editFormData, targetDate: e.target.value })}
                      aria-label="Target date"
                      title="Target date"
                      data-testid="goals-edit-date-input"
                      className={editInputClass}
                    />
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSaveEdit}
                        data-testid="goals-edit-save-button"
                        className="flex-1 py-2.5 bg-[#18181B] text-white rounded-full text-xs font-bold hover:bg-black transition-all shadow-xs cursor-pointer active:scale-95"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingGoalId(null)}
                        data-testid="goals-edit-cancel-button"
                        className="flex-1 py-2.5 bg-slate-100 border border-slate-200/80 text-slate-700 rounded-full text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer active:scale-95"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col">
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-400">Saved</p>
                        <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                          {formatCurrency(goal.currentAmount)}
                        </p>
                      </div>
                      <div className="text-right min-w-0">
                        <p className="text-xs font-semibold text-slate-400">Target</p>
                        <p className="text-sm sm:text-base font-bold text-slate-600 truncate">{formatCurrency(goal.targetAmount)}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-700 ease-out',
                          achieved ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#8B5CF6] via-[#7C3AED] to-[#6D28D9]'
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                      />
                    </div>

                    <div className="mt-4 rounded-2xl bg-slate-50/80 border border-slate-100 px-3.5 divide-y divide-slate-100">
                      {detailRows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                          <span className="text-xs sm:text-sm font-medium text-slate-500">{row.label}</span>
                          <span className={cn('text-xs sm:text-sm font-bold truncate', row.tone)}>{row.value}</span>
                        </div>
                      ))}
                    </div>

                    {achieved ? (
                      <p className="mt-3 text-center text-xs font-bold text-emerald-600">Goal achieved 🎉</p>
                    ) : (
                      milestone && (
                        <p className="mt-3 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
                          {milestone}
                        </p>
                      )
                    )}

                    <div className="mt-auto pt-4 flex items-center gap-2">
                      <button
                        onClick={() => openContributionModal(goal.id!)}
                        data-testid={`goals-contribute-button-${goal.id}`}
                        className="flex-1 min-w-0 h-10 sm:h-11 px-3 whitespace-nowrap inline-flex items-center justify-center gap-1 bg-[#18181B] text-white rounded-full hover:bg-black transition-all font-bold text-xs sm:text-sm shadow-xs active:scale-95 cursor-pointer"
                        aria-label={`Add contribution to ${goal.name}`}
                        title={`Add contribution to ${goal.name}`}
                      >
                        <Plus size={15} />
                        Add money
                      </button>
                      <button
                        onClick={() => openGoalDetail(goal.id!)}
                        data-testid={`goals-detail-button-${goal.id}`}
                        className="flex-1 min-w-0 h-10 sm:h-11 px-3 whitespace-nowrap bg-white border border-slate-200 text-slate-800 rounded-full hover:bg-slate-50 transition-all font-bold text-xs sm:text-sm cursor-pointer active:scale-95"
                        aria-label={`View details for ${goal.name}`}
                        title={`View details for ${goal.name}`}
                      >
                        Details
                      </button>
                      {canEditGoal && (
                        <button
                          onClick={() => handleEditClick(goal)}
                          data-testid={`goals-edit-button-${goal.id}`}
                          className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
                          title="Edit goal"
                          aria-label={`Edit goal ${goal.name}`}
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                      {canDeleteGoal && (
                        <button
                          onClick={() => handleDeleteGoal(goal.id!, goal.name)}
                          data-testid={`goals-delete-button-${goal.id}`}
                          className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                          title="Delete goal"
                          aria-label={`Delete goal ${goal.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </AnimatePresence>
    </div>

    {/* Empty State */}
    {goals.length === 0 && (
      <div data-testid="goals-card-6" className={cn(cardClass, 'p-10 sm:p-12 text-center')}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
          <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-700 rounded-[20px] flex items-center justify-center mx-auto mb-5 shadow-lg shadow-purple-500/25">
            <Target className="text-white" size={28} />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">No goals yet</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">Start planning for your financial future by creating your first savings goal.</p>
            <Button
              data-testid="goals-add-goal"
              onClick={() => setCurrentPage('add-goal')}
              className="rounded-full h-11 px-6 shadow-sm bg-[#18181B] text-white hover:bg-black transition-transform active:scale-95 font-bold text-sm cursor-pointer"
              aria-label="Add Goal"
              title="Add Goal"
            >
              <Plus size={16} className="mr-1.5" />
              Add Goal
            </Button>
        </motion.div>
      </div>
    )}

  {/* Modals */}
  {showContributeModal && (
  <ContributeModal
  goalId={showContributeModal}
  accounts={accounts}
  currency={currency}
  initialAmount={activeContributionDraft?.amount}
  initialNotes={activeContributionDraft?.description}
  onClose={() => {
  setShowContributeModal(null);
  setActiveContributionDraft(null);
  }}
  />
  )}

  {showVoiceGoalPicker && pendingVoiceGoalDraft && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
  <motion.div
  initial={{ opacity: 0, scale: 0.96 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.96 }}
  className="w-full max-w-lg rounded-[28px] sm:rounded-[32px] bg-white p-6 sm:p-7 shadow-2xl border border-slate-100"
  >
  <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Apply Voice Goal Draft</h3>
  <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
  We heard {formatCurrency(pendingVoiceGoalDraft.amount)} for {pendingVoiceGoalDraft.description || 'goal contribution'}.
  Choose an existing goal to contribute to, or create a new one.
  </p>

  <div className="mt-4 space-y-2.5 max-h-72 overflow-y-auto pr-1">
  {goals.map((goal) => (
  <button
  key={goal.id}
  type="button"
  onClick={() => handleUseVoiceDraftForGoal(goal.id!)}
  data-testid={`goals-voice-picker-goal-${goal.id}`}
  className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 text-left transition-colors hover:border-purple-300 hover:bg-purple-50/50 cursor-pointer"
  >
  <div className="flex items-center justify-between gap-3">
  <div>
  <p className="font-bold text-slate-900 text-sm">{goal.name}</p>
  <p className="text-xs text-slate-500">
  Saved {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)}
  </p>
  </div>
  <span className="rounded-full bg-purple-100 text-purple-700 px-3 py-1 text-xs font-bold">
  Contribute
  </span>
  </div>
  </button>
  ))}
  </div>

  <div className="mt-6 flex flex-wrap gap-2.5">
  <button
  type="button"
  onClick={handleCreateGoalFromVoiceDraft}
  data-testid="goals-voice-picker-new-button"
  className="flex-1 rounded-full bg-[#18181B] px-5 py-3 text-xs sm:text-sm font-bold text-white transition-colors hover:bg-black cursor-pointer shadow-xs active:scale-95"
  >
  Create New Goal
  </button>
  <button
  type="button"
  onClick={() => {
  setShowVoiceGoalPicker(false);
  setPendingVoiceGoalDraft(null);
  }}
  data-testid="goals-voice-picker-dismiss-button"
  className="rounded-full border border-slate-200/80 bg-slate-100 px-5 py-3 text-xs sm:text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 cursor-pointer active:scale-95"
  >
  Dismiss
  </button>
  </div>
  </motion.div>
  </div>
  )}

  <DeleteConfirmModal
  isOpen={deleteModalOpen}
  title="Delete Goal"
  message="This goal will be permanently deleted. All contribution records will be lost."
  itemName={goalToDelete?.name}
  isLoading={isDeleting}
  onConfirm={confirmDeleteGoal}
  onCancel={() => {
  setDeleteModalOpen(false);
  setGoalToDelete(null);
  }}
  />
  </div>
  </CenteredLayout>
  );
};

const ContributeModal: React.FC<{
  goalId: number;
  accounts: any[];
  currency: string;
  initialAmount?: number;
  initialNotes?: string;
  onClose: () => void;
}> = ({ goalId, accounts, currency, initialAmount, initialNotes, onClose }) => {
  const [amount, setAmount] = useState(initialAmount || 0);
  const [accountId, setAccountId] = useState(accounts[0]?.id || 0);
  const [notes, setNotes] = useState(initialNotes || '');

  useEffect(() => {
  setAmount(initialAmount || 0);
  setNotes(initialNotes || '');
  }, [initialAmount, initialNotes]);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const goal = await db.goals.get(goalId);
  if (!goal) return;

  const account = accounts.find((item) => item.id === accountId);
  if (!account) {
  toast.error('Select an account for this contribution');
  return;
  }

  if (account.balance < amount) {
  toast.error('Selected account does not have enough balance');
  return;
  }

  if (goal.cloudId && account.cloudId && navigator.onLine) {
  try {
  await backendService.api.post(`/goals/${goal.cloudId}/contribute`, {
  amount,
  accountId: account.cloudId,
  notes: notes.trim() || undefined,
  });
  } catch (backendError) {
  console.warn('[Goals] Direct contribution sync failed; relying on sync queue', backendError);
  }
  }

  await db.goalContributions.add({
  goalId,
  amount,
  accountId,
  date: new Date(),
  notes: notes.trim() || undefined,
  });

  await db.goals.update(goalId, {
  currentAmount: goal.currentAmount + amount,
  updatedAt: new Date(),
  });

  await applyAccountBalanceDeltas(new Map([[accountId, -amount]]));

  queueRecordUpsertSync('goals', goalId);
  queueRecordUpsertSync('accounts', accountId);
  void processPendingSyncQueue();

  toast.success('Contribution added successfully');
  onClose();
  };

  return (
  <div data-testid="goals-div" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
  <motion.div data-testid="goals-div-2"
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  onClick={(e) => e.stopPropagation()}
  className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-7 w-full max-w-md shadow-2xl border border-slate-100"
  >
  <h3 className="text-xl sm:text-2xl font-bold mb-5 text-slate-900">Add Contribution</h3>
  <form data-testid="goals-form" onSubmit={handleSubmit} className="space-y-4">
  <div>
  <label htmlFor="goal-contribution-amount" className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Amount</label>
  <div className="relative">
  <input
  id="goal-contribution-amount"
  type="number"
  step="0.01"
  value={amount || ''}
  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
  data-testid="goals-contribution-amount-input"
  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 font-bold text-slate-900"
  required
  autoFocus
  aria-label="Contribution amount"
  title="Contribution amount"
  placeholder="0.00"
  />
  </div>
  </div>

  <div>
  <label htmlFor="goal-contribution-account" className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">From Account</label>
  <select
  id="goal-contribution-account"
  value={accountId}
  onChange={(e) => setAccountId(parseInt(e.target.value))}
  data-testid="goals-contribution-account-select"
  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 font-bold text-slate-900 appearance-none text-sm"
  aria-label="Select account"
  title="Select account"
  >
  {accounts.map(acc => (
  <option data-testid={`goals-option-${acc.id}`} key={acc.id} value={acc.id}>{acc.name} ({formatCurrencyAmount(acc.balance, currency)})</option>
  ))}
  </select>
  </div>

  <div>
  <label htmlFor="goal-contribution-notes" className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Notes (Optional)</label>
  <textarea
  id="goal-contribution-notes"
  value={notes}
  onChange={(e) => setNotes(e.target.value)}
  data-testid="goals-contribution-notes-textarea"
  className="w-full rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 font-medium text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 min-h-[72px]"
  rows={2}
  placeholder="Added contribution details..."
  />
  </div>

  <div className="flex gap-2.5 pt-3">
  <button
  type="button"
  onClick={onClose}
  data-testid="goals-contribution-cancel-button"
  className="flex-1 py-3 bg-white border border-slate-200/80 rounded-full hover:bg-slate-50 transition-all font-bold text-xs text-slate-700 cursor-pointer active:scale-95"
  aria-label="Cancel contribution"
  title="Cancel contribution"
  >
  Cancel
  </button>
  <button
  type="submit"
  data-testid="goals-contribution-submit-button"
  className="flex-1 py-3 bg-[#18181B] text-white rounded-full hover:bg-black transition-all font-bold text-xs shadow-xs cursor-pointer active:scale-95"
  aria-label="Add contribution"
  title="Add contribution"
  >
  Add Contribution
  </button>
  </div>
  </form>
  </motion.div>
  </div>
  );
};
