/**
 * Getting imported transactions onto the server — in bulk, not one by one.
 *
 * The in-app importers (statements parsed on the device, third-party CSV/JSON,
 * KANAKU backups) write reviewed rows to IndexedDB so they show up at once. Each
 * of those rows used to queue its own upload, so a 600-row file became 600
 * POSTs: minutes of trickle, the per-user rate limit (429 "doing that too fast"),
 * and a server that disagreed with the device until the queue drained.
 *
 * Now the importer writes the rows WITHOUT queueing them and hands their local
 * ids here. They go to POST /import/transactions in chunks of 250 — each chunk
 * one database transaction on the server, idempotent per row — and each local
 * row is linked to its server id the way the sync engine links a normal save
 * (`cloudId` + `syncStatus: 'synced'`). Anything that cannot go this way (the
 * device is offline, the account is not on the server yet, the row belongs to a
 * group expense) falls back to the normal sync queue, so nothing is ever left
 * local-only.
 */
import { db, type Transaction } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import {
  processPendingSyncQueue,
  queueRecordUpsertSync,
  runWithCloudSyncSuppressed,
} from '@/lib/auth-sync-integration';
import { TokenManager } from '@/lib/api';

export const IMPORT_CHUNK_SIZE = 250;

export interface BulkPushResult {
  /** Created on the server now. */
  pushed: number;
  /** The server already had them (a retry, or a re-import): linked, not duplicated. */
  alreadyOnServer: number;
  /** Left to the normal sync queue. */
  queued: number;
  /** Refused by the server (kept on the device, reported to the user). */
  failed: Array<{ localId: number; message: string }>;
}

interface ServerImportResponse {
  created: Array<{ key: string; transaction: { id: string; updatedAt?: string } }>;
  duplicates: Array<{ key: string; transactionId: string | null }>;
  failed: Array<{ key: string; code: string; message: string }>;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** The calendar day the user sees — never toISOString(), which shifts IST dates back a day. */
const localDay = (value: Date | string) => {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const newBatchId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const externalIdOf = (row: Transaction): string | null => {
  const metadata = (row as { importMetadata?: Record<string, unknown> }).importMetadata;
  const value = metadata?.['Expense Id'] ?? metadata?.['Transaction Id'] ?? metadata?.['External Id'];
  return value != null && String(value).trim() ? String(value).trim().slice(0, 200) : null;
};

const queueAll = (ids: number[]) => {
  ids.forEach((id) => queueRecordUpsertSync('transactions', id));
  void processPendingSyncQueue();
};

async function postChunk(source: string, rows: unknown[], key: string): Promise<ServerImportResponse> {
  let lastError: unknown;
  // Same key on every attempt: a chunk the server committed but whose reply was
  // lost replays its original answer instead of importing twice.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await backendService.api.post('/import/transactions', { source, rows }, {
        headers: { 'Idempotency-Key': key },
        timeout: 90_000,
      });
      return response.data as ServerImportResponse;
    } catch (error) {
      lastError = error;
      const status = (error as { original?: { response?: { status?: number } }; status?: number })?.original?.response?.status
        ?? (error as { status?: number })?.status;
      // A 4xx will not improve by retrying.
      if (status && status >= 400 && status < 500 && status !== 429) break;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Push freshly imported local transactions. `source` is a short label (the file
 * name). Rows must have been written with sync suppressed, so nothing else is
 * uploading them at the same time.
 */
export async function pushImportedTransactions(localIds: number[], source: string): Promise<BulkPushResult> {
  const result: BulkPushResult = { pushed: 0, alreadyOnServer: 0, queued: 0, failed: [] };
  const ids = [...new Set(localIds.filter((id) => Number.isFinite(id)))];
  if (ids.length === 0) return result;

  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (!online || !TokenManager.getAccessToken()) {
    queueAll(ids);
    result.queued = ids.length;
    return result;
  }

  // Accounts the import just created are queued as ordinary creates; push them
  // first so the transactions have a server account to point at.
  await processPendingSyncQueue().catch(() => undefined);

  const rows = (await db.transactions.bulkGet(ids)).map((row, i) => ({ row, localId: ids[i] }));
  const accounts = await db.accounts.toArray();
  const cloudIdOf = new Map(accounts.filter((a) => a.id != null && a.cloudId).map((a) => [a.id as number, String(a.cloudId)]));

  const fallback: number[] = [];
  const payload: Array<Record<string, unknown>> = [];
  for (const { row, localId } of rows) {
    if (!row || row.deletedAt) continue;
    if (row.cloudId) continue; // already on the server
    const accountCloudId = cloudIdOf.get(row.accountId);
    const transferCloudId = row.transferToAccountId != null ? cloudIdOf.get(row.transferToAccountId) : undefined;
    const supportedType = row.type === 'income' || row.type === 'expense' || row.type === 'transfer';
    if (
      !accountCloudId
      || !supportedType
      || (row.type === 'transfer' && !transferCloudId)
      || row.groupExpenseId != null
      || !(Number(row.amount) > 0)
    ) {
      fallback.push(localId);
      continue;
    }
    const currency = (row as { currency?: string }).currency;
    payload.push({
      clientRowId: String(localId),
      accountId: accountCloudId,
      type: row.type,
      amount: Math.abs(Number(row.amount)),
      date: localDay(row.date),
      category: (row.category || 'Others').slice(0, 100),
      subcategory: row.subcategory ? String(row.subcategory).slice(0, 100) : null,
      description: row.description ? String(row.description).slice(0, 500) : null,
      merchant: row.merchant ? String(row.merchant).slice(0, 200) : null,
      transferToAccountId: row.type === 'transfer' ? transferCloudId : null,
      externalId: externalIdOf(row),
      currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    });
  }

  const batchId = newBatchId();
  for (let i = 0; i < payload.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + IMPORT_CHUNK_SIZE);
    let response: ServerImportResponse;
    try {
      response = await postChunk(source.slice(0, 200) || 'import', chunk, `${batchId}:${i / IMPORT_CHUNK_SIZE}`);
    } catch {
      // Keep the rows and let the sync queue deliver them later.
      fallback.push(...chunk.map((r) => Number(r.clientRowId)));
      continue;
    }

    await runWithCloudSyncSuppressed(async () => {
      await db.transaction('rw', db.transactions, async () => {
        for (const created of response.created) {
          await db.transactions.update(Number(created.key), {
            cloudId: created.transaction.id,
            syncStatus: 'synced',
            updatedAt: created.transaction.updatedAt ? new Date(created.transaction.updatedAt) : new Date(),
          } as Partial<Transaction>);
        }
        for (const dup of response.duplicates) {
          const localId = Number(dup.key);
          if (!dup.transactionId) continue;
          const mirror = await db.transactions.where('cloudId').equals(dup.transactionId).first().catch(() => undefined);
          if (mirror?.id != null && mirror.id !== localId) {
            // The device already shows the server's copy: this new row is the duplicate.
            await db.transactions.delete(localId);
          } else {
            await db.transactions.update(localId, { cloudId: dup.transactionId, syncStatus: 'synced' } as Partial<Transaction>);
          }
        }
      });
    });
    result.pushed += response.created.length;
    result.alreadyOnServer += response.duplicates.length;
    for (const failure of response.failed) {
      result.failed.push({ localId: Number(failure.key), message: failure.message });
    }
  }

  if (fallback.length) {
    queueAll(fallback);
    result.queued = fallback.length;
  }
  return result;
}
