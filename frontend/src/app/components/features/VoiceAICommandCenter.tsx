import React, { useState, useEffect, useMemo } from"react";
import { 
 Mic, 
 MicOff, 
 Loader2, 
 X, 
 Check, 
 AlertCircle, 
 Trash2, 
 Edit3, 
 ArrowRight,
 TrendingDown,
 TrendingUp,
 Target,
 Users,
 Briefcase,
 Repeat,
 Sparkles,
 Zap,
 ChevronRight,
 TrendingUp as ProfitIcon,
 TrendingDown as LossIcon,
 HelpCircle,
 Search,
 FileText,
 RefreshCcw,
 Calendar
} from"lucide-react";
import { motion, AnimatePresence } from"framer-motion";
import { useApp } from"@/contexts/AppContext";
import { db, Transaction, Loan, GroupExpense, Investment } from"@/lib/database";
import { toast } from"sonner";
import { getActionTypeColor, getActionTypeLabel, FinancialAction } from"@/services/voiceFinancialService";
import { BudgetCoachService, BudgetInsight } from"@/services/budgetCoachService";
import { NLQService } from"@/services/nlqService";
import { VoiceContextStore } from"@/services/voiceContextStore";
import { saveTransactionWithBackendSync, queueRecordUpsertSync } from"@/lib/auth-sync-integration";
import { parseDateInputValue } from"@/lib/dateUtils";

// All supported expense/income categories for the edit dropdown
const ALL_CATEGORIES = [
  'Food','Groceries','Transport','Housing','Utilities','Health',
  'Entertainment','Shopping','Education','Salary','Freelance',
  'Investment','Savings','Loans','Transfer','Business',
  'Miscellaneous','General',
];

// Sanitise a description for display — ensures it's a clean noun phrase, not a full sentence
function sanitizeLabel(description: string | undefined, rawSegment: string): string {
  const src = description || rawSegment;
  // If it looks like a full sentence (contains verb keywords or is very long), clean it
  if (/\b(?:i paid|i spent|i bought|paid for|spent on|bought for)\b/i.test(src) || src.length > 40) {
    // Try to pull noun after "for" or "on"
    const forMatch = src.match(/\bfor\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z][a-zA-Z\s]{1,30})(?:\s+(?:at|in|on|from|by|with)|[,.]|$)/i)
      || src.match(/\bfor\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z][a-zA-Z\s]{1,25})/i);
    if (forMatch) {
      const s = forMatch[1].trim();
      if (s.length > 1) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    }
    const onMatch = src.match(/\bon\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z][a-zA-Z\s]{1,25})/i);
    if (onMatch) {
      const s = onMatch[1].trim();
      if (s.length > 1) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    }
    // Fallback strip
    return src
      .replace(/\b(?:i|me|my|a|an|the|and|for|on|at|to|from|with|in|of)\b/gi, '')
      .replace(/\b(?:paid|spent|bought|purchased|got|received|borrowed|lent|invested|saved|transferred)\b/gi, '')
      .replace(/[\d,₹]+(?:\.\d+)?\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return src.charAt(0).toUpperCase() + src.slice(1);
}

interface SmartInsight {
 icon: React.ReactNode;
 text: string;
 type: 'warning' | 'info' | 'success';
 coachAdvice?: string;
}

interface VoiceAICommandCenterProps {
 transcript: string;
 actions: FinancialAction[];
 onClose: () => void;
 onAddMore: () => void;
 userId?: string;
}

export const VoiceAICommandCenter: React.FC<VoiceAICommandCenterProps> = ({
 transcript,
 actions: initialActions,
 onClose,
 onAddMore,
 userId
}) => {
 const { accounts, currency, goals, setCurrentPage } = useApp();
 const [actions, setActions] = useState<FinancialAction[]>(initialActions);
 const [isSaving, setIsSaving] = useState(false);
 const [editingIndex, setEditingIndex] = useState<number | null>(null);
 const [selectedAccountId, setSelectedAccountId] = useState<number>(accounts[0]?.id || 0);
 const [realInsights, setRealInsights] = useState<SmartInsight[]>([]);
 const [queryAnswers, setQueryAnswers] = useState<Record<number, string>>({});

 // Refresh context memory from DB when Command Center opens
 useEffect(() => {
 VoiceContextStore.refresh();
 }, []);

 // Generate dynamic insights and execute queries
 useEffect(() => {
 const processActions = async () => {
 const list: SmartInsight[] = [];
 const answers: Record<number, string> = {};
 
 for (let i = 0; i < actions.length; i++) {
 const action = actions[i];

 // Handle Queries
 if (action.type === 'query') {
 const result = await NLQService.executeQuery(action.rawSegment);
 answers[i] = result.answer;
 }
 
 // Handle Budget Insights
 if (action.type === 'expense' && action.entities.category && action.entities.amount) {
 const insight = await BudgetCoachService.getCategoryInsight(action.entities.category, action.entities.amount);
 if (insight) {
 list.push({
 icon: insight.type === 'warning' ? <TrendingUp className="w-4 h-4 text-rose-500" /> : <Check className="w-4 h-4 text-emerald-500" />,
 text: insight.message,
 type: insight.type,
 coachAdvice: insight.savingPotential ? `Tip: Try to keep next week's ${insight.category} budget under ${currency} ${Math.round(action.entities.amount * 0.8)}.` : undefined
 });
 }
 }
 }

 // Add general coaching
 const generalAdvice = await BudgetCoachService.getGeneralCoachingAdvice();
 generalAdvice.forEach(advice => {
 list.push({
 icon: <Sparkles className="w-4 h-4 text-indigo-500" />,
 text: advice.message,
 type: advice.type
 });
 });

 setRealInsights(list.slice(0, 3));
 setQueryAnswers(answers);
 };

 processActions();
 }, [actions, currency]);

 // Stats for the header
 const totalAmount = useMemo(() => {
 return actions.reduce((sum, action) => {
 if (['expense', 'loan_lend', 'investment', 'goal', 'subscription', 'bill_scan'].includes(action.type)) {
 return sum + (action.entities.amount || 0);
 }
 return sum;
 }, 0);
 }, [actions]);

 const handleEntityUpdate = (index: number, entityUpdates: Partial<FinancialAction['entities']>) => {
 setActions(prev => prev.map((a, i) => i === index ? { 
 ...a, 
 entities: { ...a.entities, ...entityUpdates } 
 } : a));
 };

 const removeAction = (index: number) => {
 setActions(prev => prev.filter((_, i) => i !== index));
 if (actions.length < 1) onClose();
 };

 const confirmAll = async () => {
 if (!selectedAccountId) {
 toast.error("Please select an account for these transactions");
 return;
 }

 setIsSaving(true);
 let successCount = 0;
 const now = new Date();

 try {
 // Save user voice query transcript into database logs
 const userLog = {
 userId: userId || 'anonymous',
 transcript,
 timestamp: now.toISOString(),
 };
 await db.logs.add({
 id: crypto.randomUUID(),
 level: 'voice_input',
 message: JSON.stringify(userLog),
 timestamp: now
 }).catch(console.error);

 for (const action of actions) {
 if (action.type === 'query') continue;
 if (!action.entities.amount) continue;

 const account = await db.accounts.get(selectedAccountId);
 if (!account) continue;

 if (action.type === 'expense' || action.type === 'income' || action.type === 'subscription' || action.type === 'bill_scan') {
 const isIncome = action.type === 'income';
 const amount = action.entities.amount;
 const nextBalance = isIncome ? (account.balance + amount) : (account.balance - amount);

 // Save transaction using the backend sync wrapper
 await saveTransactionWithBackendSync({
 type: (action.type === 'bill_scan' || action.type === 'subscription') ? 'expense' : action.type,
 amount: amount,
 accountId: selectedAccountId,
 category: action.entities.category || 'Miscellaneous',
 description: action.entities.description || action.rawSegment,
 date: action.entities.date ? parseDateInputValue(action.entities.date) || now : now,
 merchant: action.entities.merchant || '',
 tags: ['voice-ai', action.type],
 recurrence: action.entities.recurrence,
 createdAt: now,
 updatedAt: now
 });

 // Update account balance
 await db.accounts.update(selectedAccountId, {
 balance: nextBalance,
 updatedAt: now
 });
 queueRecordUpsertSync('accounts', selectedAccountId);

 successCount++;
 } else if (action.type === 'goal' && action.entities.amount) {
 // Context-aware: match goal by description, rawSegment, or category
 const searchTerm = [
 action.entities.description,
 action.rawSegment,
 action.entities.category
 ].join(' ').toLowerCase();
 const targetGoal = goals.find(g =>
 searchTerm.includes(g.name.toLowerCase()) ||
 g.name.toLowerCase().split(' ').some(word => word.length > 3 && searchTerm.includes(word))
 ) || goals[0];

 if (targetGoal) {
 const amount = action.entities.amount;

 // Add contribution
 await db.goalContributions.add({
 goalId: targetGoal.id!,
 amount: amount,
 accountId: selectedAccountId,
 date: now,
 notes: action.entities.description || `Voice contribution for ${targetGoal.name}`
 });
 
 // Update Goal
 await db.goals.update(targetGoal.id!, {
 currentAmount: targetGoal.currentAmount + amount,
 updatedAt: now
 });
 queueRecordUpsertSync('goals', targetGoal.id!);

 // Deduct from account balance
 await db.accounts.update(selectedAccountId, {
 balance: account.balance - amount,
 updatedAt: now
 });
 queueRecordUpsertSync('accounts', selectedAccountId);

 // Add corresponding transaction
 const transactionId = await db.transactions.add({
 type: 'expense',
 amount: amount,
 accountId: selectedAccountId,
 category: 'Savings',
 description: action.entities.description || `Goal contribution: ${targetGoal.name}`,
 date: now,
 tags: ['goal', 'voice-ai'],
 createdAt: now,
 updatedAt: now
 });
 queueRecordUpsertSync('transactions', transactionId);

 successCount++;
 }
 } else if (action.type === 'loan_borrow' || action.type === 'loan_lend') {
 const type = action.type === 'loan_borrow' ? 'borrowed' : 'lent';
 const personName = action.entities.person || 'Unknown';
 const amount = action.entities.amount;

 // Check if this is a settlement/repayment command
 const isRepayment = /\b(?:settled|settle|paid back|returned|repaid|cleared|clear loan|returned money|returned balance)\b/i.test(action.rawSegment);
 
 let matchedLoan: Loan | undefined;
 if (isRepayment && personName !== 'Unknown') {
 // Find active loan with this person of the matching type
 const activeLoans = await db.loans.filter(l => 
 l.contactPerson?.toLowerCase() === personName.toLowerCase() && 
 l.type === type &&
 l.outstandingBalance > 0 &&
 l.status !== 'completed'
 ).toArray();
 
 if (activeLoans.length > 0) {
 // Get the most recent active loan
 matchedLoan = activeLoans.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))[0];
 }
 }

 if (matchedLoan) {
 // Record repayment on existing loan
 const newOutstanding = Math.max(0, matchedLoan.outstandingBalance - amount);
 await db.loanPayments.add({
 loanId: matchedLoan.id!,
 amount: amount,
 accountId: selectedAccountId,
 date: now,
 notes: action.entities.description || `Voice repayment/settlement`
 });

 await db.loans.update(matchedLoan.id!, {
 outstandingBalance: newOutstanding,
 status: newOutstanding <= 0 ? 'completed' : 'active',
 updatedAt: now
 });
 queueRecordUpsertSync('loans', matchedLoan.id!);

 // Corresponding transaction
 const isLentLoanRepayment = matchedLoan.type === 'lent';
 const txnType = isLentLoanRepayment ? 'income' : 'expense';
 const transactionId = await db.transactions.add({
 type: txnType,
 amount: amount,
 accountId: selectedAccountId,
 category: 'Loans',
 subcategory: isLentLoanRepayment ? 'Loan Repayment Received' : 'Loan Repayment Sent',
 description: action.entities.description || `Repayment for loan: ${matchedLoan.name}`,
 merchant: personName,
 date: now,
 tags: ['loan-repayment', 'voice-ai'],
 createdAt: now,
 updatedAt: now
 });
 queueRecordUpsertSync('transactions', transactionId);

 // Update account balance (receiving back lent money increases balance, repaying borrowed money decreases balance)
 const nextBalance = isLentLoanRepayment ? (account.balance + amount) : (account.balance - amount);
 await db.accounts.update(selectedAccountId, {
 balance: nextBalance,
 updatedAt: now
 });
 queueRecordUpsertSync('accounts', selectedAccountId);

 } else {
 // Standard new loan flow
 // 1. Friend contact creation/lookup
 let friend = await db.friends.filter(f => f.name.toLowerCase() === personName.toLowerCase() && !f.deletedAt).first();
 let friendId: number | undefined;
 if (friend) {
 friendId = friend.id;
 } else if (personName !== 'Unknown') {
 friendId = await db.friends.add({
 name: personName,
 createdAt: now,
 updatedAt: now
 });
 if (friendId !== undefined) {
 queueRecordUpsertSync('friends', friendId);
 }
 }

 // 2. Create corresponding transaction
 const isBorrow = type === 'borrowed';
 const txnType = isBorrow ? 'income' : 'expense';
 const transactionId = await db.transactions.add({
 type: txnType,
 amount: amount,
 accountId: selectedAccountId,
 category: 'Loans',
 subcategory: isBorrow ? 'Loan Received' : 'Loan Disbursed',
 description: action.entities.description || `${isBorrow ? 'Borrowed from' : 'Lent to'} ${personName}`,
 merchant: personName,
 date: now,
 tags: ['loan', 'voice-ai'],
 createdAt: now,
 updatedAt: now
 });
 queueRecordUpsertSync('transactions', transactionId);

 // 3. Create Loan entry
 const loanId = await db.loans.add({
 type,
 name: action.entities.description || `${isBorrow ? 'Borrowed from' : 'Lent to'} ${personName}`,
 principalAmount: amount,
 outstandingBalance: amount,
 status: 'active',
 contactPerson: personName,
 friendId,
 accountId: selectedAccountId,
 loanDate: now,
 createdAt: now,
 updatedAt: now
 });
 queueRecordUpsertSync('loans', loanId);

 // 4. Update account balance (borrowing adds money, lending takes money)
 const nextBalance = isBorrow ? (account.balance + amount) : (account.balance - amount);
 await db.accounts.update(selectedAccountId, {
 balance: nextBalance,
 updatedAt: now
 });
 queueRecordUpsertSync('accounts', selectedAccountId);
 }

 successCount++;
 } else if (action.type === 'transfer') {
 const amount = action.entities.amount;
 let transferToAccountId: number | undefined;
 
 // Context-aware transfer destination search
 const destinationName = action.entities.person || action.entities.merchant || action.entities.description;
 if (destinationName) {
 const targetAcc = accounts.find(a => 
 a.id !== selectedAccountId && 
 a.name.toLowerCase().includes(destinationName.toLowerCase())
 );
 if (targetAcc) {
 transferToAccountId = targetAcc.id;
 }
 }

 // Update source account balance
 await db.accounts.update(selectedAccountId, {
 balance: account.balance - amount,
 updatedAt: now
 });
 queueRecordUpsertSync('accounts', selectedAccountId);

 // Update destination account balance if found
 if (transferToAccountId) {
 const destAccount = await db.accounts.get(transferToAccountId);
 if (destAccount) {
 await db.accounts.update(transferToAccountId, {
 balance: destAccount.balance + amount,
 updatedAt: now
 });
 queueRecordUpsertSync('accounts', transferToAccountId);
 }
 }

 // Add transfer transaction
 const transactionId = await db.transactions.add({
 type: 'transfer',
 amount: amount,
 accountId: selectedAccountId,
 transferToAccountId,
 category: 'Transfer',
 description: action.entities.description || `Voice Transfer to ${destinationName || 'other account'}`,
 date: now,
 transferType: 'other-transfer',
 groupName: action.entities.person, 
 createdAt: now,
 updatedAt: now
 });
 queueRecordUpsertSync('transactions', transactionId);

 successCount++;
 } else if (action.type === 'investment') {
 const amount = action.entities.amount;

 // Update account balance (investment costs money from funding account)
 await db.accounts.update(selectedAccountId, {
 balance: account.balance - amount,
 updatedAt: now
 });
 queueRecordUpsertSync('accounts', selectedAccountId);

 // Add investment record
 const investmentId = await db.investments.add({
 assetType: (action.entities.assetType?.toLowerCase() as any) || (action.entities.category?.toLowerCase() as any) || 'other',
 assetName: action.entities.description || 'Voice Investment',
 quantity: action.entities.quantity || 1,
 buyPrice: amount / (action.entities.quantity || 1),
 currentPrice: amount / (action.entities.quantity || 1),
 totalInvested: amount,
 currentValue: amount,
 profitLoss: 0,
 purchaseDate: now,
 lastUpdated: now,
 fundingAccountId: selectedAccountId,
 positionStatus: 'open',
 createdAt: now,
 updatedAt: now
 });
 queueRecordUpsertSync('investments', investmentId);

 // Add corresponding transaction
 const transactionId = await db.transactions.add({
 type: 'expense',
 amount: amount,
 accountId: selectedAccountId,
 category: 'Investment',
 description: `Invested in ${action.entities.description || 'Asset'}`,
 date: now,
 tags: ['investment', 'voice-ai'],
 createdAt: now,
 updatedAt: now
 });
 queueRecordUpsertSync('transactions', transactionId);

 successCount++;
 }
 }

 toast.success(`Successfully processed ${successCount} financial action${successCount !== 1 ? 's' : ''}`);

 // Save confirmed actions to context memory for future context-aware parsing
 VoiceContextStore.addRecentActions(
 actions
 .filter(a => a.type !== 'query')
 .map(a => ({
 type: a.type,
 description: a.entities.description || a.rawSegment,
 amount: a.entities.amount,
 person: a.entities.person,
 }))
 );

 onClose();
 setCurrentPage('transactions');
 } catch (error) {
 console.error("AI Command Center Save Error:", error);
 toast.error("Failed to complete some actions.");
 } finally {
 setIsSaving(false);
 }
 };

 const getIcon = (type: FinancialAction['type']) => {
 switch (type) {
 case 'expense': return <TrendingDown className="w-5 h-5" />;
 case 'income': return <TrendingUp className="w-5 h-5" />;
 case 'transfer': return <Repeat className="w-5 h-5" />;
 case 'goal': return <Target className="w-5 h-5" />;
 case 'query': return <Search className="w-5 h-5" />;
 case 'bill_scan': return <FileText className="w-5 h-5" />;
 case 'subscription': return <RefreshCcw className="w-5 h-5" />;
 case 'group_expense': return <Users className="w-5 h-5" />;
 case 'loan_borrow': 
 case 'loan_lend': return <Users className="w-5 h-5" />;
 case 'investment': return <Briefcase className="w-5 h-5" />;
 default: return <Zap className="w-5 h-5" />;
 }
 };

 return (
 <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-6 overflow-hidden">
 <motion.div 
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
 onClick={onClose}
 />

 <motion.div
 initial={{ y: 50, opacity: 0, scale: 0.95 }}
 animate={{ y: 0, opacity: 1, scale: 1 }}
 exit={{ y: 50, opacity: 0, scale: 0.95 }}
 className="relative w-[96%] md:w-full md:max-w-4xl bg-white/95 backdrop-blur-2xl rounded-[32px] md:rounded-[40px] shadow-2xl border border-white/20 flex flex-col max-h-[90vh] overflow-hidden"
 >
 {/* Smart Insights Section */}
 {realInsights.length > 0 && (
 <div className="px-5 md:px-8 py-3 md:py-4 bg-indigo-50/30 border-b border-indigo-100/50">
 <div className="flex flex-wrap gap-2 md:gap-4">
 {realInsights.map((insight, idx) => (
 <motion.div key={idx} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }} className="flex flex-col gap-1">
 <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm border border-indigo-100 px-3 md:px-4 py-1.5 md:py-2 rounded-xl md:rounded-2xl shadow-sm">
 {insight.icon}
 <span className="text-[10px] md:text-xs font-semibold text-slate-600">{insight.text}</span>
 </div>
 </motion.div>
 ))}
 </div>
 </div>
 )}

 {/* Header Section */}
 <div className="p-4 md:p-8 pb-3 md:pb-4 border-b border-gray-100">
 <div className="flex justify-between items-start mb-4 md:mb-6">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <div className="bg-indigo-600 p-1.5 md:p-2 rounded-lg md:rounded-xl shadow-lg shadow-indigo-200">
 <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-white" />
 </div>
 <h2 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight">AI Command Center</h2>
 </div>
 <p className="text-xs md:text-sm text-slate-500 font-medium">Multi-Intent Financial Extraction</p>
 </div>
 <button onClick={onClose} className="p-2 md:p-3 bg-slate-100 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors">
 <X size={18} className="text-slate-600" />
 </button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
 <div className="bg-indigo-50/80 p-3 md:p-5 rounded-2xl md:rounded-[28px] border border-indigo-100 flex md:flex-col justify-between items-center md:items-start">
 <span className="text-[9px] md:text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Intents</span>
 <div className="text-lg md:text-2xl font-black text-indigo-700">{actions.length} Actions</div>
 </div>
 <div className="bg-emerald-50/80 p-3 md:p-5 rounded-2xl md:rounded-[28px] border border-emerald-100 flex md:flex-col justify-between items-center md:items-start">
 <span className="text-[9px] md:text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Total Value</span>
 <div className="text-lg md:text-2xl font-black text-emerald-700">{currency} {totalAmount.toLocaleString()}</div>
 </div>
 <div className="bg-slate-50/80 p-3 md:p-5 rounded-2xl md:rounded-[28px] border border-slate-100 relative flex md:flex-col justify-between items-center md:items-start">
 <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Account</span>
 <div className="relative mt-0 md:mt-1">
 <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(Number(e.target.value))} className="bg-transparent text-slate-900 font-bold focus:outline-none appearance-none cursor-pointer pr-6 text-sm md:text-xl">
 {accounts.map(acc => ( <option key={acc.id} value={acc.id}>{acc.name}</option> ))}
 </select>
 <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
 <ChevronRight className="rotate-90 w-4 h-4 md:w-5 md:h-5" />
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Action List */}
 <div className="flex-1 overflow-y-auto p-3 md:p-8 pt-3 md:pt-6 space-y-3 md:space-y-4 custom-scrollbar">
 <AnimatePresence mode="popLayout">
 {actions.map((action, index) => (
 <motion.div key={index} layout initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }}
 className={`group relative p-3 md:p-6 rounded-xl md:rounded-[32px] border transition-all ${action.requiresReview ?"bg-rose-50/50 border-rose-200" :"bg-white border-slate-100 shadow-sm"}`}
 >
 <div className="flex flex-row gap-4 items-start">
 <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl shadow-sm shrink-0 ${getActionTypeColor(action.type)}`}>
 <div className="w-5 h-5 flex items-center justify-center">
 {getIcon(action.type)}
 </div>
 </div>

 {action.type === 'query' ? (
 <div className="flex-1 space-y-3">
 <div className="flex items-center gap-2">
 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{getActionTypeLabel(action.type)}</span>
 <span className="text-[10px] bg-cyan-100 text-cyan-600 px-2 py-0.5 rounded-full font-bold">Smart Answer</span>
 </div>
 <div className="p-5 bg-cyan-50/50 rounded-[28px] border border-cyan-100/50">
 <p className="text-slate-900 font-bold leading-relaxed whitespace-pre-line">{queryAnswers[index] ||"Analyzing..."}</p>
 </div>
 </div>
 ) : action.type === 'bill_scan' ? (
 <div className="flex-1 space-y-3">
 <div className="flex items-center gap-2">
 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{getActionTypeLabel(action.type)}</span>
 <span className="text-[10px] bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">OCR Verified</span>
 </div>
 <div className="flex gap-4 items-center">
 <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-200">
 <FileText className="text-slate-400" />
 </div>
 <div>
 <h4 className="text-xl font-bold text-slate-900">{action.entities.description ||"Scanned Invoice"}</h4>
 <p className="text-sm text-slate-500">{action.entities.merchant || 'Unknown Merchant'}</p>
 </div>
 </div>
 </div>
 ) : (
 <>
 <div className="flex-1 space-y-1">
 <div className="flex items-center gap-2">
 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{getActionTypeLabel(action.type)}</span>
 </div>
 <div className="flex items-center gap-2 group/edit relative">
 {editingIndex === index ? (
 <input 
 autoFocus 
 className="text-base md:text-xl font-bold text-slate-900 bg-white border-b-2 border-indigo-500 px-1 py-0.5 w-full outline-none" 
 value={action.entities.description || ''} 
 onChange={e => handleEntityUpdate(index, { description: e.target.value })} 
 onBlur={() => setEditingIndex(null)} 
 onKeyDown={e => e.key === 'Enter' && setEditingIndex(null)} 
 />
 ) : (
 <h4 className="text-sm md:text-xl font-bold text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 transition-colors break-words line-clamp-4" onClick={() => setEditingIndex(index)}>
 {sanitizeLabel(action.entities.description, action.rawSegment)}
 </h4>
 )}
 {editingIndex !== index && <Edit3 size={14} className="text-slate-300 opacity-0 group-hover/edit:opacity-100 cursor-pointer absolute -right-6" onClick={() => setEditingIndex(index)} />}
 </div>
 <div className="flex flex-wrap gap-2 pt-1">
 {editingIndex === index ? (
 <select 
 className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider outline-none" 
 value={action.entities.category || "General"} 
 onChange={e => handleEntityUpdate(index, { category: e.target.value })}
 onBlur={() => setEditingIndex(null)}
 >
 {ALL_CATEGORIES.map(cat => (
 <option key={cat} value={cat}>{cat}</option>
 ))}
 </select>
 ) : (
 <span className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-200" onClick={() => setEditingIndex(index)}>{action.entities.category || "General"}</span>
 )}
 {action.type === 'subscription' && (
 <span className="text-[11px] bg-pink-50 text-pink-600 px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider flex items-center gap-1">
 <RefreshCcw size={10} /> {action.entities.recurrence || 'Monthly'}
 </span>
 )}
 </div>
 </div>
 <div className="text-right flex flex-col items-end shrink-0">
 <div className="text-xs md:text-lg font-bold text-slate-400 uppercase tracking-tighter">{currency}</div>
 {editingIndex === index ? (
 <input 
 type="number" 
 className="text-xl md:text-3xl font-black text-slate-900 bg-white border-b-2 border-indigo-500 w-20 md:w-24 text-right outline-none" 
 value={action.entities.amount || ''} 
 onChange={e => handleEntityUpdate(index, { amount: parseFloat(e.target.value) || 0 })} 
 onBlur={() => setEditingIndex(null)} 
 onKeyDown={e => e.key === 'Enter' && setEditingIndex(null)} 
 />
 ) : (
 <div className="text-xl md:text-3xl font-black text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 transition-colors" onClick={() => setEditingIndex(index)}>
 {action.entities.amount?.toLocaleString()}
 </div>
 )}
 <button onClick={(e) => { e.stopPropagation(); removeAction(index); }} className="mt-2 text-rose-400 hover:text-rose-600 flex items-center gap-1 text-[10px] md:text-xs font-bold transition-colors">
 <Trash2 size={10}/> Remove
 </button>
 </div>
 </>
 )}
 </div>
 </motion.div>
 ))}
 </AnimatePresence>
 </div>

 {/* Footer */}
 <div className="p-4 md:p-8 pt-3 md:pt-4 bg-white rounded-b-[32px] md:rounded-b-[40px] border-t border-gray-100">
 <div className="flex flex-col md:flex-row gap-3 md:gap-4">
 <button onClick={onAddMore} className="w-full md:flex-1 py-4 md:py-5 bg-white border border-slate-200 text-slate-700 rounded-2xl md:rounded-[28px] font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm order-2 md:order-1">
 <Mic size={18} className="text-indigo-500" /> Add More
 </button>
 <button onClick={confirmAll} disabled={isSaving || actions.length === 0} className="w-full md:flex-[2] py-4 md:py-5 bg-indigo-600 text-white rounded-2xl md:rounded-[28px] font-black text-base md:text-lg hover:bg-indigo-700 disabled:bg-slate-300 transition-all flex items-center justify-center gap-3 shadow-xl order-1 md:order-2">
 {isSaving ?"Syncing..." :"Confirm & Sync Actions"} <ArrowRight size={20} />
 </button>
 </div>
 </div>
 </motion.div>
 </div>
 );
};
