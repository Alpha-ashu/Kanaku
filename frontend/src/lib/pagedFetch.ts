import { apiClient } from '@/lib/api';

/** Rows per request when sync walks a list endpoint — SYNC_PAGE_SIZE in backend/src/utils/pagination.ts. */
export const SYNC_PAGE_SIZE = 500;

// 400 × 500 = 200k rows: far past any real account, but low enough that a server
// that never stops handing out cursors cannot hang sync.
const MAX_PAGES = 400;

interface KeysetPageBody<T> {
  items: T[];
  nextCursor: string | null;
}

const isKeysetPage = <T,>(body: unknown): body is KeysetPageBody<T> =>
  !!body && typeof body === 'object' && Array.isArray((body as KeysetPageBody<T>).items);

/**
 * Fetch EVERY row of a list endpoint, one keyset page at a time.
 *
 * Sync callers treat the result as the complete server set and delete local rows
 * missing from it, so this never returns a partial list: a failed or malformed
 * page throws, and the caller keeps its local data untouched.
 *
 * Paging is opt-in on the server (`cursor` + `pageSize`, see
 * backend/src/utils/pagination.ts). A server that predates it ignores both and
 * answers with a plain array — which is already the full list, so it is
 * returned as-is. Existing query parameters on `path` (such as the legacy
 * `limit=1000&sync=true` on /transactions) are kept for exactly that case.
 */
export async function fetchAllPages<T = any>(path: string): Promise<T[]> {
  const [pathname, search = ''] = path.split('?');
  const rows: T[] = [];
  let cursor = '';

  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const params = new URLSearchParams(search);
    params.set('sync', 'true');
    params.set('pageSize', String(SYNC_PAGE_SIZE));
    params.set('cursor', cursor);

    // cacheTtlMs: 0 — a cached earlier page must never be stitched to fresh later ones.
    const response = await apiClient.get<unknown>(`${pathname}?${params.toString()}`, {
      showErrorToast: false,
      cacheTtlMs: 0,
    });
    const body = response?.data;

    if (Array.isArray(body)) {
      // Legacy server: the full list in one response. Mid-walk it would mean the
      // server changed under us (a deploy), so the walk is not trustworthy.
      if (pageNumber === 0) return body as T[];
      throw new Error(`GET ${pathname}: server stopped paging mid-walk`);
    }
    if (!isKeysetPage<T>(body)) {
      throw new Error(`GET ${pathname}: unexpected page shape`);
    }

    rows.push(...body.items);
    if (!body.nextCursor) return rows;
    if (body.nextCursor === cursor) {
      throw new Error(`GET ${pathname}: cursor did not advance`);
    }
    cursor = body.nextCursor;
  }

  throw new Error(`GET ${pathname}: more than ${MAX_PAGES} pages`);
}
