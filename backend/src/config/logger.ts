import winston from 'winston';
import { redact } from '../utils/redact';

const isVercel = process.env.VERCEL === '1' || !!process.env.NOW_REGION;
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Custom Winston format that deep-redacts PII / secret fields from every
 * structured log payload before it is serialized. Critical for fintech
 * apps where passwords, PINs, OTPs, and JWTs must never appear in logs.
 */
const redactFormat = winston.format((info) => {
  const { level, message, timestamp, stack, ...meta } = info as Record<string, unknown>;
  const safeMeta = redact(meta) as Record<string, unknown>;
  return { level, message, timestamp, stack, ...safeMeta } as winston.Logform.TransformableInfo;
});

const transports: winston.transport[] = [
  new winston.transports.Console(),
];

// Only add file transports if NOT on Vercel (read-only filesystem)
if (!isVercel && !isProduction) {
  try {
    transports.push(
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
    );
  } catch (err) {
    console.warn('Failed to initialize file transports:', err);
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redactFormat(),
    winston.format.json()
  ),
  transports,
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

// API Keys and Credentials
export const getApiKey = (key: string): string | undefined => {
  return process.env[key as keyof NodeJS.ProcessEnv] as string | undefined;
};

export const getStripeApiKey = (): string | undefined => {
  return getApiKey('STRIPE_API_KEY');
};

export const getOpenAIApiKey = (): string | undefined => {
  return getApiKey('OPENAI_API_KEY');
};

export const getGoogleApiKey = (): string | undefined => {
  return getApiKey('GOOGLE_API_KEY');
};

export const getFirebaseSecret = (): string | undefined => {
  return getApiKey('FIREBASE_SECRET');
};

export const getAwsSecretAccessKey = (): string | undefined => {
  return getApiKey('AWS_SECRET_ACCESS_KEY');
};

export const getSendGridApiKey = (): string | undefined => {
  return getApiKey('SENDGRID_API_KEY');
};

export { logger };
