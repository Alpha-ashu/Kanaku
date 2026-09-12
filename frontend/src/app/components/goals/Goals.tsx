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
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 items-stretch">
  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="h-full">
  <Card data-testid="goals-card" variant="default" className="h-full p-4 sm:p-5 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[24px] sm:rounded-[28px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden">
  <div className="relative z-10">
  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-50 dark:bg-purple-950/50 text-[#8B5CF6] rounded-xl sm:rounded-2xl flex items-center justify-center mb-2.5 shadow-2xs">
  <Target className="w-4 h-4 sm:w-5 sm:h-5" />
  </div>
  <p className="text-slate-400 font-bold text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Total Goals</p>
  <h3 className="font-amount-md font-bold text-slate-900 dark:text-white tracking-tight text-lg sm:text-2xl">
  {goals.length}
  </h3>
  </div>
  </Card>
  </motion.div>

  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="h-full">
  <Card data-testid="goals-card-2" variant="default" className="h-full p-4 sm:p-5 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[24px] sm:rounded-[28px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden">
  <div className="relative z-10">
  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center mb-2.5 shadow-2xs">
  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
  </div>
  <p className="text-slate-400 font-bold text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Total Saved</p>
  <h3 className="font-amount-md font-bold text-slate-900 dark:text-white tracking-tight text-lg sm:text-2xl">
  {formatCurrency(totalSavedAmount)}
  </h3>
  </div>
  </Card>
  </motion.div>

  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="h-full">
  <Card data-testid="goals-card-3" variant="default" className="h-full p-4 sm:p-5 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[24px] sm:rounded-[28px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden">
  <div className="relative z-10">
  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-rose-50 dark:bg-rose-950/50 text-rose-600 rounded-xl sm:rounded-2xl flex items-center justify-center mb-2.5 shadow-2xs">
  <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
  </div>
  <p className="text-slate-400 font-bold text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Remaining</p>
  <h3 className="font-amount-md font-bold text-slate-900 dark:text-white tracking-tight text-lg sm:text-2xl">
  {formatCurrency(totalRemainingAmount)}
  </h3>
  </div>
  </Card>
  </motion.div>

  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="h-full">
  <Card data-testid="goals-card-4" variant="default" className="h-full p-4 sm:p-5 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[24px] sm:rounded-[28px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden">
  <div className="relative z-10">
  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-50 dark:bg-purple-950/50 text-[#8B5CF6] rounded-xl sm:rounded-2xl flex items-center justify-center mb-2.5 shadow-2xs">
  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
  </div>
  <p className="text-slate-400 font-bold text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Completed</p>
  <div className="flex items-baseline justify-between gap-1">
  <h3 className="text-lg sm:text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
  {completedGoals}
  </h3>
  <span className="text-[10px] sm:text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
  {overallProgress.toFixed(0)}%
  </span>
  </div>
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
  <Card data-testid={`goals-card-5-${goal.id}`} variant="default" className="h-full p-5 sm:p-6 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col hover:shadow-xl transition-all duration-300">
  <div className="flex items-start justify-between mb-4">
  <div className="flex items-center gap-3 min-w-0">
  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center bg-purple-50 dark:bg-purple-950/40 border border-purple-100/60 shrink-0">
  <span className="text-xl">{getCategoryCartoonIcon(goal.category, 24)}</span>
  </div>
  <div className="min-w-0">
  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{categoryMeta.label}</span>
  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">{goal.name}</h3>
  </div>
  </div>
  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
  {canEditGoal && (
  <button
  onClick={() => handleEditClick(goal)}
  data-testid={`goals-edit-button-${goal.id}`}
  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
  title="Edit goal"
  aria-label={`Edit goal ${goal.name}`}
  >
  <Edit2 size={13} />
  </button>
  )}
  {canDeleteGoal && (
  <button
  onClick={() => handleDeleteGoal(goal.id!, goal.name)}
  data-testid={`goals-delete-button-${goal.id}`}
  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-rose-50 rounded-full transition-colors text-slate-400 hover:text-rose-600 cursor-pointer"
  title="Delete goal"
  aria-label={`Delete goal ${goal.name}`}
  >
  <Trash2 size={13} />
  </button>
  )}
  <span className={cn(
  "px-2.5 py-1 rounded-full text-xs font-bold shrink-0",
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
  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
  />
  <input
  type="number"
  value={editFormData.targetAmount}
  onChange={(e) => setEditFormData({ ...editFormData, targetAmount: parseFloat(e.target.value) })}
  placeholder="Target amount"
  aria-label="Target amount"
  title="Target amount"
  data-testid="goals-edit-target-input"
  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
  />
  <input
  type="number"
  value={editFormData.currentAmount}
  onChange={(e) => setEditFormData({ ...editFormData, currentAmount: parseFloat(e.target.value) })}
  placeholder="Current amount"
  aria-label="Current amount"
  title="Current amount"
  data-testid="goals-edit-current-input"
  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
  />
  <input
  type="date"
  value={editFormData.targetDate ? new Date(editFormData.targetDate).toISOString().split('T')[0] : ''}
  onChange={(e) => setEditFormData({ ...editFormData, targetDate: e.target.value })}
  aria-label="Target date"
  title="Target date"
  data-testid="goals-edit-date-input"
  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
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
  <div className="flex-1 flex flex-col min-h-0">
  <div className="space-y-4 mb-4 flex-1">
  {/* Amounts & Smooth Progress Bar */}
  <div>
  <div className="flex items-baseline justify-between mb-1.5">
  <div>
  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Saved</span>
  <span className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
  {formatCurrency(goal.currentAmount)}
  </span>
  </div>
  <div className="text-right">
  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Target</span>
  <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
  {formatCurrency(goal.targetAmount)}
  </span>
  </div>
  </div>
  <div className="w-full bg-slate-100 dark:bg-muted rounded-full h-2 overflow-hidden">
  <div
  className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-[#8B5CF6] via-[#7C3AED] to-[#6D28D9]"
  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
  />
  </div>
  </div>

  {/* High-density 3-stat strip */}
  <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40 rounded-2xl text-center">
  <div>
  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Remaining</p>
  <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">{formatCurrency(remainingAmount)}</p>
  </div>
  <div>
  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Due Date</p>
  <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">
  {new Date(goal.targetDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
  </p>
  </div>
  <div>
  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Time Left</p>
  <p className={cn("text-xs font-bold truncate mt-0.5", daysRemaining < 30 ? 'text-rose-600' : 'text-slate-900 dark:text-white')}>
  {daysRemaining > 0 ? `${daysRemaining}d` : '0d'}
  </p>
  </div>
  </div>

  {/* Group Indicator if Group Goal */}
  {goal.isGroupGoal && (
  <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-xl bg-purple-50/40 text-purple-700 font-medium">
  <span className="flex items-center gap-1.5"><Users size={13} /> Group Goal</span>
  <span className="font-bold">{membersCount} Member{membersCount !== 1 ? 's' : ''}</span>
  </div>
  )}

  {/* Monthly Suggestion Pill */}
  {progress < 100 && (
  <div className="flex items-center justify-between px-3 py-2 bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100/60 rounded-xl">
  <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Monthly Target</span>
  <span className="text-xs font-bold text-purple-900 dark:text-purple-200">
  {formatCurrency(monthlySuggestion.monthlyAmount || monthlyRequired)}
  </span>
  </div>
  )}

  {milestone && (
  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 text-center">
  {milestone} 
  </div>
  )}

  {progress >= 100 && (
  <div className="text-center text-xs font-bold text-emerald-600 py-1 flex items-center justify-center gap-1">
  Goal achieved 🎉
  </div>
  )}
  </div>

  <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
  <button
  onClick={() => openContributionModal(goal.id!)}
  data-testid={`goals-contribute-button-${goal.id}`}
  className="w-full py-2.5 bg-[#18181B] text-white rounded-full hover:bg-black transition-all font-bold text-xs sm:text-sm shadow-xs active:scale-95 cursor-pointer"
  aria-label={`Add contribution to ${goal.name}`}
  title={`Add contribution to ${goal.name}`}
  >
  Add Contribution
  </button>
  <button
  onClick={() => openGoalDetail(goal.id!)}
  data-testid={`goals-detail-button-${goal.id}`}
  className="w-full py-2.5 bg-slate-100 border border-slate-200/80 text-slate-800 rounded-full hover:bg-slate-200 transition-all font-bold text-xs sm:text-sm cursor-pointer active:scale-95"
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
  <Card data-testid="goals-card-6" variant="glass" className="p-10 sm:p-12 text-center border-2 border-dashed border-slate-200 rounded-[28px] sm:rounded-[32px]">
  <motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.3 }}
  >
  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#18181B] rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
  <Target className="text-white" size={30} />
  </div>
  <h3 className="text-xl sm:text-2xl font-display font-bold text-slate-900 mb-2">No goals yet</h3>
  <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">Start planning for your financial future by creating your first savings goal.</p>
  <Button data-testid="goals-add-goal"
  onClick={() => setCurrentPage('add-goal')}
  className="rounded-full h-10 sm:h-11 px-6 shadow-sm bg-[#18181B] text-white hover:bg-black transition-transform active:scale-95 font-bold text-xs sm:text-sm cursor-pointer"
  aria-label="Add Goal"
  title="Add Goal"
  >
  <Plus size={16} className="mr-1.5" />
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
