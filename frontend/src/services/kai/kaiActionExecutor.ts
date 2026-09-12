/**
 * Turns understood Kai actions into real Kanaku records — through the same
 * save / update / delete paths the pages use, so a voice-created expense,
 * loan, group bill, goal or to-do is indistinguishable from a typed one.
 *
 * Idempotency: every created row carries a key derived from the actionId
 * (`dedupHash` for transactions, `clientRequestId` for goals/loans,
 * `Idempotency-Key` for groups and to-do items), so a retried save can never
 * produce a second server row.
 *
 * Balances: transactions go through `saveTransactionAndUpdateAccountWithBackendSync`
 * (the AddTransaction path). Accounts are never queued for upsert here — the
 * server applies the transaction itself, and pushing a client-computed balance
 * on top of that double-counts.
 */
import type { KaiEntityPatch } from '@kanaku/shared';
import { db, type Account, type Friend, type Goal, type GroupMember, type Investment, type Loan, type Transaction } from '@/lib/database';
import { apiClient } from '@/lib/api';
import { backendService } from '@/lib/backend-api';
import {
  deleteToDoItemWithBackendSync,
  deleteTransactionWithBackendSync,
  runWithCloudSyncSuppressed,
  saveGoalWithBackendSync,
  saveLoanWithBackendSync,
  saveToDoItemWithBackendSync,
  saveTransactionAndUpdateAccountWithBackendSync,
  updateToDoItemWithBackendSync,
  updateTransactionWithBackendSync,
  queueRecordUpsertSync,
} from '@/lib/auth-sync-integration';
import { applyAccountBalanceDeltas, getTransactionAccountDeltas } from '@/lib/transactionAggregation';
import { resolveAssistantTodoList } from '@/services/aiTaskExecutor';
import {
  applyPatch,
  deterministicUuid,
  describeAction,
  type KaiAction,
  type KaiActionEntities,
  type KaiExecutedAction,
  type RecordRef,
} from './kaiTypes';

export interface ExecutionContext {
  userId?: string;
  accountId: number;
}

export interface ExecutionOutcome {
  refs: RecordRef[];
  balanceDelta: Record<string, number>;
  /** entities as actually saved (defaults filled in) */
  entities: KaiActionEntities;
  say?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const parseIso = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const deltasToRecord = (deltas: Map<number, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [accountId, delta] of deltas.entries()) if (delta) out[String(accountId)] = delta;
  return out;
};

const recordToDeltas = (record: Record<string, number>, sign = 1): Map<number, number> => {
  const out = new Map<number, number>();
  for (const [accountId, delta] of Object.entries(record)) if (delta) out.set(Number(accountId), delta * sign);
  return out;
};

const mergeDeltas = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
};

const ALLOWS_NEGATIVE = new Set(['credit', 'credit-card', 'loan', 'overdraft']);

const canCover = (account: Account, outflow: number): boolean =>
  outflow <= 0 || ALLOWS_NEGATIVE.has(String(account.type ?? '').toLowerCase()) || Number(account.balance ?? 0) >= outflow;

/**
 * The account a spoken action posts to: the first active account (the rule
 * AddTransaction and the Command Center use), preferring one that can cover
 * the outflow so a voice entry doesn't bounce off the server's overdraw check.
 */
export async function resolveDefaultAccount(outflow = 0): Promise<Account | null> {
  const accounts = await db.accounts.filter((a) => !a.deletedAt).toArray();
  if (accounts.length === 0) return null;
  return accounts.find((a) => canCover(a, outflow)) ?? accounts[0];
}

/** Outflow an action will post against its account (0 for income / non-money kinds). */
export function actionOutflow(action: Pick<KaiAction, 'kind' | 'entities'>): number {
  const amount = Number(action.entities.amount ?? 0);
  if (!amount || amount <= 0) return 0;
  switch (action.kind) {
    case 'expense':
    case 'subscription':
    case 'transfer':
    case 'investment':
    case 'loan_lend':
    case 'group_expense':
      return amount;
    default:
      return 0;
  }
}

async function assertAccountCanCover(accountId: number, outflow: number): Promise<void> {
  if (outflow <= 0) return;
  const account = await db.accounts.get(accountId);
  if (!account) throw new Error('Add an account first so Kai knows where to record this.');
  if (!canCover(account, outflow)) {
    throw new Error(`${account.name} only has ${inr(Number(account.balance ?? 0))} — this needs ${inr(outflow)}. Add funds or edit the amount.`);
  }
}

async function findOrCreateFriend(name: string, now: Date): Promise<Friend | undefined> {
  const clean = name.trim();
  if (!clean) return undefined;
  const lower = clean.toLowerCase();
  const existing = await db.friends.filter((f) => !f.deletedAt && (
    f.name.toLowerCase() === lower ||
    f.name.toLowerCase().startsWith(`${lower} `) ||
    f.name.toLowerCase().endsWith(` ${lower}`)
  )).first();
  if (existing) return existing;
  const id = await db.friends.add({ name: clean, createdAt: now, updatedAt: now });
  return db.friends.get(id as number);
}

const requireAmount = (entities: KaiActionEntities): number => {
  const amount = Number(entities.amount ?? 0);
  if (!amount || amount <= 0) throw new Error('This action needs an amount');
  return amount;
};

// ─── Create ───────────────────────────────────────────────────────────────────

async function createTransactionRecord(
  action: KaiAction,
  tx: Omit<Transaction, 'id'> & Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<{ id: number; deltas: Record<string, number> }> {
  const saved = await saveTransactionAndUpdateAccountWithBackendSync(
    { ...tx, dedupHash: deterministicUuid(`${action.actionId}:tx`) },
    ctx.accountId,
    0,
  );
  const deltas = getTransactionAccountDeltas({ ...tx, id: saved.id });
  return { id: saved.id as number, deltas: deltasToRecord(deltas) };
}

async function createExpenseOrIncome(action: KaiAction, ctx: ExecutionContext): Promise<ExecutionOutcome> {
  const e = action.entities;
  const amount = requireAmount(e);
  const now = new Date();
  const isIncome = action.kind === 'income';
  const entities: KaiActionEntities = {
    ...e,
    category: e.category || (isIncome ? 'Other Income' : 'Miscellaneous'),
    description: e.description || action.rawSegment.slice(0, 120),
    expenseMode: isIncome ? undefined : (e.expenseMode ?? 'individual'),
    recurrence: e.recurrence ?? (action.kind === 'subscription' ? 'monthly' : undefined),
  };
  const { id, deltas } = await createTransactionRecord(action, {
    type: isIncome ? 'income' : 'expense',
    amount,
    accountId: ctx.accountId,
    category: entities.category!,
    description: entities.description!,
    merchant: e.merchant || '',
    date: parseIso(e.date) ?? now,
    tags: ['kai', action.kind],
    expenseMode: entities.expenseMode,
    contactName: e.person,
    recurrence: entities.recurrence,
    createdAt: now,
    updatedAt: now,
  }, ctx);
  return {
    refs: [{ table: 'transactions', localId: id }],
    balanceDelta: deltas,
    entities,
    say: action.say ?? `Done — ${inr(amount)} for ${entities.description} is saved.`,
  };
}

async function createTransfer(action: KaiAction, ctx: ExecutionContext): Promise<ExecutionOutcome> {
  const e = action.entities;
  const amount = requireAmount(e);
  const now = new Date();
  const destinationName = e.person || e.merchant || e.description;
  const accounts = await db.accounts.filter((a) => !a.deletedAt).toArray();
  const target = destinationName
    ? accounts.find((a) => a.id !== ctx.accountId && a.name.toLowerCase().includes(destinationName.toLowerCase()))
    : undefined;
  const { id, deltas } = await createTransactionRecord(action, {
    type: 'transfer',
    amount,
    accountId: ctx.accountId,
    transferToAccountId: target?.id,
    transferType: target ? 'self-transfer' : 'other-transfer',
    category: 'Transfer',
    description: e.description || `Transfer to ${destinationName || 'other account'}`,
    date: parseIso(e.date) ?? now,
    tags: ['kai', 'transfer'],
    createdAt: now,
    updatedAt: now,
  }, ctx);
  return {
    refs: [{ table: 'transactions', localId: id }],
    balanceDelta: deltas,
    entities: { ...e, description: e.description || `Transfer to ${destinationName || 'other account'}` },
    say: action.say ?? `Transferred ${inr(amount)}${target ? ` to ${target.name}` : ''}.`,
  };
}

async function createInvestment(action: KaiAction, ctx: ExecutionContext): Promise<ExecutionOutcome> {
  const e = action.entities;
  const amount = requireAmount(e);
  const now = new Date();
  const assetName = e.description || 'Investment';
  const investmentId = await db.investments.add({
    assetType: 'other',
    assetName,
    quantity: 1,
    buyPrice: amount,
    currentPrice: amount,
    totalInvested: amount,
    currentValue: amount,
    profitLoss: 0,
    purchaseDate: parseIso(e.date) ?? now,
    lastUpdated: now,
    fundingAccountId: ctx.accountId,
    positionStatus: 'open',
    createdAt: now,
    updatedAt: now,
  } as unknown as Investment);
  const { id, deltas } = await createTransactionRecord(action, {
    type: 'expense',
    amount,
    accountId: ctx.accountId,
    category: 'Investment',
    description: `Invested in ${assetName}`,
    date: parseIso(e.date) ?? now,
    tags: ['kai', 'investment'],
    createdAt: now,
    updatedAt: now,
  }, ctx);
  return {
    refs: [{ table: 'investments', localId: investmentId as number }, { table: 'transactions', localId: id }],
    balanceDelta: deltas,
    entities: { ...e, description: assetName, category: 'Investment' },
    say: action.say ?? `Recorded ${inr(amount)} invested in ${assetName}.`,
  };
}

async function createLoan(action: KaiAction, ctx: ExecutionContext): Promise<ExecutionOutcome> {
  const e = action.entities;
  const amount = requireAmount(e);
  const person = (e.person || '').trim();
  if (!person) throw new Error('Who was this loan with?');
  const now = new Date();
  const isBorrow = action.kind === 'loan_borrow';
  const friend = await findOrCreateFriend(person, now);
  const description = e.description || `${isBorrow ? 'Borrowed from' : 'Lent to'} ${person}`;
  const date = parseIso(e.date) ?? now;

  const { id: transactionId, deltas } = await createTransactionRecord(action, {
    type: isBorrow ? 'income' : 'expense',
    amount,
    accountId: ctx.accountId,
    category: 'Loans',
    subcategory: isBorrow ? 'Loan Received' : 'Loan Disbursed',
    description,
    merchant: person,
    contactName: person,
    loanType: isBorrow ? 'borrowed' : 'lent',
    expenseMode: 'loan',
    date,
    tags: ['kai', 'loan'],
    createdAt: now,
    updatedAt: now,
  }, ctx);

  const loan = await saveLoanWithBackendSync({
    type: isBorrow ? 'borrowed' : 'lent',
    name: description,
    principalAmount: amount,
    outstandingBalance: amount,
    status: 'active',
    contactPerson: friend?.name ?? person,
    friendId: friend?.id,
    loanDate: date,
    clientRequestId: deterministicUuid(`${action.actionId}:loan`),
    createdAt: now,
    updatedAt: now,
  });

  return {
    refs: [{ table: 'transactions', localId: transactionId }, { table: 'loans', localId: loan.id as number }],
    balanceDelta: deltas,
    entities: { ...e, person: friend?.name ?? person, description, category: 'Loans' },
    say: action.say ?? (isBorrow ? `Recorded ${inr(amount)} borrowed from ${person}.` : `Recorded ${inr(amount)} lent to ${person}.`),
  };
}

async function createGroupExpense(action: KaiAction, ctx: ExecutionContext): Promise<ExecutionOutcome> {
  const e = action.entities;
  const amount = requireAmount(e);
  const memberNames = (e.members ?? []).map((m) => m.trim()).filter(Boolean);
  if (memberNames.length === 0) throw new Error('Who was this shared with?');
  const now = new Date();
  const date = parseIso(e.date) ?? now;
  const perHead = Number((amount / (memberNames.length + 1)).toFixed(2));
  const category = e.category || 'Food & Dining';
  const name = e.description
    ? `${e.description} with ${memberNames.slice(0, 3).join(', ')}${memberNames.length > 3 ? '…' : ''}`
    : `Group expense with ${memberNames.slice(0, 3).join(', ')}${memberNames.length > 3 ? '…' : ''}`;

  const friends = await Promise.all(memberNames.map((n) => findOrCreateFriend(n, now)));
  const participants: GroupMember[] = memberNames.map((n, i) => ({
    name: friends[i]?.name ?? n,
    share: perHead,
    paid: false,
    isCurrentUser: false,
    paidAmount: 0,
    paymentStatus: 'pending',
    friendId: friends[i]?.id,
    email: friends[i]?.email,
    phone: friends[i]?.phone,
  }));
  const members: GroupMember[] = [
    { name: 'You', share: perHead, paid: true, isCurrentUser: true, paidAmount: perHead, paymentStatus: 'paid' },
    ...participants,
  ];

  const { id: transactionId, deltas } = await createTransactionRecord(action, {
    type: 'expense',
    amount,
    accountId: ctx.accountId,
    category,
    description: name,
    date,
    tags: ['kai', 'group-expense'],
    expenseMode: 'group',
    splitType: 'equal',
    createdAt: now,
    updatedAt: now,
  }, ctx);

  const groupExpenseId = await db.groupExpenses.add({
    name,
    totalAmount: amount,
    paidBy: ctx.accountId,
    date,
    members,
    category,
    description: action.rawSegment.slice(0, 300),
    yourShare: perHead,
    splitType: 'equal',
    status: 'pending',
    expenseTransactionId: transactionId,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  try {
    const account = await db.accounts.get(ctx.accountId);
    const response = await apiClient.post('/groups', {
      name,
      totalAmount: amount,
      paidBy: account?.cloudId ?? null,
      date: date.toISOString(),
      category,
      description: action.rawSegment.slice(0, 300),
      splitType: 'equal',
      yourShare: perHead,
      status: 'pending',
      members: [
        { name: 'You', share: perHead, paid: true, isCurrentUser: true },
        ...participants.map((p, i) => ({ ...p, friendId: friends[i]?.cloudId ?? undefined })),
      ],
    }, { idempotencyKey: deterministicUuid(`${action.actionId}:group`), showErrorToast: false });
    const remote = (response.data as { id?: string; data?: { id?: string } }) ?? {};
    const cloudId = remote.id ?? remote.data?.id;
    if (cloudId) {
      await runWithCloudSyncSuppressed(() => db.groupExpenses.update(groupExpenseId as number, { cloudId: String(cloudId), syncStatus: 'synced' }));
    }
  } catch {
    // Stays pending; the sync queue retries it.
  }

  await db.transactions.update(transactionId, { groupExpenseId: groupExpenseId as number, groupName: name, updatedAt: now });

  return {
    refs: [{ table: 'transactions', localId: transactionId }, { table: 'group_expenses', localId: groupExpenseId as number }],
    balanceDelta: deltas,
    entities: { ...e, members: participants.map((p) => p.name), category, description: e.description || 'Group expense', splitType: 'equal', expenseMode: 'group' },
    say: action.say ?? `Got it — ${inr(amount)} split with ${memberNames.join(', ')}.`,
  };
}

async function findGoalByName(name?: string) {
  if (!name) return undefined;
  const lower = name.trim().toLowerCase();
  const goals = await db.goals.filter((g) => !g.deletedAt).toArray();
  return goals.find((g) => g.name.toLowerCase() === lower)
    ?? goals.find((g) => g.name.toLowerCase().includes(lower) || lower.includes(g.name.toLowerCase()));
}

async function updateGoalRecord(goalId: number, patch: { name?: string; targetAmount?: number; targetDate?: Date }): Promise<void> {
  const goal = await db.goals.get(goalId);
  if (!goal) throw new Error('Goal not found');
  const now = new Date();
  const updates: Partial<Goal> = { updatedAt: now };
  if (patch.name) updates.name = patch.name;
  if (patch.targetAmount) updates.targetAmount = patch.targetAmount;
  if (patch.targetDate) updates.targetDate = patch.targetDate;

  if (goal.cloudId) {
    try {
      await backendService.updateGoal(goal.cloudId, {
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.targetAmount ? { targetAmount: patch.targetAmount } : {}),
        ...(patch.targetDate ? { targetDate: patch.targetDate.toISOString() } : {}),
      });
      await runWithCloudSyncSuppressed(() => db.goals.update(goalId, { ...updates, syncStatus: 'synced' }));
      return;
    } catch {
      // fall through — local update + queued retry
    }
  }
  await db.goals.update(goalId, { ...updates, syncStatus: 'pending' });
  queueRecordUpsertSync('goals', goalId);
}

async function createGoal(action: KaiAction): Promise<ExecutionOutcome> {
  const e = action.entities;
  const name = (e.goalName || e.description || '').trim();
  if (!name) throw new Error('What is this goal for?');
  const targetAmount = Number(e.targetAmount ?? e.amount ?? 0);
  if (!targetAmount || targetAmount <= 0) throw new Error(`How much do you want to save for ${name}?`);
  const now = new Date();
  const targetDate = parseIso(e.targetDate) ?? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  const existing = await findGoalByName(name);
  if (existing?.id) {
    await updateGoalRecord(existing.id, { targetAmount, targetDate: e.targetDate ? targetDate : undefined });
    return {
      refs: [{ table: 'goals', localId: existing.id, owned: false }],
      balanceDelta: {},
      entities: { ...e, goalName: existing.name, targetAmount, targetDate: targetDate.toISOString().slice(0, 10), category: 'Savings' },
      say: `You already have a ${existing.name} goal — I've updated its target to ${inr(targetAmount)}.`,
    };
  }

  const saved = await saveGoalWithBackendSync({
    name,
    description: action.rawSegment.slice(0, 200),
    targetAmount,
    currentAmount: 0,
    targetDate,
    category: e.category || 'Savings',
    isGroupGoal: false,
    clientRequestId: deterministicUuid(`${action.actionId}:goal`),
    createdAt: now,
  });
  return {
    refs: [{ table: 'goals', localId: saved.id as number }],
    balanceDelta: {},
    entities: { ...e, goalName: name, targetAmount, amount: targetAmount, targetDate: targetDate.toISOString().slice(0, 10), category: e.category || 'Savings' },
    say: action.say ?? `Your ${name} goal of ${inr(targetAmount)} is created${e.targetDate ? '' : '. Want a target date?'}`,
  };
}

async function updateGoalFromVoice(action: KaiAction): Promise<ExecutionOutcome> {
  const e = action.entities;
  const goal = await findGoalByName(e.goalName);
  if (!goal?.id) throw new Error(`I couldn't find a goal called ${e.goalName || 'that'}`);
  const targetDate = parseIso(e.targetDate);
  await updateGoalRecord(goal.id, { targetAmount: e.targetAmount, targetDate });
  const parts: string[] = [];
  if (targetDate) parts.push(`target date ${targetDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`);
  if (e.targetAmount) parts.push(`target ${inr(e.targetAmount)}`);
  return {
    refs: [{ table: 'goals', localId: goal.id, owned: false }],
    balanceDelta: {},
    entities: { ...e, goalName: goal.name, targetAmount: e.targetAmount ?? goal.targetAmount, targetDate: (targetDate ?? goal.targetDate).toISOString().slice(0, 10) },
    say: action.say ?? `${goal.name} goal updated — ${parts.join(', ')}.`,
  };
}

async function createTodo(action: KaiAction, ctx: ExecutionContext): Promise<ExecutionOutcome> {
  const e = action.entities;
  const title = (e.title || '').trim();
  if (!title) throw new Error('What should I remind you about?');
  const owner = ctx.userId || 'user-default';
  const now = new Date();
  const list = await resolveAssistantTodoList(owner);
  const dueDate = parseIso(e.dueDate);
  const saved = await saveToDoItemWithBackendSync({
    listId: list.id,
    title,
    description: e.description,
    completed: false,
    priority: e.priority || 'medium',
    dueDate,
    createdBy: owner,
    createdAt: now,
  }, { idempotencyKey: deterministicUuid(`${action.actionId}:todo`) });
  return {
    refs: [{ table: 'to_do_items', localId: saved.id as number }],
    balanceDelta: {},
    entities: { ...e, title, priority: e.priority || 'medium' },
    say: action.say ?? `Reminder set: ${title}${dueDate ? ` on ${dueDate.toLocaleDateString('en-IN')}` : ''}.`,
  };
}

/** Create the records for one understood action. Throws with a user-readable message on failure. */
export async function executeKaiAction(action: KaiAction, ctx: ExecutionContext): Promise<ExecutionOutcome> {
  await assertAccountCanCover(ctx.accountId, actionOutflow(action));
  switch (action.kind) {
    case 'expense':
    case 'income':
    case 'subscription':
      return createExpenseOrIncome(action, ctx);
    case 'transfer':
      return createTransfer(action, ctx);
    case 'investment':
      return createInvestment(action, ctx);
    case 'loan_borrow':
    case 'loan_lend':
      return createLoan(action, ctx);
    case 'group_expense':
      return createGroupExpense(action, ctx);
    case 'goal':
      return createGoal(action);
    case 'goal_update':
      return updateGoalFromVoice(action);
    case 'todo':
      return createTodo(action, ctx);
    default:
      throw new Error(`Nothing to save for "${action.kind}"`);
  }
}

// ─── Remove ───────────────────────────────────────────────────────────────────

async function deleteByApiThenLocal(
  table: 'loans' | 'goals' | 'group_expenses' | 'investments',
  localId: number,
): Promise<void> {
  const localTable = table === 'loans' ? db.loans : table === 'goals' ? db.goals : table === 'group_expenses' ? db.groupExpenses : db.investments;
  const row = await localTable.get(localId);
  if (!row) return;
  const cloudId = (row as { cloudId?: string }).cloudId;
  if (cloudId) {
    try {
      if (table === 'loans') await backendService.deleteLoan(cloudId);
      else if (table === 'goals') await backendService.deleteGoal(cloudId);
      else if (table === 'group_expenses') await apiClient.delete(`/groups/${cloudId}`, { showErrorToast: false });
      else await apiClient.delete(`/investments/${cloudId}`, { showErrorToast: false });
    } catch (err) {
      console.warn(`[Kai] Backend delete failed for ${table}:${cloudId}`, err);
    }
  }
  await runWithCloudSyncSuppressed(() => localTable.delete(localId));
}

/** Delete every record an action created and reverse its balance impact. */
export async function removeKaiAction(action: KaiExecutedAction): Promise<void> {
  for (const ref of [...action.refs].reverse()) {
    if (ref.owned === false) continue;
    switch (ref.table) {
      case 'transactions':
        await deleteTransactionWithBackendSync(ref.localId);
        break;
      case 'to_do_items':
        await deleteToDoItemWithBackendSync(ref.localId);
        break;
      case 'loans':
      case 'goals':
      case 'group_expenses':
      case 'investments':
        await deleteByApiThenLocal(ref.table, ref.localId);
        break;
      default:
        break;
    }
  }
  const reversal = recordToDeltas(action.balanceDelta, -1);
  if (reversal.size > 0) await applyAccountBalanceDeltas(reversal, new Date());
}

// ─── Update ───────────────────────────────────────────────────────────────────

async function updateTransactionRef(
  localId: number,
  updates: Partial<Transaction> & Record<string, unknown>,
): Promise<Record<string, number>> {
  const before = await db.transactions.get(localId);
  if (!before) throw new Error('Transaction not found');
  await updateTransactionWithBackendSync(localId, updates);
  const after = await db.transactions.get(localId);
  const oldDeltas = deltasToRecord(getTransactionAccountDeltas(before));
  const newDeltas = deltasToRecord(getTransactionAccountDeltas(after ?? { ...before, ...updates }));
  const diff = new Map<number, number>();
  for (const key of new Set([...Object.keys(oldDeltas), ...Object.keys(newDeltas)])) {
    const change = (newDeltas[key] ?? 0) - (oldDeltas[key] ?? 0);
    if (change) diff.set(Number(key), change);
  }
  if (diff.size > 0) await applyAccountBalanceDeltas(diff, new Date());
  return newDeltas;
}

/**
 * Apply a correction (spoken or from the edit sheet) to a saved action. A
 * change of kind re-creates the records; everything else patches in place.
 */
export async function updateKaiAction(
  action: KaiExecutedAction,
  patch: KaiEntityPatch,
  ctx: ExecutionContext,
): Promise<ExecutionOutcome> {
  const next = applyPatch(action, patch);
  if (patch.kind && patch.kind !== action.kind) {
    await removeKaiAction(action);
    return executeKaiAction(next, ctx);
  }

  const e = next.entities;
  const now = new Date();
  let balanceDelta = action.balanceDelta;

  for (const ref of action.refs) {
    switch (ref.table) {
      case 'transactions': {
        const updates: Partial<Transaction> & Record<string, unknown> = { updatedAt: now };
        if (patch.amount) updates.amount = patch.amount;
        if (patch.category) updates.category = patch.category;
        if (patch.description) updates.description = action.kind === 'group_expense'
          ? `${patch.description} with ${(e.members ?? []).slice(0, 3).join(', ')}`
          : patch.description;
        if (patch.date) updates.date = parseIso(patch.date) ?? now;
        if (patch.merchant) updates.merchant = patch.merchant;
        if (patch.person) { updates.merchant = patch.person; updates.contactName = patch.person; }
        balanceDelta = await updateTransactionRef(ref.localId, updates);
        break;
      }
      case 'loans': {
        const updates: Partial<Loan> = { updatedAt: now };
        if (patch.amount) { updates.principalAmount = patch.amount; updates.outstandingBalance = patch.amount; }
        if (patch.person) { updates.contactPerson = patch.person; updates.friendId = (await findOrCreateFriend(patch.person, now))?.id; }
        if (patch.description) updates.name = patch.description;
        if (patch.date) updates.loanDate = parseIso(patch.date);
        const loan = await db.loans.get(ref.localId);
        if (loan?.cloudId) {
          try {
            await backendService.updateLoan(loan.cloudId, {
              ...(patch.amount ? { principalAmount: patch.amount, outstandingBalance: patch.amount } : {}),
              ...(patch.person ? { contactPerson: patch.person } : {}),
              ...(patch.description ? { name: patch.description } : {}),
            });
            await runWithCloudSyncSuppressed(() => db.loans.update(ref.localId, { ...updates, syncStatus: 'synced' }));
            break;
          } catch {
            // fall through to queued update
          }
        }
        await db.loans.update(ref.localId, { ...updates, syncStatus: 'pending' });
        break;
      }
      case 'group_expenses': {
        const group = await db.groupExpenses.get(ref.localId);
        if (!group) break;
        const total = patch.amount ?? group.totalAmount;
        const names = e.members ?? group.members.filter((m) => !m.isCurrentUser).map((m) => m.name);
        const perHead = Number((total / (names.length + 1)).toFixed(2));
        const friends = await Promise.all(names.map((n) => findOrCreateFriend(n, now)));
        const members: GroupMember[] = [
          { name: 'You', share: perHead, paid: true, isCurrentUser: true, paidAmount: perHead, paymentStatus: 'paid' },
          ...names.map((n, i) => ({ name: friends[i]?.name ?? n, share: perHead, paid: false, isCurrentUser: false, paidAmount: 0, paymentStatus: 'pending' as const, friendId: friends[i]?.id })),
        ];
        await db.groupExpenses.update(ref.localId, {
          totalAmount: total,
          members,
          yourShare: perHead,
          ...(patch.category ? { category: patch.category } : {}),
          ...(patch.description ? { name: `${patch.description} with ${names.slice(0, 3).join(', ')}` } : {}),
          ...(patch.date ? { date: parseIso(patch.date) ?? now } : {}),
          updatedAt: now,
          syncStatus: 'pending',
        });
        break;
      }
      case 'goals':
        await updateGoalRecord(ref.localId, {
          name: patch.goalName,
          targetAmount: patch.targetAmount ?? patch.amount,
          targetDate: parseIso(patch.targetDate),
        });
        break;
      case 'to_do_items':
        await updateToDoItemWithBackendSync(ref.localId, {
          ...(patch.title ? { title: patch.title } : {}),
          ...(patch.priority ? { priority: patch.priority } : {}),
          ...(patch.dueDate ? { dueDate: parseIso(patch.dueDate) } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
        });
        break;
      default:
        break;
    }
  }

  const summary = describeAction(next);
  return {
    refs: action.refs,
    balanceDelta,
    entities: e,
    say: `Updated — ${summary}${e.amount ? ` ${inr(e.amount)}` : ''}.`,
  };
}

export { mergeDeltas };
