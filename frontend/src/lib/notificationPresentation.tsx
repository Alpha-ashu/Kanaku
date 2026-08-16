import type React from 'react';
import {
  AlertCircle,
  Wallet,
  Target,
  Users,
  MessageSquare,
  CalendarClock,
  UserPlus,
  ListTodo,
  CheckCircle2,
  Bell,
  Sparkles,
  Wand2,
} from 'lucide-react';

export interface NotificationPresentation {
  icon: React.ReactNode;
  /** Icon glyph colour alone — used by TopBar's compact popup. */
  color: string;
  /** Background alone — used by TopBar's compact popup. */
  bgColor: string;
  /** Combined bg+text+border, for the full Notifications page's icon tile. */
  iconBg: string;
  /** Border accent used by the full Notifications page. */
  borderAccent: string;
  /** Badge classes used by the full Notifications page's "Unread" pill. */
  badgeBg: string;
}

/**
 * Presentation for every notification `type` string this app actually
 * produces. `Notification.type` is free-text server-side (Prisma:
 * `type String @default("info")`; the dispatcher defaults to `'info'` for
 * ANY caller, per notification.dispatcher.ts) — it was never a closed set,
 * even though the frontend used to treat it as exactly 10 fixed values.
 *
 * That mismatch was a real, live bug: `loan_reminder` (recurring.worker.ts),
 * `budget_alert` (budget.listener.ts), `group_expense` (ledger.subscriber.ts,
 * group.controller.ts), `new_booking` (sockets/index.ts), plus `info`,
 * `global`, `ai`, `sync`, `reminder`, `welcome_invitations` are all types the
 * BACKEND actually emits today, and none of them matched the old frontend
 * allowlist. Two consumers (Notifications.tsx, TopBar.tsx) independently
 * filtered notifications down to that stale 10-value list, so every one of
 * the types above was invisible — and lib/notifications.ts's
 * removeLegacyMockNotifications() went further and *deleted* any locally
 * synced row whose type wasn't in the list, on every app init. Real budget
 * alerts, loan reminders, group-expense notices and booking confirmations
 * were being silently destroyed on-device, not just hidden.
 *
 * Fix: stop filtering by an enumerated allowlist. Every consumer now renders
 * every notification, resolving presentation through this single shared map
 * with a safe default (`fallback`) for any type not listed here — so a new
 * backend-invented type degrades to a generic look instead of vanishing.
 */
const NOTIFICATION_PRESENTATION: Record<string, NotificationPresentation> = {
  emi: {
    icon: <AlertCircle size={18} />, color: 'text-amber-600', bgColor: 'bg-amber-50', iconBg: 'bg-amber-50 text-amber-600 border border-amber-100',
    borderAccent: 'border-l-4 border-l-amber-500', badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/60',
  },
  loan: {
    icon: <Wallet size={18} />, color: 'text-rose-600', bgColor: 'bg-rose-50', iconBg: 'bg-rose-50 text-rose-600 border border-rose-100',
    borderAccent: 'border-l-4 border-l-rose-500', badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/60',
  },
  loan_reminder: {
    icon: <Wallet size={18} />, color: 'text-rose-600', bgColor: 'bg-rose-50', iconBg: 'bg-rose-50 text-rose-600 border border-rose-100',
    borderAccent: 'border-l-4 border-l-rose-500', badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/60',
  },
  goal: {
    icon: <Target size={18} />, color: 'text-indigo-600', bgColor: 'bg-indigo-50', iconBg: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
    borderAccent: 'border-l-4 border-l-indigo-500', badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
  },
  group: {
    icon: <Users size={18} />, color: 'text-violet-600', bgColor: 'bg-violet-50', iconBg: 'bg-violet-50 text-violet-600 border border-violet-100',
    borderAccent: 'border-l-4 border-l-violet-500', badgeBg: 'bg-violet-50 text-violet-700 border-violet-200/60',
  },
  group_expense: {
    icon: <Users size={18} />, color: 'text-violet-600', bgColor: 'bg-violet-50', iconBg: 'bg-violet-50 text-violet-600 border border-violet-100',
    borderAccent: 'border-l-4 border-l-violet-500', badgeBg: 'bg-violet-50 text-violet-700 border-violet-200/60',
  },
  budget_alert: {
    icon: <AlertCircle size={18} />, color: 'text-orange-600', bgColor: 'bg-orange-50', iconBg: 'bg-orange-50 text-orange-600 border border-orange-100',
    borderAccent: 'border-l-4 border-l-orange-500', badgeBg: 'bg-orange-50 text-orange-700 border-orange-200/60',
  },
  booking: {
    icon: <CalendarClock size={18} />, color: 'text-emerald-600', bgColor: 'bg-emerald-50', iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    borderAccent: 'border-l-4 border-l-emerald-500', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  },
  new_booking: {
    icon: <CalendarClock size={18} />, color: 'text-emerald-600', bgColor: 'bg-emerald-50', iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    borderAccent: 'border-l-4 border-l-emerald-500', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  },
  message: {
    icon: <MessageSquare size={18} />, color: 'text-sky-600', bgColor: 'bg-sky-50', iconBg: 'bg-sky-50 text-sky-600 border border-sky-100',
    borderAccent: 'border-l-4 border-l-sky-500', badgeBg: 'bg-sky-50 text-sky-700 border-sky-200/60',
  },
  session: {
    icon: <CheckCircle2 size={18} />, color: 'text-teal-600', bgColor: 'bg-teal-50', iconBg: 'bg-teal-50 text-teal-600 border border-teal-100',
    borderAccent: 'border-l-4 border-l-teal-500', badgeBg: 'bg-teal-50 text-teal-700 border-teal-200/60',
  },
  friend_request: {
    icon: <UserPlus size={18} />, color: 'text-blue-600', bgColor: 'bg-blue-50', iconBg: 'bg-blue-50 text-blue-600 border border-blue-100',
    borderAccent: 'border-l-4 border-l-blue-500', badgeBg: 'bg-blue-50 text-blue-700 border-blue-200/60',
  },
  friend_accepted: {
    icon: <Users size={18} />, color: 'text-cyan-600', bgColor: 'bg-cyan-50', iconBg: 'bg-cyan-50 text-cyan-600 border border-cyan-100',
    borderAccent: 'border-l-4 border-l-cyan-500', badgeBg: 'bg-cyan-50 text-cyan-700 border-cyan-200/60',
  },
  todo_shared: {
    icon: <ListTodo size={18} />, color: 'text-purple-600', bgColor: 'bg-purple-50', iconBg: 'bg-purple-50 text-purple-600 border border-purple-100',
    borderAccent: 'border-l-4 border-l-purple-500', badgeBg: 'bg-purple-50 text-purple-700 border-purple-200/60',
  },
  reminder: {
    icon: <Bell size={18} />, color: 'text-amber-600', bgColor: 'bg-amber-50', iconBg: 'bg-amber-50 text-amber-600 border border-amber-100',
    borderAccent: 'border-l-4 border-l-amber-500', badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/60',
  },
  sync: {
    icon: <CheckCircle2 size={18} />, color: 'text-slate-600', bgColor: 'bg-slate-50', iconBg: 'bg-slate-50 text-slate-600 border border-slate-100',
    borderAccent: 'border-l-4 border-l-slate-400', badgeBg: 'bg-slate-100 text-slate-700 border-slate-200/60',
  },
  ai: {
    icon: <Wand2 size={18} />, color: 'text-fuchsia-600', bgColor: 'bg-fuchsia-50', iconBg: 'bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100',
    borderAccent: 'border-l-4 border-l-fuchsia-500', badgeBg: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/60',
  },
  global: {
    icon: <Sparkles size={18} />, color: 'text-indigo-600', bgColor: 'bg-indigo-50', iconBg: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
    borderAccent: 'border-l-4 border-l-indigo-500', badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
  },
  welcome_invitations: {
    icon: <UserPlus size={18} />, color: 'text-blue-600', bgColor: 'bg-blue-50', iconBg: 'bg-blue-50 text-blue-600 border border-blue-100',
    borderAccent: 'border-l-4 border-l-blue-500', badgeBg: 'bg-blue-50 text-blue-700 border-blue-200/60',
  },
  info: {
    icon: <Bell size={18} />, color: 'text-slate-600', bgColor: 'bg-slate-50', iconBg: 'bg-slate-50 text-slate-600 border border-slate-100',
    borderAccent: 'border-l-4 border-l-slate-400', badgeBg: 'bg-slate-100 text-slate-700 border-slate-200/60',
  },
};

const FALLBACK: NotificationPresentation = {
  icon: <AlertCircle size={18} />, color: 'text-orange-600', bgColor: 'bg-orange-50', iconBg: 'bg-orange-50 text-orange-600 border border-orange-100',
  borderAccent: 'border-l-4 border-l-orange-500', badgeBg: 'bg-orange-50 text-orange-700 border-orange-200/60',
};

export const getNotificationPresentation = (type: string): NotificationPresentation =>
  NOTIFICATION_PRESENTATION[type] ?? FALLBACK;
