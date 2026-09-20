/**
 * Idempotent-create helper.
 *
 * Every user-record table now carries `clientRequestId` plus a per-owner unique
 * index, so a replayed create fails closed at the database. That is the durable
 * guarantee — but on its own it surfaces a retry as a 409, which is the wrong
 * answer: the caller's first attempt succeeded, so the right response is the row
 * it created.
 *
 * This wraps the two halves of that:
 *
 *   1. Look for an existing row with the same key and return it (the common
 *      case — a double-tap, or a client retrying a request whose response it
 *      never saw).
 *   2. Run the create, and if the unique index rejects it anyway — two requests
 *      racing past step 1 at the same instant — look the winner up and return
 *      that instead of the error.
 *
 * Step 2 is the part a plain "check then insert" cannot do, and is why the
 * database constraint has to exist rather than relying on the in-memory guard.
 */
import { logger } from '../config/logger';

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

export interface IdempotentCreateArgs<T> {
  /** The caller-supplied key. When absent, `create` runs unguarded. */
  clientRequestId?: unknown;
  /** Finds an existing row for this key. Only called when a key is present. */
  findExisting: () => Promise<T | null>;
  /** Performs the create. */
  create: () => Promise<T>;
  /** Label for logs, e.g. 'friends.create'. */
  scope: string;
}

export interface IdempotentCreateResult<T> {
  row: T;
  /** True when an existing row was returned instead of a new one. */
  replayed: boolean;
}

export const idempotentCreate = async <T>({
  clientRequestId,
  findExisting,
  create,
  scope,
}: IdempotentCreateArgs<T>): Promise<IdempotentCreateResult<T>> => {
  const key = typeof clientRequestId === 'string' && clientRequestId.trim() ? clientRequestId : null;

  if (key) {
    const existing = await findExisting();
    if (existing) {
      logger.info('[idempotent-create] returning existing row', { scope });
      return { row: existing, replayed: true };
    }
  }

  try {
    return { row: await create(), replayed: false };
  } catch (err: any) {
    if (err?.code !== UNIQUE_VIOLATION || !key) throw err;

    // Lost the race to a concurrent request carrying the same key. The winner
    // is committed, so answer with it.
    const winner = await findExisting();
    if (winner) {
      logger.info('[idempotent-create] lost create race, returning winner', { scope });
      return { row: winner, replayed: true };
    }

    // P2002 on some OTHER unique index (a genuine business conflict, e.g. a
    // duplicate category name). Not ours to swallow.
    throw err;
  }
};

/** Normalises a request-supplied key to what the column should store. */
export const asClientRequestId = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
