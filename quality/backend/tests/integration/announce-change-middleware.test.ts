/**
 * announceChange MIDDLEWARE (§4)
 *
 * Budgets, recurring transactions and categories mirror into Dexie through
 * featureSyncService, which runs once per session — so without a live signal a
 * budget created on one device stayed invisible on an already-open second one.
 *
 * The behaviour that must hold, and that a hand-written emit in each handler
 * kept getting wrong:
 *   - fires only on a SUCCESSFUL mutation (a rejected write must not tell other
 *     devices to re-pull something that never changed),
 *   - never on a read (a device reacting to its own refetch would loop),
 *   - only to the acting user.
 */
import express from 'express';
import request from 'supertest';

const mockEmitted: { userId: string; event: string; payload: any }[] = [];

jest.mock('../../../../backend/src/sockets', () => ({
  getSocketManager: () => ({
    notifyUser: (userId: string, event: string, payload: any) => {
      mockEmitted.push({ userId, event, payload });
    },
  }),
}));

import { announceChange } from '../../../../backend/src/middleware/announceChange';

const buildApp = (userId?: string) => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.userId = userId;
    next();
  });
  app.use(announceChange('budgets_updated'));
  app.get('/', (_req, res) => { res.json({ ok: true }); });
  app.post('/', (_req, res) => { res.status(201).json({ ok: true }); });
  app.put('/bad', (_req, res) => { res.status(400).json({ error: 'nope' }); });
  app.delete('/boom', (_req, res) => { res.status(500).json({ error: 'boom' }); });
  return app;
};

describe('announceChange', () => {
  beforeEach(() => { mockEmitted.length = 0; });

  it('announces a successful mutation to the acting user', async () => {
    await request(buildApp('user-1')).post('/').send({ name: 'Groceries' });
    expect(mockEmitted).toHaveLength(1);
    expect(mockEmitted[0].userId).toBe('user-1');
    expect(mockEmitted[0].event).toBe('budgets_updated');
  });

  it('stays silent on reads', async () => {
    await request(buildApp('user-1')).get('/');
    expect(mockEmitted).toHaveLength(0);
  });

  it('stays silent when the write was rejected', async () => {
    await request(buildApp('user-1')).put('/bad').send({});
    expect(mockEmitted).toHaveLength(0);
  });

  it('stays silent when the write errored', async () => {
    await request(buildApp('user-1')).delete('/boom');
    expect(mockEmitted).toHaveLength(0);
  });

  it('stays silent for an unauthenticated request', async () => {
    // No userId means no room to address — and nothing that could be misrouted.
    await request(buildApp(undefined)).post('/').send({});
    expect(mockEmitted).toHaveLength(0);
  });

  it('carries originSessionId so the acting device can ignore its own echo', async () => {
    // The device that made the change must be able to skip the event. Its local
    // row is created before the POST and stamped with the server id after, so a
    // pull triggered by its own echo lands in the window where the row has no
    // cloudId and gets duplicated instead of matched.
    await request(buildApp('user-1'))
      .post('/')
      .set('X-Session-Id', 'device-abc')
      .send({ name: 'Groceries' });

    expect(mockEmitted).toHaveLength(1);
    expect(mockEmitted[0].payload.originSessionId).toBe('device-abc');
  });

  it('omits originSessionId when the client sent no session header', async () => {
    // An older client that does not send the header still gets the event; it
    // simply cannot filter its own, which is the previous behaviour and no worse.
    await request(buildApp('user-1')).post('/').send({ name: 'Groceries' });

    expect(mockEmitted).toHaveLength(1);
    expect(mockEmitted[0].payload.originSessionId).toBeUndefined();
  });

  it('does not fail the response when the socket layer throws', async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => { req.userId = 'user-1'; next(); });
    app.use(announceChange('budgets_updated'));
    app.post('/', (_req, res) => { res.status(201).json({ ok: true }); });

    const sockets = require('../../../../backend/src/sockets');
    const original = sockets.getSocketManager;
    sockets.getSocketManager = () => { throw new Error('socket manager not initialized'); };
    try {
      const res = await request(app).post('/').send({});
      // The write already committed and the client was already answered.
      expect(res.status).toBe(201);
    } finally {
      sockets.getSocketManager = original;
    }
  });
});
