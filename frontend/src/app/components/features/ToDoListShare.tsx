import React, { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Share2, Trash2, Lock, Edit, ArrowLeft, UserPlus, Users, Send, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import {
  saveToDoListShareWithBackendSync,
  updateToDoListShareWithBackendSync,
  deleteToDoListShareWithBackendSync
} from '@/lib/auth-sync-integration';
import { cn } from '@/lib/utils';

export const ToDoListShare: React.FC = () => {
  const { setCurrentPage } = useApp();
  const [listId, setListId] = useState<number | null>(null);
  const [toDoList, setToDoList] = useState<any>(null);
  const [selectedFriendEmail, setSelectedFriendEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [isSharing, setIsSharing] = useState(false);

  const friends = useLiveQuery(
    () => db.friends.filter(f => !f.deletedAt && !!f.email).toArray(),
    []
  ) || [];

  useEffect(() => {
    const id = localStorage.getItem('sharingToDoListId');
    if (id) setListId(parseInt(id));
    return () => { localStorage.removeItem('sharingToDoListId'); };
  }, []);

  useEffect(() => {
    if (listId) db.toDoLists.get(listId).then(list => list && setToDoList(list));
  }, [listId]);

  const sharedWith: any[] = (useLiveQuery(
    () => listId ? db.toDoListShares.where('listId').equals(listId).toArray() : Promise.resolve([] as any[]),
    [listId]
  ) || []);

  const handleShareList = async () => {
    if (!selectedFriendEmail.trim()) { toast.error('Select a friend to share with'); return; }
    if (!listId) return;

    const existing = sharedWith.find(s => s.sharedWithUserId === selectedFriendEmail);
    if (existing) { toast.error('Already shared with this person'); return; }

    setIsSharing(true);
    try {
      await saveToDoListShareWithBackendSync(listId, selectedFriendEmail, permission);
      toast.success('List shared successfully');
      setSelectedFriendEmail('');
      setPermission('view');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to share list');
    } finally {
      setIsSharing(false);
    }
  };

  const handleRemoveShare = async (shareId: number) => {
    try {
      await deleteToDoListShareWithBackendSync(shareId);
      toast.success('Share removed');
    } catch {
      toast.error('Failed to remove share');
    }
  };

  const handleUpdatePermission = async (shareId: number, newPermission: 'view' | 'edit') => {
    try {
      await updateToDoListShareWithBackendSync(shareId, newPermission);
      toast.success('Permission updated');
    } catch {
      toast.error('Failed to update permission');
    }
  };

  const getFriendName = (userId: string): string => {
    const f = friends.find(fr => fr.email === userId || fr.cloudId === userId || String(fr.id) === userId);
    return f?.name || userId;
  };

  if (!toDoList) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-10 h-10 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">

      {/* Header */}
      <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button data-testid="to-do-list-share-back"
            onClick={() => setCurrentPage('todo-list-detail')}
            className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Share2 size={18} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900 leading-none">Share List</h1>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate max-w-[220px]">
              "{toDoList.name}"
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-6 space-y-4 pb-28">

        {/* No Friends State */}
        {friends.length === 0 ? (
          <div className="premium-glass-card p-8 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Users size={24} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">No friends yet</p>
              <p className="text-[11px] font-semibold text-slate-400 mt-1">
                Add friends to your contacts to share lists with them.
              </p>
            </div>
            <button data-testid="to-do-list-share-add-friends"
              onClick={() => setCurrentPage('add-friends')}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-100"
            >
              <UserPlus size={14} />
              Add Friends
            </button>
          </div>
        ) : (
          /* Share Form */
          <div className="premium-glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Share With</p>
              <button data-testid="to-do-list-share-add-friend"
                onClick={() => setCurrentPage('add-friends')}
                className="flex items-center gap-1.5 text-[9px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest"
              >
                <UserPlus size={11} />
                Add Friend
              </button>
            </div>

            {/* Friend Picker */}
            <div className="relative">
              <select data-testid="to-do-list-share-select-friend-to-share"
                value={selectedFriendEmail}
                onChange={e => setSelectedFriendEmail(e.target.value)}
                aria-label="Select friend to share with"
                className="w-full bg-slate-50 border-none rounded-xl py-3 pl-4 pr-10 font-bold text-slate-900 text-sm appearance-none focus:ring-2 focus:ring-indigo-200 outline-none"
              >
                <option data-testid="to-do-list-share-choose-a-friend" value="">Choose a friend…</option>
                {friends.map(f => (
                  <option data-testid={`to-do-list-share-option-${f.id}`} key={f.id} value={f.email}>
                    {f.name} {f.email ? `(${f.email})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Permission */}
            <div className="space-y-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Permission Level</p>
              <div className="grid grid-cols-2 gap-2">
                {(['view', 'edit'] as const).map(p => (
                  <button data-testid={`to-do-list-share-button-${p}`}
                    key={p}
                    onClick={() => setPermission(p)}
                    className={cn(
                      'py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1',
                      permission === p
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    )}
                  >
                    {p === 'view' ? <Lock size={14} /> : <Edit size={14} />}
                    {p === 'view' ? 'View Only' : 'Can Edit'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 font-semibold">
                {permission === 'view'
                  ? 'Can view tasks but cannot make changes.'
                  : 'Can view and modify tasks in this list.'}
              </p>
            </div>

            <button data-testid="to-do-list-share-button-2"
              onClick={handleShareList}
              disabled={isSharing || !selectedFriendEmail}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
            >
              <Send size={13} />
              {isSharing ? 'Sharing…' : 'Share List'}
            </button>
          </div>
        )}

        {/* Shared With List */}
        <div className="space-y-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            Shared With ({sharedWith.length})
          </p>

          {sharedWith.length === 0 ? (
            <div className="premium-glass-card p-6 text-center">
              <p className="text-[11px] font-bold text-slate-400">Not shared with anyone yet</p>
            </div>
          ) : (
            sharedWith.map(share => (
              <div key={share.id} className="premium-glass-card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-sm shrink-0">
                  {getFriendName(share.sharedWithUserId)[0]?.toUpperCase() || '?'}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{getFriendName(share.sharedWithUserId)}</p>
                  <span className={cn(
                    'inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1',
                    share.permission === 'view' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-600'
                  )}>
                    {share.permission === 'view' ? <Lock size={9} /> : <Edit size={9} />}
                    {share.permission === 'view' ? 'View Only' : 'Can Edit'}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button data-testid={`to-do-list-share-share-permission-view-upgrade-${share.id}`}
                    onClick={() => handleUpdatePermission(share.id!, share.permission === 'view' ? 'edit' : 'view')}
                    title={share.permission === 'view' ? 'Upgrade to Edit' : 'Downgrade to View'}
                    className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                  >
                    {share.permission === 'view' ? <Edit size={14} /> : <Lock size={14} />}
                  </button>
                  <button data-testid={`to-do-list-share-remove-access-${share.id}`}
                    onClick={() => handleRemoveShare(share.id!)}
                    title="Remove access"
                    className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};
