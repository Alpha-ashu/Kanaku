/**
 * The one rule for what a loan's status should be.
 *
 * Lifted out of `Loans.tsx` when the repayment path moved into a service:
 * two places deciding independently whether a loan is completed, overdue or
 * active is exactly how a repayment ends up closing a loan on one screen and
 * not the other.
 */
export type LoanLifecycleStatus = 'completed' | 'overdue' | 'active';

/** Local calendar day, so "due today" is never read as overdue by a few hours. */
const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const getLoanStatusFromDueDate = (
  dueDate?: Date | string,
  outstandingBalance?: number,
): LoanLifecycleStatus => {
  if ((outstandingBalance ?? 0) <= 0) return 'completed';
  if (!dueDate) return 'active';

  return dayKey(new Date(dueDate)) < dayKey(new Date()) ? 'overdue' : 'active';
};
