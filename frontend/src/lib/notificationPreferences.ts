/**
 * Notification preferences. The server decides which notifications, pushes and
 * emails it sends from GET/PUT /notifications/preferences; a copy lives in
 * localStorage ('notificationSettings') for things decided on the device —
 * in-app pop-ups and on-device reminders (lib/notifications.ts, lib/localReminders.ts).
 */
import { apiClient } from '@/lib/api';

export interface NotificationToggle {
  key: string;
  label: string;
  desc: string;
}

/** Event topics — each mutes one kind of alert everywhere (feed, push, email). */
export const NOTIFICATION_TOPIC_TOGGLES: NotificationToggle[] = [
  { key: 'transactionAlerts', label: 'Transactions & Accounts', desc: 'New expenses, income, transfers and accounts' },
  { key: 'budgetAlerts', label: 'Budget Threshold Warnings', desc: 'Alert when spending nears or exceeds a limit' },
  { key: 'loanReminders', label: 'Loan, EMI & Borrow/Lend Dates', desc: 'Upcoming and overdue repayments' },
  { key: 'recurringReminders', label: 'Recurring Payment Reminders', desc: 'Bills and subscriptions coming due' },
  { key: 'goalProgressAlerts', label: 'Goal Milestones & Deadlines', desc: 'Savings milestones and target dates' },
  { key: 'groupExpenseUpdates', label: 'Group Split Updates', desc: 'Shared expenses, edits and settlements' },
  { key: 'todoUpdates', label: 'To-do Reminders & Shares', desc: 'Tasks due and lists shared with you' },
  { key: 'friendUpdates', label: 'Friend Requests', desc: 'Requests and accepted invitations' },
  { key: 'appUpdates', label: 'Feature Announcements', desc: 'Updates and system notices' },
];

/** Delivery channels — the in-app feed is always on. */
export const NOTIFICATION_CHANNEL_TOGGLES: NotificationToggle[] = [
  { key: 'pushNotifications', label: 'Push Notifications', desc: 'Alerts on your phone, even when the app is closed' },
  { key: 'emailNotifications', label: 'Email for Important Alerts', desc: 'Due dates, group expenses, budget overruns and goal deadlines. Security emails are always sent.' },
];

/** Keys the server stores; anything else (e.g. appUpdates) is device-only. */
const SERVER_KEYS = new Set([
  'transactionAlerts', 'budgetAlerts', 'recurringReminders', 'loanReminders', 'goalProgressAlerts',
  'todoUpdates', 'groupExpenseUpdates', 'friendUpdates', 'emailNotifications', 'pushNotifications',
]);

const STORAGE_KEY = 'notificationSettings';

export function readLocalNotificationSettings(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeLocalNotificationSettings(settings: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — the server copy still applies */
  }
}

/** A missing key means ON, matching the server's default. */
export const isToggleOn = (settings: Record<string, boolean>, key: string): boolean => settings[key] !== false;

/** Pulls the server's preferences into the local copy. Returns the merged settings. */
export async function loadNotificationSettings(): Promise<Record<string, boolean>> {
  const local = readLocalNotificationSettings();
  try {
    const response = await apiClient.get<Record<string, boolean>>('/notifications/preferences', { showErrorToast: false });
    const server = response.data && typeof response.data === 'object' ? response.data : {};
    const merged = { ...local, ...server };
    writeLocalNotificationSettings(merged);
    return merged;
  } catch {
    return local;
  }
}

/**
 * Saves one toggle locally and, for server-owned keys, on the server.
 * Throws if the server rejects it, after restoring the previous local value.
 */
export async function saveNotificationSetting(key: string, value: boolean): Promise<Record<string, boolean>> {
  const previous = readLocalNotificationSettings();
  const next = { ...previous, [key]: value };
  writeLocalNotificationSettings(next);
  if (!SERVER_KEYS.has(key)) return next;

  try {
    await apiClient.put('/notifications/preferences', { [key]: value }, { showErrorToast: false });
    return next;
  } catch (error) {
    writeLocalNotificationSettings(previous);
    throw error;
  }
}
