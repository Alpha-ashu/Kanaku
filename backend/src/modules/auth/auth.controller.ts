import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { RegisterInput, LoginInput } from './auth.types';
import { AuthRequest, invalidateUserSnapshotCache } from '../../middleware/auth';
import { cacheGetJson, cacheSetJson, cacheDeleteByPrefix } from '../../cache/redis';
import { sanitize } from '../../utils/sanitize';
import { logger } from '../../config/logger';
import { generateOtp, verifyOtp } from './otp.service';
import { checkDeviceTrust, trustDevice, revokeDeviceTrust, listUserDevices } from './device.service';
import { prisma } from '../../db/prisma';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { AppError } from '../../utils/AppError';

const authService = new AuthService();

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
) => {
  const fallbackName = authUser?.name || '';
  const fallbackNameParts = fallbackName.trim().split(/\s+/).filter(Boolean);

  const firstName =
    profileRecord?.first_name ||
    userRecord?.firstName ||
    fallbackNameParts[0] ||
    '';
  const lastName =
    profileRecord?.last_name ||
    userRecord?.lastName ||
    fallbackNameParts.slice(1).join(' ') ||
    '';
  const monthlyIncome = profileRecord?.monthly_income != null
    ? toNumber(profileRecord.monthly_income, 0)
    : (userRecord?.salary != null ? Math.round(toNumber(userRecord.salary, 0) / 12) : 0);

  const salary =
    userRecord?.salary != null
      ? toNumber(userRecord.salary, 0)
      : (profileRecord?.annual_income != null
        ? toNumber(profileRecord.annual_income, monthlyIncome * 12)
        : monthlyIncome * 12);
  const dateOfBirth = toIsoDateOnly(profileRecord?.date_of_birth || userRecord?.dateOfBirth);
  const jobType = profileRecord?.job_type || userRecord?.jobType || '';
  const role = userRecord?.role || authUser?.role || 'user';

  const payload: Record<string, any> = {
    id: userId,
    email: userRecord?.email || profileRecord?.email || authUser?.email || '',
    name:
      profileRecord?.full_name ||
      userRecord?.name ||
      `${firstName} ${lastName}`.trim() ||
      fallbackName,
    firstName,
    lastName,
    gender: profileRecord?.gender || userRecord?.gender || '',
    country: profileRecord?.country || userRecord?.country || '',
    state: profileRecord?.state || userRecord?.state || '',
    city: profileRecord?.city || userRecord?.city || '',
    isApproved: userRecord?.isApproved ?? authUser?.isApproved ?? false,
    mobile: profileRecord?.phone || '',
    phone: profileRecord?.phone || '',
    avatarId: profileRecord?.avatar_id || userRecord?.avatarId || null,
    avatarUrl: profileRecord?.avatar_url || null,
    currency: settingsRecord?.currency || 'USD',
    language: settingsRecord?.language || 'en',
  };

  if (salary !== 0) {
    payload.salary = salary;
  }
  if (monthlyIncome !== 0) {
    payload.monthlyIncome = monthlyIncome;
  }
  if (dateOfBirth !== '') {
    payload.dateOfBirth = dateOfBirth;
  }
  if (jobType !== '') {
    payload.jobType = jobType;
  }
  if (role !== 'user') {
    payload.role = role;
  }

  return payload;
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input: RegisterInput = req.body;

    if (!input.email || !input.name || !input.password) {
      throw AppError.badRequest('Please fill in all required fields: email, name, and password.', 'MISSING_FIELDS');
    }

    if (!EMAIL_REGEX.test(input.email)) {
      throw AppError.badRequest('Please enter a valid email address.', 'INVALID_EMAIL');
    }

    if (input.password.length < 8) {
      throw AppError.badRequest('Your password must be at least 8 characters long.', 'PASSWORD_TOO_SHORT');
    }

    const sanitizedInput = {
      ...input,
      name: sanitize(input.name),
      email: input.email.toLowerCase().trim(),
    };

    const tokens = await authService.register(sanitizedInput);

    res.setHeader('Authorization', `Bearer ${tokens.accessToken}`);
    res.setHeader('x-refresh-token', tokens.refreshToken);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: tokens.user,
      },
    });
  } catch (error: any) {
    // Map known service errors to AppError before passing to next()
    if (
      error instanceof AppError
    ) {
      return next(error);
    }

    logger.error('Registration error', { message: error?.message, stack: error?.stack });

    if (
      error?.message?.includes('UNIQUE constraint failed') ||
      error?.message === 'Email already registered'
    ) {
      return next(AppError.conflict(
        'An account with this email already exists. Please sign in or use a different email.',
        'EMAIL_EXISTS',
      ));
    }

    if (isDatabaseUnavailableError(error)) {
      return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'Our servers are temporarily unavailable. Please try again in a moment.', false));
    }

    next(AppError.internal());
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input: LoginInput = req.body;

    if (!input.email || !input.password) {
      throw AppError.badRequest('Please enter your email and password.', 'MISSING_FIELDS');
    }

    if (!EMAIL_REGEX.test(input.email)) {
      throw AppError.badRequest('Please enter a valid email address.', 'INVALID_EMAIL');
    }

    const tokens = await authService.login({
      email: input.email.toLowerCase().trim(),
      password: input.password,
    });

    // Check device trust if deviceId provided
    const deviceId = req.body.deviceId as string | undefined;
    let deviceCheck: Awaited<ReturnType<typeof checkDeviceTrust>> | null = null;
    if (deviceId && tokens.user?.id) {
      deviceCheck = await checkDeviceTrust(tokens.user.id, deviceId);
    }

    res.setHeader('Authorization', `Bearer ${tokens.accessToken}`);
    res.setHeader('x-refresh-token', tokens.refreshToken);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: tokens.user,
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

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return next(AppError.unauthorized());
    }

    const profileCacheKey = `profile:${req.userId}`;
    const cachedProfile = await cacheGetJson<any>(profileCacheKey);
    if (cachedProfile) {
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

    const [userRes, profileRes, settingsRes] = await Promise.allSettled([
      withTimeout(authService.getUser(req.userId), 1500, 'User profile lookup'),
      withTimeout(prisma.profiles.findUnique({ where: { id: req.userId } }), 1500, 'Profiles lookup'),
      withTimeout(prisma.userSettings.findUnique({ where: { userId: req.userId } }), 1500, 'UserSettings lookup')
    ]);

    const userResult = userRes;
    const profileResult = profileRes;
    const settingsResult = settingsRes;

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

    const userRecord = userResult.status === 'fulfilled' ? (userResult.value as Record<string, any>) : null;
    const profileRecord = profileResult.status === 'fulfilled' ? (profileResult.value as Record<string, any>) : null;
    const settingsRecord = settingsResult.status === 'fulfilled' ? (settingsResult.value as Record<string, any>) : null;

    const payload = buildProfilePayload(req.userId, req.user, userRecord, profileRecord, settingsRecord);
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
    res.json({
      success: true,
      data: buildProfilePayload(req.userId || '', req.user, null, null, null),
    });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return next(AppError.unauthorized());
    }

    const sanitizedData = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === 'string' ? sanitize(value) : value,
      ]),
    );
    const user = await authService.updateProfile(req.userId, sanitizedData, req.user?.email);

    // Fetch fresh profile data and settings to return consistent payload
    const [profile, settings] = await Promise.all([
      prisma.profiles.findUnique({
        where: { id: req.userId },
      }),
      prisma.userSettings.findUnique({
        where: { userId: req.userId },
      }),
    ]);

    // Invalidate Redis profile cache and memory user snapshot cache
    const profileCacheKey = `profile:${req.userId}`;
    await cacheDeleteByPrefix(profileCacheKey);
    invalidateUserSnapshotCache(req.userId);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: buildProfilePayload(req.userId, req.user, user, profile, settings),
    });
  } catch (error: any) {
    logger.error('Update profile error:', {
      message: error.message,
      stack: error.stack,
      userId: req.userId
    });
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

//  Account Deletion 

export const deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();

    logger.info(`[AuthController] Account deletion request for userId: ${req.userId}`);
    await authService.deleteAccount(req.userId);

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
