/**
 * Daily reminders for everything with a date on it:
 *   - loans, EMIs, borrowed / lent money   → 3 days, 1 day, due day, 1 day overdue
 *   - savings goals with a deadline         → 30, 7 and 1 day(s) before
 *   - recurring payments                    → `reminderDaysBefore` (default 1) before
 *     (the due-day reminder itself is sent by recurring.worker)
 *   - to-do items                           → the day before and on the due day
 *
 * Runs every morning in REMINDER_TIMEZONE (default Asia/Kolkata — the app's
 * users are in India and UserSettings.timezone is not reliably set) and once
 * shortly after boot, because a sleeping instance can miss the cron tick. Every
 * reminder carries a dedupKey of item + due date + offset, so repeated runs on
 * the same day never send twice.
 */
import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import {
  notifyGoalDeadline,
  notifyLoanDue,
  notifyRecurringDue,
  notifyTodoDue,
} from '../features/notifications/triggers';

const REMINDER_SCHEDULE = process.env.REMINDER_CRON || '0 0 9 * * *';
export const REMINDER_TIMEZONE = process.env.REMINDER_TIMEZONE || 'Asia/Kolkata';
const STARTUP_DELAY_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const LOAN_OFFSETS = new Set([3, 1, 0, -1]);
const GOAL_OFFSETS = new Set([30, 7, 1]);
const TODO_OFFSETS = new Set([1, 0]);

/** Calendar date (YYYY-MM-DD) of `date` in the reminder time zone. */
export function reminderDay(date: Date, timeZone = REMINDER_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Whole calendar days from `from` to `to` in the reminder time zone (negative = past). */
export function calendarDaysUntil(from: Date, to: Date, timeZone = REMINDER_TIMEZONE): number {
  const a = Date.parse(`${reminderDay(from, timeZone)}T00:00:00Z`);
  const b = Date.parse(`${reminderDay(to, timeZone)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export interface ReminderRunSummary {
  loans: number;
  goals: number;
  recurring: number;
  todos: number;
}

async function remindLoans(now: Date): Promise<number> {
  const loans = await prisma.loan.findMany({
    where: {
      status: 'active',
      deletedAt: null,
      dueDate: { gte: new Date(now.getTime() - 2 * DAY_MS), lte: new Date(now.getTime() + 4 * DAY_MS) },
    },
  });
  let sent = 0;
  for (const loan of loans) {
    if (!loan.dueDate) continue;
    const days = calendarDaysUntil(now, loan.dueDate);
    if (!LOAN_OFFSETS.has(days)) continue;
    await notifyLoanDue({ ...loan, dueDate: loan.dueDate }, days);
    sent += 1;
  }
  return sent;
}

async function remindGoals(now: Date): Promise<number> {
  const goals = await prisma.goal.findMany({
    where: {
      deletedAt: null,
      targetDate: { gte: now, lte: new Date(now.getTime() + 31 * DAY_MS) },
    },
  });
  let sent = 0;
  for (const goal of goals) {
    if (Number(goal.currentAmount) >= Number(goal.targetAmount)) continue;
    const days = calendarDaysUntil(now, goal.targetDate);
    if (!GOAL_OFFSETS.has(days)) continue;
    await notifyGoalDeadline(goal, days);
    sent += 1;
  }
  return sent;
}

async function remindRecurring(now: Date): Promise<number> {
  const items = await prisma.recurringTransaction.findMany({
    where: {
      status: 'active',
      deletedAt: null,
      nextDueDate: { gt: now, lte: new Date(now.getTime() + 8 * DAY_MS) },
    },
  });
  let sent = 0;
  for (const item of items) {
    const lead = item.reminderDaysBefore ?? 1;
    const days = calendarDaysUntil(now, item.nextDueDate);
    if (lead <= 0 || days !== lead) continue;
    await notifyRecurringDue({
      userId: item.userId,
      recurringId: item.id,
      title: item.title,
      amount: item.amount,
      dueDate: item.nextDueDate,
      daysUntil: days,
    });
    sent += 1;
  }
  return sent;
}

interface DueTodoRow {
  id: string;
  title: string;
  dueDate: Date;
  itemUserId: string;
  listName: string;
  ownerId: string;
  sharedWith: string[] | null;
}

async function remindTodos(now: Date): Promise<number> {
  let rows: DueTodoRow[];
  try {
    rows = await prisma.$queryRaw<DueTodoRow[]>`
      SELECT i.id::text AS id, i.title, i.due_date AS "dueDate", i.user_id::text AS "itemUserId",
             l.name AS "listName", l.user_id::text AS "ownerId",
             ARRAY(SELECT s.shared_with_user_id::text FROM public.todo_list_shares s WHERE s.list_id = l.id) AS "sharedWith"
      FROM public.todo_items i
      JOIN public.todo_lists l ON l.id = i.list_id
      WHERE COALESCE(i.completed, false) = false
        AND COALESCE(l.archived, false) = false
        AND i.due_date IS NOT NULL
        AND i.due_date >= ${new Date(now.getTime() - DAY_MS)}
        AND i.due_date <= ${new Date(now.getTime() + 2 * DAY_MS)}
    `;
  } catch (error: any) {
    // The to-do tables are created lazily by the todos feature; none yet = nothing due.
    if (String(error?.message || '').includes('does not exist')) return 0;
    throw error;
  }

  let sent = 0;
  for (const row of rows) {
    const dueDate = new Date(row.dueDate);
    const days = calendarDaysUntil(now, dueDate);
    if (!TODO_OFFSETS.has(days)) continue;
    const recipients = new Set([row.itemUserId, row.ownerId, ...(row.sharedWith ?? [])].filter(Boolean));
    for (const recipientUserId of recipients) {
      await notifyTodoDue({ recipientUserId, itemId: row.id, title: row.title, listName: row.listName, dueDate, daysUntil: days });
      sent += 1;
    }
  }
  return sent;
}

/** One sweep over every reminder source. Each source fails independently. */
export async function runDailyReminders(now = new Date()): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = { loans: 0, goals: 0, recurring: 0, todos: 0 };
  const sources: [keyof ReminderRunSummary, (n: Date) => Promise<number>][] = [
    ['loans', remindLoans],
    ['goals', remindGoals],
    ['recurring', remindRecurring],
    ['todos', remindTodos],
  ];
  for (const [name, run] of sources) {
    try {
      summary[name] = await run(now);
    } catch (error) {
      logger.error(`[reminder-worker] ${name} reminders failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info('[reminder-worker] Daily reminders sweep complete', summary);
  return summary;
}

let reminderJob: ScheduledTask | null = null;
let startupTimer: NodeJS.Timeout | null = null;

export const startReminderWorker = (): void => {
  if (reminderJob) return;
  // A local backend reads backend/.env, which points at the PRODUCTION database:
  // starting this there would remind (and email) every real user from a dev
  // machine. Production runs it; anywhere else it must be switched on explicitly.
  if (process.env.NODE_ENV !== 'production' && process.env.REMINDER_WORKER_ENABLED !== 'true') {
    logger.info('[reminder-worker] Not started (NODE_ENV != production; set REMINDER_WORKER_ENABLED=true to run it)');
    return;
  }
  if (!cron.validate(REMINDER_SCHEDULE)) {
    logger.error(`[reminder-worker] Invalid REMINDER_CRON "${REMINDER_SCHEDULE}" — reminders disabled`);
    return;
  }
  reminderJob = cron.schedule(REMINDER_SCHEDULE, () => {
    void runDailyReminders();
  }, { timezone: REMINDER_TIMEZONE });

  startupTimer = setTimeout(() => {
    void runDailyReminders();
  }, STARTUP_DELAY_MS);
  startupTimer.unref?.();

  logger.info(`[reminder-worker] Scheduled (${REMINDER_SCHEDULE}, ${REMINDER_TIMEZONE})`);
};

export const stopReminderWorker = (): void => {
  if (startupTimer) clearTimeout(startupTimer);
  startupTimer = null;
  if (reminderJob) {
    reminderJob.stop();
    reminderJob = null;
  }
};
