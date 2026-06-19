# Registration & Auth Audit — 2026-06-19

**Scope:** Registration and login flow on the deployed app
(`kanaku-fawn.vercel.app`) — reported symptoms: "can't log in / register" and
"a duplicate email still creates a profile instead of being rejected."

**Tester:** Automated code audit + Vitest regression + typecheck.
**Environment note:** The live Supabase project and full local stack were **not**
exercised end-to-end in this session (doing so would create real accounts and
needs project secrets). UI E2E specs that need the live stack are recorded here
and are runnable via `npm run dev` + Playwright; their results are **not** claimed
as passed below. What *was* executed: Vitest unit tests and the TypeScript
type-check (both green).

---

## 1. How registration actually flows (verified from code)

The deployed build has no `VITE_AUTH_CANONICAL` override (`.env`, `.env.vercel`),
so it defaults to **Supabase Auth** (`AUTH_CANONICAL = 'supabase'`).

```
SignUpForm.handleSubmit
  → AuthFlow.handleSignUp                       (Supabase branch)
      → supabase-helpers.signUp()
          → supabase.auth.signUp({ email, password, options })   // Supabase Auth
  → on success: dispatch KANAKU_AUTH_CHANGE → App shows NewUserOnboarding
      → profile setup → salary/bank → PIN setup → dashboard
```

The custom backend path (`POST /api/v1/auth/register` → `AuthService.register`)
is **not** used by the live signup form; it is exercised only by the API E2E
suite and the in-form fallback. It already blocks duplicates correctly
(`Email already registered` → `409 EMAIL_EXISTS`). The bug was on the Supabase
path.

### Relevant endpoints (request → response shape, secrets redacted)

| Endpoint | Method | Request | Success | Duplicate |
|---|---|---|---|---|
| Supabase `/auth/v1/signup` | POST | `{ email, password, data:{ full_name, role } }` | `{ user:{ id, identities:[{...}] }, session }` | **confirmations ON:** `{ user:{ id, identities:[] }, session:null }` (NO error) · **OFF:** `error 422 user_already_exists` |
| `/api/v1/auth/check-email` | POST | `{ email }` | `{ available: true }` | `{ available: false }` |
| `/api/v1/auth/login/challenge` | POST | `{ email, password }` + `x-pw-encoding` | `{ success, data:{ challengeId, code } }` | `401 INVALID_CREDENTIALS` |
| `/api/v1/auth/login` | POST | `{ email, challengeCode }` | `{ success, data:{ accessToken:"<jwt>", refreshToken:"<jwt>", user } }` | `401` |
| `/api/v1/auth/register` (custom path) | POST | `{ name, email, password, ... }` | `201 { success, data:{ user } }` + `Authorization` header | `409 EMAIL_EXISTS` |

---

## 2. Root cause — duplicate email "succeeds"

`supabase.auth.signUp()` has two duplicate behaviours:

1. **Email confirmations OFF** → returns an explicit `error` (HTTP 422,
   `code: user_already_exists`).
2. **Email confirmations ON** (the live config) → **returns no error**. To prevent
   email enumeration, Supabase returns an *obfuscated* user whose `identities`
   array is **empty** and with `session: null`.

The old `signUp()` only did `if (error) throw error`. Case (2) therefore looked
like success: the form ran `setIsSuccess(true)` and showed **"Account Created
Successfully!"**, and `AuthFlow.handleSignUp` swallowed errors and returned
normally — so even when something *did* fail, the form still showed success.
That is precisely the reported "duplicate email still creates a profile" bug.

---

## 3. Fix applied

**`frontend/src/lib/supabase-helpers.ts`**
- Detect the obfuscated-duplicate response (`data.user.identities.length === 0`)
  and the explicit `422 / user_already_exists` error.
- In both cases throw an `Error` with `code = 'EMAIL_EXISTS'` carrying a single
  shared, generic, non-enumerable message (`DUPLICATE_ACCOUNT_MESSAGE`):
  > "We couldn't create your account with these details. If you already have an
  > account, please sign in — otherwise try a different email or phone number."

**`frontend/src/app/components/auth/AuthFlow.tsx`**
- Map duplicate email **and** duplicate phone to the same generic message.
- **Re-throw** from `handleSignUp`'s catch so the form halts and the success
  screen is never shown for a failed/duplicate signup.

**`frontend/src/app/components/auth/SignUpForm.tsx`**
- When a parent `onSubmit` is supplied, do not render a second inline error
  (the parent owns the toast) and never fall through to `setIsSuccess(true)`.
- Direct-register fallback now also uses the generic message for
  `EMAIL_EXISTS` / `PHONE_EXISTS`.

**Why generic:** the message never confirms *which* detail is taken and is not a
machine-readable "already exists" string, satisfying the "don't hand attackers
enumeration info" requirement while still guiding a real user to sign in.

---

## 4. Tests

| Test | Type | Status |
|---|---|---|
| `frontend/src/lib/supabase-helpers.test.ts` (5 cases) | Vitest unit | ✅ 5 passed |
| `frontend` `tsc --noEmit` | Type-check | ✅ passed |
| `quality/e2e/auth-duplicate-registration.spec.ts` | UI E2E (Playwright) | ⏳ recorded; needs live stack (`npm run dev`) |
| `quality/e2e/simultaneous-validation.spec.ts` | UI+API+DB E2E | ⏳ needs live stack; logs every `/auth` + `/pin` request/response |

New unit test asserts: new user resolves; obfuscated duplicate throws
`EMAIL_EXISTS`; explicit 422 duplicate throws `EMAIL_EXISTS`; message is generic
(no "already registered/exists"); unrelated errors re-throw unchanged.

---

## 5. Additional findings (logged for decision — NOT auto-changed)

These are real but are design trade-offs or carry regression risk, so they are
recorded rather than silently changed:

- **F1 — `check-email` is an enumeration oracle (low/med).** `POST
  /api/v1/auth/check-email` returns `{ available: false }` for existing emails,
  and `SignUpForm` shows "This email is already registered" inline. This directly
  contradicts the "no enumeration" goal but is also a real UX affordance.
  *Recommendation:* gate behind rate-limiting + captcha, or drop the inline
  "already registered" wording in favour of the generic message.
- **F2 — `check-email` queries `prisma.user`, not Supabase Auth (med).** A
  Supabase-only account (created but profile not yet synced) has no `prisma.user`
  row, so `check-email` can answer `available: true` for an email that actually
  exists in Supabase Auth. The signup guard (this fix) is the reliable gate; the
  inline check is best-effort only.
- **F3 — duplicate **phone** during onboarding is swallowed (med).**
  `AuthFlow.handleSalarySetupComplete` calls `api.auth.updateProfile` in a
  try/catch that only `warn`s, so a `PHONE_EXISTS` 409 does not surface to the
  user and onboarding proceeds. *Recommendation:* surface the generic message and
  let the user correct the phone.
- **F4 — Supabase email-confirmation vs. login (med/high).** If confirmations are
  ON, a brand-new signup has `session: null` until the email is confirmed, and
  `signInWithPassword` fails with "Email not confirmed" — a plausible cause of the
  "can't log in" symptom. *Decision needed:* either turn confirmations OFF for
  this product, or add an explicit "check your email to confirm" screen instead
  of routing straight to onboarding.

---

## 6. Token / input handling (spot-check)

- Login password is SHA-256 pre-hashed client-side before transit
  (`api.auth.login`), with a plain-text fallback for legacy accounts.
- Refresh token is delivered as an **HttpOnly cookie** (header retained for
  backward-compat); access token in `Authorization` header.
- Register/login responses do not leak stack traces; controller maps known
  errors to safe messages. Inputs are sanitized server-side (`sanitize()`), email
  validated against `EMAIL_REGEX`, password strength enforced.
- ⚠️ The login **challenge endpoint returns the OTP `code` in the response body**
  (`/auth/login/challenge` → `data.code`) and the client echoes it to `/auth/login`.
  This is a known item in the security memory (challenge code leak) — out of scope
  for this fix, re-logged here for visibility.
