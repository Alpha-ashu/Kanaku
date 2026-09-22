import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import {
  register,
  verifyRegistrationOtp,
  verifyLater,
  resendRegistrationOtp,
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
  checkPhoneAvailability,
  forgotPassword,
  resetPassword,
  verifyResetCode,
} from './auth.controller';
import { rateLimit, authenticatedRateLimit } from '../../middleware/rateLimit';
import type { Request } from 'express';
import { validateBody } from '../../middleware/validate';
import { updateProfileSchema, forgotPasswordSchema, resetPasswordSchema, verifyResetCodeSchema } from './auth.validation';

const router = Router();

// ── Auth throttling ──────────────────────────────────────────────────────────
//
// These limiters used to key on `req.ip` alone. That is wrong for this
// deployment, and it is why users reported being unable to register or log in,
// and saw "You are doing that too fast" on the mobile web app:
//
//   The browser build is served by Vercel, whose rewrite proxies /api/* to the
//   Render backend (see vercel.json). The backend therefore never sees the
//   browser's address — with `trust proxy` at 1 hop, `req.ip` resolves to the
//   VERCEL EDGE IP for every web request. Verified against express's own
//   resolution: XFF "203.0.113.9, 76.76.21.100" at trust=1 yields 76.76.21.100.
//
//   Authenticated traffic is unaffected because the global limiter keys on
//   `user:<id>` from the bearer token. But every endpoint below runs BEFORE the
//   user has a token, so the entire web user base shared one bucket: 20 auth
//   requests/min, 5 logins/min and 10 sign-ups/HOUR across all of them. A few
//   people signing in at once was enough to lock everyone else out.
//
//   Raising `trust proxy` to 2 is not a fix: native clients reach Render
//   directly, so a second trusted hop lets any caller spoof its own address via
//   X-Forwarded-For (also verified). The trusted-proxy list belongs in
//   deployment config — see TRUST_PROXY in app.ts — not in a hop count guessed
//   here.
//
// So the limiters key on the thing an attacker actually targets: the account.
// Per-identifier budgets stay as tight as before (a credential-stuffing run
// against one account still trips at 5 attempts/min, and rotating IPs no longer
// evades it — which the old per-IP scheme could not do). The IP bucket is kept
// as a coarse backstop, sized for what it really is: a shared edge proxy or a
// carrier NAT fronting many legitimate users.

/**
 * Bucket key for the credential-targeted limiters.
 *
 * Prefers the identifier in the request body, falling back to IP for requests
 * that carry none (e.g. /refresh, which authenticates with a cookie). Body
 * parsing and sanitisation both run in app.ts before the routers mount, so the
 * body is populated by the time this is called.
 */
const credentialKey = (req: Request): string => {
  const body = req.body as { email?: unknown; phone?: unknown } | undefined;

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email) return `email:${email}`;

  const phone = typeof body?.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
  if (phone) return `phone:${phone}`;

  return `ip:${req.ip || 'unknown'}`;
};

/** Per-identifier budget when we know the account, coarse IP backstop otherwise. */
const perIdentifier = (identifierMax: number, ipMax: number) => (key: string) =>
  key.startsWith('ip:') ? ipMax : identifierMax;

// Baseline for the auth surface: 20/min against a single account, with an IP
// ceiling that a shared Vercel edge or carrier NAT will not trip in normal use.
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: perIdentifier(
    Number(process.env.AUTH_RATE_LIMIT || 20),
    Number(process.env.AUTH_IP_RATE_LIMIT || 400),
  ),
  scope: 'auth-route',
  message: 'Too many authentication attempts. Please try again later.',
  keyGenerator: credentialKey,
});

// Account deletion is authenticated, so it can key on the user — 3 attempts per
// minute per ACCOUNT. Keyed by IP it was 3/min for every web user combined.
const destructiveLimiter = authenticatedRateLimit({
  windowMs: 60_000,
  max: 3,
  scope: 'destructive-route',
  message: 'Too many deletion attempts. Please wait before trying again.',
});

// Login: 5 password attempts / minute / ACCOUNT. Applied to /login/challenge,
// where the password is actually verified (the brute-force surface); /login only
// exchanges a short-lived challenge code, so it stays on the baseline limiter.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: perIdentifier(
    Number(process.env.LOGIN_RATE_LIMIT || 5),
    Number(process.env.LOGIN_IP_RATE_LIMIT || 100),
  ),
  scope: 'auth-login',
  message: 'Too many login attempts. Please try again in a minute.',
  keyGenerator: credentialKey,
});

// Refresh carries no identifier in the body (the refresh token is a cookie or a
// device-stored secret), so this one stays per-IP — and therefore needs a
// ceiling that suits a shared proxy address. An access token lasts 15 minutes,
// so honest clients refresh rarely; the old 10/min was a whole-userbase budget.
const refreshLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.REFRESH_RATE_LIMIT || 300),
  scope: 'auth-refresh',
  message: 'Too many token refreshes. Please slow down.',
  keyGenerator: (req) => req.ip || 'unknown',
});

// OTP: 5 per 10 minutes per ACCOUNT — the limit that matters, since OTP abuse
// targets one address. Sign-up is hard-gated on this mail, so an IP ceiling low
// enough to be shared across a proxy blocked real registrations.
const otpLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: perIdentifier(
    Number(process.env.OTP_RATE_LIMIT || 5),
    Number(process.env.OTP_IP_RATE_LIMIT || 200),
  ),
  scope: 'auth-otp',
  message: 'Too many OTP requests. Please try again later.',
  keyGenerator: credentialKey,
});

// Registration is the one case where the identifier is fresh every time, so the
// per-email budget only stops repeated attempts on the SAME address; the IP
// bucket does the rest. Mass account creation is already expensive because
// sign-up cannot complete without receiving an emailed OTP.
const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: perIdentifier(
    Number(process.env.REGISTER_EMAIL_RATE_LIMIT || 5),
    Number(process.env.REGISTER_RATE_LIMIT || 300),
  ),
  scope: 'auth-register',
  message: 'Too many sign-up attempts. Please try again later.',
  keyGenerator: credentialKey,
});

router.post('/check-email', authLimiter, checkEmailAvailability);
router.post('/check-phone', authLimiter, checkPhoneAvailability);
// NOTE: register/login/challenge keep their hardened in-controller validation
// (EMAIL_REGEX, password length, MISSING_FIELDS codes) which the test suite
// asserts on — do not front them with a generic validateBody layer.
router.post('/register', authLimiter, registerLimiter, register);
router.post('/verify-registration-otp', authLimiter, verifyRegistrationOtp);
router.post('/verify-later', authLimiter, verifyLater);
router.post('/resend-registration-otp', otpLimiter, resendRegistrationOtp);
router.post('/login/challenge', authLimiter, loginLimiter, loginChallenge);
router.post('/login', authLimiter, login);
// Token refresh — public (refresh token is the credential), rate-limited (10/min).
router.post('/refresh', refreshLimiter, refreshToken);
// Logout — clears the HttpOnly refresh cookie and revokes the token.
// Auth-optional: a user with an expired access token can still log out.
router.post('/logout', logout);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, validateBody(updateProfileSchema), updateProfile);

// Password Reset endpoints (public)
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post('/verify-reset-code', authLimiter, validateBody(verifyResetCodeSchema), verifyResetCode);
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), resetPassword);

// OTP routes (authenticated - user must have valid JWT) — 5 requests / 10 min / IP.
router.post('/otp/send', otpLimiter, authMiddleware, sendOtp);
router.post('/otp/verify', otpLimiter, authMiddleware, verifyOtpEndpoint);

// Device management routes
router.get('/devices', authMiddleware, getDevices);
router.delete('/devices/:deviceId', authMiddleware, revokeDevice);

// Account deletion — requires authentication + extra rate limiting
router.delete('/account', authMiddleware, destructiveLimiter, deleteAccount);

export { router as authRoutes };
