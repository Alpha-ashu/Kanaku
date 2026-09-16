/**
 * Feature notification triggers — one function per user-visible event, called
 * from the feature code right after its write succeeds. Each builds the
 * wording and decides importance; notify() handles preferences and delivery.
 *
 * Email policy (owner decision 2026-09-16): email only for important events —
 * group/split expenses (every member), loan/EMI/borrow-lend due dates, budget
 * exceeded, goal deadlines & completion, to-do due/shared, and security. A
 * user's own routine entries (transactions, income, accounts) get in-app +
 * push only. The free SendGrid tier ran out once already and took signup OTPs
 * down with it, so do not add email to high-volume events.
 */
import { prisma } from '../../db/prisma';
import { emailNonMember, formatAmount, notify } from './notify';

type Money = unknown;

const TRANSACTION_BURST_WINDOW_MS = 2 * 60 * 1000;

// ── Transactions & accounts (user's own activity: in-app + push) ─────────────

export function notifyTransactionCreated(tx: {
  id: string;
  userId: string;
  type: string;
  amount: Money;
  category: string;
  description?: string | null;
  merchant?: string | null;
  currency?: string | null;
  importSource?: string | null;
}): Promise<unknown> {
  // Statement imports add hundreds of rows at once; the import screen reports them.
  if (tx.importSource) return Promise.resolve(null);

  const amount = formatAmount(tx.amount, tx.currency || 'INR');
  const label = tx.type === 'income' ? 'Income received' : tx.type === 'transfer' ? 'Transfer recorded' : 'Expense recorded';
  const detail = tx.merchant || tx.description || tx.category;

  return notify({
    userId: tx.userId,
    topic: 'transaction',
    type: 'transaction_created',
    title: `${label}: ${amount}`,
    message: `${amount} · ${detail}${detail !== tx.category ? ` (${tx.category})` : ''}`,
    deepLink: '/transactions',
    metadata: { transactionId: tx.id, transactionType: tx.type },
    coalesce: {
      withinMs: TRANSACTION_BURST_WINDOW_MS,
      summarize: (count) => ({
        title: `${count} new transactions`,
        message: `You added ${count} transactions in the last few minutes. Latest: ${amount} · ${detail}`,
        metadata: { transactionId: tx.id },
      }),
    },
  });
}

export function notifyAccountCreated(account: { id: string; userId: string; name: string; type: string }): Promise<unknown> {
  return notify({
    userId: account.userId,
    topic: 'account',
    type: 'account_created',
    title: 'New account added',
    message: `${account.name} (${account.type}) was added to your accounts.`,
    deepLink: '/accounts',
    dedupKey: `account_created:${account.id}`,
    metadata: { accountId: account.id },
  });
}

// ── Budgets ──────────────────────────────────────────────────────────────────

export function notifyBudgetAlert(input: {
  userId: string;
  budgetId: string;
  category: string;
  level: 'warning' | 'critical';
  title: string;
  message: string;
  dedupKey: string;
  /** Crossing the limit is emailed; an early warning only if the budget asks for email. */
  email: boolean;
  metadata: Record<string, unknown>;
}): Promise<unknown> {
  return notify({
    userId: input.userId,
    topic: 'budget',
    type: 'budget_alert',
    title: input.title,
    message: input.message,
    deepLink: '/budget-alerts',
    email: input.email,
    dedupKey: input.dedupKey,
    metadata: input.metadata,
  });
}

// ── Recurring ────────────────────────────────────────────────────────────────

export function notifyRecurringPosted(input: {
  userId: string;
  recurringId: string;
  transactionId: string;
  title: string;
  amount: Money;
  dueDate: Date;
}): Promise<unknown> {
  const amount = formatAmount(input.amount);
  return notify({
    userId: input.userId,
    topic: 'recurring',
    type: 'recurring_posted',
    title: 'Recurring payment recorded',
    message: `"${input.title}" of ${amount} was added automatically for ${input.dueDate.toLocaleDateString('en-IN')}.`,
    deepLink: '/recurring-transactions',
    dedupKey: `recurring_posted:${input.recurringId}:${input.dueDate.toISOString().slice(0, 10)}`,
    metadata: { recurringId: input.recurringId, transactionId: input.transactionId },
  });
}

export function notifyRecurringDue(input: {
  userId: string;
  recurringId: string;
  title: string;
  amount: Money;
  dueDate: Date;
  daysUntil: number;
}): Promise<unknown> {
  const amount = formatAmount(input.amount);
  const when = input.daysUntil <= 0 ? 'is due today' : input.daysUntil === 1 ? 'is due tomorrow' : `is due in ${input.daysUntil} days`;
  return notify({
    userId: input.userId,
    topic: 'recurring',
    type: 'recurring_due',
    title: 'Upcoming recurring payment',
    message: `"${input.title}" of ${amount} ${when} (${input.dueDate.toLocaleDateString('en-IN')}).`,
    deepLink: '/recurring-transactions',
    dedupKey: `recurring_due:${input.recurringId}:${input.dueDate.toISOString().slice(0, 10)}:${Math.max(0, input.daysUntil)}`,
    metadata: { recurringId: input.recurringId },
  });
}

// ── Loans, EMIs, borrowed / lent ─────────────────────────────────────────────

export async function notifyLoanDue(loan: {
  id: string;
  userId: string;
  type: string;
  name: string;
  emiAmount: Money;
  outstandingBalance: Money;
  dueDate: Date;
  contactPerson?: string | null;
  contactEmail?: string | null;
}, daysUntil: number): Promise<void> {
  const amount = formatAmount(Number(loan.emiAmount) > 0 ? loan.emiAmount : loan.outstandingBalance);
  const date = loan.dueDate.toLocaleDateString('en-IN');
  const when = daysUntil < 0 ? `was due on ${date}` : daysUntil === 0 ? 'is due today' : daysUntil === 1 ? 'is due tomorrow' : `is due in ${daysUntil} days (${date})`;
  const lent = loan.type === 'lent';
  const who = loan.contactPerson ? ` ${lent ? 'from' : 'to'} ${loan.contactPerson}` : '';

  const title = daysUntil < 0
    ? (lent ? 'Overdue: money owed to you' : 'Overdue loan payment')
    : lent ? 'Collection reminder' : loan.type === 'emi' || Number(loan.emiAmount) > 0 ? 'EMI due reminder' : 'Loan payment reminder';
  const message = lent
    ? `${amount}${who} for "${loan.name}" ${when}.`
    : `Your payment of ${amount}${who} for "${loan.name}" ${when}.`;
  const dayKey = loan.dueDate.toISOString().slice(0, 10);

  await notify({
    userId: loan.userId,
    topic: 'loan',
    type: 'loan_due',
    title,
    message,
    deepLink: '/loans',
    email: true,
    dedupKey: `loan_due:${loan.id}:${dayKey}:${daysUntil < 0 ? 'overdue' : daysUntil}`,
    metadata: { loanId: loan.id, daysUntil },
  });

  // Money lent to someone: remind them too, once, the day before it is due.
  if (lent && daysUntil === 1 && loan.contactEmail) {
    const owner = await prisma.user.findUnique({ where: { id: loan.userId }, select: { name: true } });
    const ownerName = owner?.name || 'A Kanaku user';
    const counterpart = await prisma.user.findFirst({
      where: { email: loan.contactEmail.trim().toLowerCase() },
      select: { id: true },
    });
    const reminderTitle = 'Repayment due tomorrow';
    const reminderMessage = `${ownerName} reminds you that ${amount} for "${loan.name}" is due tomorrow (${date}).`;
    if (counterpart && counterpart.id !== loan.userId) {
      await notify({
        userId: counterpart.id,
        topic: 'loan',
        type: 'loan_due_counterparty',
        title: reminderTitle,
        message: reminderMessage,
        deepLink: '/loans',
        email: true,
        sourceUserId: loan.userId,
        dedupKey: `loan_due_counterparty:${loan.id}:${dayKey}`,
        metadata: { loanId: loan.id },
      });
    } else if (!counterpart) {
      emailNonMember({ to: loan.contactEmail, title: reminderTitle, message: reminderMessage, category: 'loan' });
    }
  }
}

// ── Goals ────────────────────────────────────────────────────────────────────

const GOAL_MILESTONES = [25, 50, 75, 100];

export function notifyGoalProgress(goal: {
  id: string;
  userId: string;
  name: string;
  targetAmount: Money;
}, previousAmount: Money, currentAmount: Money): Promise<unknown> {
  const target = Number(goal.targetAmount);
  if (!(target > 0)) return Promise.resolve(null);
  const before = (Number(previousAmount) / target) * 100;
  const after = (Number(currentAmount) / target) * 100;
  const milestone = [...GOAL_MILESTONES].reverse().find((m) => before < m && after >= m);
  if (!milestone) return Promise.resolve(null);

  const done = milestone === 100;
  return notify({
    userId: goal.userId,
    topic: 'goal',
    type: done ? 'goal_completed' : 'goal_milestone',
    title: done ? `Goal achieved: ${goal.name}` : `${milestone}% of "${goal.name}" saved`,
    message: done
      ? `You reached your target of ${formatAmount(target)} for "${goal.name}". Well done!`
      : `You have saved ${formatAmount(currentAmount)} of ${formatAmount(target)} for "${goal.name}".`,
    deepLink: '/goals',
    email: done,
    dedupKey: `goal_milestone:${goal.id}:${milestone}`,
    metadata: { goalId: goal.id, milestone },
  });
}

export function notifyGoalDeadline(goal: {
  id: string;
  userId: string;
  name: string;
  targetAmount: Money;
  currentAmount: Money;
  targetDate: Date;
}, daysUntil: number): Promise<unknown> {
  const remaining = Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount));
  const when = daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
  return notify({
    userId: goal.userId,
    topic: 'goal',
    type: 'goal_deadline',
    title: `Goal deadline ${daysUntil === 1 ? 'tomorrow' : 'approaching'}: ${goal.name}`,
    message: `"${goal.name}" ends ${when} (${goal.targetDate.toLocaleDateString('en-IN')}). ${formatAmount(remaining)} still to save.`,
    deepLink: '/goals',
    email: true,
    dedupKey: `goal_deadline:${goal.id}:${goal.targetDate.toISOString().slice(0, 10)}:${daysUntil}`,
    metadata: { goalId: goal.id, daysUntil },
  });
}

// ── To-do ────────────────────────────────────────────────────────────────────

export function notifyTodoDue(input: {
  recipientUserId: string;
  itemId: number | string;
  title: string;
  listName: string;
  dueDate: Date;
  daysUntil: number;
}): Promise<unknown> {
  const when = input.daysUntil <= 0 ? 'is due today' : 'is due tomorrow';
  return notify({
    userId: input.recipientUserId,
    topic: 'todo',
    type: 'todo_due',
    title: input.daysUntil <= 0 ? 'Task due today' : 'Task due tomorrow',
    message: `"${input.title}" in "${input.listName}" ${when}.`,
    deepLink: '/todo-lists',
    email: input.daysUntil <= 0,
    dedupKey: `todo_due:${input.itemId}:${input.recipientUserId}:${input.dueDate.toISOString().slice(0, 10)}:${Math.max(0, input.daysUntil)}`,
    metadata: { itemId: String(input.itemId) },
  });
}

// ── Group / split expenses (every member, important) ─────────────────────────

/**
 * Tell every other member of a group expense what changed. Registered members
 * get in-app + push + email; members known only by email get an email.
 * Creation is announced by the collaboration engine (inviteParticipants); this
 * covers the edits and settlements that engine's one-time dedupKey never sent.
 */
export async function notifyGroupExpenseChanged(input: {
  groupExpenseId: string;
  actorUserId: string;
  change: 'updated' | 'settled' | 'payment' | 'deleted';
  detail?: string;
  /** Members just invited by this same edit — they already got an invitation. */
  skipEmails?: string[];
}): Promise<void> {
  const skip = new Set((input.skipEmails ?? []).map((e) => e.trim().toLowerCase()));
  const group = await prisma.groupExpense.findUnique({
    where: { id: input.groupExpenseId },
    select: { id: true, name: true, totalAmount: true, userId: true, updatedAt: true },
  });
  if (!group) return;

  const members = await prisma.groupExpenseMember.findMany({
    where: { groupExpenseId: group.id, deletedAt: null },
    select: { userId: true, email: true, name: true, shareAmount: true, hasPaid: true },
  });
  const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { name: true } });
  const actorName = actor?.name || 'A group member';

  const verb = {
    updated: 'updated',
    settled: 'marked as settled',
    payment: 'recorded a payment in',
    deleted: 'deleted',
  }[input.change];
  const title = input.change === 'settled' ? `Settled: ${group.name}` : `Group expense ${input.change === 'payment' ? 'payment' : input.change}: ${group.name}`;
  const stamp = `${input.change}:${group.updatedAt.getTime()}`;

  // The owner is not a GroupExpenseMember row; include them when someone else acted.
  const recipients: { userId: string | null; email: string | null; share?: Money; hasPaid?: boolean }[] = [
    ...members.map((m) => ({ userId: m.userId, email: m.email, share: m.shareAmount, hasPaid: m.hasPaid })),
    { userId: group.userId, email: null },
  ];

  const seen = new Set<string>();
  for (const r of recipients) {
    const key = r.userId || r.email?.toLowerCase() || '';
    if (!key || seen.has(key) || r.userId === input.actorUserId) continue;
    seen.add(key);
    if (r.email && skip.has(r.email.toLowerCase())) continue;

    const share = r.share !== undefined ? ` Your share: ${formatAmount(r.share)}${r.hasPaid ? ' (paid)' : ''}.` : '';
    const message = `${actorName} ${verb} "${group.name}" (total ${formatAmount(group.totalAmount)}).${share}${input.detail ? ` ${input.detail}` : ''}`;

    if (r.userId) {
      await notify({
        userId: r.userId,
        topic: 'group',
        type: `group_expense_${input.change}`,
        title,
        message,
        deepLink: '/groups',
        email: true,
        sourceUserId: input.actorUserId,
        dedupKey: `group_expense:${group.id}:${r.userId}:${stamp}`,
        metadata: { groupExpenseId: group.id, change: input.change },
      });
    } else if (r.email) {
      emailNonMember({ to: r.email, title, message, category: 'group' });
    }
  }
}

// ── Security ─────────────────────────────────────────────────────────────────

export function notifyPinChanged(userId: string, change: 'created' | 'changed' | 'reset'): Promise<unknown> {
  const text = {
    created: ['App PIN created', 'A PIN was set up to lock your KANAKU app.'],
    changed: ['App PIN changed', 'Your KANAKU app PIN was changed.'],
    reset: ['App PIN reset', 'Your KANAKU app PIN was reset after email verification.'],
  }[change];
  return notify({
    userId,
    topic: 'security',
    type: `pin_${change}`,
    title: text[0],
    message: `${text[1]} If this wasn't you, change your password immediately.`,
    deepLink: '/settings',
    email: change !== 'created',
    priority: 'high',
  });
}
