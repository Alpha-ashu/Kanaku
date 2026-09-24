/**
 * notify() — the one call every feature uses to tell a user something.
 *
 *   1. Respects the user's notification preferences (UserSettings.settings.notifications).
 *   2. Picks channels: always the in-app feed; push when the user has a
 *      registered device; email only for events flagged important
 *      (security always, others only while email notifications are on).
 *   3. Writes the row through the dispatcher — the outbox worker delivers email
 *      and push — and emits it on the user's socket so an open app shows it now.
 *
 * Notifying is a side effect: it must never fail the business operation, so
 * every error is logged and swallowed, and a duplicate `dedupKey` means "this
 * event was already announced" rather than an error.
 */
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { getSocketManager } from '../../sockets';
import { sendNotificationEmail } from '../../emails';
import { dispatchNotification, type NotificationChannel } from './notification.dispatcher';

export type NotificationTopic =
  | 'transaction'
  | 'account'
  | 'budget'
  | 'recurring'
  | 'loan'
  | 'goal'
  | 'todo'
  | 'group'
  | 'friend'
  | 'security'
  // Added 2026-09-24. The advisor and booking flows were calling
  // `prisma.notification.create` / `dispatchNotification` directly precisely
  // because notify() had no topic for them — which meant those events skipped
  // preference checks, the outbox, push delivery AND the realtime emit, so an
  // approved advisor or a rescheduled client learned nothing until they next
  // refetched by hand. These three are account-lifecycle events the user
  // cannot opt out of, so they map to `null` below, like security.
  | 'system'
  | 'booking'
  | 'session';

export const NOTIFICATION_PREFERENCE_KEYS = [
  'transactionAlerts',
  'budgetAlerts',
  'recurringReminders',
  'loanReminders',
  'goalProgressAlerts',
  'todoUpdates',
  'groupExpenseUpdates',
  'friendUpdates',
  'emailNotifications',
  'pushNotifications',
] as const;

export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];
export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

/** Which preference toggle silences each topic. Security alerts cannot be turned off. */
const TOPIC_PREFERENCE: Record<NotificationTopic, NotificationPreferenceKey | null> = {
  transaction: 'transactionAlerts',
  account: 'transactionAlerts',
  budget: 'budgetAlerts',
  recurring: 'recurringReminders',
  loan: 'loanReminders',
  goal: 'goalProgressAlerts',
  todo: 'todoUpdates',
  group: 'groupExpenseUpdates',
  friend: 'friendUpdates',
  security: null,
  // Not silenceable: "your advisor application was approved", "your advisor
  // proposed a new time" and "you have a new message from your advisor" are
  // things the user has to be told for the flow to work at all.
  system: null,
  booking: null,
  session: null,
};

const toObject = (value: unknown): Record<string, any> => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
};

/** Every preference defaults to ON; only an explicit `false` turns one off. */
export function resolveNotificationPreferences(settingsBlob: unknown): NotificationPreferences {
  const stored = toObject(toObject(settingsBlob).notifications);
  return Object.fromEntries(
    NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, stored[key] !== false]),
  ) as NotificationPreferences;
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const row = await prisma.userSettings.findUnique({ where: { userId }, select: { settings: true } });
  return resolveNotificationPreferences(row?.settings);
}

/** Merges known boolean keys into the settings blob, leaving every other setting untouched. */
export async function saveNotificationPreferences(
  userId: string,
  changes: Partial<Record<string, unknown>>,
): Promise<NotificationPreferences> {
  const updates = Object.fromEntries(
    NOTIFICATION_PREFERENCE_KEYS
      .filter((key) => typeof changes[key] === 'boolean')
      .map((key) => [key, changes[key] as boolean]),
  );

  const existing = await prisma.userSettings.findUnique({ where: { userId }, select: { settings: true } });
  const blob = toObject(existing?.settings);
  const settings = { ...blob, notifications: { ...toObject(blob.notifications), ...updates } };

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, settings },
    update: { settings },
  });
  return resolveNotificationPreferences(settings);
}

/** Push goes through FCM, so only devices holding an FCM token can receive it. */
async function hasPushDevice(userId: string): Promise<boolean> {
  const count = await prisma.device.count({
    where: { userId, isActive: true, fcmToken: { not: null } },
  });
  return count > 0;
}

function emitRealtime(userId: string, notification: unknown): void {
  try {
    getSocketManager().notifyUser(userId, 'notification', notification);
  } catch {
    // No socket server in this process (worker, tests) — the app picks the row
    // up on its next /notifications sync instead.
  }
}

export interface NotifyInput {
  userId: string;
  topic: NotificationTopic;
  /** Stable machine-readable event name, e.g. 'loan_due', 'group_expense_added'. */
  type: string;
  title: string;
  message: string;
  deepLink?: string;
  /** Important events are also emailed (subject to the email preference). */
  email?: boolean;
  /** Unique per logical event — a repeat with the same key is silently skipped. */
  dedupKey?: string;
  sourceUserId?: string;
  priority?: 'high' | 'normal' | 'low';
  metadata?: Record<string, unknown>;
  /**
   * Fold bursts into one entry: if an unread notification of the same `type`
   * arrived within this window, it is rewritten via `summarize` instead of
   * adding (and pushing) another one. Used for rapid transaction entry.
   */
  coalesce?: {
    withinMs: number;
    summarize: (count: number, previousMetadata: Record<string, any>) => {
      title: string;
      message: string;
      metadata?: Record<string, unknown>;
    };
  };
}

/**
 * In-flight notify() calls.
 *
 * Most callers invoke this as `void notifySomething(...)` — deliberately, so a
 * user's write is never made to wait on a notification. That is right in
 * production, but it means the work can outlive whatever started it. Under Jest
 * that showed up as the run hanging after every test had passed, then exiting
 * non-zero: a notification begun by the last test was still calling
 * `prisma.device.count()` while teardown was closing the client, which surfaced
 * as "Cannot read properties of undefined (reading 'Socket')".
 *
 * Tracking the promises costs nothing on the request path (the set is emptied as
 * each settles) and gives test teardown — and a graceful shutdown — something to
 * await. See `drainNotifications()`.
 */
const inFlight = new Set<Promise<unknown>>();

/**
 * Waits for notifications already started to finish.
 *
 * Bounded, because a wedged notification must not hang a shutdown forever: this
 * gives up after `timeoutMs` and lets the caller proceed. Safe to call when
 * nothing is pending.
 */
export async function drainNotifications(timeoutMs = 5_000): Promise<void> {
  if (inFlight.size === 0) return;
  await Promise.race([
    Promise.allSettled([...inFlight]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export async function notify(input: NotifyInput): Promise<{ id: string } | null> {
  const task = notifyInner(input);
  inFlight.add(task);
  try {
    return await task;
  } finally {
    inFlight.delete(task);
  }
}

async function notifyInner(input: NotifyInput): Promise<{ id: string } | null> {
  try {
    const prefs = await getNotificationPreferences(input.userId);
    const preferenceKey = TOPIC_PREFERENCE[input.topic];
    if (preferenceKey && !prefs[preferenceKey]) return null;

    if (input.coalesce) {
      const recent = await prisma.notification.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          isRead: false,
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - input.coalesce.withinMs) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recent) {
        const previous = toObject(recent.metadata);
        const count = (Number(previous.count) || 1) + 1;
        const summary = input.coalesce.summarize(count, previous);
        const updated = await prisma.notification.update({
          where: { id: recent.id },
          data: {
            title: summary.title,
            message: summary.message,
            metadata: { ...previous, ...(summary.metadata ?? {}), count } as any,
          },
        });
        emitRealtime(input.userId, updated);
        return updated;
      }
    }

    const channels: NotificationChannel[] = ['app'];
    if (prefs.pushNotifications && (await hasPushDevice(input.userId))) channels.push('push');
    if (input.email && (input.topic === 'security' || prefs.emailNotifications)) channels.push('email');

    const notification = await dispatchNotification({
      userId: input.userId,
      title: input.title,
      message: input.message,
      type: input.type,
      category: input.topic,
      deepLink: input.deepLink,
      priority: input.priority ?? (input.email ? 'high' : 'normal'),
      channels,
      sourceUserId: input.sourceUserId,
      dedupKey: input.dedupKey,
      metadata: { ...(input.metadata ?? {}), count: 1 },
    });

    emitRealtime(input.userId, notification);
    return notification;
  } catch (error: any) {
    if (error?.code === 'P2002') return null; // dedupKey — already announced
    logger.warn('[notify] notification not created', {
      userId: input.userId,
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Email someone who has no Kanaku account (e.g. a group member added by email).
 * There is no user row to hang an outbox notification on, so this sends
 * directly and best-effort, without waiting.
 */
export function emailNonMember(input: {
  to: string;
  title: string;
  message: string;
  category: NotificationTopic;
  deepLink?: string;
}): void {
  const to = input.to.trim().toLowerCase();
  if (!to.includes('@')) return;
  void sendNotificationEmail({
    to,
    title: input.title,
    message: input.message,
    category: input.category,
    deepLink: input.deepLink,
  }).catch((error) => {
    logger.warn('[notify] non-member email failed', {
      category: input.category,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/** Formats a rupee amount for notification text, e.g. ₹1,25,000. */
export function formatAmount(value: unknown, currency = 'INR'): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `₹${n.toFixed(2)}`;
  }
}
