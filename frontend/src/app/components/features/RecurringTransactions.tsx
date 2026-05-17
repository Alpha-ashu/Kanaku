import React, { useState } from 'react';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { Calendar, Plus, RefreshCw, ShieldCheck, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

interface RecurringItem {
 id: number;
 title: string;
 amount: number;
 category: string;
 interval: 'weekly' | 'monthly' | 'yearly';
 nextDueDate: string;
 autoProcess: boolean;
 status: 'active' | 'paused';
}

export const RecurringTransactions: React.FC = () => {
 const [items, setItems] = useState<RecurringItem[]>([
 { id: 1, title: 'House Rent', amount: 18000, category: 'rent', interval: 'monthly', nextDueDate: '2026-06-01', autoProcess: true, status: 'active' },
 { id: 2, title: 'Netflix Subscription', amount: 649, category: 'entertainment', interval: 'monthly', nextDueDate: '2026-05-24', autoProcess: true, status: 'active' },
 { id: 3, title: 'Internet Utility', amount: 999, category: 'utilities', interval: 'monthly', nextDueDate: '2026-05-28', autoProcess: false, status: 'active' },
 { id: 4, title: 'Gym Membership', amount: 1500, category: 'fitness', interval: 'monthly', nextDueDate: '2026-06-05', autoProcess: false, status: 'paused' }
 ]);

 const [showAddForm, setShowAddForm] = useState(false);
 const [newTitle, setNewTitle] = useState('');
 const [newAmount, setNewAmount] = useState('');
 const [newCategory, setNewCategory] = useState('utilities');
 const [newInterval, setNewInterval] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
 const [newDueDate, setNewDueDate] = useState('');
 const [newAutoProcess, setNewAutoProcess] = useState(false);

 const handleToggleAutoProcess = (id: number) => {
 setItems(items.map(item => {
 if (item.id === id) {
 const nextState = !item.autoProcess;
 toast.success(`Auto-Process for"${item.title}" ${nextState ? 'Enabled' : 'Disabled'}`);
 return { ...item, autoProcess: nextState };
 }
 return item;
 }));
 };

 const handleToggleStatus = (id: number) => {
 setItems(items.map(item => {
 if (item.id === id) {
 const nextStatus = item.status === 'active' ? 'paused' : 'active';
 toast.info(`Billing for"${item.title}" ${nextStatus === 'active' ? 'Resumed' : 'Paused'}`);
 return { ...item, status: nextStatus };
 }
 return item;
 }));
 };

 const handleCreate = (e: React.FormEvent) => {
 e.preventDefault();
 if (!newTitle || !newAmount || !newDueDate) {
 toast.error('Please fill in all transaction details');
 return;
 }

 const newItem: RecurringItem = {
 id: Date.now(),
 title: newTitle,
 amount: parseFloat(newAmount),
 category: newCategory,
 interval: newInterval,
 nextDueDate: newDueDate,
 autoProcess: newAutoProcess,
 status: 'active'
 };

 setItems([newItem, ...items]);
 setShowAddForm(false);
 setNewTitle('');
 setNewAmount('');
 setNewDueDate('');
 setNewAutoProcess(false);
 toast.success(`Recurring"${newTitle}" created successfully!`);
 };

 const totalMonthlyCommitment = items
 .filter(item => item.status === 'active')
 .reduce((sum, item) => {
 if (item.interval === 'monthly') return sum + item.amount;
 if (item.interval === 'weekly') return sum + (item.amount * 4.3);
 if (item.interval === 'yearly') return sum + (item.amount / 12);
 return sum;
 }, 0);

 return (
 <CenteredLayout>
 <div className="w-full">
 <div className="pb-4 lg:pb-6 flex items-center justify-between flex-wrap gap-4">
 <PageHeader
 title="Recurring Transactions"
 subtitle="Manage and forecast repeating income, bills, and subscription profiles"
 icon={<RefreshCw className="text-indigo-600" size={20} />}
 />
 <button
 onClick={() => setShowAddForm(!showAddForm)}
 className="bg-indigo-600 text-white px-5 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
 >
 <Plus size={16} />
 {showAddForm ? 'Close Drawer' : 'Create Recurring'}
 </button>
 </div>

 {/* Forecast Card */}
 <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-[32px] p-8 shadow-xl relative overflow-hidden mb-8 group">
 <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
 <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
 <div>
 <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
 <ShieldCheck size={12} /> Auto-Pay Liquidity Protection
 </p>
 <h3 className="text-3xl font-black text-white tracking-tight">₹{totalMonthlyCommitment.toLocaleString(undefined, { maximumFractionDigits: 0 })}/month</h3>
 <p className="text-indigo-200 text-sm mt-1.5 font-medium leading-relaxed max-w-xl">
 Aggregate monthly projection of active recurring liabilities. Ensure your linked bank accounts retain sufficient balance before the due date to avoid bounces.
 </p>
 </div>
 <div className="bg-white/10 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/10 shrink-0">
 <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">Active schedules</span>
 <p className="text-2xl font-black text-white mt-1">{items.filter(i => i.status === 'active').length} Profiles</p>
 </div>
 </div>
 </div>

 {/* Add Drawer */}
 {showAddForm && (
 <Card variant="glass" className="p-8 mb-8 border-white/40 shadow-xl">
 <h3 className="text-lg font-black text-slate-900 tracking-tight mb-6">Create New Recurring Schedule</h3>
 <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
 <div>
 <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Schedule Name</label>
 <input
 type="text"
 placeholder="e.g. Spotify Premium, Rent"
 value={newTitle}
 onChange={e => setNewTitle(e.target.value)}
 className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
 />
 </div>

 <div>
 <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Amount (₹)</label>
 <input
 type="number"
 placeholder="0.00"
 value={newAmount}
 onChange={e => setNewAmount(e.target.value)}
 className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
 />
 </div>

 <div>
 <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
 <select
 value={newCategory}
 onChange={e => setNewCategory(e.target.value)}
 className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
 >
 <option value="rent">Rent & Housing</option>
 <option value="entertainment">Entertainment & Subs</option>
 <option value="utilities">Bills & Utilities</option>
 <option value="fitness">Gym & Fitness</option>
 <option value="salary">Salary & Income</option>
 </select>
 </div>

 <div>
 <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Billing Frequency</label>
 <select
 value={newInterval}
 onChange={e => setNewInterval(e.target.value as any)}
 className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
 >
 <option value="weekly">Weekly</option>
 <option value="monthly">Monthly</option>
 <option value="yearly">Yearly</option>
 </select>
 </div>

 <div>
 <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Next Due Date</label>
 <input
 type="date"
 value={newDueDate}
 onChange={e => setNewDueDate(e.target.value)}
 className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-600 transition-colors"
 />
 </div>

 <div className="flex items-center gap-4 pt-6 md:col-span-2 lg:col-span-1">
 <button
 type="button"
 onClick={() => setNewAutoProcess(!newAutoProcess)}
 className={`w-12 h-6 rounded-full relative transition-all shrink-0 ${newAutoProcess ? 'bg-indigo-600' : 'bg-slate-300'}`}
 >
 <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${newAutoProcess ? 'right-1' : 'left-1'}`} />
 </button>
 <div>
 <span className="text-xs font-bold text-slate-700">Auto-Deduct Automatically</span>
 <p className="text-[10px] text-slate-400 font-medium">Process entry automatically on due date</p>
 </div>
 </div>

 <div className="md:col-span-2 lg:col-span-3 pt-4 flex justify-end">
 <button
 type="submit"
 className="bg-indigo-600 text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-100"
 >
 Create Schedule
 </button>
 </div>
 </form>
 </Card>
 )}

 {/* Schedule List */}
 <div className="grid grid-cols-1 gap-6">
 {items.map(item => (
 <Card key={item.id} variant="glass" className={`p-6 border-white/40 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all ${item.status === 'paused' ? 'opacity-65' : ''}`}>
 <div className="flex items-center gap-4">
 <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${item.status === 'active' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
 <CreditCard size={20} />
 </div>
 <div>
 <h4 className="font-black text-slate-900 tracking-tight flex items-center gap-2">
 {item.title}
 {item.status === 'paused' && (
 <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-400 tracking-wider">Paused</span>
 )}
 </h4>
 <div className="flex items-center gap-4 mt-1.5 flex-wrap">
 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{item.category}</span>
 <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
 <span className="text-xs font-bold text-slate-500 capitalize">{item.interval} frequency</span>
 <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
 <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
 <Calendar size={12} /> Next: {item.nextDueDate}
 </span>
 </div>
 </div>
 </div>

 <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-none pt-4 md:pt-0">
 <div className="text-left md:text-right">
 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Liability</span>
 <p className="text-lg font-black text-slate-900 mt-0.5">₹{item.amount.toLocaleString()}</p>
 </div>
 <div className="flex items-center gap-4">
 {/* Auto process toggle */}
 <div className="flex items-center gap-2">
 <button
 onClick={() => handleToggleAutoProcess(item.id)}
 disabled={item.status === 'paused'}
 className={`w-10 h-5 rounded-full relative transition-all ${item.autoProcess ? 'bg-indigo-600' : 'bg-slate-300'} disabled:opacity-50`}
 >
 <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${item.autoProcess ? 'right-0.5' : 'left-0.5'}`} />
 </button>
 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">Auto-Pay</span>
 </div>

 {/* Actions */}
 <button
 onClick={() => handleToggleStatus(item.id)}
 className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${item.status === 'active' ? 'bg-slate-50 text-slate-500 hover:bg-slate-100' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
 >
 {item.status === 'active' ? 'Pause' : 'Resume'}
 </button>
 </div>
 </div>
 </Card>
 ))}
 </div>
 </div>
 </CenteredLayout>
 );
};

export default RecurringTransactions;
