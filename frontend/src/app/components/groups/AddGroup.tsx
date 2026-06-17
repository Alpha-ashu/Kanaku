
import React, { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { Users, UserPlus, X, Check, ArrowLeft, Loader2, Calculator, Tag, AlignLeft, Calendar, Info, Sparkles, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import '@/styles/premium-transactions.css';
import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';
import { db } from '@/lib/database';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

// --- Constants ---
const GROUP_CATEGORIES = [
 { value: 'general', label: 'General', icon: '' },
 { value: 'food', label: 'Food & Dining', icon: '' },
 { value: 'travel', label: 'Travel', icon: '' },
 { value: 'entertainment', label: 'Entertainment', icon: '' },
 { value: 'rent', label: 'Rent', icon: '' },
 { value: 'utilities', label: 'Utilities', icon: '' },
];

const groupCategoryOptions = GROUP_CATEGORIES.map((category) => ({
 value: category.value,
 label: category.label,
 description: category.label,
 icon: <span className="text-lg">{category.icon}</span>
}));

export const AddGroup: React.FC = () => {
 const { setCurrentPage, currency, friends, refreshData } = useApp();
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [showFriendPicker, setShowFriendPicker] = useState(false);
 
 const [formData, setFormData] = useState({
 name: '',
 description: '',
 participants: [''] as string[],
 totalAmount: 0,
 category: 'general',
 date: new Date().toISOString().split('T')[0],
 });

 const [amountStr, setAmountStr] = useState('');

 const validParticipants = formData.participants.filter((p) => p.trim());
 const totalNum = formData.totalAmount;
 const perPerson = validParticipants.length > 0 ? totalNum / (validParticipants.length + 1) : totalNum;
 
 const formatCurrency = (v: number) => formatCurrencyAmount(v, currency);

 const addParticipant = () => setFormData(prev => ({ ...prev, participants: [...prev.participants, ''] }));
 
 const removeParticipant = (i: number) => 
 setFormData(prev => ({ ...prev, participants: prev.participants.filter((_, idx) => idx !== i) }));
 
 const updateParticipant = (i: number, val: string) => {
 const next = [...formData.participants];
 next[i] = val;
 setFormData(prev => ({ ...prev, participants: next }));
 };

 // Save a name as a Friend in the DB if not already there (temp record)
 const saveNewFriend = async (name: string) => {
 const trimmed = name.trim();
 if (!trimmed) return;
 const existing = friends.find(f => f.name.toLowerCase() === trimmed.toLowerCase());
 if (existing) return;
 await db.friends.add({ name: trimmed, createdAt: new Date(), updatedAt: new Date(), syncStatus: 'pending' });
 refreshData();
 };

 const addFriend = (name: string) => {
 if (formData.participants.some((p) => p.toLowerCase() === name.toLowerCase())) { 
 toast.error(`${name} already added`); 
 return; 
 }
 const emptyIdx = formData.participants.findIndex((p) => !p.trim());
 if (emptyIdx !== -1) { 
 const next = [...formData.participants]; 
 next[emptyIdx] = name; 
 setFormData(prev => ({ ...prev, participants: next })); 
 } else { 
 setFormData(prev => ({ ...prev, participants: [...prev.participants, name] })); 
 }
 setShowFriendPicker(false);
 };

 // New person: add inline by name and immediately save to friends DB
 const [newPersonInput, setNewPersonInput] = useState('');
 const [showNewPersonInput, setShowNewPersonInput] = useState(false);

 const confirmNewPerson = async () => {
 const name = newPersonInput.trim();
 if (!name) return;
 if (formData.participants.some(p => p.toLowerCase() === name.toLowerCase())) {
 toast.error(`${name} already added`);
 return;
 }
 await saveNewFriend(name);
 const emptyIdx = formData.participants.findIndex(p => !p.trim());
 if (emptyIdx !== -1) {
 const next = [...formData.participants];
 next[emptyIdx] = name;
 setFormData(prev => ({ ...prev, participants: next }));
 } else {
 setFormData(prev => ({ ...prev, participants: [...formData.participants, name] }));
 }
 setNewPersonInput('');
 setShowNewPersonInput(false);
 };

 const handleSubmit = async () => {
 if (!formData.name.trim()) { toast.error('Group name is required'); return; }
 if (validParticipants.length < 1) { toast.error('Add at least one participant'); return; }
 if (totalNum <= 0) { toast.error('Total amount must be greater than 0'); return; }

 setIsSubmitting(true);
 try {
 const expenseDate = new Date(formData.date);
 const targetDateStr = expenseDate.toDateString();
 const existingGroup = await db.groupExpenses
  .filter(g =>
   g.name.toLowerCase() === formData.name.trim().toLowerCase() &&
   new Date(g.date).toDateString() === targetDateStr &&
   !g.deletedAt
  )
  .first();

 if (existingGroup) {
  toast.error('A group expense with the same name and date already exists.');
  setIsSubmitting(false);
  return;
 }

 // Auto-save all new participant names as Friends in the DB
 await Promise.all(validParticipants.map(name => saveNewFriend(name)));

 // Build enriched member list for both local record and backend
 const enrichedParticipants = validParticipants.map((name) => {
   const friend = friends.find((f) => f.name.toLowerCase() === name.toLowerCase());
   return {
     name,
     share: perPerson,
     paid: false,
     isCurrentUser: false as const,
     paidAmount: 0,
     paymentStatus: 'pending' as const,
     friendId: friend?.id,
     email: friend?.email,
     phone: (friend as any)?.phone,
   };
 });

 const members = [
   { name: 'You', share: perPerson, paid: true, isCurrentUser: true as const, paidAmount: perPerson, paymentStatus: 'paid' as const },
   ...enrichedParticipants,
 ];

 const now = new Date();

 // Write to Dexie first so the Groups page shows it immediately (offline-first)
 const localId = await db.groupExpenses.add({
   name: formData.name.trim(),
   totalAmount: totalNum,
   paidBy: 0,
   date: expenseDate,
   members,
   description: formData.description || undefined,
   category: formData.category,
   splitType: 'equal',
   yourShare: perPerson,
   status: 'pending',
   syncStatus: 'pending',
   createdAt: now,
   updatedAt: now,
 });

 toast.success('Group expense created! Participants saved to contacts.');
 setCurrentPage('groups');

 // Push to backend in background; update cloudId on success
 try {
   const backendResp = await backendService.api.post('/groups', {
     name: formData.name.trim(),
     totalAmount: totalNum,
     paidBy: 0,
     date: expenseDate.toISOString(),
     category: formData.category,
     description: formData.description || undefined,
     splitType: 'equal',
     yourShare: perPerson,
     status: 'pending',
     members: [
       { name: 'You', share: perPerson, paid: true, isCurrentUser: true },
       ...enrichedParticipants.map(p => ({ name: p.name, share: p.share, paid: p.paid, email: p.email, phone: p.phone })),
     ],
   });
   if (backendResp.data?.id || backendResp.data?.data?.id) {
     const cloudId = String(backendResp.data?.id ?? backendResp.data?.data?.id);
     await db.groupExpenses.update(localId as number, { cloudId, syncStatus: 'synced' });
   }
 } catch {
   // Keep syncStatus='pending'; background sync will retry
 }
 } catch (error) {
 toast.error('Failed to create group expense');
 } finally {
 setIsSubmitting(false);
 }
 };

 return (
 <div className="flex flex-col min-h-screen bg-white">

 {/* High Density Header */}
 <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-3">
 <button onClick={() => setCurrentPage('groups')} title="Back" className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
 <ArrowLeft size={20} />
 </button>
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">New Group Expense</h1>
 </div>
 
 </div>
 </header>

 {/* Main Single-Page Content Area */}
 <main className="flex-1 p-3 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 overflow-y-auto pb-32 lg:pb-6">
 
 {/* Left Column: context & types (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-4">
 
 <div className="premium-glass-card p-4 sm:p-6 space-y-4 sm:space-y-6">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Group / Expense Name</label>
 <div className="relative">
 <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input 
 type="text" 
 value={formData.name} 
 onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs" 
 placeholder="e.g. Weekend Trip to Goa" 
 />
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-2">
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</label>
 <SearchableDropdown
 options={groupCategoryOptions}
 value={formData.category}
 onChange={val => setFormData(prev => ({ ...prev, category: val }))}
 placeholder="Category"
 triggerClassName="bg-slate-50 border-none rounded-xl h-12 font-bold text-xs shadow-none"
 />
 </div>
 <div className="space-y-2">
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</label>
 <div className="relative group">
 <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-violet-500 transition-colors z-10" size={14} />
 <div className="w-full bg-slate-50 border border-transparent rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs text-slate-900 group-hover:bg-slate-100/50 group-hover:border-slate-200 transition-all flex items-center min-h-[40px]">
 {(() => {
 if (!formData.date) return 'Select Date';
 const date = new Date(formData.date);
 const day = String(date.getDate()).padStart(2, '0');
 const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
 })()}
 </div>
 <input
 type="date"
 value={formData.date}
 onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
 aria-label="Expense date"
 className="absolute inset-0 opacity-0 cursor-pointer z-20"
 />
 </div>
 </div>
 </div>

 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Description (Optional)</label>
 <div className="relative">
 <AlignLeft className="absolute left-2.5 top-3 text-slate-300" size={14} />
 <textarea 
 value={formData.description} 
 onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs min-h-[60px] resize-none" 
 placeholder="What was this for?" 
 />
 </div>
 </div>

 {/* Participants Section */}
 <div className="space-y-4 pt-4 border-t border-slate-100">
 <div className="flex items-center justify-between">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
 Split with Participants ({validParticipants.length + 1})
 </label>
 <div className="flex gap-2">
 {friends && friends.length > 0 && (
 <button 
 type="button" 
 onClick={() => { setShowFriendPicker(!showFriendPicker); setShowNewPersonInput(false); }}
 className="text-[8px] font-black uppercase text-violet-600 bg-violet-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
 >
 <Users size={10} /> Friends
 </button>
 )}
 <button 
 type="button" 
 onClick={() => { setShowNewPersonInput(!showNewPersonInput); setShowFriendPicker(false); }}
 className="text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
 >
 <UserPlus size={10} /> New Person
 </button>
 </div>
 </div>

 {/* Friends quick-pick panel */}
 {showFriendPicker && friends.length > 0 && (
 <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-100 animate-in slide-in-from-top-2">
 <p className="text-[8px] font-black text-violet-400 uppercase tracking-widest mb-2">Tap to add</p>
 <div className="flex flex-wrap gap-2">
 {friends.map(f => {
 const already = formData.participants.some(p => p.toLowerCase() === f.name.toLowerCase());
 return (
 <button 
 key={f.id}
 type="button"
 onClick={() => !already && addFriend(f.name)}
 disabled={already}
 className={cn(
"px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all",
 already
 ?"bg-slate-100 text-slate-300 cursor-not-allowed line-through"
 :"bg-white border border-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white shadow-sm"
 )}
 >
 {f.name}
 </button>
 );
 })}
 </div>
 </div>
 )}

 {/* Inline new person input */}
 {showNewPersonInput && (
 <div className="flex items-center gap-2 p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100 animate-in slide-in-from-top-2">
 <UserPlus size={14} className="text-indigo-400 shrink-0" />
 <input
 type="text"
 value={newPersonInput}
 onChange={e => setNewPersonInput(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && confirmNewPerson()}
 className="flex-1 bg-transparent border-none p-0 text-xs font-bold text-slate-900 focus:ring-0 placeholder:text-slate-300"
 placeholder="Type name & press Enter"
 autoFocus
 />
 <button type="button" onClick={confirmNewPerson} title="Confirm" className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all">
 <Check size={12} strokeWidth={3} />
 </button>
 <button type="button" onClick={() => { setShowNewPersonInput(false); setNewPersonInput(''); }} title="Cancel" className="p-1.5 text-slate-400 hover:text-slate-600 transition-all">
 <X size={12} strokeWidth={3} />
 </button>
 </div>
 )}

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[250px] lg:max-h-[400px] overflow-y-auto no-scrollbar">
 {/* Fixed"You" Participant */}
 <div className="flex items-center gap-2 p-2.5 bg-slate-100/50 rounded-xl border border-slate-100">
 <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-black text-white">ME</div>
 <div className="flex-1">
 <p className="text-[10px] font-black text-slate-900">You (Included)</p>
 <p className="text-[8px] font-bold text-slate-400 uppercase">Always part of split</p>
 </div>
 </div>

 {formData.participants.map((p, i) => (
 <div key={i} className="flex items-center gap-2 p-2 bg-white border border-slate-100 rounded-xl group">
 <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-500 uppercase">
 {p ? p.charAt(0) : <Plus size={12} />}
 </div>
 <input 
 type="text" 
 value={p} 
 onChange={e => updateParticipant(i, e.target.value)}
 onBlur={e => saveNewFriend(e.target.value)}
 className="flex-1 bg-transparent border-none p-0 text-[11px] font-bold text-slate-900 focus:ring-0" 
 placeholder={`Person ${i + 1}`} 
 />
 <button type="button" onClick={() => removeParticipant(i)} title="Remove participant" className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
 <Trash2 size={14} />
 </button>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>

 {/* Right Column: Financials (lg:col-5) */}
 <div className="lg:col-span-5 flex flex-col gap-4">
 
 {/* Total Amount Input Card */}
 <div className="premium-glass-card p-8 bg-white relative overflow-hidden flex flex-col items-center">
 <div className="absolute -top-24 -left-24 w-64 h-64 bg-violet-500/5 blur-[80px] rounded-full pointer-events-none z-0" />
 <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none z-0" />
 
 <div className="relative z-10 flex flex-col items-center w-full">
 <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Total Group Bill</span>
 
 <div className="flex items-center justify-center w-full my-4">
 {/* Left Side: Currency */}
 <div className="w-20 sm:w-28 flex justify-end pr-2 sm:pr-4">
 <span className="text-2xl sm:text-4xl font-black text-slate-200 select-none tracking-tighter">{currency}</span>
 </div>
 
 {/* Center: Input */}
 <input
 type="number"
 name="totalAmount"
 value={amountStr}
 onChange={e => { setAmountStr(e.target.value); setFormData(prev => ({ ...prev, totalAmount: parseFloat(e.target.value) || 0 })); }}
 className="bg-transparent text-5xl sm:text-6xl font-black text-slate-900 outline-none w-[160px] sm:w-[220px] text-center tracking-tighter placeholder:text-slate-100 p-0 m-0"
 placeholder="0"
 autoFocus
 />
 
 {/* Right Side: Clear Button */}
 <div className="w-20 sm:w-28 flex justify-start pl-2 sm:pl-4">
 {amountStr && (
 <button
 onClick={() => { setAmountStr(''); setFormData(prev => ({ ...prev, totalAmount: 0 })); }}
 title="Clear amount"
 className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all animate-in fade-in zoom-in-50"
 >
 <X size={28} strokeWidth={3} />
 </button>
 )}
 </div>
 </div>

 <div className="flex flex-wrap justify-center gap-3 mt-8 max-w-sm">
 {[100, 500, 1000, 2000, 5000].map(amt => (
 <button 
 key={amt} 
 type="button"
 onClick={() => { 
 const current = Number(formData.totalAmount) || 0;
 const next = current + amt;
 setAmountStr(String(next));
 setFormData(prev => ({ ...prev, totalAmount: next }));
 }} 
 className="px-6 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black text-slate-500 hover:bg-slate-900 hover:text-white hover:border-slate-900 hover:shadow-2xl hover:shadow-slate-200 transition-all active:scale-90 select-none"
 >
 +{currency}{amt}
 </button>
 ))}
 </div>
 </div>
 </div>

 <div className="premium-glass-card p-4 sm:p-6 space-y-5">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Split Calculation</p>
 <p className="text-xs font-bold text-slate-700">Equally between {validParticipants.length + 1} people</p>
 </div>
 <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
 <Calculator size={20} />
 </div>
 </div>

 <div className="p-4 bg-slate-900 rounded-2xl text-white relative overflow-hidden">
 <div className="absolute -top-6 -right-6 w-20 h-20 bg-white/5 blur-[20px] rounded-full" />
 <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Your Share</p>
 <div className="flex items-baseline gap-2">
 <span className="text-sm sm:text-lg font-black text-white/20">{currency}</span>
 <span className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter">{perPerson.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
 </div>
 <div className="mt-4 flex items-center gap-3">
 <div className="flex -space-x-2">
 <div className="w-6 h-6 rounded-full bg-violet-500 border-2 border-slate-900 flex items-center justify-center text-[7px] font-black">YOU</div>
 {validParticipants.slice(0, 3).map((p, i) => (
 <div key={i} className="w-6 h-6 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center text-[7px] font-black uppercase">{p[0] || '?'}</div>
 ))}
 {validParticipants.length > 3 && <div className="w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[7px] font-black">+{validParticipants.length - 3}</div>}
 </div>
 <span className="text-[10px] font-black text-white/40 uppercase tracking-tight">Total {validParticipants.length + 1} People</span>
 </div>
 </div>
 </div>

 <div className="mt-auto p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0"><Sparkles size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Smart Split Tip</p>
 <p className="text-[10px] font-bold text-slate-700">Add group name for better expense tracking.</p>
 </div>
 </div>

 {/* Final Summary Card */}
 <div className="p-5 bg-violet-600 rounded-2xl text-white flex items-center justify-between shadow-xl shadow-violet-100 mt-auto">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center"><Users size={20} className="text-white" /></div>
 <div>
 <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">Group Summary</p>
 <p className="text-xs font-black truncate max-w-[140px]">{formData.name || 'New Group bill'}</p>
 </div>
 </div>
 <div className="text-right">
 <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">Total Bill</p>
 <p className="text-xl sm:text-2xl font-black tracking-tighter">{currency} {totalNum.toLocaleString()}</p>
 </div>
 </div>
 </div>
 </main>
 <FloatingSaveBar
   onSave={handleSubmit}
   onDiscard={() => setCurrentPage('groups')}
   isSaving={isSubmitting}
   disabled={!formData.totalAmount}
   saveLabel="Create Group"
   accentClass="from-violet-500 to-violet-600"
 />
 </div>
 );
};
