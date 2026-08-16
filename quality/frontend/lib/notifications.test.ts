/**
 * Regression coverage for a real data-loss bug: removeLegacyMockNotifications()
 * used to delete any LOCAL notification whose `type` wasn't in a hardcoded
 * 10-value allowlist. `Notification.type` is free-text server-side (Prisma:
 * `type String @default("info")`) — the backend routinely emits values like
 * `loan_reminder`, `budget_alert`, `group_expense`, `new_booking` that were
 * never in that list, so every one of those synced down and was deleted again
 * on the next app init. See lib/notificationPresentation.tsx for the full
 * writeup; this file pins the fix (title-based cleanup only) so it can't
 * regress back to type-based deletion.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockNotifications } = vi.hoisted(() => {
  let store: Array<Record<string, any>> = [];
  return {
    mockNotifications: {
      reset: () => { store = []; },
      seed: (rows: Array<Record<string, any>>) => { store.push(...rows); },
      snapshot: () => [...store],
      toArray: vi.fn(async () => [...store]),
      bulkDelete: vi.fn(async (ids: number[]) => {
        const idSet = new Set(ids);
        store = store.filter((row) => !idSet.has(row.id));
      }),
    },
  };
});

vi.mock('@/lib/database', () => ({
  db: {
    notifications: mockNotifications,
  },
}));

const { removeLegacyMockNotifications } = await import('@/lib/notifications');
const { getNotificationPresentation } = await import('@/lib/notificationPresentation');

beforeEach(() => {
  mockNotifications.reset();
  vi.clearAllMocks();
});

describe('removeLegacyMockNotifications', () => {
  it('keeps real backend notification types the old allowlist did not recognise', async () => {
    mockNotifications.seed([
      { id: 1, type: 'loan_reminder', title: 'EMI due in 3 days', createdAt: new Date() },
      { id: 2, type: 'budget_alert', title: 'Groceries budget at 90%', createdAt: new Date() },
      { id: 3, type: 'group_expense', title: 'New group expense added', createdAt: new Date() },
      { id: 4, type: 'new_booking', title: 'New advisor booking', createdAt: new Date() },
      { id: 5, type: 'info', title: 'Welcome to KANAKU', createdAt: new Date() },
    ]);

    await removeLegacyMockNotifications();

    expect(mockNotifications.snapshot()).toHaveLength(5);
  });

  it('still removes rows matching known legacy mock titles, regardless of type', async () => {
    mockNotifications.seed([
      { id: 1, type: 'emi', title: 'Transaction Recorded', createdAt: new Date() },
      { id: 2, type: 'loan_reminder', title: 'EMI Due Reminder', createdAt: new Date() },
      { id: 3, type: 'loan_reminder', title: 'Real loan reminder', createdAt: new Date() },
    ]);

    await removeLegacyMockNotifications();

    const remaining = mockNotifications.snapshot();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe('Real loan reminder');
  });
});

describe('getNotificationPresentation', () => {
  it('resolves a real backend type the old frontend allowlist never had', () => {
    const presentation = getNotificationPresentation('budget_alert');
    expect(presentation.iconBg).toContain('orange');
  });

  it('falls back safely for a type invented after this code shipped', () => {
    const presentation = getNotificationPresentation('some_future_type_nobody_wrote_yet');
    expect(presentation).toBeDefined();
    expect(presentation.icon).toBeDefined();
  });
});
