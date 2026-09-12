import type { KaiActionKind } from '@kanaku/shared';

export const formatMoney = (currency: string, n: number): string =>
  `${currency} ${Math.round(n).toLocaleString('en-IN')}`;

export function formatDay(iso?: string): string {
  if (!iso) return 'Today';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, tomorrow)) return 'Tomorrow';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

export const KIND_LABEL: Record<KaiActionKind, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  loan_borrow: 'Borrowed',
  loan_lend: 'Lent',
  goal: 'Goal',
  investment: 'Investment',
  group_expense: 'Group expense',
  subscription: 'Subscription',
  unknown: 'Action',
  todo: 'Reminder',
  goal_update: 'Goal update',
  update_previous: 'Correction',
  clarify: 'Question',
  query: 'Answer',
};
