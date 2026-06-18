# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |
| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

Use this section to tell people how to report a vulnerability.

Tell them where to go, how often they can expect to get an update on a
reported vulnerability, what to expect if the vulnerability is accepted or
declined, etc.
# Security Skill Reference  KANAKU

> **Stack**: Supabase Auth  Custom JWT  Helmet  CORS  express-rate-limit  Zod  bcrypt  Prisma

**Last Updated:** May 11, 2026

---

## 1. Authentication Flow

### Dual-Path JWT Verification (`backend/src/middleware/auth.ts`)

The `authenticate` middleware uses a secure waterfall approach:

1. **Custom JWT** (preferred  issued by our server)
2. **Supabase JWT** (fallback)
3. **Supabase REST API** verification (`/auth/v1/user`)
4. **Development bypass** (only when `NODE_ENV !== 'production'`)

> **Critical**: The dev bypass must never be reachable in staging or production.

**Token Management (Frontend)**:
- Access token  `localStorage.accessToken`
- Refresh token  `localStorage.refreshToken`
- All operations are centralized via `TokenManager` in `frontend/src/lib/api.ts`
- Automatic logout + redirect on 401 responses (unless valid Supabase session exists)

---

## 2. Password Security

- Passwords are hashed using **bcrypt** with cost factor **12+** in production.
- Never log, store, or return plain-text passwords.
- Password policy enforced on both frontend (Zod) and backend.

---

## 3. Security Headers (Helmet)

Helmet is mounted **first** in `app.ts`:

```ts
app.use(helmet());
This enables critical protections:

Content Security Policy (XSS protection)
Strict-Transport-Security (HSTS)
X-Frame-Options (Clickjacking)
X-Content-Type-Options, Referrer-Policy, etc.

Do not disable or override without security team approval.

4. CORS Configuration
TypeScriptapp.use(cors({
  origin: [process.env.FRONTEND_URL, 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

Never use origin: '*' when credentials: true.
Keep origin list minimal and environment-based.


5. Rate Limiting

Global Rate Limit: 100 requests / 15 minutes
Auth Rate Limit: 10 attempts / 15 minutes on login & register
Returns 429 Too Many Requests with RATE_LIMIT_EXCEEDED code.


6. Input Validation (Zod)
Backend: All mutating routes must use:
TypeScriptrouter.post('/', authenticate, validate(createTransactionSchema), controller);
Frontend: Validate with Zod before API calls.
Zod validation errors are sanitized in the global error handler (no leaking internal details).

7. Ownership & Authorization Checks
Mandatory Rule: Every user-scoped resource must be filtered by userId on the server.
TypeScript// Correct
await prisma.account.findFirst({
  where: { id: accountId, userId: req.userId }
});

//  Dangerous
await prisma.account.findUnique({ where: { id: accountId } });
Ownership checks are enforced at the service layer.

8. Secrets Management



































SecretLocationExposureJWT_SECRETBackend .envServer onlySUPABASE_SERVICE_KEYBackend .envServer onlySUPABASE_JWT_SECRETBackend .envServer onlyVITE_SUPABASE_ANON_KEYFrontendPublic (safe)VITE_SUPABASE_URLFrontendPublic (safe)
Rules:

Never commit .env files.
Use .env.example with placeholders.
Rotate JWT_SECRET immediately if compromised.


9. Database Security

Prisma parameterized queries (safe by default).
Use prisma.$queryRaw with tagged templates only.
Supabase RLS (Row Level Security) must be enabled on all user tables.
Never use prisma.$queryRawUnsafe().


10. XSS & Input Sanitization

All user input is sanitized before storage (backend/src/utils/sanitize.ts).
- **AI Sanitization**: Raw OCR text and Voice transcripts are filtered for prompt injection patterns before being sent to LLMs.
- React automatically escapes output.
- Avoid dangerouslySetInnerHTML with user content.
- Helmet CSP provides defense-in-depth.


11. Mobile App Security (React Native / Flutter)

Implement Biometric Authentication (Face ID / Fingerprint)
Use secure storage:
iOS: Keychain
Android: Encrypted SharedPreferences / Keystore

Root/Jailbreak detection
Certificate Pinning
App integrity & tampering detection
Secure deep linking with validation


12. Security Checklist (Pre-Release)

 Helmet is the first middleware
 CORS origins are restricted
 Rate limiting active on auth routes
 All mutating endpoints use Zod validation
 All data routes have authenticate + ownership check
 Supabase RLS enabled
 No secrets in code or logs
 Bcrypt cost  12 in production
 Dev auth bypass disabled in prod
 Mobile biometric + secure storage implemented
 Security headers verified in production


For vulnerability reporting: Please email security@KANAKU.app

---

## 13. Serverless Security (Vercel)

- **Environment Variables**: Managed via Vercel dashboard; never included in code bundles or frontend logs.
- **Cold Starts**: Optimized via lazy module loading for `PrismaClient`, `SupabaseClient`, and `JWT_SECRET` to prevent initialization crashes.
- **Timeouts**: Functions are configured with a 30s maximum duration to prevent resource exhaustion from hanging AI calls.
- **Lazy Init**: All critical third-party connectors use the singleton-lazy-proxy pattern to ensure the server starts even if a dependency is momentarily unreachable.

