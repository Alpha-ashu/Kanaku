import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const { rows, table } = vi.hoisted(() => {
  const rows: Record<string, Row[]> = { loans: [], goals: [], recurringTransactions: [], toDoItems: [] };
  const table = (name: string) => ({
    filter: (fn: (r: Row) => boolean) => ({ toArray: async () => rows[name].filter(fn) }),
  });
  return { rows, table };
});

vi.mock('@/lib/database', () => ({
  db: {
    loans: table('loans'),
    goals: table('goals'),
    recurringTransactions: table('recurringTransactions'),
    toDoItems: table('toDoItems'),
  },
}));
vi.mock('@/services/pushNotificationService', () => ({
  ANDROID_NOTIFICATION_CHANNEL_ID: 'KANAKU_notifications',
  isServerPushActive: () => false,
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

import { buildReminderSpecs, reminderNotificationId, reminderTime } from '@/lib/localReminders';
import { isToggleOn } from '@/lib/notificationPreferences';

const DAY = 24 * 60 * 60 * 1000;
// A fixed local 08:00 so "today 09:00" is still in the future.
const now = new Date(2026, 8, 16, 8, 0, 0);
const inDays = (n: number) => new Date(now.getTime() + n * DAY);

beforeEach(() => {
  for (const key of Object.keys(rows)) rows[key] = [];
  localStorage.clear();
});

describe('reminderTime', () => {
  it('is 09:00 local time, the given number of days before', () => {
    const at = reminderTime(new Date(2026, 8, 20, 18, 30), 1);
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 8, 19, 9, 0]);
  });
});

describe('reminderNotificationId', () => {
  it('is stable, positive and fits a 32-bit int', () => {
    const id = reminderNotificationId('loan:abc:2026-09-17:1');
    expect(id).toBe(reminderNotificationId('loan:abc:2026-09-17:1'));
    expect(id).toBeGreaterThan(0);
    expect(id).toBeLessThan(2 ** 31);
    expect(id).not.toBe(reminderNotificationId('loan:abc:2026-09-17:0'));
  });
});

describe('buildReminderSpecs', () => {
  it('schedules loan, goal, recurring and to-do reminders inside the horizon', async () => {
    rows.loans = [
      { id: 1, name: 'Bike EMI', type: 'emi', emiAmount: 5000, dueDate: inDays(2), status: 'active' },
      { id: 2, name: 'Paid off', type: 'borrowed', emiAmount: 1000, dueDate: inDays(2), status: 'completed' },
    ];
    rows.goals = [
      { id: 10, name: 'Laptop', targetAmount: 80000, currentAmount: 20000, targetDate: inDays(10) },
      { id: 11, name: 'Done goal', targetAmount: 1000, currentAmount: 1000, targetDate: inDays(10) },
    ];
    rows.recurringTransactions = [
      { id: 20, name: 'Rent', amount: 18000, nextDueDate: inDays(3), status: 'active', reminderDaysBefore: 2 },
      { id: 21, name: 'Paused gym', amount: 999, nextDueDate: inDays(3), status: 'paused' },
    ];
    rows.toDoItems = [
      { id: 30, title: 'Pay electricity bill', completed: false, dueDate: inDays(1) },
      { id: 31, title: 'Done task', completed: true, dueDate: inDays(1) },
    ];

    const specs = await buildReminderSpecs(now);
    const keys = specs.map((s) => s.key.split(':').slice(0, 2).join(':'));

    expect(keys.filter((k) => k === 'loan:1')).toHaveLength(2); // day before + due day
    expect(keys).not.toContain('loan:2');
    expect(keys.filter((k) => k === 'goal:10')).toHaveLength(2); // 7 days + 1 day before
    expect(keys).not.toContain('goal:11');
    expect(keys).toContain('recurring:20');
    expect(keys).not.toContain('recurring:21');
    expect(keys).toContain('todo:30');
    expect(keys).not.toContain('todo:31');

    const rent = specs.find((s) => s.key.startsWith('recurring:20'))!;
    expect(rent.at.getDate()).toBe(inDays(1).getDate()); // 2 days before a due date 3 days out
    expect(rent.deepLink).toBe('/recurring-transactions');
    expect(specs.every((s) => s.at > now)).toBe(true);
    expect(specs.map((s) => s.at.getTime())).toEqual([...specs.map((s) => s.at.getTime())].sort((a, b) => a - b));
  });

  it('drops reminders the user turned off and ones already in the past', async () => {
    rows.loans = [
      { id: 1, name: 'EMI', type: 'emi', emiAmount: 5000, dueDate: inDays(3), status: 'active' },
      { id: 2, name: 'Old', type: 'emi', emiAmount: 5000, dueDate: inDays(-3), status: 'active' },
    ];
    rows.toDoItems = [{ id: 30, title: 'Task', completed: false, dueDate: inDays(2) }];
    localStorage.setItem('notificationSettings', JSON.stringify({ todoUpdates: false }));

    const specs = await buildReminderSpecs(now);

    expect(specs.map((s) => s.key.split(':')[0])).toEqual(['loan', 'loan']);
    expect(specs.every((s) => s.key.startsWith('loan:1:'))).toBe(true);
  });
});

describe('notification preferences', () => {
  it('treats a missing toggle as on and only an explicit false as off', () => {
    expect(isToggleOn({}, 'loanReminders')).toBe(true);
    expect(isToggleOn({ loanReminders: false }, 'loanReminders')).toBe(false);
  });
});
