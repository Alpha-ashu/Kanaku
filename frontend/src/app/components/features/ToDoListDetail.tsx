import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus, Trash2, CheckCircle, Circle, ListTodo, Share2, ArrowLeft,
  X, Pencil, Check, Calendar, Flag, AlignLeft, Users, UserCheck
} from 'lucide-react';
import { toast } from 'sonner';
import type { ToDoItem, ToDoListShare } from '@/lib/database';
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

interface CollaboratorOption {
  userId?: string;
  name: string;
}

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
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newAssignedToName, setNewAssignedToName] = useState('');

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editDueDate, setEditDueDate] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editAssignedToName, setEditAssignedToName] = useState('');

  const currentUserId = user?.id ?? null;
  const currentUserName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'You';

  useEffect(() => {
    const id = localStorage.getItem('viewingToDoListId');
    if (id) setListId(parseInt(id));
    return () => { localStorage.removeItem('viewingToDoListId'); };
  }, []);

  const items: ToDoItem[] = (useLiveQuery(
    () => listId ? db.toDoItems.where('listId').equals(listId).toArray() : Promise.resolve([] as ToDoItem[]),
    [listId]
  ) || []) as ToDoItem[];

  // Shares for collaborator list (Together lists)
  const shares: ToDoListShare[] = (useLiveQuery(
    () => listId ? db.toDoListShares.where('listId').equals(listId).toArray() : Promise.resolve([] as ToDoListShare[]),
    [listId]
  ) || []) as ToDoListShare[];

  useEffect(() => {
    if (listId) db.toDoLists.get(listId).then(list => list && setToDoList(list));
  }, [listId]);

  const isTogether = toDoList?.listType === 'together';

  // Build collaborator options from friends matching shares
  const collaboratorOptions = useLiveQuery(async (): Promise<CollaboratorOption[]> => {
    if (!isTogether || shares.length === 0) return [];
    const allFriends = await db.friends.filter(f => !f.deletedAt).toArray();
    const options: CollaboratorOption[] = shares.map(s => {
      const matched = allFriends.find(f => f.email && s.sharedWithUserId && f.email === s.sharedWithUserId);
      return { userId: s.sharedWithUserId, name: matched?.name || s.sharedWithUserId };
    });
    return options;
  }, [isTogether, shares]) || [];

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
    setNewAssignedTo('');
    setNewAssignedToName('');
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
        assignedTo: newAssignedTo || undefined,
        assignedToName: newAssignedToName || undefined,
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
        completedByName: !item.completed ? currentUserName : undefined,
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
    setEditAssignedTo(item.assignedTo || '');
    setEditAssignedToName(item.assignedToName || '');
  };

  const handleSaveEdit = async (itemId: number) => {
    if (!editTitle.trim()) { toast.error('Task title is required'); return; }
    try {
      await updateToDoItemWithBackendSync(itemId, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        dueDate: editDueDate ? new Date(editDueDate) : undefined,
        assignedTo: editAssignedTo || undefined,
        assignedToName: editAssignedToName || undefined,
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

  const AssigneeSelect = ({
    value, onChangeName, onChangeId, className, testId,
  }: {
    value: string;
    onChangeName: (name: string) => void;
    onChangeId: (id: string) => void;
    className?: string;
    testId?: string;
  }) => (
    <select
      aria-label="Assign to"
      value={value}
      onChange={e => {
        const opt = collaboratorOptions.find(c => c.userId === e.target.value || c.name === e.target.value);
        onChangeId(e.target.value);
        onChangeName(opt?.name || '');
      }}
      data-testid={testId}
      className={cn(
        'w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs focus:ring-2 focus:ring-violet-200 outline-none',
        className
      )}
    >
      <option value="">Everyone</option>
      <option value={currentUserId || 'me'}>{currentUserName} (You)</option>
      {collaboratorOptions.map(c => (
        <option key={c.userId || c.name} value={c.userId || c.name}>{c.name}</option>
      ))}
    </select>
  );

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
              type="button"
              onClick={() => setCurrentPage('todo-lists')}
              className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
              title="Back"
              data-testid="tododetail-back-button"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-slate-900 leading-none">{toDoList.name}</h1>
                {isTogether && (
                  <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 border border-violet-100 flex items-center gap-0.5">
                    <Users size={8} />Together
                  </span>
                )}
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {completedCount}/{items.length} done · {progress}%
                {isTogether && shares.length > 0 && ` · ${shares.length + 1} members`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTogether && (
              <button
                type="button"
                onClick={handleShare}
                className="p-2.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-all"
                title="Manage collaborators"
                data-testid="tododetail-share-button"
              >
                <Share2 size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowAddForm(true); setEditingItemId(null); }}
              data-testid="tododetail-add-task-button"
              className={cn(
                'text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:opacity-90 active:scale-95 transition-all flex items-center gap-2',
                isTogether
                  ? 'bg-violet-600 shadow-violet-100'
                  : 'bg-indigo-600 shadow-indigo-100'
              )}
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
              className={cn(
                'h-full rounded-full transition-all duration-500',
                isTogether
                  ? 'bg-gradient-to-r from-violet-500 to-violet-600'
                  : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
              )}
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
              <button type="button" onClick={() => { setShowAddForm(false); resetAddForm(); }} title="Close" data-testid="tododetail-add-form-close-button" className="p-1 text-slate-400 hover:text-slate-600 rounded">
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
              data-testid="tododetail-new-title-input"
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
                        type="button"
                        onClick={() => setNewPriority(p)}
                        data-testid={`tododetail-new-priority-${p}-button`}
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
                  data-testid="tododetail-new-due-date-input"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
            </div>

            {/* Assign To — Together lists only */}
            {isTogether && (
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <UserCheck size={9} />Assign To
                </label>
                <AssigneeSelect
                  value={newAssignedTo}
                  onChangeId={setNewAssignedTo}
                  onChangeName={setNewAssignedToName}
                  testId="tododetail-new-assignee-select"
                />
              </div>
            )}

            {/* Description */}
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><AlignLeft size={9} />Notes</label>
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="Optional notes…"
                aria-label="Notes"
                rows={2}
                data-testid="tododetail-new-notes-textarea"
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 font-bold text-slate-900 text-xs resize-none focus:ring-2 focus:ring-indigo-200 outline-none placeholder:text-slate-300"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setShowAddForm(false); resetAddForm(); }}
                data-testid="tododetail-add-form-cancel-button"
                className="px-5 py-2.5 border-2 border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddItem}
                disabled={isAdding || !newTitle.trim()}
                data-testid="tododetail-add-task-submit-button"
                className={cn(
                  'flex-1 py-2.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2',
                  isTogether ? 'bg-violet-600 hover:bg-violet-700' : 'bg-indigo-600 hover:bg-indigo-700'
                )}
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
            type="button"
            onClick={() => setFilter(f)}
            data-testid={`tododetail-filter-${f}-button`}
            className={cn(
              'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
              filter === f
                ? isTogether ? 'bg-violet-600 text-white shadow-sm' : 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
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
                type="button"
                onClick={() => setShowAddForm(true)}
                data-testid="tododetail-add-first-task-button"
                className={cn(
                  'mt-4 px-5 py-2.5 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all flex items-center gap-2',
                  isTogether ? 'bg-violet-600 hover:bg-violet-700' : 'bg-indigo-600 hover:bg-indigo-700'
                )}
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
                <div key={item.id} className={cn('premium-glass-card p-4 space-y-3 border-2', isTogether ? 'border-violet-200' : 'border-indigo-200')}>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    aria-label="Task title"
                    data-testid="tododetail-edit-title-input"
                    className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex gap-1">
                      {(['low', 'medium', 'high'] as const).map(p => {
                        const cfg = PRIORITY_CONFIG[p];
                        return (
                          <button key={p} type="button" onClick={() => setEditPriority(p)}
                            data-testid={`tododetail-edit-priority-${p}-button`}
                            className={cn('flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all', editPriority === p ? `${cfg.bg} ${cfg.text}` : 'bg-slate-100 text-slate-400 hover:bg-slate-200')}
                          >{cfg.label}</button>
                        );
                      })}
                    </div>
                    <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                      aria-label="Due date"
                      data-testid="tododetail-edit-due-date-input"
                      className="bg-slate-50 border-none rounded-xl py-1.5 px-3 font-bold text-slate-900 text-xs outline-none" />
                  </div>
                  {isTogether && (
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <UserCheck size={9} />Assign To
                      </label>
                      <AssigneeSelect
                        value={editAssignedTo}
                        onChangeId={setEditAssignedTo}
                        onChangeName={setEditAssignedToName}
                        testId="tododetail-edit-assignee-select"
                      />
                    </div>
                  )}
                  <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)}
                    placeholder="Notes…" aria-label="Notes" rows={2}
                    data-testid="tododetail-edit-notes-textarea"
                    className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 resize-none outline-none" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditingItemId(null)}
                      data-testid="tododetail-edit-cancel-button"
                      className="flex-1 py-2 border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all">
                      Cancel
                    </button>
                    <button type="button" onClick={() => handleSaveEdit(item.id!)}
                      data-testid="tododetail-edit-save-button"
                      className={cn('flex-1 py-2 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1', isTogether ? 'bg-violet-600 hover:bg-violet-700' : 'bg-indigo-600 hover:bg-indigo-700')}>
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
                  type="button"
                  onClick={() => handleToggleItem(item)}
                  className="mt-0.5 shrink-0 transition-all active:scale-90"
                  title={item.completed ? 'Mark as active' : 'Mark as done'}
                  data-testid={`tododetail-item-${item.id}-toggle-button`}
                >
                  {item.completed
                    ? <CheckCircle size={22} className="text-emerald-500" />
                    : <Circle size={22} className={isTogether ? 'text-slate-300 hover:text-violet-400' : 'text-slate-300 hover:text-indigo-400'} />
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
                    {/* Together-specific metadata */}
                    {isTogether && item.assignedToName && (
                      <span className="text-[9px] font-bold text-violet-500 flex items-center gap-0.5 bg-violet-50 px-1.5 py-0.5 rounded-md">
                        <UserCheck size={9} />
                        {item.assignedToName}
                      </span>
                    )}
                    {isTogether && !item.assignedToName && (
                      <span className="text-[9px] font-bold text-slate-300 flex items-center gap-0.5">
                        <Users size={9} />Everyone
                      </span>
                    )}
                  </div>
                  {/* Completed-by info */}
                  {isTogether && item.completed && item.completedByName && (
                    <p className="text-[9px] text-emerald-600 font-semibold mt-1">
                      ✓ Completed by {item.completedByName}
                      {item.completedAt && ` · ${new Date(item.completedAt).toLocaleString('en', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Edit task"
                    data-testid={`tododetail-item-${item.id}-edit-button`}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id!)}
                    className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    title="Delete task"
                    data-testid={`tododetail-item-${item.id}-delete-button`}
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
