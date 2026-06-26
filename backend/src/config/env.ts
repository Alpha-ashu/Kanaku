import { z } from 'zod';
import { serviceName } from './serviceRole';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  // Redis/Dragonfly has been removed — the cache, rate-limit, idle-session and
  // PIN-unlock stores all run in-process (single backend instance). There are no
  // REDIS_* / BULLMQ_* env vars anymore.
  JWT_SECRET: z.string().min(32).optional(),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  // Auth source of truth. 'custom' = backend-issued JWT (default, current behavior).
  // 'supabase' = Supabase Auth canonical (Option A) — only flip after users are
  // migrated and validated in staging.
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

  // API Keys and Credentials (only those actually consumed by the codebase).
  OPENAI_API_KEY: z.string().optional(),   // voice transcription (whisper)
  GOOGLE_API_KEY: z.string().optional(),   // Gemini / OCR engine
  RECEIPT_OCR_ENDPOINT: z.string().url().optional(),
  RECEIPT_OCR_API_KEY: z.string().optional(),
  RECEIPT_OCR_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  RECEIPT_SCAN_RATE_LIMIT: z.coerce.number().int().positive().optional(),

  // Email (SendGrid) — the outbox drainer sends transactional + security-alert
  // mail through these. ("Brevo SMTP" lives on the observability machine, not
  // here; the backend's mail path is SendGrid.)
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_FROM_NAME: z.string().optional(),

  // Push (Firebase Admin / FCM). Individual service-account fields (see
  // config/firebase.ts). All-or-nothing: push is disabled cleanly when absent.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),

  // Metrics/health ports (Prometheus scrape target on the private 6PN). Default
  // 9091 on both API and worker — see server.ts / worker.ts.
  METRICS_PORT: z.coerce.number().int().positive().optional(),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().optional(),
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

  // (AA_ENCRYPTION_ROOT_KEY is reported by the config manifest below as a
  // `recommended` item — missing ⇒ a single "feature degraded" warning in the
  // startup report, not a duplicate warn here. The AA service itself still
  // refuses to operate without the key.)

  return {
    ...values,
    JWT_SECRET: resolvedJwtSecret,
  };
});

const parsed = envSchema.safeParse(process.env);

/** Fully-typed, validated environment. */
export type Env = z.infer<typeof envSchema>;

/**
 * The typed, validated environment. When zod parsing succeeds we use the parsed
 * (coerced + defaulted) data. Outside production we fall back to a best-effort
 * coercion so local dev with a partial `.env` still boots — but we surface it as
 * the typed `Env` shape rather than raw `process.env` so downstream code keeps
 * autocomplete + type-safety. The hard fail-fast for production lives in
 * `validateConfig()` below (run at import time), which gives a clear, grouped
 * report instead of a raw zod dump.
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

// ───────────────────────────────────────────────────────────────────────────────
// Centralized startup configuration validation
// ───────────────────────────────────────────────────────────────────────────────
//
// One declarative manifest of every configuration concern this Node service
// depends on, so a misconfigured deploy fails FAST and LOUD at startup instead
// of surfacing as a confusing runtime error later. The companion validator for
// the observability machine (which runs no Node) lives at
// `platform/observability/validate-config.sh`.
//
// Two tiers, deliberately:
//   - `required`    — the service cannot function without it. Missing/invalid in
//                     production ⇒ the process refuses to boot (throws).
//   - `recommended` — a FEATURE degrades without it (e.g. push, AA encryption),
//                     but the core service still runs. Missing ⇒ a loud warning,
//                     never a crash — so a non-push / non-AA deploy still boots.
//
// `requiredness` can depend on NODE_ENV (most secrets are only mandatory in
// production) and on which service is booting (`api` vs `worker`). To promote a
// `recommended` item to a hard requirement later, change its `tier` — one line.

type Service = ReturnType<typeof serviceName>;
type Tier = 'required' | 'recommended' | 'optional';

interface ConfigItem {
  /** The primary env var (or a representative one for grouped credentials). */
  readonly key: string;
  /** Human group for the startup report. */
  readonly group: string;
  /** What it powers — shown when it is missing. */
  readonly purpose: string;
  /** Which services depend on it. */
  readonly services: ReadonlyArray<Service>;
  /** Requirement tier, possibly environment-dependent. */
  readonly tier: (nodeEnv: string) => Tier;
  /** Present/valid check. Defaults to "non-empty env var". */
  readonly present?: () => boolean;
}

const has = (k: string): boolean => {
  const v = process.env[k];
  return typeof v === 'string' && v.trim().length > 0;
};

const ALL: Service[] = ['api', 'worker'];
const prodRequired = (nodeEnv: string): Tier => (nodeEnv === 'production' ? 'required' : 'recommended');

/**
 * The configuration manifest. Add a line here when a service grows a new
 * mandatory dependency — this is the single source of truth for "what must be
 * configured for Kanaku to run."
 */
const CONFIG_MANIFEST: readonly ConfigItem[] = [
  // ── Core ──────────────────────────────────────────────────────────────────
  {
    key: 'DATABASE_URL',
    group: 'Database',
    purpose: 'PostgreSQL connection (Prisma) — the system of record',
    services: ALL,
    tier: () => 'required', // always, every environment
  },
  {
    key: 'JWT_SECRET',
    group: 'Auth',
    purpose: 'Signing/verifying backend-issued access & refresh JWTs',
    services: ALL,
    // In prod JWT_SECRET is mandatory (no Supabase fallback); in dev the
    // SUPABASE_JWT_SECRET fallback is accepted (see the transform above).
    tier: (e) => (e === 'production' ? 'required' : 'recommended'),
    present: () => has('JWT_SECRET') || (process.env.NODE_ENV !== 'production' && has('SUPABASE_JWT_SECRET')),
  },

  // ── Email (SendGrid) ────────────────────────────────────────────────────────
  {
    key: 'SENDGRID_API_KEY',
    group: 'Email (SendGrid)',
    purpose: 'Transactional + security-alert email via the notification outbox',
    services: ALL, // worker delivers; api delivers too in combined mode
    tier: prodRequired,
  },
  {
    key: 'SENDGRID_FROM_EMAIL',
    group: 'Email (SendGrid)',
    purpose: 'Verified "from" address for outbound mail',
    services: ALL,
    tier: prodRequired,
  },

  // ── Push (Firebase / FCM) ────────────────────────────────────────────────────
  // Recommended only: push degrades cleanly when unset (config/firebase.ts skips
  // init), and production currently runs without FIREBASE_* by design.
  {
    key: 'FIREBASE_PROJECT_ID',
    group: 'Push (Firebase)',
    purpose: 'FCM/APNS push delivery (degrades to disabled when absent)',
    services: ALL,
    tier: () => 'recommended',
    present: () => has('FIREBASE_PROJECT_ID') && has('FIREBASE_PRIVATE_KEY') && has('FIREBASE_CLIENT_EMAIL'),
  },

  // ── Crypto / Account Aggregator ──────────────────────────────────────────────
  {
    key: 'AA_ENCRYPTION_ROOT_KEY',
    group: 'Crypto (Account Aggregator)',
    purpose: 'AES-256-GCM at-rest encryption for AA/KYC payloads',
    services: ['api'],
    // Recommended: the AA module is phase-gated; non-AA deploys must still boot.
    tier: () => 'recommended',
  },
];

export interface ConfigValidationResult {
  service: Service;
  nodeEnv: string;
  ok: boolean;
  missingRequired: ConfigItem[];
  missingRecommended: ConfigItem[];
  /** zod format errors (value present but malformed). */
  formatErrors: string[];
  report: string;
}

const isPresent = (item: ConfigItem): boolean => (item.present ? item.present() : has(item.key));

/**
 * Validate this process's configuration. Pure (no throw) so it is unit-testable;
 * the import-time gate below is what actually halts a misconfigured boot.
 */
export function checkConfig(service: Service = serviceName()): ConfigValidationResult {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const items = CONFIG_MANIFEST.filter((i) => i.services.includes(service));

  const missingRequired: ConfigItem[] = [];
  const missingRecommended: ConfigItem[] = [];
  for (const item of items) {
    if (isPresent(item)) continue;
    const tier = item.tier(nodeEnv);
    if (tier === 'required') missingRequired.push(item);
    else if (tier === 'recommended') missingRecommended.push(item);
  }

  // Re-parse against the CURRENT process.env (not the import-time `parsed`) so the
  // format report reflects live config and the function stays pure/testable.
  const formatErrors: string[] = [];
  const fresh = envSchema.safeParse(process.env);
  if (!fresh.success) {
    for (const issue of fresh.error.issues) {
      formatErrors.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
  }

  const ok = missingRequired.length === 0 && formatErrors.length === 0;

  const lines: string[] = [];
  lines.push(`[config] ${service} · ${nodeEnv} · ${ok ? 'OK' : 'FAILED'}`);
  if (formatErrors.length) {
    lines.push('  ✗ invalid values:');
    for (const e of formatErrors) lines.push(`      - ${e}`);
  }
  if (missingRequired.length) {
    lines.push('  ✗ MISSING REQUIRED:');
    for (const i of missingRequired) lines.push(`      - ${i.key} [${i.group}] — ${i.purpose}`);
  }
  if (missingRecommended.length) {
    lines.push('  ⚠ missing (feature degraded):');
    for (const i of missingRecommended) lines.push(`      - ${i.key} [${i.group}] — ${i.purpose}`);
  }
  if (ok && !missingRecommended.length) lines.push('  ✓ all required and recommended configuration present');

  return { service, nodeEnv, ok, missingRequired, missingRecommended, formatErrors, report: lines.join('\n') };
}

let validated = false;

/**
 * Startup gate. Call once, as early as possible, from each entrypoint
 * (server.ts / worker.ts). Idempotent. Prints the grouped report, then in
 * production THROWS if any required value is missing/invalid — the service must
 * not run with partial configuration. In dev/test it warns and continues so a
 * partial `.env` still boots.
 */
export function validateConfig(service: Service = serviceName()): ConfigValidationResult {
  const result = checkConfig(service);
  if (!validated) {
    validated = true;
    // eslint-disable-next-line no-console
    console[result.ok ? 'info' : 'error'](result.report);
  }
  if (!result.ok && result.nodeEnv === 'production') {
    throw new Error(
      `[config] Refusing to start ${service}: ${result.missingRequired.length} required ` +
        `variable(s) missing and ${result.formatErrors.length} invalid. See the report above.`,
    );
  }
  return result;
}

// Import-time gate: the first module to import `env` triggers validation, so a
// misconfigured production deploy fails before any server/port binds — even if
// an entrypoint forgot to call validateConfig() explicitly. Skipped under tests
// (NODE_ENV=test) so unit tests can import config freely.
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}
