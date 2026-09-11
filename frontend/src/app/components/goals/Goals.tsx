import React, { useEffect, useState } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import { getGoalCategoryMeta, getGoalProgress, getMilestoneLabel, getMonthlySuggestion } from '@/lib/goal-utils';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { Bell, Calendar, Edit2, Plus, Sparkles, Target, Trash2, TrendingUp, Users, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { PageHeader } from '@/app/components/ui/PageHeader';
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

 return (
  <CenteredLayout>
  <div className="space-y-6 sm:space-y-8">
  
    <PageHeader
      title="Goals & Savings"
      backTestId="goals-go-back-button"
    >
      {canCreateGoal && (
        <Button
          onClick={() => setCurrentPage('add-goal')}
          data-testid="goals-add-goal-button"
          className="shadow-sm bg-[#18181B] hover:bg-black text-white h-9 sm:h-10 px-3.5 sm:px-5 rounded-full font-bold text-xs sm:text-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Add Goal</span>
          <span className="sm:hidden">Add</span>
        </Button>
      )}
    </PageHeader>

  {/* Summary Stats */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 items-stretch">
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="h-full">
  <Card data-testid="goals-card" variant="default" className="h-full p-5 sm:p-6 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] relative overflow-hidden">
  <div className="relative z-10">
  <div className="w-10 h-10 sm:w-11 sm:h-11 bg-purple-50 dark:bg-purple-950/50 text-[#8B5CF6] rounded-2xl flex items-center justify-center mb-3 shadow-xs">
  <Target className="sm:w-5 sm:h-5" size={18} />
  </div>
  <p className="text-slate-400 font-semibold mb-1 text-xs uppercase tracking-wider">Total Goals</p>
  <h3 className="font-amount-md font-bold text-slate-900 dark:text-white tracking-tight">
  {goals.length}
  </h3>
  </div>
  </Card>
  </motion.div>

  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="h-full">
  <Card data-testid="goals-card-2" variant="default" className="h-full p-5 sm:p-6 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] relative overflow-hidden">
  <div className="relative z-10">
  <div className="w-10 h-10 sm:w-11 sm:h-11 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 rounded-2xl flex items-center justify-center mb-3 shadow-xs">
  <TrendingUp className="sm:w-5 sm:h-5" size={18} />
  </div>
  <p className="text-slate-400 font-semibold mb-1 text-xs uppercase tracking-wider">Total Saved</p>
  <h3 className="font-amount-md font-bold text-slate-900 dark:text-white tracking-tight">
  {formatCurrency(totalSavedAmount)}
  </h3>
  </div>
  </Card>
  </motion.div>

  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="h-full">
  <Card data-testid="goals-card-3" variant="default" className="h-full p-5 sm:p-6 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] relative overflow-hidden">
  <div className="relative z-10">
  <div className="w-10 h-10 sm:w-11 sm:h-11 bg-rose-50 dark:bg-rose-950/50 text-rose-600 rounded-2xl flex items-center justify-center mb-3 shadow-xs">
  <Bell className="sm:w-5 sm:h-5" size={18} />
  </div>
  <p className="text-slate-400 font-semibold mb-1 text-xs uppercase tracking-wider">Remaining</p>
  <h3 className="font-amount-md font-bold text-slate-900 dark:text-white tracking-tight">
  {formatCurrency(totalRemainingAmount)}
  </h3>
  </div>
  </Card>
  </motion.div>

  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="h-full">
  <Card data-testid="goals-card-4" variant="default" className="h-full p-5 sm:p-6 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] relative overflow-hidden">
  <div className="relative z-10">
  <div className="w-10 h-10 sm:w-11 sm:h-11 bg-purple-50 dark:bg-purple-950/50 text-[#8B5CF6] rounded-2xl flex items-center justify-center mb-3 shadow-xs">
  <Sparkles className="sm:w-5 sm:h-5" size={18} />
  </div>
  <p className="text-slate-400 font-semibold mb-1 text-xs uppercase tracking-wider">Completed</p>
  <h3 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
  {completedGoals}
  </h3>
  <p className="text-purple-600 dark:text-purple-400 text-xs font-semibold mt-1">Progress {overallProgress.toFixed(0)}%</p>
  </div>
  </Card>
  </motion.div>
  </div>

  {/* Goals Grid */}
  <AnimatePresence>
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 items-stretch">
  {goals.map((goal, index) => {
  const progress = getGoalProgress(goal.currentAmount, goal.targetAmount);
  const daysRemaining = getDaysRemaining(goal.targetDate);
  const monthlyRequired = (goal.targetAmount - goal.currentAmount) / Math.max(1, daysRemaining / 30);
  const categoryMeta = getGoalCategoryMeta(goal.category);
  const membersCount = goal.members?.length || 0;
  const milestone = getMilestoneLabel(progress);
  const monthlySuggestion = getMonthlySuggestion(goal.targetAmount, goal.currentAmount, new Date(goal.targetDate));
  const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);

  return (
  <motion.div
  key={goal.id}
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.05 }}
  className="h-full"
  >
  <Card data-testid={`goals-card-5-${goal.id}`} variant="default" className="h-full p-5 sm:p-6 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] flex flex-col hover:shadow-xl transition-all duration-300">
  <div className="flex items-start justify-between mb-4">
  <div className="flex items-center gap-3">
  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-purple-50 dark:bg-purple-950/40 border border-purple-100/60 shrink-0">
  <span className="text-xl">{getCategoryCartoonIcon(goal.category, 24)}</span>
  </div>
  <div>
  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{categoryMeta.label}</span>
  <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{goal.name}</h3>
  </div>
  </div>
  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
  {canEditGoal && (
  <button
  onClick={() => handleEditClick(goal)}
  data-testid={`goals-edit-button-${goal.id}`}
  className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700"
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
  className="p-1.5 hover:bg-rose-50 rounded-full transition-colors text-slate-400 hover:text-rose-600"
  title="Delete goal"
  aria-label={`Delete goal ${goal.name}`}
  >
  <Trash2 size={14} />
  </button>
  )}
  <span className={cn(
  "px-3 py-1 rounded-full text-xs font-semibold shrink-0",
  progress >= 100
  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
  : 'bg-purple-50 text-purple-700 border border-purple-200/50'
  )}>
  {progress.toFixed(0)}%
  </span>
  </div>
  </div>

  {editingGoalId === goal.id ? (
  <div className="space-y-3">
  <input
  type="text"
  value={editFormData.name}
  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
  placeholder="Goal name"
  aria-label="Goal name"
  title="Goal name"
  data-testid="goals-edit-name-input"
  className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
  />
  <input
  type="number"
  value={editFormData.targetAmount}
  onChange={(e) => setEditFormData({ ...editFormData, targetAmount: parseFloat(e.target.value) })}
  placeholder="Target amount"
  aria-label="Target amount"
  title="Target amount"
  data-testid="goals-edit-target-input"
  className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
  />
  <input
  type="number"
  value={editFormData.currentAmount}
  onChange={(e) => setEditFormData({ ...editFormData, currentAmount: parseFloat(e.target.value) })}
  placeholder="Current amount"
  aria-label="Current amount"
  title="Current amount"
  data-testid="goals-edit-current-input"
  className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
  />
  <input
  type="date"
  value={editFormData.targetDate ? new Date(editFormData.targetDate).toISOString().split('T')[0] : ''}
  onChange={(e) => setEditFormData({ ...editFormData, targetDate: e.target.value })}
  aria-label="Target date"
  title="Target date"
  data-testid="goals-edit-date-input"
  className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
  />
  <div className="flex gap-2">
  <button
  onClick={handleSaveEdit}
  data-testid="goals-edit-save-button"
  className="flex-1 px-3 py-2 bg-[#18181B] text-white rounded-full text-sm font-semibold hover:bg-black transition-colors shadow-sm"
  >
  Save
  </button>
  <button
  onClick={() => setEditingGoalId(null)}
  data-testid="goals-edit-cancel-button"
  className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold hover:bg-slate-200 transition-colors"
  >
  Cancel
  </button>
  </div>
  </div>
  ) : (
  <div className="flex-1 flex flex-col min-h-0">
  <div className="space-y-3.5 mb-4 flex-1">
  <div>
  <div className="flex justify-between text-sm mb-1.5">
  <span className="text-slate-400 font-semibold text-xs">Saved Amount</span>
  <span className="font-bold text-slate-900 dark:text-white">
  {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
  </span>
  </div>
  <div className="w-full bg-slate-100 dark:bg-muted rounded-full h-2 overflow-hidden">
  <div
  className={cn(
  "h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED]",
  getProgressWidthClass(progress)
  )}
  />
  </div>
  </div>

  <div className="flex items-center justify-between text-sm">
  <span className="text-slate-400 font-medium">Remaining</span>
  <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(remainingAmount)}</span>
  </div>

  <div className="flex items-center justify-between text-sm">
  <div className="flex items-center gap-1.5 text-slate-400 font-medium">
  <Calendar size={14} />
  <span>Target Date</span>
  </div>
  <span className="font-bold text-slate-900 dark:text-white">
  {new Date(goal.targetDate).toLocaleDateString()}
  </span>
  </div>

  <div className="flex items-center justify-between text-sm">
  <span className="text-slate-400 font-medium">Days Remaining</span>
  <span className={cn("font-bold", daysRemaining < 30 ? 'text-rose-600' : 'text-slate-900 dark:text-white')}>
  {daysRemaining > 0 ? daysRemaining : 0} days
  </span>
  </div>

  <div className="flex items-center justify-between text-sm">
  <span className="text-slate-400 font-medium">Goal Type</span>
  <span className="font-bold text-slate-900 dark:text-white">{goal.isGroupGoal ? 'Group' : 'Individual'}</span>
  </div>

  {goal.isGroupGoal && (
  <div className="flex items-center justify-between text-sm">
  <div className="flex items-center gap-1.5 text-slate-400 font-medium">
  <Users size={14} />
  <span>Members</span>
  </div>
  <span className="font-bold text-slate-900 dark:text-white">{membersCount}</span>
  </div>
  )}

  {progress < 100 && (
  <div className="bg-slate-50 dark:bg-muted/40 border border-slate-100 dark:border-border/40 rounded-2xl p-3">
  <p className="text-[10px] text-slate-400 mb-0.5 font-semibold uppercase tracking-wider">Required Monthly</p>
  <p className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(monthlySuggestion.monthlyAmount || monthlyRequired)}</p>
  </div>
  )}

  {milestone && (
  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 text-center">
  {milestone} 
  </div>
  )}

  {progress >= 100 && (
  <div className="text-center text-xs font-bold text-purple-600 py-1">Goal completed 🎉</div>
  )}
  </div>

  <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
  <button
  onClick={() => openContributionModal(goal.id!)}
  data-testid={`goals-contribute-button-${goal.id}`}
  className="w-full px-3 py-2.5 bg-[#18181B] text-white rounded-full hover:bg-black transition-all font-semibold text-xs sm:text-sm shadow-xs active:scale-95"
  aria-label={`Add contribution to ${goal.name}`}
  title={`Add contribution to ${goal.name}`}
  >
  Add Contribution
  </button>
  <button
  onClick={() => openGoalDetail(goal.id!)}
  data-testid={`goals-detail-button-${goal.id}`}
  className="w-full px-3 py-2.5 bg-slate-100 border border-slate-200/80 text-slate-800 rounded-full hover:bg-slate-200 transition-all font-semibold text-xs sm:text-sm"
  aria-label={`View details for ${goal.name}`}
  title={`View details for ${goal.name}`}
  >
  View Details
  </button>
  </div>
  </div>
  )}
  </Card>
  </motion.div>
  );
  })}
  </div>
  </AnimatePresence>

 {/* Empty State */}
 {goals.length === 0 && (
 <Card data-testid="goals-card-6" variant="glass" className="p-12 text-center border-2 border-dashed border-gray-300">
 <motion.div
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 transition={{ duration: 0.3 }}
 >
 <div className="w-20 h-20 bg-black rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
 <Target className="text-white" size={32} />
 </div>
 <h3 className="text-2xl font-display font-bold text-gray-900 mb-2">No goals yet</h3>
 <p className="text-gray-500 mb-6 max-w-md mx-auto">Start planning for your financial future by creating your first savings goal</p>
 <Button data-testid="goals-add-goal"
 onClick={() => setCurrentPage('add-goal')}
 className="rounded-full h-11 px-6 shadow-lg bg-black text-white hover:bg-gray-900 transition-transform active:scale-95"
 aria-label="Add Goal"
 title="Add Goal"
 >
 <Plus size={18} className="mr-2" />
 Add Goal
 </Button>
 </motion.div>
 </Card>
 )}

 {/* Modals */}
 {showContributeModal && (
 <ContributeModal
 goalId={showContributeModal}
 accounts={accounts}
 initialAmount={activeContributionDraft?.amount}
 initialNotes={activeContributionDraft?.description}
 onClose={() => {
 setShowContributeModal(null);
 setActiveContributionDraft(null);
 }}
 />
 )}

 {showVoiceGoalPicker && pendingVoiceGoalDraft && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
 <motion.div
 initial={{ opacity: 0, scale: 0.96 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.96 }}
 className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
 >
 <h3 className="text-2xl font-bold text-gray-900">Apply Voice Goal Draft</h3>
 <p className="mt-2 text-sm text-gray-500">
 We heard {formatCurrency(pendingVoiceGoalDraft.amount)} for {pendingVoiceGoalDraft.description || 'goal contribution'}.
 Choose an existing goal to contribute to, or create a new one.
 </p>

 <div className="mt-5 space-y-3 max-h-72 overflow-y-auto pr-1">
 {goals.map((goal) => (
 <button
 key={goal.id}
 type="button"
 onClick={() => handleUseVoiceDraftForGoal(goal.id!)}
 data-testid={`goals-voice-picker-goal-${goal.id}`}
 className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
 >
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="font-semibold text-gray-900">{goal.name}</p>
 <p className="text-xs text-gray-500">
 Saved {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)}
 </p>
 </div>
 <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
 Contribute
 </span>
 </div>
 </button>
 ))}
 </div>

 <div className="mt-6 flex flex-wrap gap-3">
 <button
 type="button"
 onClick={handleCreateGoalFromVoiceDraft}
 data-testid="goals-voice-picker-new-button"
 className="rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-900"
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
 className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
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
 initialAmount?: number;
 initialNotes?: string;
 onClose: () => void;
}> = ({ goalId, accounts, initialAmount, initialNotes, onClose }) => {
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
 <div data-testid="goals-div" className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
 <motion.div data-testid="goals-div-2"
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.95 }}
 onClick={(e) => e.stopPropagation()}
 className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
 >
 <h3 className="text-2xl font-display font-bold mb-6 text-gray-900">Add Contribution</h3>
 <form data-testid="goals-form" onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label htmlFor="goal-contribution-amount" className="block text-sm font-bold text-gray-700 mb-2">Amount</label>
 <input
 id="goal-contribution-amount"
 type="number"
 step="0.01"
 value={amount || ''}
 onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
 data-testid="goals-contribution-amount-input"
 className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/10 font-medium"
 required
 autoFocus
 aria-label="Contribution amount"
 title="Contribution amount"
 placeholder="Enter contribution amount"
 />
 </div>

 <div>
 <label htmlFor="goal-contribution-account" className="block text-sm font-bold text-gray-700 mb-2">From Account</label>
 <select
 id="goal-contribution-account"
 value={accountId}
 onChange={(e) => setAccountId(parseInt(e.target.value))}
 data-testid="goals-contribution-account-select"
 className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/10 font-medium appearance-none bg-white"
 aria-label="Select account"
 title="Select account"
 >
 {accounts.map(acc => (
 <option data-testid={`goals-option-${acc.id}`} key={acc.id} value={acc.id}>{acc.name}</option>
 ))}
 </select>
 </div>

 <div>
 <label htmlFor="goal-contribution-notes" className="block text-sm font-bold text-gray-700 mb-2">Notes</label>
 <textarea
 id="goal-contribution-notes"
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 data-testid="goals-contribution-notes-textarea"
 className="w-full rounded-xl border border-gray-200 px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
 rows={3}
 placeholder="Optional note for this contribution"
 />
 </div>

 <div className="flex gap-3 pt-4">
 <button
 type="button"
 onClick={onClose}
 data-testid="goals-contribution-cancel-button"
 className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-medium active:scale-95"
 aria-label="Cancel contribution"
 title="Cancel contribution"
 >
 Cancel
 </button>
 <button
 type="submit"
 data-testid="goals-contribution-submit-button"
 className="flex-1 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-900 transition-all font-medium shadow-sm active:scale-95"
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
