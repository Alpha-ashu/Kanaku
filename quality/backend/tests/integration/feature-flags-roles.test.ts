/**
 * Feature Panel settings as each role sees them, with the shape production had
 * on 2026-10-01: admins and managers switched off for several pages.
 *
 *   - GET /admin/features gives a non-admin only their own view, but the
 *     personal-finance basics (dashboard, accounts, transactions…) cannot be
 *     revoked per role: they are reported on while any role has them. A
 *     manager whose Dashboard tick was off had lost the Dashboard in the app
 *     although the API kept serving it.
 *   - The API gate follows the same saved settings: a module switched off for
 *     a role is refused to that role, a basic one is not.
 */
import express from 'express';
import request from 'supertest';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { authMiddleware } from '../../../../backend/src/middleware/auth';
import { invalidateFeatureCache, requireFeature } from '../../../../backend/src/middleware/featureGate';
import { API, bearer, cleanupUsers, makeUser } from '../helpers/walletKit';

describe('Feature settings per role', () => {
  const ids = { admin: '', manager: '' };
  let dbReady = false;
  let previous: { settings: unknown } | null = null;

  const saved = {
    admin: { dashboard: false, accounts: false, goals: false, transactions: false },
    manager: { dashboard: false, accounts: true, goals: false, transactions: true },
    advisor: { dashboard: true, accounts: true, goals: true, transactions: true },
    user: { dashboard: true, accounts: true, goals: true, transactions: true },
  };

  beforeAll(async () => {
    try {
      ids.admin = (await makeUser('Flags Admin', 'admin')).id;
      ids.manager = (await makeUser('Flags Manager', 'manager')).id;
      previous = await prisma.platformSettings.findUnique({ where: { id: 'global' } });
      const settings = { ...((previous?.settings as Record<string, unknown>) ?? {}), admin_global_feature_settings: saved };
      await prisma.platformSettings.upsert({ where: { id: 'global' }, create: { id: 'global', settings }, update: { settings } });
      invalidateFeatureCache();
      dbReady = true;
    } catch {
      /* DB unavailable — cases self-skip */
    }
  });

  afterAll(async () => {
    if (previous) await prisma.platformSettings.update({ where: { id: 'global' }, data: { settings: previous.settings as object } }).catch(() => undefined);
    else await prisma.platformSettings.delete({ where: { id: 'global' } }).catch(() => undefined);
    invalidateFeatureCache();
    await cleanupUsers(Object.values(ids));
  });

  it('never reports the personal-finance basics off for a role that was unticked', async () => {
    if (!dbReady) return;
    const res = await request(app).get(`${API}/admin/features`).set(bearer(ids.manager, 'manager'));
    expect(res.status).toBe(200);
    expect(res.body.dashboard.enabled).toBe(true);
    expect(res.body.accounts.enabled).toBe(true);
    expect(res.body.goals.enabled).toBe(false);
    expect(res.body.goals.roleAccess).toBeUndefined();
  });

  it('gives the admin the raw matrix, so the panel shows what was saved', async () => {
    if (!dbReady) return;
    const res = await request(app).get(`${API}/admin/features`).set(bearer(ids.admin, 'admin'));
    expect(res.status).toBe(200);
    expect(res.body.goals.roleAccess).toMatchObject({ admin: false, manager: false, user: true });
    expect(res.body.dashboard.roleAccess.manager).toBe(false);
  });

  it('enforces the same settings in the API', async () => {
    if (!dbReady) return;
    const gated = express();
    gated.get('/goals', authMiddleware, requireFeature('goals'), (_req, res) => { res.json({ ok: true }); });
    gated.get('/accounts', authMiddleware, requireFeature('accounts'), (_req, res) => { res.json({ ok: true }); });
    expect((await request(gated).get('/goals').set(bearer(ids.manager, 'manager'))).status).toBe(403);
    expect((await request(gated).get('/goals').set(bearer(ids.admin, 'admin'))).status).toBe(403);
    expect((await request(gated).get('/accounts').set(bearer(ids.admin, 'admin'))).status).toBe(200);
  });
});
