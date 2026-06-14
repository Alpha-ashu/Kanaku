
import React, { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { queueRecordUpsertSync, queueTransactionInsertSync } from '@/lib/auth-sync-integration';
import { applyTransactionAccountImpact } from '@/lib/transactionAggregation';
import { backendService } from '@/lib/backend-api';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { CreditCard, UserPlus, X, Check, ArrowLeft, Loader2, Calculator, Calendar, Wallet, AlignLeft, Info, Sparkles, TrendingDown, Target, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import '@/styles/premium-transactions.css';

export const AddLoan: React.FC = () => {
 const { setCurrentPage, currency, accounts, friends, refreshData } = useApp();
 const [showFriendPicker, setShowFriendPicker] = useState(false);
 const [isSubmitting, setIsSubmitting] = useState(false);
 
 const [formData, setFormData] = useState({
 lenderName: '',
 principalAmount: 0,
 interestRate: 0,
 tenureMonths: 12,
 startDate: new Date().toISOString().split('T')[0],
 emiAmount: 0,
 description: '',
 accountId: accounts[0]?.id || 0,
 friendId: undefined as number | undefined,
 status: 'active' as 'active' | 'paid-off' | 'defaulted',
 });

 const [amountStr, setAmountStr] = useState('');

 const selectedAccount = accounts.find((a) => a.id === formData.accountId);
 const accountOptions = accounts
 .filter((account) => account.id)
 .map((account) => ({
 value: String(account.id),
 label: account.name,
 description: `${currency} ${account.balance.toFixed(2)} available`,
 icon: <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 font-black text-[8px]">BK</div>
 }));

 const calculateEMI = (data = formData) => {
 const P = data.principalAmount;
 const r = data.interestRate / 100 / 12;
 const n = data.tenureMonths;
 if (P <= 0 || r < 0 || n <= 0) return 0;
 if (r === 0) return P / n;
 return Math.round(((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) * 100) / 100;
 };

 const handleFieldChange = (key: string, value: any) => {
 setFormData(prev => {
 const updated = { ...prev, [key]: value };
 if (key === 'principalAmount' || key === 'interestRate' || key === 'tenureMonths') {
 updated.emiAmount = calculateEMI(updated);
 }
 return updated;
 });
 };

 const handleSubmit = async () => {
 if (!formData.lenderName.trim()) { toast.error('Lender name is required'); return; }
 if (formData.principalAmount <= 0) { toast.error('Principal amount must be greater than 0'); return; }
 if (formData.tenureMonths <= 0) { toast.error('Tenure must be greater than 0'); return; }
 if (!selectedAccount) { toast.error('Select an account'); return; }

 setIsSubmitting(true);
 try {
 const now = new Date();
 const lenderName = formData.lenderName.trim();
 const transactionRecord = {
 type: 'income' as const,
 amount: formData.principalAmount,
 accountId: formData.accountId,
 category: 'Loans',
 subcategory: 'Loan Received',
 description: `Borrowed - ${lenderName}`,
 merchant: lenderName,
 date: new Date(formData.startDate),
 tags: ['loan'],
 expenseMode: 'individual' as const,
 createdAt: now,
 updatedAt: now,
 };

 let transactionId = 0;
 await db.transaction('rw', db.transactions, db.loans, db.accounts, async () => {
 transactionId = await db.transactions.add(transactionRecord);
 await db.loans.add({
 type: 'borrowed',
 name: lenderName,
 principalAmount: formData.principalAmount,
 outstandingBalance: formData.principalAmount,
 interestRate: formData.interestRate,
 emiAmount: formData.emiAmount,
 frequency: 'monthly',
 status: formData.status === 'active' ? 'active' : (formData.status === 'paid-off' ? 'completed' : 'overdue'),
 contactPerson: lenderName,
 friendId: formData.friendId,
 accountId: formData.accountId,
 loanDate: new Date(formData.startDate),
 notes: formData.description.trim() || undefined,
 totalPayable: (formData.emiAmount * formData.tenureMonths) || formData.principalAmount,
 createdAt: now,
 updatedAt: now,
 });
 await applyTransactionAccountImpact(transactionRecord, now);
 });

 queueTransactionInsertSync(transactionId, transactionRecord);
 queueRecordUpsertSync('accounts', formData.accountId);

 try {
 await backendService.createLoan({
 type: 'borrowed',
 name: lenderName,
 principalAmount: formData.principalAmount,
 outstandingBalance: formData.principalAmount,
 interestRate: formData.interestRate,
 emiAmount: formData.emiAmount,
 dueDate: undefined,
 frequency: 'monthly',
 status: formData.status === 'active' ? 'active' : (formData.status === 'paid-off' ? 'completed' : 'overdue'),
 contactPerson: lenderName,
 friendId: formData.friendId ? String(formData.friendId) : undefined,
 createdAt: now,
 updatedAt: now,
 deletedAt: undefined,
 });
 } catch (syncError) {}

 toast.success('Loan created successfully');
 refreshData();
 setCurrentPage('loans');
 } catch (error) {
 toast.error('Failed to create loan');
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleFriendSelect = (friendId: number) => {
 const f = friends.find((fr) => fr.id === friendId);
 if (!f) return;
 setFormData((p) => ({ ...p, friendId, lenderName: f.name }));
 setShowFriendPicker(false);
 };

 const totalInterest = (formData.emiAmount * formData.tenureMonths) - formData.principalAmount;

 return (
 <div className="flex flex-col min-h-screen bg-white">

 {/* Header */}
 <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-3">
 <button onClick={() => setCurrentPage('loans')} className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
 <ArrowLeft size={20} />
 </button>
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">New Borrowed Loan</h1>
 </div>
 
 <div className="flex items-center gap-3">
 <button onClick={() => setCurrentPage('loans')} className="hidden sm:block text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest px-4">Cancel</button>
 <button 
 onClick={handleSubmit}
 disabled={isSubmitting || !formData.principalAmount}
 className="bg-sky-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-sky-100 hover:bg-sky-700 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
 >
 {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
 Create Loan
 </button>
 </div>
 </div>
 </header>

 {/* Main Single-Page Content Area */}
 <main className="flex-1 p-3 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 pb-32 lg:pb-5">
 
 {/* Left Column: context & details (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-3 lg:overflow-y-auto">
 
 <div className="premium-glass-card p-4 space-y-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Lender / Financial Institution</label>
 <div className="relative">
 <CreditCard className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input 
 type="text" 
 name="name"
 value={formData.lenderName} 
 onChange={e => handleFieldChange('lenderName', e.target.value)} 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs" 
 placeholder="e.g. HDFC Bank, John Doe" 
 />
 </div>
 {friends && friends.length > 0 && (
 <div className="pt-1">
 <button onClick={() => setShowFriendPicker(!showFriendPicker)} className="text-[8px] font-black uppercase text-sky-600 bg-sky-50 px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-sky-100 transition-colors">
 <UserPlus size={10} /> {showFriendPicker ? 'Close Friends List' : 'Select from Friends'}
 </button>
 {showFriendPicker && (
 <div className="mt-2 p-3 bg-white border border-slate-100 rounded-xl shadow-sm animate-in slide-in-from-top-1">
 <div className="flex flex-wrap gap-2">
 {friends.map(f => (
 <button key={f.id} onClick={() => handleFriendSelect(f.id!)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-bold text-slate-700 hover:bg-sky-600 hover:text-white transition-all">
 {f.name}
 </button>
 ))}
 </div>
 </div>
 )}
 </div>
 )}
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Interest Rate (% p.a.)</label>
 <div className="relative">
 <TrendingDown className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input 
 type="number" 
 name="rate"
 value={formData.interestRate || ''} 
 onChange={e => handleFieldChange('interestRate', parseFloat(e.target.value) || 0)} 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs text-center" 
 placeholder="0.00" 
 />
 </div>
 </div>
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tenure (Months)</label>
 <div className="relative">
 <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input 
 type="number" 
 value={formData.tenureMonths || ''} 
 onChange={e => handleFieldChange('tenureMonths', parseInt(e.target.value) || 0)} 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs text-center" 
 placeholder="12" 
 />
 </div>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
 <input 
 type="date" 
 value={formData.startDate} 
 onChange={e => handleFieldChange('startDate', e.target.value)} 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-xs" 
 />
 </div>
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Disbursement Account</label>
 <SearchableDropdown
 options={accountOptions}
 value={String(formData.accountId)}
 onChange={val => handleFieldChange('accountId', parseInt(val))}
 placeholder="Account"
 className="bg-slate-50 border-none rounded-xl h-10 font-bold text-xs"
 />
 </div>
 </div>

 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Loan Notes / Description</label>
 <div className="relative">
 <AlignLeft className="absolute left-2.5 top-3 text-slate-300" size={14} />
 <textarea 
 value={formData.description} 
 onChange={e => handleFieldChange('description', e.target.value)} 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs min-h-[60px] resize-none" 
 placeholder="e.g. For buying a new laptop" 
 />
 </div>
 </div>
 </div>

 <div className="p-4 bg-sky-50 border border-sky-100 rounded-2xl flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center shrink-0"><Banknote size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-sky-600 uppercase tracking-widest">Disbursement Info</p>
 <p className="text-[10px] font-bold text-slate-700">The principal amount will be credited to your selected account.</p>
 </div>
 </div>
 </div>

 {/* Right Column: Financials (lg:col-5) */}
 <div className="lg:col-span-5 flex flex-col gap-3 lg:overflow-y-auto">
 
 {/* Principal Amount Input Card */}
 <div className="premium-glass-card p-6 bg-white relative overflow-hidden flex flex-col items-center">
 <div className="absolute -top-10 -right-10 w-32 h-32 bg-sky-500/5 blur-[40px] rounded-full" />
 <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2">Loan Principal</span>
 <div className="flex items-center gap-3">
 <span className="text-3xl font-black text-slate-200 uppercase">{currency}</span>
 <input 
 type="number" 
 name="amount"
 value={amountStr} 
 onChange={e => { setAmountStr(e.target.value); handleFieldChange('principalAmount', parseFloat(e.target.value) || 0); }}
 className="bg-transparent text-5xl font-black text-slate-900 outline-none w-[200px] text-center tracking-tighter" 
 placeholder="0"
 autoFocus
 />
 </div>
 </div>

 <div className="premium-glass-card p-5 space-y-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Repayment Schedule</p>
 <p className="text-xs font-bold text-slate-700">{formData.tenureMonths} Monthly Installments</p>
 </div>
 <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
 <Calculator size={20} />
 </div>
 </div>

 <div className="space-y-2">
 <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
 <span className="text-[10px] font-black text-slate-400 uppercase">Monthly EMI</span>
 <span className="text-sm font-black text-slate-900">{currency} {formData.emiAmount.toLocaleString()}</span>
 </div>
 <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
 <span className="text-[10px] font-black text-slate-400 uppercase">Total Interest</span>
 <span className="text-sm font-black text-amber-600">{currency} {totalInterest.toLocaleString()}</span>
 </div>
 <div className="flex items-center justify-between p-4 bg-sky-600 rounded-2xl text-white shadow-lg shadow-sky-100">
 <div className="flex items-center gap-2">
 <Target size={14} className="opacity-60" />
 <span className="text-[10px] font-black uppercase tracking-widest">Total Payable</span>
 </div>
 <span className="text-lg font-black tracking-tighter">{currency} {(formData.principalAmount + totalInterest).toLocaleString()}</span>
 </div>
 </div>
 </div>

 <div className="mt-auto p-4 bg-slate-900 rounded-2xl text-white flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><Sparkles size={16} className="text-indigo-400" /></div>
 <div>
 <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Loan Health Tip</p>
 <p className="text-[10px] font-bold">Ensure timely repayments to maintain your credit score.</p>
 </div>
 </div>

 {/* Final Summary Card */}
 <div className="p-4 bg-sky-600 rounded-2xl text-white flex items-center justify-between shadow-xl shadow-sky-100">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><Info size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-white/60 uppercase">Loan Target</p>
 <p className="text-[10px] font-black truncate max-w-[120px]">{formData.lenderName || 'New Loan'}</p>
 </div>
 </div>
 <div className="text-right">
 <p className="text-[8px] font-black text-white/60 uppercase">EMI</p>
 <p className="text-lg font-black tracking-tighter">{currency} {formData.emiAmount.toLocaleString()}</p>
 </div>
 </div>
 </div>
 </main>
 </div>
 );
};
