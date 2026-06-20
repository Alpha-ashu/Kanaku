import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { Plus, Search, Upload, ShieldCheck, UserCircle2, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';

interface EnrichedFriend {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isRegistered: boolean;
  totalExpenses: number;
  outstandingAmount: number;
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
  const [friends, setFriends] = useState<EnrichedFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedFriend | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

  const loadFriends = async () => {
    setLoading(true);
    try {
      const data = await backendService.getFriendsEnriched();
      setFriends(data);
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

  const openFriendProfile = (friendId: string) => {
    localStorage.setItem('viewingFriendId', friendId);
    setCurrentPage('friend-profile');
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
      await backendService.deleteFriendRemote(deleteTarget.id);
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

  const filtered = friends.filter((f) =>
    !search.trim() ||
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.email || '').toLowerCase().includes(search.toLowerCase())
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
            {filtered.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <button data-testid={`friends-list-button-3-${friend.id}`}
                  type="button"
                  onClick={() => openFriendProfile(friend.id)}
                  className="flex flex-1 items-center gap-3 text-left min-w-0"
                >
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarImage src={undefined} alt={friend.name} />
                    <AvatarFallback className={`${getToneClass(friend.name)} font-bold`}>
                      {friend.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{friend.name}</p>
                      {friend.isRegistered ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          <ShieldCheck size={11} /> Kanaku User
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                          <UserCircle2 size={11} /> Guest
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{friend.email || friend.phone || 'No contact info'}</p>
                  </div>
                </button>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{friend.totalExpenses} expense{friend.totalExpenses === 1 ? '' : 's'}</p>
                    <p className={`text-sm font-bold ${friend.outstandingAmount > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                      {friend.outstandingAmount > 0 ? formatCurrency(friend.outstandingAmount) : 'Settled'}
                    </p>
                  </div>
                  <button data-testid={`friends-list-remove-friend-${friend.id}`}
                    type="button"
                    onClick={() => setDeleteTarget(friend)}
                    title="Remove friend"
                    className="p-2 text-gray-300 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
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
