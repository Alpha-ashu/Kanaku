import React, { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import { getGoalCategoryMeta, getGoalProgress, getMilestoneLabel, getMonthlySuggestion } from '@/lib/goal-utils';
import { Bell, Calendar, Edit2, Plus, Sparkles, Target, Trash2, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VOICE_GOAL_DRAFT_KEY, takeVoiceDraft, type VoiceGoalDraft } from '@/lib/voiceDrafts';

export const Goals: React.FC = () => {
 const { goals, accounts, currency, setCurrentPage } = useApp();
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
 return new Intl.NumberFormat('en-US', {
 style: 'currency',
 currency: currency,
 }).format(amount);
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

 const totalGoalsAmount = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
 const totalSavedAmount = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
 const totalRemainingAmount = Math.max(0, totalGoalsAmount - totalSavedAmount);
 const overallProgress = totalGoalsAmount > 0 ? (totalSavedAmount / totalGoalsAmount) * 100 : 0;
 const completedGoals = goals.filter((goal) => goal.currentAmount >= goal.targetAmount).length;

 return (
 <CenteredLayout>
 <div className="space-y-6 sm:space-y-8">
 
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-4">
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Goals & Savings</h1>
 </div>
 <Button
 onClick={() => setCurrentPage('add-goal')}
 className="shadow-lg bg-gray-900 hover:bg-gray-800 text-white h-12 px-6 rounded-2xl font-bold flex items-center gap-2"
 >
 <Plus size={18} />
 <span>Add Goal</span>
 </Button>
 </div>

 {/* Summary Stats */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 items-stretch">
 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="h-full">
 <Card variant="glass" className="h-full p-4 sm:p-6 relative overflow-hidden">
 <div className="relative z-10">
 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black rounded-2xl flex items-center justify-center mb-2 sm:mb-4 shadow-sm">
 <Target className="text-white sm:w-5 sm:h-5" size={18} />
 </div>
 <p className="text-gray-500 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Total Goals Created</p>
 <h3 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tracking-tight">
 {goals.length}
 </h3>
 </div>
 </Card>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="h-full">
 <Card variant="glass" className="h-full p-4 sm:p-6 relative overflow-hidden">
 <div className="relative z-10">
 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black rounded-2xl flex items-center justify-center mb-2 sm:mb-4 shadow-sm">
 <TrendingUp className="text-white sm:w-5 sm:h-5" size={18} />
 </div>
 <p className="text-gray-500 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Total Saved</p>
 <h3 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tracking-tight">
 {formatCurrency(totalSavedAmount)}
 </h3>
 </div>
 </Card>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="h-full">
 <Card variant="glass" className="h-full p-4 sm:p-6 relative overflow-hidden">
 <div className="relative z-10">
 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-500 rounded-2xl flex items-center justify-center mb-2 sm:mb-4 shadow-sm">
 <Bell className="text-white sm:w-5 sm:h-5" size={18} />
 </div>
 <p className="text-gray-500 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Remaining Amount</p>
 <h3 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tracking-tight">
 {formatCurrency(totalRemainingAmount)}
 </h3>
 </div>
 </Card>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="h-full">
 <Card variant="mesh-green" className="h-full p-4 sm:p-6 relative overflow-hidden">
 <div className="relative z-10">
 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-2 sm:mb-4">
 <Sparkles className="text-white sm:w-5 sm:h-5" size={18} />
 </div>
 <p className="text-white/80 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Completed Goals</p>
 <h3 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
 {completedGoals}
 </h3>
 <p className="text-white/70 text-xs mt-2">Overall progress {overallProgress.toFixed(0)}%</p>
 </div>
 <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
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
 <Card variant="glass" className="h-full p-4 sm:p-6 flex flex-col hover:shadow-xl transition-all duration-300">
 <div className="flex items-start justify-between mb-3 sm:mb-4">
 <div className="flex items-center gap-3">
 <div className={cn(
"w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shadow-sm transition-colors flex-shrink-0",
 progress >= 100 ?"bg-emerald-500 text-white" :
 progress >= 50 ?"bg-blue-600 text-white" :
"bg-amber-500 text-white"
 )}>
 <span className="text-lg sm:text-xl">{categoryMeta.icon}</span>
 </div>
 <div>
 <p className="text-xs text-gray-500 uppercase tracking-wide">{categoryMeta.label}</p>
 <h3 className="text-lg sm:text-xl font-display font-bold text-gray-900">{goal.name}</h3>
 </div>
 </div>
 <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
 <button
 onClick={() => handleEditClick(goal)}
 className="p-1 sm:p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
 title="Edit goal"
 aria-label={`Edit goal ${goal.name}`}
 >
 <Edit2 size={14} className="sm:w-4 sm:h-4" />
 </button>
 <button
 onClick={() => handleDeleteGoal(goal.id!, goal.name)}
 className="p-1 sm:p-1.5 hover:bg-red-100 rounded-lg transition-colors text-red-600"
 title="Delete goal"
 aria-label={`Delete goal ${goal.name}`}
 >
 <Trash2 size={14} className="sm:w-4 sm:h-4" />
 </button>
 <span className={cn(
"px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold flex-shrink-0",
 progress >= 100
 ? 'bg-emerald-100 text-emerald-700'
 : progress >= 50
 ? 'bg-blue-100 text-blue-700'
 : 'bg-amber-100 text-amber-700'
 )}>
 {progress.toFixed(0)}%
 </span>
 </div>
 </div>

 {editingGoalId === goal.id ? (
 <div className="space-y-2 sm:space-y-3">
 <input
 type="text"
 value={editFormData.name}
 onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
 placeholder="Goal name"
 aria-label="Goal name"
 title="Goal name"
 className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
 />
 <input
 type="number"
 value={editFormData.targetAmount}
 onChange={(e) => setEditFormData({ ...editFormData, targetAmount: parseFloat(e.target.value) })}
 placeholder="Target amount"
 aria-label="Target amount"
 title="Target amount"
 className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
 />
 <input
 type="number"
 value={editFormData.currentAmount}
 onChange={(e) => setEditFormData({ ...editFormData, currentAmount: parseFloat(e.target.value) })}
 placeholder="Current amount"
 aria-label="Current amount"
 title="Current amount"
 className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
 />
 <input
 type="date"
 value={editFormData.targetDate ? new Date(editFormData.targetDate).toISOString().split('T')[0] : ''}
 onChange={(e) => setEditFormData({ ...editFormData, targetDate: e.target.value })}
 aria-label="Target date"
 title="Target date"
 className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
 />
 <div className="flex gap-2">
 <button
 onClick={handleSaveEdit}
 className="flex-1 px-3 py-2 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-900 transition-colors shadow-sm"
 >
 Save
 </button>
 <button
 onClick={() => setEditingGoalId(null)}
 className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
 >
 Cancel
 </button>
 </div>
 </div>
 ) : (
 <div className="flex-1 flex flex-col min-h-0">
 <div className="space-y-4 mb-4 flex-1">
 <div>
 <div className="flex justify-between text-sm mb-2">
 <span className="text-gray-500 font-medium">Saved Amount</span>
 <span className="font-bold text-gray-900">
 {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
 </span>
 </div>
 <div className="w-full bg-gray-200/80 rounded-full h-2.5 overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-700 ease-out",
 getProgressWidthClass(progress),
 progress >= 100
 ? 'bg-emerald-500'
 : progress >= 50
 ? 'bg-blue-600'
 : 'bg-amber-500'
 )}
 />
 </div>
 </div>

 <div className="flex items-center justify-between text-sm">
 <span className="text-gray-500">Remaining</span>
 <span className="font-bold text-gray-900">{formatCurrency(remainingAmount)}</span>
 </div>

 <div className="flex items-center justify-between text-sm">
 <div className="flex items-center gap-2 text-gray-500">
 <Calendar size={16} />
 <span>Target Date</span>
 </div>
 <span className="font-bold text-gray-900">
 {new Date(goal.targetDate).toLocaleDateString()}
 </span>
 </div>

 <div className="flex items-center justify-between text-sm">
 <span className="text-gray-500">Days Remaining</span>
 <span className={`font-bold ${daysRemaining < 30 ? 'text-red-600' : 'text-gray-900'}`}>
 {daysRemaining > 0 ? daysRemaining : 0} days
 </span>
 </div>

 <div className="flex items-center justify-between text-sm">
 <span className="text-gray-500">Goal Type</span>
 <span className="font-bold text-gray-900">{goal.isGroupGoal ? 'Group' : 'Individual'}</span>
 </div>

 {goal.isGroupGoal && (
 <div className="flex items-center justify-between text-sm">
 <div className="flex items-center gap-2 text-gray-500">
 <Users size={14} />
 <span>Members</span>
 </div>
 <span className="font-bold text-gray-900">{membersCount}</span>
 </div>
 )}

 {progress < 100 && (
 <div className="bg-gray-100 border border-gray-200 rounded-xl p-3">
 <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Required Monthly</p>
 <p className="text-lg font-bold text-gray-900">{formatCurrency(monthlySuggestion.monthlyAmount || monthlyRequired)}</p>
 </div>
 )}

 {milestone && (
 <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
 {milestone} 
 </div>
 )}

 {progress >= 100 && (
 <div className="text-center text-sm font-semibold text-pink-600 animate-bounce">Confetti moment! Goal completed </div>
 )}
 </div>

 <div className="grid grid-cols-2 gap-2 mt-auto pt-3">
 <button
 onClick={() => openContributionModal(goal.id!)}
 className="w-full px-4 py-2.5 bg-black text-white rounded-xl hover:bg-gray-900 transition-all font-medium shadow-sm active:scale-95"
 aria-label={`Add contribution to ${goal.name}`}
 title={`Add contribution to ${goal.name}`}
 >
 Add Contribution
 </button>
 <button
 onClick={() => openGoalDetail(goal.id!)}
 className="w-full px-4 py-2.5 bg-white border border-gray-300 text-gray-800 rounded-xl hover:bg-gray-50 transition-all font-medium"
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
 <Card variant="glass" className="p-12 text-center border-2 border-dashed border-gray-300">
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
 <Button
 onClick={() => setCurrentPage('add-goal')}
 className="rounded-full h-11 px-6 shadow-lg bg-black text-white hover:bg-gray-900 transition-transform active:scale-95"
 aria-label="Create your first goal"
 title="Create your first goal"
 >
 <Plus size={18} className="mr-2" />
 Create Your First Goal
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
 // Goal and contribution updates are synced through local DB hooks.

 await applyAccountBalanceDeltas(new Map([[accountId, -amount]]));

 toast.success('Contribution added successfully');
 onClose();
 };

 return (
 <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.95 }}
 onClick={(e) => e.stopPropagation()}
 className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
 >
 <h3 className="text-2xl font-display font-bold mb-6 text-gray-900">Add Contribution</h3>
 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label htmlFor="goal-contribution-amount" className="block text-sm font-bold text-gray-700 mb-2">Amount</label>
 <input
 id="goal-contribution-amount"
 type="number"
 step="0.01"
 value={amount || ''}
 onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
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
 className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/10 font-medium appearance-none bg-white"
 aria-label="Select account"
 title="Select account"
 >
 {accounts.map(acc => (
 <option key={acc.id} value={acc.id}>{acc.name}</option>
 ))}
 </select>
 </div>

 <div>
 <label htmlFor="goal-contribution-notes" className="block text-sm font-bold text-gray-700 mb-2">Notes</label>
 <textarea
 id="goal-contribution-notes"
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 className="w-full rounded-xl border border-gray-200 px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
 rows={3}
 placeholder="Optional note for this contribution"
 />
 </div>

 <div className="flex gap-3 pt-4">
 <button
 type="button"
 onClick={onClose}
 className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-medium active:scale-95"
 aria-label="Cancel contribution"
 title="Cancel contribution"
 >
 Cancel
 </button>
 <button
 type="submit"
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

