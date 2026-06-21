
import React, { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { backendService } from '@/lib/backend-api';
import { Users, UserPlus, X, ChevronLeft, Loader2, Check, Save, ArrowLeft, Mail, Phone, Heart, Briefcase, Home, User, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import '@/styles/premium-transactions.css';
import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';

// --- Constants ---
const RELATIONSHIP_TYPES = [
 { key: 'friend', label: 'Friend', icon: <Heart size={14} /> },
 { key: 'family', label: 'Family', icon: <Home size={14} /> },
 { key: 'colleague', label: 'Colleague', icon: <Briefcase size={14} /> },
 { key: 'partner', label: 'Partner', icon: <Sparkles size={14} /> },
 { key: 'roommate', label: 'Roommate', icon: <Users size={14} /> },
 { key: 'other', label: 'Other', icon: <User size={14} /> },
];

export const AddFriends: React.FC = () => {
 const { setCurrentPage, refreshData, friends } = useApp();
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [queue, setQueue] = useState<{ name: string; email: string; phone: string; relationship: string }[]>([]);
 const [formData, setFormData] = useState({ name: '', email: '', phone: '', relationship: 'friend' });

 const addToQueue = () => {
 if (!formData.name.trim()) { toast.error('Name is required'); return; }
 if (queue.some((q) => q.name.toLowerCase() === formData.name.trim().toLowerCase())) { toast.error('Already in queue'); return; }
 setQueue([...queue, { ...formData, name: formData.name.trim() }]);
 setFormData({ name: '', email: '', phone: '', relationship: 'friend' });
 };

 const removeFromQueue = (i: number) => setQueue(queue.filter((_, idx) => idx !== i));

  const handleSaveAll = async () => {
    if (queue.length === 0) { toast.error('Add at least one friend'); return; }
    setIsSubmitting(true);
    let successCount = 0;
    try {
      for (const friend of queue) {
        const now = new Date();
        try {
          await backendService.createFriend({
            name: friend.name,
            email: friend.email || undefined,
            phone: friend.phone || undefined,
            createdAt: now,
            updatedAt: now,
          });
          successCount++;
        } catch (err: any) {
          const errMsg = err?.response?.data?.error || err?.message || 'Failed to save';
          toast.error(`Error adding ${friend.name}: ${errMsg}`);
        }
      }
      if (successCount > 0) {
        toast.success(`${successCount} friends added!`);
      }
      setQueue([]);
      refreshData();
      setCurrentPage('friends');
    } catch (error) {
      toast.error('Failed to save friends');
    } finally { setIsSubmitting(false); }
  };

 return (
 <div className="flex flex-col min-h-screen bg-white">

 {/* Header */}
 <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-3">
 <button data-testid="add-friends-back" onClick={() => setCurrentPage('friends')} title="Back" className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
 <ArrowLeft size={20} />
 </button>
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Add Friends</h1>
 </div>
 </div>
 </header>

 {/* Main Single-Page Content Area */}
 <main className="flex-1 p-3 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 overflow-y-auto pb-48 lg:pb-6">
 
 {/* Left Column: Form (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-4">
 <div className="premium-glass-card p-4 sm:p-6 space-y-4 sm:space-y-6">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Friend Name</label>
 <div className="relative">
 <User className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input data-testid="add-friends-full-name" type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs" placeholder="Full Name" />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Email</label>
 <div className="relative">
 <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input data-testid="add-friends-optional" type="email" value={formData.email} onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs" placeholder="Optional" />
 </div>
 </div>
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Phone</label>
 <div className="relative">
 <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input data-testid="add-friends-optional-2" type="tel" value={formData.phone} onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs" placeholder="Optional" />
 </div>
 </div>
 </div>

 <div className="space-y-2">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Relationship</label>
 <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
 {RELATIONSHIP_TYPES.map(r => (
 <button data-testid={`add-friends-button-${r.key}`} key={r.key} onClick={() => setFormData(prev => ({ ...prev, relationship: r.key }))} className={cn("flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all", formData.relationship === r.key ?"bg-indigo-600 text-white shadow-lg" :"bg-slate-50 text-slate-400 hover:bg-slate-100")}>
 {r.icon}
 <span className="text-[7px] font-black uppercase tracking-tighter">{r.label}</span>
 </button>
 ))}
 </div>
 </div>

 <button data-testid="add-friends-add-to-list" onClick={addToQueue} className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all">
 <UserPlus size={14} /> Add to List
 </button>
 </div>

 <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0"><Users size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Bulk Actions</p>
 <p className="text-[10px] font-bold text-slate-700">Add multiple friends at once and save them all together.</p>
 </div>
 </div>
 </div>

 {/* Right Column: Queue (lg:col-5) */}
 <div className="lg:col-span-5 flex flex-col gap-4">
 <div className="flex items-center justify-between px-1">
 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending List ({queue.length})</h3>
 {queue.length > 0 && <button data-testid="add-friends-clear-all" onClick={() => setQueue([])} className="text-[8px] font-black text-rose-500 uppercase tracking-widest hover:underline">Clear All</button>}
 </div>

 <div className="flex-1 lg:overflow-y-auto space-y-2">
 {queue.map((f, i) => (
 <div key={i} className="premium-glass-card p-3 sm:p-4 flex items-center justify-between group animate-in slide-in-from-right-2">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs">{f.name[0].toUpperCase()}</div>
 <div>
 <p className="text-[11px] font-black text-slate-900">{f.name}</p>
 <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">{f.relationship} {f.phone || f.email || 'No contact'}</p>
 </div>
 </div>
 <button data-testid={`add-friends-remove-${i}`} type="button" onClick={() => removeFromQueue(i)} title="Remove" className="text-slate-300 hover:text-rose-500 transition-colors">
 <X size={14} />
 </button>
 </div>
 ))}
 {queue.length === 0 && (
 <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3 grayscale">
 <Users size={48} className="text-slate-300" />
 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Queue is empty</p>
 </div>
 )}
 </div>

 {/* Sticky Summary */}
 {queue.length > 0 && (
 <div className="mt-auto p-4 bg-indigo-600 rounded-2xl text-white flex items-center justify-between shadow-xl shadow-indigo-100 animate-in slide-in-from-bottom-4">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><Check size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-white/60 uppercase">Ready to Sync</p>
 <p className="text-[10px] font-black">{queue.length} People Selected</p>
 </div>
 </div>
 <button data-testid="add-friends-confirm-save" onClick={handleSaveAll} className="px-5 py-2 bg-white text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">Confirm & Save</button>
 </div>
 )}
 </div>
 </main>
 <FloatingSaveBar
   onSave={handleSaveAll}
   onDiscard={() => setCurrentPage('friends')}
   isSaving={isSubmitting}
   disabled={queue.length === 0}
   saveLabel={queue.length > 0 ? `Save ${queue.length} Friend${queue.length > 1 ? 's' : ''}` : 'Save Friends'}
   accentClass="from-indigo-500 to-indigo-600"
 />
 </div>
 );
};
