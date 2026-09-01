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
import { db, type AppCategory, type Budget, type RecurringTransaction } from '@/lib/database';

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

interface CategoryApiRow {
  id: string;
  name: string;
  type: 'expense' | 'income';
  color: string;
  icon: string;
  createdFromImport?: boolean;
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

/**
 * apiClient already unwraps one envelope level (`data: data.data || data` in
 * api.ts), so `response.data` IS the payload — `response.data.data` is undefined.
 * Accept either shape: the generic type parameters at these call sites describe
 * the raw backend envelope, which made the wrong access type-check cleanly.
 */
const unwrapList = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  const nested = (payload as { data?: unknown } | null)?.data;
  return Array.isArray(nested) ? (nested as T[]) : [];
};

const unwrapId = (payload: unknown): string | undefined =>
  (payload as { id?: string; data?: { id?: string } } | null)?.id ??
  (payload as { data?: { id?: string } } | null)?.data?.id;

// ─── Budgets ─────────────────────────────────────────────────────────────────

// The server rejects a second budget with the same (userId, category, period) —
// see the @@unique on the Budget model — so that triple is a budget's identity.
// Normalising both sides through these lets an unlinked local row recognise its
// server twin instead of POSTing a duplicate the server will always refuse.
const normalizeBudgetPeriod = (period: unknown): string => {
  const raw = String(period ?? 'monthly').trim().toLowerCase();
  return ['weekly', 'monthly', 'yearly'].includes(raw) ? raw : 'monthly';
};

const normalizeBudgetCategory = (category: unknown): string =>
  String(category ?? '').trim() || 'General';

const budgetIdentity = (category: unknown, period: unknown): string =>
  `${normalizeBudgetCategory(category).toLowerCase()}|${normalizeBudgetPeriod(period)}`;

export const syncBudgets = async (): Promise<FeatureSyncResult> => {
  let serverRows: BudgetApiRow[];
  try {
    const response = await apiClient.get<{ success: boolean; data: BudgetApiRow[] }>('/budgets', {
      showErrorToast: false,
    });
    serverRows = unwrapList<BudgetApiRow>(response.data);
  } catch {
    return { ...EMPTY_RESULT, offline: true };
  }

  const result: FeatureSyncResult = { pulled: 0, pushed: 0, removed: 0 };
  const localRows = await db.budgets.toArray();
  const byCloudId = new Map(localRows.filter((row) => row.cloudId).map((row) => [row.cloudId!, row]));
  // Unlinked local rows keyed by budget identity, so one that was created offline
  // (or whose link was lost) adopts its server twin during the pull instead of
  // falling into the push loop below and 400ing on every sync forever.
  const unlinkedByIdentity = new Map(
    localRows
      .filter((row) => !row.cloudId)
      .map((row) => [budgetIdentity(row.category, row.period), row]),
  );
  const serverIds = new Set(serverRows.map((row) => row.id));
  const adoptedLocalIds = new Set<string>();

  for (const row of serverRows) {
    const existing =
      byCloudId.get(row.id) ?? unlinkedByIdentity.get(budgetIdentity(row.category, row.period));
    if (existing) {
      if (!existing.cloudId) adoptedLocalIds.add(existing.id);
      await db.budgets.update(existing.id, {
        cloudId: row.id,
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
    if (adoptedLocalIds.has(local.id)) continue; // linked to its server twin above
    if (!local.cloudId) {
      const identity = budgetIdentity(local.category, local.period);
      try {
        const validPeriod = normalizeBudgetPeriod(local.period);
        const validAmount = Number(local.amount) > 0 ? Number(local.amount) : 1;
        const validThreshold = Math.min(100, Math.max(1, Math.round(Number(local.threshold) || 85)));

        const response = await apiClient.post<{ success: boolean; data: { id: string } }>('/budgets', {
          category: normalizeBudgetCategory(local.category),
          amount: validAmount,
          period: validPeriod,
          threshold: validThreshold,
        }, { showErrorToast: false });
        const cloudId = unwrapId(response.data);
        if (cloudId) {
          await db.budgets.update(local.id, { cloudId, syncStatus: 'synced' });
          result.pushed += 1;
        }
      } catch (error) {
        // DUPLICATE_BUDGET means the server already holds this category+period,
        // so re-POSTing can only ever 400 again. Link to the twin and stop — this
        // branch used to swallow the error and leave the row unlinked, so every
        // sync re-pushed the same record and the console filled with 400s.
        if ((error as { code?: string } | null)?.code === 'DUPLICATE_BUDGET') {
          const twin = serverRows.find((row) => budgetIdentity(row.category, row.period) === identity);
          if (twin) {
            await db.budgets.update(local.id, { cloudId: twin.id, syncStatus: 'synced' });
          } else {
            console.warn(`[FeatureSync] Server rejected budget "${identity}" as duplicate but did not list it.`);
          }
        }
        // Anything else stays pending; the next sync retries it.
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

// ─── Categories ──────────────────────────────────────────────────────────────

/** Presentation defaults for a category that arrived without any (import path). */
const DEFAULT_CATEGORY_COLOR = '#6B7280';
const DEFAULT_CATEGORY_ICON = 'tag';

/** POST /categories/bulk caps a request at 200. */
const CATEGORY_BULK_LIMIT = 200;

/**
 * A category's identity is (type, name) — the server enforces exactly that with
 * `@@unique([userId, name, type])`. Matching on it rather than on an id means a
 * category created offline, or seeded locally before the account existed, links
 * to its server twin instead of being duplicated.
 */
const categoryIdentity = (type: string, name: string) =>
  `${String(type || 'expense').toLowerCase()}::${String(name || '').trim().toLowerCase()}`;

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Reconcile the local category taxonomy with the backend.
 *
 * Unlike budgets, unlinked local rows are pushed through POST /categories/bulk:
 * an import can introduce dozens of unseen categories at once, and one request
 * per category would both hammer the API and leave a half-built taxonomy behind
 * if it were interrupted. The endpoint converges on names that already exist
 * (returning them rather than 400ing), so this can never fall into the
 * push-reject-retry loop that duplicate handling caused for budgets.
 */
export const syncCategories = async (): Promise<FeatureSyncResult> => {
  let serverRows: CategoryApiRow[];
  try {
    const response = await apiClient.get<{ success: boolean; data: CategoryApiRow[] }>('/categories', {
      showErrorToast: false,
    });
    serverRows = unwrapList<CategoryApiRow>(response.data);
  } catch {
    return { ...EMPTY_RESULT, offline: true };
  }

  const result: FeatureSyncResult = { pulled: 0, pushed: 0, removed: 0 };
  const localRows = (await db.categories.toArray()).filter((row) => !row.deletedAt);
  const byCloudId = new Map(localRows.filter((row) => row.cloudId).map((row) => [row.cloudId!, row]));
  const byIdentity = new Map(localRows.map((row) => [categoryIdentity(row.type, row.name), row]));
  const serverIds = new Set(serverRows.map((row) => row.id));
  const linkedLocalIds = new Set<string>();

  // ── Pull ──
  for (const row of serverRows) {
    const existing = byCloudId.get(row.id) ?? byIdentity.get(categoryIdentity(row.type, row.name));
    if (existing) {
      linkedLocalIds.add(existing.id);
      await db.categories.update(existing.id, {
        cloudId: row.id,
        name: row.name,
        type: row.type,
        color: row.color,
        icon: row.icon,
        createdFromImport: row.createdFromImport ?? existing.createdFromImport,
        isCustom: true,
      });
    } else {
      await db.categories.put({
        id: crypto.randomUUID(),
        cloudId: row.id,
        name: row.name,
        type: row.type,
        color: row.color,
        icon: row.icon,
        createdFromImport: row.createdFromImport ?? false,
        isCustom: true,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      });
    }
    result.pulled += 1;
  }

  // ── Push: everything the server has not seen, in one round trip per chunk ──
  const unlinked = localRows.filter((row) => !row.cloudId && !linkedLocalIds.has(row.id));
  for (const batch of chunk(unlinked, CATEGORY_BULK_LIMIT)) {
    try {
      const response = await apiClient.post<{ success: boolean; data: CategoryApiRow[] }>(
        '/categories/bulk',
        {
          categories: batch.map((row) => ({
            name: row.name,
            type: row.type,
            color: row.color || DEFAULT_CATEGORY_COLOR,
            icon: row.icon || DEFAULT_CATEGORY_ICON,
          })),
          createdFromImport: batch.every((row) => row.createdFromImport === true),
        },
        { showErrorToast: false },
      );

      // The response carries every requested category, created or pre-existing,
      // so one pass links the whole batch.
      const returnedByIdentity = new Map(
        unwrapList<CategoryApiRow>(response.data).map((row) => [categoryIdentity(row.type, row.name), row]),
      );
      for (const local of batch) {
        const match = returnedByIdentity.get(categoryIdentity(local.type, local.name));
        if (!match) continue;
        await db.categories.update(local.id, { cloudId: match.id, isCustom: true });
        result.pushed += 1;
      }
    } catch {
      // Stays unlinked; the next sync retries the batch.
    }
  }

  // ── Rows deleted on the server ──
  for (const local of localRows) {
    if (local.cloudId && !serverIds.has(local.cloudId)) {
      await db.categories.delete(local.id);
      result.removed += 1;
    }
  }

  return result;
};

/** Create a category on both sides. Returns the local row. */
export const createCategoryEverywhere = async (input: {
  name: string;
  type: 'expense' | 'income';
  color?: string;
  icon?: string;
  createdFromImport?: boolean;
}): Promise<AppCategory> => {
  const name = input.name.trim();
  const identity = categoryIdentity(input.type, name);

  const existing = (await db.categories.toArray()).find(
    (row) => !row.deletedAt && categoryIdentity(row.type, row.name) === identity,
  );
  if (existing) return existing;

  const local: AppCategory = {
    id: crypto.randomUUID(),
    name,
    type: input.type,
    color: input.color || DEFAULT_CATEGORY_COLOR,
    icon: input.icon || DEFAULT_CATEGORY_ICON,
    createdFromImport: input.createdFromImport ?? false,
    isCustom: true,
    createdAt: new Date(),
  };

  // Local first: the category must be usable immediately, offline included.
  await db.categories.put(local);

  try {
    const response = await apiClient.post<{ success: boolean; data: CategoryApiRow }>(
      '/categories',
      {
        name: local.name,
        type: local.type,
        color: local.color,
        icon: local.icon,
        createdFromImport: local.createdFromImport,
      },
      { showErrorToast: false },
    );
    const cloudId = unwrapId(response.data);
    if (cloudId) {
      await db.categories.update(local.id, { cloudId });
      return { ...local, cloudId };
    }
  } catch {
    // Left unlinked — syncCategories() pushes it on the next run.
  }

  return local;
};

/** Rename / restyle a category on both sides. */
export const updateCategoryEverywhere = async (
  category: AppCategory,
  updates: { name?: string; color?: string; icon?: string },
): Promise<void> => {
  await db.categories.update(category.id, updates);
  if (!category.cloudId) return;
  try {
    await apiClient.put(`/categories/${category.cloudId}`, updates, { showErrorToast: false });
  } catch {
    // The local edit stands; the next sync re-pulls server state if it never landed.
  }
};

/**
 * Delete a category on both sides. Transactions keep their label — the server
 * stores `Transaction.category` as a name, not a foreign key — so this removes
 * the category from pickers without touching history.
 */
export const deleteCategoryEverywhere = async (category: AppCategory): Promise<void> => {
  await db.categories.delete(category.id);
  if (!category.cloudId) return;
  try {
    await apiClient.delete(`/categories/${category.cloudId}`, { showErrorToast: false });
  } catch {
    // Gone locally; a failed delete is re-pulled by the next sync rather than
    // leaving a category the user believes they removed.
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
    serverRows = unwrapList<RecurringApiRow>(response.data);
  } catch {
    return { ...EMPTY_RESULT, offline: true };
  }

  const result: FeatureSyncResult = { pulled: 0, pushed: 0, removed: 0 };
  const localRows = await db.recurringTransactions.toArray();
  const byCloudId = new Map(localRows.filter((row) => row.cloudId).map((row) => [row.cloudId!, row]));
  const serverIds = new Set(serverRows.map((row) => row.id));

  for (const row of serverRows) {
    const frequency = RECURRING_FREQUENCIES.has(row.interval) ? row.interval : 'monthly';
    const targetType = (row.type === 'income' ? 'income' : 'expense') as RecurringTransaction['type'];
    const targetAmount = toNumber(row.amount);
    const targetTitle = (row.title || row.description || 'Recurring').trim().toLowerCase();

    // 1. Look up by cloud ID
    let existing = byCloudId.get(row.id);

    // 2. If not found by cloud ID, look up by clientRequestId among unlinked local records
    if (!existing && (row as any).clientRequestId) {
      existing = localRows.find(
        (l) => !l.cloudId && (l as any).clientRequestId === (row as any).clientRequestId
      );
    }

    const fields = {
      name: row.title || row.description || 'Recurring',
      type: targetType,
      amount: targetAmount,
      category: row.category || 'other',
      frequency: frequency as RecurringTransaction['frequency'],
      nextDueDate: new Date(row.nextDueDate),
      status: (row.status === 'paused' ? 'paused' : 'active') as RecurringTransaction['status'],
      notes: row.notes || undefined,
      syncStatus: 'synced' as const,
      updatedAt: new Date(),
    };

    if (existing?.id !== undefined) {
      await db.recurringTransactions.update(existing.id, {
        ...fields,
        cloudId: row.id,
      });
      byCloudId.set(row.id, { ...existing, ...fields, cloudId: row.id });
    } else {
      const newId = await db.recurringTransactions.add({
        ...fields,
        cloudId: row.id,
        accountId: 0,
        startDate: row.startDate ? new Date(row.startDate) : new Date(),
        createdAt: new Date(),
      } as RecurringTransaction);
      byCloudId.set(row.id, { ...fields, id: newId as number, cloudId: row.id } as RecurringTransaction);
    }
    result.pulled += 1;
  }

  // Refresh local rows after pull
  const refreshedLocalRows = await db.recurringTransactions.toArray();

  for (const local of refreshedLocalRows) {
    if (local.id === undefined) continue;

    if (!local.cloudId && !local.deletedAt) {
      // A schedule the API cannot express would be rejected with a 400 on every sync.
      if (!PUSHABLE_INTERVALS.has(local.frequency)) continue;

      try {
        const clientRequestId = (local as any).clientRequestId || `rec_local_${local.id}`;
        const response = await apiClient.post<any>('/recurring', {
          title: local.name,
          amount: Number(local.amount),
          type: local.type,
          category: local.category,
          interval: local.frequency,
          nextDueDate: new Date(local.nextDueDate).toISOString(),
          description: local.notes || undefined,
          clientRequestId,
        }, { showErrorToast: false });

        const cloudId = unwrapId(response.data);
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
