
import React, { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { pickDeviceContacts, isContactPickerSupported, parseVCardContent, parseCsvContacts } from '@/services/contactsService';
import { Users, UserPlus, X, ChevronLeft, Loader2, Check, Save, ArrowLeft, Mail, Phone, Heart, Briefcase, Home, User, Sparkles, Contact, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
 const vcfInputRef = React.useRef<HTMLInputElement>(null);

 const addContactsToQueue = (newContacts: { name: string; email?: string; phone?: string }[]) => {
   const existingNames = new Set([
     ...(friends || []).map((f: any) => (f.name || '').toLowerCase().trim()),
     ...queue.map(q => q.name.toLowerCase().trim()),
   ]);

   let added = 0;
   const toAdd: typeof queue = [];

   for (const c of newContacts) {
     const normName = (c.name || '').toLowerCase().trim();
     if (!normName || existingNames.has(normName)) continue;
     existingNames.add(normName);
     toAdd.push({
       name: c.name.trim(),
       email: c.email || '',
       phone: c.phone || '',
       relationship: 'friend',
     });
     added++;
   }

   if (added > 0) {
     setQueue(prev => [...prev, ...toAdd]);
     toast.success(`Added ${added} contact${added === 1 ? '' : 's'} to queue!`);
   } else {
     toast.info('Selected contacts are already in your list or queue.');
   }
 };

 const handlePickContacts = async () => {
   if (isContactPickerSupported()) {
     try {
       const picked = await pickDeviceContacts();
       if (picked.length > 0) {
         addContactsToQueue(picked);
       }
     } catch (err: any) {
       toast.error(err?.message || 'Could not access device contacts');
     }
   } else {
     // Fallback to vcf file upload
     vcfInputRef.current?.click();
   }
 };

  const handleContactFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');
      const parsed = isCsv ? parseCsvContacts(text) : parseVCardContent(text);
      if (parsed.length === 0) {
        toast.info(`No valid contacts found in this ${isCsv ? '.csv' : '.vcf'} file.`);
        return;
      }
      addContactsToQueue(parsed);
    } catch {
      toast.error('Could not read contacts file');
    } finally {
      if (vcfInputRef.current) vcfInputRef.current.value = '';
    }
  };

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
    try {
      const result = await backendService.createFriendsBulk(queue);
      if (result.createdCount > 0) {
        toast.success(`${result.createdCount} friend${result.createdCount === 1 ? '' : 's'} added!`);
      }
      if (result.skippedCount > 0) {
        toast.info(`${result.skippedCount} contact${result.skippedCount === 1 ? '' : 's'} skipped (already existed or invalid)`);
      }
      setQueue([]);
      refreshData();
      setCurrentPage('friends');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save friends');
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
          data-testid="add-friends-back"
          onClick={() => setCurrentPage('friends')}
          title="Back"
          aria-label="Back"
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
        >
          <ArrowLeft size={18} className="text-slate-700" />
        </button>
        <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">Add Friends</h1>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="file"
          ref={vcfInputRef}
          accept=".vcf,.csv,text/vcard,text/csv"
          className="hidden"
          onChange={handleContactFileChange}
        />
        <button
          type="button"
          onClick={handlePickContacts}
          data-testid="add-friends-import-contacts"
          className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full text-xs font-bold transition-all border border-purple-200/80 cursor-pointer"
          title="Import contacts from device, .vcf, or .csv file"
        >
          <Contact size={14} />
          <span>Import Contacts</span>
        </button>
  </div>
  </div>
  </header>

  {/* Main Single-Page Content Area */}
  <main className="flex-1 p-3 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 overflow-y-auto pb-48">
  
  {/* Left Column: Form (lg:col-7) */}
  <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Friend Name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input id="add-friend-name" name="name" aria-label="Friend name" data-testid="add-friends-full-name" type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 font-semibold text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="Full Name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input id="add-friend-email" name="email" aria-label="Friend email" data-testid="add-friends-optional" type="email" value={formData.email} onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 font-semibold text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input id="add-friend-phone" name="phone" aria-label="Friend phone" data-testid="add-friends-optional-2" type="tel" value={formData.phone} onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))} className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 font-semibold text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="Optional" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Relationship</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {RELATIONSHIP_TYPES.map(r => (
                <button data-testid={`add-friends-button-${r.key}`} key={r.key} onClick={() => setFormData(prev => ({ ...prev, relationship: r.key }))} className={cn("flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl transition-all cursor-pointer", formData.relationship === r.key ?"bg-indigo-600 text-white shadow-md shadow-indigo-600/20" :"bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200/60")}>
                  {r.icon}
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button data-testid="add-friends-add-to-list" onClick={addToQueue} className="w-full py-3.5 bg-slate-900 text-white rounded-full text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-xs cursor-pointer">
            <UserPlus size={15} /> Add to List
          </button>
        </div>

        <div className="p-4 bg-indigo-50/80 border border-indigo-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0"><Users size={16} className="text-white" /></div>
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Bulk Actions & Contacts</p>
              <p className="text-xs font-medium text-slate-700">Import from your device contacts or upload a .vcf / .csv file.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePickContacts}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-[11px] font-bold tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Contact size={13} />
              <span>Pick Contacts</span>
            </button>
            <button
              type="button"
              onClick={() => vcfInputRef.current?.click()}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-full text-[11px] font-bold tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Upload size={13} />
              <span>Upload .vcf / .csv</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Queue (lg:col-5) */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending List ({queue.length})</h3>
          {queue.length > 0 && <button data-testid="add-friends-clear-all" onClick={() => setQueue([])} className="text-[10px] sm:text-[11px] font-bold text-rose-500 uppercase tracking-wider hover:underline cursor-pointer">Clear All</button>}
        </div>

        <div className="flex-1 lg:overflow-y-auto space-y-2">
          {queue.map((f, i) => (
            <div key={i} className="bg-white rounded-[20px] sm:rounded-[24px] border border-slate-100 p-3.5 sm:p-4 shadow-xs flex items-center justify-between group animate-in slide-in-from-right-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs">{f.name[0].toUpperCase()}</div>
                <div>
                  <p className="text-xs font-black text-slate-900">{f.name}</p>
                  <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-tight">{f.relationship} {f.phone || f.email || 'No contact'}</p>
                </div>
              </div>
              <button data-testid={`add-friends-remove-${i}`} type="button" onClick={() => removeFromQueue(i)} title="Remove" className="w-8 h-8 rounded-full bg-slate-50 hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors cursor-pointer">
                <X size={14} />
              </button>
            </div>
          ))}
          {queue.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3 grayscale py-12">
              <Users size={48} className="text-slate-300" />
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Queue is empty</p>
            </div>
          )}
        </div>

        {/* Sticky Summary */}
        {queue.length > 0 && (
          <div className="mt-auto p-4 bg-indigo-600 rounded-[24px] text-white flex items-center justify-between shadow-xl shadow-indigo-600/20 animate-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center"><Check size={16} className="text-white" /></div>
              <div>
                <p className="text-[10px] sm:text-[11px] font-bold text-white/70 uppercase">Ready to Sync</p>
                <p className="text-xs font-black">{queue.length} People Selected</p>
              </div>
            </div>
            <button data-testid="add-friends-confirm-save" onClick={handleSaveAll} className="px-5 py-2.5 bg-white text-indigo-600 rounded-full text-xs font-black uppercase tracking-wider shadow-md hover:bg-slate-50 transition-all cursor-pointer">Confirm & Save</button>
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
