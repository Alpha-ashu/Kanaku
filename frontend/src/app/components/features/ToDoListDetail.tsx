import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus, Trash2, CheckCircle, Circle, ListTodo, Share2, ArrowLeft,
  X, Pencil, Check, Calendar, Flag, AlignLeft
} from 'lucide-react';
import { toast } from 'sonner';
import type { ToDoItem } from '@/lib/database';
import {
  saveToDoItemWithBackendSync,
  updateToDoItemWithBackendSync,
  deleteToDoItemWithBackendSync
} from '@/lib/auth-sync-integration';
import { cn } from '@/lib/utils';

import '@/styles/premium-transactions.css';

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-400' },
  medium: { label: 'Medium', bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-400'   },
  high:   { label: 'High',   bg: 'bg-rose-50',     text: 'text-rose-700',     dot: 'bg-rose-400'    },
};

export const ToDoListDetail: React.FC = () => {
  const { setCurrentPage } = useApp();
  const { user } = useAuth();
  const [listId, setListId] = useState<number | null>(null);
  const [toDoList, setToDoList] = useState<any>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');

  // Add form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newDueDate, setNewDueDate] = useState('');

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editDueDate, setEditDueDate] = useState('');

  const currentUserId = user?.id ?? null;

  useEffect(() => {
    const id = localStorage.getItem('viewingToDoListId');
    if (id) setListId(parseInt(id));
    return () => { localStorage.removeItem('viewingToDoListId'); };
  }, []);

  const items: ToDoItem[] = (useLiveQuery(
    () => listId ? db.toDoItems.where('listId').equals(listId).toArray() : Promise.resolve([]),
    [listId]
  ) || []) as ToDoItem[];

  useEffect(() => {
    if (listId) db.toDoLists.get(listId).then(list => list && setToDoList(list));
  }, [listId]);

  const filteredItems = items.filter(item => {
    if (filter === 'active') return !item.completed;
    if (filter === 'done') return item.completed;
    return true;
  });

  const completedCount = items.filter(i => i.completed).length;
  const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const progressBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (progressBarRef.current) progressBarRef.current.style.width = `${progress}%`;
  }, [progress]);

  const resetAddForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewPriority('medium');
    setNewDueDate('');
  };

  const handleAddItem = async () => {
    if (!newTitle.trim()) { toast.error('Task title is required'); return; }
    if (!listId) return;
    setIsAdding(true);
    try {
      await saveToDoItemWithBackendSync({
        listId,
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        completed: false,
        priority: newPriority,
        dueDate: newDueDate ? new Date(newDueDate) : undefined,
        createdBy: currentUserId || 'local',
        createdAt: new Date(),
      });
      toast.success('Task added');
      resetAddForm();
      setShowAddForm(false);
    } catch {
      toast.error('Failed to add task');
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleItem = async (item: ToDoItem) => {
    try {
      await updateToDoItemWithBackendSync(item.id!, {
        completed: !item.completed,
        completedAt: !item.completed ? new Date() : undefined,
      });
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await deleteToDoItemWithBackendSync(itemId);
      toast.success('Task deleted');
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const startEdit = (item: ToDoItem) => {
    setEditingItemId(item.id!);
    setEditTitle(item.title);
    setEditDescription(item.description || '');
    setEditPriority(item.priority as 'low' | 'medium' | 'high');
    setEditDueDate(item.dueDate ? new Date(item.dueDate).toISOString().split('T')[0] : '');
  };

  const handleSaveEdit = async (itemId: number) => {
    if (!editTitle.trim()) { toast.error('Task title is required'); return; }
    try {
      await updateToDoItemWithBackendSync(itemId, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        dueDate: editDueDate ? new Date(editDueDate) : undefined,
      });
      toast.success('Task updated');
      setEditingItemId(null);
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleShare = () => {
    if (!listId) return;
    localStorage.setItem('sharingToDoListId', listId.toString());
    setCurrentPage('todo-list-share');
  };

  if (!toDoList) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">

      {/* Header */}
      <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage('todo-lists')}
              className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
              title="Back"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-base font-black text-slate-900 leading-none">{toDoList.name}</h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {completedCount}/{items.length} done · {progress}%
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
              title="Share list"
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={() => { setShowAddForm(true); setEditingItemId(null); }}
              className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
            >
              <Plus size={14} />
              Add Task
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {items.length > 0 && (
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              ref={progressBarRef}
              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-500"
            />
          </div>
        )}
      </header>

      {/* Add Task Panel */}
      {showAddForm && (
        <div className="border-b border-slate-100 bg-slate-50/60">
          <div className="p-4 lg:p-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">New Task</p>
              <button onClick={() => { setShowAddForm(false); resetAddForm(); }} title="Close" className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <X size={14} />
              </button>
            </div>

            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddItem()}
              placeholder="What needs to be done?"
              aria-label="Task title"
              autoFocus
              className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-indigo-200 outline-none placeholder:text-slate-300"
            />

            <div className="grid grid-cols-2 gap-3">
              {/* Priority */}
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Flag size={9} />Priority</label>
                <div className="flex gap-1.5">
                  {(['low', 'medium', 'high'] as const).map(p => {
                    const cfg = PRIORITY_CONFIG[p];
                    return (
                      <button
                        key={p}
                        onClick={() => setNewPriority(p)}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                          newPriority === p ? `${cfg.bg} ${cfg.text}` : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300'
                        )}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Due Date */}
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Calendar size={9} />Due Date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  aria-label="Due date"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><AlignLeft size={9} />Notes</label>
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="Optional notes…"
                aria-label="Notes"
                rows={2}
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 font-bold text-slate-900 text-xs resize-none focus:ring-2 focus:ring-indigo-200 outline-none placeholder:text-slate-300"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowAddForm(false); resetAddForm(); }}
                className="px-5 py-2.5 border-2 border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                disabled={isAdding || !newTitle.trim()}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAdding ? 'Adding…' : <><Plus size={12} />Add Task</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="px-4 lg:px-6 py-3 flex gap-1 border-b border-slate-50">
        {(['all', 'active', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
              filter === f ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            )}
          >
            {f === 'all' ? `All (${items.length})` : f === 'active' ? `Active (${items.filter(i => !i.completed).length})` : `Done (${completedCount})`}
          </button>
        ))}
      </div>

      {/* Tasks */}
      <main className="flex-1 p-4 lg:p-6 space-y-2 pb-28">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
              <ListTodo size={22} className="text-slate-300" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {filter === 'done' ? 'No completed tasks' : filter === 'active' ? 'All tasks done!' : 'No tasks yet'}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
              >
                <Plus size={12} />Add First Task
              </button>
            )}
          </div>
        ) : (
          filteredItems.map(item => {
            const isEditing = editingItemId === item.id;
            const pCfg = PRIORITY_CONFIG[item.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

            if (isEditing) {
              return (
                <div key={item.id} className="premium-glass-card p-4 space-y-3 border-2 border-indigo-200">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    aria-label="Task title"
                    className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex gap-1">
                      {(['low', 'medium', 'high'] as const).map(p => {
                        const cfg = PRIORITY_CONFIG[p];
                        return (
                          <button key={p} onClick={() => setEditPriority(p)}
                            className={cn('flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all', editPriority === p ? `${cfg.bg} ${cfg.text}` : 'bg-slate-100 text-slate-400 hover:bg-slate-200')}
                          >{cfg.label}</button>
                        );
                      })}
                    </div>
                    <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                      aria-label="Due date"
                      className="bg-slate-50 border-none rounded-xl py-1.5 px-3 font-bold text-slate-900 text-xs outline-none" />
                  </div>
                  <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)}
                    placeholder="Notes…" aria-label="Notes" rows={2}
                    className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 resize-none outline-none" />
                  <div className="flex gap-2">
                    <button onClick={() => setEditingItemId(null)}
                      className="flex-1 py-2 border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all">
                      Cancel
                    </button>
                    <button onClick={() => handleSaveEdit(item.id!)}
                      className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-1">
                      <Check size={11} />Save
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className={cn(
                  'premium-glass-card p-4 flex items-start gap-3 transition-all',
                  item.completed && 'opacity-60'
                )}
              >
                <button
                  onClick={() => handleToggleItem(item)}
                  className="mt-0.5 shrink-0 transition-all active:scale-90"
                  title={item.completed ? 'Mark as active' : 'Mark as done'}
                >
                  {item.completed
                    ? <CheckCircle size={22} className="text-emerald-500" />
                    : <Circle size={22} className="text-slate-300 hover:text-indigo-400" />
                  }
                </button>

                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-bold text-slate-900', item.completed && 'line-through text-slate-400')}>
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5 truncate">{item.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={cn('text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-widest', pCfg.bg, pCfg.text)}>
                      {pCfg.label}
                    </span>
                    {item.dueDate && (
                      <span className="text-[9px] font-bold text-slate-400 flex items-center gap-0.5">
                        <Calendar size={9} />
                        {new Date(item.dueDate).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(item)}
                    className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Edit task"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id!)}
                    className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    title="Delete task"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
};
