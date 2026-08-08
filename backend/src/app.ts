import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { errorHandler } from './middleware/error';
import { apiRoutes } from './routes/index';
import { docsRoutes } from './routes/docs';
import { rateLimit, authenticatedRateLimit } from './middleware/rateLimit';
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
import { renderMetrics, metricsContentType } from './config/metrics';
import { renderDrainHandler } from './middleware/renderDrain';
import { isAllowedOrigin } from './config/cors';

const app = express();


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

// Baseline API throttling for abuse protection (IP + optional user identity).
const defaultGlobalApiRateLimit = process.env.NODE_ENV === 'production' ? 60 : 600;

app.use('/api/v1', rateLimit({
  windowMs: 60_000,
  max: Number(process.env.API_RATE_LIMIT || defaultGlobalApiRateLimit),
  scope: 'api-global',
  message: 'Too many API requests. Please try again later.',
}));

// Stricter bill/ocr endpoint throttling to control compute and storage abuse.
app.use('/api/v1/bills', authenticatedRateLimit({
  windowMs: 60_000,
  max: Number(process.env.BILL_UPLOAD_RATE_LIMIT || 10),
  scope: 'api-bills',
  message: 'Too many bill processing requests. Please try again later.',
}));

app.use('/api/v1/receipts', authenticatedRateLimit({
  windowMs: 60_000,
  max: Number(process.env.RECEIPT_SCAN_RATE_LIMIT || 8),
  scope: 'api-receipts',
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
    services: {
      circuitBreakers: getCircuitBreakerStatus(),
      database: { status: dbStatus, code: dbCode },
      crypto: { configured: isCryptoConfigured() },
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

// Static uploads serving
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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
