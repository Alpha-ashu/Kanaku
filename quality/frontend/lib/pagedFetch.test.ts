/**
 * fetchAllPages — the sync engine's list fetch.
 *
 * Its caller deletes local rows missing from the result, so the contract is
 * "every row, or throw": a failed page must never surface as a short list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api', () => ({ apiClient: { get: (...args: any[]) => get(...args) } }));

import { SYNC_PAGE_SIZE, fetchAllPages } from '@/lib/pagedFetch';

const paramsOf = (url: string) => new URLSearchParams(url.split('?')[1]);

beforeEach(() => get.mockReset());

describe('fetchAllPages', () => {
  it('walks cursors until nextCursor is null and returns every row', async () => {
    get
      .mockResolvedValueOnce({ success: true, data: { items: [{ id: 'a' }, { id: 'b' }], nextCursor: 'c1' } })
      .mockResolvedValueOnce({ success: true, data: { items: [{ id: 'c' }], nextCursor: 'c2' } })
      .mockResolvedValueOnce({ success: true, data: { items: [], nextCursor: null } });

    await expect(fetchAllPages('/accounts')).resolves.toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    const urls = get.mock.calls.map((c) => c[0] as string);
    expect(urls.map((u) => paramsOf(u).get('cursor'))).toEqual(['', 'c1', 'c2']);
    expect(paramsOf(urls[0]).get('pageSize')).toBe(String(SYNC_PAGE_SIZE));
    expect(paramsOf(urls[0]).get('sync')).toBe('true');
    // Never served from the GET cache.
    expect(get.mock.calls[0][1]).toMatchObject({ cacheTtlMs: 0 });
  });

  it('keeps existing query params (legacy limit for servers without paging)', async () => {
    get.mockResolvedValueOnce({ success: true, data: { items: [], nextCursor: null } });
    await fetchAllPages('/transactions?limit=1000&sync=true');
    const params = paramsOf(get.mock.calls[0][0]);
    expect(params.get('limit')).toBe('1000');
    expect(params.getAll('sync')).toEqual(['true']); // not duplicated
  });

  it('accepts a plain array from a server that predates paging', async () => {
    get.mockResolvedValueOnce({ success: true, data: [{ id: 'x' }, { id: 'y' }] });
    await expect(fetchAllPages('/goals')).resolves.toEqual([{ id: 'x' }, { id: 'y' }]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('throws instead of returning a partial list when a later page fails', async () => {
    get
      .mockResolvedValueOnce({ success: true, data: { items: [{ id: 'a' }], nextCursor: 'c1' } })
      .mockRejectedValueOnce(new Error('network down'));
    await expect(fetchAllPages('/loans')).rejects.toThrow('network down');
  });

  it('throws if the server stops paging mid-walk or repeats a cursor', async () => {
    get
      .mockResolvedValueOnce({ success: true, data: { items: [{ id: 'a' }], nextCursor: 'c1' } })
      .mockResolvedValueOnce({ success: true, data: [{ id: 'a' }] });
    await expect(fetchAllPages('/friends')).rejects.toThrow(/mid-walk/);

    get.mockReset();
    get
      .mockResolvedValueOnce({ success: true, data: { items: [{ id: 'a' }], nextCursor: 'c1' } })
      .mockResolvedValueOnce({ success: true, data: { items: [{ id: 'b' }], nextCursor: 'c1' } });
    await expect(fetchAllPages('/friends')).rejects.toThrow(/did not advance/);
  });
});
