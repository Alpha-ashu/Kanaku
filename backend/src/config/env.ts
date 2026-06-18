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
  JWT_SECRET: z.string().min(32).optional(),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  // Auth source of truth. 'custom' = backend-issued JWT (default, current behavior).
  // 'supabase' = Supabase Auth canonical (Option A) — only flip after users are
  // migrated and validated in staging. See docs/AUTH_CONSOLIDATION_PLAN.md.
  AUTH_CANONICAL: z.enum(['custom', 'supabase']).default('custom'),
  FRONTEND_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
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
  const resolvedJwtSecret = values.JWT_SECRET || values.SUPABASE_JWT_SECRET;

  if (!resolvedJwtSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either JWT_SECRET or SUPABASE_JWT_SECRET must be provided',
      path: ['JWT_SECRET'],
    });
    return z.NEVER;
  }

  return {
    ...values,
    JWT_SECRET: resolvedJwtSecret,
  };
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
}

export const env = parsed.success
  ? parsed.data
  : ({
      ...(process.env as any),
      JWT_SECRET: process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
    } as any);
