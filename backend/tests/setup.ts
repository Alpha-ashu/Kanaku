import path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../.env.test') });

// The Account-Aggregator router is mount-gated OFF by default in production
// (see src/routes/index.ts), but the integration suite exercises it, so opt it
// in for tests unless the runner already configured ENABLED_MODULES.
process.env.ENABLED_MODULES = process.env.ENABLED_MODULES || 'aa';

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
