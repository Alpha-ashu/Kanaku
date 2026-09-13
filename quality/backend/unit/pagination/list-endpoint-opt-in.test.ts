/**
 * GET /budgets — a representative list endpoint wired to opt-in keyset paging.
 *
 * Legacy requests (no `cursor`) must be byte-for-byte the old behaviour: an
 * unbounded array. Paged requests fetch limit + 1 rows in (createdAt, id) order
 * and answer `{ items, nextCursor }`, with row post-processing still applied.
 */
const findMany = jest.fn();
jest.mock('../../../../backend/src/db/prisma', () => ({
  prisma: { budget: { findMany: (...args: any[]) => findMany(...args) } },
}));

import { getBudgets } from '../../../../backend/src/features/budgets/budget.controller';

const budget = (n: number) => ({
  id: `b-${n}`,
  userId: 'u1',
  createdAt: new Date(Date.UTC(2026, 0, n)),
  alertChannels: '["app"]', // legacy double-encoded value the serializer repairs
});

const call = async (query: Record<string, string>) => {
  const res: any = { json: jest.fn() };
  const next = jest.fn();
  await getBudgets({ query, userId: 'u1' } as any, res, next);
  return { body: res.json.mock.calls[0]?.[0], next, args: findMany.mock.calls[0]?.[0] };
};

afterEach(() => findMany.mockReset());

it('keeps the legacy unbounded array when no cursor is sent', async () => {
  findMany.mockResolvedValue([budget(1), budget(2), budget(3)]);
  const { body, args } = await call({});

  expect(args.take).toBeUndefined();
  expect(args.orderBy).toEqual({ createdAt: 'desc' });
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.data).toHaveLength(3);
});

it('pages with limit + 1 rows, keyset order and a next cursor', async () => {
  findMany.mockResolvedValue([budget(1), budget(2), budget(3)]);
  const { body, args } = await call({ cursor: '', pageSize: '2' });

  expect(args.take).toBe(3);
  expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  expect(body.data.items.map((b: any) => b.id)).toEqual(['b-1', 'b-2']);
  expect(body.data.items[0].alertChannels).toEqual(['app']);
  expect(typeof body.data.nextCursor).toBe('string');

  // The next request continues strictly after b-2.
  findMany.mockReset();
  findMany.mockResolvedValue([budget(3)]);
  const second = await call({ cursor: body.data.nextCursor, pageSize: '2' });
  expect(second.args.where.AND[1].OR[1]).toEqual({ createdAt: budget(2).createdAt, id: { gt: 'b-2' } });
  expect(second.body.data).toEqual({ items: [expect.objectContaining({ id: 'b-3' })], nextCursor: null });
});

it('passes a malformed cursor to the error handler as a 400', async () => {
  const { next, body } = await call({ cursor: '%%%' });
  expect(body).toBeUndefined();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'INVALID_CURSOR' }));
  expect(findMany).not.toHaveBeenCalled();
});
