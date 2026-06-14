import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Share2, Archive, CheckCircle2, ListTodo } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import type { ToDoList } from '@/lib/database';
import {
  saveToDoListWithBackendSync,
  deleteToDoListWithBackendSync,
  updateToDoListWithBackendSync
} from '@/lib/auth-sync-integration';

export const ToDoLists: React.FC = () => {
  const { setCurrentPage } = useApp();
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<{ id: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Use actual user ID - if not authenticated, show empty state
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
      combined.forEach(list => {
        if (list.id !== undefined) {
          uniqueMap.set(list.id, list);
        }
      });
      return Array.from(uniqueMap.values());
    },
    [currentUserId]
  ) || [];

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast.error('List name is required');
      return;
    }

    try {
      const savedList = await saveToDoListWithBackendSync({
        name: newListName,
        description: newListDescription || undefined,
        ownerId: currentUserId || 'local',
        createdAt: new Date(),
        archived: false,
      });

      const listId = savedList.id;

      toast.success('To-Do List created successfully');
      setNewListName('');
      setNewListDescription('');
      setShowCreateModal(false);

      if (listId) {
        // Navigate to the newly created list
        localStorage.setItem('viewingToDoListId', listId.toString());
        setCurrentPage('todo-list-detail');
      }
    } catch (error) {
      console.error('Failed to create list:', error);
      toast.error('Failed to create list');
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
      toast.success('List deleted successfully');
      setDeleteModalOpen(false);
      setListToDelete(null);
    } catch (error) {
      console.error('Failed to delete list:', error);
      toast.error('Failed to delete list');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenList = (listId: number) => {
    localStorage.setItem('viewingToDoListId', listId.toString());
    setCurrentPage('todo-list-detail');
  };

  const handleShareList = (listId: number) => {
    localStorage.setItem('sharingToDoListId', listId.toString());
    setCurrentPage('todo-list-share');
  };

  const handleArchiveList = async (listId: number) => {
    try {
      const list = await db.toDoLists.get(listId);
      if (list) {
        await updateToDoListWithBackendSync(listId, { archived: !list.archived });
        toast.success(list.archived ? 'List unarchived' : 'List archived');
      }
    } catch (error) {
      console.error('Failed to archive list:', error);
      toast.error('Failed to update list');
    }
  };

 return (
 <CenteredLayout>
 <div className="space-y-6">
 {/* Header with Back Button */}
 <PageHeader
 title="To-Do Lists"
 subtitle="Create and manage your tasks"
 icon={<ListTodo size={20} className="sm:w-6 sm:h-6" />}
 >
 <button
 onClick={() => setShowCreateModal(true)}
 className="flex items-center gap-2 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-900 transition-colors font-medium"
 >
 <Plus size={20} />
 New List
 </button>
 </PageHeader>

  {/* Create Modal */}
  {showCreateModal && (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={() => setShowCreateModal(false)} 
      />
      <div className="relative bg-white rounded-2xl p-8 w-full max-w-md border border-gray-200 shadow-lg z-10 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Create New List</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              List Name *
            </label>
            <input
              type="text"
              name="name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="e.g., Weekly Tasks"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={newListDescription}
              onChange={(e) => setNewListDescription(e.target.value)}
              placeholder="Add a description for this list"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
              rows={3}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowCreateModal(false)}
              className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateList}
              className="flex-1 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-900 transition-colors font-medium"
            >
              Create List
            </button>
          </div>
        </div>
      </div>
    </div>
  )}

 {/* Lists Grid */}
 {toDoLists.length === 0 ? (
 <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-12 text-center border border-gray-200">
 <CheckCircle2 size={48} className="mx-auto text-gray-300 mb-4" />
 <h3 className="text-lg font-semibold text-gray-900 mb-2">No To-Do Lists Yet</h3>
 <p className="text-gray-500 mb-6">Create your first to-do list to get started</p>
 <button
 onClick={() => setShowCreateModal(true)}
 className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-900 transition-colors font-medium"
 >
 <Plus size={20} />
 Create First List
 </button>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
 {toDoLists.map((list) => (
 <div
 key={list.id}
 className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-all hover:border-gray-300"
 >
 <div className="flex items-start justify-between mb-4">
 <div className="flex-1">
 <h3 className="text-lg font-semibold text-gray-900">{list.name}</h3>
 {list.description && (
 <p className="text-sm text-gray-500 mt-1">{list.description}</p>
 )}
 </div>
 {list.archived && (
 <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-medium">
 Archived
 </span>
 )}
 </div>

 <div className="text-xs text-gray-400 mb-4 font-medium">
 {new Date(list.createdAt).toLocaleDateString()}
 </div>

 <div className="flex gap-2">
 <button
 onClick={() => handleOpenList(list.id!)}
 className="flex-1 px-3 py-2 bg-black text-white rounded-lg hover:bg-gray-900 transition-colors font-medium text-sm"
 >
 Open
 </button>
 <button
 onClick={() => handleShareList(list.id!)}
 title="Share this list"
 className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
 >
 <Share2 size={18} />
 </button>
 <button
 onClick={() => handleArchiveList(list.id!)}
 title={list.archived ? 'Unarchive list' : 'Archive list'}
 className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
 >
 <Archive size={18} />
 </button>
 <button
 onClick={() => handleDeleteList(list.id!, list.name)}
 title="Delete list"
 className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
 >
 <Trash2 size={18} />
 </button>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 <DeleteConfirmModal
 isOpen={deleteModalOpen}
 title="Delete List"
 message="This to-do list and all its items will be permanently deleted. All shares and collaborations will also be removed."
 itemName={listToDelete?.name}
 isLoading={isDeleting}
 onConfirm={confirmDeleteList}
 onCancel={() => {
 setDeleteModalOpen(false);
 setListToDelete(null);
 }}
 />
 </CenteredLayout>
 );
};

