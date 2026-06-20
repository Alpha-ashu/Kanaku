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

// Layered anti-brute-force limiters (stack on top of the per-minute authLimiter):
// a long-window cap on sustained attempts per IP, in addition to the burst cap.
// Defaults are env-tunable to the exact policy (e.g. login 5/15m, register 3/h).
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,     // 15 minutes
  max: Number(process.env.LOGIN_RATE_LIMIT || 15), // ≈ a handful of 2-step login attempts
  scope: 'auth-login',
  message: 'Too many login attempts. Please try again in a few minutes.',
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
router.post('/login', authLimiter, loginLimiter, login);
// Token refresh — public (refresh token is the credential), rate-limited.
router.post('/refresh', authLimiter, refreshToken);
// Logout — clears the HttpOnly refresh cookie and revokes the token.
// Auth-optional: a user with an expired access token can still log out.
router.post('/logout', logout);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, validateBody(updateProfileSchema), updateProfile);

// OTP routes (authenticated - user must have valid JWT)
router.post('/otp/send', authMiddleware, sendOtp);
router.post('/otp/verify', authMiddleware, verifyOtpEndpoint);

// Device management routes
router.get('/devices', authMiddleware, getDevices);
router.delete('/devices/:deviceId', authMiddleware, revokeDevice);

// Account deletion — requires authentication + extra rate limiting
router.delete('/account', authMiddleware, destructiveLimiter, deleteAccount);

export { router as authRoutes };
