import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { errorHandler } from './middleware/error';
import { forgetDuplicatesAfterDeletes } from './middleware/duplicateSubmitGuard';
import { apiRoutes } from './routes/index';
import { docsRoutes } from './routes/docs';
import { authenticatedRateLimit } from './middleware/rateLimit';
import { getCircuitBreakerStatus } from './utils/circuitBreaker';
import { sanitize } from './utils/sanitize';
import { logger } from './config/logger';
import { prisma } from './db/prisma';
import { requestTimeout } from './middleware/timeout';
import { authMiddleware, type AuthRequest } from './middleware/auth';
import { requestContext } from './middleware/requestContext';
import { performanceTracker } from './middleware/performanceTracker';
import { requireRole } from './middleware/rbac';
import { adminPlatformGate } from './middleware/adminPlatformGate';
import { metricsMiddleware, getMetricsSnapshot } from './middleware/metrics';
import { getCacheMetricsSnapshot } from './cache/redis';
import { isCryptoConfigured } from './security/crypto';
import { getStorageHealth } from './utils/storage';
import { renderMetrics, metricsContentType } from './config/metrics';
import { renderDrainHandler } from './middleware/renderDrain';
import { isAllowedOrigin } from './config/cors';

const app = express();

// Trust the reverse proxy to identify client IPs for rate limiting and logging.
//
// The default of 1 hop is correct for clients that reach Render directly — the
// native Android/iOS apps. It is NOT correct for the browser build, which Vercel
// proxies to this backend (vercel.json rewrites /api/* to kanaku-api.onrender.com):
// that adds a second hop, so `req.ip` resolves to the Vercel edge address and
// every web visitor lands in one bucket. Confirmed against express's resolver —
// XFF "<client>, <vercel-edge>" at trust=1 yields the vercel edge.
//
// Simply raising this to 2 would be a security regression, not a fix: native
// clients still arrive over one hop, so the second trusted position would be
// filled by a caller-supplied X-Forwarded-For — anyone could then choose which
// IP bucket to spend, including someone else's. The only safe way to trust the
// extra hop is to name the proxy, which is why TRUST_PROXY accepts an address
// or CIDR list and not just a count:
//
//   TRUST_PROXY=1                      (default; native-safe, web collapses)
//   TRUST_PROXY=76.76.21.0/24,10.0.0.0/8   (trust these proxies by address)
//   TRUST_PROXY=loopback,linklocal,uniquelocal
//
// Until that list is configured, nothing below may assume `req.ip` distinguishes
// one web user from another — see the credential-keyed limiters in
// features/auth/auth.routes.ts.
const trustProxySetting = (() => {
  const raw = (process.env.TRUST_PROXY ?? '').trim();
  if (!raw) return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true' || raw === 'false') return raw === 'true';
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
})();
app.set('trust proxy', trustProxySetting);


//  Request ID + Correlation ID stamping (Phase 9.5 Observability)
// requestId   — per-request UUID (unchanged; may be supplied by caller via X-Request-Id)
// correlationId — durable end-to-end trace ID for the full user action:
//   honored from X-Correlation-Id so a frontend-minted ID survives the entire
//   HTTP → API → Ledger → Worker → Notification chain; falls back to requestId.
// sessionId   — stable per-browser-session identifier from X-Session-Id header.
// All values are format-validated to prevent log-forging / header injection.
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
app.use((req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  (req as any).id = candidate && REQUEST_ID_RE.test(candidate) ? candidate : randomUUID();
  res.setHeader('X-Request-Id', (req as any).id);

  // Correlation ID — use caller-supplied value if valid, else fall back to requestId
  const incomingCorrelation = req.headers['x-correlation-id'];
  const correlationCandidate = Array.isArray(incomingCorrelation) ? incomingCorrelation[0] : incomingCorrelation;
  (req as any).correlationId = correlationCandidate && REQUEST_ID_RE.test(correlationCandidate)
    ? correlationCandidate
    : (req as any).id;
  res.setHeader('X-Correlation-Id', (req as any).correlationId);

  // Session ID — optional; never minted by the server, only forwarded if supplied
  const incomingSession = req.headers['x-session-id'];
  const sessionCandidate = Array.isArray(incomingSession) ? incomingSession[0] : incomingSession;
  if (sessionCandidate && REQUEST_ID_RE.test(sessionCandidate)) {
    (req as any).sessionId = sessionCandidate;
  }

  next();
});


// Per-request context (AsyncLocalStorage) — lets the Prisma audit interceptor
// attribute every financial mutation to the acting user/IP/User-Agent.
app.use(requestContext);
app.use(performanceTracker);

// Hard request timeout — prevents a stuck DB query / hung upstream call
// from holding a worker indefinitely. Configurable via REQUEST_TIMEOUT_MS.
app.use(requestTimeout(Number(process.env.REQUEST_TIMEOUT_MS) || undefined));

// Lightweight in-memory metrics — counters + p50/p95/p99 latency per
// route, scrapable via /api/v1/health/metrics (admin only).
app.use(metricsMiddleware);

app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = (req as any).id;
  const correlationId = (req as any).correlationId ?? requestId;
  const sessionId = (req as any).sessionId;
  const ip = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    const meta = {
      requestId,
      correlationId,
      ...(sessionId ? { sessionId } : {}),
      method: req.method,
      route: req.route?.path ?? req.path,
      path: req.path,
      statusCode,
      durationMs: duration,
      ip,
      userAgent,
      userId: (req as any).userId || (req as any).user?.id,
    };

    const message = `[HTTP] ${req.method} ${req.path} ${statusCode} - ${duration}ms`;

    if (statusCode >= 500) {
      logger.error(message, meta);
    } else if (statusCode >= 400) {
      logger.warn(message, meta);
    } else {
      logger.info(message, meta);
    }
  });

  next();
});


// Disable X-Powered-By header to prevent server fingerprinting
app.disable('x-powered-by');

// Per-request CSP nonce — exposed on `res.locals.cspNonce` so server-side
// rendered templates (Swagger UI, error pages) can attach it to inline
// `<script>` / `<style>` tags. In production we drop `'unsafe-inline'`
// and rely on the nonce; in dev we keep `'unsafe-inline'` to make
// Vite HMR + Tailwind JIT painless.
app.use((req, res, next) => {
  res.locals.cspNonce = randomUUID().replace(/-/g, '');
  next();
});

const isProd = process.env.NODE_ENV === 'production';

// Add helmet for secure HTTP headers
app.use((req, res, next) => {
  const nonce = res.locals.cspNonce as string;
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: isProd
          ? ["'self'", `'nonce-${nonce}'`, 'https://fonts.googleapis.com']
          : ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        scriptSrc: isProd
          ? ["'self'", `'nonce-${nonce}'`]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
        connectSrc: ["'self'", 'https://*.supabase.co', 'wss:', 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    // HSTS — 2-year max-age, includeSubDomains, preload-eligible.
    hsts: isProd ? { maxAge: 63_072_000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })(req, res, next);
});

// Ensure the same-origin resource policy is set explicitly.
// NOTE: X-XSS-Protection is intentionally NOT set. The legacy auditor/filter it
// controls is deprecated and removed from modern browsers; `1; mode=block` can
// itself introduce vulnerabilities, so the current guidance is to omit it (or
// send `0`). CSP above is the real XSS defence. helmet already emits
// `X-XSS-Protection: 0` by default.
// Cross-Origin-Resource-Policy: set to cross-origin so the response can be
// read by our Capacitor Android/iOS webview (origin: capacitor://localhost /
// https://localhost), which is cross-origin relative to the API server.
// The JWT bearer token in every request is the real security gate; CORP is
// redundant for a JSON API that is not loaded as a subresource in untrusted pages.
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    // Do not throw an error to avoid 500s; simply omit CORS headers.
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-refresh-token',
    'x-client-platform', // 'native' marks Capacitor (Android/iOS) clients that
                         // can't use the cross-site HttpOnly refresh cookie.
    'x-pw-encoding',   // password encoding negotiation (sha256 vs plain)
    'x-request-id',
    'x-correlation-id',
    // Per-browser-session id. requestContext.ts has always READ this header;
    // the client only started sending it when client-error reporting was wired
    // up, and on native every call is cross-origin — so omitting it here would
    // fail the preflight for every request, exactly as x-security-token did.
    'x-session-id',
    'Idempotency-Key',
    // Step-up proof for sensitive operations (PIN change, key backup, PIN reset).
    // pinService has always SENT this header, but it was missing from this list —
    // so on native, where the WebView origin (https://localhost) makes every call
    // cross-origin, the preflight rejected it and those operations failed.
    'x-security-token',
    // Live PIN-unlock proof consumed by middleware/pinGate.
    'x-pin-unlock',
    // Live Vault-unlock proof consumed by features/vault/vault.lock.ts.
    'x-vault-unlock',
  ],
  // CRITICAL for native clients (Capacitor Android/iOS): CORS only exposes
  // "simple" response headers (Cache-Control, Content-Language, Content-Type,
  // Expires, Last-Modified, Pragma) by default. The `Authorization` header
  // carrying the access token MUST be listed here so cross-origin JavaScript
  // (WebView at https://localhost) can read it from the API response.
  // Without this, login succeeds at the network level but the frontend cannot
  // capture the token — breaking authentication on Android/iOS completely.
  exposedHeaders: [
    'Authorization',
    'X-Request-Id',
    'X-Correlation-Id',
    // The refreshed PIN-unlock token. Must be exposed or the client cannot read
    // it cross-origin, the window never slides, and the user is re-prompted for
    // their PIN every PIN_GATE_TIMEOUT_MINUTES regardless of activity.
    'X-Pin-Unlock',
    // The refreshed Vault-unlock token (sliding auto-lock window), same reason.
    'X-Vault-Unlock',
  ],
}));
app.use(express.json({
  limit: '1mb',
  // Stash the raw request bytes so webhook handlers can verify an HMAC
  // signature computed over the exact payload (see payment webhook).
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  },
}));

//  Global body sanitization (B-4) 
// Strip HTML/script tags from all string fields in the request body (including arrays & nested objects).
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitizeValue = (val: unknown): unknown => {
      if (typeof val === 'string') {
        return sanitize(val);
      }
      if (Array.isArray(val)) {
        return val.map(sanitizeValue);
      }
      if (val && typeof val === 'object') {
        return sanitizeObject(val as Record<string, unknown>);
      }
      return val;
    };

    const sanitizeObject = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = sanitizeValue(value);
      }
      return result;
    };

    req.body = sanitizeObject(req.body as Record<string, unknown>);
  }
  next();
});

// Baseline API throttling for abuse protection.
//
// Signed-in traffic is budgeted PER USER, anonymous traffic per IP. A flat 60/min
// per IP was tripped by ordinary use: one app launch syncs ~12 tables plus
// profile/flags/PIN/device calls, the dashboard polls live quotes every 6–10s, and
// a user's web, Android and iOS clients on one Wi-Fi (or thousands of phones behind
// a carrier NAT) all shared that single IP bucket.
//
// The anonymous limit deserves special care in THIS deployment. Signed-in
// requests bucket as `user:<id>`, so they are genuinely per user. Anonymous
// ones bucket by `req.ip` — which, for the browser build, is the Vercel edge
// address rather than the visitor's (vercel.json proxies /api/* to Render; see
// the TRUST_PROXY note at the top of this file). So the anonymous budget is
// shared by every logged-out web visitor at once, and 120/min across all of
// them was low enough to refuse ordinary sign-ins.
//
// Raising it is safe because nothing relies on this limiter as its real
// protection: every sensitive anonymous route has a dedicated limiter keyed on
// the credential being targeted (features/auth/auth.routes.ts), which is both
// tighter per account and immune to this address collapse. What is left here is
// a coarse ceiling on total anonymous volume.
const isProductionEnv = process.env.NODE_ENV === 'production';
const globalApiUserLimit = Number(process.env.API_USER_RATE_LIMIT || (isProductionEnv ? 300 : 600));
const globalApiIpLimit = Number(process.env.API_RATE_LIMIT || (isProductionEnv ? 1200 : 600));

app.use('/api/v1', authenticatedRateLimit({
  windowMs: 60_000,
  max: (key) => (key.startsWith('user:') ? globalApiUserLimit : globalApiIpLimit),
  scope: 'api-global',
  message: 'Too many API requests. Please try again later.',
}));

// Stricter bill/ocr endpoint throttling to control compute and storage abuse.
//
// These are mounted on a path PREFIX, so without `skip` they count every request
// under it — reads included. That is what produced "You're doing this too fast"
// during ordinary use:
//
//   * Receipts: the limit is sized for STARTING scans (8/min), but it also
//     counted the status polls of the scan it had just authorised. The client
//     polls every 700ms initially, so one 30s scan spends ~24 requests against
//     a budget of 8 — the user was throttled a few seconds into their FIRST
//     receipt, and the half-finished scan then left the screen stuck.
//   * Bills: 10/min counted GET /bills too, so simply opening the bills list a
//     few times tripped a limit meant for uploads.
//
// Reads are cheap and already covered by the global per-user limiter (300/min),
// so they are skipped here. Every expensive operation keeps its own limiter at
// the route level (api-bills-upload, api-ocr-start, api-ocr-status,
// api-receipts-scan), which is where the real protection belongs.
const isCheapRead = (req: { method: string }) => req.method === 'GET' || req.method === 'HEAD';

app.use('/api/v1/bills', authenticatedRateLimit({
  windowMs: 60_000,
  max: Number(process.env.BILL_UPLOAD_RATE_LIMIT || 10),
  scope: 'api-bills',
  skip: isCheapRead,
  message: 'Too many bill processing requests. Please try again later.',
}));

app.use('/api/v1/receipts', authenticatedRateLimit({
  windowMs: 60_000,
  max: Number(process.env.RECEIPT_SCAN_RATE_LIMIT || 8),
  scope: 'api-receipts',
  skip: isCheapRead,
  message: 'Too many receipt scan requests. Please try again later.',
}));

// Sync endpoint throttling (higher limit, user-scoped).
app.use('/api/v1/sync', authenticatedRateLimit({
  windowMs: 60_000,
  max: Number(process.env.SYNC_RATE_LIMIT || 100),
  scope: 'api-sync',
  message: 'Too many sync requests. Please try again later.',
}));

// ── Prometheus metrics endpoint ──────────────────────────────────────────────
//
// Grafana Cloud (or Grafana Agent) scrapes this on a schedule. Protected by
// a `METRICS_TOKEN` bearer secret so scrape data stays private even though the
// endpoint is on the public port. On Render there is no private network, so
// bearer-token auth is the correct guard. If METRICS_TOKEN is not set (local
// dev / staging) the endpoint is open — set it in production.
app.get('/metrics', async (req, res): Promise<void> => {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const authHeader = req.headers.authorization ?? '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (provided !== token) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
  }
  try {
    const text = await renderMetrics();
    res.writeHead(200, { 'content-type': metricsContentType });
    res.end(text);
  } catch {
    res.writeHead(500);
    res.end();
  }
});

// ── Render log-drain webhook ───────────────────────────────────────────────
//
// Render posts ALL stdout/stderr to this URL (configure in Render dashboard:
// Service → Logs → Log Drains → Add → HTTP). The handler validates the bearer
// token and forwards batches to Grafana Cloud Loki. See middleware/renderDrain.ts.
app.post('/internal/logs/drain', renderDrainHandler);

// Public liveness probe — minimal information disclosure.
// Detailed diagnostics (DB error messages, Redis status, circuit breaker
// state) are reserved for the authenticated /api/v1/health/deep route.
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Which build is actually serving.
 *
 * Render's `preDeployCommand` runs migrations and ABORTS the deploy if they
 * fail, leaving the previous version live — so "I pushed the fix" and "the fix
 * is running" are genuinely different claims, and there was no way to tell them
 * apart from outside. Reported only on the authenticated route: `/health` stays
 * minimal by design.
 */
const BUILD_INFO = {
  commit: (process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'unknown').slice(0, 12),
  branch: process.env.RENDER_GIT_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
  bootedAt: new Date().toISOString(),
};

// Authenticated deep healthcheck for ops dashboards / Fly health probes
// running with a service token. Does NOT leak raw error messages — only
// boolean status + safe codes — so it can be polled by external monitors
// holding a valid JWT.
app.get('/api/v1/health/deep', authMiddleware, async (req: AuthRequest, res) => {
  let dbStatus: 'connected' | 'error' = 'error';
  let dbCode: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (err) {
    dbCode = (err as NodeJS.ErrnoException)?.code ?? 'DB_QUERY_FAILED';
    logger.warn('[health/deep] DB probe failed', {
      requestId: (req as any).id,
      code: dbCode,
    });
  }

  res.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    build: BUILD_INFO,
    services: {
      circuitBreakers: getCircuitBreakerStatus(),
      database: { status: dbStatus, code: dbCode },
      crypto: { configured: isCryptoConfigured() },
      storage: getStorageHealth(),
    },
  });
});

/**
 * GET /api/v1/health/metrics
 *
 * Admin-only Prometheus-shaped snapshot of:
 *   - per-route request counters + p50/p95/p99 latency
 *   - cache hit-rate by prefix
 *   - circuit-breaker state
 *
 * Designed as a drop-in for `prom-client` later — JSON shape mirrors
 * what a Histogram + Counter would produce.
 */
app.get('/api/v1/health/metrics', adminPlatformGate, authMiddleware, requireRole('admin'), (_req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    requests: getMetricsSnapshot(),
    cache: getCacheMetricsSnapshot(),
    circuitBreakers: getCircuitBreakerStatus(),
  });
});

// Public API documentation
app.use('/api-docs', docsRoutes);

// NOTE: backend/uploads/ is NOT served. It is the local-disk fallback for
// attachment storage (advisor KYC documents, bills, vault blobs) and used to be
// mounted here with express.static and no authentication. Nothing links to it —
// files are always streamed through authenticated endpoints (downloadBuffer).

// A delete or data reset invalidates recorded create replays for that user.
app.use('/api/v1', forgetDuplicatesAfterDeletes);

// API v1
app.use('/api/v1', apiRoutes);

// 404  unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'The page or resource you are looking for does not exist.',
    code: 'NOT_FOUND',
  });
});

// Error handling middleware
app.use(errorHandler);

export { app };
export default app;
