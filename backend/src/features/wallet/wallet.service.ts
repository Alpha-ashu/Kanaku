import { randomUUID } from 'crypto';
import { prisma } from '../../db/prisma';
import { Prisma } from '../../db/prisma-client';
import { WalletError } from './wallet.errors';
import { walletConfig } from './wallet.config';

/**
 * The coin ledger.
 *
 * Every balance change goes through `postEntry`, inside a database transaction,
 * as ONE conditional statement:
 *
 *   UPDATE wallets SET available_balance = available_balance + $delta
 *   WHERE id = $id AND available_balance + $delta >= 0 RETURNING ...
 *
 * The check and the write are the same statement, and Postgres holds the row
 * lock until commit — so two debits of 80 against a balance of 100 cannot both
 * pass, whatever order they arrive in. The CHECK constraint on the table is the
 * backstop. The ledger row that records the movement is written in the same
 * transaction with the balances after it and a UNIQUE `reference`, so a retried
 * operation fails the insert instead of applying twice, and callers check the
 * reference first (under an advisory lock) to answer a retry as a replay.
 *
 * Raw SQL for the balance statement is deliberate: Prisma's `update` cannot
 * express "only if the result stays >= 0" and return the new balances in one
 * round trip. All values are bound parameters; the only interpolated identifier
 * comes from a fixed two-entry map.
 */

export type Tx = Prisma.TransactionClient;

export type LedgerType =
  | 'PAYMENT_CREDIT'
  | 'SESSION_PAYMENT'
  | 'SESSION_EARNING'
  | 'EARNING_RELEASE'
  | 'SESSION_REFUND'
  | 'EARNING_REVERSAL'
  | 'PURCHASE_REVERSAL'
  | 'ADMIN_ADJUSTMENT';

export type LedgerBucket = 'AVAILABLE' | 'PENDING';

export interface LedgerEntryInput {
  userId: string;
  type: LedgerType;
  bucket?: LedgerBucket;
  /** Signed whole coins. Positive credits, negative debits. */
  amount: number;
  reference: string;
  description: string;
  bookingId?: string | null;
  paymentOrderId?: string | null;
  reversalOfId?: string | null;
  counterpartyUserId?: string | null;
  reason?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  metadata?: Record<string, unknown>;
  /**
   * The user is spending: refused on a FROZEN wallet. Credits the platform owes
   * the user (a paid purchase, a refund) are applied even to a frozen wallet.
   */
  userInitiated?: boolean;
}

const BALANCE_COLUMN: Record<LedgerBucket, string> = {
  AVAILABLE: 'available_balance',
  PENDING: 'pending_balance',
};

/** Default options for every ledger transaction. The DB is a region away; allow for it. */
export const LEDGER_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/** Serialise work on one logical key for the rest of the transaction. */
export const lockKey = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

/** Creates the user's wallet if needed; returns its id. */
export const ensureWalletId = async (tx: Tx, userId: string): Promise<string> => {
  await tx.$executeRaw`
    INSERT INTO "wallets" ("id", "user_id", "updated_at")
    VALUES (${randomUUID()}, ${userId}, NOW())
    ON CONFLICT ("user_id") DO NOTHING`;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "wallets" WHERE "user_id" = ${userId}`;
  return rows[0].id;
};

/**
 * Locks the wallets of several users, always in the same (id) order, so two
 * transactions that each touch both a client's and an advisor's wallet cannot
 * deadlock on each other.
 */
export const lockWallets = async (tx: Tx, userIds: string[]): Promise<Map<string, string>> => {
  const unique = [...new Set(userIds)];
  for (const userId of unique) await ensureWalletId(tx, userId);
  const rows = await tx.$queryRaw<Array<{ id: string; user_id: string }>>`
    SELECT "id", "user_id" FROM "wallets" WHERE "user_id" = ANY(${unique}::text[]) ORDER BY "id" FOR UPDATE`;
  return new Map(rows.map((r) => [r.user_id, r.id]));
};

export const postEntry = async (tx: Tx, input: LedgerEntryInput) => {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new WalletError('INVALID_ADJUSTMENT', 'A ledger entry must move a whole, non-zero number of coins.');
  }
  const bucket: LedgerBucket = input.bucket ?? 'AVAILABLE';
  const column = Prisma.raw(`"${BALANCE_COLUMN[bucket]}"`);
  const walletId = await ensureWalletId(tx, input.userId);
  const activeOnly = input.userInitiated ? Prisma.sql`AND "status" = 'ACTIVE'` : Prisma.empty;

  const rows = await tx.$queryRaw<Array<{ available_balance: number; pending_balance: number }>>`
    UPDATE "wallets"
    SET ${column} = ${column} + ${input.amount}, "updated_at" = NOW()
    WHERE "id" = ${walletId} AND ${column} + ${input.amount} >= 0 ${activeOnly}
    RETURNING "available_balance", "pending_balance"`;

  if (rows.length === 0) {
    const wallet = await tx.wallet.findUnique({ where: { id: walletId }, select: { status: true, availableBalance: true, pendingBalance: true } });
    if (input.userInitiated && wallet?.status === 'FROZEN') {
      throw new WalletError('WALLET_FROZEN', 'This wallet is on hold. Please contact support.', 423);
    }
    const balance = bucket === 'PENDING' ? wallet?.pendingBalance ?? 0 : wallet?.availableBalance ?? 0;
    throw new WalletError(
      bucket === 'PENDING' ? 'ADVISOR_BALANCE_INSUFFICIENT' : 'INSUFFICIENT_COINS',
      bucket === 'PENDING' ? 'The pending balance does not cover this reversal.' : 'You do not have enough coins.',
      409,
      { required: -input.amount, available: balance },
    );
  }

  return tx.walletTransaction.create({
    data: {
      walletId,
      userId: input.userId,
      type: input.type,
      bucket,
      amount: input.amount,
      availableAfter: Number(rows[0].available_balance),
      pendingAfter: Number(rows[0].pending_balance),
      reference: input.reference,
      description: input.description,
      bookingId: input.bookingId ?? null,
      paymentOrderId: input.paymentOrderId ?? null,
      reversalOfId: input.reversalOfId ?? null,
      counterpartyUserId: input.counterpartyUserId ?? null,
      reason: input.reason ?? null,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
};

export const findEntry = (tx: Tx | typeof prisma, reference: string) =>
  tx.walletTransaction.findUnique({ where: { reference } });

// ─── Reads ─────────────────────────────────────────────────────────────────────

export interface WalletSummary {
  userId: string;
  availableBalance: number;
  pendingBalance: number;
  status: 'ACTIVE' | 'FROZEN';
  exists: boolean;
}

/** Read-only: a user without a wallet simply has none yet. */
export const getWalletSummary = async (userId: string): Promise<WalletSummary> => {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return {
    userId,
    availableBalance: wallet?.availableBalance ?? 0,
    pendingBalance: wallet?.pendingBalance ?? 0,
    status: (wallet?.status as WalletSummary['status']) ?? 'ACTIVE',
    exists: Boolean(wallet),
  };
};

export interface LedgerPage {
  cursor?: string | null;
  limit?: number;
}

const decodeCursor = (cursor: string | null | undefined): { c: string; i: string } | null => {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.c === 'string' && typeof parsed?.i === 'string' && !Number.isNaN(Date.parse(parsed.c))) return parsed;
  } catch {
    // fall through
  }
  throw new WalletError('INVALID_ADJUSTMENT', 'Invalid pagination cursor.');
};

const encodeCursor = (row: { createdAt: Date; id: string }) =>
  Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), i: row.id }), 'utf8').toString('base64url');

/** Newest-first keyset page over the ledger. Never returns an unbounded list. */
export const pageLedger = async (
  where: Prisma.WalletTransactionWhereInput,
  page: LedgerPage,
) => {
  const limit = Math.min(Math.max(Number(page.limit) || 25, 1), 100);
  const after = decodeCursor(page.cursor);
  const keyset: Prisma.WalletTransactionWhereInput = after
    ? {
      OR: [
        { createdAt: { lt: new Date(after.c) } },
        { createdAt: new Date(after.c), id: { lt: after.i } },
      ],
    }
    : {};
  const rows = await prisma.walletTransaction.findMany({
    where: { AND: [where, keyset] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
};

type LedgerRow = Awaited<ReturnType<typeof prisma.walletTransaction.findMany>>[number];

/**
 * What an account holder sees of their own ledger. No counterparty identity
 * (an advisor's earnings row does not reveal the client), no actor ids, and no
 * free-form metadata.
 */
export const toOwnerView = (row: LedgerRow) => ({
  id: row.id,
  type: row.type,
  bucket: row.bucket,
  amount: row.amount,
  availableAfter: row.availableAfter,
  pendingAfter: row.pendingAfter,
  status: row.status,
  description: row.description,
  reason: row.type === 'ADMIN_ADJUSTMENT' ? row.reason : null,
  bookingId: row.bookingId,
  paymentOrderId: row.paymentOrderId,
  createdAt: row.createdAt,
});

// ─── Admin operations ──────────────────────────────────────────────────────────

export interface AdjustmentInput {
  userId: string;
  amount: number;
  reason: string;
  actorId: string;
  actorRole: string;
  /** Client-supplied key so a retried request cannot adjust twice. */
  idempotencyKey: string;
}

/** A manual correction. Always audited, always with a reason, never an edit. */
export const adminAdjust = async (input: AdjustmentInput) => {
  if (!Number.isInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > walletConfig.maxAdjustmentCoins) {
    throw new WalletError('INVALID_ADJUSTMENT', `Adjustments must be a whole number of coins between 1 and ${walletConfig.maxAdjustmentCoins}.`);
  }
  const reason = input.reason.trim();
  if (reason.length < 5) throw new WalletError('INVALID_ADJUSTMENT', 'A reason of at least 5 characters is required.');
  const reference = `adjust:${input.actorId}:${input.idempotencyKey}`;

  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `ledger:${reference}`);
    const existing = await findEntry(tx, reference);
    if (existing) return { entry: existing, replayed: true };
    await lockWallets(tx, [input.userId]);
    const entry = await postEntry(tx, {
      userId: input.userId,
      type: 'ADMIN_ADJUSTMENT',
      amount: input.amount,
      reference,
      description: input.amount > 0 ? 'Adjustment (credit)' : 'Adjustment (debit)',
      reason,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    return { entry, replayed: false };
  }, LEDGER_TX_OPTIONS);
};

export const setWalletStatus = async (userId: string, status: 'ACTIVE' | 'FROZEN') => {
  return prisma.$transaction(async (tx) => {
    const walletId = await ensureWalletId(tx, userId);
    return tx.wallet.update({ where: { id: walletId }, data: { status } });
  }, LEDGER_TX_OPTIONS);
};

/**
 * Sum of the ledger for one wallet, per bucket. Used by the admin integrity
 * check: the cached balances must equal the ledger at all times.
 */
export const ledgerTotals = async (userId: string) => {
  const grouped = await prisma.walletTransaction.groupBy({
    by: ['bucket'],
    where: { userId },
    _sum: { amount: true },
  });
  const sumOf = (bucket: LedgerBucket) => grouped.find((g) => g.bucket === bucket)?._sum.amount ?? 0;
  return { available: sumOf('AVAILABLE'), pending: sumOf('PENDING') };
};
