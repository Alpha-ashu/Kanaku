/**
 * DUPLICATE SUBMIT GUARD — the server-side backstop against one create arriving
 * twice.
 *
 * `idempotency()` only recognises a repeat that reuses its Idempotency-Key. A
 * double tap, an Enter key firing twice, or two client code paths publishing the
 * same record are separate calls with separate keys, so every one of them used to
 * create another row — to-do tasks, transactions, contributions, loans, all of it.
 * This suite pins the guard's contract on a bare Express app with a counting
 * handler, so it needs no database.
 */
import express, { type NextFunction, type Response } from 'express';
import request from 'supertest';
import {
  canonicalizeForDuplicateCheck,
  duplicateSubmitGuard,
  forgetDuplicatesAfterDeletes,
  resetDuplicateSubmitGuard,
} from '../../../../backend/src/middleware/duplicateSubmitGuard';

type Handler = (req: any, res: Response) => void | Promise<void>;

const buildApp = (handler: Handler, windowSeconds?: number) => {
  const app = express();
  app.use(express.json());
  // Stand-in for authMiddleware: the guard scopes everything to req.userId.
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.userId = req.header('x-test-user') ?? 'user-1';
    next();
  });

  const created: unknown[] = [];
  let nextId = 1;
  const run: Handler = async (req, res) => {
    created.push(req.body);
    await handler(req, res);
  };

  app.post('/items', duplicateSubmitGuard({ scope: 'items.create', windowSeconds }), (req, res) => run(req, res));
  app.post('/other', duplicateSubmitGuard({ scope: 'other.create', windowSeconds }), (req, res) => run(req, res));
  app.post('/goals/:id/contribute', duplicateSubmitGuard({ scope: 'goals.contribute', windowSeconds }), (req, res) => run(req, res));
  app.delete('/items/:id', forgetDuplicatesAfterDeletes, (_req, res) => { res.json({ success: true }); });
  app.post('/settings/clear-data', forgetDuplicatesAfterDeletes, (_req, res) => { res.json({ success: true }); });

  return { app, created, nextId: () => nextId++ };
};

const okHandler = (ctx: { nextId: () => number }): Handler => (req, res) => {
  res.status(201).json({ success: true, data: { id: `row-${ctx.nextId()}`, ...req.body } });
};

describe('DUPLICATE SUBMIT GUARD', () => {
  beforeEach(() => resetDuplicateSubmitGuard());

  it('creates once when the same task is submitted twice in a row', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    const first = await request(built.app).post('/items').send({ listId: 7, title: 'Buy milk' });
    const second = await request(built.app).post('/items').send({ listId: 7, title: 'Buy milk' });

    expect(built.created).toHaveLength(1);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    // The repeat is answered with the FIRST row, so the client links to it.
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.headers['duplicate-submit-replay']).toBe('recent');
  });

  it('creates once when two identical requests race each other', async () => {
    const ctx: any = {};
    const built = buildApp(async (req, res) => {
      // Hold the first request open so the second arrives mid-flight, the way a
      // double tap lands during a ~300 ms round trip.
      await new Promise((resolve) => setTimeout(resolve, 150));
      okHandler(ctx)(req, res);
    });
    ctx.nextId = built.nextId;

    const [a, b] = await Promise.all([
      request(built.app).post('/items').send({ listId: 7, title: 'Buy milk' }),
      request(built.app).post('/items').send({ listId: 7, title: 'Buy milk' }),
    ]);

    expect(built.created).toHaveLength(1);
    expect(a.body.data.id).toBe(b.body.data.id);
  });

  it('ignores per-attempt noise: request ids, client clocks and time of day', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    await request(built.app).post('/items').send({
      title: 'Lunch', amount: 250, date: '2026-09-16T10:00:00.120Z',
      clientRequestId: 'a', createdAt: '2026-09-16T10:00:00.121Z', syncStatus: 'pending',
    });
    await request(built.app).post('/items').send({
      title: '  lunch ', amount: 250.001, date: '2026-09-16T10:00:00.480Z',
      clientRequestId: 'b', createdAt: '2026-09-16T10:00:00.481Z', syncStatus: 'pending',
    });

    expect(built.created).toHaveLength(1);
  });

  it('creates both when the content differs', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    await request(built.app).post('/items').send({ listId: 7, title: 'Buy milk' });
    await request(built.app).post('/items').send({ listId: 7, title: 'Buy bread' });

    expect(built.created).toHaveLength(2);
  });

  it('never merges two different users', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    await request(built.app).post('/items').set('x-test-user', 'user-a').send({ title: 'Rent' });
    await request(built.app).post('/items').set('x-test-user', 'user-b').send({ title: 'Rent' });

    expect(built.created).toHaveLength(2);
  });

  it('never merges across routes', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    await request(built.app).post('/items').send({ title: 'Same body' });
    await request(built.app).post('/other').send({ title: 'Same body' });

    expect(built.created).toHaveLength(2);
  });

  it('keeps identical actions on different records apart', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    await request(built.app).post('/goals/goal-1/contribute').send({ amount: 500, accountId: 'acc-1' });
    await request(built.app).post('/goals/goal-2/contribute').send({ amount: 500, accountId: 'acc-1' });

    expect(built.created).toHaveLength(2);
  });

  it('lets a confirmed repeat through', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    await request(built.app).post('/items').send({ title: 'Lunch', amount: 250 });
    await request(built.app).post('/items').send({ title: 'Lunch', amount: 250, intentionalDuplicate: true });

    expect(built.created).toHaveLength(2);
  });

  it('does not replay a failure — the retry gets a real attempt', async () => {
    let calls = 0;
    const built = buildApp((req, res) => {
      calls += 1;
      if (calls === 1) {
        res.status(500).json({ success: false, error: 'boom' });
        return;
      }
      res.status(201).json({ success: true, data: { id: 'row-ok' } });
    });

    const first = await request(built.app).post('/items').send({ title: 'Retry me' });
    const second = await request(built.app).post('/items').send({ title: 'Retry me' });

    expect(first.status).toBe(500);
    expect(second.status).toBe(201);
    expect(built.created).toHaveLength(2);
  });

  it('stops absorbing once the window has passed', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res), 0.05);
    ctx.nextId = built.nextId;

    await request(built.app).post('/items').send({ title: 'Water plants' });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await request(built.app).post('/items').send({ title: 'Water plants' });

    expect(built.created).toHaveLength(2);
  });

  it('does not replay a create after the user deleted something (no phantom record)', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    const first = await request(built.app).post('/items').send({ title: 'Shaik Jijo' });
    await request(built.app).delete(`/items/${first.body.data.id}`);
    const again = await request(built.app).post('/items').send({ title: 'Shaik Jijo' });

    expect(built.created).toHaveLength(2);
    expect(again.body.data.id).not.toBe(first.body.data.id);
  });

  it('does not replay a create after a data reset', async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    await request(built.app).post('/items').send({ title: 'Main Wallet' });
    await request(built.app).post('/settings/clear-data').send({});
    await request(built.app).post('/items').send({ title: 'Main Wallet' });

    expect(built.created).toHaveLength(2);
  });

  it("keeps absorbing repeats for other users when one user deletes", async () => {
    const ctx: any = {};
    const built = buildApp((req, res) => okHandler(ctx)(req, res));
    ctx.nextId = built.nextId;

    await request(built.app).post('/items').set('x-test-user', 'user-2').send({ title: 'Rent' });
    await request(built.app).delete('/items/row-9');
    await request(built.app).post('/items').set('x-test-user', 'user-2').send({ title: 'Rent' });

    expect(built.created).toHaveLength(1);
  });
});

describe('DUPLICATE SUBMIT GUARD — canonical form', () => {
  it('reduces datetimes to the calendar day', () => {
    expect(canonicalizeForDuplicateCheck(new Date('2026-09-16T23:10:00.000Z'))).toBe('2026-09-16');
    expect(canonicalizeForDuplicateCheck('2026-09-16T05:00:00.999Z')).toBe('2026-09-16');
  });

  it('is independent of key order', () => {
    expect(JSON.stringify(canonicalizeForDuplicateCheck({ a: 1, b: 'x' })))
      .toBe(JSON.stringify(canonicalizeForDuplicateCheck({ b: 'x', a: 1 })));
  });

  it('drops empty values so an omitted field and a blank one agree', () => {
    expect(canonicalizeForDuplicateCheck({ title: 'x', description: '' }))
      .toEqual(canonicalizeForDuplicateCheck({ title: 'x' }));
  });
});
