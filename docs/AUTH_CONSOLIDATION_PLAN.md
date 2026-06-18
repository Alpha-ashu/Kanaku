# Auth issuer consolidation — design & decision

> **Status: proposal — no code changed yet.** This is the design-first step for the
> highest-value remaining cleanup from the architecture overhaul. Pick a target
> (below) before implementation begins.

## Current state — a hybrid with two issuers

KANAKU authenticates users through **two parallel systems**:

| Concern | Custom JWT | Supabase Auth |
|---|---|---|
| Token issuance | `generateTokens` (HS256 / `JWT_SECRET`) via `/auth/login`, `/auth/register`, `/auth/refresh` | `supabase.auth.signInWithPassword` / session |
| Token verification | `authMiddleware` strategy 1 (`JWT_SECRET`) | `authMiddleware` strategy 2 (`SUPABASE_JWT_SECRET`) + strategy 3 (Supabase API `getUser`) |
| Refresh | `POST /auth/refresh` (custom, Phase 3) | `supabase.auth.refreshSession()` (used by the frontend 401-retry) |
| Password check | `bcrypt.compare` | `signInWithPassword` fallback for `supabase-managed-account` users (then migrates the hash local) |
| User kinds | local (bcrypt password) | `password === 'supabase-managed-account'` sentinel |

**Footprint:** ~33 Supabase-auth touchpoints across 11 backend files
(`middleware/auth.ts`, `modules/auth/auth.service.ts`, `pin`, `sockets`, `admin`,
`securityGate`, `utils/auth.ts`, …) and **63 `supabase.auth.*` calls across 16+
frontend files (`contexts/AuthContext`, `lib/api.ts`, `lib/auth-*`, auth screens).

### Why this is a problem
- **No single source of truth** for identity, session lifetime, or revocation.
- **Two refresh paths** (`/auth/refresh` vs `supabase.auth.refreshSession`) that can disagree.
- Larger **attack surface** and harder security reasoning (three verification strategies).
- The `supabase-managed-account` sentinel is a smell; password migration happens lazily on login.

## The two viable targets

### Option A — Supabase Auth as the single source of truth (recommended if you want managed auth)
Supabase issues and refreshes **all** tokens; the backend verifies the Supabase JWT
only; drop custom `generateTokens` / `/auth/login` / `/auth/refresh`; the frontend
uses `supabase.auth` exclusively (it already does, in 63 places).

- **Pros:** one mature auth system — MFA, OAuth, email verification, password reset all built-in (less custom security code to own); aligns with §9 (Supabase is already DB+Storage).
- **Cons:** must **migrate local (bcrypt) users into `auth.users`** (Supabase admin API import or forced reset); deeper vendor coupling; backend long-running services (Socket.IO) keep verifying the Supabase JWT (already supported).
- **Migration burden:** proportional to the number of **local-password** users.

### Option B — Custom JWT as the single source of truth (recommended if you want control / minimal migration)
The backend is the **sole** issuer (login/register/refresh already exist and were
hardened in Phase 3: typed tokens, rotation, `expiresAt`); drop Supabase JWT
verification + the `signInWithPassword` fallback; use Supabase purely as
Postgres + Storage, **not** Auth; the frontend stops using `supabase.auth`.

- **Pros:** full control, no auth vendor lock-in, fewest verification strategies; leverages the Phase 3 contract; the Phase 5 email templates (verification / password-reset) are ready to back the flows we'd then own.
- **Cons:** we must own MFA / email verification / password reset / OAuth; the 63 frontend `supabase.auth.*` calls must be replaced with the custom API client.
- **Migration burden:** proportional to the number of **`supabase-managed-account`** users (each needs a password set via the reset flow).

## Recommendation

**Decide by your user base + product direction:**
- If most identities already live in Supabase and you want managed MFA/OAuth/email → **Option A**.
- If most users are local-password, or you want to minimize vendor coupling and build on the Phase 3 work → **Option B**.

Absent the user-distribution data, my lean is **Option A** for long-term auth-feature
leverage (it matches §9's "Supabase is the data+auth substrate"), with the explicit
caveat that it carries the larger one-time user migration.

## Safe, incremental migration plan (applies to either target)

1. **Measure.** Count `User` rows where `password = 'supabase-managed-account'` vs local — this decides A vs B and the migration size.
2. **Compatibility window.** Keep `authMiddleware` accepting **both** token types during rollout (it already does) — no big-bang cutover.
3. **Pick the issuer.** Route new logins through the chosen issuer behind a feature flag; keep the other path read-only for verification.
4. **Migrate users** in the background (A: import to `auth.users`; B: trigger password-reset emails using the Phase 5 template).
5. **Converge the frontend** to a single token source (collapse `TokenManager` ↔ `supabase.auth`; one refresh path).
6. **Remove the losing path** (issuance + verification + the `supabase-managed-account` sentinel) once metrics show ~0 usage.
7. **Tighten:** single refresh path, explicit session-revocation story, rotate `JWT_SECRET`/Supabase keys.

## Risks
- Auth is the highest-blast-radius subsystem — a wrong cutover logs everyone out. Mitigated by the compatibility window + feature flag + staged migration + keeping the old path verifiable until usage drops.
- Each step is independently shippable and reversible; **no step removes a working path before its replacement is proven.**

## Decision needed
Choose **Option A (Supabase-canonical)** or **Option B (custom-canonical)**. Then I'll
start with step 1 (measure) and the compatibility-window scaffolding — not a cutover.
