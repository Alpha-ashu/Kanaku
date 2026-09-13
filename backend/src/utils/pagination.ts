import { AppError } from './AppError';

/**
 * Opt-in keyset pagination for list endpoints.
 *
 * The sync engine pulls whole lists (GET /accounts, /transactions, /todos/items,
 * …) and treats each response as the COMPLETE server set: local rows missing
 * from it are deleted on the device. A page size therefore cannot simply be
 * imposed — an installed build that knows nothing about pages would keep page
 * one and delete everything after it. So an endpoint pages only when the request
 * carries `cursor` (empty for the first page); without it, it keeps its legacy
 * behaviour.
 *
 * Paged responses put `{ items, nextCursor }` in `data`, because the web client
 * unwraps `data` and drops headers. Page size is `pageSize`, not `limit`: several
 * endpoints already read `limit` for offset paging, and a new client talking to
 * a not-yet-deployed server must not have its request reinterpreted as a
 * truncated legacy page.
 */

/** Default and maximum page for a UI list request. */
export const LIST_PAGE_DEFAULT = 50;
export const LIST_PAGE_MAX = 200;
/** Page size (default and maximum) for sync pulls, flagged with `sync=true`. */
export const SYNC_PAGE_SIZE = 500;

export interface KeysetPage {
  /** Rows to return. Queries fetch `limit + 1` to learn whether another page exists. */
  limit: number;
  /** Position of the last row the client already has; null on the first page. */
  after: Record<string, unknown> | null;
}

const invalidCursor = () => AppError.badRequest('Invalid pagination cursor', 'INVALID_CURSOR');

const encodeCursor = (position: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');

const decodeCursor = (raw: unknown): Record<string, unknown> | null => {
  if (typeof raw !== 'string') throw invalidCursor();
  if (raw === '') return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  throw invalidCursor();
};

/** Null unless the request opted into paging with `cursor`. Throws 400 on a malformed cursor. */
export function readKeysetPage(query: Record<string, unknown>): KeysetPage | null {
  if (query.cursor === undefined) return null;
  const isSync = query.sync === 'true';
  const requested = Number.parseInt(String(query.pageSize ?? ''), 10);
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, isSync ? SYNC_PAGE_SIZE : LIST_PAGE_MAX)
    : (isSync ? SYNC_PAGE_SIZE : LIST_PAGE_DEFAULT);
  return { limit, after: decodeCursor(query.cursor) };
}

/**
 * Trim the `limit + 1` rows a query fetched to one page and derive the cursor
 * for the next. `positionOf` must return the same fields the matching
 * `*KeysetWhere` helper reads back.
 */
export function sliceKeysetPage<T>(
  rows: T[],
  page: KeysetPage,
  positionOf: (row: T) => Record<string, unknown>,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > page.limit;
  const items = hasMore ? rows.slice(0, page.limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(positionOf(items[items.length - 1])) : null };
}

// ── (createdAt, id) keyset — Prisma models ───────────────────────────────────
// Their createdAt is timestamp(3), so a millisecond ISO string round-trips
// exactly, and id breaks ties. Ascending createdAt also means a row created
// while a client is mid-walk sorts after its cursor and is still delivered.

export const createdAtKeysetOrder = () => [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

export const createdAtPosition = (row: { createdAt: Date | string; id: string }) => ({
  c: new Date(row.createdAt).toISOString(),
  i: row.id,
});

/** `where` restricted to rows after the cursor (unchanged on the first page). */
export function withCreatedAtKeyset<W extends object>(where: W, page: KeysetPage | null): W {
  if (!page?.after) return where;
  const createdAt = new Date(String(page.after.c));
  const id = page.after.i;
  if (Number.isNaN(createdAt.getTime()) || typeof id !== 'string') throw invalidCursor();
  return {
    AND: [where, { OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }] }],
  } as unknown as W;
}

// ── id keyset — raw-SQL todo tables ──────────────────────────────────────────
// Sequential bigint ids; their timestamps are microsecond timestamptz, which a
// JS Date would truncate, so these page on id alone.

export const idPosition = (row: { id: number | string }) => ({ i: Number(row.id) });

/** The id to continue after, or null on the first page. */
export function idKeysetAfter(page: KeysetPage | null): number | null {
  if (!page?.after) return null;
  const id = page.after.i;
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) throw invalidCursor();
  return id;
}
