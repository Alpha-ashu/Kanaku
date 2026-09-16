import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { Plus, Search, ShieldCheck, UserCircle2, Trash2, Loader2, ArrowLeft, Save, X, Contact, Phone, Mail, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { pickDeviceContacts, isContactPickerSupported, parseVCardContent, parseCsvContacts, sanitizeContactName } from '@/services/contactsService';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { cn } from '@/lib/utils';

// A unified view of a friend — could be backend-synced or local-only (pending sync)
interface DisplayFriend {
  // For backend-synced friends, `cloudId` is the backend UUID (used for API calls)
  cloudId?: string;
  // For local-only friends, `localId` is the Dexie integer PK
  localId?: number;
  name: string;
  email: string | null;
  phone: string | null;
  isRegistered: boolean;
  totalExpenses: number;
  outstandingAmount: number;
  isPendingSync: boolean; // true = local-only, no cloudId yet
}

const avatarGradients = [
  'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-xs',
  'bg-gradient-to-tr from-rose-500 to-pink-600 text-white shadow-xs',
  'bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-xs',
  'bg-gradient-to-tr from-amber-500 to-orange-600 text-white shadow-xs',
  'bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-xs',
  'bg-gradient-to-tr from-purple-500 to-fuchsia-600 text-white shadow-xs',
];

const getToneClass = (seed: string) => {
  const sum = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return avatarGradients[sum % avatarGradients.length];
};

export const FriendsList: React.FC = () => {
  const guardSubmit = useSubmitLock();
  const { setCurrentPage, triggerSync, currency, groupExpenses } = useApp();
  const [friends, setFriends] = useState<DisplayFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'transactions' | 'local'>('all');
  const [visibleCount, setVisibleCount] = useState(40);
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DisplayFriend | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Inline edit state for local-only friends that need contact info added
  const [editingLocalId, setEditingLocalId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [savingLocal, setSavingLocal] = useState(false);

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

  // Set of identifiers for friends who have been added to Kanaku transactions
  const transactionFriendKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const exp of groupExpenses || []) {
      for (const m of exp.members || []) {
        if (m.isCurrentUser) continue;
        if (m.friendId != null) keys.add(`id-${m.friendId}`);
        if ((m as any).cloudId) keys.add(`cloud-${(m as any).cloudId}`);
        if (m.name) keys.add(`name-${m.name.trim().toLowerCase()}`);
        if (m.email) keys.add(`email-${m.email.trim().toLowerCase()}`);
        if (m.phone) {
          const clean = m.phone.replace(/\D/g, '');
          if (clean) keys.add(`phone-${clean}`);
        }
      }
    }
    return keys;
  }, [groupExpenses]);

  const isFriendInTransactions = (f: DisplayFriend) => {
    if (f.localId != null && transactionFriendKeys.has(`id-${f.localId}`)) return true;
    if (f.cloudId && transactionFriendKeys.has(`cloud-${f.cloudId}`)) return true;
    if (f.name && transactionFriendKeys.has(`name-${f.name.trim().toLowerCase()}`)) return true;
    if (f.email && transactionFriendKeys.has(`email-${f.email.trim().toLowerCase()}`)) return true;
    if (f.phone) {
      const clean = f.phone.replace(/\D/g, '');
      if (clean && transactionFriendKeys.has(`phone-${clean}`)) return true;
    }
    return false;
  };

  const inTransactionsCount = useMemo(() => {
    return friends.filter(isFriendInTransactions).length;
  }, [friends, transactionFriendKeys]);

  const localCount = useMemo(() => {
    return friends.filter((f) => f.isPendingSync).length;
  }, [friends]);

  const loadFriends = async () => {
    setLoading(true);
    try {
      // 1. Load backend-synced friends
      let backendFriends: DisplayFriend[] = [];
      try {
        const data: any[] = await backendService.getFriendsEnriched();
        backendFriends = data.map((f) => ({
          cloudId: f.id,
          name: f.name,
          email: f.email ?? null,
          phone: f.phone ?? null,
          isRegistered: f.isRegistered ?? false,
          totalExpenses: f.totalExpenses ?? 0,
          outstandingAmount: f.outstandingAmount ?? 0,
          isPendingSync: false,
        }));
      } catch {
        // Backend unavailable — we still show local friends
      }

      // 2. Load local-only friends (no cloudId yet) from Dexie
      const localFriends = await db.friends
        .filter((f) => !f.cloudId && !f.deletedAt)
        .toArray();

      // Clean up any local friends stored with raw quoted-printable or emoji/memoji artifacts
      for (const lf of localFriends) {
        if (lf.id) {
          const cleaned = sanitizeContactName(lf.name, { email: lf.email, phone: lf.phone });
          if (cleaned && cleaned !== lf.name) {
            await db.friends.update(lf.id, { name: cleaned });
            lf.name = cleaned;
          }
        }
      }

      const syncedEmails = new Set(
        backendFriends.filter((f) => f.email).map((f) => f.email!.trim().toLowerCase())
      );
      const syncedPhones = new Set(
        backendFriends.filter((f) => f.phone).map((f) => f.phone!.replace(/\D/g, ''))
      );
      const syncedNamesNoContact = new Set(
        backendFriends.filter((f) => !f.email && !f.phone).map((f) => f.name.trim().toLowerCase())
      );

      const pendingFriends: DisplayFriend[] = localFriends
        .filter((f) => {
          const fEmail = f.email?.trim().toLowerCase();
          const fPhone = f.phone?.replace(/\D/g, '');
          if (fEmail && syncedEmails.has(fEmail)) return false;
          if (fPhone && syncedPhones.has(fPhone)) return false;
          if (!fEmail && !fPhone && syncedNamesNoContact.has(f.name.trim().toLowerCase())) return false;
          return true;
        })
        .map((f) => ({
          localId: f.id,
          name: sanitizeContactName(f.name, { email: f.email, phone: f.phone }),
          email: f.email ?? null,
          phone: f.phone ?? null,
          isRegistered: false,
          totalExpenses: 0,
          outstandingAmount: 0,
          isPendingSync: true,
        }));

      setFriends([...backendFriends, ...pendingFriends]);
    } catch (error) {
      console.error('Failed to load friends', error);
      toast.error('Failed to load friends. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFriends();
  }, []);

  const openFriendProfile = (friend: DisplayFriend) => {
    if (friend.isPendingSync && friend.localId) {
      // Local-only friend — open inline edit so user can add contact info
      setEditingLocalId(friend.localId);
      setEditForm({ name: friend.name, email: friend.email ?? '', phone: friend.phone ?? '' });
      return;
    }
    if (friend.cloudId) {
      localStorage.setItem('viewingFriendId', friend.cloudId);
      setCurrentPage('friend-profile');
    }
  };

  /** Save edits to a local-only friend and try to push it to the backend */
  const handleSaveLocalFriend = guardSubmit(async (localId: number) => {
    const name = editForm.name.trim();
    const email = editForm.email.trim() || undefined;
    const phone = editForm.phone.trim() || undefined;

    if (!name) {
      toast.error('Name is required');
      return;
    }

    const allFriends = await db.friends.filter(f => !f.deletedAt && f.id !== localId).toArray();
    if (email) {
      const cleanEmail = email.toLowerCase();
      if (allFriends.some(f => f.email && f.email.trim().toLowerCase() === cleanEmail)) {
        toast.error(`A friend with email "${email}" already exists`);
        return;
      }
    }
    if (phone) {
      const pDigits = phone.replace(/\D/g, '');
      if (allFriends.some(f => f.phone && f.phone.replace(/\D/g, '') === pDigits)) {
        toast.error(`A friend with phone "${phone}" already exists`);
        return;
      }
    }

    setSavingLocal(true);
    try {
      // Update locally first
      await db.friends.update(localId, {
        name,
        email,
        phone,
        updatedAt: new Date(),
      });

      // Try to push to backend if contact info is now available
      if (email || phone) {
        try {
          const { cloudId } = await backendService.retrySyncFriend(localId);
          toast.success(`${name} synced successfully`);
          triggerSync();
          setEditingLocalId(null);
          await loadFriends();
          // Navigate to the synced friend profile
          localStorage.setItem('viewingFriendId', cloudId);
          setCurrentPage('friend-profile');
          return;
        } catch (syncErr: any) {
          // Sync failed but local save succeeded — user can try again later
          toast.info(`${name} saved locally. Sync will retry automatically.`);
        }
      } else {
        toast.success(`${name} updated. Add an email or phone to sync.`);
      }

      setEditingLocalId(null);
      await loadFriends();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update friend');
    } finally {
      setSavingLocal(false);
    }
  });

  const handlePickContacts = async () => {
    if (isContactPickerSupported()) {
      try {
        const picked = await pickDeviceContacts();
        if (picked.length > 0) {
          await importParsedContacts(picked);
        }
      } catch (err: any) {
        toast.error(err?.message || 'Could not access device contacts');
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const importParsedContacts = async (contacts: { name: string; email?: string; phone?: string }[]) => {
    setImporting(true);
    try {
      const result = await backendService.createFriendsBulk(contacts);
      if (result.createdCount > 0) {
        toast.success(`Imported ${result.createdCount} contact${result.createdCount === 1 ? '' : 's'}.`);
      }
      if (result.skippedCount > 0) {
        toast.info(`${result.skippedCount} contact${result.skippedCount === 1 ? '' : 's'} skipped (duplicate email or phone number)`);
      }
      await loadFriends();
      triggerSync();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to import contacts');
    } finally {
      setImporting(false);
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
      await importParsedContacts(parsed);
    } catch {
      toast.error('Could not read contacts file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.cloudId) {
        await backendService.deleteFriendRemote(deleteTarget.cloudId);
      } else if (deleteTarget.localId) {
        await db.friends.update(deleteTarget.localId, { deletedAt: new Date() });
      }
      toast.success(`${deleteTarget.name} removed`);
      setDeleteTarget(null);
      await loadFriends();
      triggerSync();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to remove friend');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    return friends.filter((f) => {
      // Tab filter
      if (filterTab === 'transactions' && !isFriendInTransactions(f)) {
        return false;
      }
      if (filterTab === 'local' && !f.isPendingSync) {
        return false;
      }

      // Search filter
      if (!search.trim()) return true;
      const query = search.toLowerCase().trim();
      const queryDigits = search.replace(/\D/g, '');
      const decoded = sanitizeContactName(f.name).toLowerCase();
      const raw = f.name.toLowerCase();
      const email = (f.email || '').toLowerCase();
      const phone = (f.phone || '').replace(/\D/g, '');
      return (
        decoded.includes(query) ||
        raw.includes(query) ||
        email.includes(query) ||
        (queryDigits && phone.includes(queryDigits))
      );
    });
  }, [friends, search, filterTab, transactionFriendKeys]);

  const displayedFriends = useMemo(() => {
    return filtered.slice(0, visibleCount);
  }, [filtered, visibleCount]);

  return (
    <CenteredLayout>
      <div className="space-y-4 sm:space-y-6 pb-36">
        {/* Page Header - Responsive & Truncation-Proof */}
        <div className="flex items-center justify-between gap-2.5 sm:gap-4 w-full">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              data-testid="friends-list-back"
              onClick={() => setCurrentPage('groups')}
              title="Back"
              aria-label="Back"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/80 hover:bg-slate-100 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate text-lg sm:text-2xl font-bold">
                Manage Friends
              </h1>
              <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100/90 text-purple-700 border border-purple-200/60">
                {friends.length}
              </span>
            </div>
          </div>

          {/* Action Buttons - Compact Icons on mobile, Full Pills on desktop */}
          <div className="flex items-center gap-2 shrink-0">
            <input
              data-testid="friends-list-input"
              ref={fileInputRef}
              type="file"
              accept=".vcf,.csv,text/vcard,text/csv"
              className="hidden"
              onChange={handleContactFileChange}
            />
            <Button
              data-testid="friends-list-button"
              variant="secondary"
              disabled={importing}
              onClick={handlePickContacts}
              className="border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 w-9 h-9 sm:w-auto sm:h-10 p-0 sm:px-4 rounded-full font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
              title={isContactPickerSupported() ? 'Pick from device contacts' : 'Import contacts from .vcf or .csv file'}
              aria-label="Import Contacts"
            >
              {importing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Contact size={17} className="text-purple-600 shrink-0" />
              )}
              <span className="hidden sm:inline">Import Contacts</span>
            </Button>
            <Button
              data-testid="friends-list-button-2"
              onClick={() => setCurrentPage('add-friends')}
              className="bg-[#18181B] hover:bg-black text-white w-9 h-9 sm:w-auto sm:h-10 p-0 sm:px-4.5 rounded-full font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
              title="Add Friend"
              aria-label="Add Friend"
            >
              <Plus size={17} className="shrink-0" />
              <span className="hidden sm:inline">Add Friend</span>
            </Button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              data-testid="friends-list-search-friends-by-name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(40);
              }}
              placeholder="Search friends by name, phone or email..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-full py-2.5 sm:py-3 pl-10 pr-10 text-sm sm:text-base font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 shadow-2xs transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setVisibleCount(40);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter Pills - Responsive Full Width Segmented Control */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full p-1 sm:p-1.5 bg-slate-100/90 backdrop-blur-md rounded-2xl border border-slate-200/60 shadow-2xs">
            {[
              { id: 'all', shortLabel: 'All', fullLabel: 'All Friends', count: friends.length },
              { id: 'transactions', shortLabel: 'In Splits', fullLabel: 'In Transactions', count: inTransactionsCount },
              { id: 'local', shortLabel: 'Local', fullLabel: 'Local Only', count: localCount },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilterTab(tab.id as any);
                  setVisibleCount(40);
                }}
                className={cn(
                  "w-full py-2 sm:py-2.5 px-1.5 sm:px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none",
                  filterTab === tab.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                )}
              >
                <span className="truncate">
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.fullLabel}</span>
                </span>
                <span
                  className={cn(
                    "px-1.5 sm:px-2 py-0.5 rounded-full text-xs font-bold leading-none shrink-0",
                    filterTab === tab.id
                      ? "bg-white/20 text-white"
                      : "bg-slate-200/90 text-slate-700"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="animate-spin text-purple-600" size={32} />
            <p className="text-xs font-medium text-slate-400">Loading your friends...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[28px] sm:rounded-[32px] border border-dashed border-slate-200 bg-white/80 backdrop-blur-md px-4 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
              <Contact size={22} />
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-800">
              {filterTab === 'transactions'
                ? 'No friends in transactions yet'
                : filterTab === 'local'
                ? 'No local-only contacts'
                : search
                ? `No friends matching "${search}"`
                : 'No friends found'}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">
              {filterTab === 'transactions'
                ? 'Split a bill or add an expense in the Groups tab to see members here.'
                : 'Add friends or import contacts to get started with group splits.'}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="mt-3 inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-purple-600 hover:text-purple-700 cursor-pointer"
              >
                Clear search query
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {displayedFriends.map((friend) => {
              const key = friend.cloudId ?? `local-${friend.localId}`;
              const isEditing = friend.localId != null && editingLocalId === friend.localId;
              const inTransactions = isFriendInTransactions(friend);

              return (
                <div
                  key={key}
                  className="rounded-[22px] sm:rounded-[26px] bg-white/95 backdrop-blur-md border border-slate-100/90 shadow-[0_4px_20px_-4px_rgba(112,144,176,0.07)] hover:shadow-[0_12px_32px_-4px_rgba(112,144,176,0.13)] hover:border-purple-200/70 p-3.5 sm:p-4.5 transition-all group"
                >
                  {isEditing ? (
                    /* ── Inline edit form for local-only friends ── */
                    <div className="space-y-3.5">
                      <p className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles size={13} /> Update Contact Details
                      </p>
                      <div className="grid gap-2.5">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Full name"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
                        />
                        <input
                          value={editForm.email}
                          onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                          placeholder="Email (optional)"
                          type="email"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
                        />
                        <input
                          value={editForm.phone}
                          onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                          placeholder="Phone (optional)"
                          type="tel"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => void handleSaveLocalFriend(friend.localId!)}
                          disabled={savingLocal}
                          className="flex-1 h-10 rounded-full bg-slate-900 hover:bg-black text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          {savingLocal ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setEditingLocalId(null)}
                          className="h-10 px-5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-sm flex items-center gap-1 cursor-pointer"
                        >
                          <X size={14} /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal friend row ── */
                    <div className="flex items-center justify-between gap-3 sm:gap-4">
                      <button
                        data-testid={`friends-list-button-3-${key}`}
                        type="button"
                        onClick={() => openFriendProfile(friend)}
                        className="flex flex-1 items-center gap-3 sm:gap-3.5 text-left min-w-0 cursor-pointer"
                      >
                        <div
                          className={cn(
                            "w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl flex items-center justify-center font-bold text-sm sm:text-base ring-2 ring-white/90 shadow-2xs group-hover:scale-105 transition-transform",
                            getToneClass(friend.name)
                          )}
                        >
                          {sanitizeContactName(friend.name).charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <p className="font-bold text-slate-900 text-sm sm:text-base truncate group-hover:text-purple-700 transition-colors">
                              {sanitizeContactName(friend.name)}
                            </p>
                            {inTransactions && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200/60 px-2 sm:px-2.5 py-0.5 text-xs font-bold shrink-0 whitespace-nowrap">
                                <Sparkles size={11} className="text-purple-500" /> In Split
                              </span>
                            )}
                            {friend.isRegistered ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 sm:px-2.5 py-0.5 text-xs font-bold shrink-0 whitespace-nowrap">
                                <ShieldCheck size={11} /> Kanaku User
                              </span>
                            ) : friend.isPendingSync ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 px-2 sm:px-2.5 py-0.5 text-xs font-semibold shrink-0 whitespace-nowrap">
                                <Contact size={11} className="text-slate-500" /> Local
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200/60 px-2 sm:px-2.5 py-0.5 text-xs font-semibold shrink-0 whitespace-nowrap">
                                <UserCircle2 size={11} /> Guest
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-500 truncate mt-0.5">
                            {friend.phone && (
                              <span className="flex items-center gap-1 truncate font-medium">
                                <Phone size={12} className="text-slate-400 shrink-0" />
                                {friend.phone}
                              </span>
                            )}
                            {friend.email && (
                              <span className="flex items-center gap-1 truncate font-medium">
                                <Mail size={12} className="text-slate-400 shrink-0" />
                                {friend.email}
                              </span>
                            )}
                            {!friend.phone && !friend.email && (
                              <span className="text-slate-400 italic text-xs">
                                {friend.isPendingSync ? 'Tap to add contact details' : 'No contact details'}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        {!friend.isPendingSync && friend.totalExpenses > 0 && (
                          <div className="text-right hidden xs:block">
                            <p className="text-xs text-slate-400 font-medium">
                              {friend.totalExpenses} {friend.totalExpenses === 1 ? 'split' : 'splits'}
                            </p>
                            <p
                              className={cn(
                                "text-xs sm:text-sm font-bold",
                                friend.outstandingAmount > 0 ? "text-rose-600" : "text-emerald-600"
                              )}
                            >
                              {friend.outstandingAmount > 0 ? formatCurrency(friend.outstandingAmount) : 'Settled'}
                            </p>
                          </div>
                        )}
                        <button
                          data-testid={`friends-list-remove-friend-${key}`}
                          type="button"
                          onClick={() => setDeleteTarget(friend)}
                          title="Remove friend"
                          className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-full bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/70 hover:border-rose-200 flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                          aria-label={`Remove ${friend.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Load More Pagination Button for large contact lists */}
            {filtered.length > visibleCount && (
              <div className="pt-2 text-center">
                <Button
                  variant="secondary"
                  onClick={() => setVisibleCount((prev) => prev + 50)}
                  className="rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-700 text-xs font-bold px-6 h-9 shadow-xs"
                >
                  Load More ({visibleCount} of {filtered.length})
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Remove Friend"
        message={`Remove ${deleteTarget?.name || 'this friend'}? Their past expense history will be kept.`}
        isLoading={deleting}
      />
    </CenteredLayout>
  );
};
