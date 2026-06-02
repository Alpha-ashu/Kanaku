import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, CheckCircle, Circle, ListTodo } from 'lucide-react';
import { toast } from 'sonner';
import type { ToDoItem } from '@/lib/database';
import {
  saveToDoItemWithBackendSync,
  updateToDoItemWithBackendSync,
  deleteToDoItemWithBackendSync
} from '@/lib/auth-sync-integration';

export const ToDoListDetail: React.FC = () => {
  const { user } = useAuth();
  const [listId, setListId] = useState<number | null>(null);
  const [toDoList, setToDoList] = useState<any>(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemPriority, setNewItemPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newItemDueDate, setNewItemDueDate] = useState('');

  // Use actual user ID or fallback for demo data
  const currentUserId = user?.id ?? null;

  // Get list ID from localStorage
  useEffect(() => {
    const id = localStorage.getItem('viewingToDoListId');
    if (id) {
      setListId(parseInt(id));
    }
    // Cleanup on unmount
    return () => {
      localStorage.removeItem('viewingToDoListId');
    };
  }, []);

  const items: any[] = (useLiveQuery(
    () => (listId ? (db.toDoItems.where('listId').equals(listId).toArray() as any) : Promise.resolve([])),
    [listId]
  ) || []);

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

  const handleAddItem = async () => {
    if (!newItemTitle.trim()) {
      toast.error('Task title is required');
      return;
    }

    if (!listId) {
      toast.error('No list selected');
      return;
    }

    try {
      await saveToDoItemWithBackendSync({
        listId,
        title: newItemTitle,
        description: newItemDescription || undefined,
        completed: false,
        priority: newItemPriority,
        dueDate: newItemDueDate ? new Date(newItemDueDate) : undefined,
        createdBy: currentUserId || 'local',
        createdAt: new Date(),
      });

      toast.success('Task added');
      setNewItemTitle('');
      setNewItemDescription('');
      setNewItemPriority('medium');
      setNewItemDueDate('');
    } catch (error) {
      console.error('Failed to add item:', error);
      toast.error('Failed to add task');
    }
  };

  const handleToggleItem = async (item: ToDoItem) => {
    try {
      await updateToDoItemWithBackendSync(item.id!, {
        completed: !item.completed,
        completedAt: !item.completed ? new Date() : undefined,
      });
    } catch (error) {
      console.error('Failed to update item:', error);
      toast.error('Failed to update task');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await deleteToDoItemWithBackendSync(itemId);
      toast.success('Task deleted');
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast.error('Failed to delete task');
    }
  };

 const completedCount = items.filter((i) => i.completed).length;
 const priorityColors = {
 low: 'bg-green-100 text-green-700',
 medium: 'bg-yellow-100 text-yellow-700',
 high: 'bg-red-100 text-red-700',
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
 title={toDoList.name}
 subtitle={`${toDoList.description ? toDoList.description + ' - ' : ''}${completedCount} of ${items.length} tasks completed`}
 icon={<ListTodo size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="todo-lists"
 />

 {/* Progress Bar */}
 {items.length > 0 && (
 <div className="w-full bg-gray-200 rounded-full h-2">
 <div
 className="bg-blue-600 h-2 rounded-full transition-all"
 style={{
 width: `calc(${(completedCount / items.length) * 100}% - 4px)`
 }}
 ></div>
 </div>
 )}

 {/* Add Item Form */}
 <div className="bg-white rounded-xl border border-gray-200 p-6">
 <h3 className="text-lg font-semibold mb-4">Add New Task</h3>
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Task Title *
 </label>
 <input
 type="text"
 value={newItemTitle}
 onChange={(e) => setNewItemTitle(e.target.value)}
 onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
 placeholder="What needs to be done?"
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Priority
 </label>
 <select
 value={newItemPriority}
 onChange={(e) =>
 setNewItemPriority(e.target.value as 'low' | 'medium' | 'high')
 }
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="Select priority"
 >
 <option value="low">Low</option>
 <option value="medium">Medium</option>
 <option value="high">High</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Due Date
 </label>
 <input
 type="date"
 value={newItemDueDate}
 onChange={(e) => setNewItemDueDate(e.target.value)}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>

 <div className="flex items-end">
 <button
 onClick={handleAddItem}
 className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
 >
 <Plus size={18} />
 Add Task
 </button>
 </div>
 </div>

 <textarea
 value={newItemDescription}
 onChange={(e) => setNewItemDescription(e.target.value)}
 placeholder="Add description (optional)"
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 rows={2}
 />
 </div>
 </div>

 {/* Tasks List */}
 <div className="space-y-3">
 {items.length === 0 ? (
 <div className="bg-white rounded-xl p-8 text-center border-2 border-dashed border-gray-300">
 <p className="text-gray-500">No tasks yet. Add one to get started!</p>
 </div>
 ) : (
 items.map((item) => (
 <div
 key={item.id}
 className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-4 hover:shadow-md transition-shadow"
 >
 <button
 onClick={() => handleToggleItem(item)}
 className="mt-1 flex-shrink-0 transition-colors"
 >
 {item.completed ? (
 <CheckCircle size={24} className="text-green-600" />
 ) : (
 <Circle size={24} className="text-gray-400 hover:text-blue-600" />
 )}
 </button>

 <div className="flex-1">
 <div className="flex items-start justify-between">
 <div>
 <h4
 className={`font-medium ${item.completed
 ? 'text-gray-400 line-through'
 : 'text-gray-900'
 }`}
 >
 {item.title}
 </h4>
 {item.description && (
 <p
 className={`text-sm mt-1 ${item.completed
 ? 'text-gray-300'
 : 'text-gray-500'
 }`}
 >
 {item.description}
 </p>
 )}
 </div>
 <button
 onClick={() => handleDeleteItem(item.id!)}
 className="text-gray-400 hover:text-red-600 transition-colors"
 aria-label="Delete to-do item"
 >
 <Trash2 size={18} />
 </button>
 </div>

 <div className="flex items-center gap-2 mt-2">
 <span
 className={`text-xs px-2 py-1 rounded ${priorityColors[item.priority as keyof typeof priorityColors]
 }`}
 >
 {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
 </span>
 {item.dueDate && (
 <span className="text-xs text-gray-500">
 Due {new Date(item.dueDate).toLocaleDateString()}
 </span>
 )}
 </div>
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 </CenteredLayout>
 );
};

