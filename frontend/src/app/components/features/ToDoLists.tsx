import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Share2, Archive, CheckCircle2, ListTodo, ChevronRight, ArchiveRestore, X } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import type { ToDoList } from '@/lib/database';
import {
  saveToDoListWithBackendSync,
  deleteToDoListWithBackendSync,
  updateToDoListWithBackendSync
} from '@/lib/auth-sync-integration';
import { cn } from '@/lib/utils';

import '@/styles/premium-transactions.css';

export const ToDoLists: React.FC = () => {
  const { setCurrentPage } = useApp();
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<{ id: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  const currentUserId = user?.id ?? null;

  const toDoLists = useLiveQuery<ToDoList[]>(
    async () => {
      if (!currentUserId) return [];
      const owned = await db.toDoLists.filter(list => list.ownerId === currentUserId).toArray();
      const shares = await db.toDoListShares.where('sharedWithUserId').equals(currentUserId).toArray();
      const sharedListIds = shares.map(share => share.listId);
      const shared = sharedListIds.length > 0
        ? await db.toDoLists.filter(list => sharedListIds.includes(list.id!)).toArray()
        : [];
      const combined = [...owned, ...shared];
      const uniqueMap = new Map<number, ToDoList>();
      combined.forEach(list => { if (list.id !== undefined) uniqueMap.set(list.id, list); });
      return Array.from(uniqueMap.values());
    },
    [currentUserId]
  ) || [];

  const activeLists = toDoLists.filter(l => !l.archived);
  const archivedLists = toDoLists.filter(l => l.archived);
  const displayedLists = activeTab === 'active' ? activeLists : archivedLists;

  const handleCreateList = async () => {
    if (!newListName.trim()) { toast.error('List name is required'); return; }
    setIsCreating(true);
    try {
      const savedList = await saveToDoListWithBackendSync({
        name: newListName.trim(),
        description: newListDescription.trim() || undefined,
        ownerId: currentUserId || 'local',
        createdAt: new Date(),
        archived: false,
      });
      toast.success('List created');
      setNewListName('');
      setNewListDescription('');
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

  const handleShareList = (e: React.MouseEvent, listId: number) => {
    e.stopPropagation();
    localStorage.setItem('sharingToDoListId', listId.toString());
    setCurrentPage('todo-list-share');
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
                {activeLists.length} active · {archivedLists.length} archived
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
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
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                activeTab === tab
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              )}
            >
              {tab} ({tab === 'active' ? activeLists.length : archivedLists.length})
            </button>
          ))}
        </div>
      </header>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl z-10 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">Create New List</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">List Name *</label>
                <input
                  type="text"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreateList()}
                  placeholder="e.g., Weekly Tasks"
                  autoFocus
                  className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                <textarea
                  value={newListDescription}
                  onChange={e => setNewListDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateList}
                  disabled={isCreating || !newListName.trim()}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isCreating ? 'Creating…' : 'Create List'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List Content */}
      <main className="flex-1 p-4 lg:p-6 space-y-3 pb-28">
        {displayedLists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <CheckCircle2 size={28} className="text-slate-300" />
            </div>
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest">
              {activeTab === 'active' ? 'No lists yet' : 'Nothing archived'}
            </p>
            {activeTab === 'active' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
              >
                <Plus size={14} />
                Create First List
              </button>
            )}
          </div>
        ) : (
          displayedLists.map(list => (
            <div
              key={list.id}
              onClick={() => handleOpenList(list.id!)}
              className="premium-glass-card p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
                <ListTodo size={18} className="text-indigo-600" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">{list.name}</p>
                {list.description && (
                  <p className="text-[11px] font-semibold text-slate-400 truncate mt-0.5">{list.description}</p>
                )}
                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1">
                  {new Date(list.createdAt).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={e => handleShareList(e, list.id!)}
                  title="Share list"
                  className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                >
                  <Share2 size={15} />
                </button>
                <button
                  onClick={e => handleArchiveList(e, list)}
                  title={list.archived ? 'Restore list' : 'Archive list'}
                  className="p-2 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                >
                  {list.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteList(list.id!, list.name); }}
                  title="Delete list"
                  className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 size={15} />
                </button>
                <ChevronRight size={15} className="text-slate-200 ml-1" />
              </div>
            </div>
          ))
        )}
      </main>

      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        title="Delete List"
        message="This to-do list and all its items will be permanently deleted. All shares will also be removed."
        itemName={listToDelete?.name}
        isLoading={isDeleting}
        onConfirm={confirmDeleteList}
        onCancel={() => { setDeleteModalOpen(false); setListToDelete(null); }}
      />
    </div>
  );
};
