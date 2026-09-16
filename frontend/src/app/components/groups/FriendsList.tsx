import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { Plus, Search, Upload, ShieldCheck, UserCircle2, Trash2, Loader2, ArrowLeft, AlertCircle, Save, X, Contact } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { pickDeviceContacts, isContactPickerSupported, parseVCardContent, parseCsvContacts, decodeQuotedPrintable, sanitizeContactName } from '@/services/contactsService';

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

const avatarToneClasses = [
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
];

const getToneClass = (seed: string) => {
  const sum = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return avatarToneClasses[sum % avatarToneClasses.length];
};

export const FriendsList: React.FC = () => {
  const { setCurrentPage, triggerSync, currency } = useApp();
  const [friends, setFriends] = useState<DisplayFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DisplayFriend | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Inline edit state for local-only friends that need contact info added
  const [editingLocalId, setEditingLocalId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [savingLocal, setSavingLocal] = useState(false);

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

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
  const handleSaveLocalFriend = async (localId: number) => {
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
  };

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

  const filtered = friends.filter((f) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase().trim();
    const queryDigits = search.replace(/\D/g, '');
    const decoded = sanitizeContactName(f.name).toLowerCase();
    const raw = f.name.toLowerCase();
    const email = (f.email || '').toLowerCase();
    const phone = (f.phone || '').replace(/\D/g, '');
    return decoded.includes(query) || raw.includes(query) || email.includes(query) || (queryDigits && phone.includes(queryDigits));
  });

  return (
    <CenteredLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              data-testid="friends-list-back"
              onClick={() => setCurrentPage('groups')}
              title="Back"
              aria-label="Back"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">Manage Friends</h1>
          </div>
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
              className="border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 h-9 sm:h-10 px-3.5 sm:px-4 rounded-full font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
              title={isContactPickerSupported() ? 'Pick from device contacts' : 'Import contacts from .vcf or .csv file'}
            >
              {importing ? <Loader2 size={15} className="animate-spin" /> : <Contact size={15} className="text-purple-600" />}
              <span>Import Contacts</span>
            </Button>
            <Button
              data-testid="friends-list-button-2"
              onClick={() => setCurrentPage('add-friends')}
              className="bg-[#18181B] hover:bg-black text-white h-9 sm:h-10 px-4 sm:px-5 rounded-full font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>Add Friend</span>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input data-testid="friends-list-search-friends-by-name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends by name or email"
            className="w-full bg-slate-50 border border-slate-200/60 rounded-full py-3 pl-10 pr-4 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[28px] sm:rounded-[32px] border border-dashed border-slate-200 bg-white px-4 py-16 text-center">
            <p className="text-sm text-slate-500">No friends found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((friend) => {
              const key = friend.cloudId ?? `local-${friend.localId}`;
              const isEditing = friend.localId != null && editingLocalId === friend.localId;

              return (
                <div
                  key={key}
                  className={`rounded-[24px] sm:rounded-[28px] border bg-white p-4 sm:p-5 transition-all ${friend.isPendingSync ? 'border-amber-200 shadow-xs' : 'border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] hover:shadow-md'}`}
                >
                  {isEditing ? (
                    /* ── Inline edit form for local-only friends ── */
                    <div className="space-y-3.5">
                      <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">
                        Add contact info to sync this friend
                      </p>
                      <div className="grid gap-2.5">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Full name"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        />
                        <input
                          value={editForm.email}
                          onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                          placeholder="Email (optional)"
                          type="email"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        />
                        <input
                          value={editForm.phone}
                          onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                          placeholder="Phone (optional)"
                          type="tel"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
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
                    <div className="flex items-center justify-between gap-4">
                      <button data-testid={`friends-list-button-3-${key}`}
                        type="button"
                        onClick={() => openFriendProfile(friend)}
                        className="flex flex-1 items-center gap-3.5 text-left min-w-0 cursor-pointer"
                      >
                        <Avatar className="h-12 w-12 shrink-0 rounded-2xl shadow-xs">
                          <AvatarImage src={undefined} alt={sanitizeContactName(friend.name)} />
                          <AvatarFallback className={`${getToneClass(friend.name)} font-bold rounded-2xl`}>
                            {sanitizeContactName(friend.name).charAt(0).toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-900 truncate">{sanitizeContactName(friend.name)}</p>
                            {friend.isPendingSync ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                                <AlertCircle size={11} /> Not synced
                              </span>
                            ) : friend.isRegistered ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                <ShieldCheck size={11} /> Kanaku User
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                                <UserCircle2 size={11} /> Guest
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {friend.isPendingSync
                              ? (friend.email || friend.phone || 'Tap to add email / phone')
                              : (friend.email || friend.phone || 'No contact info')}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                        {!friend.isPendingSync && (
                          <div className="text-right">
                            <p className="text-xs text-slate-400">{friend.totalExpenses} expense{friend.totalExpenses === 1 ? '' : 's'}</p>
                            <p className={`text-sm font-bold ${friend.outstandingAmount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                              {friend.outstandingAmount > 0 ? formatCurrency(friend.outstandingAmount) : 'Settled'}
                            </p>
                          </div>
                        )}
                        <button data-testid={`friends-list-remove-friend-${key}`}
                          type="button"
                          onClick={() => setDeleteTarget(friend)}
                          title="Remove friend"
                          className="w-9 h-9 rounded-full bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 border border-slate-100 flex items-center justify-center transition-all cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
