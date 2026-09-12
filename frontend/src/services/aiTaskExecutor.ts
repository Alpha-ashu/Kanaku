/**
 * Executes the "set something up" actions the conversational assistant
 * proposes (goal / budget / to-do / recurring) once the user confirms them in
 * the Command Center. Each path mirrors what the corresponding page does by
 * hand, so a task created from chat syncs exactly like one created in the UI.
 */

import { db, type RecurringTransaction } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import {
  saveGoalWithBackendSync,
  saveToDoListWithBackendSync,
  saveToDoItemWithBackendSync,
} from '@/lib/auth-sync-integration';
import type { AssistantTask } from './voiceFinancialService';

export interface TaskContext {
  userId?: string;
  accountId?: number;
  accountCloudId?: string;
}

const DEFAULT_TODO_LIST = 'AI Assistant Tasks';

const parseDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const newRequestId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

async function createGoal(task: AssistantTask): Promise<string> {
  const targetAmount = Number(task.amount ?? 0);
  if (!targetAmount || targetAmount <= 0) throw new Error('A goal needs a target amount');
  const now = new Date();
  const targetDate = parseDate(task.date) ?? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  await saveGoalWithBackendSync({
    name: task.title,
    description: task.notes,
    targetAmount,
    currentAmount: 0,
    targetDate,
    category: task.category || 'Savings',
    isGroupGoal: false,
    createdAt: now,
  });
  return `Goal "${task.title}" created (${inr(targetAmount)} by ${targetDate.toLocaleDateString('en-IN')})`;
}

async function createBudget(task: AssistantTask): Promise<string> {
  const amount = Number(task.amount ?? 0);
  if (!amount || amount <= 0) throw new Error('A budget needs a limit');
  const category = (task.category || task.title).trim();
  const period = task.period || 'monthly';
  const now = new Date();

  const existing = await db.budgets
    .filter((b) => b.category.trim().toLowerCase() === category.toLowerCase() && b.period === period)
    .first();

  if (existing) {
    await db.budgets.update(existing.id, { amount, updatedAt: now, syncStatus: existing.cloudId ? 'synced' : 'pending' });
    if (existing.cloudId) {
      try {
        await backendService.updateBudget(existing.cloudId, { amount });
      } catch {
        await db.budgets.update(existing.id, { syncStatus: 'pending' });
      }
    }
    return `Budget for ${existing.category} updated to ${inr(amount)}/${period.replace('ly', '')}`;
  }

  const budgetId = crypto.randomUUID();
  await db.budgets.put({
    id: budgetId,
    category,
    amount,
    period,
    spent: 0,
    createdAt: now,
    threshold: 85,
    syncStatus: 'pending',
  });

  try {
    const resp = await backendService.createBudget({ category, amount, period, threshold: 85 });
    if (resp?.id) {
      await db.budgets.update(budgetId, { cloudId: resp.id, syncStatus: 'synced' });
    }
  } catch {
    // Left pending — syncBudgets() retries it on the next visit.
  }
  return `Budget set: ${inr(amount)}/${period.replace('ly', '')} for ${category}`;
}

async function addTodo(task: AssistantTask, ctx: TaskContext): Promise<string> {
  const owner = ctx.userId || 'user-default';
  const now = new Date();

  let list = await db.toDoLists.filter((l) => !l.archived && l.name === DEFAULT_TODO_LIST).first();
  if (!list) list = await db.toDoLists.filter((l) => !l.archived && (l.listType ?? 'individual') === 'individual').first();
  if (!list) {
    list = await saveToDoListWithBackendSync({
      name: DEFAULT_TODO_LIST,
      description: 'Reminders created by the Kanaku assistant',
      ownerId: owner,
      listType: 'individual',
      archived: false,
      createdAt: now,
    });
  }
  if (!list?.id) throw new Error('Could not find or create a to-do list');

  await saveToDoItemWithBackendSync({
    listId: list.id,
    title: task.title,
    description: task.notes,
    completed: false,
    priority: task.priority || 'medium',
    dueDate: parseDate(task.date),
    createdBy: owner,
    createdAt: now,
  });
  const due = parseDate(task.date);
  return `To-do added: "${task.title}"${due ? ` (due ${due.toLocaleDateString('en-IN')})` : ''}`;
}

async function createRecurring(task: AssistantTask, ctx: TaskContext): Promise<string> {
  const amount = Number(task.amount ?? 0);
  if (!amount || amount <= 0) throw new Error('A recurring transaction needs an amount');
  const now = new Date();
  const interval = task.interval || 'monthly';
  const type = task.transactionType || 'expense';
  const nextDue = parseDate(task.date) ?? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const accountId = ctx.accountId ?? (await db.accounts.filter((a) => !a.deletedAt).first())?.id ?? 0;
  const clientRequestId = newRequestId();

  const category = task.category || (type === 'income' ? 'Salary' : 'Bills & Utilities');
  // `clientRequestId` is the idempotency key the sync layer reads; it is not
  // part of the Dexie row type, so the record is built as a variable (no
  // excess-property check) exactly as RecurringTransactions.tsx does.
  const record: RecurringTransaction & { clientRequestId: string } = {
    name: task.title,
    type,
    amount,
    accountId,
    category,
    frequency: interval,
    startDate: now,
    nextDueDate: nextDue,
    status: 'active',
    notes: task.notes,
    syncStatus: 'pending',
    clientRequestId,
    createdAt: now,
    updatedAt: now,
  };
  const localId = await db.recurringTransactions.add(record);

  try {
    const payload = {
      title: task.title,
      amount,
      type,
      category,
      interval,
      nextDueDate: nextDue.toISOString(),
      accountId: ctx.accountCloudId,
      description: task.notes,
      notes: task.notes,
      clientRequestId,
    };
    const resp = await backendService.createRecurringTransaction(payload);
    if (resp?.id) {
      await db.recurringTransactions.update(localId as number, { cloudId: String(resp.id), syncStatus: 'synced' });
    }
  } catch {
    // Stays pending; syncRecurringTransactions() pushes it later.
  }
  return `Recurring ${type} "${task.title}" set: ${inr(amount)} ${interval}, next on ${nextDue.toLocaleDateString('en-IN')}`;
}

/** Runs one confirmed assistant task and returns a one-line summary for the toast. */
export async function executeAssistantTask(task: AssistantTask, ctx: TaskContext): Promise<string> {
  switch (task.type) {
    case 'create_goal': return createGoal(task);
    case 'create_budget': return createBudget(task);
    case 'add_todo': return addTodo(task, ctx);
    case 'create_recurring': return createRecurring(task, ctx);
    default: throw new Error(`Unknown task type: ${String((task as AssistantTask).type)}`);
  }
}
