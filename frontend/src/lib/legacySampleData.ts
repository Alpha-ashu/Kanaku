import type { OfflineSyncDB } from './database';

/**
 * Builds before 2026-09-15 seeded fake budgets, recurring payments, a to-do list,
 * notifications and documents into Dexie for any signed-out visitor (flagged by
 * `has_seeded_sample_data`). Nothing cleared them on a first login, so sync
 * pushed them into the new user's real account.
 *
 * This removes exactly those rows — and only copies that never reached the
 * server (no `cloudId`); anything already pushed has to be cleaned server-side.
 */
const SEEDED_FLAG = 'has_seeded_sample_data';

const BUDGET_IDS = ['b-1', 'b-2', 'b-3', 'b-4', 'b-5'];
const RECURRING_NAMES = ['Netflix Premium 4K Plan', 'Airtel Xstream Fiber Broadband', 'HDFC Top 100 MF SIP'];
const NOTIFICATION_TITLES = [
  'SBI Home Loan EMI Due',
  'Emergency Fund Goal Milestone',
  'Upcoming Advisor Session',
  'Goa Trip Settlement Pending',
];
const DOCUMENT_FILE_NAMES = [
  'D-Mart_Grocery_Bill.png',
  'BESCOM_Electricity_Invoice.png',
  'Swiggy_Dinner_Order.png',
  'Canara_Bank_Statement_Q3.pdf',
];
const TODO_LIST_NAME = 'Financial Action Items 2026';
const TODO_OWNER = 'user-default';

const readFlag = (): boolean => {
  try {
    return localStorage.getItem(SEEDED_FLAG) === 'true';
  } catch {
    return false;
  }
};

export async function purgeLegacySampleData(db: OfflineSyncDB): Promise<void> {
  if (typeof window === 'undefined' || !readFlag()) return;
  try {
    const budgets = await db.budgets.bulkGet(BUDGET_IDS);
    await db.budgets.bulkDelete(budgets.filter((b) => b && !b.cloudId).map((b) => b!.id));

    await db.recurringTransactions
      .filter((r) => !r.cloudId && RECURRING_NAMES.includes(r.name))
      .delete();

    // Notifications and documents are local-only tables.
    await db.notifications.filter((n) => NOTIFICATION_TITLES.includes((n as { title?: string }).title ?? '')).delete();
    await db.documents
      .filter((d) => DOCUMENT_FILE_NAMES.includes((d as { fileName?: string }).fileName ?? ''))
      .delete();

    const lists = await db.toDoLists
      .filter((l) => !l.cloudId && l.name === TODO_LIST_NAME && l.ownerId === TODO_OWNER)
      .toArray();
    for (const list of lists) {
      await db.toDoItems.where('listId').equals(list.id as number).delete();
      await db.toDoLists.delete(list.id as number);
    }

    localStorage.removeItem(SEEDED_FLAG);
  } catch (err) {
    // Leave the flag set so the next launch retries; never block the database opening.
    console.warn('[legacySampleData] cleanup failed:', err);
  }
}
