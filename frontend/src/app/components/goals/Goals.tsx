import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { addGoalContribution } from '@/lib/goalContributions';
import { getGoalCategoryMeta, getGoalProgress, getMilestoneLabel, getMonthlySuggestion, GOAL_CATEGORIES } from '@/lib/goal-utils';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { Edit2, Plus, Target, Trash2, Users, ArrowLeft, X, UserPlus, Check, Contact, Search, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VOICE_GOAL_DRAFT_KEY, takeVoiceDraft, type VoiceGoalDraft } from '@/lib/voiceDrafts';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { decodeQuotedPrintable, sanitizeContactName } from '@/services/contactsService';
import { useSubmitLock } from '@/hooks/useSubmitLock';

export const Goals: React.FC = () => {
 const { goals, accounts, currency, setCurrentPage, friends = [] } = useApp();
 const canCreateGoal = useSubFeature('goals', 'createGoal');
 const canEditGoal = useSubFeature('goals', 'editGoal');
 const canDeleteGoal = useSubFeature('goals', 'deleteGoal');
 const [showContributeModal, setShowContributeModal] = useState<number | null>(null);
 const [activeContributionDraft, setActiveContributionDraft] = useState<VoiceGoalDraft | null>(null);
 const [pendingVoiceGoalDraft, setPendingVoiceGoalDraft] = useState<VoiceGoalDraft | null>(null);
 const [showVoiceGoalPicker, setShowVoiceGoalPicker] = useState(false);
 const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
 const [editFormData, setEditFormData] = useState<any>({});
  const [showEditFriendPicker, setShowEditFriendPicker] = useState(false);
  const [editFriendSearch, setEditFriendSearch] = useState('');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
 const [goalToDelete, setGoalToDelete] = useState<{ id: number; name: string } | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);

  const selectedGoalKey = 'selected_goal_id';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryOpen(false);
      }
    };
    if (isCategoryOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCategoryOpen]);

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
    setShowEditFriendPicker(false);
    setIsCategoryOpen(false);
    setCategoryFilter('');
  };

 const handleSaveEdit = async () => {
 if (!editingGoalId) return;
 try {
 const isGroup = editFormData.isGroupGoal !== undefined
 ? !!editFormData.isGroupGoal
 : (Array.isArray(editFormData.members) && editFormData.members.length > 0);

 // Validate unique email & phone across collaborators (names can be duplicate)
 if (isGroup && Array.isArray(editFormData.members)) {
 const contactsSet = new Set<string>();
 for (const m of editFormData.members) {
 if (m.contactValue && m.contactValue.trim()) {
 const key = m.contactType === 'phone'
 ? m.contactValue.replace(/\D/g, '')
 : m.contactValue.trim().toLowerCase();
 if (contactsSet.has(key)) {
 toast.error(`Duplicate contact "${m.contactValue}". All collaborators must have unique email/phone numbers.`);
 return;
 }
 contactsSet.add(key);
 }
 }
 }

 const updated = await db.goals.update(editingGoalId, {
 name: editFormData.name,
 targetAmount: Number(editFormData.targetAmount) || 0,
 currentAmount: Number(editFormData.currentAmount) || 0,
 targetDate: editFormData.targetDate ? new Date(editFormData.targetDate) : undefined,
 category: editFormData.category,
 isGroupGoal: isGroup,
 members: editFormData.members || [],
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
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={() => setCurrentPage('dashboard')}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
          aria-label="Back to Dashboard"
          title="Back to Dashboard"
          data-testid="goals-back-button"
        >
          <ArrowLeft size={18} className="text-slate-700" />
        </button>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-slate-400 truncate">
            {goals.length} {goals.length === 1 ? 'goal' : 'goals'} · {completedGoals} completed
          </p>
          <h1 className="font-page-title text-slate-900 tracking-tight leading-tight truncate">Goals &amp; Savings</h1>
        </div>
      </div>
      {canCreateGoal && (
        <button
          type="button"
          onClick={() => setCurrentPage('add-goal')}
          data-testid="goals-add-goal-button"
          aria-label="Add Goal"
          title="Add goal"
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#18181B] hover:bg-black text-white flex items-center justify-center shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <Plus size={18} />
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
          <span data-testid="goals-card-4" className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            {overallProgress.toFixed(0)}% overall
          </span>
          <span data-testid="goals-card-3" className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            {formatCurrency(totalRemainingAmount)} to go
          </span>
          {completedGoals > 0 && (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
              {completedGoals} completed 🎉
            </span>
          )}
        </div>
      </div>
    )}

    {/* Goals */}
    <div className="space-y-2">
    {goals.length > 0 && (
      <p className="px-1 text-xs font-extrabold uppercase tracking-wider text-slate-400">Your goals</p>
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
                        <p className="mt-3 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
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

  {showVoiceGoalPicker && pendingVoiceGoalDraft && typeof document !== 'undefined' && createPortal(
  <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
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
  </div>,
  document.body
  )}

  {/* Edit Goal Modal — Standardized Floating Card Modal via Portal */}
  {editingGoalId !== null && typeof document !== 'undefined' && createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/65 backdrop-blur-sm p-3.5 sm:p-6 overflow-y-auto"
      onClick={() => setEditingGoalId(null)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-goal-title"
        className="relative w-full max-w-lg bg-white rounded-[28px] sm:rounded-[36px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] border border-slate-100 flex flex-col overflow-hidden my-auto max-h-[82vh] pointer-events-auto"
      >
        {/* Card Header */}
        <div className="flex items-center gap-3.5 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 bg-white shrink-0">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-violet-50 border border-violet-100/80 shadow-xs shrink-0">
            {getCategoryCartoonIcon(editFormData.category, 22)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-extrabold text-2xs tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
              Edit Goal
            </div>
            <h2 id="edit-goal-title" className="text-base sm:text-lg font-black text-slate-900 truncate leading-snug mt-0.5">
              {editFormData.name || 'Unnamed Goal'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setEditingGoalId(null)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100/80 hover:bg-slate-200/80 active:scale-95 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all shrink-0 cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Card Scrollable Form Body */}
        <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-5 space-y-4">
          {/* Goal Name */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Goal Name
            </label>
            <input
              type="text"
              value={editFormData.name || ''}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              placeholder="e.g. Goa Trip"
              data-testid="goals-edit-name-input"
              className="w-full px-4 py-2.5 sm:py-3 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200/90 rounded-2xl text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
            />
          </div>

          {/* Category Dropdown */}
          <div className="relative" ref={categoryDropdownRef}>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Category
            </label>
            <button
              type="button"
              onClick={() => {
                setIsCategoryOpen(prev => !prev);
                setCategoryFilter('');
              }}
              data-testid="goals-edit-category-trigger"
              className={cn(
                "w-full flex items-center justify-between gap-3 px-3.5 py-2.5 sm:py-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/90 rounded-2xl transition-all cursor-pointer",
                isCategoryOpen && "ring-2 ring-violet-500/20 border-violet-400 bg-white"
              )}
              aria-haspopup="listbox"
              aria-expanded={isCategoryOpen}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-7 h-7 rounded-full bg-violet-100/80 flex items-center justify-center shrink-0 shadow-2xs">
                  {getCategoryCartoonIcon(editFormData.category || 'custom', 20)}
                </div>
                <span className="text-sm font-semibold text-slate-900 truncate text-left">
                  {GOAL_CATEGORIES.find(c => c.key === (editFormData.category || 'custom'))?.label || 'Custom'}
                </span>
              </div>
              <ChevronDown
                size={18}
                className={cn(
                  "text-slate-400 shrink-0 transition-transform duration-200",
                  isCategoryOpen && "rotate-180 text-violet-600"
                )}
              />
            </button>

            {/* Hidden native select for accessibility and automated test compatibility */}
            <select
              value={editFormData.category || 'custom'}
              onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
              data-testid="goals-edit-category-select"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            >
              {GOAL_CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>{cat.label}</option>
              ))}
            </select>

            {/* Popover Dropdown Menu */}
            <AnimatePresence>
              {isCategoryOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col max-h-64"
                >
                  {/* Category Search Input */}
                  <div className="p-2 border-b border-slate-100 bg-slate-50/70">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        placeholder="Search category..."
                        className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Categories List */}
                  <div className="overflow-y-auto p-1.5 space-y-0.5">
                    {GOAL_CATEGORIES.filter(c => !categoryFilter || c.label.toLowerCase().includes(categoryFilter.toLowerCase()) || c.key.toLowerCase().includes(categoryFilter.toLowerCase())).map((cat) => {
                      const isSelected = (editFormData.category || 'custom') === cat.key;
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => {
                            setEditFormData({ ...editFormData, category: cat.key });
                            setIsCategoryOpen(false);
                            setCategoryFilter('');
                          }}
                          data-testid={`goals-edit-category-option-${cat.key}`}
                          className={cn(
                            "w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl transition-all text-left cursor-pointer",
                            isSelected
                              ? "bg-violet-50 text-violet-900 font-bold"
                              : "hover:bg-slate-50 text-slate-700 font-medium"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                              {getCategoryCartoonIcon(cat.key, 18)}
                            </div>
                            <span className="text-xs sm:text-sm truncate">
                              {cat.label}
                            </span>
                          </div>
                          {isSelected && <Check size={16} className="text-violet-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Amounts: Target & Saved */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Target ({currency})
              </label>
              <input
                type="number"
                value={editFormData.targetAmount ?? ''}
                onChange={(e) => setEditFormData({ ...editFormData, targetAmount: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                data-testid="goals-edit-target-input"
                className="w-full px-3.5 py-2.5 sm:py-3 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200/90 rounded-2xl text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Saved ({currency})
              </label>
              <input
                type="number"
                value={editFormData.currentAmount ?? ''}
                onChange={(e) => setEditFormData({ ...editFormData, currentAmount: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                data-testid="goals-edit-current-input"
                className="w-full px-3.5 py-2.5 sm:py-3 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200/90 rounded-2xl text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
              />
            </div>
          </div>

          {/* Target Date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Target Date
            </label>
            <input
              type="date"
              value={editFormData.targetDate ? new Date(editFormData.targetDate).toISOString().split('T')[0] : ''}
              onChange={(e) => setEditFormData({ ...editFormData, targetDate: e.target.value })}
              data-testid="goals-edit-date-input"
              className="w-full px-4 py-2.5 sm:py-3 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200/90 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all cursor-pointer"
            />
          </div>

          {/* Group Goal Toggle Card */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                <Users size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Group Goal</p>
                <p className="text-2xs text-slate-500">Collaborate with multiple members</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextIsGroup = !editFormData.isGroupGoal;
                setEditFormData({
                  ...editFormData,
                  isGroupGoal: nextIsGroup,
                  members: nextIsGroup && (!editFormData.members || editFormData.members.length === 0)
                    ? [{ name: '', contactType: 'email', contactValue: '' }]
                    : editFormData.members,
                });
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                editFormData.isGroupGoal ? 'bg-violet-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                  editFormData.isGroupGoal ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Group Members Section */}
          {editFormData.isGroupGoal && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Collaborators ({editFormData.members?.length || 0})
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (friends.length === 0) {
                        toast.info('No friends in your contacts list yet. Opening Add Friends to import contacts.');
                        setEditingGoalId(null);
                        setCurrentPage('add-friends');
                      } else {
                        setShowEditFriendPicker(p => !p);
                      }
                    }}
                    data-testid="goals-edit-friends-picker-button"
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider transition-all cursor-pointer",
                      showEditFriendPicker
                        ? "bg-violet-600 text-white shadow-xs"
                        : "text-violet-700 bg-violet-50 hover:bg-violet-100"
                    )}
                  >
                    <Users size={12} /> {friends.length > 0 ? 'Friends' : 'Import Contacts'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const members = Array.isArray(editFormData.members) ? editFormData.members : [];
                      setEditFormData({
                        ...editFormData,
                        members: [...members, { name: '', contactType: 'email', contactValue: '' }],
                      });
                      setShowEditFriendPicker(false);
                    }}
                    data-testid="goals-edit-add-member-button"
                    className="flex items-center gap-1 text-xs font-bold text-[#4F46E5] bg-[#EEF2FF] hover:bg-[#E0E7FF] px-3 py-1.5 rounded-full uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <UserPlus size={12} /> NEW
                  </button>
                </div>
              </div>

              {/* Friends Quick-Pick Panel in Edit Modal */}
              {showEditFriendPicker && friends.length > 0 && (
                <div className="p-3.5 bg-violet-50/80 rounded-2xl border border-violet-100/90 space-y-2.5 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-violet-700 uppercase tracking-wider">
                      Tap contact to add as collaborator
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditFriendPicker(false);
                        setEditFriendSearch('');
                      }}
                      className="text-xs font-bold text-violet-500 hover:text-violet-700 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>

                  {/* Search box for filtering contacts */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400 pointer-events-none" />
                    <input
                      type="text"
                      value={editFriendSearch}
                      onChange={(e) => setEditFriendSearch(e.target.value)}
                      placeholder="Search contact by name or number..."
                      data-testid="goals-edit-friend-search-input"
                      className="w-full pl-8 pr-7 py-1.5 bg-white border border-violet-200/80 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                    />
                    {editFriendSearch && (
                      <button
                        type="button"
                        onClick={() => setEditFriendSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto pr-1">
                    {(() => {
                      const query = editFriendSearch.toLowerCase().trim();
                      const queryDigits = editFriendSearch.replace(/\D/g, '');
                      const filtered = friends.filter(f => {
                        if (!query) return true;
                        const decoded = sanitizeContactName(f.name).toLowerCase();
                        const raw = f.name.toLowerCase();
                        const email = (f.email || '').toLowerCase();
                        const phoneDigits = (f.phone || '').replace(/\D/g, '');
                        return decoded.includes(query) || raw.includes(query) || email.includes(query) || (queryDigits && phoneDigits.includes(queryDigits));
                      });

                      if (filtered.length === 0) {
                        return (
                          <p className="text-xs text-violet-400 py-2 w-full text-center">
                            No contacts match "{editFriendSearch}"
                          </p>
                        );
                      }

                      return filtered.map(f => {
                        const cleanName = sanitizeContactName(f.name, { email: f.email, phone: f.phone });
                        const isAdded = (editFormData.members || []).some((m: any) =>
                          (f.email && m.contactType === 'email' && m.contactValue?.trim().toLowerCase() === f.email.trim().toLowerCase()) ||
                          (f.phone && m.contactType === 'phone' && m.contactValue?.replace(/\D/g, '') === f.phone.replace(/\D/g, '')) ||
                          (!f.email && !f.phone && m.name?.trim().toLowerCase() === cleanName.trim().toLowerCase() && !m.contactValue)
                        );
                        return (
                          <button
                            key={f.id}
                            type="button"
                            disabled={isAdded}
                            onClick={() => {
                              const currentMembers = Array.isArray(editFormData.members) ? [...editFormData.members] : [];
                              if (f.email) {
                                const fEmail = f.email.trim().toLowerCase();
                                const emailDup = currentMembers.find(m => m.contactType === 'email' && m.contactValue?.trim().toLowerCase() === fEmail);
                                if (emailDup) {
                                  toast.error(`Email ${f.email} is already used by ${emailDup.name}`);
                                  return;
                                }
                              }
                              if (f.phone) {
                                const pDigits = f.phone.replace(/\D/g, '');
                                const phoneDup = currentMembers.find(m => m.contactType === 'phone' && m.contactValue?.replace(/\D/g, '') === pDigits);
                                if (phoneDup) {
                                  toast.error(`Phone ${f.phone} is already used by ${phoneDup.name}`);
                                  return;
                                }
                              }
                              setEditFormData({
                                ...editFormData,
                                members: [
                                  ...currentMembers,
                                  {
                                    name: cleanName,
                                    contactType: f.email ? 'email' : 'phone',
                                    contactValue: f.email || f.phone || '',
                                  },
                                ],
                              });
                              toast.success(`Added ${cleanName} to goal`);
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer",
                              isAdded
                                ? "bg-indigo-100/80 border-indigo-200 text-indigo-800 opacity-60 cursor-not-allowed"
                                : "bg-white border-violet-200 text-violet-800 hover:bg-violet-600 hover:text-white hover:border-violet-600 shadow-2xs active:scale-95"
                            )}
                          >
                            <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-2xs font-black uppercase">
                              {cleanName ? cleanName[0] : '?'}
                            </span>
                            <span>{cleanName}</span>
                            {isAdded && <Check size={12} className="text-indigo-700" />}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Collaborators List */}
              <div className="space-y-2.5">
                {(editFormData.members || []).map((member: any, idx: number) => (
                  <div key={idx} className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-violet-100 border border-violet-200/60 flex items-center justify-center text-violet-700 font-bold text-xs shrink-0">
                        {member.name ? member.name.charAt(0).toUpperCase() : (idx + 1)}
                      </div>
                      <span className="text-xs font-bold text-slate-700 flex-1 truncate">
                        {member.name || `Collaborator ${idx + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (editFormData.members || []).filter((_: any, i: number) => i !== idx);
                          setEditFormData({ ...editFormData, members: updated });
                        }}
                        className="w-6 h-6 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                        aria-label="Remove collaborator"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={member.name || ''}
                        onChange={(e) => {
                          const updated = [...(editFormData.members || [])];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setEditFormData({ ...editFormData, members: updated });
                        }}
                        placeholder="Full name"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 transition-all"
                      />
                      <input
                        type="text"
                        value={member.contactValue || ''}
                        onChange={(e) => {
                          const updated = [...(editFormData.members || [])];
                          updated[idx] = {
                            ...updated[idx],
                            contactValue: e.target.value,
                            contactType: e.target.value.includes('@') ? 'email' : 'phone',
                          };
                          setEditFormData({ ...editFormData, members: updated });
                        }}
                        placeholder="Email or phone"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 transition-all"
                      />
                    </div>
                  </div>
                ))}
                {(!editFormData.members || editFormData.members.length === 0) && (
                  <div className="text-center py-4 px-3 text-xs text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    No collaborators added yet. Tap <span className="font-semibold text-violet-600">Friends</span> to pick from your contacts or <span className="font-semibold text-violet-600">NEW</span> to add manually.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Card Sticky Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-white shrink-0 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditingGoalId(null)}
            data-testid="goals-edit-cancel-button"
            className="flex-1 py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveEdit}
            data-testid="goals-edit-save-button"
            className="flex-1 py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-black shadow-md shadow-slate-900/10 active:scale-[0.98] transition-all cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
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
  const guardSubmit = useSubmitLock();
  const [amount, setAmount] = useState(initialAmount || 0);
  const [accountId, setAccountId] = useState(accounts[0]?.id || 0);
  const [notes, setNotes] = useState(initialNotes || '');
  const [goal, setGoal] = useState<any>(null);
  const [contributorMember, setContributorMember] = useState('Me');

  useEffect(() => {
    setAmount(initialAmount || 0);
    setNotes(initialNotes || '');
  }, [initialAmount, initialNotes]);

  useEffect(() => {
    db.goals.get(goalId).then(g => setGoal(g || null));
  }, [goalId]);

  const handleSubmit = guardSubmit(async (e: React.FormEvent) => {
    e.preventDefault();

    const targetGoal = goal || await db.goals.get(goalId);
    if (!targetGoal) return;

    const account = accounts.find((item) => item.id === accountId);
    if (!account) {
      toast.error('Select an account for this contribution');
      return;
    }

    try {
      await addGoalContribution({
        goal: targetGoal,
        account,
        amount,
        notes,
        memberName: targetGoal.isGroupGoal ? (contributorMember === 'Me' ? 'You' : contributorMember) : undefined,
        status: targetGoal.isGroupGoal ? 'paid' : undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the contribution');
      return;
    }

    toast.success('Contribution added successfully');
    onClose();
  });

  const modalContent = (
    <div
      data-testid="goals-div"
      className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-[99999] p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        data-testid="goals-div-2"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-7 w-full max-w-md shadow-2xl border border-slate-100 my-auto pointer-events-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Add Contribution</h3>
            {goal?.name && (
              <p className="text-xs font-semibold text-violet-600 mt-0.5">{goal.name}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

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
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 font-bold text-slate-900 appearance-none text-sm cursor-pointer"
              aria-label="Select account"
              title="Select account"
            >
              {accounts.map(acc => (
                <option data-testid={`goals-option-${acc.id}`} key={acc.id} value={acc.id}>{acc.name} ({formatCurrencyAmount(acc.balance, currency)})</option>
              ))}
            </select>
          </div>

          {goal?.isGroupGoal && (
            <div>
              <label htmlFor="goal-contribution-member" className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Group Member</label>
              <select
                id="goal-contribution-member"
                value={contributorMember}
                onChange={(e) => setContributorMember(e.target.value)}
                data-testid="goals-contribution-member-select"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 font-bold text-slate-900 appearance-none text-sm cursor-pointer"
              >
                <option value="Me">You (Owner)</option>
                {(goal.members || []).map((m: any) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

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

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
