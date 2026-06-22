import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  REDIS_TLS: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value === 'true';
      return false;
    }),
  // Optional secondary cache store (e.g. self-hosted Dragonfly). The cache layer
  // automatically fails over to this when the primary errors / hits a quota,
  // then fails back when the primary recovers. (BullMQ queues stay on REDIS_URL.)
  REDIS_FALLBACK_URL: z.string().url().optional(),
  REDIS_FALLBACK_TLS: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value === 'true';
      return false;
    }),
  JWT_SECRET: z.string().min(32).optional(),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  // Auth source of truth. 'custom' = backend-issued JWT (default, current behavior).
  // 'supabase' = Supabase Auth canonical (Option A) — only flip after users are
  // migrated and validated in staging. See docs/AUTH_CONSOLIDATION_PLAN.md.
  AUTH_CANONICAL: z.enum(['custom', 'supabase']).default('custom'),
  FRONTEND_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Hard request timeout (ms). See backend/src/middleware/timeout.ts.
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

  // 32-byte hex (64-char) root key for AES-256-GCM encryption of AA / KYC
  // payloads at rest. Required in production once the AA feature is live.
  AA_ENCRYPTION_ROOT_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'AA_ENCRYPTION_ROOT_KEY must be 64 hex characters (32 bytes)')
    .optional(),

  // HMAC secrets for inbound webhook verification.
  WEBHOOK_SETU_SECRET: z.string().min(16).optional(),
  WEBHOOK_SETU_SIGNATURE_HEADER: z.string().optional(),
  WEBHOOK_RESEND_SECRET: z.string().min(16).optional(),
  WEBHOOK_MSG91_SECRET: z.string().min(16).optional(),
  WEBHOOK_SENDGRID_SECRET: z.string().min(16).optional(),

  // Cookie configuration for refresh-token-in-cookie flow.
  REFRESH_COOKIE_NAME: z.string().default('kanaku_rt'),
  REFRESH_COOKIE_DOMAIN: z.string().optional(),

  // Server-side inactivity window (minutes). 0 / unset disables the idle lock,
  // so a stolen access/refresh token can't be replayed after the user has been
  // inactive this long. See backend/src/security/idleSession.ts.
  IDLE_TIMEOUT_MINUTES: z.coerce.number().nonnegative().optional(),

  // API Keys and Credentials
  STRIPE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  FIREBASE_SECRET: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  RECEIPT_OCR_ENDPOINT: z.string().url().optional(),
  RECEIPT_OCR_API_KEY: z.string().optional(),
  RECEIPT_OCR_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  RECEIPT_SCAN_RATE_LIMIT: z.coerce.number().int().positive().optional(),
}).transform((values, ctx) => {
  // In production, JWT_SECRET MUST be explicitly configured — we no longer
  // allow silent fallback to SUPABASE_JWT_SECRET because:
  //   1. Operators rotate JWT_SECRET on a different cadence than Supabase.
  //   2. A missing JWT_SECRET would otherwise mean every backend-issued
  //      token is silently verifiable with Supabase's key, blurring the
  //      authority boundary between identity (Supabase) and authorization
  //      (this service).
  if (values.NODE_ENV === 'production' && !values.JWT_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'JWT_SECRET is required in production (no fallback to SUPABASE_JWT_SECRET).',
      path: ['JWT_SECRET'],
    });
    return z.NEVER;
  }

  // Outside production we still permit the fallback so local devs without
  // a dedicated JWT_SECRET configured can spin up against Supabase quickly.
  const resolvedJwtSecret = values.JWT_SECRET || values.SUPABASE_JWT_SECRET;

  if (!resolvedJwtSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either JWT_SECRET or SUPABASE_JWT_SECRET must be provided',
      path: ['JWT_SECRET'],
    });
    return z.NEVER;
  }

  // Hard-stop AA usage in production without an encryption key.
  if (values.NODE_ENV === 'production' && !values.AA_ENCRYPTION_ROOT_KEY) {
    // Warn rather than fail so non-AA deployments still boot.
    // The AA service itself will refuse to operate if the key is missing.
    // eslint-disable-next-line no-console
    console.warn('[env] AA_ENCRYPTION_ROOT_KEY is not set — the Account Aggregator feature will refuse to operate until it is configured.');
  }

  return {
    ...values,
    JWT_SECRET: resolvedJwtSecret,
  };
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  if (process.env.NODE_ENV === 'production') {
    // Refuse to boot in production with bad env — better to fail loudly
    // than serve traffic with the wrong secrets / no encryption key.
    throw new Error('Environment validation failed in production. Check the error above.');
  }
}

/** Fully-typed, validated environment. */
export type Env = z.infer<typeof envSchema>;

/**
 * In production we have already thrown above if parsing failed, so
 * `parsed.data` is guaranteed present. Outside production we fall back to
 * a best-effort coercion so local dev with a partial `.env` still boots —
 * but we surface it as the typed `Env` shape rather than raw `process.env`
 * so downstream code keeps autocomplete + type-safety.
 */
export const env: Env = parsed.success
  ? parsed.data
  : ({
      ...(process.env as unknown as Env),
      NODE_ENV: (process.env.NODE_ENV as Env['NODE_ENV']) || 'development',
      PORT: Number(process.env.PORT) || 3000,
      AUTH_CANONICAL: (process.env.AUTH_CANONICAL as Env['AUTH_CANONICAL']) || 'custom',
      LOG_LEVEL: (process.env.LOG_LEVEL as Env['LOG_LEVEL']) || 'info',
      REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || 'kanaku_rt',
      JWT_SECRET: process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '',
    } as Env);
