/**
 * `GET /metrics` must not be world-readable in production.
 *
 * It was. `METRICS_TOKEN` is `sync: false` in render.yaml (dashboard-entry
 * only) and had never been set, and the handler served openly whenever the
 * token was absent — so anyone could read every route name, request count,
 * error rate, event-loop lag and memory figure from the production API. The
 * guard existed but was opt-in, and the instruction to turn it on was a source
 * comment rather than a control.
 *
 * It now fails CLOSED in production and stays open elsewhere, so local
 * development and a local Prometheus need no secret.
 *
 * These assert the gate, not the metric contents — `renderMetrics()` is
 * prom-client's business.
 */
import request from 'supertest';
import app from '../../../../backend/src/app';

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_TOKEN = process.env.METRICS_TOKEN;

afterEach(() => {
  // NODE_ENV is read per-request by the handler, so restoring it is enough.
  process.env.NODE_ENV = ORIGINAL_ENV;
  if (ORIGINAL_TOKEN === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = ORIGINAL_TOKEN;
});

describe('GET /metrics — production without a token', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.METRICS_TOKEN;
  });

  it('refuses to serve rather than exposing metrics publicly', async () => {
    const res = await request(app).get('/metrics');

    // The regression: this used to be 200 with the full metric dump.
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('METRICS_NOT_CONFIGURED');
  });

  it('leaks no metric data in the refusal', async () => {
    const res = await request(app).get('/metrics');
    const body = JSON.stringify(res.body);

    expect(body).not.toMatch(/process_cpu|nodejs_|http_request/);
  });
});

describe('GET /metrics — production with a token', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_TOKEN = 'test-metrics-token-at-least-16-chars';
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', 'Bearer not-the-right-token');
    expect(res.status).toBe(401);
  });

  it('rejects a correct token sent without the Bearer scheme', async () => {
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', 'test-metrics-token-at-least-16-chars');
    expect(res.status).toBe(401);
  });

  it('serves Prometheus text to a correctly authenticated scrape', async () => {
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', 'Bearer test-metrics-token-at-least-16-chars');

    // This is the case that must keep working — securing the endpoint must not
    // break Prometheus once the token is configured on both sides.
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^# HELP/m);
  });
});

describe('GET /metrics — outside production', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.METRICS_TOKEN;
  });

  it('stays open so local development needs no secret', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^# HELP/m);
  });
});
