import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { errorHandler } from './middleware/error';
import { apiRoutes } from './routes/index';
import { docsRoutes } from './routes/docs';
import { getRedisStatus } from './cache/redis';
import { rateLimit, authenticatedRateLimit } from './middleware/rateLimit';
import { getCircuitBreakerStatus } from './utils/circuitBreaker';
import { sanitize } from './utils/sanitize';
import { logger } from './config/logger';
import { prisma } from './db/prisma';

import { isAllowedOrigin } from './config/cors';

const app = express();

//  Request ID stamping (B-1) 
// Every request gets a unique ID for log correlation & error responses.
app.use((req, res, next) => {
  (req as any).id = randomUUID();
  res.setHeader('X-Request-Id', (req as any).id);
  next();
});

app.use((req, res, next) => {
  logger.info(`[REQ] ${req.method} ${req.path}`, { requestId: (req as any).id });
  next();
});

// Disable X-Powered-By header to prevent server fingerprinting
app.disable('x-powered-by');

// Add helmet for secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*.supabase.co"],
      connectSrc: ["'self'", "https://*.supabase.co"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-origin" },
}));

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
    'x-pw-encoding',   // password encoding negotiation (sha256 vs plain)
    'x-request-id',
  ],
}));
app.use(express.json({ limit: '1mb' }));

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

// Health check
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  let dbError: any = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (err: unknown) {
    dbStatus = 'error';
    dbError = {
      message: err instanceof Error ? err.message : String(err),
      code: (err as NodeJS.ErrnoException)?.code,
    };
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      redis: getRedisStatus(),
      circuitBreakers: getCircuitBreakerStatus(),
      database: {
        status: dbStatus,
        error: dbError,
      }
    },
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
