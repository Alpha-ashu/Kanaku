/**
 * On-device reminders for dated items (native app only).
 *
 * The server sends these reminders too (backend workers/reminder.worker.ts), but
 * a server push reaches a phone only when Firebase is configured and the device
 * holds an FCM token — never on iOS today, whose APNs token the FCM sender cannot
 * use. OS-scheduled local notifications fire with the app closed and offline, so
 * whenever server push is NOT active on this device this schedules, at 09:00
 * local time within the next 35 days:
 *   - loans, EMIs, borrowed / lent money → the day before and on the due date
 *   - savings goals not yet reached       → 7 days and 1 day before the target date
 *   - recurring payments                  → `reminderDaysBefore` (default 1) before
 *   - to-do items not completed           → on the due date
 *
 * Each run replaces the previously scheduled set with one rebuilt from current
 * data, so edits, payments and deletions are reflected. When server push is
 * active the set is cleared instead, so a reminder never arrives twice.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { db } from './database';
import { ANDROID_NOTIFICATION_CHANNEL_ID, isServerPushActive } from '@/services/pushNotificationService';

const REMINDER_KIND = 'kanaku-due-reminder';
const REMINDER_HOUR = 9;
const HORIZON_DAYS = 35;
/** iOS keeps at most 64 pending local notifications per app. */
const MAX_SCHEDULED = 60;

interface ReminderSpec {
  key: string;
  at: Date;
  title: string;
  body: string;
  deepLink: string;
  preference: string;
}

/** Deterministic positive 31-bit id for a reminder key. */
export function reminderNotificationId(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 1_000_000 + ((hash >>> 0) % 2_000_000_000);
}

/** 09:00 local time on the calendar day `daysBefore` days before `date`. */
export function reminderTime(date: Date, daysBefore: number): Date {
  const at = new Date(date);
  at.setDate(at.getDate() - daysBefore);
  at.setHours(REMINDER_HOUR, 0, 0, 0);
  return at;
}

const formatINR = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
    : '';

function preferenceEnabled(key: string): boolean {
  try {
    const stored = localStorage.getItem('notificationSettings');
    if (!stored) return true;
    return (JSON.parse(stored) as Record<string, boolean>)[key] !== false;
  } catch {
    return true;
  }
}

/** Builds every reminder due within the horizon from the local database. Exported for tests. */
export async function buildReminderSpecs(now = new Date()): Promise<ReminderSpec[]> {
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const specs: ReminderSpec[] = [];
  const add = (spec: ReminderSpec) => {
    if (spec.at > now && spec.at <= horizon) specs.push(spec);
  };

  const loans = await db.loans.filter((loan) => loan.status !== 'completed' && Boolean(loan.dueDate)).toArray();
  for (const loan of loans) {
    const due = new Date(loan.dueDate as Date);
    const amount = formatINR(loan.emiAmount || loan.outstandingBalance);
    const lent = loan.type === 'lent';
    const subject = lent ? `${amount} owed to you for "${loan.name}"` : `${amount} for "${loan.name}"`;
    for (const daysBefore of [1, 0]) {
      add({
        key: `loan:${loan.id}:${due.toISOString().slice(0, 10)}:${daysBefore}`,
        at: reminderTime(due, daysBefore),
        title: lent ? 'Collection reminder' : loan.type === 'emi' || loan.emiAmount ? 'EMI due reminder' : 'Loan payment reminder',
        body: `${subject} is due ${daysBefore === 1 ? 'tomorrow' : 'today'}.`,
        deepLink: '/loans',
        preference: 'loanReminders',
      });
    }
  }

  const goals = await db.goals
    .filter((goal) => !goal.deletedAt && Number(goal.currentAmount) < Number(goal.targetAmount) && Boolean(goal.targetDate))
    .toArray();
  for (const goal of goals) {
    const target = new Date(goal.targetDate);
    const remaining = formatINR(Number(goal.targetAmount) - Number(goal.currentAmount));
    for (const daysBefore of [7, 1]) {
      add({
        key: `goal:${goal.id}:${target.toISOString().slice(0, 10)}:${daysBefore}`,
        at: reminderTime(target, daysBefore),
        title: `Goal deadline ${daysBefore === 1 ? 'tomorrow' : 'in a week'}: ${goal.name}`,
        body: `${remaining} still to save for "${goal.name}".`,
        deepLink: '/goals',
        preference: 'goalProgressAlerts',
      });
    }
  }

  const recurring = await db.recurringTransactions
    .filter((item) => item.status === 'active' && !item.deletedAt && Boolean(item.nextDueDate))
    .toArray();
  for (const item of recurring) {
    const due = new Date(item.nextDueDate);
    const daysBefore = Math.max(0, item.reminderDaysBefore ?? 1);
    add({
      key: `recurring:${item.id}:${due.toISOString().slice(0, 10)}:${daysBefore}`,
      at: reminderTime(due, daysBefore),
      title: 'Upcoming recurring payment',
      body: `"${item.name}" of ${formatINR(item.amount)} is due ${daysBefore === 0 ? 'today' : daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`}.`,
      deepLink: '/recurring-transactions',
      preference: 'recurringReminders',
    });
  }

  const todos = await db.toDoItems.filter((item) => !item.completed && Boolean(item.dueDate)).toArray();
  for (const item of todos) {
    const due = new Date(item.dueDate as Date);
    add({
      key: `todo:${item.id}:${due.toISOString().slice(0, 10)}`,
      at: reminderTime(due, 0),
      title: 'Task due today',
      body: `"${item.title}" is due today.`,
      deepLink: '/todo-lists',
      preference: 'todoUpdates',
    });
  }

  return specs
    .filter((spec) => preferenceEnabled(spec.preference))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_SCHEDULED);
}

let rescheduling: Promise<void> | null = null;

async function cancelScheduledReminders(): Promise<void> {
  const { notifications } = await LocalNotifications.getPending();
  const ours = notifications.filter((n) => (n.extra as { kind?: string } | undefined)?.kind === REMINDER_KIND);
  if (ours.length > 0) {
    await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  }
}

/**
 * Rebuilds this device's scheduled reminders. Safe to call often (app start,
 * resume, after a sync); concurrent calls share one run.
 */
export function refreshLocalReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  if (rescheduling) return rescheduling;

  rescheduling = (async () => {
    try {
      await cancelScheduledReminders();
      if (isServerPushActive()) return; // the server pushes these reminders

      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') return; // asked for during push setup / first alert

      const specs = await buildReminderSpecs();
      if (specs.length === 0) return;

      const notifications: LocalNotificationSchema[] = specs.map((spec) => ({
        id: reminderNotificationId(spec.key),
        title: spec.title,
        body: spec.body,
        schedule: { at: spec.at },
        channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
        extra: { kind: REMINDER_KIND, deepLink: spec.deepLink },
      }));
      await LocalNotifications.schedule({ notifications });
    } catch (error) {
      console.info('[LocalReminders] Scheduling skipped:', error instanceof Error ? error.message : String(error));
    } finally {
      rescheduling = null;
    }
  })();
  return rescheduling;
}
