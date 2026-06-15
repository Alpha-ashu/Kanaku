
import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { saveGoalWithBackendSync } from '@/lib/auth-sync-integration';
import { GoalMember } from '@/lib/database';
import { GOAL_CATEGORIES, getMonthlySuggestion } from '@/lib/goal-utils';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { motion, AnimatePresence } from 'framer-motion';
import {
 ArrowLeft, Target, Users, TrendingUp, Calendar, Wallet, Check, Trash2, 
 UserPlus, Mail, Phone, Link as LinkIcon, Sparkles, Store, AlignLeft, Info, Plus, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { takeVoiceDraft, VOICE_GOAL_DRAFT_KEY, type VoiceGoalDraft } from '@/lib/voiceDrafts';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

import '@/styles/premium-transactions.css';
import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';

// --- Helpers ---
const formatCurrency = (v: number, currency: string) =>
  formatCurrencyAmount(v, currency, { maximumFractionDigits: 0 });

// --- Sub-components ---

const GoalCategoryGrid = ({ 
  selectedCategory, 
  onSelect 
}: { 
  selectedCategory: string, 
  onSelect: (cat: string) => void 
}) => {
  const [activePage, setActivePage] = useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const itemsPerPage = 8;
  const pages = useMemo(() => {
    const chunked: (typeof GOAL_CATEGORIES)[] = [];
    for (let i = 0; i < GOAL_CATEGORIES.length; i += itemsPerPage) {
      chunked.push(GOAL_CATEGORIES.slice(i, i + itemsPerPage));
    }
    return chunked;
  }, []);

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollLeft, clientWidth } = containerRef.current;
      if (clientWidth > 0) {
        const pageIndex = Math.round(scrollLeft / clientWidth);
        setActivePage(pageIndex);
      }
    }
  };

  return (
    <div className="w-full flex flex-col">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full p-1 gap-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {pages.map((pageItems, pageIdx) => (
          <div 
            key={pageIdx} 
            className="w-full shrink-0 snap-align-start grid grid-cols-4 grid-rows-2 gap-2"
          >
            {pageItems.map(cat => (
              <div 
                key={cat.key}
                onClick={() => onSelect(cat.key)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all cursor-pointer group",
                  selectedCategory === cat.key ? "bg-indigo-600 shadow-lg shadow-indigo-200" : "bg-slate-50 hover:bg-slate-100"
                )}
              >
                <div className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-lg", selectedCategory === cat.key ? "bg-white/20" : "bg-white group-hover:bg-slate-50")}>
                  {getCategoryCartoonIcon(cat.key, 24)}
                </div>
                <span className={cn("text-[9px] font-black uppercase tracking-tight text-center leading-none truncate w-full px-0.5", selectedCategory === cat.key ? "text-white" : "text-slate-500")}>
                  {cat.label}
                </span>
              </div>
            ))}
            {/* Pad the last page if it doesn't have 8 items */}
            {pageItems.length < itemsPerPage && 
              Array.from({ length: itemsPerPage - pageItems.length }).map((_, idx) => (
                <div key={`empty-${idx}`} className="opacity-0 pointer-events-none" />
              ))
            }
          </div>
        ))}
      </div>
      {/* Indicator Dots */}
      {pages.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {pages.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (containerRef.current) {
                  const width = containerRef.current.clientWidth;
                  containerRef.current.scrollTo({ left: idx * width, behavior: 'smooth' });
                  setActivePage(idx);
                }
              }}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                activePage === idx ? "bg-indigo-600 w-3.5" : "bg-slate-300 hover:bg-slate-400"
              )}
              aria-label={`Go to page ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const AddGoal: React.FC = () => {
 const { setCurrentPage, currency, refreshData, friends } = useApp();
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [formData, setFormData] = useState({
 name: '',
 category: 'travel',
 targetAmount: 0,
 currentAmount: 0,
 monthlySavingPlan: 0,
 deadline: '',
 description: '',
 goalType: 'individual' as 'individual' | 'group',
 });
 
 const [amountStr, setAmountStr] = useState('');
 const [initialAmtStr, setInitialAmtStr] = useState('');
 const [memberInput, setMemberInput] = useState({ name: '', contactType: 'email' as 'phone' | 'email' | 'link', contactValue: '' });
 const [members, setMembers] = useState<GoalMember[]>([]);

 const deadlineDate = formData.deadline ? new Date(formData.deadline) : null;
 const suggestion = deadlineDate
 ? getMonthlySuggestion(formData.targetAmount, formData.currentAmount, deadlineDate)
 : null;

 useEffect(() => {
 const draft = takeVoiceDraft<VoiceGoalDraft>(VOICE_GOAL_DRAFT_KEY);
 if (draft) {
 setFormData(prev => ({
 ...prev,
 name: draft.description || prev.name,
 targetAmount: draft.amount || prev.targetAmount,
 description: draft.description || prev.description,
 }));
 if (draft.amount) setAmountStr(draft.amount.toString());
 }
 }, []);

 useEffect(() => {
 if (formData.monthlySavingPlan <= 0 && suggestion?.monthlyAmount) {
 setFormData(prev => ({ ...prev, monthlySavingPlan: Math.ceil(suggestion.monthlyAmount) }));
 }
 }, [suggestion?.monthlyAmount, formData.monthlySavingPlan]);

 const handleSubmit = async () => {
 if (!formData.name.trim()) { toast.error('Enter goal name'); return; }
 if (formData.targetAmount <= 0) { toast.error('Enter target amount'); return; }
 if (!formData.deadline) { toast.error('Select a target date'); return; }
 if (formData.goalType === 'group' && members.length === 0) { toast.error('Add at least one member'); return; }

 setIsSubmitting(true);
 try {
   const existingGoal = await db.goals
     .filter(g => 
       g.name.toLowerCase() === formData.name.trim().toLowerCase() &&
       !g.deletedAt
     )
     .first();

   if (existingGoal) {
     toast.error('A goal with the same name already exists.');
     setIsSubmitting(false);
     return;
   }

 await saveGoalWithBackendSync({
 name: formData.name,
 category: formData.category,
 description: formData.description,
 targetAmount: formData.targetAmount,
 currentAmount: formData.currentAmount,
 monthlySavingPlan: formData.monthlySavingPlan,
 targetDate: new Date(formData.deadline),
 isGroupGoal: formData.goalType === 'group',
 members: formData.goalType === 'group' ? members : [],
 });
 toast.success('Goal created successfully');
 refreshData();
 setCurrentPage('goals');
 } catch (error) {
 toast.error('Failed to create goal');
 } finally {
 setIsSubmitting(false);
 }
 };

 const addMember = () => {
 if (!memberInput.name || !memberInput.contactValue) { toast.error('Name and contact are required'); return; }
 setMembers(prev => [...prev, { name: memberInput.name, contactType: memberInput.contactType, contactValue: memberInput.contactValue, contribution: 0, status: 'pending' }]);
 setMemberInput({ name: '', contactType: 'email', contactValue: '' });
 };

 return (
 <div className="flex flex-col min-h-screen bg-white">

 {/* High Density Header */}
 <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-3">
 <button onClick={() => setCurrentPage('goals')} className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
 <ArrowLeft size={20} />
 </button>
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">New Saving Goal</h1>
 </div>
 
 </div>
 </header>

 {/* Main Single-Page Content Area */}
 <main className="flex-1 p-3 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 pb-32 lg:pb-5">
 
 {/* Left Column: context & types (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-3 lg:overflow-y-auto">
 
 {/* Goal Type Selector */}
 <div className="premium-glass-card p-1 flex gap-1">
 {[
 { id: 'individual', label: 'Individual', icon: <Target size={12} /> },
 { id: 'group', label: 'Group Goal', icon: <Users size={12} /> }
 ].map(m => (
 <button key={m.id} onClick={() => setFormData(prev => ({ ...prev, goalType: m.id as any }))} className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-black text-[8px] uppercase tracking-wider transition-all", formData.goalType === m.id ?"bg-white text-slate-900 shadow-sm" :"text-slate-400 hover:text-slate-600")}>
 {m.icon} {m.label}
 </button>
 ))}
 </div>

 <div className="premium-glass-card p-4 space-y-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Goal Name</label>
 <div className="relative">
 <Target className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs" placeholder="e.g. New Macbook Pro" />
 </div>
 </div>

 <div className="space-y-3">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Category</label>
 <GoalCategoryGrid selectedCategory={formData.category} onSelect={cat => setFormData(prev => ({ ...prev, category: cat }))} />
 </div>

 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Description / Note</label>
 <div className="relative">
 <AlignLeft className="absolute left-2.5 top-3 text-slate-300" size={14} />
 <textarea value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs min-h-[60px] resize-none" placeholder="What is this for?" />
 </div>
 </div>

 {/* Group Members Section */}
 {formData.goalType === 'group' && (
 <div className="space-y-3 pt-3 border-t border-slate-100 animate-in slide-in-from-top-2 duration-300">
 <div className="flex items-center justify-between">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Collaborators</label>
 <span className="text-[8px] font-bold text-indigo-500 uppercase">Invite link active</span>
 </div>
 
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl">
 <input type="text" value={memberInput.name} onChange={e => setMemberInput(prev => ({ ...prev, name: e.target.value }))} className="bg-white border-none rounded-lg px-3 py-2 text-xs font-bold" placeholder="Friend Name" />
 <div className="flex gap-2">
 <select value={memberInput.contactType} onChange={e => setMemberInput(prev => ({ ...prev, contactType: e.target.value as any }))} className="bg-white border-none rounded-lg px-2 text-[10px] font-black uppercase">
 <option value="email">Email</option>
 <option value="phone">Phone</option>
 </select>
 <input type="text" value={memberInput.contactValue} onChange={e => setMemberInput(prev => ({ ...prev, contactValue: e.target.value }))} className="flex-1 bg-white border-none rounded-lg px-3 py-2 text-xs font-bold" placeholder="Contact..." />
 </div>
 <button onClick={addMember} className="w-full py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">+ Add</button>
 </div>

 <div className="space-y-2 max-h-[120px] overflow-y-auto no-scrollbar">
 {members.map((m, idx) => (
 <div key={idx} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-xl">
 <div className="flex items-center gap-2">
 <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-[10px] font-black text-indigo-500">{m.name[0]}</div>
 <span className="text-[10px] font-bold text-slate-700">{m.name}</span>
 </div>
 <button onClick={() => setMembers(prev => prev.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>
 </div>
 ))}
 {members.length === 0 && <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-100 rounded-xl text-[9px] font-black text-slate-300 uppercase">No members added</div>}
 </div>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Right Column: Financials (lg:col-5) */}
 <div className="lg:col-span-5 flex flex-col gap-3 lg:overflow-y-auto">
 
 {/* Target Amount Display */}
 <div className="premium-glass-card p-5 flex flex-col items-center bg-white relative overflow-hidden">
 <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full" />
 <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2">Target Goal Amount</span>
 <div className="flex items-center gap-3">
 <span className="text-2xl font-black text-slate-200 uppercase">{currency}</span>
 <input
 type="number"
 name="targetAmount"
 value={amountStr}
 onChange={e => { setAmountStr(e.target.value); setFormData(prev => ({ ...prev, targetAmount: parseFloat(e.target.value) || 0 })); }}
 className="bg-transparent text-4xl font-black text-slate-900 outline-none w-[160px] text-center tracking-tighter"
 placeholder="0.00"
 />
 </div>
 </div>

 <div className="premium-glass-card p-4 space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Initial Deposit</label>
 <div className="relative">
 <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-[10px] font-black">{currency}</span>
 <input type="number" value={initialAmtStr} onChange={e => { setInitialAmtStr(e.target.value); setFormData(prev => ({ ...prev, currentAmount: parseFloat(e.target.value) || 0 })); }} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-7 pr-3 font-bold text-xs" placeholder="0" />
 </div>
 </div>
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Target Date</label>
 <div className="relative">
 <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input type="date" value={formData.deadline} onChange={e => setFormData(prev => ({ ...prev, deadline: e.target.value }))} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs" />
 </div>
 </div>
 </div>

 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Monthly Plan</label>
 <div className="flex gap-3">
 <div className="flex-1 relative">
 <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-[10px] font-black">{currency}</span>
 <input type="number" value={formData.monthlySavingPlan} onChange={e => setFormData(prev => ({ ...prev, monthlySavingPlan: parseFloat(e.target.value) || 0 }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-7 pr-3 font-bold text-xs" />
 </div>
 {suggestion && (
 <button onClick={() => setFormData(prev => ({ ...prev, monthlySavingPlan: Math.ceil(suggestion.monthlyAmount) }))} className="px-3 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-indigo-100 transition-colors">
 Use Smart Suggest: {formatCurrency(suggestion.monthlyAmount, currency)}
 </button>
 )}
 </div>
 </div>

 {suggestion && (
 <div className="p-3 bg-slate-900 rounded-xl text-white flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><Sparkles size={16} className="text-indigo-400" /></div>
 <div>
 <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Timeline Forecast</p>
 <p className="text-[10px] font-bold">Reach your goal in {suggestion.months} months with this plan.</p>
 </div>
 </div>
 )}
 </div>

 {/* Goal Summary Display */}
 <div className="mt-auto p-4 bg-indigo-600 rounded-2xl text-white flex items-center justify-between shadow-xl shadow-indigo-100">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><Target size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-white/60 uppercase">Goal Summary</p>
 <p className="text-[10px] font-black truncate max-w-[120px]">{formData.name || 'New Goal'}</p>
 </div>
 </div>
 <div className="text-right">
 <p className="text-[8px] font-black text-white/60 uppercase">Target</p>
 <p className="text-lg font-black tracking-tighter">{currency} {formData.targetAmount.toLocaleString()}</p>
 </div>
 </div>
 </div>
 </main>
 <FloatingSaveBar
   onSave={handleSubmit}
   onDiscard={() => setCurrentPage('goals')}
   isSaving={isSubmitting}
   saveLabel="Create Goal"
 />
 </div>
 );
};
