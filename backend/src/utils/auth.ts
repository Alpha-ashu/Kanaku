import jwt from 'jsonwebtoken';
import { AuthTokens } from '../features/auth/auth.types';

const getSecret = () => {
  const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET or SUPABASE_JWT_SECRET environment variable is required');
  return secret;
};

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

// Token lifetimes (seconds). Access tokens are short-lived; refresh tokens are
// long-lived and exchanged at POST /auth/refresh.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const generateTokens = (user: {
  id: string;
  email: string;
  name: string;
  role: string;
  isApproved: boolean;
}): AuthTokens => {
  const claims = {
    userId: user.id,
    email: user.email,
    role: user.role,
    isApproved: user.isApproved,
  };

  // `type` distinguishes access vs refresh tokens so a refresh token cannot be
  // used to authorize API calls (and vice-versa). Legacy tokens minted before
  // this change have no `type` and are still accepted as access tokens.
  const accessToken = jwt.sign(
    { ...claims, type: 'access' },
    getSecret(),
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS }
  );

  const refreshToken = jwt.sign(
    { ...claims, type: 'refresh' },
    getSecret(),
    { expiresIn: REFRESH_TOKEN_TTL_SECONDS }
  );

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isApproved: user.isApproved,
    },
  };
};

export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, getSecret());
  } catch (error) {
    throw new Error('Invalid token');
  }
};

/**
 * Verify a refresh token and return its identity claims.
 * Rejects access tokens (`type === 'access'`); accepts refresh tokens and legacy
 * untyped tokens (issued before token typing existed) for backward compatibility.
 */
export const verifyRefreshToken = (
  token: string
): { userId: string; email?: string; role?: string; isApproved?: boolean } => {
  const decoded = jwt.verify(token, getSecret()) as Record<string, any>;
  if (decoded?.type === 'access') {
    throw new Error('Access token cannot be used to refresh');
  }
  const userId = typeof decoded?.userId === 'string' ? decoded.userId : decoded?.sub;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('Invalid refresh token subject');
  }
  return {
    userId,
    email: typeof decoded.email === 'string' ? decoded.email : undefined,
    role: typeof decoded.role === 'string' ? decoded.role : undefined,
    isApproved: typeof decoded.isApproved === 'boolean' ? decoded.isApproved : undefined,
  };
};
