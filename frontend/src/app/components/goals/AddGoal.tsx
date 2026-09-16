
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
  X, CalendarDays, Search
} from 'lucide-react';
import { cn, softHyphenate } from '@/lib/utils';
import { toast } from 'sonner';
import { takeVoiceDraft, VOICE_GOAL_DRAFT_KEY, type VoiceGoalDraft } from '@/lib/voiceDrafts';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { decodeQuotedPrintable, sanitizeContactName } from '@/services/contactsService';

import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useSubmitLock } from '@/hooks/useSubmitLock';

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

  const itemsPerPage = 12;
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
            className="w-full shrink-0 snap-align-start grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-2.5"
          >
            {pageItems.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => onSelect(cat.key)}
                data-testid={`goals-create-category-${cat.key}-button`}
                className="flex flex-col items-center gap-1.5 p-1.5 rounded-2xl transition-all cursor-pointer group hover:scale-105 active:scale-95"
              >
                <div className={cn(
                  "w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all shadow-xs",
                  selectedCategory === cat.key
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-300 ring-4 ring-indigo-100"
                    : "bg-slate-50 group-hover:bg-slate-100 border border-slate-200/60"
                )}>
                  {getCategoryCartoonIcon(cat.key, 26)}
                </div>
                <span className={cn(
                  "text-2xs font-bold text-center leading-tight line-clamp-2 break-words hyphens-auto w-full",
                  selectedCategory === cat.key ? "text-indigo-600 font-extrabold" : "text-slate-500 group-hover:text-slate-700"
                )}>
                  {softHyphenate(cat.label)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {/* Indicator Dots */}
      {pages.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5">
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
                "h-1.5 rounded-full transition-all duration-300",
                activePage === idx ? "bg-indigo-600 w-4" : "bg-slate-300 hover:bg-slate-400 w-1.5"
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
 const guardSubmit = useSubmitLock();
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
 const [friendSearch, setFriendSearch] = useState('');

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

  const handleSubmit = guardSubmit(async () => {
    if (!formData.name.trim()) { toast.error('Enter goal name'); return; }
    if (formData.targetAmount <= 0) { toast.error('Enter target amount'); return; }
    if (!formData.deadline) { toast.error('Select a target date'); return; }
    if (formData.goalType === 'group') {
      if (members.length === 0) { toast.error('Add at least one collaborator'); return; }
      const contactsSet = new Set<string>();
      for (const m of members) {
        if (m.contactValue && m.contactValue.trim()) {
          const c = m.contactType === 'phone' ? m.contactValue.replace(/\D/g, '') : m.contactValue.trim().toLowerCase();
          if (contactsSet.has(c)) {
            toast.error(`Duplicate collaborator contact: "${m.contactValue}". All collaborators must have unique contacts.`);
            return;
          }
          contactsSet.add(c);
        }
      }
    }

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
  });

  const addMember = () => {
    const trimmedName = memberInput.name.trim();
    const trimmedContact = memberInput.contactValue.trim();

    if (!trimmedName) {
      toast.error('Collaborator name is required');
      return;
    }
    if (!trimmedContact) {
      toast.error('Collaborator email or phone is required');
      return;
    }

    // Email syntax validation
    if (memberInput.contactType === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedContact)) {
        toast.error('Please enter a valid email address');
        return;
      }
    }

    // Phone syntax validation
    if (memberInput.contactType === 'phone') {
      const digitsOnly = trimmedContact.replace(/\D/g, '');
      if (digitsOnly.length < 7) {
        toast.error('Please enter a valid phone number (at least 7 digits)');
        return;
      }
    }

    // Duplicate contact check (unique email & phone across collaborators - names CAN be duplicate)
    const duplicateContact = members.find(m => {
      if (memberInput.contactType === 'email' && m.contactType === 'email') {
        return m.contactValue.trim().toLowerCase() === trimmedContact.toLowerCase();
      }
      if (memberInput.contactType === 'phone' && m.contactType === 'phone') {
        const mDigits = m.contactValue.replace(/\D/g, '');
        const newDigits = trimmedContact.replace(/\D/g, '');
        return mDigits && newDigits && mDigits === newDigits;
      }
      return m.contactValue.trim().toLowerCase() === trimmedContact.toLowerCase();
    });

    if (duplicateContact) {
      toast.error(`"${trimmedContact}" is already added for collaborator "${duplicateContact.name}". Each collaborator must have a unique email or phone.`);
      return;
    }

    setMembers(prev => [...prev, {
      name: trimmedName,
      contactType: memberInput.contactType,
      contactValue: trimmedContact,
      contribution: 0,
      status: 'pending'
    }]);
    setMemberInput({ name: '', contactType: 'email', contactValue: '' });
    setShowNewMemberInput(false);
    toast.success(`Added ${trimmedName} as collaborator`);
  };

  const handlePickFriend = (friend: typeof friends[0]) => {
    // Check if friend's email or phone is already taken by another collaborator (names CAN be duplicate)
    if (friend.email) {
      const emailDup = members.find(m => m.contactType === 'email' && m.contactValue.trim().toLowerCase() === friend.email!.trim().toLowerCase());
      if (emailDup) {
        toast.error(`Email ${friend.email} is already used by ${emailDup.name}.`);
        return;
      }
    }
    if (friend.phone) {
      const pDigits = friend.phone.replace(/\D/g, '');
      const phoneDup = members.find(m => m.contactType === 'phone' && m.contactValue.replace(/\D/g, '') === pDigits);
      if (phoneDup) {
        toast.error(`Phone ${friend.phone} is already used by ${phoneDup.name}.`);
        return;
      }
    }

    if (!friend.email && !friend.phone) {
      const alreadyAdded = members.some(m => m.name.trim().toLowerCase() === friend.name.trim().toLowerCase() && !m.contactValue);
      if (alreadyAdded) {
        toast.error(`"${friend.name}" is already added.`);
        return;
      }
    }

    if (friend.email) {
      setMembers(prev => [...prev, {
        name: friend.name,
        contactType: 'email',
        contactValue: friend.email!,
        contribution: 0,
        status: 'pending'
      }]);
      toast.success(`Added ${friend.name} (${friend.email})`);
      setShowFriendPicker(false);
    } else if (friend.phone) {
      setMembers(prev => [...prev, {
        name: friend.name,
        contactType: 'phone',
        contactValue: friend.phone!,
        contribution: 0,
        status: 'pending'
      }]);
      toast.success(`Added ${friend.name} (${friend.phone})`);
      setShowFriendPicker(false);
    } else {
      setMemberInput({
        name: friend.name,
        contactType: 'email',
        contactValue: ''
      });
      setShowNewMemberInput(true);
      setShowFriendPicker(false);
      toast.info(`Please enter an email or phone for ${friend.name}`);
    }
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
  <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Goal Preview</p>
  <p className="text-sm font-bold truncate max-w-[160px] sm:max-w-[200px] text-white">{formData.name || 'New Goal'}</p>
  </div>
  </div>
  <div className="text-right">
  <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Target</p>
  <p className="text-xl sm:text-2xl font-black tracking-tight text-white">{currency} {formData.targetAmount.toLocaleString()}</p>
  </div>
  </div>

  <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4">
  <div className="space-y-1.5">
  <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Goal Name</label>
  <div className="relative">
  <Target className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
  <input id="goal-name" name="name" aria-label="Goal name" type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} data-testid="goals-create-name-input" className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-3.5 font-semibold text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 outline-none transition-all" placeholder="e.g. New Macbook Pro" />
  </div>
  </div>

  <div className="space-y-2">
  <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Category</label>
  <GoalCategoryGrid selectedCategory={formData.category} onSelect={cat => setFormData(prev => ({ ...prev, category: cat }))} />
  </div>

  <div className="space-y-1.5">
  <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Description / Note</label>
  <div className="relative">
  <AlignLeft className="absolute left-3.5 top-3 text-slate-400" size={16} />
  <textarea id="goal-description" name="description" aria-label="Goal description or note" value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} data-testid="goals-create-description-textarea" className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-3 pl-10 font-medium text-slate-900 text-xs sm:text-sm min-h-[72px] resize-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 outline-none transition-all" placeholder="What is this goal for?" />
  </div>
  </div>
  </div>

  {/* Group Members Section */}
  {formData.goalType === 'group' && (
  <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] space-y-4 animate-in slide-in-from-bottom-2 duration-300">
  <div className="flex items-center justify-between">
  <label className="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-wider">
  COLLABORATORS ({members.length})
  </label>
  
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => {
        if (friends.length === 0) {
          toast.info('No friends in your contacts list yet. Opening Add Friends to import contacts.');
          setCurrentPage('add-friends');
        } else {
          setShowFriendPicker(p => !p);
          setShowNewMemberInput(false);
        }
      }}
      data-testid="goals-create-friends-picker-button"
      className={cn(
        "flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider transition-all cursor-pointer",
        showFriendPicker
          ? "bg-violet-600 text-white shadow-xs"
          : "text-violet-700 bg-violet-50 hover:bg-violet-100"
      )}
    >
      <Users size={12} /> {friends.length > 0 ? 'Friends' : 'Import Contacts'}
    </button>
    <button
      type="button"
      onClick={() => { setShowNewMemberInput(p => !p); setShowFriendPicker(false); }}
      data-testid="goals-create-add-member-toggle-button"
      className={cn(
        "flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider transition-all cursor-pointer",
        showNewMemberInput
          ? "bg-[#4F46E5] text-white shadow-xs"
          : "text-[#4F46E5] bg-[#EEF2FF] hover:bg-[#E0E7FF]"
      )}
    >
      <UserPlus size={13} /> NEW
    </button>
  </div>
  </div>

  {/* Friends quick-add / Selection Panel */}
  {showFriendPicker && friends.length > 0 && (
  <div className="p-3.5 bg-violet-50/70 rounded-2xl border border-violet-100 animate-in zoom-in-95 duration-200 space-y-2.5">
  <div className="flex items-center justify-between">
    <p className="text-xs font-bold text-violet-600 uppercase tracking-wider">Tap friend to add uniquely</p>
    <button
      type="button"
      onClick={() => {
        setShowFriendPicker(false);
        setFriendSearch('');
      }}
      className="text-violet-400 hover:text-violet-600 text-xs font-semibold cursor-pointer"
    >
      Close
    </button>
  </div>

  {/* Search box for filtering contacts */}
  <div className="relative">
    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400 pointer-events-none" />
    <input
      type="text"
      value={friendSearch}
      onChange={(e) => setFriendSearch(e.target.value)}
      placeholder="Search contact by name or number..."
      data-testid="goals-create-friend-search-input"
      className="w-full pl-8 pr-7 py-1.5 bg-white border border-violet-200/80 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
    />
    {friendSearch && (
      <button
        type="button"
        onClick={() => setFriendSearch('')}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
      >
        <X size={12} />
      </button>
    )}
  </div>

  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
  {(() => {
    const query = friendSearch.toLowerCase().trim();
    const queryDigits = friendSearch.replace(/\D/g, '');
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
          No contacts match "{friendSearch}"
        </p>
      );
    }

    return filtered.map(f => {
      const cleanName = sanitizeContactName(f.name, { email: f.email, phone: f.phone });
      const isAdded = members.some(m =>
        (f.email && m.contactType === 'email' && m.contactValue.trim().toLowerCase() === f.email.trim().toLowerCase()) ||
        (f.phone && m.contactType === 'phone' && m.contactValue.replace(/\D/g, '') === f.phone.replace(/\D/g, '')) ||
        (!f.email && !f.phone && m.name.trim().toLowerCase() === cleanName.trim().toLowerCase() && !m.contactValue)
      );
      return (
        <button
          key={f.id}
          type="button"
          disabled={isAdded}
          onClick={() => handlePickFriend({ ...f, name: cleanName })}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer",
            isAdded
              ? "bg-indigo-100/80 border-indigo-200 text-indigo-800 opacity-60 cursor-not-allowed"
              : "bg-white border-violet-200/80 text-violet-800 hover:bg-violet-600 hover:text-white hover:border-violet-600 shadow-2xs active:scale-95"
          )}
        >
          <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-2xs font-black uppercase">
            {cleanName[0] || '?'}
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

  {/* New Person Input */}
  {showNewMemberInput && (
  <div className="flex flex-col gap-2.5 p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 animate-in slide-in-from-top-2 duration-200">
  <div className="flex items-center justify-between">
    <span className="text-xs font-bold text-slate-700">Add Unique Collaborator</span>
    <button
      type="button"
      onClick={() => setShowNewMemberInput(false)}
      className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
    >
      Cancel
    </button>
  </div>
  <div className="flex flex-col sm:flex-row gap-2">
  <input
  id="goal-member-name" name="memberName" aria-label="Member name"
  type="text"
  value={memberInput.name}
  onChange={e => setMemberInput(prev => ({ ...prev, name: e.target.value }))}
  data-testid="goals-create-member-name-input"
  className="flex-1 h-10 sm:h-11 bg-white border border-slate-200/80 rounded-xl px-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
  placeholder="Friend Name"
  autoFocus
  />
  <select
  value={memberInput.contactType}
  onChange={e => setMemberInput(prev => ({ ...prev, contactType: e.target.value as any }))}
  aria-label="Contact type"
  data-testid="goals-create-member-contact-type"
  className="h-10 sm:h-11 bg-white border border-slate-200/80 rounded-xl px-3 text-xs font-bold text-slate-700 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
  >
  <option data-testid="add-goal-email" value="email">Email</option>
  <option data-testid="add-goal-phone" value="phone">Phone</option>
  </select>
  </div>
  <div className="flex gap-2">
  <input
  id="goal-member-contact" name="memberContact" aria-label="Member contact (email or phone)"
  type={memberInput.contactType === 'email' ? 'email' : 'tel'}
  value={memberInput.contactValue}
  onChange={e => setMemberInput(prev => ({ ...prev, contactValue: e.target.value }))}
  data-testid="goals-create-member-contact-input"
  className="flex-1 h-10 sm:h-11 bg-white border border-slate-200/80 rounded-xl px-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
  placeholder={memberInput.contactType === 'email' ? 'Unique email (e.g. friend@gmail.com)' : 'Unique phone number'}
  />
  <button
  type="button"
  onClick={addMember}
  data-testid="goals-create-member-add-button"
  className="px-4 h-10 sm:h-11 bg-[#4F46E5] hover:bg-[#4338CA] active:scale-95 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs shrink-0 flex items-center gap-1"
  >
  <Plus size={14} /> Add
  </button>
  </div>
  <p className="text-xs text-slate-400 flex items-center gap-1">
    <Info size={12} className="shrink-0 text-slate-400" />
    Duplicate emails or phone numbers are not allowed.
  </p>
  </div>
  )}

  {/* Participant List Display — Matches Reference Image 1 */}
  <div className="space-y-2.5">
  {members.length === 0 ? (
  <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
    <Users className="w-8 h-8 mx-auto text-slate-300 mb-1.5" />
    <p className="text-xs font-bold text-slate-500">No collaborators added yet</p>
    <p className="text-xs text-slate-400">Add friends or new members with unique contact details</p>
  </div>
  ) : (
  <div className="flex flex-col gap-2.5">
  {members.map((m, idx) => {
  const initial = (m.name[0] || '?').toUpperCase();
  return (
  <div
    key={idx}
    className="rounded-full bg-slate-50/80 hover:bg-slate-50 border border-slate-100/90 px-4 py-3 flex items-center justify-between transition-all group"
  >
  <div className="flex items-center gap-3 min-w-0">
  <div className="w-10 h-10 rounded-full bg-[#E0E7FF] text-[#4F46E5] font-black text-sm flex items-center justify-center shrink-0">
  {initial}
  </div>
  <div className="flex flex-col min-w-0">
  <span className="text-sm font-bold text-slate-900 leading-tight truncate">{m.name}</span>
  <span className="text-xs font-medium text-slate-500 leading-tight truncate mt-0.5">{m.contactValue}</span>
  </div>
  </div>
  <button
  type="button"
  onClick={() => setMembers(prev => prev.filter((_, i) => i !== idx))}
  title={`Remove ${m.name}`}
  aria-label={`Remove ${m.name}`}
  data-testid={`goals-create-member-remove-${idx}`}
  className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
  >
  <Trash2 size={15} />
  </button>
  </div>
  );
  })}
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
    <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-3">Target Goal Amount</span>

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
    <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Initial Deposit</label>
    <div className="flex items-center w-full bg-slate-50 border border-slate-200/80 rounded-xl h-10 sm:h-11 px-3.5 focus-within:ring-2 focus-within:ring-purple-500/20 focus-within:border-purple-400 transition-all">
    <span className="text-slate-400 text-xs font-bold select-none mr-1.5 shrink-0">{currency}</span>
    <input id="goal-initial-deposit" name="initialDeposit" aria-label="Initial deposit" type="number" value={initialAmtStr} onChange={e => { setInitialAmtStr(e.target.value); setFormData(prev => ({ ...prev, currentAmount: parseFloat(e.target.value) || 0 })); }} data-testid="goals-create-initial-deposit-input" className="flex-1 bg-transparent border-none p-0 font-semibold text-xs sm:text-sm focus:ring-0 text-slate-900 placeholder:text-slate-400 outline-none" placeholder="0" />
    </div>
    </div>
    <div className="space-y-1.5">
    <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Target Date</label>
    <div data-testid="goals-create-target-date-container" className="relative group cursor-pointer" onClick={(e) => {
    const input = e.currentTarget.querySelector('input');
    if (input) (input as any).showPicker();
    }}>
    <CalendarDays className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-purple-600 transition-colors z-10" size={15} />
    <div className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-3.5 font-semibold text-xs sm:text-sm text-slate-900 group-hover:bg-slate-100/60 transition-all flex items-center h-10 sm:h-11">
    {(() => {
    if (!formData.deadline) return <span className="text-slate-400 font-normal">Select target date</span>;
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
    <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Monthly Saving Plan</label>
    <div className="flex gap-2.5">
    <div className="flex-1 flex items-center bg-slate-50 border border-slate-200/80 rounded-xl h-10 sm:h-11 px-3.5 focus-within:ring-2 focus-within:ring-purple-500/20 focus-within:border-purple-400 transition-all">
    <span className="text-slate-400 text-xs font-bold select-none mr-1.5 shrink-0">{currency}</span>
    <input type="number" value={formData.monthlySavingPlan || ''} onChange={e => setFormData(prev => ({ ...prev, monthlySavingPlan: parseFloat(e.target.value) || 0 }))} aria-label="Monthly saving plan" data-testid="goals-create-monthly-plan-input" className="flex-1 bg-transparent border-none p-0 font-semibold text-xs sm:text-sm focus:ring-0 text-slate-900 placeholder:text-slate-400 outline-none" placeholder="0" />
    </div>
   {suggestion && (
   <button type="button" onClick={() => setFormData(prev => ({ ...prev, monthlySavingPlan: Math.ceil(suggestion.monthlyAmount) }))} data-testid="goals-create-suggest-button" className="px-3.5 bg-purple-50 text-purple-700 border border-purple-200/60 rounded-xl text-2xs font-bold uppercase tracking-wider hover:bg-purple-100 transition-colors shrink-0 cursor-pointer h-10 sm:h-11 flex items-center">
   Auto: {formatCurrency(suggestion.monthlyAmount, currency)}
   </button>
   )}
   </div>
   </div>

   {suggestion && (
   <div className="p-3.5 bg-slate-900 rounded-2xl text-white flex items-center gap-3">
   <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Sparkles size={16} className="text-purple-400" /></div>
   <div>
   <p className="text-2xs font-bold text-white/60 uppercase tracking-wider">Plan Estimate</p>
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
