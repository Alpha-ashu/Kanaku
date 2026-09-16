
import React, { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { Users, UserPlus, X, Check, ArrowLeft, Loader2, Calculator, Tag, AlignLeft, Calendar, Info, Sparkles, Trash2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { decodeQuotedPrintable, sanitizeContactName } from '@/services/contactsService';

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

interface GroupParticipantItem {
  id: string;
  name: string;
  friendId?: number;
  email?: string;
  phone?: string;
}

const createParticipantItem = (seed: Partial<GroupParticipantItem> = {}): GroupParticipantItem => ({
  id: Math.random().toString(36).slice(2, 9),
  name: '',
  ...seed,
});

export const AddGroup: React.FC = () => {
  const { setCurrentPage, currency, friends, refreshData } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    participants: [createParticipantItem()] as GroupParticipantItem[],
    totalAmount: 0,
    category: 'general',
    date: new Date().toISOString().split('T')[0],
  });

  const [amountStr, setAmountStr] = useState('');

  const validParticipants = formData.participants.filter((p) => p.name.trim());
  const totalNum = formData.totalAmount;
  const perPerson = validParticipants.length > 0 ? totalNum / (validParticipants.length + 1) : totalNum;
  
  const formatCurrency = (v: number) => formatCurrencyAmount(v, currency);

  const addParticipant = () => setFormData(prev => ({
    ...prev,
    participants: [...prev.participants, createParticipantItem()]
  }));
  
  const removeParticipant = (i: number) => 
    setFormData(prev => ({ ...prev, participants: prev.participants.filter((_, idx) => idx !== i) }));
  
  const updateParticipantName = (i: number, name: string) => {
    const next = [...formData.participants];
    next[i] = { ...next[i], name };
    setFormData(prev => ({ ...prev, participants: next }));
  };

  // Save a name as a Friend in the DB if not already there (temp record)
  const saveNewFriend = async (p: GroupParticipantItem) => {
    const trimmed = p.name.trim();
    if (!trimmed) return;
    const cleanEmail = p.email?.trim().toLowerCase();
    const cleanPhone = p.phone?.replace(/\D/g, '');

    const existing = friends.find(f => {
      if (p.friendId && f.id === p.friendId) return true;
      if (cleanEmail && f.email && f.email.trim().toLowerCase() === cleanEmail) return true;
      if (cleanPhone && f.phone && f.phone.replace(/\D/g, '') === cleanPhone) return true;
      if (!cleanEmail && !cleanPhone && !f.email && !f.phone && f.name.toLowerCase() === trimmed.toLowerCase()) return true;
      return false;
    });
    if (existing) return;
    await db.friends.add({
      name: trimmed,
      email: p.email?.trim() || undefined,
      phone: p.phone?.trim() || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'pending',
    });
    refreshData();
  };

  const addFriend = (friend: typeof friends[0]) => {
    const fEmail = friend.email ? friend.email.trim().toLowerCase() : '';
    const fPhone = friend.phone ? friend.phone.replace(/\D/g, '') : '';

    const isDup = formData.participants.some(p => {
      if (p.friendId && p.friendId === friend.id) return true;
      if (fEmail && p.email && p.email.trim().toLowerCase() === fEmail) return true;
      if (fPhone && p.phone && p.phone.replace(/\D/g, '') === fPhone) return true;
      if (!fEmail && !fPhone && !p.email && !p.phone && p.name.trim().toLowerCase() === friend.name.trim().toLowerCase()) return true;
      return false;
    });

    if (isDup) { 
      toast.error(`${friend.name} is already added`); 
      return; 
    }

    const newPart: GroupParticipantItem = {
      id: Math.random().toString(36).slice(2, 9),
      name: friend.name,
      friendId: friend.id,
      email: friend.email,
      phone: (friend as any)?.phone,
    };

    const emptyIdx = formData.participants.findIndex((p) => !p.name.trim() && !p.friendId);
    if (emptyIdx !== -1) { 
      const next = [...formData.participants]; 
      next[emptyIdx] = newPart; 
      setFormData(prev => ({ ...prev, participants: next })); 
    } else { 
      setFormData(prev => ({ ...prev, participants: [...prev.participants, newPart] })); 
    }
    setShowFriendPicker(false);
    toast.success(`Added ${friend.name} to group`);
  };

  // New person: add inline by name and immediately save to friends DB
  const [newPersonInput, setNewPersonInput] = useState('');
  const [showNewPersonInput, setShowNewPersonInput] = useState(false);

  const confirmNewPerson = async () => {
    const name = newPersonInput.trim();
    if (!name) return;

    const newPart: GroupParticipantItem = {
      id: Math.random().toString(36).slice(2, 9),
      name,
    };

    await saveNewFriend(newPart);
    const emptyIdx = formData.participants.findIndex(p => !p.name.trim() && !p.friendId);
    if (emptyIdx !== -1) {
      const next = [...formData.participants];
      next[emptyIdx] = newPart;
      setFormData(prev => ({ ...prev, participants: next }));
    } else {
      setFormData(prev => ({ ...prev, participants: [...formData.participants, newPart] }));
    }
    setNewPersonInput('');
    setShowNewPersonInput(false);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) { toast.error('Group name is required'); return; }
    if (validParticipants.length < 1) { toast.error('Add at least one participant'); return; }
    if (totalNum <= 0) { toast.error('Total amount must be greater than 0'); return; }

    // Validate uniqueness of email and phone (user names CAN be duplicate)
    const emailSet = new Set<string>();
    const phoneSet = new Set<string>();
    for (const p of validParticipants) {
      if (p.email) {
        const e = p.email.trim().toLowerCase();
        if (emailSet.has(e)) {
          toast.error(`Duplicate collaborator email "${p.email}". All participants must have unique emails.`);
          return;
        }
        emailSet.add(e);
      }
      if (p.phone) {
        const ph = p.phone.replace(/\D/g, '');
        if (phoneSet.has(ph)) {
          toast.error(`Duplicate collaborator phone "${p.phone}". All participants must have unique phone numbers.`);
          return;
        }
        phoneSet.add(ph);
      }
    }

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

      // Auto-save any new participant names to Friends DB
      await Promise.all(validParticipants.filter(p => !p.friendId).map(p => saveNewFriend(p)));

      // Build enriched member list for both local record and backend
      const enrichedParticipants = validParticipants.map((p) => {
        return {
          name: p.name,
          share: perPerson,
          paid: false,
          isCurrentUser: false as const,
          paidAmount: 0,
          paymentStatus: 'pending' as const,
          friendId: p.friendId,
          email: p.email,
          phone: p.phone,
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

  {/* Header */}
  <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
    <div className="flex items-center justify-between gap-3 w-full">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <button
          data-testid="add-group-back"
          onClick={() => setCurrentPage('groups')}
          title="Back to Groups"
          aria-label="Back to Groups"
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
        >
          <ArrowLeft size={18} className="text-slate-700" />
        </button>
        <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">New Group Expense</h1>
      </div>
    </div>
  </header>

 {/* Main Single-Page Content Area */}
 <main className="flex-1 p-3 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 overflow-y-auto pb-48">
 
 {/* Left Column: context & types (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-4">
 
        <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Group / Expense Name</label>
            <div className="relative">
              <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input data-testid="add-group-e-g-weekend-trip" 
                type="text" 
                value={formData.name} 
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} 
                className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-3.5 font-semibold text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:bg-white focus:border-violet-500 outline-none transition-all" 
                placeholder="e.g. Weekend Trip to Goa" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Category</label>
              <SearchableDropdown testId="add-group-category"
                options={groupCategoryOptions}
                value={formData.category}
                onChange={val => setFormData(prev => ({ ...prev, category: val }))}
                placeholder="Category"
                triggerClassName="bg-slate-50 border border-slate-200/80 rounded-xl h-10 sm:h-11 font-semibold text-xs sm:text-sm shadow-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date</label>
              <div className="relative group">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-violet-500 transition-colors z-10" size={15} />
                <div className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-3.5 font-semibold text-xs sm:text-sm text-slate-900 group-hover:bg-slate-100/50 transition-all flex items-center h-10 sm:h-11">
                  {(() => {
                    if (!formData.date) return 'Select Date';
                    const date = new Date(formData.date);
                    const day = String(date.getDate()).padStart(2, '0');
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
                  })()}
                </div>
                <input data-testid="add-group-expense-date"
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  aria-label="Expense date"
                  className="absolute inset-0 opacity-0 cursor-pointer z-20"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Description (Optional)</label>
            <div className="relative">
              <AlignLeft className="absolute left-3.5 top-3.5 text-slate-400" size={15} />
              <textarea data-testid="add-group-what-was-this-for" 
                value={formData.description} 
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} 
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-3 pl-10 pr-3.5 font-medium text-slate-900 text-xs sm:text-sm min-h-[70px] resize-none focus:bg-white focus:border-violet-500 outline-none transition-all" 
                placeholder="What was this for?" 
              />
            </div>
          </div>

 {/* Participants Section */}
 <div className="space-y-4 pt-4 border-t border-slate-100">
 <div className="flex items-center justify-between">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
 Split with Participants ({validParticipants.length + 1})
 </label>
  <div className="flex gap-2">
  {friends && friends.length > 0 ? (
  <button data-testid="add-group-friends" 
  type="button" 
  onClick={() => { setShowFriendPicker(!showFriendPicker); setShowNewPersonInput(false); }}
  className={cn(
    "text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer",
    showFriendPicker ? "bg-violet-600 text-white" : "text-violet-600 bg-violet-50 hover:bg-violet-100"
  )}
  >
  <Users size={10} /> Friends ({friends.length})
  </button>
  ) : (
  <button
  type="button"
  onClick={() => {
    toast.info('No friends in your contacts yet. Redirecting to Add Friends...');
    setCurrentPage('add-friends');
  }}
  className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50 hover:bg-violet-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
  >
  <UserPlus size={10} /> Add Friends
  </button>
  )}
  <button data-testid="add-group-new-person" 
  type="button" 
  onClick={() => { setShowNewPersonInput(!showNewPersonInput); setShowFriendPicker(false); }}
  className={cn(
    "text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer",
    showNewPersonInput ? "bg-indigo-600 text-white" : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
  )}
  >
  <UserPlus size={10} /> New Person
  </button>
  </div>
  </div>

  {/* Friends quick-pick panel */}
  {showFriendPicker && friends.length > 0 && (
  <div className="p-3 bg-violet-50/70 rounded-xl border border-violet-100 animate-in slide-in-from-top-2 space-y-2.5">
  <div className="flex items-center justify-between">
    <p className="text-[10px] sm:text-[11px] font-bold text-violet-600 uppercase tracking-wider">Tap friend to add to group</p>
    <button
      type="button"
      onClick={() => {
        setShowFriendPicker(false);
        setFriendSearch('');
      }}
      className="text-violet-400 hover:text-violet-600 text-[10px] font-bold uppercase cursor-pointer"
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
      data-testid="add-group-friend-search-input"
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
      const isAdded = formData.participants.some(p =>
        (p.friendId && p.friendId === f.id) ||
        (f.email && p.email && p.email.trim().toLowerCase() === f.email.trim().toLowerCase()) ||
        (f.phone && p.phone && p.phone.replace(/\D/g, '') === f.phone.replace(/\D/g, '')) ||
        (!f.email && !f.phone && !p.email && !p.phone && p.name.trim().toLowerCase() === cleanName.trim().toLowerCase())
      );
      return (
        <button
          data-testid={`add-group-button-${f.id}`} 
          key={f.id}
          type="button"
          onClick={() => !isAdded && addFriend({ ...f, name: cleanName })}
          disabled={isAdded}
          className={cn(
            "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
            isAdded
              ? "bg-slate-100 text-slate-400 cursor-not-allowed line-through"
              : "bg-white border border-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white shadow-2xs"
          )}
        >
          <span>{cleanName}</span>
          {f.email ? (
            <span className="text-[10px] opacity-70">({f.email})</span>
          ) : f.phone ? (
            <span className="text-[10px] opacity-70">({f.phone})</span>
          ) : null}
        </button>
      );
    });
  })()}
  </div>
  </div>
  )}

  {/* Inline new person input */}
  {showNewPersonInput && (
  <div className="flex items-center gap-2 p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100 animate-in slide-in-from-top-2">
  <UserPlus size={14} className="text-indigo-400 shrink-0" />
  <input data-testid="add-group-type-name-press-enter"
  type="text"
  value={newPersonInput}
  onChange={e => setNewPersonInput(e.target.value)}
  onKeyDown={e => e.key === 'Enter' && confirmNewPerson()}
  className="flex-1 bg-transparent border-none p-0 text-xs font-bold text-slate-900 focus:ring-0 placeholder:text-slate-300"
  placeholder="Type name & press Enter"
  autoFocus
  />
  <button data-testid="add-group-confirm" type="button" onClick={confirmNewPerson} title="Confirm" className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all cursor-pointer">
  <Check size={12} strokeWidth={3} />
  </button>
  <button data-testid="add-group-cancel" type="button" onClick={() => { setShowNewPersonInput(false); setNewPersonInput(''); }} title="Cancel" className="p-1.5 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
  <X size={12} strokeWidth={3} />
  </button>
  </div>
  )}

  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[250px] lg:max-h-[400px] overflow-y-auto no-scrollbar">
  {/* Fixed "You" Participant */}
  <div className="flex items-center gap-2 p-2.5 bg-slate-100/50 rounded-xl border border-slate-100">
  <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-black text-white">ME</div>
  <div className="flex-1">
  <p className="text-xs font-bold text-slate-900">You (Included)</p>
  <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 uppercase">Always part of split</p>
  </div>
  </div>

  {formData.participants.map((p, i) => (
  <div key={p.id || i} className="flex items-center gap-2 p-2 bg-white border border-slate-100 rounded-xl group">
  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-500 uppercase shrink-0">
  {p.name ? p.name.charAt(0) : <Plus size={12} />}
  </div>
  <div className="flex-1 min-w-0">
  <input data-testid={`add-group-person-${i}`} 
  type="text" 
  value={p.name} 
  onChange={e => updateParticipantName(i, e.target.value)}
  onBlur={() => saveNewFriend(p)}
  className="w-full bg-transparent border-none p-0 text-[11px] font-bold text-slate-900 focus:ring-0" 
  placeholder={`Person ${i + 1}`} 
  />
  {(p.email || p.phone) && (
    <p className="text-[9px] text-slate-400 truncate">
      {p.email || p.phone}
    </p>
  )}
  </div>
  <button data-testid={`add-group-remove-participant-${i}`} type="button" onClick={() => removeParticipant(i)} title="Remove participant" className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer p-1">
  <Trash2 size={14} />
  </button>
  </div>
  ))}
  </div>
  <button
    type="button"
    onClick={addParticipant}
    className="w-full py-2 text-xs font-bold text-violet-600 bg-violet-50/70 hover:bg-violet-100 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
  >
    <Plus size={14} />
    <span>Add Another Participant Slot</span>
  </button>
 </div>
 </div>
 </div>

 {/* Right Column: Financials (lg:col-5) */}
 <div className="lg:col-span-5 flex flex-col gap-4">
 
        {/* Total Amount Input Card */}
        <div className="bg-white rounded-[28px] sm:rounded-[32px] p-8 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden flex flex-col items-center">
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-violet-500/5 blur-[80px] rounded-full pointer-events-none z-0" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none z-0" />
          
          <div className="relative z-10 flex flex-col items-center w-full">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">Total Group Bill</span>
            
            <div className="flex items-center justify-center w-full my-4">
              {/* Left Side: Currency */}
              <div className="w-20 sm:w-28 flex justify-end pr-2 sm:pr-4">
                <span className="text-2xl sm:text-4xl font-black text-slate-200 select-none tracking-tighter">{currency}</span>
              </div>
              
              {/* Center: Input */}
              <input data-testid="add-group-0"
                type="number"
                name="totalAmount"
                value={amountStr}
                onChange={e => { setAmountStr(e.target.value); setFormData(prev => ({ ...prev, totalAmount: parseFloat(e.target.value) || 0 })); }}
                className="bg-transparent text-5xl sm:text-6xl font-black text-slate-900 outline-none w-[160px] sm:w-[220px] text-center tracking-tighter placeholder:text-slate-200 p-0 m-0"
                placeholder="0"
                autoFocus
              />
              
              {/* Right Side: Clear Button */}
              <div className="w-20 sm:w-28 flex justify-start pl-2 sm:pl-4">
                {amountStr && (
                  <button data-testid="add-group-clear-amount"
                    onClick={() => { setAmountStr(''); setFormData(prev => ({ ...prev, totalAmount: 0 })); }}
                    title="Clear amount"
                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all animate-in fade-in zoom-in-50 cursor-pointer"
                  >
                    <X size={28} strokeWidth={3} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 mt-8 max-w-sm">
              {[100, 500, 1000, 2000, 5000].map(amt => (
                <button data-testid={`add-group-button-2-${amt}`} 
                  key={amt} 
                  type="button"
                  onClick={() => { 
                    const current = Number(formData.totalAmount) || 0;
                    const next = current + amt;
                    setAmountStr(String(next));
                    setFormData(prev => ({ ...prev, totalAmount: next }));
                  }} 
                  className="px-5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-full text-xs font-black text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all active:scale-95 select-none cursor-pointer shadow-2xs"
                >
                  +{currency}{amt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-7 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Split Calculation</p>
              <p className="text-xs font-bold text-slate-700">Equally between {validParticipants.length + 1} people</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600">
              <Calculator size={18} />
            </div>
          </div>

          <div className="p-5 bg-slate-900 rounded-[24px] text-white relative overflow-hidden">
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-white/5 blur-[20px] rounded-full" />
            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Your Share</p>
            <div className="flex items-baseline gap-2">
              <span className="text-sm sm:text-lg font-black text-white/30">{currency}</span>
              <span className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter">{perPerson.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-violet-500 border-2 border-slate-900 flex items-center justify-center text-[8px] sm:text-[9px] font-black">YOU</div>
                {validParticipants.slice(0, 3).map((p, i) => (
                  <div key={i} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center text-[8px] sm:text-[9px] font-black uppercase">{p.name[0] || '?'}</div>
                ))}
                {validParticipants.length > 3 && <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[8px] sm:text-[9px] font-black">+{validParticipants.length - 3}</div>}
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold text-white/60 uppercase tracking-wider">Total {validParticipants.length + 1} People</span>
            </div>
          </div>
        </div>

        <div className="mt-auto p-4 bg-indigo-50/80 border border-indigo-100 rounded-2xl flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0"><Sparkles size={16} className="text-white" /></div>
          <div>
            <p className="text-[9px] font-black text-indigo-700 uppercase tracking-widest">Smart Split Tip</p>
            <p className="text-xs font-medium text-slate-700">Add group name for better expense tracking.</p>
          </div>
        </div>

        {/* Final Summary Card */}
        <div className="p-5 bg-violet-600 rounded-[24px] text-white flex items-center justify-between shadow-xl shadow-violet-600/20 mt-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><Users size={20} className="text-white" /></div>
            <div>
              <p className="text-[9px] font-black text-white/70 uppercase tracking-widest">Group Summary</p>
              <p className="text-xs font-black truncate max-w-[140px]">{formData.name || 'New Group bill'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-white/70 uppercase tracking-widest">Total Bill</p>
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
