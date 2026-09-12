
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
 UserPlus, Mail, Phone, Link as LinkIcon, Sparkles, Store, AlignLeft, Info, Plus, Loader2,
 X, CalendarDays
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { takeVoiceDraft, VOICE_GOAL_DRAFT_KEY, type VoiceGoalDraft } from '@/lib/voiceDrafts';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';

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
                data-testid={`goals-create-category-${cat.key}-button`}
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
              data-testid={`goals-create-category-page-${idx}-dot`}
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
 const [showFriendPicker, setShowFriendPicker] = useState(false);
 const [showNewMemberInput, setShowNewMemberInput] = useState(false);

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
 setShowNewMemberInput(false);
 };

 return (
    <CenteredLayout enablePullToRefresh={false} className="pb-32">
      <div className="space-y-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentPage('goals')}
              title="Back to Goals"
              aria-label="Back to Goals"
              data-testid="goals-create-back-button"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">
              New Saving Goal
            </h1>
          </div>
        </div>

        {/* Main Single-Page Content Area */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 w-full pb-48 no-scrollbar">
 
  {/* Left Column: context & types (lg:col-7) */}
  <div className="lg:col-span-7 flex flex-col gap-4 lg:overflow-y-auto">
 
  {/* Goal Type Selector */}
  <div className="p-1 bg-slate-100/90 rounded-full flex gap-1 border border-slate-200/60 shadow-2xs">
  {[
  { id: 'individual', label: 'Individual', icon: <Target size={14} /> },
  { id: 'group', label: 'Group Goal', icon: <Users size={14} /> }
  ].map(m => (
  <button key={m.id} onClick={() => setFormData(prev => ({ ...prev, goalType: m.id as any }))} data-testid={`goals-create-type-${m.id}-button`} className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all cursor-pointer", formData.goalType === m.id ?"bg-[#18181B] text-white shadow-xs" :"text-slate-500 hover:text-slate-800")}>
  {m.icon} {m.label}
  </button>
  ))}
  </div>

  {/* Goal Summary Display */}
  <div className="p-5 sm:p-6 bg-gradient-to-br from-[#18181B] via-slate-900 to-indigo-950 rounded-[28px] sm:rounded-[32px] text-white flex items-center justify-between shadow-xl border border-indigo-500/20">
  <div className="flex items-center gap-3">
  <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm"><Target size={18} className="text-purple-300" /></div>
  <div>
  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Goal Preview</p>
  <p className="text-sm font-bold truncate max-w-[160px] sm:max-w-[200px] text-white">{formData.name || 'New Goal'}</p>
  </div>
  </div>
  <div className="text-right">
  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Target</p>
  <p className="text-xl sm:text-2xl font-black tracking-tight text-white">{currency} {formData.targetAmount.toLocaleString()}</p>
  </div>
  </div>

  <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4">
  <div className="space-y-1.5">
  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Goal Name</label>
  <div className="relative">
  <Target className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
  <input id="goal-name" name="name" aria-label="Goal name" type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} data-testid="goals-create-name-input" className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3.5 font-bold text-slate-900 text-sm focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 outline-none transition-all" placeholder="e.g. New Macbook Pro" />
  </div>
  </div>

  <div className="space-y-2">
  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</label>
  <GoalCategoryGrid selectedCategory={formData.category} onSelect={cat => setFormData(prev => ({ ...prev, category: cat }))} />
  </div>

  <div className="space-y-1.5">
  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description / Note</label>
  <div className="relative">
  <AlignLeft className="absolute left-3.5 top-3 text-slate-400" size={16} />
  <textarea id="goal-description" name="description" aria-label="Goal description or note" value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} data-testid="goals-create-description-textarea" className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3.5 font-medium text-slate-900 text-sm min-h-[72px] resize-none focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 outline-none transition-all" placeholder="What is this goal for?" />
  </div>
  </div>
  </div>

  {/* Group Members Section */}
  {formData.goalType === 'group' && (
  <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4 animate-in slide-in-from-bottom-2 duration-300">
  <div className="flex items-center justify-between">
  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
  Collaborators ({members.length})
  </label>
  
  <div className="flex gap-2">
  {friends.length > 0 && (
  <button
  type="button"
  onClick={() => { setShowFriendPicker(p => !p); setShowNewMemberInput(false); }}
  data-testid="goals-create-friends-picker-button"
  className="flex items-center gap-1 text-[9px] font-black text-violet-600 bg-violet-50 px-2.5 py-1.5 rounded-lg uppercase tracking-wide transition-all"
  >
  <Users size={11} /> Friends
  </button>
  )}
  <button
  type="button"
  onClick={() => { setShowNewMemberInput(p => !p); setShowFriendPicker(false); }}
  data-testid="goals-create-add-member-toggle-button"
  className="flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg uppercase tracking-wide transition-all"
  >
  <UserPlus size={11} /> New
  </button>
  </div>
  </div>

  {/* Friends quick-add / Selection Panel */}
  {showFriendPicker && friends.length > 0 && (
  <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-100 animate-in zoom-in-95 duration-200">
  <p className="text-[8px] font-black text-violet-400 uppercase tracking-widest mb-2">Tap to select</p>
  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
  {friends.map(f => {
  const isSelected = members.some(m => m.name.toLowerCase() === f.name.toLowerCase());
  return (
  <button
  key={f.id}
  type="button"
  onClick={() => {
  if (!isSelected) {
  setMemberInput(prev => ({ ...prev, name: f.name }));
  setShowNewMemberInput(true);
  setShowFriendPicker(false);
  }
  }}
  className={cn(
  "px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all border",
  isSelected
  ?"bg-indigo-600 border-indigo-600 text-white shadow-md"
  :"bg-white border-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white"
  )}
  >
  {f.name}
  </button>
  );
  })}
  </div>
  </div>
  )}

  {/* New Person Input */}
  {showNewMemberInput && (
  <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl animate-in slide-in-from-top-2">
  <div className="flex gap-2">
  <input
  id="goal-member-name" name="memberName" aria-label="Member name"
  type="text"
  value={memberInput.name}
  onChange={e => setMemberInput(prev => ({ ...prev, name: e.target.value }))}
  data-testid="goals-create-member-name-input"
  className="flex-1 bg-white border-none rounded-lg px-3 py-2 text-xs font-bold"
  placeholder="Friend Name"
  autoFocus
  />
  <select
  value={memberInput.contactType}
  onChange={e => setMemberInput(prev => ({ ...prev, contactType: e.target.value as any }))}
  aria-label="Contact type"
  data-testid="goals-create-member-contact-type"
  className="bg-white border-none rounded-lg px-2 text-[10px] font-black uppercase"
  >
  <option data-testid="add-goal-email" value="email">Email</option>
  <option data-testid="add-goal-phone" value="phone">Phone</option>
  </select>
  </div>
  <div className="flex gap-2">
  <input
  id="goal-member-contact" name="memberContact" aria-label="Member contact (email or phone)"
  type="text"
  value={memberInput.contactValue}
  onChange={e => setMemberInput(prev => ({ ...prev, contactValue: e.target.value }))}
  data-testid="goals-create-member-contact-input"
  className="flex-1 bg-white border-none rounded-lg px-3 py-2 text-xs font-bold"
  placeholder="Contact (Email or Phone)..."
  />
  <button
  type="button"
  onClick={addMember}
  data-testid="goals-create-member-add-button"
  className="px-3 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest"
  >
  Add
  </button>
  </div>
  </div>
  )}

  {/* Participant List Display */}
  <div className="space-y-2">
  {members.length === 0 ? (
  <p className="text-xs font-bold text-slate-400 text-center py-6">No participants added</p>
  ) : (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto no-scrollbar">
  {members.map((m, idx) => (
  <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-xl group transition-all">
  <div className="flex items-center gap-2">
  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 uppercase">
  {m.name[0] || '?'}
  </div>
  <div className="flex flex-col">
  <span className="text-xs font-bold text-slate-800 leading-tight">{m.name}</span>
  <span className="text-[8px] font-medium text-slate-400 leading-none">{m.contactValue}</span>
  </div>
  </div>
  <button
  type="button"
  onClick={() => setMembers(prev => prev.filter((_, i) => i !== idx))}
  title="Remove member"
  data-testid={`goals-create-member-remove-${idx}`}
  className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
  >
  <Trash2 size={12} strokeWidth={3} />
  </button>
  </div>
  ))}
  </div>
  )}
  </div>
  </div>
  )}
  </div>

  {/* Right Column: Financials (lg:col-5) */}
  <div className="lg:col-span-5 flex flex-col gap-4 lg:overflow-y-auto">
  
   {/* Target Amount Display - Premium & High Density */}
   <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-7 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden flex flex-col items-center">
   <div className="absolute -top-24 -left-24 w-64 h-64 bg-purple-500/5 blur-[80px] rounded-full pointer-events-none z-0" />
   <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none z-0" />

   <div className="relative z-10 flex flex-col items-center w-full">
   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Target Goal Amount</span>

   <div className="flex items-center justify-center w-full my-2 sm:my-3 gap-2 overflow-hidden px-2">
   <span className="text-2xl sm:text-4xl font-extrabold text-slate-300 select-none tracking-tight shrink-0">{currency}</span>
   <input
   id="goal-target-amount"
   aria-label="Target amount"
   type="number"
   name="targetAmount"
   value={amountStr}
   onChange={e => { setAmountStr(e.target.value); setFormData(prev => ({ ...prev, targetAmount: parseFloat(e.target.value) || 0 })); }}
   data-testid="goals-create-target-amount-input"
   className="bg-transparent text-4xl sm:text-5xl font-black text-slate-900 outline-none w-full text-center tracking-tighter placeholder:text-slate-200 p-0 m-0"
   placeholder="0"
   />
   </div>

   {/* Quick Preset Buttons */}
   <div className="flex flex-wrap items-center justify-center gap-2 mt-3 w-full">
   {[1000, 5000, 10000, 25000].map(amt => (
   <button
   key={amt}
   type="button"
   onClick={() => {
   const next = (formData.targetAmount || 0) + amt;
   setAmountStr(String(next));
   setFormData(prev => ({ ...prev, targetAmount: next }));
   }}
   data-testid={`goals-create-preset-${amt}-button`}
   className="px-4 py-2 bg-slate-50 border border-slate-200/80 rounded-full text-xs font-bold text-slate-700 hover:bg-[#18181B] hover:text-white hover:border-[#18181B] transition-all active:scale-95 cursor-pointer shadow-2xs"
   >
   +{currency}{amt.toLocaleString()}
   </button>
   ))}
   </div>
   </div>
   </div>

   <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4">
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
   <div className="space-y-1.5">
   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Initial Deposit</label>
   <div className="flex items-center w-full bg-slate-50 border border-slate-200/80 rounded-2xl h-11 px-3.5 focus-within:ring-2 focus-within:ring-purple-500/20 focus-within:border-purple-400 transition-all">
   <span className="text-slate-400 text-xs font-bold select-none mr-1.5 shrink-0">{currency}</span>
   <input id="goal-initial-deposit" name="initialDeposit" aria-label="Initial deposit" type="number" value={initialAmtStr} onChange={e => { setInitialAmtStr(e.target.value); setFormData(prev => ({ ...prev, currentAmount: parseFloat(e.target.value) || 0 })); }} data-testid="goals-create-initial-deposit-input" className="flex-1 bg-transparent border-none p-0 font-bold text-xs focus:ring-0 text-slate-900 placeholder:text-slate-300 outline-none" placeholder="0" />
   </div>
   </div>
   <div className="space-y-1.5">
   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Date</label>
   <div data-testid="goals-create-target-date-container" className="relative group cursor-pointer" onClick={(e) => {
   const input = e.currentTarget.querySelector('input');
   if (input) (input as any).showPicker();
   }}>
   <CalendarDays className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-purple-600 transition-colors z-10" size={15} />
   <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl pl-10 pr-3.5 font-bold text-xs text-slate-900 group-hover:bg-slate-100/60 transition-all flex items-center h-11">
   {(() => {
   if (!formData.deadline) return <span className="text-slate-400 font-medium">Select target date</span>;
   const date = new Date(formData.deadline);
   const day = String(date.getDate()).padStart(2, '0');
   const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
   return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
   })()}
   </div>
   <input data-testid="goals-create-target-date-input"
   type="date"
   value={formData.deadline}
   onChange={e => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
   aria-label="Target date"
   className="absolute inset-0 opacity-0 cursor-pointer z-20"
   />
   </div>
   </div>
  </div>

   <div className="space-y-1.5">
   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Monthly Saving Plan</label>
   <div className="flex gap-2.5">
   <div className="flex-1 flex items-center bg-slate-50 border border-slate-200/80 rounded-2xl h-11 px-3.5 focus-within:ring-2 focus-within:ring-purple-500/20 focus-within:border-purple-400 transition-all">
   <span className="text-slate-400 text-xs font-bold select-none mr-1.5 shrink-0">{currency}</span>
   <input type="number" value={formData.monthlySavingPlan || ''} onChange={e => setFormData(prev => ({ ...prev, monthlySavingPlan: parseFloat(e.target.value) || 0 }))} aria-label="Monthly saving plan" data-testid="goals-create-monthly-plan-input" className="flex-1 bg-transparent border-none p-0 font-bold text-xs focus:ring-0 text-slate-900 placeholder:text-slate-300 outline-none" placeholder="0" />
   </div>
  {suggestion && (
  <button type="button" onClick={() => setFormData(prev => ({ ...prev, monthlySavingPlan: Math.ceil(suggestion.monthlyAmount) }))} data-testid="goals-create-suggest-button" className="px-3.5 bg-purple-50 text-purple-700 border border-purple-200/60 rounded-2xl text-[10px] font-bold uppercase tracking-wider hover:bg-purple-100 transition-colors shrink-0 cursor-pointer">
  Auto: {formatCurrency(suggestion.monthlyAmount, currency)}
  </button>
  )}
  </div>
  </div>

  {suggestion && (
  <div className="p-3.5 bg-slate-900 rounded-2xl text-white flex items-center gap-3">
  <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Sparkles size={16} className="text-purple-400" /></div>
  <div>
  <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Plan Estimate</p>
  <p className="text-xs font-semibold text-slate-200">Achieve your goal in <span className="font-bold text-white">{suggestion.months} months</span> with this plan.</p>
  </div>
  </div>
  )}
  </div>
  </div>
  </main>

  <FloatingSaveBar
    onSave={handleSubmit}
    onDiscard={() => setCurrentPage('goals')}
    isSaving={isSubmitting}
    saveLabel="Create Goal"
    saveTestId="goals-create-save-button"
    discardTestId="goals-create-discard-button"
  />
      </div>
    </CenteredLayout>
  );
};
