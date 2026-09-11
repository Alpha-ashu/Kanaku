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
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            data-testid="to-do-list-share-back"
            onClick={() => setCurrentPage('todo-list-detail')}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
            title="Back to List"
            aria-label="Back to List"
          >
            <ArrowLeft size={18} className="text-slate-700" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none truncate">
              Share "{toDoList.name}"
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-6 space-y-4 pb-28">

        {/* No Friends State */}
        {friends.length === 0 ? (
          <div className="bg-white rounded-[28px] sm:rounded-[32px] p-8 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Users size={24} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">No friends yet</p>
              <p className="text-xs font-semibold text-slate-400 mt-1">
                Add friends to your contacts to share lists with them.
              </p>
            </div>
            <button data-testid="to-do-list-share-add-friends"
              onClick={() => setCurrentPage('add-friends')}
              className="flex items-center gap-2 px-6 py-3 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs active:scale-95 transition-all shadow-xs cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Add Friends</span>
            </button>
          </div>
        ) : (
          /* Share Form */
          <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-7 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Share With</p>
              <button data-testid="to-do-list-share-add-friend"
                onClick={() => setCurrentPage('add-friends')}
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <UserPlus size={13} />
                <span>Add Friend</span>
              </button>
            </div>

            {/* Friend Picker */}
            <div className="relative">
              <select data-testid="to-do-list-share-select-friend-to-share"
                value={selectedFriendEmail}
                onChange={e => setSelectedFriendEmail(e.target.value)}
                aria-label="Select friend to share with"
                className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-4 pr-10 font-bold text-slate-900 text-sm appearance-none focus:ring-2 focus:ring-indigo-200 outline-none"
              >
                <option data-testid="to-do-list-share-choose-a-friend" value="">Choose a friend…</option>
                {friends.map(f => (
                  <option data-testid={`to-do-list-share-option-${f.id}`} key={f.id} value={f.email}>
                    {f.name} {f.email ? `(${f.email})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Permission */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Permission Level</p>
              <div className="grid grid-cols-2 gap-2">
                {(['view', 'edit'] as const).map(p => (
                  <button data-testid={`to-do-list-share-button-${p}`}
                    key={p}
                    onClick={() => setPermission(p)}
                    className={cn(
                      'py-2.5 px-4 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer capitalize',
                      permission === p
                        ? 'bg-[#18181B] text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    )}
                  >
                    {p === 'view' ? <Lock size={12} /> : <Edit size={12} />}
                    <span>{p === 'view' ? 'Can View' : 'Can Edit'}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleShareList}
              disabled={isSharing || !selectedFriendEmail}
              data-testid="to-do-list-share-submit-button"
              className="w-full py-3.5 bg-[#18181B] hover:bg-black text-white rounded-full text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <Send size={14} />
              <span>{isSharing ? 'Sharing…' : 'Share List'}</span>
            </button>
          </div>
        )}

        {/* Shared With List */}
        <div className="space-y-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            Shared With ({sharedWith.length})
          </p>

          {sharedWith.length === 0 ? (
            <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 border border-slate-100 text-center shadow-xs">
              <p className="text-xs font-bold text-slate-400">Not shared with anyone yet</p>
            </div>
          ) : (
            sharedWith.map(share => (
              <div key={share.id} className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-5 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm shrink-0">
                  {getFriendName(share.sharedWithUserId)[0]?.toUpperCase() || '?'}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{getFriendName(share.sharedWithUserId)}</p>
                  <span className={cn(
                    'inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full mt-1',
                    share.permission === 'view' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-600'
                  )}>
                    {share.permission === 'view' ? <Lock size={9} /> : <Edit size={9} />}
                    {share.permission === 'view' ? 'View Only' : 'Can Edit'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button data-testid={`to-do-list-share-share-permission-view-upgrade-${share.id}`}
                    onClick={() => handleUpdatePermission(share.id!, share.permission === 'view' ? 'edit' : 'view')}
                    title={share.permission === 'view' ? 'Upgrade to Edit' : 'Downgrade to View'}
                    className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
                  >
                    {share.permission === 'view' ? <Edit size={14} /> : <Lock size={14} />}
                  </button>
                  <button data-testid={`to-do-list-share-remove-access-${share.id}`}
                    onClick={() => handleRemoveShare(share.id!)}
                    title="Remove access"
                    className="w-8 h-8 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center transition-all cursor-pointer"
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
