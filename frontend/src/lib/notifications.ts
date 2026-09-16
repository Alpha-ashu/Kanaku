import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { toast } from 'sonner';
import { db, type Notification } from './database';
import supabase from '@/utils/supabase/client';
import { apiClient, TokenManager } from '@/lib/api';
import { markOptionalBackendUnavailable, shouldSkipOptionalBackendRequests } from '@/lib/apiBase';

type NotificationInput = Omit<Notification, 'id' | 'createdAt' | 'isRead'> & {
  createdAt?: Date;
  isRead?: boolean;
};

/**
 * A row from GET /notifications. The API returns Prisma's camelCase fields; the
 * snake_case names are the old Supabase shape and are still accepted. Reading
 * only snake_case left every synced notification with an invalid date and no
 * read state.
 */
type BackendNotificationRow = {
  id: string;
  type: Notification['type'];
  title: string;
  message: string;
  userId?: string;
  isRead?: boolean;
  createdAt?: string;
  deepLink?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown> | null;
  user_id?: string;
  is_read?: boolean;
  created_at?: string;
  due_date?: string | null;
  related_id?: string | null;
};

/** The user's own entries — shown in the feed, but no pop-up on the device that made them. */
const SELF_ACTIVITY_TYPES = new Set(['transaction_created', 'account_created']);
/** Only notifications newer than this pop up when first seen; older ones just fill the feed. */
const FRESH_NOTIFICATION_MS = 10 * 60 * 1000;

const SYNCABLE_NOTIFICATION_TYPES = new Set<Notification['type']>(['emi', 'loan', 'goal', 'group', 'friend_request', 'friend_accepted', 'todo_shared']);

/** Maps each notification type to the toggle key used in notificationSettings (localStorage). */
const NOTIF_TYPE_TO_SETTING_KEY: Partial<Record<Notification['type'], string>> = {
  emi: 'loanReminders',
  loan: 'loanReminders',
  goal: 'goalProgressAlerts',
  group: 'groupExpenseUpdates',
  booking: 'transactionAlerts',
  message: 'transactionAlerts',
  session: 'appUpdates',
  friend_request: 'friendUpdates',
  friend_accepted: 'friendUpdates',
  todo_shared: 'todoUpdates',
};

function isNotificationEnabled(type: Notification['type']): boolean {
  try {
    const stored = localStorage.getItem('notificationSettings');
    if (!stored) return true;
    const settings = JSON.parse(stored) as Record<string, boolean>;
    const key = NOTIF_TYPE_TO_SETTING_KEY[type];
    if (!key) return true;
    return settings[key] !== false;
  } catch {
    return true;
  }
}
const LEGACY_MOCK_NOTIFICATION_TITLES = new Set([
  'Transaction Recorded',
  'EMI Due Reminder',
  'Investment Update',
]);

let initialized = false;
let initializedUserId: string | null = null;
let periodicNotificationCheck: ReturnType<typeof setInterval> | null = null;
let notificationInitPromise: Promise<void> | null = null;
let notificationSyncPromise: Promise<void> | null = null;
let nextBackendNotificationSyncAt = 0;
let hasSyncedBackendOnce = false;
let visibilityListenerAttached = false;
let backendNotificationPoll: ReturnType<typeof setInterval> | null = null;

const NOTIFICATION_SYNC_COOLDOWN_MS = 15_000;
/** How often an open, visible app checks for new server notifications. */
const BACKEND_NOTIFICATION_POLL_MS = 60_000;
const NOTIFICATION_RATE_LIMIT_COOLDOWN_MS = 30_000;

export async function removeLegacyMockNotifications() {
  // Title-based cleanup only. This used to ALSO delete any notification whose
  // `type` wasn't in a hardcoded allowlist — but `type` is free-text
  // server-side (see the Notification.type doc comment in lib/database.ts),
  // so that branch was deleting real, current notifications: loan_reminder,
  // budget_alert, group_expense, new_booking, and more, on every app init.
  // Runs on every startup, so it needs no back-fill migration for what it
  // already destroyed — real notifications simply stop disappearing from
  // here forward, and re-sync from the backend repopulates what a user still
  // has unread there.
  const allNotifications = await db.notifications.toArray();
  const idsToDelete = allNotifications
    .filter((notification) => LEGACY_MOCK_NOTIFICATION_TITLES.has((notification.title ?? '').trim()))
    .map((notification) => notification.id)
    .filter((id): id is number => typeof id === 'number');

  if (idsToDelete.length > 0) {
    await db.notifications.bulkDelete(idsToDelete);
  }
}

export const toLocalNotification = (remote: BackendNotificationRow): Notification => {
  const created = new Date(remote.createdAt ?? remote.created_at ?? Date.now());
  return {
    type: remote.type,
    title: remote.title,
    message: remote.message,
    dueDate: remote.due_date ? new Date(remote.due_date) : undefined,
    isRead: Boolean(remote.isRead ?? remote.is_read ?? false),
    relatedId: remote.related_id ? Number(remote.related_id) || undefined : undefined,
    createdAt: Number.isNaN(created.getTime()) ? new Date() : created,
    userId: remote.userId ?? remote.user_id,
    remoteId: String(remote.id),
    deepLink: remote.deepLink ?? undefined,
    category: remote.category ?? undefined,
    source: 'supabase',
  };
};

const shouldUseSystemNotification = () =>
  typeof document !== 'undefined' && document.visibilityState !== 'visible';

/** User id from the app's own access token (the normal sign-in path). */
function userIdFromAccessToken(): string | undefined {
  const token = TokenManager.getAccessToken();
  if (!token) return undefined;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const id = payload.userId ?? payload.id ?? payload.sub;
    return typeof id === 'string' && id ? id : undefined;
  } catch {
    return undefined;
  }
}

async function getActiveUserId() {
  // The app signs in through its own backend, so a Supabase session usually
  // does not exist. Checking only Supabase returned no user for everyone else,
  // and server notifications were never fetched.
  const fromToken = userIdFromAccessToken();
  if (fromToken) return fromToken;

  // No try/catch here: it caught and immediately rethrew, which only obscured
  // the original stack. Callers already handle a rejection.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) {
    return session.user.id;
  }

  const { data } = await supabase.auth.getUser();
  return data.user?.id;
}

async function showSystemNotification(title: string, body: string, deepLink?: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display === 'prompt' || permission.display === 'prompt-with-rationale') {
        permission = await LocalNotifications.requestPermissions();
      }
      if (permission.display === 'granted') {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Math.random() * 1000000) + 1,
              title,
              body,
              // Deliver immediately without AlarmManager exact alarm requirements
              extra: deepLink ? { deepLink } : undefined,
            },
          ],
        });
      }
    } catch (error) {
      console.warn('[Notifications] LocalNotifications.schedule skipped:', error);
    }
    return;
  }

  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
      });
    }
  }
}

async function showDeliveredNotification(notification: Notification) {
  toast.info(notification.title, {
    description: notification.message,
  });

  if (shouldUseSystemNotification()) {
    await showSystemNotification(notification.title, notification.message, notification.deepLink);
  }
}

async function upsertLocalNotification(notification: Notification) {
  if (notification.remoteId) {
    const existingRemote = await db.notifications
      .filter((item) => item.remoteId === notification.remoteId)
      .first();

    if (existingRemote?.id) {
      await db.notifications.put({ ...notification, id: existingRemote.id });
      return existingRemote.id;
    }
  }

  const existingMatch = await db.notifications
    .filter((item) =>
      item.title === notification.title
      && item.message === notification.message
      && item.relatedId === notification.relatedId
      && Math.abs(new Date(item.createdAt).getTime() - new Date(notification.createdAt).getTime()) < 1000,
    )
    .first();

  if (existingMatch?.id) {
    await db.notifications.put({ ...notification, id: existingMatch.id });
    return existingMatch.id;
  }

  return db.notifications.add(notification);
}

function shouldAnnounce(notification: Notification): boolean {
  return !notification.isRead
    && !SELF_ACTIVITY_TYPES.has(notification.type)
    && Date.now() - new Date(notification.createdAt).getTime() < FRESH_NOTIFICATION_MS
    && isNotificationEnabled(notification.type);
}

async function syncRemoteNotification(row: BackendNotificationRow, notifyUser = false) {
  const localNotification = toLocalNotification(row);
  const existing = await db.notifications
    .filter((item) => item.remoteId === localNotification.remoteId)
    .first();

  // Keep a read mark made on this device even if the server has not caught up.
  await upsertLocalNotification(
    existing?.isRead ? { ...localNotification, isRead: true, readAt: existing.readAt } : localNotification,
  );

  if (notifyUser && !existing && shouldAnnounce(localNotification)) {
    await showDeliveredNotification(localNotification);
  }
}

/**
 * Store (and, if new, announce) a notification the server pushed in real time —
 * over the socket or as a foreground push. Keyed on the server id, so the same
 * notification arriving by several routes appears once.
 */
export async function ingestServerNotification(row: BackendNotificationRow): Promise<void> {
  if (!row?.id) return;
  await syncRemoteNotification(row, true);
}

async function syncBackendNotifications() {
  if (notificationSyncPromise) {
    await notificationSyncPromise;
    return;
  }

  const userId = await getActiveUserId();
  if (!userId) return;
  if (shouldSkipOptionalBackendRequests()) return;
  if (nextBackendNotificationSyncAt > Date.now()) return;

  notificationSyncPromise = (async () => {
    let data: BackendNotificationRow[] = [];
    try {
      const response = await apiClient.get<BackendNotificationRow[]>('/notifications?limit=100', {
        showErrorToast: false,
      });
      data = Array.isArray(response.data) ? response.data : [];
      nextBackendNotificationSyncAt = Date.now() + NOTIFICATION_SYNC_COOLDOWN_MS;
    } catch (error: any) {
      const cooldownMs = error?.status === 429 ? NOTIFICATION_RATE_LIMIT_COOLDOWN_MS : NOTIFICATION_SYNC_COOLDOWN_MS;
      nextBackendNotificationSyncAt = Date.now() + cooldownMs;
      markOptionalBackendUnavailable(undefined, cooldownMs);
      console.info(' Backend notifications sync skipped:', error instanceof Error ? error.message : String(error));
      return;
    }

    // The first sync of a session only fills the feed; after that, anything new
    // (and recent) is announced — that is how web users see server alerts.
    const announce = hasSyncedBackendOnce;
    for (const row of data) {
      await syncRemoteNotification(row, announce);
    }
    hasSyncedBackendOnce = true;
  })();

  try {
    await notificationSyncPromise;
  } finally {
    notificationSyncPromise = null;
  }
}

async function createRemoteNotification(notification: Notification) {
  if (!notification.userId || !SYNCABLE_NOTIFICATION_TYPES.has(notification.type)) {
    return;
  }
  // User/device-derived reminder notifications stay local-only.
  // Server-origin notifications are read back through /api/v1/notifications.
}

export const showNotification = (
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info',
): void => {
  const show = type === 'error' ? toast.error : type === 'success' ? toast.success : type === 'warning' ? toast.warning : toast.info;
  show(message);
};

export const createNotificationRecord = async (input: NotificationInput) => {
  if (!isNotificationEnabled(input.type)) return undefined;

  const userId = input.userId ?? await getActiveUserId();
  const notification: Notification = {
    ...input,
    userId,
    createdAt: input.createdAt ?? new Date(),
    isRead: input.isRead ?? false,
    source: input.source ?? 'local',
  };

  const id = await upsertLocalNotification(notification);

  if (!notification.isRead) {
    await showDeliveredNotification(notification);
  }

  await createRemoteNotification(notification);
  return id;
};

export const markNotificationAsRead = async (id: number) => {
  const notification = await db.notifications.get(id);
  if (!notification) return;

  await db.notifications.update(id, {
    isRead: true,
    readAt: new Date(),
  });

  if (notification.remoteId) {
    try {
      await apiClient.put(`/notifications/${notification.remoteId}/read`, undefined, {
        showErrorToast: false,
      });
    } catch (error) {
      console.info(' Failed to mark backend notification as read:', error instanceof Error ? error.message : String(error));
    }
  }
};

export const markAllNotificationsAsRead = async () => {
  const notifications = await db.notifications.toArray();
  const unread = notifications.filter((notification) => notification.id && !notification.isRead);
  if (unread.length === 0) return;

  const readAt = new Date();
  await db.transaction('rw', db.notifications, async () => {
    for (const notification of unread) {
      await db.notifications.update(notification.id!, { isRead: true, readAt });
    }
  });

  // One bulk call instead of one request per notification. Fanning out N PUTs
  // tripped the API rate limiter on a full inbox, which left the tail of the
  // list marked read locally and unread on the server.
  if (unread.some((notification) => notification.remoteId)) {
    try {
      await apiClient.post('/notifications/mark-all-read', undefined, { showErrorToast: false });
    } catch (error) {
      console.info(' Failed to mark backend notifications as read:', error instanceof Error ? error.message : String(error));
    }
  }
};

export const deleteNotificationRecord = async (id: number) => {
  const notification = await db.notifications.get(id);
  if (!notification) return;

  await db.notifications.delete(id);

  if (notification.remoteId) {
    try {
      await apiClient.delete(`/notifications/${notification.remoteId}`, {
        showErrorToast: false,
      });
    } catch (error) {
      console.info(' Failed to delete backend notification:', error instanceof Error ? error.message : String(error));
    }
  }
};

export const clearNotificationRecords = async () => {
  const notifications = await db.notifications.toArray();
  await db.notifications.clear();

  const remoteIds = notifications
    .map((notification) => notification.remoteId)
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (remoteIds.length > 0) {
    try {
      await apiClient.delete('/notifications', {
        showErrorToast: false,
      });
    } catch (error) {
      console.info(' Failed to clear backend notifications:', error instanceof Error ? error.message : String(error));
    }
  }
};

export const checkAndCreateNotifications = async () => {
  const today = new Date();
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const userId = await getActiveUserId();

  const loans = await db.loans.filter((loan) => loan.status === 'active' && !!loan.dueDate).toArray();
  for (const loan of loans) {
    if (!loan.dueDate) continue;

    const dueDate = new Date(loan.dueDate);
    if (dueDate >= today && dueDate <= in7Days) {
      const existing = await db.notifications
        .filter((item) => item.type === 'loan' && item.relatedId === loan.id)
        .first();

      if (!existing) {
        await createNotificationRecord({
          type: 'loan',
          title: 'Upcoming Loan Payment',
          message: `${loan.name} payment of ${loan.emiAmount || loan.outstandingBalance} is due on ${dueDate.toLocaleDateString()}`,
          dueDate,
          relatedId: loan.id,
          userId,
        });
      }
    }
  }

  const goals = await db.goals.filter((goal) => goal.currentAmount < goal.targetAmount).toArray();
  for (const goal of goals) {
    const targetDate = new Date(goal.targetDate);
    const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 30 && daysRemaining > 0) {
      const existing = await db.notifications
        .filter((item) => item.type === 'goal' && item.relatedId === goal.id)
        .first();

      if (!existing) {
        const remaining = goal.targetAmount - goal.currentAmount;
        const monthlyRequired = remaining / Math.max(1, daysRemaining / 30);

        await createNotificationRecord({
          type: 'goal',
          title: 'Goal Deadline Approaching',
          message: `${goal.name} is ${daysRemaining} days away. Save ${monthlyRequired.toFixed(2)} per month to stay on track.`,
          dueDate: targetDate,
          relatedId: goal.id,
          userId,
        });
      }
    }
  }
};

export const initializeNotifications = async () => {
  if (notificationInitPromise) {
    await notificationInitPromise;
    return;
  }

  notificationInitPromise = (async () => {
  const userId = await getActiveUserId();

  // One-time migration: remove old hardcoded/mock notification records and unsupported legacy types.
  await removeLegacyMockNotifications();

  if (initialized && initializedUserId === userId) {
    await syncBackendNotifications();
    return;
  }

  initialized = true;
  initializedUserId = userId ?? null;
  hasSyncedBackendOnce = false;
  await checkAndCreateNotifications();
  await syncBackendNotifications();

  if (periodicNotificationCheck) {
    clearInterval(periodicNotificationCheck);
  }
  if (backendNotificationPoll) {
    clearInterval(backendNotificationPoll);
  }

  // Due-date checks are coarse; server notifications (group expenses, budget
  // alerts, reminders) should show up within a minute while the app is open.
  periodicNotificationCheck = setInterval(() => {
    void checkAndCreateNotifications();
  }, 60 * 60 * 1000);
  backendNotificationPoll = setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void syncBackendNotifications();
    }
  }, BACKEND_NOTIFICATION_POLL_MS);

  if (!visibilityListenerAttached && typeof document !== 'undefined') {
    visibilityListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && initialized) void syncBackendNotifications();
    });
  }
  })();

  try {
    await notificationInitPromise;
  } finally {
    notificationInitPromise = null;
  }
};
