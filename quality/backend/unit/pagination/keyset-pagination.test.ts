/**
 * utils/pagination — opt-in keyset paging for the list endpoints sync pulls.
 *
 * Guards the two properties the client relies on:
 *   1. Without `cursor` nothing changes (installed builds treat a list response
 *      as the complete set and delete local rows missing from it).
 *   2. A walk page-by-page returns every row exactly once, including rows that
 *      share a createdAt millisecond — the case that breaks timestamp-only cursors.
 *
 * Pure unit test: the Prisma `where` the helper builds is evaluated in memory.
 */
import {
  LIST_PAGE_DEFAULT,
  LIST_PAGE_MAX,
  SYNC_PAGE_SIZE,
  createdAtPosition,
  idKeysetAfter,
  idPosition,
  readKeysetPage,
  sliceKeysetPage,
  withCreatedAtKeyset,
} from '../../../../backend/src/utils/pagination';

type Row = { id: string; createdAt: Date };

// Evaluates exactly the shape withCreatedAtKeyset produces.
const matches = (row: Row, where: any): boolean => {
  if (where.AND) return where.AND.every((w: any) => matches(row, w));
  if (where.OR) return where.OR.some((w: any) => matches(row, w));
  if (where.createdAt instanceof Date && where.id?.gt !== undefined) {
    return row.createdAt.getTime() === where.createdAt.getTime() && row.id > where.id.gt;
  }
  if (where.createdAt?.gt instanceof Date) return row.createdAt.getTime() > where.createdAt.gt.getTime();
  return true; // the base filter ({ userId }) — every fixture row belongs to the user
};

const fakeFindMany = (rows: Row[], where: any, take: number) =>
  rows
    .filter((r) => matches(r, where))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, take);

describe('readKeysetPage', () => {
  it('is null without cursor, so legacy callers keep the full list', () => {
    expect(readKeysetPage({})).toBeNull();
    expect(readKeysetPage({ limit: '1000', sync: 'true' })).toBeNull();
  });

  it('uses list defaults and caps for UI requests', () => {
    expect(readKeysetPage({ cursor: '' })).toEqual({ limit: LIST_PAGE_DEFAULT, after: null });
    expect(readKeysetPage({ cursor: '', pageSize: '10000' })?.limit).toBe(LIST_PAGE_MAX);
    expect(readKeysetPage({ cursor: '', pageSize: '25' })?.limit).toBe(25);
  });

  it('uses the sync page size for sync pulls, and ignores legacy `limit`', () => {
    expect(readKeysetPage({ cursor: '', sync: 'true', limit: '1000' })?.limit).toBe(SYNC_PAGE_SIZE);
    expect(readKeysetPage({ cursor: '', sync: 'true', pageSize: '9999' })?.limit).toBe(SYNC_PAGE_SIZE);
  });

  it('rejects malformed cursors with 400 INVALID_CURSOR', () => {
    expect(() => readKeysetPage({ cursor: 'not-base64-json' })).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    expect(() => readKeysetPage({ cursor: ['a', 'b'] })).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    const wrongKind = Buffer.from(JSON.stringify({ i: 5 })).toString('base64url');
    expect(() => withCreatedAtKeyset({}, readKeysetPage({ cursor: wrongKind }))).toThrow(
      expect.objectContaining({ code: 'INVALID_CURSOR' }),
    );
  });
});

describe('(createdAt, id) keyset walk', () => {
  // 23 rows over 4 distinct milliseconds — ties everywhere, ids deliberately unordered.
  const base = Date.UTC(2026, 8, 13, 10, 0, 0, 0);
  const rows: Row[] = Array.from({ length: 23 }, (_, n) => ({
    id: `id-${String((n * 7919) % 1000).padStart(3, '0')}`,
    createdAt: new Date(base + (n % 4)),
  }));

  it.each([1, 2, 5, 22, 23, 50])('returns every row exactly once with page size %i', (pageSize) => {
    const seen: string[] = [];
    let cursor = '';
    for (let guard = 0; guard < 100; guard++) {
      const page = readKeysetPage({ cursor, pageSize: String(pageSize) })!;
      const fetched = fakeFindMany(rows, withCreatedAtKeyset({ userId: 'u1' }, page), page.limit + 1);
      const { items, nextCursor } = sliceKeysetPage(fetched, page, createdAtPosition);
      seen.push(...items.map((r) => r.id));
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    expect(seen).toHaveLength(rows.length);
    expect(new Set(seen)).toEqual(new Set(rows.map((r) => r.id)));
  });

  it('leaves the base where untouched on the first page', () => {
    const where = { userId: 'u1', deletedAt: null };
    expect(withCreatedAtKeyset(where, readKeysetPage({ cursor: '' }))).toBe(where);
    expect(withCreatedAtKeyset(where, null)).toBe(where);
  });

  it('reports no next cursor when the page is not full', () => {
    const page = readKeysetPage({ cursor: '', pageSize: '5' })!;
    expect(sliceKeysetPage(rows.slice(0, 5), page, createdAtPosition).nextCursor).toBeNull();
    expect(sliceKeysetPage(rows.slice(0, 6), page, createdAtPosition).nextCursor).not.toBeNull();
  });
});

describe('id keyset (todo tables)', () => {
  it('round-trips the last id and rejects non-integer positions', () => {
    const page = readKeysetPage({ cursor: '', pageSize: '2' })!;
    const { items, nextCursor } = sliceKeysetPage([{ id: 4 }, { id: 9 }, { id: 12 }], page, idPosition);
    expect(items.map((r) => r.id)).toEqual([4, 9]);
    expect(idKeysetAfter(readKeysetPage({ cursor: nextCursor! }))).toBe(9);
    expect(idKeysetAfter(readKeysetPage({ cursor: '' }))).toBeNull();

    const bad = Buffer.from(JSON.stringify({ i: 'DROP TABLE' })).toString('base64url');
    expect(() => idKeysetAfter(readKeysetPage({ cursor: bad }))).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
  });
});
