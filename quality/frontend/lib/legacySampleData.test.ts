import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeLegacySampleData } from '@/lib/legacySampleData';
import type { OfflineSyncDB } from '@/lib/database';

type Row = Record<string, unknown> & { id?: unknown };

/** Just enough of a Dexie table for the cleanup: filter/delete, bulkGet/bulkDelete, where().equals().delete(). */
const table = (rows: Row[]) => ({
  rows,
  bulkGet: async (ids: unknown[]) => ids.map((id) => rows.find((r) => r.id === id)),
  bulkDelete: async (ids: unknown[]) => {
    for (const id of ids) rows.splice(rows.findIndex((r) => r.id === id), 1);
  },
  delete: async (id: unknown) => {
    rows.splice(rows.findIndex((r) => r.id === id), 1);
  },
  filter: (fn: (r: Row) => boolean) => ({
    toArray: async () => rows.filter(fn),
    delete: async () => {
      for (const r of rows.filter(fn)) rows.splice(rows.indexOf(r), 1);
    },
  }),
  where: (key: string) => ({
    equals: (value: unknown) => ({
      delete: async () => {
        for (const r of rows.filter((x) => x[key] === value)) rows.splice(rows.indexOf(r), 1);
      },
    }),
  }),
});

const makeStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
};

const seededDb = () => ({
  budgets: table([
    { id: 'b-1', category: 'Food', amount: 15000 },
    { id: 'b-2', category: 'Transportation', amount: 8000, cloudId: 'already-pushed' },
    { id: 'real-uuid', category: 'Food', amount: 9000 },
  ]),
  recurringTransactions: table([
    { id: 1, name: 'Netflix Premium 4K Plan' },
    { id: 2, name: 'HDFC Top 100 MF SIP', cloudId: 'pushed' },
    { id: 3, name: 'Rent' },
  ]),
  notifications: table([{ id: 1, title: 'SBI Home Loan EMI Due' }, { id: 2, title: 'Budget warning' }]),
  documents: table([{ id: 1, fileName: 'Swiggy_Dinner_Order.png' }, { id: 2, fileName: 'my-receipt.jpg' }]),
  toDoLists: table([
    { id: 10, name: 'Financial Action Items 2026', ownerId: 'user-default' },
    { id: 11, name: 'Financial Action Items 2026', ownerId: 'real-user' },
  ]),
  toDoItems: table([
    { id: 1, listId: 10, title: 'File ITR Returns for FY 2025-26' },
    { id: 2, listId: 11, title: 'My own task' },
  ]),
});

describe('purgeLegacySampleData', () => {
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    storage = makeStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('removes only the unpushed seeded rows and clears the flag', async () => {
    storage.setItem('has_seeded_sample_data', 'true');
    const db = seededDb();

    await purgeLegacySampleData(db as unknown as OfflineSyncDB);

    expect(db.budgets.rows.map((r) => r.id)).toEqual(['b-2', 'real-uuid']);
    expect(db.recurringTransactions.rows.map((r) => r.id)).toEqual([2, 3]);
    expect(db.notifications.rows.map((r) => r.id)).toEqual([2]);
    expect(db.documents.rows.map((r) => r.id)).toEqual([2]);
    expect(db.toDoLists.rows.map((r) => r.id)).toEqual([11]);
    expect(db.toDoItems.rows.map((r) => r.id)).toEqual([2]);
    expect(storage.getItem('has_seeded_sample_data')).toBeNull();
  });

  it('does nothing on a browser that never ran the seeding', async () => {
    const db = seededDb();

    await purgeLegacySampleData(db as unknown as OfflineSyncDB);

    expect(db.budgets.rows).toHaveLength(3);
    expect(db.toDoItems.rows).toHaveLength(2);
  });
});
