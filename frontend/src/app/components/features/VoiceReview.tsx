import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '@/contexts/AppContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { db } from '@/lib/database';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/expenseCategories';
import { toast } from 'sonner';
import {
 ArrowRightLeft,
 Check,
 ChevronLeft,
 Goal,
 PiggyBank,
 Sparkles,
 Trash2,
 Users,
} from 'lucide-react';
import { CategoryDropdown } from '@/app/components/ui/CategoryDropdown';
import { parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import { backendService } from '@/lib/backend-api';
import { saveTransactionWithBackendSync } from '@/lib/auth-sync-integration';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import type { VoiceIntent } from '@/lib/voiceExpenseParser';
import {
 VOICE_BATCH_DRAFT_KEY,
 persistVoiceRouteDraft,
} from '@/lib/voiceDrafts';

const STORAGE_KEY = VOICE_BATCH_DRAFT_KEY;

type DraftIntent = VoiceIntent;

type DraftItem = {
 intent: DraftIntent;
 amount: number;
 category: string | null;
 description: string;
 confidence: number;
 date?: string | null;
 targetGoalId?: number;
};

type SavedTransactionUndoItem = {
 id: number;
 cloudId?: string;
};

type SavedGoalUndoItem = {
 contributionId: number;
 goalId: number;
 amount: number;
};

const CATEGORIES = {
 expense: Object.values(EXPENSE_CATEGORIES).map((cat) => cat.name),
 income: Object.values(INCOME_CATEGORIES).map((cat) => cat.name),
};

const DEFAULT_NON_STANDARD_CATEGORY: Record<Exclude<DraftIntent, 'expense' | 'income'>, string> = {
 transfer: 'Transfer',
 goal: 'Goal Contribution',
 group: 'Group Expense',
 investment: 'Investment',
};

const VALID_INTENTS: DraftIntent[] = ['expense', 'income', 'transfer', 'goal', 'group', 'investment'];

const clampConfidence = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const ConfidenceBadge: React.FC<{ confidence: number }> = ({ confidence }) => {
 const percentage = Math.round(clampConfidence(confidence) * 100);
 const styles = percentage >= 75
 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
 : percentage >= 45
 ? 'bg-amber-50 text-amber-700 border-amber-200'
 : 'bg-rose-50 text-rose-700 border-rose-200';

 return (
 <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}>
 Confidence {percentage}%
 </span>
 );
};

const getIntentBadgeClasses = (intent: DraftIntent) => {
 switch (intent) {
 case 'transfer':
 return 'bg-blue-50 text-blue-700';
 case 'goal':
 return 'bg-purple-50 text-purple-700';
 case 'group':
 return 'bg-orange-50 text-orange-700';
 case 'investment':
 return 'bg-teal-50 text-teal-700';
 case 'income':
 return 'bg-emerald-50 text-emerald-700';
 default:
 return 'bg-rose-50 text-rose-700';
 }
};

const normalizeDraftItem = (item: Partial<DraftItem>, defaultDate: string, fallbackGoalId?: number): DraftItem => {
 const intent = VALID_INTENTS.includes(item.intent as DraftIntent) ? (item.intent as DraftIntent) : 'expense';
 const amount = Number(item.amount ?? 0);
 const safeDate = item.date || defaultDate;

 return {
 intent,
 amount: Number.isFinite(amount) ? amount : 0,
 category: item.category || (intent === 'expense' || intent === 'income'
 ? null
 : DEFAULT_NON_STANDARD_CATEGORY[intent]),
 description: String(item.description ?? '').trim(),
 confidence: clampConfidence(Number(item.confidence ?? 0.5)),
 date: safeDate,
 targetGoalId: intent === 'goal' ? item.targetGoalId ?? fallbackGoalId : undefined,
 };
};

export const VoiceReview: React.FC = () => {
 const { accounts, currency, goals, setCurrentPage } = useApp();
 const [items, setItems] = useState<DraftItem[]>([]);
 const [accountId, setAccountId] = useState<number>(accounts[0]?.id || 0);
 const [isSaving, setIsSaving] = useState(false);

 useEffect(() => {
 const rawDraft = localStorage.getItem(STORAGE_KEY);
 if (!rawDraft) {
 toast.error('No voice draft found');
 setCurrentPage('transactions');
 return;
 }

 try {
 const parsed = JSON.parse(rawDraft) as Partial<DraftItem>[];
 if (!Array.isArray(parsed) || parsed.length === 0) {
 toast.error('No transactions to review');
 setCurrentPage('transactions');
 return;
 }

 const defaultDate = toLocalDateKey(new Date()) ?? new Date().toISOString().split('T')[0];
 const fallbackGoalId = goals[0]?.id;
 const normalized = parsed.map((item) => normalizeDraftItem(item, defaultDate, fallbackGoalId));
 setItems(normalized);
 } catch (error) {
 console.error('Failed to parse voice batch draft:', error);
 toast.error('Failed to load voice draft');
 setCurrentPage('transactions');
 }
 }, [goals, setCurrentPage]);

 useEffect(() => {
 if (items.length === 0) {
 localStorage.removeItem(STORAGE_KEY);
 return;
 }

 localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
 }, [items]);

 useEffect(() => {
 if (goals.length === 0) {
 return;
 }

 setItems((previous) => previous.map((item) => (
 item.intent === 'goal' && !item.targetGoalId
 ? { ...item, targetGoalId: goals[0]?.id }
 : item
 )));
 }, [goals]);

 const standardItems = useMemo(
 () => items.filter((item) => item.intent === 'expense' || item.intent === 'income'),
 [items],
 );
 const goalItems = useMemo(() => items.filter((item) => item.intent === 'goal'), [items]);
 const actionableGoalItems = useMemo(
 () => goalItems.filter((item) => item.amount > 0 && Boolean(item.targetGoalId)),
 [goalItems],
 );
 const otherItems = useMemo(
 () => items.filter((item) => item.intent !== 'expense' && item.intent !== 'income'),
 [items],
 );

 const handleRemove = (index: number) => {
 setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
 };

 const handleUpdate = (index: number, updates: Partial<DraftItem>) => {
 setItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...updates } : item)));
 };

 const handleIntentChange = (index: number, nextIntent: DraftIntent) => {
 if (nextIntent === 'expense' || nextIntent === 'income') {
 const categoryList = CATEGORIES[nextIntent];
 handleUpdate(index, {
 intent: nextIntent,
 category: categoryList[0] || null,
 targetGoalId: undefined,
 });
 return;
 }

 handleUpdate(index, {
 intent: nextIntent,
 category: DEFAULT_NON_STANDARD_CATEGORY[nextIntent],
 targetGoalId: nextIntent === 'goal' ? goals[0]?.id : undefined,
 });
 };

 const handleOpenIntentFlow = (item: DraftItem) => {
 const nextPage = persistVoiceRouteDraft(item, {
 preferGoalHub: item.intent === 'goal',
 preferGroupHub: item.intent === 'group',
 transactionBackPage: 'transactions',
 });
 setCurrentPage(nextPage);
 };

 const handleUndo = async (
 accountBalanceDelta: number,
 savedTransactions: SavedTransactionUndoItem[],
 savedGoals: SavedGoalUndoItem[],
 ) => {
 try {
 for (const transaction of savedTransactions) {
 const storedTransaction = await db.transactions.get(transaction.id);
 if (storedTransaction?.cloudId) {
 await backendService.deleteTransaction(storedTransaction.cloudId);
 }
 await db.transactions.delete(transaction.id);
 }

 for (const savedGoal of savedGoals) {
 await db.goalContributions.delete(savedGoal.contributionId);
 const goal = await db.goals.get(savedGoal.goalId);
 await db.goals.update(savedGoal.goalId, {
 currentAmount: Math.max(0, (goal?.currentAmount || 0) - savedGoal.amount),
 updatedAt: new Date(),
 });
 }

 await applyAccountBalanceDeltas(new Map([[accountId, -accountBalanceDelta]]));

 toast.success('Voice save has been undone');
 } catch (error) {
 console.error('Failed to undo voice save:', error);
 toast.error('Could not undo the saved items');
 }
 };

 const handleSave = async () => {
 if (!accountId) {
 toast.error('Please select an account');
 return;
 }

 const account = accounts.find((acc) => acc.id === accountId);
 if (!account) {
 toast.error('Selected account not found');
 return;
 }

 const standardItemsToSave = standardItems.filter((item) => item.amount > 0);
 const goalItemsToSave = goalItems.filter((item) => item.amount > 0 && item.targetGoalId);

 if (standardItemsToSave.length === 0 && goalItemsToSave.length === 0) {
 toast.error('No income, expense, or goal contribution entries are ready to save');
 return;
 }

 const invalidItem = [...standardItemsToSave, ...goalItemsToSave].find((item) => item.amount <= 0);
 if (invalidItem) {
 toast.error('Each saved item must have a valid amount');
 return;
 }

 setIsSaving(true);

 try {
 const savedTransactions: SavedTransactionUndoItem[] = [];
 const savedGoals: SavedGoalUndoItem[] = [];
 const savedItemIndices = new Set<number>();
 let balanceDelta = 0;
 const now = new Date();

 for (const [itemIndex, item] of items.entries()) {
 if (item.intent !== 'expense' && item.intent !== 'income') {
 continue;
 }

 if (item.amount <= 0) {
 continue;
 }

 const savedTransaction = await saveTransactionWithBackendSync({
 type: item.intent,
 amount: item.amount,
 accountId,
 category: item.category || (item.intent === 'income' ? 'Other Income' : 'Miscellaneous'),
 subcategory: '',
 description: item.description,
 merchant: '',
 date: parseDateInputValue(item.date) || new Date(),
 tags: ['voice-entry'],
 createdAt: now,
 updatedAt: now,
 });

 savedTransactions.push({
 id: savedTransaction.id,
 cloudId: savedTransaction.cloudId,
 });
 savedItemIndices.add(itemIndex);
 balanceDelta += item.intent === 'income' ? item.amount : -item.amount;
 }

 for (const [itemIndex, item] of items.entries()) {
 if (item.intent !== 'goal' || item.amount <= 0 || !item.targetGoalId) {
 continue;
 }

 const goal = goals.find((entry) => entry.id === item.targetGoalId);
 if (!goal?.id) {
 continue;
 }

 const contributionId = await db.goalContributions.add({
 goalId: goal.id,
 amount: item.amount,
 accountId,
 date: parseDateInputValue(item.date) || new Date(),
 notes: item.description || undefined,
 });

 savedGoals.push({
 contributionId,
 goalId: goal.id,
 amount: item.amount,
 });
 savedItemIndices.add(itemIndex);

 await db.goals.update(goal.id, {
 currentAmount: goal.currentAmount + item.amount,
 updatedAt: new Date(),
 });
 balanceDelta -= item.amount;
 }

 await applyAccountBalanceDeltas(new Map([[accountId, balanceDelta]]));

 const remainingItems = items.filter((_, index) => !savedItemIndices.has(index));

 const summary = `${standardItemsToSave.length} income/expense, ${otherItems.length} other`;

 toast.success(`Saved ${summary}`, {
 action: {
 label: 'Undo',
 onClick: () => {
 void handleUndo(balanceDelta, savedTransactions, savedGoals);
 },
 },
 });

 if (remainingItems.length === 0) {
 localStorage.removeItem(STORAGE_KEY);
 setCurrentPage('transactions');
 return;
 }

 setItems(remainingItems);
 toast.info('Saved what could be stored inline. Review the remaining items next.');
 } catch (error) {
 console.error('Failed to save reviewed transactions:', error);
 toast.error('Failed to save reviewed transactions. Please try again.');
 } finally {
 setIsSaving(false);
 }
 };

 return (
 <CenteredLayout>
 <div className="space-y-6">
 <div className="flex items-center justify-between gap-3 w-full">
 <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
 <button
 onClick={() => setCurrentPage('voice-input')}
 className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
 aria-label="Go back to Kai"
 title="Go back to Kai"
 data-testid="voice-review-back-button"
 >
 <ChevronLeft size={20} className="text-slate-700" />
 </button>
 <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">
 Review Voice Transactions
 </h1>
 </div>
 </div>

 <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
 <label className="mb-2 block text-xs font-bold text-slate-400 uppercase tracking-wider">Apply to Account</label>
 <select
 value={accountId}
 onChange={(event) => setAccountId(Number(event.target.value))}
 className="w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
 aria-label="Select account for transactions"
 data-testid="voice-review-account-select"
 >
 <option data-testid="voice-review-select-an-account" value={0}>Select an account</option>
 {accounts.map((account) => (
 <option data-testid={`voice-review-option-${account.id}`} key={account.id} value={account.id}>
 {account.name} ({currency} {account.balance.toFixed(2)})
 </option>
 ))}
 </select>
 </div>

 {items.length === 0 ? (
 <div className="rounded-[28px] sm:rounded-[32px] border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">
 No transactions to review.
 </div>
 ) : (
 <AnimatePresence mode="popLayout">
 <div className="space-y-4">
 {items.map((item, index) => {
 const categoryList = item.intent === 'income' ? CATEGORIES.income : CATEGORIES.expense;
 const showCategoryDropdown = item.intent === 'expense' || item.intent === 'income';

 return (
 <motion.div
 key={`${item.intent}-${index}-${item.description}`}
 layout
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4"
 >
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="flex flex-wrap items-center gap-2">
 <select
 value={item.intent}
 onChange={(event) => handleIntentChange(index, event.target.value as DraftIntent)}
 className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
 aria-label="Select transaction type"
 data-testid={`voice-review-intent-select-${index}`}
 >
 <option data-testid={`voice-review-expense-${`${item.intent}-${index}-${item.description}`}`} value="expense">Expense</option>
 <option data-testid={`voice-review-income-${`${item.intent}-${index}-${item.description}`}`} value="income">Income</option>
 <option data-testid={`voice-review-transfer-${`${item.intent}-${index}-${item.description}`}`} value="transfer">Transfer</option>
 <option data-testid={`voice-review-goal-contribution-${`${item.intent}-${index}-${item.description}`}`} value="goal">Goal Contribution</option>
 <option data-testid={`voice-review-group-expense-${`${item.intent}-${index}-${item.description}`}`} value="group">Group Expense</option>
 <option data-testid={`voice-review-investment-${`${item.intent}-${index}-${item.description}`}`} value="investment">Investment</option>
 </select>
 <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getIntentBadgeClasses(item.intent)}`}>
 {item.intent === 'goal'
 ? 'Goal'
 : item.intent === 'group'
 ? 'Group'
 : item.intent === 'investment'
 ? 'Investment'
 : item.intent === 'transfer'
 ? 'Transfer'
 : item.intent === 'income'
 ? 'Income'
 : 'Expense'}
 </span>
 <ConfidenceBadge confidence={item.confidence} />
 </div>
 <button
 onClick={() => handleRemove(index)}
 className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-red-600"
 data-testid={`voice-review-remove-button-${index}`}
 >
 <Trash2 size={16} /> Remove
 </button>
 </div>

 {item.confidence < 0.3 && (
 <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
 <div className="flex items-start gap-2">
 <Sparkles size={16} className="mt-0.5 shrink-0" />
 <p>
 This item has very low confidence. Please double-check the intent, amount, and date before saving.
 </p>
 </div>
 </div>
 )}

 <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Amount</label>
 <div className="flex items-center gap-2">
 <span className="text-gray-500">{currency}</span>
 <input
 type="number"
 step="0.01"
 value={item.amount || ''}
 onChange={(event) => handleUpdate(index, { amount: Number(event.target.value) })}
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="0.00"
 aria-label="Amount"
 data-testid={`voice-review-amount-input-${index}`}
 />
 </div>
 </div>

 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
 <input
 type="date"
 value={item.date || ''}
 onChange={(event) => handleUpdate(index, { date: event.target.value })}
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="Transaction date"
 data-testid={`voice-review-date-input-${index}`}
 />
 </div>

 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
 {showCategoryDropdown ? (
 <CategoryDropdown
 value={item.category || ''}
 onChange={(value) => handleUpdate(index, { category: value })}
 options={categoryList}
 testId={`voice-review-category-dropdown-${index}`}
 />
 ) : (
 <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-600">
 {item.category || DEFAULT_NON_STANDARD_CATEGORY[item.intent as Exclude<DraftIntent, 'expense' | 'income'>]}
 </div>
 )}
 </div>

 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
 <input
 type="text"
 value={item.description}
 onChange={(event) => handleUpdate(index, { description: event.target.value })}
 className="w-full rounded-lg border border-gray-300 px-3 py-2"
 placeholder="Enter description"
 aria-label="Description"
 data-testid={`voice-review-description-input-${index}`}
 />
 </div>
 </div>

 {item.intent === 'goal' && (
 <div className="mt-4">
 <label className="mb-1 block text-sm font-medium text-gray-700">Apply to Goal</label>
 {goals.length > 0 ? (
 <select
 value={item.targetGoalId || ''}
 onChange={(event) => handleUpdate(index, { targetGoalId: Number(event.target.value) || undefined })}
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
 data-testid={`voice-review-goal-select-${index}`}
 >
 <option data-testid={`voice-review-choose-a-goal-${`${item.intent}-${index}-${item.description}`}`} value="">Choose a goal</option>
 {goals.map((goal) => (
 <option data-testid={`voice-review-option-2-${goal.id}`} key={goal.id} value={goal.id}>
 {goal.name}
 </option>
 ))}
 </select>
 ) : (
 <p className="text-sm text-gray-500">Create a goal first, or open the goals page to handle this entry.</p>
 )}
 </div>
 )}

 {(item.intent === 'transfer' || item.intent === 'goal' || item.intent === 'group' || item.intent === 'investment') && (
 <div className="mt-4 flex flex-wrap gap-3">
 {item.intent === 'transfer' && (
 <button
 onClick={() => handleOpenIntentFlow(item)}
 className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
 data-testid={`voice-review-open-transfer-${index}`}
 >
 <ArrowRightLeft size={16} /> Open transfer
 </button>
 )}
 {item.intent === 'goal' && (
 <button
 onClick={() => handleOpenIntentFlow(item)}
 className="inline-flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700"
 data-testid={`voice-review-open-goals-${index}`}
 >
 <Goal size={16} /> Open goals
 </button>
 )}
 {item.intent === 'group' && (
 <button
 onClick={() => handleOpenIntentFlow(item)}
 className="inline-flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700"
 data-testid={`voice-review-open-groups-${index}`}
 >
 <Users size={16} /> Open groups
 </button>
 )}
 {item.intent === 'investment' && (
 <button
 onClick={() => handleOpenIntentFlow(item)}
 className="inline-flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700"
 data-testid={`voice-review-open-investment-${index}`}
 >
 <PiggyBank size={16} /> Open investment form
 </button>
 )}
 </div>
 )}
 </motion.div>
 );
 })}
 </div>
 </AnimatePresence>
 )}

  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
  <p className="text-xs font-semibold text-slate-400">
  {standardItems.length} income/expense, {otherItems.length} other
  </p>
  <button
  onClick={handleSave}
  disabled={isSaving || (standardItems.length === 0 && actionableGoalItems.length === 0)}
  className="inline-flex items-center gap-2 rounded-full bg-[#18181B] hover:bg-black px-6 py-3 text-xs font-bold text-white transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 shadow-xs cursor-pointer"
  data-testid="voice-review-save-button"
  >
  <Check size={16} />
  <span>{isSaving ? 'Saving...' : 'Save Transactions'}</span>
  </button>
  </div>
 </div>
 </CenteredLayout>
 );
};
