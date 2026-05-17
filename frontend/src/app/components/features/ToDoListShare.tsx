import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { Send, Trash2, Lock, Edit, Share2 } from 'lucide-react';
import { toast } from 'sonner';

export const ToDoListShare: React.FC = () => {
 const { user } = useAuth();
 const [listId, setListId] = useState<number | null>(null);
 const [toDoList, setToDoList] = useState<any>(null);
 const [sharedUserId, setSharedUserId] = useState('');
 const [permission, setPermission] = useState<'view' | 'edit'>('view');

 const availableUsers = [
 { id: 'user-2', name: 'Alice' },
 { id: 'user-3', name: 'Bob' },
 { id: 'user-4', name: 'Charlie' },
 { id: 'user-5', name: 'Diana' },
 ];

 // Use actual user ID or fallback for demo data
 const currentUserId = user?.id ?? null;

 // Get list ID from localStorage
 useEffect(() => {
 const id = localStorage.getItem('sharingToDoListId');
 if (id) {
 setListId(parseInt(id));
 }
 // Cleanup on unmount
 return () => {
 localStorage.removeItem('sharingToDoListId');
 };
 }, []);

 // Fetch list details
 useEffect(() => {
 if (listId) {
 db.toDoLists.get(listId).then((list) => {
 if (list) {
 setToDoList(list);
 }
 });
 }
 }, [listId]);

 const sharedWith: any[] = (useLiveQuery(
 () => (listId ? (db.toDoListShares.where('listId').equals(listId).toArray() as any) : Promise.resolve([])),
 [listId]
 ) || []);

 const handleShareList = async () => {
 if (!sharedUserId.trim()) {
 toast.error('Please select a user');
 return;
 }

 if (!listId) {
 toast.error('No list selected');
 return;
 }

 // Check if already shared with this user
 const existing = sharedWith.find((s: any) => s.sharedWithUserId === sharedUserId);
 if (existing) {
 toast.error('This list is already shared with this user');
 return;
 }

 try {
 await db.toDoListShares.add({
 listId: listId!,
 sharedWithUserId: sharedUserId,
 permission,
 sharedAt: new Date(),
 sharedBy: currentUserId,
 });

 toast.success('List shared successfully');
 setSharedUserId('');
 setPermission('view');
 } catch (error) {
 console.error('Failed to share list:', error);
 toast.error('Failed to share list');
 }
 };

 const handleRemoveShare = async (shareId: number) => {
 try {
 await db.toDoListShares.delete(shareId);
 toast.success('Share removed');
 } catch (error) {
 console.error('Failed to remove share:', error);
 toast.error('Failed to remove share');
 }
 };

 const handleUpdatePermission = async (shareId: number, newPermission: 'view' | 'edit') => {
 try {
 await db.toDoListShares.update(shareId, { permission: newPermission });
 toast.success('Permission updated');
 } catch (error) {
 console.error('Failed to update permission:', error);
 toast.error('Failed to update permission');
 }
 };

 const getSharedUserName = (userId: string): string => {
 const user = availableUsers.find((u: any) => u.id === userId);
 return user?.name || userId;
 };

 if (!toDoList) {
 return (
 <CenteredLayout>
 <div className="flex items-center justify-center h-screen">
 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
 </div>
 </CenteredLayout>
 );
 }

 return (
 <CenteredLayout>
 <div className="space-y-6">
 {/* Header */}
 <PageHeader
 title="Share List"
 subtitle={`Share"${toDoList.name}" with other users`}
 icon={<Share2 size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="todo-list-detail"
 />

 {/* Share Form */}
 <div className="bg-white rounded-xl border border-gray-200 p-6">
 <h3 className="text-lg font-semibold mb-4">Add User</h3>
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Select User *
 </label>
 <select
 value={sharedUserId}
 onChange={(e) => setSharedUserId(e.target.value)}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="Select user to share with"
 >
 <option value="">Choose a user...</option>
 {availableUsers.map((user: any) => (
 <option key={user.id} value={user.id}>
 {user.name}
 </option>
 ))}
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Permission
 </label>
 <select
 value={permission}
 onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="Select permission level"
 >
 <option value="view">View Only</option>
 <option value="edit">Can Edit</option>
 </select>
 <p className="text-xs text-gray-500 mt-2">
 {permission === 'view'
 ? 'User can view tasks but cannot make changes'
 : 'User can view and modify tasks'}
 </p>
 </div>

 <button
 onClick={handleShareList}
 className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
 >
 <Send size={18} />
 Share List
 </button>
 </div>
 </div>

 {/* Shared Users List */}
 <div className="bg-white rounded-xl border border-gray-200 p-6">
 <h3 className="text-lg font-semibold mb-4">Shared With ({sharedWith.length})</h3>

 {sharedWith.length === 0 ? (
 <div className="text-center py-8 text-gray-500">
 <p>This list hasn't been shared with anyone yet</p>
 </div>
 ) : (
 <div className="space-y-3">
 {sharedWith.map((share: any) => (
 <div
 key={share.id}
 className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200"
 >
 <div>
 <p className="font-medium text-gray-900">
 {getSharedUserName(share.sharedWithUserId)}
 </p>
 <p className="text-sm text-gray-500">
 Shared {new Date(share.sharedAt).toLocaleDateString()} by {share.sharedBy}
 </p>
 </div>

 <div className="flex items-center gap-3">
 <div className="flex items-center gap-2">
 {share.permission === 'view' ? (
 <Lock size={16} className="text-gray-400" />
 ) : (
 <Edit size={16} className="text-blue-600" />
 )}
 <span
 className={`text-sm font-medium ${share.permission === 'view'
 ? 'text-gray-600'
 : 'text-blue-600'
 }`}
 >
 {share.permission === 'view' ? 'View Only' : 'Can Edit'}
 </span>
 </div>

 <div className="flex gap-2">
 {share.permission === 'view' ? (
 <button
 onClick={() => handleUpdatePermission(share.id!, 'edit')}
 title="Give edit permission"
 className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
 >
 <Edit size={18} />
 </button>
 ) : (
 <button
 onClick={() => handleUpdatePermission(share.id!, 'view')}
 title="Remove edit permission"
 className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
 >
 <Lock size={18} />
 </button>
 )}
 <button
 onClick={() => handleRemoveShare(share.id!)}
 title="Remove this user"
 className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
 >
 <Trash2 size={18} />
 </button>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </CenteredLayout>
 );
};

