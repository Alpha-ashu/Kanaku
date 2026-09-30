/**
 * Bulk import of reviewed transactions into the ledger — the one write path for
 * every importer: bank statements parsed on the server (/import/confirm),
 * files parsed in the app (/import/transactions: third-party CSV/JSON exports,
 * KANAKU backups, statements parsed offline) and API feeds
 * (/transactions/import/third-party).
 *
 * Guarantees:
 *   - All-or-nothing: every accepted row plus the account balance changes
 *     commit in ONE database transaction. Rows that cannot be imported (unknown
 *     account, bad transfer) are reported per row and never block the rest.
 *   - Idempotent: each row gets a deterministic dedupHash, so re-importing the
 *     same file — or a retried request — skips what is already there. Rows that
 *     are identical within one file (two ₹20 teas on the same day) are told apart
 *     by their occurrence number, so both import once and re-import zero times;
 *     before, the second one hit the unique index and failed the whole import.
 *     A row that carries the source app's own id is keyed on that id.
 *   - Balances stay derived: each account moves once, by the net of the rows
 *     actually inserted (transfers move both sides), exactly as if each row had
 *     been entered by hand.
 *   - Fast: one INSERT for the whole batch. The old per-row create inside the
 *     transaction spent a round trip per row (~100-300 ms against the hosted
 *     database) and ran into the 60 s transaction limit on large statements.
 */
import { createHash } from 'crypto';
import { prisma } from '../../db/prisma';
import { Prisma } from '../../db/prisma-client';
import { logger } from '../../config/logger';
import { eventBus } from '../../utils/eventBus';
import { isOverdraw } from '../../utils/money';
import { cacheDeleteByPrefix, cacheDeleteByUserId } from '../../cache/redis';
import { transactionRepository } from '../transactions/transaction.repository';

export const MAX_IMPORT_ROWS = 1000;

export interface LedgerImportRow {
  /** The caller's reference for this row (row index, client row id) — echoed back. */
  key: string;
  accountId: string;
  type: 'income' | 'expense' | 'transfer';
  /** Positive amount in the account's currency. */
  amount: number;
  date: Date;
  category: string;
  subcategory?: string | null;
  description?: string | null;
  merchant?: string | null;
  transferToAccountId?: string | null;
  /** The source system's own id for the row (e.g. a Splitwise/Walnut "Expense Id"). */
  externalId?: string | null;
  currency?: string | null;
  importMetadata?: Record<string, unknown> | null;
}

export interface LedgerImportOptions {
  /** Short label stored on each row, e.g. the file name. */
  source: string;
  /** Refuse an import that would take a non-credit account below zero. */
  enforceBalance?: boolean;
}

export interface LedgerImportResult {
  created: Array<{ key: string; transaction: ReturnType<typeof transactionRepository.normalizeTransaction> }>;
  duplicates: Array<{ key: string; transactionId: string | null }>;
  failed: Array<{ key: string; code: string; message: string }>;
  accounts: Array<{ id: string; name: string; balance: number }>;
}

export class ImportOverdrawError extends Error {
  readonly code = 'IMPORT_OVERDRAW';
}

const money = (value: number) => Number(value.toFixed(2));

const externalHash = (userId: string, externalId: string, amount: number, date: Date) =>
  createHash('sha256')
    .update(`${userId}:import-ext:${externalId}:${money(amount)}:${date.toISOString().slice(0, 10)}`)
    .digest('hex');

export async function importLedgerRows(
  userId: string,
  input: LedgerImportRow[],
  options: LedgerImportOptions,
): Promise<LedgerImportResult> {
  if (input.length > MAX_IMPORT_ROWS) {
    throw Object.assign(new Error(`Too many rows (max ${MAX_IMPORT_ROWS} per import)`), { code: 'IMPORT_TOO_LARGE' });
  }
  const failed: LedgerImportResult['failed'] = [];

  // ── Account ownership: one query for every account the batch touches ──────
  const accountIds = [...new Set(input.flatMap((r) => [r.accountId, r.transferToAccountId]).filter((id): id is string => Boolean(id)))];
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId, deletedAt: null, isActive: true },
    select: { id: true, name: true, type: true, currency: true },
  });
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // ── Validate and fingerprint ──────────────────────────────────────────────
  const occurrences = new Map<string, number>();
  const prepared: Array<LedgerImportRow & { dedupHash: string; amount: number }> = [];
  for (const row of input) {
    const amount = money(Number(row.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      failed.push({ key: row.key, code: 'INVALID_AMOUNT', message: 'Amount must be a positive number.' });
      continue;
    }
    if (!(row.date instanceof Date) || Number.isNaN(row.date.getTime())) {
      failed.push({ key: row.key, code: 'INVALID_DATE', message: 'The date could not be read.' });
      continue;
    }
    if (!accountById.has(row.accountId)) {
      failed.push({ key: row.key, code: 'ACCOUNT_UNAVAILABLE', message: 'The account for this row does not exist or is archived.' });
      continue;
    }
    if (row.type === 'transfer') {
      if (!row.transferToAccountId || row.transferToAccountId === row.accountId || !accountById.has(row.transferToAccountId)) {
        failed.push({ key: row.key, code: 'INVALID_TRANSFER', message: 'A transfer needs a different, existing destination account.' });
        continue;
      }
    }

    const description = (row.description || '').slice(0, 300);
    let dedupHash: string;
    if (row.externalId) {
      dedupHash = externalHash(userId, row.externalId, amount, row.date);
    } else {
      const base = transactionRepository.generateDedupHash(userId, amount, row.date, description);
      const seen = (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, seen);
      dedupHash = seen === 1 ? base : `${base}:occ${seen}`;
    }
    prepared.push({ ...row, amount, description, dedupHash });
  }

  // ── Already imported (any state, soft-deleted included: the unique index is) ─
  const existing = prepared.length
    ? await prisma.transaction.findMany({
        where: { dedupHash: { in: prepared.map((r) => r.dedupHash) } },
        select: { id: true, dedupHash: true },
      })
    : [];
  const existingByHash = new Map(existing.map((e) => [e.dedupHash as string, e.id]));
  const duplicates: LedgerImportResult['duplicates'] = [];
  const toInsert = prepared.filter((row) => {
    const hit = existingByHash.get(row.dedupHash);
    if (hit) duplicates.push({ key: row.key, transactionId: hit });
    return !hit;
  });

  const importedAt = new Date();
  const inserted = toInsert.length === 0 ? [] : await prisma.$transaction(async (tx) => {
    const rows = await tx.transaction.createManyAndReturn({
      data: toInsert.map((row) => ({
        userId,
        accountId: row.accountId,
        type: row.type,
        amount: new Prisma.Decimal(row.amount),
        category: row.category.slice(0, 100) || 'Others',
        subcategory: row.subcategory ? row.subcategory.slice(0, 100) : null,
        description: row.description || null,
        merchant: row.merchant ? row.merchant.slice(0, 100) : null,
        date: row.date,
        transferToAccountId: row.type === 'transfer' ? row.transferToAccountId : null,
        transferType: row.type === 'transfer' ? 'manual' : null,
        currency: row.currency || accountById.get(row.accountId)?.currency || undefined,
        importSource: options.source.slice(0, 200),
        importedAt,
        importMetadata: row.importMetadata ? JSON.stringify(row.importMetadata).slice(0, 10_000) : null,
        dedupHash: row.dedupHash,
        synced: true,
        syncStatus: 'synced',
      })),
      // A concurrent import of the same rows loses quietly instead of failing.
      skipDuplicates: true,
    });

    // Net balance change per account, from the rows that actually went in.
    const deltas = new Map<string, Prisma.Decimal>();
    const add = (id: string | null | undefined, delta: Prisma.Decimal) => {
      if (!id) return;
      deltas.set(id, (deltas.get(id) ?? new Prisma.Decimal(0)).plus(delta));
    };
    for (const row of rows) {
      const amount = new Prisma.Decimal(row.amount);
      if (row.type === 'income') add(row.accountId, amount);
      else if (row.type === 'expense') add(row.accountId, amount.neg());
      else if (row.type === 'transfer') {
        add(row.accountId, amount.neg());
        add(row.transferToAccountId, amount);
      }
    }
    // Sorted, so two imports touching the same accounts lock them in the same order.
    for (const [accountId, delta] of [...deltas].sort(([a], [b]) => a.localeCompare(b))) {
      if (delta.isZero()) continue;
      const updated = await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: delta } },
        select: { balance: true, type: true, name: true },
      });
      if (options.enforceBalance && isOverdraw(updated.balance, delta, updated.type)) {
        throw new ImportOverdrawError(
          `Import would overdraw '${updated.name}' (balance would fall below zero). Deselect some debit rows or choose another account.`,
        );
      }
    }
    return rows;
  }, { timeout: 60_000, maxWait: 20_000 });

  // Rows another request inserted between our check and our insert.
  const insertedHashes = new Set(inserted.map((r) => r.dedupHash));
  const raced = toInsert.filter((r) => !insertedHashes.has(r.dedupHash));
  if (raced.length) {
    const winners = await prisma.transaction.findMany({
      where: { dedupHash: { in: raced.map((r) => r.dedupHash) } },
      select: { id: true, dedupHash: true },
    });
    const winnerByHash = new Map(winners.map((w) => [w.dedupHash as string, w.id]));
    for (const row of raced) duplicates.push({ key: row.key, transactionId: winnerByHash.get(row.dedupHash) ?? null });
  }

  const keyByHash = new Map(toInsert.map((r) => [r.dedupHash, r.key]));
  const created = inserted.map((row) => ({
    key: keyByHash.get(row.dedupHash as string) as string,
    transaction: transactionRepository.normalizeTransaction(row),
  }));

  if (inserted.length) {
    await Promise.allSettled([
      cacheDeleteByUserId(userId),
      cacheDeleteByPrefix('transactions:'),
      cacheDeleteByPrefix('accounts:'),
    ]);
    // Budgets recompute per (category, period): one event per distinct
    // category-month is enough, instead of one per imported row.
    const seen = new Set<string>();
    for (const row of inserted) {
      if (row.type !== 'expense') continue;
      const bucket = `${row.category}|${row.date.toISOString().slice(0, 7)}`;
      if (seen.has(bucket) || seen.size >= 50) continue;
      seen.add(bucket);
      eventBus.emit({
        type: 'TRANSACTION_CREATED',
        payload: { userId, transactionId: row.id, accountId: row.accountId, amount: Number(row.amount), category: row.category },
      });
    }
  }

  const touched = [...new Set(inserted.flatMap((r) => [r.accountId, r.transferToAccountId]).filter((id): id is string => Boolean(id)))];
  const balances = touched.length
    ? await prisma.account.findMany({ where: { id: { in: touched }, userId }, select: { id: true, name: true, balance: true } })
    : [];

  if (inserted.length || failed.length) {
    logger.info('[import] ledger import', {
      userId, source: options.source, created: inserted.length, duplicates: duplicates.length, failed: failed.length,
    });
  }

  return {
    created,
    duplicates,
    failed,
    accounts: balances.map((a) => ({ id: a.id, name: a.name, balance: Number(a.balance) })),
  };
}
