import { Request, Response, NextFunction } from 'express';
import { randomUUID, randomInt } from 'crypto';
import { AuthService } from './auth.service';
import { RegisterInput, LoginInput } from './auth.types';
import { AuthRequest, invalidateUserSnapshotCache } from '../../middleware/auth';
import { cacheGetJson, cacheSetJson, cacheDeleteByPrefix, getRedisClient, getRedisStatus } from '../../cache/redis';
import { sanitize } from '../../utils/sanitize';
import { logger } from '../../config/logger';
import { generateOtp, verifyOtp } from './otp.service';
import { checkDeviceTrust, trustDevice, revokeDeviceTrust, listUserDevices } from './device.service';
import { prisma } from '../../db/prisma';
import { otpService } from '../otp/otp.service';
import bcrypt from 'bcrypt';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { AppError } from '../../utils/AppError';
import { generateTokens, verifyRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from '../../utils/auth';
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from '../../security/refreshCookie';
import { establishIdleSession, clearIdleSession } from '../../security/idleSession';
import { clearPinUnlock, isPinUnlocked } from '../../security/pinUnlock';
import { sendWelcomeEmail, sendLoginAlertEmail } from '../../emails';
import { auditFromRequest } from '../../utils/auditLogger';
import { isProtectedAccount } from '../../utils/protectedAccounts';

const authService = new AuthService();
const challengeMemoryCache = new Map<string, { payload: any; expiresAt: number }>();

/**
 * Origins used by Capacitor native webviews (Android/iOS). A real browser can
 * never forge these (Origin is a browser-controlled, forbidden header), so they
 * are a safe signal — and they let already-installed native apps that predate
 * the `X-Client-Platform` header keep working.
 */
const NATIVE_ORIGINS = new Set(['https://localhost', 'capacitor://localhost', 'ionic://localhost']);

/**
 * Whether the request comes from a native (Capacitor) client — Android/iOS.
 * Those run in a webview at https://localhost and call the API cross-origin,
 * where the HttpOnly refresh cookie (SameSite) is unreliable (iOS WKWebView ITP,
 * Android third-party-cookie policy). Such clients get the refresh token in the
 * JSON body and persist it in device storage instead. Web clients are
 * same-origin (Vercel proxy) and receive the refresh token ONLY as the HttpOnly
 * cookie, so it is never exposed to browser JS (XSS-safe).
 *
 * Detected by the explicit `X-Client-Platform: native` header (current apps) OR
 * a Capacitor native Origin (older installs without the header). A browser web
 * origin (Vercel domain, or http://localhost:<port> in dev) never matches, so
 * web stays cookie-only.
 */
const isNativeClient = (req: Request): boolean => {
  if (String(req.headers['x-client-platform'] || '').toLowerCase() === 'native') return true;
  const origin = String(req.headers.origin || '').toLowerCase();
  if (!origin) return false;
  return NATIVE_ORIGINS.has(origin) || origin.startsWith('capacitor://') || origin.startsWith('ionic://');
};

// Strict email regex: local@domain.tld, no SQL/XSS chars
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const toIsoDateOnly = (value?: Date | string | null): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildProfilePayload = (
  userId: string,
  authUser?: AuthRequest['user'],
  userRecord?: Record<string, any> | null,
  profileRecord?: Record<string, any> | null,
  settingsRecord?: Record<string, any> | null,
  includePrivate = false,
  pinRecord?: Record<string, any> | null,
  pinUnlocked = true,
) => {
  const fallbackName = authUser?.name || '';
  const fallbackNameParts = fallbackName.trim().split(/\s+/).filter(Boolean);

  // PII (names, dob, income, job, address, avatar) is sourced from `profiles`
  // only — the single source of truth. `User` keeps auth/identity (name, email,
  // role) which is still read below.
  const firstName =
    profileRecord?.first_name ||
    fallbackNameParts[0] ||
    '';
  const lastName =
    profileRecord?.last_name ||
    fallbackNameParts.slice(1).join(' ') ||
    '';
  const monthlyIncome = profileRecord?.monthly_income != null
    ? toNumber(profileRecord.monthly_income, 0)
    : 0;

  const salary =
    profileRecord?.annual_income != null
      ? toNumber(profileRecord.annual_income, monthlyIncome * 12)
      : monthlyIncome * 12;
  const dateOfBirth = toIsoDateOnly(profileRecord?.date_of_birth);
  const jobType = profileRecord?.job_type || '';
  const role = userRecord?.role || authUser?.role || 'user';

  const countryVal = (profileRecord?.country || '').trim();
  let defaultCurrency = 'USD';
  if (countryVal === 'India') {
    defaultCurrency = 'INR';
  } else if (countryVal === 'United Kingdom' || countryVal === 'UK') {
    defaultCurrency = 'GBP';
  } else if (countryVal === 'Canada') {
    defaultCurrency = 'CAD';
  } else if (countryVal === 'Australia') {
    defaultCurrency = 'AUD';
  } else if (countryVal === 'United Arab Emirates' || countryVal === 'UAE') {
    defaultCurrency = 'AED';
  } else if (countryVal === 'Singapore') {
    defaultCurrency = 'SGD';
  }

  const name =
    profileRecord?.full_name ||
    userRecord?.name ||
    `${firstName} ${lastName}`.trim() ||
    fallbackName;

  // PRIVACY: until the user has unlocked with their PIN (server-verified), the
  // profile must not leak PII. Return only the minimal fields the pre-PIN app
  // shell needs — name/avatar for display, role for routing, locale — and
  // withhold email, phone, gender, address, dob, and income until a live PIN
  // unlock exists. No-op when the PIN gate is disabled (pinUnlocked defaults true).
  if (!pinUnlocked) {
    return {
      id: userId,
      name,
      firstName,
      lastName,
      avatarId: profileRecord?.avatar_id || null,
      avatarUrl: profileRecord?.avatar_url || null,
      role,
      isApproved: userRecord?.isApproved ?? authUser?.isApproved ?? false,
      currency: settingsRecord?.currency || defaultCurrency,
      language: settingsRecord?.language || 'en',
      pinEnabled: pinRecord ? Boolean(pinRecord.isActive) : false,
      pinRequired: true,
    };
  }

  const payload: Record<string, any> = {
    id: userId,
    email: userRecord?.email || profileRecord?.email || authUser?.email || '',
    name,
    firstName,
    lastName,
    gender: profileRecord?.gender || '',
    country: countryVal,
    state: profileRecord?.state || '',
    city: profileRecord?.city || '',
    // Single canonical phone key. The former `mobile`/`mobileNumber` aliases were
    // dropped — clients read `phone` (or normalise via their profile adapter).
    phone: profileRecord?.phone || '',
    avatarId: profileRecord?.avatar_id || null,
    avatarUrl: profileRecord?.avatar_url || null,
    currency: settingsRecord?.currency || defaultCurrency,
    language: settingsRecord?.language || 'en',
    updatedAt: profileRecord?.updated_at || userRecord?.updatedAt || null,
    pinEnabled: pinRecord ? Boolean(pinRecord.isActive) : false,
  };

  // BUG-15 FIX: Sensitive financial PII fields only included when explicitly requested
  // via ?includePrivate=true — never in default profile payload
  if (includePrivate) {
    payload.dateOfBirth = dateOfBirth;
    payload.jobType = jobType;
    payload.monthlyIncome = monthlyIncome;
    payload.role = role;
    payload.isApproved = userRecord?.isApproved ?? authUser?.isApproved ?? false;
    if (salary !== 0) {
      payload.salary = salary;
    }
  } else {
    // Public profile: expose role (needed for UI routing) but not financial PII
    payload.role = role;
    payload.isApproved = userRecord?.isApproved ?? authUser?.isApproved ?? false;
  }

  const allowedNullKeys = new Set([
    'id',
    'email',
    'firstName',
    'lastName',
    'phone',
    'dateOfBirth',
    'gender',
    'jobType',
    'monthlyIncome',
    'country',
    'state',
    'city',
    'currency',
    'avatarUrl',
    'pinEnabled',
    'isApproved',
    'updatedAt'
  ]);

  // Remove empty fields from profile payload to prevent empty schemas exposure (BUG-15),
  // but preserve keys that are in allowedNullKeys (returned as null, '', 0, or false).
  for (const key of Object.keys(payload)) {
    if (payload[key] === '' || payload[key] === null || payload[key] === undefined) {
      if (allowedNullKeys.has(key)) {
        if (payload[key] === undefined) {
          payload[key] = null;
        }
      } else {
        delete payload[key];
      }
    }
  }

  return payload;
};

export const checkEmailAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(200).json({ available: false, code: 'INVALID_EMAIL' });
    }
    const normalized = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(normalized)) {
      return res.status(200).json({ available: false, code: 'INVALID_EMAIL' });
    }
    // Check BOTH the local users table and the synced public.profiles table: a
    // Supabase-managed account can land in profiles before it has a prisma.user
    // row, so checking users alone under-reports duplicates (finding F2).
    // NOTE: a brand-new, unconfirmed/unsynced Supabase Auth account may still be
    // absent from both tables. The signup flow's Supabase duplicate guard
    // (empty `identities`) is the authoritative gate; this endpoint is only a
    // best-effort, pre-submit hint.
    const [existingUser, existingProfile] = await Promise.all([
      prisma.user.findUnique({ where: { email: normalized }, select: { id: true } }),
      prisma.profiles.findFirst({ where: { email: normalized }, select: { id: true } }),
    ]);
    return res.status(200).json({ available: !existingUser && !existingProfile });
  } catch (error) {
    return next(error);
  }
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  logger.info(`[AuthController] Register request received for email: ${req.body?.email}`);
  try {
    const input: RegisterInput = req.body;

    if (!input.email || !input.name || !input.password) {
      logger.warn(`[AuthController] Registration failed: missing fields for email: ${input?.email}`);
      throw AppError.badRequest('Please fill in all required fields: email, name, and password.', 'MISSING_FIELDS');
    }

    if (!EMAIL_REGEX.test(input.email)) {
      logger.warn(`[AuthController] Registration failed: invalid email format: ${input.email}`);
      throw AppError.badRequest('Please enter a valid email address.', 'INVALID_EMAIL');
    }

    if (input.password.length < 8) {
      logger.warn(`[AuthController] Registration failed: password too short for email: ${input.email}`);
      throw AppError.badRequest('Your password must be at least 8 characters long.', 'PASSWORD_TOO_SHORT');
    }

    // Enforce password strength: must contain uppercase, lowercase, and a digit
    const missingRequirements: string[] = [];
    if (!/[A-Z]/.test(input.password)) missingRequirements.push('one uppercase letter');
    if (!/[a-z]/.test(input.password)) missingRequirements.push('one lowercase letter');
    if (!/[0-9]/.test(input.password)) missingRequirements.push('one number');
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(input.password)) missingRequirements.push('one special character (!@#$%^&* etc.)');

    if (missingRequirements.length > 0) {
      logger.warn(`[AuthController] Registration failed: weak password for email: ${input.email}. Missing: ${missingRequirements.join(', ')}`);
      throw AppError.badRequest(
        `Password must include ${missingRequirements.join(', ')}.`,
        'PASSWORD_TOO_WEAK',
      );
    }

    const sanitizedInput = {
      ...input,
      name: sanitize(input.name),
      email: input.email.toLowerCase().trim(),
    };

    const tokens = await authService.register(sanitizedInput);
    logger.info(`[AuthController] User registered successfully in service: ${tokens.user?.id}`);

    // Immutable audit record of the successful registration. requestId, IP and
    // User-Agent are auto-extracted from the request.
    auditFromRequest(req, 'auth.register', {
      userId: tokens.user?.id,
      resource: 'User',
      resourceId: tokens.user?.id,
    });

    // Best-effort welcome email (no-op if SendGrid is unconfigured).
    if (tokens.user?.email) {
      void sendWelcomeEmail(tokens.user.email, tokens.user.name).catch(() => {});
    }

    res.setHeader('Authorization', `Bearer ${tokens.accessToken}`);

    // Web (same-origin): refresh token is delivered ONLY as the HttpOnly cookie,
    // never exposed to browser JS (XSS-safe). Native (cross-origin Capacitor):
    // the cookie is unreliable, so the token is returned in the body for device
    // storage. Either way the cookie is set; only the body delivery is gated.
    setRefreshCookie(res, tokens.refreshToken, REFRESH_TOKEN_TTL_SECONDS);
    const native = isNativeClient(req);

    // Start the server-side inactivity window for the new session.
    if (tokens.user?.id) await establishIdleSession(tokens.user.id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: tokens.user,
        expiresAt: tokens.expiresAt,
        // Native clients can't read cross-origin headers, so deliver tokens here.
        ...(native ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } : {}),
      },
    });
  } catch (error: any) {
    logger.error(`[AuthController] Registration error for email ${req.body?.email}:`, { message: error?.message, stack: error?.stack });

    // Immutable audit record of the FAILED registration (every attempt is recorded).
    auditFromRequest(req, 'auth.register_failed', {
      meta: { reason: error?.message, code: error?.code },
    });

    // Map known service errors to AppError before passing to next()
    if (
      error instanceof AppError
    ) {
      return next(error);
    }

    logger.error('Registration error', { message: error?.message, stack: error?.stack });

    // Prisma unique-constraint race (P2002): the app-level pre-check passed but a
    // concurrent insert won — the transaction rolled back cleanly; map to a 409.
    if (error?.code === 'P2002') {
      const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(',')
        : String(error?.meta?.target ?? '');
      if (target.toLowerCase().includes('phone')) {
        return next(AppError.conflict(
          'This phone number is already registered to another account. Please use a different phone number.',
          'PHONE_EXISTS',
        ));
      }
      return next(AppError.conflict(
        'An account with this email already exists. Please sign in or use a different email.',
        'EMAIL_EXISTS',
      ));
    }

    // Handle raw query unique violations (P2010 / Postgres 23505) in profiles table
    if (error?.code === 'P2010' || error?.message?.includes('23505')) {
      const errMsg = error?.message ?? '';
      if (errMsg.includes('phone') || errMsg.includes('Key (phone)')) {
        return next(AppError.conflict(
          'This phone number is already registered to another account. Please use a different phone number.',
          'PHONE_EXISTS',
        ));
      }
      if (errMsg.includes('email') || errMsg.includes('Key (email)')) {
        return next(AppError.conflict(
          'An account with this email already exists. Please sign in or use a different email.',
          'EMAIL_EXISTS',
        ));
      }
    }

    if (
      error?.message?.includes('UNIQUE constraint failed') ||
      error?.message === 'Email already registered'
    ) {
      return next(AppError.conflict(
        'An account with this email already exists. Please sign in or use a different email.',
        'EMAIL_EXISTS',
      ));
    }

    if (error?.message === 'Phone number already in use') {
      return next(AppError.conflict(
        'This phone number is already registered to another account. Please use a different phone number.',
        'PHONE_EXISTS',
      ));
    }

    if (isDatabaseUnavailableError(error)) {
      return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'Our servers are temporarily unavailable. Please try again in a moment.', false));
    }

    next(AppError.internal());
  }
};

export const loginChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw AppError.badRequest('Please enter your email and password.', 'MISSING_FIELDS');
    }

    if (!EMAIL_REGEX.test(email)) {
      throw AppError.badRequest('Please enter a valid email address.', 'INVALID_EMAIL');
    }

    const normalizedEmail = email.toLowerCase().trim();
    // Password is sent plain over the HTTPS-encrypted wire; bcrypt is the security gate.
    const { valid, status } = await authService.verifyPasswordOnly(normalizedEmail, password);
    if (!valid) {
      auditFromRequest(req, 'auth.login_failed', { meta: { email: normalizedEmail, reason: 'invalid_credentials' } });
      throw AppError.unauthorized('Incorrect email or password. Please check your credentials and try again.', 'INVALID_CREDENTIALS');
    }

    // Reject suspended accounts immediately — before any challenge or token is issued.
    if (status === 'suspended') {
      auditFromRequest(req, 'auth.login_failed', { meta: { email: normalizedEmail, reason: 'account_suspended' } });
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Account suspended. Contact support.', true);
    }

    const challengeCode = randomInt(100000, 1000000).toString();
    const challengeId = 'ch_' + randomUUID();
    const redisKey = `login-challenge:${email.toLowerCase().trim()}`;

    const challengeValue = { email: email.toLowerCase().trim(), code: challengeCode };
    const redisClient = getRedisClient();
    let storedInRedis = false;

    // Try Redis first, but NEVER let a Redis error (e.g. Upstash over-quota,
    // connection drop) fail the login — fall back to the in-memory cache.
    if (getRedisStatus() === 'connected' && redisClient) {
      try {
        await redisClient.set(redisKey, JSON.stringify(challengeValue), 'EX', 60);
        storedInRedis = true;
      } catch (redisErr: any) {
        logger.warn('Login challenge Redis store failed; using in-memory fallback.', { message: redisErr?.message });
      }
    }
    if (!storedInRedis) {
      challengeMemoryCache.set(redisKey, {
        payload: challengeValue,
        expiresAt: Date.now() + 60000,
      });
    }

    res.json({
      success: true,
      data: {
        challengeId,
        code: challengeCode,
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error('Login challenge error', { message: error?.message, stack: error?.stack });

    if (error?.message === 'Invalid credentials') {
      return next(AppError.unauthorized(
        'Incorrect email or password. Please check your credentials and try again.',
        'INVALID_CREDENTIALS',
      ));
    }

    if (isDatabaseUnavailableError(error)) {
      return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'Our servers are temporarily unavailable. Please try again in a moment.', false));
    }

    next(AppError.unauthorized('Incorrect email or password. Please check your credentials and try again.', 'LOGIN_FAILED'));
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input: LoginInput & { challengeCode?: string } = req.body;

    if (!input.email) {
      throw AppError.badRequest('Please enter your email.', 'MISSING_FIELDS');
    }

    if (!EMAIL_REGEX.test(input.email)) {
      throw AppError.badRequest('Please enter a valid email address.', 'INVALID_EMAIL');
    }

    let userRecord;
    let tokens;

    if (input.challengeCode) {
      const redisKey = `login-challenge:${input.email.toLowerCase().trim()}`;
      let challenge: any = null;

      const redisClient = getRedisClient();

      // Try Redis, but tolerate Redis errors (over-quota / connection drop).
      if (getRedisStatus() === 'connected' && redisClient) {
        try {
          const raw = await redisClient.get(redisKey);
          if (raw) {
            challenge = JSON.parse(raw);
            await redisClient.del(redisKey).catch(() => {});
          }
        } catch (redisErr: any) {
          logger.warn('Login challenge Redis read failed; falling back to memory.', { message: redisErr?.message });
        }
      }
      // Fall back to the in-memory cache when Redis missed/errored — this is where
      // the challenge lives if the store above fell back (single-instance prod).
      if (!challenge) {
        const cached = challengeMemoryCache.get(redisKey);
        if (cached && cached.expiresAt > Date.now()) {
          challenge = cached.payload;
        }
        challengeMemoryCache.delete(redisKey);
      }

      if (!challenge || challenge.code !== input.challengeCode) {
        auditFromRequest(req, 'auth.login_failed', { meta: { email: input.email.toLowerCase().trim(), reason: 'challenge_invalid' } });
        throw AppError.unauthorized('Invalid or expired login challenge code. Please try again.', 'CHALLENGE_INVALID');
      }

      userRecord = await prisma.user.findUnique({
        where: { email: input.email.toLowerCase().trim() },
      });

      if (!userRecord) {
        throw AppError.unauthorized('Invalid credentials');
      }

      // Defense in depth: reject suspended accounts at token issuance too.
      if ((userRecord as any).status === 'suspended') {
        auditFromRequest(req, 'auth.login_failed', { meta: { email: input.email.toLowerCase().trim(), reason: 'account_suspended' } });
        throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Account suspended. Contact support.', true);
      }

      tokens = generateTokens(userRecord);
    } else {
      if (!input.password) {
        throw AppError.badRequest('Please enter your password.', 'MISSING_FIELDS');
      }
      tokens = await authService.login({
        email: input.email.toLowerCase().trim(),
        password: input.password,
      });
      userRecord = tokens.user;
    }

    // Check device trust if deviceId provided
    const deviceId = req.body.deviceId as string | undefined;
    let deviceCheck: Awaited<ReturnType<typeof checkDeviceTrust>> | null = null;
    const userId = input.challengeCode ? userRecord.id : tokens.user?.id;
    if (deviceId && userId) {
      deviceCheck = await checkDeviceTrust(userId, deviceId);
    }

    res.setHeader('Authorization', `Bearer ${tokens.accessToken}`);

    // Web (same-origin): refresh token via HttpOnly cookie only — unreadable by
    // JS (XSS-safe). Native (cross-origin Capacitor): also in the body for
    // device storage, since the cross-site cookie is unreliable there.
    setRefreshCookie(res, tokens.refreshToken, REFRESH_TOKEN_TTL_SECONDS);
    const native = isNativeClient(req);

    // Start (or reset) the server-side inactivity window for this session.
    if (userId) await establishIdleSession(userId);

    // Immutable audit record of the successful login (requestId/IP/UA auto-filled).
    if (userId) auditFromRequest(req, 'auth.login', { userId, resource: 'User', resourceId: userId });

    // Security: alert the configured owner address whenever a protected role
    // account (admin/manager/advisor/user) signs in. Best-effort, never blocks login.
    if (userRecord?.email && isProtectedAccount(userRecord.email)) {
      const alertTo = process.env.SECURITY_ALERT_EMAIL || 'shaik.job.details@gmail.com';
      const fwd = req.headers['x-forwarded-for'];
      const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.ip || 'unknown';
      void sendLoginAlertEmail({
        to: alertTo,
        role: userRecord.role,
        email: userRecord.email,
        name: userRecord.name,
        ip,
        userAgent: req.headers['user-agent'],
      }).catch((e: any) => logger.warn('[login-alert] send failed (non-fatal)', { message: e?.message }));
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken: tokens.accessToken,
        ...(native ? { refreshToken: tokens.refreshToken } : {}),
        expiresAt: tokens.expiresAt,
        user: input.challengeCode ? {
          id: userRecord.id,
          email: userRecord.email,
          name: userRecord.name,
          role: userRecord.role,
          isApproved: userRecord.isApproved,
        } : tokens.user,
        device: deviceCheck ? {
          isKnown: deviceCheck.isKnown,
          isTrusted: deviceCheck.isTrusted,
          requiresOtp: deviceCheck.requiresOtp,
        } : undefined,
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error('Login error', { message: error?.message, stack: error?.stack });

    // Direct-path (legacy password) failures from authService.login. The challenge
    // path audits at its throw sites; AppError instances already returned above, so
    // these are the only un-audited login failures.
    if (error?.message === 'Account suspended') {
      auditFromRequest(req, 'auth.login_failed', { meta: { email: req.body?.email, reason: 'account_suspended' } });
      return next(new AppError(403, 'ACCOUNT_SUSPENDED', 'Account suspended. Contact support.', true));
    }

    if (error?.message === 'Invalid credentials') {
      auditFromRequest(req, 'auth.login_failed', { meta: { email: req.body?.email, reason: 'invalid_credentials' } });
      return next(AppError.unauthorized(
        'Incorrect email or password. Please check your credentials and try again.',
        'INVALID_CREDENTIALS',
      ));
    }

    if (isDatabaseUnavailableError(error)) {
      return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'Our servers are temporarily unavailable. Please try again in a moment.', false));
    }

    next(AppError.unauthorized('Incorrect email or password. Please check your credentials and try again.', 'LOGIN_FAILED'));
  }
};

// Token refresh — exchange a valid refresh token for a fresh access + refresh
// token pair. Public (no access token required); the refresh token is the
// credential. Profile/data endpoints never mint tokens — only login/register
// and this endpoint do.
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Preference order: HttpOnly cookie (most secure) → header → body.
    // The cookie path is what new clients use; header/body remain for
    // backward-compat with clients that have not migrated yet.
    const cookieToken = readRefreshCookie(req) || '';
    const headerToken = (req.headers['x-refresh-token'] as string | undefined) || '';
    const bodyToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
    const token = (cookieToken || headerToken || bodyToken || '').trim();

    if (!token) {
      throw AppError.unauthorized('Refresh token is required.', 'REFRESH_TOKEN_MISSING');
    }

    let claims: ReturnType<typeof verifyRefreshToken>;
    try {
      claims = verifyRefreshToken(token);
    } catch {
      throw AppError.unauthorized('Your session has expired. Please sign in again.', 'REFRESH_TOKEN_INVALID');
    }

    // Re-load the user so role / approval / suspension changes take effect on refresh.
    const user = await prisma.user.findUnique({ where: { id: claims.userId } });
    if (!user) {
      throw AppError.unauthorized('Account no longer exists. Please sign in again.', 'USER_NOT_FOUND');
    }
    if ((user as any).status === 'suspended') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Account suspended. Contact support.', true);
    }

    // SESSION POLICY: seamless sessions. A valid (un-expired) refresh token is
    // honoured for its full lifetime (REFRESH_TOKEN_TTL_SECONDS), regardless of
    // how long the client has been idle — so a user returning after a long break
    // is silently re-issued an access token instead of being bounced to /login.
    //
    // We deliberately do NOT gate refresh on the idle-session marker here.
    // Trade-off: this drops the "stolen refresh token can't be replayed after the
    // idle window" protection.
    //
    // IMPORTANT: refresh tokens are STATELESS JWTs — they are NOT tracked server-side
    // and CANNOT be individually revoked. Logout clears the (web) HttpOnly cookie and
    // the in-memory session/PIN state, but a captured refresh token stays valid until
    // its 7-day expiry. The only hard session boundaries are that expiry and the
    // cookie clear. DB-backed refresh-token tracking/revocation is a deferred
    // architecture-phase item (see the currently-unused RefreshToken model).

    // Rotate: issue a brand-new access + refresh pair.
    const tokens = generateTokens(user);
    res.setHeader('Authorization', `Bearer ${tokens.accessToken}`);

    // Rotate the HttpOnly cookie (web). The rotated refresh token is exposed to
    // JS only for native clients (in the body) that can't use the cookie.
    setRefreshCookie(res, tokens.refreshToken, REFRESH_TOKEN_TTL_SECONDS);
    const native = isNativeClient(req);

    // Refresh counts as activity — slide the inactivity window forward.
    await establishIdleSession(user.id);

    res.json({
      success: true,
      message: 'Token refreshed',
      data: {
        accessToken: tokens.accessToken,
        ...(native ? { refreshToken: tokens.refreshToken } : {}),
        expiresAt: tokens.expiresAt,
        user: tokens.user,
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return next(error);
    }
    if (isDatabaseUnavailableError(error)) {
      return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'Our servers are temporarily unavailable. Please try again in a moment.', false));
    }
    logger.error('Token refresh error', { message: error?.message, stack: error?.stack });
    return next(AppError.unauthorized('Could not refresh your session. Please sign in again.', 'REFRESH_FAILED'));
  }
};

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  logger.info(`[AuthController] Get Profile requested for userId: ${req.userId}`);
  try {
    if (!req.userId) {
      logger.warn('[AuthController] Get Profile failed: Unauthorized (no userId in request)');
      return next(AppError.unauthorized());
    }

    const includePrivate = req.query.includePrivate === 'true' || req.query.includePrivate === '1';
    // PRIVACY: private profile fields require a live server-side PIN unlock, not
    // just a query param. Before unlock, a PII-stripped payload is returned.
    const pinUnlocked = await isPinUnlocked(req.userId);
    // Cache key varies by unlock state so a pre-PIN payload is never served after unlock.
    const lockSuffix = pinUnlocked ? '' : ':locked';
    const profileCacheKey = (includePrivate ? `profile:private:${req.userId}` : `profile:${req.userId}`) + lockSuffix;
    const cachedProfile = await cacheGetJson<any>(profileCacheKey);
    if (cachedProfile) {
      logger.info(`[AuthController] Profile cache hit for key: ${profileCacheKey}`);
      return res.json({
        success: true,
        data: cachedProfile,
      });
    }

    const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        }),
      ]);
    };

    logger.info(`[AuthController] Profile cache miss. Triggering database lookups for userId: ${req.userId}`);
    const [userRes, profileRes, settingsRes, pinRes] = await Promise.allSettled([
      withTimeout(authService.getUser(req.userId), 5000, 'User profile lookup'),
      withTimeout(prisma.profiles.findUnique({ where: { id: req.userId } }), 5000, 'Profiles lookup'),
      withTimeout(prisma.userSettings.findUnique({ where: { userId: req.userId } }), 5000, 'UserSettings lookup'),
      withTimeout(prisma.userPin.findUnique({ where: { userId: req.userId } }), 5000, 'UserPin lookup')
    ]);

    const userResult = userRes;
    const profileResult = profileRes;
    const settingsResult = settingsRes;
    const pinResult = pinRes;

    logger.info(`[AuthController] Database lookup settled for userId: ${req.userId}. User: ${userRes.status}, Profiles: ${profileRes.status}, Settings: ${settingsRes.status}, PIN: ${pinRes.status}`);

    if (userRes.status === 'rejected') {
      const err = userRes.reason;
      if (err?.message !== 'User not found') {
        logger.warn('Get profile user lookup failed, falling back to auth snapshot.', {
          message: err?.message,
          userId: req.userId,
        });
      }
    }

    if (profileRes.status === 'rejected') {
      const err = profileRes.reason;
      logger.warn('Get profile profiles lookup failed, falling back to auth snapshot.', {
        message: err?.message,
        userId: req.userId,
        databaseUnavailable: isDatabaseUnavailableError(err),
      });
    }

    if (settingsRes.status === 'rejected') {
      const err = settingsRes.reason;
      logger.warn('Get profile settings lookup failed.', {
        message: err?.message,
        userId: req.userId,
      });
    }

    if (pinRes.status === 'rejected') {
      const err = pinRes.reason;
      logger.warn('Get profile pin lookup failed.', {
        message: err?.message,
        userId: req.userId,
      });
    }

    const userRecord = userResult.status === 'fulfilled' ? (userResult.value as Record<string, any>) : null;
    const profileRecord = profileResult.status === 'fulfilled' ? (profileResult.value as Record<string, any>) : null;
    const settingsRecord = settingsResult.status === 'fulfilled' ? (settingsResult.value as Record<string, any>) : null;
    const pinRecord = pinResult.status === 'fulfilled' ? (pinResult.value as Record<string, any>) : null;

    const payload = buildProfilePayload(req.userId, req.user, userRecord, profileRecord, settingsRecord, includePrivate, pinRecord, pinUnlocked);
    await cacheSetJson(profileCacheKey, payload, 30); // Cache for 30 seconds

    res.json({
      success: true,
      data: payload,
    });
  } catch (error: any) {
    // BUG FIX #3: Even if everything fails, return 200 with auth snapshot instead of 500
    logger.error('Get profile critical error:', {
      message: error?.message || 'Unknown error',
      userId: req.userId
    });
    const includePrivate = req.query.includePrivate === 'true' || req.query.includePrivate === '1';
    const pinUnlocked = await isPinUnlocked(req.userId || '').catch(() => true);
    res.json({
      success: true,
      data: buildProfilePayload(req.userId || '', req.user, null, null, null, includePrivate, null, pinUnlocked),
    });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  logger.info(`[AuthController] Update profile request received for userId: ${req.userId}`);
  try {
    if (!req.userId) {
      logger.warn('[AuthController] Update profile failed: Unauthorized (no userId in request)');
      return next(AppError.unauthorized());
    }

    const sanitizedData = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === 'string' ? sanitize(value) : value,
      ]),
    );
    // Log only the field NAMES, never values (PII hygiene).
    logger.info(`[AuthController] Profile update fields for userId: ${req.userId}: ${Object.keys(sanitizedData || {}).join(', ')}`);
    const user = await authService.updateProfile(req.userId, sanitizedData, req.user?.email);
    logger.info(`[AuthController] Profile updated in service for userId: ${req.userId}`);

    // Fetch fresh profile data, settings, and PIN to return consistent payload
    const [profile, settings, pin] = await Promise.all([
      prisma.profiles.findUnique({
        where: { id: req.userId },
      }),
      prisma.userSettings.findUnique({
        where: { userId: req.userId },
      }),
      prisma.userPin.findUnique({
        where: { userId: req.userId },
      }),
    ]);
    logger.info(`[AuthController] Fresh lookup for payload compilation settled for userId: ${req.userId}. Profiles exists: ${!!profile}, Settings exists: ${!!settings}, PIN exists: ${!!pin}`);

    // Invalidate Redis profile cache and memory user snapshot cache
    await cacheDeleteByPrefix(`profile:${req.userId}`);
    await cacheDeleteByPrefix(`profile:private:${req.userId}`);
    invalidateUserSnapshotCache(req.userId);
    logger.info(`[AuthController] Cleared profile caches for userId: ${req.userId}`);

    const includePrivate = req.query.includePrivate === 'true' || req.query.includePrivate === '1' || true;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: buildProfilePayload(req.userId, req.user, user, profile, settings, includePrivate, pin),
    });
  } catch (error: any) {
    logger.error('Update profile error:', {
      message: error.message,
      stack: error.stack,
      userId: req.userId
    });
    if (error.message === 'Phone number already in use') {
      return next(AppError.conflict(
        'This phone number is already registered to another account. Please use a different phone number.',
        'PHONE_EXISTS'
      ));
    }
    if (error.message === 'Email already in use') {
      return next(AppError.conflict(
        'An account with this email already exists. Please use a different email.',
        'EMAIL_EXISTS'
      ));
    }
    return next(error);
  }
};

//  OTP Endpoints 

export const sendOtp = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const result = await generateOtp(req.userId);
    const status = result.success ? 200 : 429;
    res.status(status).json({ success: result.success, message: result.message, expiresAt: result.expiresAt });
  } catch (error) {
    next(error);
  }
};

export const verifyOtpEndpoint = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const { code, deviceId, deviceName, platform, appVersion } = req.body;
    if (!code || typeof code !== 'string') {
      throw AppError.badRequest('Verification code is required.', 'OTP_REQUIRED');
    }

    const result = await verifyOtp(req.userId, code);
    if (!result.success) {
      throw AppError.badRequest(result.message || 'Invalid or expired verification code.', 'OTP_INVALID');
    }

    if (deviceId && typeof deviceId === 'string') {
      await trustDevice(req.userId, deviceId, { deviceName, platform, appVersion });
    }

    res.json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
};

//  Device Management Endpoints 

export const getDevices = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const devices = await listUserDevices(req.userId);
    res.json({ success: true, data: devices });
  } catch (error) {
    next(error);
  }
};

export const revokeDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const { deviceId } = req.params;
    if (!deviceId) throw AppError.badRequest('Device ID is required.', 'DEVICE_ID_REQUIRED');
    await revokeDeviceTrust(req.userId, deviceId);
    res.json({ success: true, message: 'Device trust revoked' });
  } catch (error) {
    next(error);
  }
};

//  Logout

/**
 * POST /api/v1/auth/logout
 *
 * Clears the HttpOnly refresh cookie and best-effort revokes the
 * presented refresh token from the DB so it cannot be replayed. Always
 * returns 200 — logout must never fail the client.
 */
export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cookieToken = readRefreshCookie(req) || '';
    const headerToken = (req.headers['x-refresh-token'] as string | undefined) || '';
    const token = (cookieToken || headerToken).trim();

    // No-op today: refresh tokens are stateless JWTs and are not persisted, so there
    // is nothing to delete (the RefreshToken table is unused). Kept forward-compatible
    // so that, once DB-backed token tracking lands, logout already revokes the row.
    // Logout's real effect now is clearing the cookie + in-memory session/PIN below.
    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } }).catch(() => null);
    }
    if (req.userId) {
      invalidateUserSnapshotCache(req.userId);
      await clearIdleSession(req.userId);
      await clearPinUnlock(req.userId); // re-lock financial endpoints on logout
    }

    clearRefreshCookie(res);
    auditFromRequest(req, 'auth.logout');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    // Even on error, clear the cookie and report success.
    clearRefreshCookie(res);
    res.json({ success: true, message: 'Logged out' });
    void next;
  }
};

//  Account Deletion

export const deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();

    logger.info(`[AuthController] Account deletion request for userId: ${req.userId}`);
    await authService.deleteAccount(req.userId);

    // Clear the refresh cookie — the account is gone.
    clearRefreshCookie(res);

    res.json({
      success: true,
      message: 'Account deleted successfully. All your data has been permanently removed.',
    });
  } catch (error: any) {
    logger.error('[AuthController] Account deletion error:', {
      message: error?.message,
      stack: error?.stack,
      userId: req.userId,
    });
    return next(error instanceof AppError ? error : AppError.internal());
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) {
      throw AppError.badRequest('Email is required.', 'EMAIL_REQUIRED');
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Return 200 with generic success to prevent user enumeration
      return res.json({
        success: true,
        message: 'If a matching account is found, an OTP code will be sent to your email.',
      });
    }

    const result = await otpService.sendOtp(
      email.toLowerCase().trim(),
      'reset_password',
      'email',
      user.id,
      req.ip || undefined,
      req.headers['user-agent'] || undefined
    );

    if (!result.success) {
      return res.status(429).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      throw AppError.badRequest('Email, OTP, and new password are required.', 'MISSING_FIELDS');
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      throw AppError.notFound('Account not found.', 'USER_NOT_FOUND');
    }

    // Two-step check: Look for a recently verified OTP first (status: 'VERIFIED')
    const otpRecord = await prisma.otpRequest.findFirst({
      where: {
        destination: email.toLowerCase().trim(),
        purpose: 'reset_password',
        status: 'VERIFIED',
        verifiedAt: {
          gte: new Date(Date.now() - 10 * 60 * 1000) // within last 10 minutes
        }
      },
      orderBy: { verifiedAt: 'desc' }
    });

    let otpIsValid = false;
    if (otpRecord) {
      const isValid = otpService.verifyHash(otp, otpRecord.otpHash);
      if (isValid) {
        otpIsValid = true;
        // Invalidate it so it cannot be used again
        await prisma.otpRequest.update({
          where: { id: otpRecord.id },
          data: { status: 'EXPIRED' }
        });
      }
    }

    if (!otpIsValid) {
      // Fallback: direct flow verify & reset in one go
      const otpVerify = await otpService.verifyOtp(email.toLowerCase().trim(), 'reset_password', otp);
      if (!otpVerify.success) {
        return res.status(400).json(otpVerify);
      }
    }

    // Hash the new password and update User table
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    // Invalidate user caches
    invalidateUserSnapshotCache(user.id);
    await clearIdleSession(user.id);
    await clearPinUnlock(user.id);

    logger.info(`[AuthController] Password reset successfully for userId: ${user.id}`);
    res.json({
      success: true,
      message: 'Your password has been successfully reset. Please sign in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

export const verifyResetCode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, verificationCode } = req.body;
    if (!email || !verificationCode) {
      throw AppError.badRequest('Email and verification code are required.', 'MISSING_FIELDS');
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Security: return generic success to prevent account enumeration, but do not verify
      return res.json({
        success: true,
        message: 'Verification code verified successfully.',
      });
    }

    const otpVerify = await otpService.verifyOtp(email.toLowerCase().trim(), 'reset_password', verificationCode);
    if (!otpVerify.success) {
      return res.status(400).json(otpVerify);
    }

    res.json({
      success: true,
      message: 'Verification code verified successfully.',
    });
  } catch (error) {
    next(error);
  }
};
