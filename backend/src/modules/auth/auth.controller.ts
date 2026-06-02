import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { RegisterInput, LoginInput } from './auth.types';
import { AuthRequest } from '../../middleware/auth';
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
) => {
  const fallbackName = authUser?.name || '';
  const fallbackNameParts = fallbackName.trim().split(/\s+/).filter(Boolean);

  const firstName =
    userRecord?.firstName ||
    profileRecord?.first_name ||
    fallbackNameParts[0] ||
    '';
  const lastName =
    userRecord?.lastName ||
    profileRecord?.last_name ||
    fallbackNameParts.slice(1).join(' ') ||
    '';
  const monthlyIncome = profileRecord?.monthly_income != null
    ? toNumber(profileRecord.monthly_income, 0)
    : (userRecord?.salary != null ? Math.round(toNumber(userRecord.salary, 0) / 12) : 0);

  return {
    id: userId,
    email: userRecord?.email || profileRecord?.email || authUser?.email || '',
    name:
      userRecord?.name ||
      profileRecord?.full_name ||
      `${firstName} ${lastName}`.trim() ||
      fallbackName,
    firstName,
    lastName,
    gender: userRecord?.gender || profileRecord?.gender || '',
    country: userRecord?.country || profileRecord?.country || '',
    state: userRecord?.state || profileRecord?.state || '',
    city: userRecord?.city || profileRecord?.city || '',
    salary:
      userRecord?.salary != null
        ? toNumber(userRecord.salary, 0)
        : (profileRecord?.annual_income != null
          ? toNumber(profileRecord.annual_income, monthlyIncome * 12)
          : monthlyIncome * 12),
    monthlyIncome,
    dateOfBirth: toIsoDateOnly(userRecord?.dateOfBirth || profileRecord?.date_of_birth),
    jobType: userRecord?.jobType || profileRecord?.job_type || '',
    role: userRecord?.role || authUser?.role || 'user',
    isApproved: userRecord?.isApproved ?? authUser?.isApproved ?? false,
    mobile: profileRecord?.phone || '',
    phone: profileRecord?.phone || '',
    avatarId: userRecord?.avatarId || profileRecord?.avatar_id || null,
    avatarUrl: profileRecord?.avatar_url || null,
  };
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

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: tokens,
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

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        ...tokens,
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
    let userResult: PromiseSettledResult<unknown> = { status: 'fulfilled', value: null };
    let profileResult: PromiseSettledResult<unknown> = { status: 'fulfilled', value: null };

    const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        }),
      ]);
    };

    try {
      const user = await withTimeout(authService.getUser(req.userId), 1500, 'User profile lookup');
      userResult = { status: 'fulfilled', value: user };
    } catch (err: any) {
      userResult = { status: 'rejected', reason: err };
      if (err?.message !== 'User not found') {
        logger.warn('Get profile user lookup failed, falling back to auth snapshot.', {
          message: err?.message,
          userId: req.userId,
        });
      }
    }

    try {
      const profile = await withTimeout(prisma.profiles.findUnique({
        where: { id: req.userId },
      }), 1500, 'Profiles lookup');
      profileResult = { status: 'fulfilled', value: profile };
    } catch (err: any) {
      profileResult = { status: 'rejected', reason: err };
      logger.warn('Get profile profiles lookup failed, falling back to auth snapshot.', {
        message: err?.message,
        userId: req.userId,
        databaseUnavailable: isDatabaseUnavailableError(err),
      });
    }

    const userRecord = userResult.status === 'fulfilled' ? (userResult.value as Record<string, any>) : null;
    const profileRecord = profileResult.status === 'fulfilled' ? (profileResult.value as Record<string, any>) : null;

    res.json({
      success: true,
      data: buildProfilePayload(req.userId, req.user, userRecord, profileRecord),
    });
  } catch (error: any) {
    // BUG FIX #3: Even if everything fails, return 200 with auth snapshot instead of 500
    logger.error('Get profile critical error:', {
      message: error?.message || 'Unknown error',
      userId: req.userId
    });
    res.json({
      success: true,
      data: buildProfilePayload(req.userId || '', req.user, null, null),
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

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        gender: user.gender,
        country: user.country,
        state: user.state,
        city: user.city,
        salary: user.salary,
        dateOfBirth: user.dateOfBirth,
        jobType: user.jobType,
      }
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
