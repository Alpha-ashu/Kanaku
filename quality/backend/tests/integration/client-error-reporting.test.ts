/**
 * CLIENT ERROR REPORTING (§2)
 *
 * The ErrorBoundary's "Something went wrong" screen reported the cause nowhere:
 * `registerErrorReporter` was only called inside index.tsx's Sentry block, and
 * VITE_SENTRY_DSN is set in no deployment config. These tests cover the sink
 * that replaces that silence, plus the CORS preflight for the session header —
 * an omission there would break every native request, as it previously did for
 * x-security-token.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';

const validReport = {
  reference: 'KE-AB12-CD34',
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading 'map')",
  stack: 'TypeError: ...\n    at Dashboard (Dashboard.tsx:42:7)',
  componentStack: '\n    at Dashboard\n    at ErrorBoundary',
  route: '/dashboard',
  platform: 'web',
  status: 500,
  endpoint: '/transactions',
  method: 'GET',
  online: true,
  occurredAt: new Date().toISOString(),
};

describe('POST /client-errors', () => {
  it('accepts a report from an UNAUTHENTICATED client', async () => {
    // The crash we most need is the one on the login screen, before a token
    // exists. If this ever requires auth, those reports are lost.
    const res = await request(app).post(`${API}/client-errors`).send(validReport);
    expect(res.status).toBe(204);
  });

  it('accepts a report from an authenticated client', async () => {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
    const token = jwt.sign(
      { userId: 'client-error-user', id: 'client-error-user', email: 'ce@test.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );
    const res = await request(app)
      .post(`${API}/client-errors`)
      .set({ Authorization: `Bearer ${token}`, 'X-Session-Id': 'sess-123' })
      .send(validReport);
    expect(res.status).toBe(204);
  });

  it('returns no body — it is a write-only sink', async () => {
    const res = await request(app).post(`${API}/client-errors`).send(validReport);
    expect(res.status).toBe(204);
    expect(res.text).toBeFalsy();
  });

  it('rejects a report missing the reference', async () => {
    const { reference, ...withoutReference } = validReport;
    void reference;
    const res = await request(app).post(`${API}/client-errors`).send(withoutReference);
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields rather than logging whatever it is handed', async () => {
    const res = await request(app)
      .post(`${API}/client-errors`)
      .send({ ...validReport, password: 'hunter2', arbitrary: 'x'.repeat(100) });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized stack instead of writing it to the log pipeline', async () => {
    const res = await request(app)
      .post(`${API}/client-errors`)
      .send({ ...validReport, stack: 'x'.repeat(9000) });
    expect(res.status).toBe(400);
  });
});

describe('CORS preflight', () => {
  // Native clients call this API cross-origin from the Capacitor WebView, so a
  // header the client sends must be in allowedHeaders or the request never
  // happens at all.
  it('allows the headers the client actually sends', async () => {
    const res = await request(app)
      .options(`${API}/transactions`)
      .set({
        Origin: 'https://localhost',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,x-request-id,x-session-id,x-pin-unlock',
      });

    expect([200, 204]).toContain(res.status);
    const allowed = (res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowed).toContain('x-session-id');
    expect(allowed).toContain('x-request-id');
    expect(allowed).toContain('x-pin-unlock');
  });
});
