import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus, Trash2, Archive, CheckCircle2, ListTodo, ChevronRight,
  ArchiveRestore, X, Users, User, UserPlus, Check, Search
} from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import type { ToDoList, Friend } from '@/lib/database';
import {
  saveToDoListWithBackendSync,
  deleteToDoListWithBackendSync,
  updateToDoListWithBackendSync,
  saveToDoListShareWithBackendSync,
} from '@/lib/auth-sync-integration';
import { cn } from '@/lib/utils';

import '@/styles/premium-transactions.css';

type ListType = 'individual' | 'together';

interface CollaboratorDraft {
  id: string;
  name: string;
  email?: string;
  friendId?: number;
}

const createDraftId = () => `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const ToDoLists: React.FC = () => {
  const { setCurrentPage } = useApp();
  const { user } = useAuth();

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [listType, setListType] = useState<ListType>('individual');
  const [collaborators, setCollaborators] = useState<CollaboratorDraft[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [showNewCollaboratorInput, setShowNewCollaboratorInput] = useState(false);
  const [newCollaboratorName, setNewCollaboratorName] = useState('');
  const [newCollaboratorEmail, setNewCollaboratorEmail] = useState('');

  // Other state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<{ id: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  const currentUserId = user?.id ?? null;

  // Friends from Dexie
  const friends: Friend[] = (useLiveQuery(
    () => db.friends.filter(f => !f.deletedAt).toArray(),
    []
  ) || []) as Friend[];

  const toDoLists = useLiveQuery<ToDoList[]>(
    async () => {
      if (!currentUserId) return [];
      const owned = await db.toDoLists.filter(list => list.ownerId === currentUserId).toArray();
      const shares = await db.toDoListShares.where('sharedWithUserId').equals(currentUserId).toArray();
      const sharedListIds = shares.map(share => share.listId);
      const shared = sharedListIds.length > 0
        ? await db.toDoLists.filter(list => sharedListIds.includes(list.id!) && list.ownerId !== currentUserId).toArray()
        : [];
      const combined = [...owned, ...shared];
      const uniqueMap = new Map<number, ToDoList>();
      combined.forEach(list => { if (list.id !== undefined) uniqueMap.set(list.id, list); });
      return Array.from(uniqueMap.values());
    },
    [currentUserId]
  ) || [];

  // Split: individual + owned together → "My Lists"; shared together → "Shared Lists"
  const myLists = toDoLists.filter(l => l.ownerId === currentUserId);
  const sharedLists = toDoLists.filter(l => l.ownerId !== currentUserId);

  const activeMy = myLists.filter(l => !l.archived);
  const archivedMy = myLists.filter(l => l.archived);
  const activeShared = sharedLists.filter(l => !l.archived);
  const archivedShared = sharedLists.filter(l => l.archived);

  const displayedMy = activeTab === 'active' ? activeMy : archivedMy;
  const displayedShared = activeTab === 'active' ? activeShared : archivedShared;

  // Friend search filtering
  const filteredFriends = friends.filter(f => {
    if (!friendSearch.trim()) return true;
    const q = friendSearch.toLowerCase();
    return f.name.toLowerCase().includes(q) || (f.email || '').toLowerCase().includes(q);
  });

  const isCollaboratorAdded = (f: Friend) =>
    collaborators.some(c => c.friendId === f.id || c.name.toLowerCase() === f.name.toLowerCase());

  const addCollaboratorFromFriend = (f: Friend) => {
    if (isCollaboratorAdded(f)) return;
    setCollaborators(prev => [...prev, {
      id: createDraftId(),
      name: f.name,
      email: f.email,
      friendId: f.id,
    }]);
  };

  const addNewCollaborator = async () => {
    const name = newCollaboratorName.trim();
    if (!name) return;
    const email = newCollaboratorEmail.trim() || undefined;
    // Save as friend if not already exists
    const existing = friends.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (!existing) {
      await db.friends.add({ name, email, createdAt: new Date(), updatedAt: new Date(), syncStatus: 'pending' });
    }
    setCollaborators(prev => [...prev, { id: createDraftId(), name, email }]);
    setNewCollaboratorName('');
    setNewCollaboratorEmail('');
    setShowNewCollaboratorInput(false);
  };

  const removeCollaborator = (id: string) => {
    setCollaborators(prev => prev.filter(c => c.id !== id));
  };

  const resetModal = () => {
    setNewListName('');
    setNewListDescription('');
    setListType('individual');
    setCollaborators([]);
    setFriendSearch('');
    setShowNewCollaboratorInput(false);
    setNewCollaboratorName('');
    setNewCollaboratorEmail('');
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) { toast.error('List name is required'); return; }
    if (listType === 'together' && collaborators.length === 0) {
      toast.error('Add at least one collaborator for a Together list');
      return;
    }
    setIsCreating(true);
    try {
      const savedList = await saveToDoListWithBackendSync({
        name: newListName.trim(),
        description: newListDescription.trim() || undefined,
        ownerId: currentUserId || 'local',
        listType,
        createdAt: new Date(),
        archived: false,
      });

      // Share with all collaborators
      if (listType === 'together' && savedList.id) {
        await Promise.allSettled(
          collaborators
            .filter(c => c.email)
            .map(c => saveToDoListShareWithBackendSync(savedList.id!, c.email!, 'edit'))
        );
      }

      toast.success(`${listType === 'together' ? 'Shared list' : 'List'} created`);
      resetModal();
      setShowCreateModal(false);
      if (savedList.id) {
        localStorage.setItem('viewingToDoListId', savedList.id.toString());
        setCurrentPage('todo-list-detail');
      }
    } catch {
      toast.error('Failed to create list');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteList = (listId: number, listName: string) => {
    setListToDelete({ id: listId, name: listName });
    setDeleteModalOpen(true);
  };

  const confirmDeleteList = async () => {
    if (!listToDelete) return;
    setIsDeleting(true);
    try {
      await deleteToDoListWithBackendSync(listToDelete.id);
      toast.success('List deleted');
      setDeleteModalOpen(false);
      setListToDelete(null);
    } catch {
      toast.error('Failed to delete list');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenList = (listId: number) => {
    localStorage.setItem('viewingToDoListId', listId.toString());
    setCurrentPage('todo-list-detail');
  };

  const handleArchiveList = async (e: React.MouseEvent, list: ToDoList) => {
    e.stopPropagation();
    try {
      await updateToDoListWithBackendSync(list.id!, { archived: !list.archived });
      toast.success(list.archived ? 'List restored' : 'List archived');
    } catch {
      toast.error('Failed to update list');
    }
  };

  const renderListCard = (list: ToDoList, isShared = false) => {
    const isTogether = list.listType === 'together';
    return (
      <div data-testid="to-do-lists-div"
        key={list.id}
        onClick={() => handleOpenList(list.id!)}
        className="premium-glass-card p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all group"
      >
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
          isTogether
            ? 'bg-violet-50 group-hover:bg-violet-100'
            : 'bg-indigo-50 group-hover:bg-indigo-100'
        )}>
          {isTogether
            ? <Users size={18} className="text-violet-600" />
            : <ListTodo size={18} className="text-indigo-600" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-slate-900 truncate">{list.name}</p>
            {isTogether && (
              <span className="shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 border border-violet-100">
                Together
              </span>
            )}
            {isShared && (
              <span className="shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100">
                Shared
              </span>
            )}
          </div>
          {list.description && (
            <p className="text-[11px] font-semibold text-slate-400 truncate mt-0.5">{list.description}</p>
          )}
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1">
            {new Date(list.createdAt).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isShared && (
            <button
              type="button"
              onClick={e => handleArchiveList(e, list)}
              title={list.archived ? 'Restore list' : 'Archive list'}
              data-testid={`todo-list-${list.id}-archive-button`}
              className="p-2 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
            >
              {list.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            </button>
          )}
          {!isShared && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); handleDeleteList(list.id!, list.name); }}
              title="Delete list"
              data-testid={`todo-list-${list.id}-delete-button`}
              className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
            >
              <Trash2 size={15} />
            </button>
          )}
          <ChevronRight size={15} className="text-slate-200 ml-1" />
        </div>
      </div>
    );
  };

  const totalActive = activeMy.length + activeShared.length;
  const totalArchived = archivedMy.length + archivedShared.length;

  return (
    <div className="flex flex-col min-h-screen bg-white">

      {/* Header */}
      <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <ListTodo size={18} className="text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">To-Do Lists</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {totalActive} active · {totalArchived} archived
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            data-testid="todo-new-list-button"
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
          >
            <Plus size={14} />
            New List
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 p-1 bg-slate-100/60 rounded-xl">
          {(['active', 'archived'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              data-testid={`todo-tab-${tab}-button`}
              className={cn(
                'flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                activeTab === tab
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              )}
            >
              {tab} ({tab === 'active' ? totalActive : totalArchived})
            </button>
          ))}
        </div>
      </header>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pb-[calc(var(--bottom-nav-height)+1.25rem)] sm:pb-4">
          <div data-testid="to-do-lists-div-2" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowCreateModal(false); resetModal(); }} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl z-10 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h3 className="text-base font-black text-slate-900">Create New List</h3>
              <button onClick={() => { setShowCreateModal(false); resetModal(); }} title="Close" data-testid="todo-create-modal-close-button" className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* List Type Selection */}
              <div className="space-y-2">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">List Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setListType('individual')}
                    data-testid="todo-list-type-individual-button"
                    className={cn(
                      'flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left',
                      listType === 'individual'
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                      listType === 'individual' ? 'border-indigo-600' : 'border-slate-300'
                    )}>
                      {listType === 'individual' && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                    </div>
                    <div>
                      <p className={cn('text-[10px] font-black uppercase tracking-widest', listType === 'individual' ? 'text-indigo-700' : 'text-slate-600')}>Individual</p>
                      <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Only you</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setListType('together')}
                    data-testid="todo-list-type-together-button"
                    className={cn(
                      'flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left',
                      listType === 'together'
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                      listType === 'together' ? 'border-violet-600' : 'border-slate-300'
                    )}>
                      {listType === 'together' && <div className="w-2 h-2 rounded-full bg-violet-600" />}
                    </div>
                    <div>
                      <p className={cn('text-[10px] font-black uppercase tracking-widest', listType === 'together' ? 'text-violet-700' : 'text-slate-600')}>Together</p>
                      <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Collaborative</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* List Name */}
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">List Name *</label>
                <input
                  type="text"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && listType === 'individual' && handleCreateList()}
                  placeholder="e.g., Weekly Tasks"
                  autoFocus
                  data-testid="todo-create-name-input"
                  className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                <textarea
                  value={newListDescription}
                  onChange={e => setNewListDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  data-testid="todo-create-description-textarea"
                  className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>

              {/* Collaborators Section — Together only */}
              {listType === 'together' && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-violet-100" />
                    <span className="text-[8px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1">
                      <Users size={9} />Collaborators
                    </span>
                    <div className="h-px flex-1 bg-violet-100" />
                  </div>

                  {/* Selected collaborators */}
                  {collaborators.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {collaborators.map(c => (
                        <div
                          key={c.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 border border-violet-100 rounded-lg"
                        >
                          <div className="w-5 h-5 rounded-full bg-violet-200 flex items-center justify-center text-[9px] font-black text-violet-700 uppercase">
                            {c.name[0]}
                          </div>
                          <span className="text-[10px] font-bold text-violet-800">{c.name}</span>
                          <button
                            type="button"
                            onClick={() => removeCollaborator(c.id)}
                            title={`Remove ${c.name}`}
                            data-testid={`todo-remove-collaborator-${c.id}-button`}
                            className="text-violet-300 hover:text-violet-600 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Friend search */}
                  {friends.length > 0 && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                        <input
                          type="text"
                          value={friendSearch}
                          onChange={e => setFriendSearch(e.target.value)}
                          placeholder="Search friends…"
                          data-testid="todo-collaborator-search-input"
                          className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-8 pr-4 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-violet-200 outline-none"
                        />
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {filteredFriends.map(f => {
                          const added = isCollaboratorAdded(f);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => addCollaboratorFromFriend(f)}
                              disabled={added}
                              data-testid={`todo-add-friend-${f.id}-button`}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left',
                                added
                                  ? 'bg-violet-50 cursor-default'
                                  : 'hover:bg-violet-50 bg-white border border-slate-100'
                              )}
                            >
                              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600 uppercase shrink-0">
                                {f.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{f.name}</p>
                                {f.email && <p className="text-[9px] text-slate-400 truncate">{f.email}</p>}
                              </div>
                              {added
                                ? <Check size={12} className="text-violet-500 shrink-0" />
                                : <Plus size={12} className="text-slate-300 shrink-0" />
                              }
                            </button>
                          );
                        })}
                        {filteredFriends.length === 0 && friendSearch && (
                          <p className="text-[10px] text-slate-400 font-semibold text-center py-2">No friends found</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Add new collaborator */}
                  {showNewCollaboratorInput ? (
                    <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-100 space-y-2">
                      <input
                        type="text"
                        value={newCollaboratorName}
                        onChange={e => setNewCollaboratorName(e.target.value)}
                        placeholder="Name *"
                        autoFocus
                        data-testid="todo-new-collaborator-name-input"
                        className="w-full bg-white border border-violet-100 rounded-lg py-2 px-3 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-violet-200 outline-none"
                      />
                      <input
                        type="email"
                        value={newCollaboratorEmail}
                        onChange={e => setNewCollaboratorEmail(e.target.value)}
                        placeholder="Email (needed to share)"
                        data-testid="todo-new-collaborator-email-input"
                        className="w-full bg-white border border-violet-100 rounded-lg py-2 px-3 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-violet-200 outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowNewCollaboratorInput(false); setNewCollaboratorName(''); setNewCollaboratorEmail(''); }}
                          data-testid="todo-new-collaborator-cancel-button"
                          className="flex-1 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={addNewCollaborator}
                          disabled={!newCollaboratorName.trim()}
                          data-testid="todo-new-collaborator-add-button"
                          className="flex-1 py-1.5 bg-violet-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNewCollaboratorInput(true)}
                      data-testid="todo-add-new-collaborator-toggle-button"
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-violet-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-violet-500 hover:bg-violet-50 hover:border-violet-300 transition-all"
                    >
                      <UserPlus size={13} />
                      Add New Friend
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="p-5 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); resetModal(); }}
                data-testid="todo-create-cancel-button"
                className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateList}
                disabled={isCreating || !newListName.trim()}
                data-testid="todo-create-submit-button"
                className={cn(
                  'flex-1 py-3 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50',
                  listType === 'together'
                    ? 'bg-violet-600 hover:bg-violet-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                )}
              >
                {isCreating ? 'Creating…' : 'Create List'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List Content */}
      <main className="flex-1 p-4 lg:p-6 pb-28 space-y-6">

        {/* My Lists section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <User size={13} className="text-indigo-400" />
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">My Lists</h2>
            <span className="text-[9px] font-black text-slate-300">({displayedMy.length})</span>
          </div>

          {displayedMy.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-slate-50/50 rounded-2xl border border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                <CheckCircle2 size={22} className="text-slate-300" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {activeTab === 'active' ? 'No lists yet' : 'Nothing archived'}
              </p>
              {activeTab === 'active' && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  data-testid="todo-create-first-list-button"
                  className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Plus size={12} />Create First List
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {displayedMy.map(list => renderListCard(list, false))}
            </div>
          )}
        </section>

        {/* Shared Lists section */}
        {(displayedShared.length > 0 || activeShared.length > 0 || archivedShared.length > 0) && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Users size={13} className="text-violet-400" />
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Shared With Me</h2>
              <span className="text-[9px] font-black text-slate-300">({displayedShared.length})</span>
            </div>

            {displayedShared.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {activeTab === 'active' ? 'No shared lists' : 'Nothing archived'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedShared.map(list => renderListCard(list, true))}
              </div>
            )}
          </section>
        )}
      </main>

      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        title="Delete List"
        message="This to-do list and all its items will be permanently deleted."
        itemName={listToDelete?.name}
        isLoading={isDeleting}
        onConfirm={confirmDeleteList}
        onCancel={() => { setDeleteModalOpen(false); setListToDelete(null); }}
      />
    </div>
  );
};
