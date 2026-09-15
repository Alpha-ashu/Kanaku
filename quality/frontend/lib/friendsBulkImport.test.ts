// @vitest-environment jsdom

import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A phone-contacts import (hundreds of rows) used to write each server-created
// friend to Dexie one by one with the sync hooks live: every write re-rendered
// the whole app (~2 s each in dev) and queued an echo PUT /friends/:id. The mock
// friends table runs the REAL hooks the sync module registers, so these tests
// observe the actual sync queue.
const { tables } = vi.hoisted(() => {
  const createHookedTable = () => {
    const rows = new Map<number, any>();
    const hooks: Record<string, (...args: any[]) => void> = {};
    let nextId = 1;
    const insert = (item: any) => {
      const ctx: { onsuccess?: (key: number) => void } = {};
      hooks.creating?.call(ctx, undefined, item);
      const id = nextId++;
      rows.set(id, { ...item, id });
      ctx.onsuccess?.(id);
      return id;
    };
    return {
      rows,
      hook: (name: string, fn: (...args: any[]) => void) => { hooks[name] = fn; },
      add: vi.fn(async (item: any) => insert(item)),
      bulkAdd: vi.fn(async (items: any[]) => items.map(insert)),
      get: vi.fn(async (id: number) => rows.get(Number(id))),
      update: vi.fn(async (id: number, mods: any) => {
        const existing = rows.get(Number(id));
        if (!existing) return 0;
        const ctx: { onsuccess?: () => void } = {};
        hooks.updating?.call(ctx, mods, id, existing);
        rows.set(Number(id), { ...existing, ...mods });
        ctx.onsuccess?.();
        return 1;
      }),
      filter: (fn: (row: any) => boolean) => ({
        toArray: async () => [...rows.values()].filter(fn),
      }),
    };
  };
  return {
    tables: {
      accounts: createHookedTable(),
      friends: createHookedTable(),
      transactions: createHookedTable(),
      loans: createHookedTable(),
      goals: createHookedTable(),
      groupExpenses: createHookedTable(),
      investments: createHookedTable(),
      toDoLists: createHookedTable(),
      toDoItems: createHookedTable(),
      toDoListShares: createHookedTable(),
    },
  };
});

vi.mock('@/lib/database', () => ({ db: tables }));
vi.mock('@/utils/supabase/client', () => ({
  default: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));

import { initializeBackendSync } from '@/lib/auth-sync-integration';
import { backendService } from '@/lib/backend-api';

const SYNC_QUEUE_STORAGE_KEY = 'KANAKU_sync_queue_v3';
const queuedFriendKeys = (): string[] =>
  JSON.parse(localStorage.getItem(SYNC_QUEUE_STORAGE_KEY) || '[]')
    .map((item: { key: string }) => item.key)
    .filter((key: string) => key.startsWith('friends:'));

const contacts = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ name: `Contact ${i} 😊`, phone: `+91900000${String(i).padStart(4, '0')}` }));

const ok = (config: InternalAxiosRequestConfig, data: unknown) => ({ status: 201, statusText: 'Created', headers: {}, config, data });

// Echoes the batch back as created rows, like POST /friends/bulk.
const bulkServer = vi.fn(async (config: InternalAxiosRequestConfig) => {
  const { friends } = JSON.parse(config.data);
  const created = friends.map((f: any, i: number) => ({ ...f, id: `cloud-${f.name}-${i}` }));
  return ok(config, { success: true, data: { created, skipped: [], createdCount: created.length, skippedCount: 0 } });
});

describe('friends bulk import', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: () => null,
      length: 0,
    });
    Object.values(tables).forEach((table) => table.rows.clear());
    initializeBackendSync();
    bulkServer.mockClear();
  });

  it('sends batches of 200 and stores each batch with one suppressed bulkAdd', async () => {
    backendService.api.defaults.adapter = bulkServer;

    const result = await backendService.createFriendsBulk(contacts(450));

    expect(result.createdCount).toBe(450);
    expect(bulkServer.mock.calls.map(([config]) => JSON.parse(config.data).friends.length)).toEqual([200, 200, 50]);
    expect(tables.friends.bulkAdd).toHaveBeenCalledTimes(3);
    expect(tables.friends.add).not.toHaveBeenCalled();
    expect(tables.friends.rows.size).toBe(450);
    expect(queuedFriendKeys()).toEqual([]); // no echo PUTs queued
  });

  it('does not save a local copy when a batch times out (the server may still commit it)', async () => {
    backendService.api.defaults.adapter = async (config) => {
      throw new AxiosError('timeout of 60000ms exceeded', 'ECONNABORTED', config);
    };

    await expect(backendService.createFriendsBulk(contacts(3))).rejects.toThrow(/taking longer than expected/);
    expect(tables.friends.rows.size).toBe(0);
  });

  it('falls back to one local bulkAdd, queued for upload, when the server is down', async () => {
    backendService.api.defaults.adapter = async (config) => {
      throw new AxiosError('unavailable', 'ERR_BAD_RESPONSE', config, null, {
        status: 503, statusText: '', data: {}, headers: {}, config,
      } as any);
    };

    const result = await backendService.createFriendsBulk(contacts(3));

    expect(result.createdCount).toBe(3);
    expect(tables.friends.bulkAdd).toHaveBeenCalledTimes(1);
    expect(queuedFriendKeys()).toHaveLength(3);
  });

  it('runs one pending-friends sweep at a time and does not queue echoes', async () => {
    tables.friends.rows.set(1, { id: 1, name: 'Local A', phone: '+911' });
    tables.friends.rows.set(2, { id: 2, name: 'Local B', phone: '+912' });
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
      ok(config, { success: true, data: { id: `cloud-${JSON.parse(config.data).name}` } }));
    backendService.api.defaults.adapter = adapter;

    const [first, second] = await Promise.all([
      backendService.retrySyncAllPendingFriends(),
      backendService.retrySyncAllPendingFriends(),
    ]);

    expect(first).toEqual({ synced: 2, skipped: 0 });
    expect(second).toBe(first);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(tables.friends.rows.get(1)).toMatchObject({ cloudId: 'cloud-Local A', syncStatus: 'synced' });
    expect(queuedFriendKeys()).toEqual([]);
  });
});
