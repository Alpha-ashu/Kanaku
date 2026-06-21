import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import {
  register,
  login,
  loginChallenge,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  sendOtp,
  verifyOtpEndpoint,
  getDevices,
  revokeDevice,
  deleteAccount,
  checkEmailAvailability,
} from './auth.controller';
import { rateLimit } from '../../middleware/rateLimit';
import { validateBody } from '../../middleware/validate';
import { updateProfileSchema } from './auth.validation';

const router = Router();

// Rate limiting on auth endpoints - prevents brute-force attacks
// Default: 20 per minute per IP. Override via AUTH_RATE_LIMIT env var.
// 20 allows normal usage (register + wrong pwd + login + challenge) without locking out real users.
// For tighter production hardening, set AUTH_RATE_LIMIT=10 in Fly.io secrets.
const authLimiter = rateLimit({
  windowMs: 60_000,          // 1 minute
  max: Number(process.env.AUTH_RATE_LIMIT || 20),
  scope: 'auth-route',
  message: 'Too many authentication attempts. Please try again later.',
  keyGenerator: (req) => req.ip || 'unknown',
});

// Strict rate limiting for destructive operations
const destructiveLimiter = rateLimit({
  windowMs: 60_000,          // 1 minute
  max: 3,
  scope: 'destructive-route',
  message: 'Too many deletion attempts. Please wait before trying again.',
  keyGenerator: (req) => req.ip || 'unknown',
});

// Per-endpoint anti-brute-force limiters (stack on top of the baseline authLimiter).
// Defaults follow the auth spec and are env-tunable.

// Login: 5 password attempts / minute / IP. Applied to /login/challenge, where the
// password is actually verified (the brute-force surface); /login only exchanges a
// short-lived challenge code, so it stays on the baseline limiter.
const loginLimiter = rateLimit({
  windowMs: 60_000,          // 1 minute
  max: Number(process.env.LOGIN_RATE_LIMIT || 5),
  scope: 'auth-login',
  message: 'Too many login attempts. Please try again in a minute.',
  keyGenerator: (req) => req.ip || 'unknown',
});

// Refresh: 10 / minute / IP.
const refreshLimiter = rateLimit({
  windowMs: 60_000,          // 1 minute
  max: Number(process.env.REFRESH_RATE_LIMIT || 10),
  scope: 'auth-refresh',
  message: 'Too many token refreshes. Please slow down.',
  keyGenerator: (req) => req.ip || 'unknown',
});

// OTP: 5 / 10 minutes / IP.
const otpLimiter = rateLimit({
  windowMs: 10 * 60_000,     // 10 minutes
  max: Number(process.env.OTP_RATE_LIMIT || 5),
  scope: 'auth-otp',
  message: 'Too many OTP requests. Please try again later.',
  keyGenerator: (req) => req.ip || 'unknown',
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,     // 1 hour
  max: Number(process.env.REGISTER_RATE_LIMIT || 10), // per IP; lenient enough for shared/NAT
  scope: 'auth-register',
  message: 'Too many sign-up attempts from this network. Please try again later.',
  keyGenerator: (req) => req.ip || 'unknown',
});

router.post('/check-email', authLimiter, checkEmailAvailability);
// NOTE: register/login/challenge keep their hardened in-controller validation
// (EMAIL_REGEX, password length, MISSING_FIELDS codes) which the test suite
// asserts on — do not front them with a generic validateBody layer.
router.post('/register', authLimiter, registerLimiter, register);
router.post('/login/challenge', authLimiter, loginLimiter, loginChallenge);
router.post('/login', authLimiter, login);
// Token refresh — public (refresh token is the credential), rate-limited (10/min).
router.post('/refresh', refreshLimiter, refreshToken);
// Logout — clears the HttpOnly refresh cookie and revokes the token.
// Auth-optional: a user with an expired access token can still log out.
router.post('/logout', logout);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, validateBody(updateProfileSchema), updateProfile);

// OTP routes (authenticated - user must have valid JWT) — 5 requests / 10 min / IP.
router.post('/otp/send', otpLimiter, authMiddleware, sendOtp);
router.post('/otp/verify', otpLimiter, authMiddleware, verifyOtpEndpoint);

// Device management routes
router.get('/devices', authMiddleware, getDevices);
router.delete('/devices/:deviceId', authMiddleware, revokeDevice);

// Account deletion — requires authentication + extra rate limiting
router.delete('/account', authMiddleware, destructiveLimiter, deleteAccount);

export { router as authRoutes };
