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
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';

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
    if (id) {
      const parsed = parseInt(id, 10);
      if (Number.isFinite(parsed)) setListId(parsed);
    }
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
        'w-full h-10 sm:h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-semibold text-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none',
        className
      )}
    >
      <option data-testid="to-do-list-detail-everyone" value="">Everyone</option>
      <option data-testid="to-do-list-detail-you" value={currentUserId || 'me'}>{currentUserName} (You)</option>
      {collaboratorOptions.map(c => (
        <option data-testid={`to-do-list-detail-option-${c.userId || c.name}`} key={c.userId || c.name} value={c.userId || c.name}>{c.name}</option>
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
    <CenteredLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentPage('todo-lists')}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
              title="Back to To-Do Lists"
              aria-label="Back to To-Do Lists"
              data-testid="tododetail-back-button"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">{toDoList.name}</h1>
              {isTogether && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/50 flex items-center gap-1 shrink-0">
                  <Users size={10} />Together
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isTogether && (
              <button
                type="button"
                onClick={handleShare}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all cursor-pointer"
                title="Manage collaborators"
                data-testid="tododetail-share-button"
              >
                <Share2 size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowAddForm(true); setEditingItemId(null); }}
              data-testid="tododetail-add-task-button"
              className="bg-[#18181B] hover:bg-black text-white px-4 sm:px-5 h-9 sm:h-10 rounded-full font-bold text-xs sm:text-sm active:scale-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={16} />
              <span>Add Task</span>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {items.length > 0 && (
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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

        {/* Add Task Panel */}
        {showAddForm && (
          <div className="bg-white rounded-[24px] sm:rounded-[28px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">New Task</p>
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
              className="w-full h-10 sm:h-11 bg-white border border-slate-200 rounded-xl px-4 font-semibold text-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none placeholder:text-slate-400"
            />

            <div className="grid grid-cols-2 gap-3">
              {/* Priority */}
              <div className="space-y-1">
                <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Flag size={11} />Priority</label>
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
                          'flex-1 py-2 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all',
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
                <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Calendar size={11} />Due Date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  aria-label="Due date"
                  data-testid="tododetail-new-due-date-input"
                  className="w-full h-10 sm:h-11 bg-white border border-slate-200 rounded-xl px-3 font-semibold text-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Assign To — Together lists only */}
            {isTogether && (
              <div className="space-y-1">
                <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <UserCheck size={11} />Assign To
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
              <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><AlignLeft size={11} />Notes</label>
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="Optional notes…"
                aria-label="Notes"
                rows={2}
                data-testid="tododetail-new-notes-textarea"
                className="w-full bg-white border border-slate-200 rounded-xl p-3 font-semibold text-slate-900 text-xs sm:text-sm resize-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setShowAddForm(false); resetAddForm(); }}
                data-testid="tododetail-add-form-cancel-button"
                className="px-5 py-2.5 border border-slate-200/80 rounded-full text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddItem}
                disabled={isAdding || !newTitle.trim()}
                data-testid="tododetail-add-task-submit-button"
                className={cn(
                  'flex-1 py-2.5 text-white rounded-full text-xs font-bold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs',
                  isTogether ? 'bg-violet-600 hover:bg-violet-700' : 'bg-[#18181B] hover:bg-black'
                )}
              >
                {isAdding ? 'Adding…' : <><Plus size={14} /><span>Add Task</span></>}
              </button>
            </div>
          </div>
        )}

      {/* Filter tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex p-1 bg-slate-100/80 rounded-full gap-1 border border-slate-200/60">
          {(['all', 'active', 'done'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              data-testid={`tododetail-filter-${f}-button`}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer capitalize',
                filter === f
                  ? isTogether ? 'bg-violet-600 text-white shadow-xs' : 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {f === 'all' ? `All (${items.length})` : f === 'active' ? `Active (${items.filter(i => !i.completed).length})` : `Done (${completedCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks */}
      <div className="space-y-3 pb-8">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-[24px] sm:rounded-[28px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.04)]">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
              <ListTodo size={22} className="text-slate-300" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {filter === 'done' ? 'No completed tasks' : filter === 'active' ? 'All tasks done!' : 'No tasks yet'}
            </p>
            {filter === 'all' && (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                data-testid="tododetail-add-first-task-button"
                className={cn(
                  'mt-4 px-5 py-2.5 text-white rounded-full font-bold text-xs active:scale-95 transition-all flex items-center gap-2 shadow-xs cursor-pointer',
                  isTogether ? 'bg-violet-600 hover:bg-violet-700' : 'bg-[#18181B] hover:bg-black'
                )}
              >
                <Plus size={14} />Add First Task
              </button>
            )}
          </div>
        ) : (
          filteredItems.map(item => {
            const isEditing = editingItemId === item.id;
            const pCfg = PRIORITY_CONFIG[item.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

            if (isEditing) {
              return (
                <div key={item.id} className={cn('bg-white rounded-[20px] sm:rounded-[24px] p-5 space-y-3 border-2 shadow-md', isTogether ? 'border-violet-300' : 'border-indigo-300')}>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    aria-label="Task title"
                    data-testid="tododetail-edit-title-input"
                    className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-semibold text-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex gap-1">
                      {(['low', 'medium', 'high'] as const).map(p => {
                        const cfg = PRIORITY_CONFIG[p];
                        return (
                          <button key={p} type="button" onClick={() => setEditPriority(p)}
                            data-testid={`tododetail-edit-priority-${p}-button`}
                            className={cn('flex-1 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all', editPriority === p ? `${cfg.bg} ${cfg.text}` : 'bg-slate-100 text-slate-400 hover:bg-slate-200')}
                          >{cfg.label}</button>
                        );
                      })}
                    </div>
                    <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                      aria-label="Due date"
                      data-testid="tododetail-edit-due-date-input"
                      className="h-10 sm:h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-semibold text-slate-900 text-xs sm:text-sm outline-none" />
                  </div>
                  {isTogether && (
                    <div className="space-y-1">
                      <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <UserCheck size={11} />Assign To
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs sm:text-sm font-semibold text-slate-700 resize-none outline-none" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditingItemId(null)}
                      data-testid="tododetail-edit-cancel-button"
                      className="flex-1 py-2 border border-slate-200 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-all cursor-pointer">
                      Cancel
                    </button>
                    <button type="button" onClick={() => handleSaveEdit(item.id!)}
                      data-testid="tododetail-edit-save-button"
                      className={cn('flex-1 py-2 text-white rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer', isTogether ? 'bg-violet-600 hover:bg-violet-700' : 'bg-[#18181B] hover:bg-black')}>
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
                  'bg-white rounded-[20px] sm:rounded-[24px] p-4 sm:p-5 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.05)] flex items-start gap-3.5 transition-all hover:border-slate-200/80 hover:shadow-md',
                  item.completed && 'opacity-60 bg-slate-50/50'
                )}
              >
                <button
                  type="button"
                  onClick={() => handleToggleItem(item)}
                  className="mt-0.5 shrink-0 transition-all active:scale-90 cursor-pointer"
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
                    <p className="text-xs text-slate-400 font-medium mt-0.5 truncate">{item.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={cn('text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest', pCfg.bg, pCfg.text)}>
                      {pCfg.label}
                    </span>
                    {item.dueDate && (
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(item.dueDate).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    {/* Together-specific metadata */}
                    {isTogether && item.assignedToName && (
                      <span className="text-[10px] font-bold text-violet-600 flex items-center gap-1 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
                        <UserCheck size={11} />
                        {item.assignedToName}
                      </span>
                    )}
                    {isTogether && !item.assignedToName && (
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                        <Users size={11} />Everyone
                      </span>
                    )}
                  </div>
                  {/* Completed-by info */}
                  {isTogether && item.completed && item.completedByName && (
                    <p className="text-[10px] text-emerald-600 font-semibold mt-1.5">
                      ✓ Completed by {item.completedByName}
                      {item.completedAt && ` · ${new Date(item.completedAt).toLocaleString('en', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                    title="Edit task"
                    data-testid={`tododetail-item-${item.id}-edit-button`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id!)}
                    className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                    title="Delete task"
                    data-testid={`tododetail-item-${item.id}-delete-button`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  </CenteredLayout>
  );
};
