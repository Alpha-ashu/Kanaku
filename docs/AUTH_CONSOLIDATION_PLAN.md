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

## Decision: **Option A — Supabase Auth canonical** (chosen)

Supabase Auth becomes the single source of truth. Implementation proceeds via the
staged plan above — **no cutover until migration is sized and a staging env exists.**

### Progress (safe scaffolding landed; no behavior change)
- **Step 1 (measure) — tooling ready:** `backend/scripts/measure-auth-distribution.cjs`
  (`npm --prefix backend run measure:auth`) reports local-bcrypt vs Supabase-managed
  user counts (read-only). Run it against the real DB to size the migration.
- **Feature flag:** `AUTH_CANONICAL` added to `backend/src/config/env.ts`
  (`'custom'` default = current behavior; `'supabase'` = Option A). Documented in
  `.env.example` alongside the Supabase vars Option A needs (`SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`).

### Blockers before the cutover can be implemented safely
1. **Run the measurement** (above) so we know how many local users need importing.
2. **A Supabase staging/test project** to validate token verification, the
   bcrypt-hash import into `auth.users`, and the frontend session flow end-to-end.
   Auth is the highest-blast-radius subsystem; it must not be cut over against prod
   without a staging dry-run.

## Migration runbook (Option A) — to be built against a Supabase staging project

> **Why staging is mandatory:** the user import touches GoTrue's internal schema
> and must be validated end-to-end (sign-in, refresh, RLS) before prod. A wrong
> import silently breaks login for migrated users.

### The hard part: preserving user ids
Every FK in the app (transactions, accounts, goals, …) keys on `User.id`. So
migrated users **must keep their existing id** in Supabase.
- `supabase.auth.admin.createUser()` **generates a new id** → unusable for migration
  (would orphan all FKs). It also can't set a bcrypt hash with a chosen id.
- Therefore migrate by **inserting directly into `auth.users` + `auth.identities`**
  (service-role SQL), preserving `id` and the bcrypt `encrypted_password`, and
  honoring GoTrue invariants:
  - `auth.users`: `id` (= local `User.id`), `email`, `encrypted_password` (the bcrypt
    hash), `email_confirmed_at = now()`, `aud = 'authenticated'`, `role = 'authenticated'`,
    `instance_id = '00000000-0000-0000-0000-000000000000'`, `raw_user_meta_data` (name/role),
    `created_at`/`updated_at`.
  - `auth.identities`: a matching row (`provider = 'email'`, `user_id = id`,
    `identity_data = {sub, email}`) — **required** or email sign-in fails.
- Idempotent: skip users already present in `auth.users`; dry-run first (report only).

### Ordered steps
1. **Stand up a Supabase staging project**; point a staging backend at it.
2. **Run `measure:auth`** to size local vs supabase-managed.
3. **Build + dry-run the import** (`auth.users` + `auth.identities`, id-preserving) on
   staging; verify a migrated user can sign in via `supabase.auth.signInWithPassword`.
4. **Flip `AUTH_CANONICAL=supabase` on staging.** `authMiddleware` keeps accepting both
   token types (compatibility window) — no lockout.
5. **Converge the frontend** to a single Supabase session + one refresh path: replace
   the custom `TokenManager` + `/auth/refresh` usage with `supabase.auth` (the 63
   existing `supabase.auth.*` call sites become the single path); retire the custom
   401-retry-via-`/auth/refresh`.
6. **Validate** the full matrix on staging (login, refresh, logout, PIN, sockets,
   role gates, RLS), then run the import on prod during a maintenance window.
7. **Remove custom issuance** (`generateTokens`, `/auth/login|register|refresh`) and
   the `supabase-managed-account` sentinel once metrics show ~0 custom-token usage.
8. **Rotate** `JWT_SECRET` + Supabase keys; finalize a single revocation story.

### Validating on the free tier (no paid staging project)
A separate paid Supabase project is **not** required. Two safe options:

1. **Local Supabase (recommended) — free, via Docker (you have Docker 28.5.1):**
   ```
   npx --yes supabase init      # creates supabase/config.toml (one-time)
   npx --yes supabase start     # runs GoTrue Auth + Postgres locally
   ```
   Point a local backend at the printed local `DATABASE_URL` / keys, run
   `npm --prefix backend run migrate:supabase-auth` (dry-run, then `--apply`), and
   verify a migrated user can sign in via `supabase.auth.signInWithPassword`. This is
   the real GoTrue schema, so it confirms the `auth.users`/`auth.identities` inserts
   before prod.

2. **Prod test-user (safe because the migration is additive + reversible):** because
   local bcrypt login keeps working during the compatibility window, you can migrate a
   **single throwaway account** on prod, confirm Supabase sign-in works for it, then
   batch — and delete the test rows if anything's off. Real users are unaffected
   until the frontend convergence + flag flip.

### Migration tooling (ready, dry-run by default)
- `backend/scripts/migrate-users-to-supabase-auth.cjs` (`npm --prefix backend run
  migrate:supabase-auth`) — id-preserving insert into `auth.users` + `auth.identities`,
  idempotent, additive, **dry-run unless `--apply`**. ⚠️ GoTrue's auth schema varies by
  version — validate via option 1 or 2 before `--apply` against prod.

### What I still need from you
- The **`measure:auth` output** (migration size), and your call on validation path
  (local Supabase vs prod test-user). Then I implement the login/frontend convergence
  (steps 5–6) and we cut over.
