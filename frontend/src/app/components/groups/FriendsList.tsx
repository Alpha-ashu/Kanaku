import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { Plus, Search, Upload, ShieldCheck, UserCircle2, Trash2, Loader2, ArrowLeft, AlertCircle, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';

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

      const syncedNames = new Set(backendFriends.map((f) => f.name.toLowerCase()));

      const pendingFriends: DisplayFriend[] = localFriends
        .filter((f) => !syncedNames.has(f.name.toLowerCase())) // dedupe by name
        .map((f) => ({
          localId: f.id,
          name: f.name,
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

  const handleImportCsv = async (file: File) => {
    setImporting(true);
    try {
      const result = await backendService.importFriendsCsv(file);
      toast.success(`Imported ${result.createdCount} friend${result.createdCount === 1 ? '' : 's'}.`);
      if (result.skippedCount > 0) {
        toast.info(`${result.skippedCount} row(s) skipped (duplicates or missing info).`);
      }
      await loadFriends();
      triggerSync();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to import CSV');
    } finally {
      setImporting(false);
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

  const filtered = friends.filter(
    (f) =>
      !search.trim() ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.email || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <CenteredLayout>
      <div className="space-y-6">
        <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3">
            <button data-testid="friends-list-back" onClick={() => setCurrentPage('groups')} title="Back" className="p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Manage Friends</h1>
          </div>
          <div className="flex gap-2">
            <input data-testid="friends-list-input"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportCsv(file);
              }}
            />
            <Button data-testid="friends-list-button"
              variant="secondary"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 h-11 px-4 rounded-xl font-bold flex items-center gap-2"
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>Import CSV</span>
            </Button>
            <Button data-testid="friends-list-button-2"
              onClick={() => setCurrentPage('add-friends')}
              className="bg-gray-900 hover:bg-gray-800 text-white h-11 px-4 rounded-xl font-bold flex items-center gap-2"
            >
              <Plus size={16} />
              <span>Add Friend</span>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input data-testid="friends-list-search-friends-by-name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends by name or email"
            className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-slate-900"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center">
            <p className="text-sm text-gray-500">No friends found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((friend) => {
              const key = friend.cloudId ?? `local-${friend.localId}`;
              const isEditing = friend.localId != null && editingLocalId === friend.localId;

              return (
                <div
                  key={key}
                  className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow ${friend.isPendingSync ? 'border-amber-200' : 'border-gray-200 hover:shadow-md'}`}
                >
                  {isEditing ? (
                    /* ── Inline edit form for local-only friends ── */
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">
                        Add contact info to sync this friend
                      </p>
                      <div className="grid gap-2">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Full name"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        <input
                          value={editForm.email}
                          onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                          placeholder="Email (optional)"
                          type="email"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        <input
                          value={editForm.phone}
                          onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                          placeholder="Phone (optional)"
                          type="tel"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => void handleSaveLocalFriend(friend.localId!)}
                          disabled={savingLocal}
                          className="flex-1 h-9 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm flex items-center justify-center gap-1.5"
                        >
                          {savingLocal ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setEditingLocalId(null)}
                          className="h-9 px-4 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm flex items-center gap-1"
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
                        className="flex flex-1 items-center gap-3 text-left min-w-0"
                      >
                        <Avatar className="h-12 w-12 shrink-0">
                          <AvatarImage src={undefined} alt={friend.name} />
                          <AvatarFallback className={`${getToneClass(friend.name)} font-bold`}>
                            {friend.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900 truncate">{friend.name}</p>
                            {friend.isPendingSync ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                <AlertCircle size={11} /> Not synced
                              </span>
                            ) : friend.isRegistered ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                <ShieldCheck size={11} /> Kanaku User
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                                <UserCircle2 size={11} /> Guest
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {friend.isPendingSync
                              ? (friend.email || friend.phone || 'Tap to add email / phone')
                              : (friend.email || friend.phone || 'No contact info')}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center gap-4 shrink-0">
                        {!friend.isPendingSync && (
                          <div className="text-right">
                            <p className="text-xs text-gray-400">{friend.totalExpenses} expense{friend.totalExpenses === 1 ? '' : 's'}</p>
                            <p className={`text-sm font-bold ${friend.outstandingAmount > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                              {friend.outstandingAmount > 0 ? formatCurrency(friend.outstandingAmount) : 'Settled'}
                            </p>
                          </div>
                        )}
                        <button data-testid={`friends-list-remove-friend-${key}`}
                          type="button"
                          onClick={() => setDeleteTarget(friend)}
                          title="Remove friend"
                          className="p-2 text-gray-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={16} />
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
