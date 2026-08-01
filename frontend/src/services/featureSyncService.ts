/**
 * Two-way sync for the feature tables the backend owns but the UI reads from
 * Dexie: budgets and recurring transactions.
 *
 * Both were previously write-only — the page created a local row, fired a
 * best-effort POST, and never looked at the server again. The consequences were
 * invisible until they weren't: a budget created on a phone did not exist on the
 * desktop, a recurring rule survived only until the browser store was cleared,
 * and a failed POST (offline, or a 500) was never retried, so the server-side
 * budget alert engine and recurring worker were operating on a different set of
 * rules than the one the user could see.
 *
 * The reconciliation rules are deliberately conservative:
 *   - a server row with no local match is created locally;
 *   - a local row with no `cloudId` has never been pushed, so it is pushed;
 *   - a local row whose `cloudId` is absent from the server response was deleted
 *     elsewhere, so it is removed locally;
 *   - a failed *pull* changes nothing. An empty response and an unreachable
 *     server are indistinguishable to the caller otherwise, and treating the
 *     second as the first would wipe the user's local data.
 */
import { apiClient } from '@/lib/api';
import { db, type Budget, type RecurringTransaction } from '@/lib/database';

export interface FeatureSyncResult {
  pulled: number;
  pushed: number;
  removed: number;
  /** Set when the server could not be reached; local data is left untouched. */
  offline?: boolean;
}

const EMPTY_RESULT: FeatureSyncResult = { pulled: 0, pushed: 0, removed: 0 };

interface BudgetApiRow {
  id: string;
  category: string;
  amount: number | string;
  period: string;
  spent?: number | string;
  threshold?: number | null;
  createdAt?: string;
}

interface RecurringApiRow {
  id: string;
  title?: string;
  description?: string;
  amount: number | string;
  type: string;
  category?: string;
  interval: string;
  nextDueDate: string;
  startDate?: string;
  status?: string;
  notes?: string | null;
  accountId?: string | null;
}

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ─── Budgets ─────────────────────────────────────────────────────────────────

export const syncBudgets = async (): Promise<FeatureSyncResult> => {
  let serverRows: BudgetApiRow[];
  try {
    const response = await apiClient.get<{ success: boolean; data: BudgetApiRow[] }>('/budgets', {
      showErrorToast: false,
    });
    serverRows = Array.isArray(response.data?.data) ? response.data.data : [];
  } catch {
    return { ...EMPTY_RESULT, offline: true };
  }

  const result: FeatureSyncResult = { pulled: 0, pushed: 0, removed: 0 };
  const localRows = await db.budgets.toArray();
  const byCloudId = new Map(localRows.filter((row) => row.cloudId).map((row) => [row.cloudId!, row]));
  const serverIds = new Set(serverRows.map((row) => row.id));

  for (const row of serverRows) {
    const existing = byCloudId.get(row.id);
    if (existing) {
      await db.budgets.update(existing.id, {
        category: row.category,
        amount: toNumber(row.amount),
        period: row.period,
        spent: toNumber(row.spent),
        threshold: row.threshold ?? existing.threshold ?? 85,
        syncStatus: 'synced',
      });
    } else {
      await db.budgets.put({
        id: crypto.randomUUID(),
        cloudId: row.id,
        category: row.category,
        amount: toNumber(row.amount),
        period: row.period,
        spent: toNumber(row.spent),
        threshold: row.threshold ?? 85,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
        syncStatus: 'synced',
      });
    }
    result.pulled += 1;
  }

  // Local-only rows: either never pushed (retry now) or deleted on the server.
  for (const local of localRows) {
    if (!local.cloudId) {
      try {
        const response = await apiClient.post<{ success: boolean; data: { id: string } }>('/budgets', {
          category: local.category,
          amount: local.amount,
          period: local.period || 'monthly',
          threshold: local.threshold ?? 85,
        }, { showErrorToast: false });
        const cloudId = response.data?.data?.id;
        if (cloudId) {
          await db.budgets.update(local.id, { cloudId, syncStatus: 'synced' });
          result.pushed += 1;
        }
      } catch {
        // Stays pending; the next sync retries it.
      }
    } else if (!serverIds.has(local.cloudId)) {
      await db.budgets.delete(local.id);
      result.removed += 1;
    }
  }

  return result;
};

export const pushBudgetUpdate = async (
  budget: Pick<Budget, 'id' | 'cloudId'>,
  updates: { amount?: number; threshold?: number },
): Promise<void> => {
  if (!budget.cloudId) {
    // Not on the server yet — mark it so the next sync pushes the current values.
    await db.budgets.update(budget.id, { syncStatus: 'pending' });
    return;
  }
  try {
    await apiClient.put(`/budgets/${budget.cloudId}`, updates, { showErrorToast: false });
  } catch {
    await db.budgets.update(budget.id, { syncStatus: 'pending' });
  }
};

export const deleteBudgetEverywhere = async (budget: Budget): Promise<void> => {
  await db.budgets.delete(budget.id);
  if (!budget.cloudId) return;
  try {
    await apiClient.delete(`/budgets/${budget.cloudId}`, { showErrorToast: false });
  } catch {
    // The row is gone locally; the next successful sync re-pulls it if the
    // delete never landed, which is better than leaving a ghost budget that
    // keeps generating alerts.
  }
};

// ─── Recurring transactions ──────────────────────────────────────────────────

/** Frequencies the local table understands. */
const RECURRING_FREQUENCIES = new Set(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']);
/** Subset the API accepts — POST /recurring rejects anything else with a 400. */
const PUSHABLE_INTERVALS = new Set(['weekly', 'monthly', 'yearly']);

export const syncRecurringTransactions = async (): Promise<FeatureSyncResult> => {
  let serverRows: RecurringApiRow[];
  try {
    const response = await apiClient.get<{ success?: boolean; data?: RecurringApiRow[] } | RecurringApiRow[]>(
      '/recurring',
      { showErrorToast: false },
    );
    const payload = response.data as any;
    serverRows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  } catch {
    return { ...EMPTY_RESULT, offline: true };
  }

  const result: FeatureSyncResult = { pulled: 0, pushed: 0, removed: 0 };
  const localRows = await db.recurringTransactions.toArray();
  const byCloudId = new Map(localRows.filter((row) => row.cloudId).map((row) => [row.cloudId!, row]));
  const serverIds = new Set(serverRows.map((row) => row.id));

  for (const row of serverRows) {
    const frequency = RECURRING_FREQUENCIES.has(row.interval) ? row.interval : 'monthly';
    const existing = byCloudId.get(row.id);
    const fields = {
      name: row.title || row.description || 'Recurring',
      type: (row.type === 'income' ? 'income' : 'expense') as RecurringTransaction['type'],
      amount: toNumber(row.amount),
      category: row.category || 'other',
      frequency: frequency as RecurringTransaction['frequency'],
      nextDueDate: new Date(row.nextDueDate),
      status: (row.status === 'paused' ? 'paused' : 'active') as RecurringTransaction['status'],
      notes: row.notes || undefined,
      syncStatus: 'synced' as const,
      updatedAt: new Date(),
    };

    if (existing?.id !== undefined) {
      await db.recurringTransactions.update(existing.id, fields);
    } else {
      await db.recurringTransactions.add({
        ...fields,
        cloudId: row.id,
        accountId: 0,
        startDate: row.startDate ? new Date(row.startDate) : new Date(),
        createdAt: new Date(),
      } as RecurringTransaction);
    }
    result.pulled += 1;
  }

  for (const local of localRows) {
    if (local.id === undefined) continue;

    if (!local.cloudId && !local.deletedAt) {
      // A schedule the API cannot express would be rejected with a 400 on every
      // sync. Leave it local rather than retrying forever or quietly rewriting
      // the user's schedule to one the server happens to accept.
      if (!PUSHABLE_INTERVALS.has(local.frequency)) continue;

      try {
        const response = await apiClient.post<any>('/recurring', {
          title: local.name,
          amount: local.amount,
          type: local.type,
          category: local.category,
          interval: local.frequency,
          nextDueDate: new Date(local.nextDueDate).toISOString(),
          description: local.notes || undefined,
        }, { showErrorToast: false });
        const cloudId = response.data?.data?.id ?? response.data?.id;
        if (cloudId) {
          await db.recurringTransactions.update(local.id, { cloudId: String(cloudId), syncStatus: 'synced' });
          result.pushed += 1;
        }
      } catch {
        // Stays pending for the next sync.
      }
    } else if (local.cloudId && !serverIds.has(local.cloudId)) {
      await db.recurringTransactions.delete(local.id);
      result.removed += 1;
    }
  }

  return result;
};
