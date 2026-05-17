
import React, { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { saveTransactionWithBackendSync } from '@/lib/auth-sync-integration';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { 
 ArrowRightLeft, ArrowRight, ShieldCheck, Loader2, ArrowDownLeft, ArrowUpRight, 
 Check, Zap, CreditCard, Banknote, Smartphone, Wallet, ArrowLeft, Info, Sparkles 
} from 'lucide-react';
import type { Account } from '@/lib/database';
import { cn } from '@/lib/utils';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';

import '@/styles/premium-transactions.css';

const accountTypeMeta: Record<string, { icon: React.FC<{ size?: number; className?: string }>; shell: string }> = {
 bank: { icon: CreditCard, shell: 'bg-blue-50 text-blue-600' },
 cash: { icon: Banknote, shell: 'bg-emerald-50 text-emerald-600' },
 wallet: { icon: Wallet, shell: 'bg-violet-50 text-violet-600' },
 upi: { icon: Smartphone, shell: 'bg-orange-50 text-orange-600' },
 credit: { icon: CreditCard, shell: 'bg-rose-50 text-rose-600' },
};

export const Transfer: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
 const { currency, setCurrentPage, refreshData } = useApp();
 const [formData, setFormData] = useState({
 fromAccountId: 0,
 toAccountId: 0,
 amount: 0,
 description: '',
 transferType: 'self-transfer' as const,
 });
 
 const [amountStr, setAmountStr] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);

 const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];
 const activeAccounts = accounts.filter((a) => a.isActive);
 const fromAcc = activeAccounts.find((a) => a.id === formData.fromAccountId);
 const toAcc = activeAccounts.find((a) => a.id === formData.toAccountId);
 const amountNum = formData.amount;

 const formatCurrency = (v: number) =>
 new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v);

 const handleSubmit = async () => {
 if (!formData.fromAccountId) { toast.error('Select a source account'); return; }
 if (!formData.toAccountId) { toast.error('Select a destination account'); return; }
 if (formData.fromAccountId === formData.toAccountId) { toast.error('Cannot transfer to the same account'); return; }
 if (amountNum <= 0) { toast.error('Enter a valid amount'); return; }
 if (fromAcc && amountNum > fromAcc.balance) { toast.error(`Insufficient balance (${formatCurrency(fromAcc.balance)} available)`); return; }

 setIsSubmitting(true);
 try {
 const fromAccount = await db.accounts.get(formData.fromAccountId);
 const toAccount = await db.accounts.get(formData.toAccountId);
 if (!fromAccount || !toAccount) { toast.error('Account not found'); return; }

 await saveTransactionWithBackendSync({
 type: 'transfer',
 amount: amountNum,
 accountId: formData.fromAccountId,
 category: 'Transfer',
 subcategory: 'Transfer',
 description: formData.description || `Transfer to ${toAccount.name}`,
 date: new Date(),
 transferToAccountId: formData.toAccountId,
 transferType: formData.transferType,
 updatedAt: new Date(),
 });

 await db.accounts.update(formData.fromAccountId, { balance: fromAccount.balance - amountNum, updatedAt: new Date() });
 await db.accounts.update(formData.toAccountId, { balance: toAccount.balance + amountNum, updatedAt: new Date() });

 toast.success(`Transferred ${formatCurrency(amountNum)} from ${fromAccount.name} to ${toAccount.name}`);
 refreshData();
 setCurrentPage('accounts');
 } catch (err) {
 toast.error('Transfer failed. Please try again.');
 } finally {
 setIsSubmitting(false);
 }
 };

 const accountOptions = activeAccounts.map((account: Account) => {
 const meta = accountTypeMeta[account.type ?? 'bank'] ?? accountTypeMeta.bank;
 return {
 value: String(account.id),
 label: account.name,
 description: formatCurrency(account.balance),
 icon: (
 <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', meta.shell)}>
 <meta.icon size={14} />
 </span>
 ),
 };
 });

 return (
 <div className="flex flex-col min-h-screen bg-[#F8FAFC] font-sans">

 {/* Header */}
 <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-3">
 <button onClick={() => onBack ? onBack() : setCurrentPage('accounts')} className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
 <ArrowLeft size={20} />
 </button>
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Internal Transfer</h1>
 </div>
 
 <div className="flex items-center gap-3">
 <button onClick={() => onBack ? onBack() : setCurrentPage('accounts')} className="hidden sm:block text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest px-4">Cancel</button>
 <button 
 onClick={handleSubmit}
 disabled={isSubmitting || !amountNum}
 className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
 >
 {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
 Complete Transfer
 </button>
 </div>
 </div>
 </header>

 {/* Main Content Area */}
 <main className="flex-1 p-3 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 pb-32 lg:pb-5">
 
 {/* Left Column: Flow Details (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-3 lg:overflow-y-auto">
 
 <div className="premium-glass-card p-6 flex flex-col items-center justify-center space-y-6 relative overflow-hidden min-h-[300px]">
 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
 
 <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 w-full">
 {/* Source Account */}
 <div className={cn("p-4 rounded-2xl border-2 transition-all flex flex-col items-center text-center gap-2", fromAcc ?"bg-indigo-50/50 border-indigo-200" :"bg-slate-50 border-slate-100 border-dashed")}>
 <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Source Account</span>
 <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
 {fromAcc ? (
 <div className={cn("p-2 rounded-lg", accountTypeMeta[fromAcc.type ?? 'bank'].shell)}>
 {React.createElement(accountTypeMeta[fromAcc.type ?? 'bank'].icon, { size: 24 })}
 </div>
 ) : <CreditCard size={24} className="text-slate-200" />}
 </div>
 <p className="text-[11px] font-black text-slate-900 truncate w-full">{fromAcc?.name || 'Select Source'}</p>
 <p className="text-[9px] font-bold text-indigo-600 uppercase">{fromAcc ? formatCurrency(fromAcc.balance) : '---'}</p>
 </div>

 <div className="flex flex-col items-center gap-2">
 <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all animate-pulse", amountNum > 0 ?"bg-indigo-600 text-white" :"bg-slate-200 text-slate-400")}>
 <ArrowRight size={20} />
 </div>
 {amountNum > 0 && <span className="text-[10px] font-black text-indigo-600">{formatCurrency(amountNum)}</span>}
 </div>

 {/* Destination Account */}
 <div className={cn("p-4 rounded-2xl border-2 transition-all flex flex-col items-center text-center gap-2", toAcc ?"bg-emerald-50/50 border-emerald-200" :"bg-slate-50 border-slate-100 border-dashed")}>
 <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Destination</span>
 <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
 {toAcc ? (
 <div className={cn("p-2 rounded-lg", accountTypeMeta[toAcc.type ?? 'bank'].shell)}>
 {React.createElement(accountTypeMeta[toAcc.type ?? 'bank'].icon, { size: 24 })}
 </div>
 ) : <Wallet size={24} className="text-slate-200" />}
 </div>
 <p className="text-[11px] font-black text-slate-900 truncate w-full">{toAcc?.name || 'Select Target'}</p>
 <p className="text-[9px] font-bold text-emerald-600 uppercase">{toAcc ? formatCurrency(toAcc.balance) : '---'}</p>
 </div>
 </div>

 <div className="w-full space-y-4 pt-4 border-t border-slate-100">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Transfer From</label>
 <SearchableDropdown
 options={accountOptions}
 value={String(formData.fromAccountId)}
 onChange={val => setFormData(prev => ({ ...prev, fromAccountId: parseInt(val) }))}
 placeholder="Source Account"
 className="bg-slate-50 border-none rounded-xl h-10 font-bold text-xs"
 />
 </div>
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Transfer To</label>
 <SearchableDropdown
 options={accountOptions.filter(o => o.value !== String(formData.fromAccountId))}
 value={String(formData.toAccountId)}
 onChange={val => setFormData(prev => ({ ...prev, toAccountId: parseInt(val) }))}
 placeholder="Target Account"
 className="bg-slate-50 border-none rounded-xl h-10 font-bold text-xs"
 />
 </div>
 </div>

 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Note / Reference (Optional)</label>
 <input 
 type="text" 
 value={formData.description} 
 onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-slate-900 text-xs" 
 placeholder="e.g. Monthly savings move" 
 />
 </div>
 </div>
 </div>

 <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0"><ShieldCheck size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Instant Settlement</p>
 <p className="text-[10px] font-bold text-slate-700">Both balances will be updated immediately upon confirmation.</p>
 </div>
 </div>
 </div>

 {/* Right Column: Financials (lg:col-5) */}
 <div className="lg:col-span-5 flex flex-col gap-3 lg:overflow-y-auto">
 
 {/* Amount Input Card */}
 <div className="premium-glass-card p-6 bg-white relative overflow-hidden flex flex-col items-center">
 <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full" />
 <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2">Transfer Amount</span>
 <div className="flex items-center gap-3">
 <span className="text-3xl font-black text-slate-200 uppercase">{currency}</span>
 <input 
 type="number" 
 value={amountStr} 
 onChange={e => { setAmountStr(e.target.value); setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 })); }}
 className="bg-transparent text-5xl font-black text-slate-900 outline-none w-[200px] text-center tracking-tighter" 
 placeholder="0.00"
 autoFocus
 />
 </div>
 </div>

 <div className="premium-glass-card p-5 space-y-4">
 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impact Summary</h3>
 
 <div className="space-y-3">
 <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
 <div className="flex items-center gap-2">
 <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
 <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Decrease</span>
 </div>
 <span className="text-sm font-black text-rose-600">-{formatCurrency(amountNum)}</span>
 </div>
 <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
 <div className="flex items-center gap-2">
 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
 <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Increase</span>
 </div>
 <span className="text-sm font-black text-emerald-600">+{formatCurrency(amountNum)}</span>
 </div>
 
 <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Net Wealth Change</p>
 <div className="flex items-center gap-1.5 text-indigo-600">
 <span className="text-sm font-black tracking-tighter">0.00</span>
 <Info size={12} className="opacity-40" />
 </div>
 </div>
 </div>
 </div>

 <div className="mt-auto p-4 bg-slate-900 rounded-2xl text-white flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><Sparkles size={16} className="text-amber-400" /></div>
 <div>
 <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Pro Tip</p>
 <p className="text-[10px] font-bold">Transfers help you track how money moves between your accounts.</p>
 </div>
 </div>

 {/* Final Summary Card */}
 <div className="p-4 bg-indigo-600 rounded-2xl text-white flex items-center justify-between shadow-xl shadow-indigo-100">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><ArrowRightLeft size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-white/60 uppercase">Final Review</p>
 <p className="text-[10px] font-black truncate max-w-[120px]">{fromAcc?.name || '---'} {toAcc?.name || '---'}</p>
 </div>
 </div>
 <div className="text-right">
 <p className="text-[8px] font-black text-white/60 uppercase">Amount</p>
 <p className="text-lg font-black tracking-tighter">{currency} {amountNum.toLocaleString()}</p>
 </div>
 </div>
 </div>
 </main>
 </div>
 );
};
