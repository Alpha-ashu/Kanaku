import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { toast } from 'sonner';
import { db, type Notification } from './database';
import supabase from '@/utils/supabase/client';
import { apiClient } from '@/lib/api';
import { markOptionalBackendUnavailable, shouldSkipOptionalBackendRequests } from '@/lib/apiBase';

type NotificationInput = Omit<Notification, 'id' | 'createdAt' | 'isRead'> & {
  createdAt?: Date;
  isRead?: boolean;
};

type BackendNotificationRow = {
  id: string;
  user_id: string;
  type: Notification['type'];
  title: string;
  message: string;
  due_date: string | null;
  is_read: boolean;
  related_id: string | null;
  created_at: string;
};

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
const SUPPORTED_NOTIFICATION_TYPES = new Set<Notification['type']>([
  'emi',
  'loan',
  'goal',
  'group',
  'booking',
  'message',
  'session',
  'friend_request',
  'friend_accepted',
  'todo_shared',
]);
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

const NOTIFICATION_SYNC_COOLDOWN_MS = 15_000;
const NOTIFICATION_RATE_LIMIT_COOLDOWN_MS = 30_000;

async function removeLegacyMockNotifications() {
  const allNotifications = await db.notifications.toArray();
  const idsToDelete = allNotifications
    .filter((notification) => {
      const record = notification as Notification & { type?: string; title?: string };
      const type = record.type ?? '';
      const title = (record.title ?? '').trim();
      return !SUPPORTED_NOTIFICATION_TYPES.has(type as Notification['type']) || LEGACY_MOCK_NOTIFICATION_TITLES.has(title);
    })
    .map((notification) => notification.id)
    .filter((id): id is number => typeof id === 'number');

  if (idsToDelete.length > 0) {
    await db.notifications.bulkDelete(idsToDelete);
  }
}

const toLocalNotification = (remote: BackendNotificationRow): Notification => ({
  type: remote.type,
  title: remote.title,
  message: remote.message,
  dueDate: remote.due_date ? new Date(remote.due_date) : undefined,
  isRead: remote.is_read,
  relatedId: remote.related_id ? Number(remote.related_id) || undefined : undefined,
  createdAt: new Date(remote.created_at),
  userId: remote.user_id,
  remoteId: remote.id,
  source: 'supabase',
});

const shouldUseSystemNotification = () =>
  typeof document !== 'undefined' && document.visibilityState !== 'visible';

async function getActiveUserId() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      return session.user.id;
    }

    const { data } = await supabase.auth.getUser();
    return data.user?.id;
  } catch (error) {
    throw error;
  }
}

async function showSystemNotification(title: string, body: string) {
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display === 'granted') {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Number(`${Date.now()}`.slice(-8)),
            title,
            body,
            schedule: { at: new Date(Date.now() + 250) },
          },
        ],
      });
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
    await showSystemNotification(notification.title, notification.message);
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

async function syncRemoteNotification(row: BackendNotificationRow, notifyUser = false) {
  const localNotification = toLocalNotification(row);
  const existing = row.id
    ? await db.notifications.filter((item) => item.remoteId === row.id).first()
    : undefined;

  await upsertLocalNotification(localNotification);

  if (notifyUser && !existing && !localNotification.isRead) {
    await showDeliveredNotification(localNotification);
  }
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

    for (const row of data) {
      await syncRemoteNotification(row, false);
    }
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
  await Promise.all(
    notifications.map((notification) => notification.id ? markNotificationAsRead(notification.id) : Promise.resolve()),
  );
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
  await checkAndCreateNotifications();
  await syncBackendNotifications();

  if (periodicNotificationCheck) {
    clearInterval(periodicNotificationCheck);
  }

  periodicNotificationCheck = setInterval(() => {
    void checkAndCreateNotifications();
    void syncBackendNotifications();
  }, 60 * 60 * 1000);
  })();

  try {
    await notificationInitPromise;
  } finally {
    notificationInitPromise = null;
  }
};
