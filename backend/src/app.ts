import express from 'express';
import cors from 'cors';
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
import { requireRole } from './middleware/rbac';
import { metricsMiddleware, getMetricsSnapshot } from './middleware/metrics';
import { getCacheMetricsSnapshot } from './cache/redis';
import { isCryptoConfigured } from './security/crypto';

import { isAllowedOrigin } from './config/cors';

const app = express();

//  Request ID stamping (B-1)
// End-to-end correlation: honor a caller-supplied `X-Request-Id` (so the chain
// Frontend → API → DB/AuditLog → Worker shares one ID) and otherwise mint one.
// The incoming value is format-validated to avoid log-forging / header injection
// (bounded length, id-safe charset); anything else is replaced with a fresh UUID.
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
app.use((req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  (req as any).id = candidate && REQUEST_ID_RE.test(candidate) ? candidate : randomUUID();
  res.setHeader('X-Request-Id', (req as any).id);
  next();
});

// Per-request context (AsyncLocalStorage) — lets the Prisma audit interceptor
// attribute every financial mutation to the acting user/IP/User-Agent.
app.use(requestContext);

// Hard request timeout — prevents a stuck DB query / hung upstream call
// from holding a worker indefinitely. Configurable via REQUEST_TIMEOUT_MS.
app.use(requestTimeout(Number(process.env.REQUEST_TIMEOUT_MS) || undefined));

// Lightweight in-memory metrics — counters + p50/p95/p99 latency per
// route, scrapable via /api/v1/health/metrics (admin only).
app.use(metricsMiddleware);

app.use((req, res, next) => {
  logger.info(`[REQ] ${req.method} ${req.path}`, { requestId: (req as any).id });
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

// Ensure same-origin policies and legacy XSS filter protection are set explicitly
app.use((req, res, next) => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
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
app.get('/api/v1/health/metrics', authMiddleware, requireRole('admin'), (_req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    requests: getMetricsSnapshot(),
    cache: getCacheMetricsSnapshot(),
    circuitBreakers: getCircuitBreakerStatus(),
  });
});

// Public API documentation
app.use('/api-docs', docsRoutes);

// API v1
app.use('/api/v1', apiRoutes);

// 404  unknown routes
app.use('*', (req, res) => {
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
