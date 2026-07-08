/**
 * adminPlatformGate — host/origin separation of the Admin/Manager platform.
 *
 * The gate reads ADMIN_UI_HOSTS at module load, so each case loads a fresh
 * copy via jest.isolateModules with the env prepared first.
 */
import type { Request, Response, NextFunction } from 'express';

const loadGate = (adminUiHosts: string | undefined) => {
  let gate: (req: Request, res: Response, next: NextFunction) => unknown;
  jest.isolateModules(() => {
    if (adminUiHosts === undefined) {
      delete process.env.ADMIN_UI_HOSTS;
    } else {
      process.env.ADMIN_UI_HOSTS = adminUiHosts;
    }
    gate = require('../../../../backend/src/middleware/adminPlatformGate').adminPlatformGate;
  });
  return gate!;
};

const makeReq = (headers: Record<string, string | undefined>): Request =>
  ({ headers, originalUrl: '/api/v1/admin/users' } as unknown as Request);

const makeRes = () => {
  const res: any = { statusCode: 0, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (payload: unknown) => { res.body = payload; return res; };
  return res as Response & { statusCode: number; body: any };
};

afterEach(() => {
  delete process.env.ADMIN_UI_HOSTS;
});

describe('adminPlatformGate', () => {
  it('is a no-op when ADMIN_UI_HOSTS is unset (unified platform)', () => {
    const gate = loadGate(undefined);
    const next = jest.fn();
    gate(makeReq({ host: 'kanaku.fly.dev' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('is a no-op when ADMIN_UI_HOSTS is empty/whitespace', () => {
    const gate = loadGate('  ,  ');
    const next = jest.fn();
    gate(makeReq({ host: 'kanaku.fly.dev' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows requests whose browser Origin is an admin host', () => {
    const gate = loadGate('admin.kanaku.app');
    const next = jest.fn();
    gate(makeReq({ origin: 'https://admin.kanaku.app', host: 'kanaku.fly.dev' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows requests proxied for an admin host via X-Forwarded-Host', () => {
    const gate = loadGate('admin.kanaku.app');
    const next = jest.fn();
    gate(
      makeReq({ 'x-forwarded-host': 'admin.kanaku.app, vercel-edge.internal', host: 'kanaku.fly.dev' }),
      makeRes(),
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it('matches hostnames case-insensitively and across multiple configured hosts', () => {
    const gate = loadGate('admin.kanaku.app, ADMIN-STAGING.kanaku.app');
    const next = jest.fn();
    gate(makeReq({ origin: 'https://Admin-Staging.kanaku.app' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects user-origin requests with the standard 404 body (surface not advertised)', () => {
    const gate = loadGate('admin.kanaku.app');
    const next = jest.fn();
    const res = makeRes();
    gate(makeReq({ origin: 'https://app.kanaku.app', host: 'kanaku.fly.dev' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });

  it('rejects requests with no origin/host signal at all', () => {
    const gate = loadGate('admin.kanaku.app');
    const next = jest.fn();
    const res = makeRes();
    gate(makeReq({}), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('does not treat an admin-host SUBSTRING as a match (no suffix tricks)', () => {
    const gate = loadGate('admin.kanaku.app');
    const next = jest.fn();
    const res = makeRes();
    gate(makeReq({ origin: 'https://admin.kanaku.app.evil.com' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });
});
