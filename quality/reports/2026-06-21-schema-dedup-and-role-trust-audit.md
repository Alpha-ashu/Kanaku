# Schema De-duplication & Role-Trust Audit — 2026-06-21

Triggered by a review of the live `PUT /auth/v1/user` capture and the observation that
several API responses repeat the same value under multiple keys / store double-encoded JSON.

## TL;DR

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 0 | "Supabase project ref is leaked in the URL" | — | **Not a vuln** (public by design) |
| 1 | Backend trusted user-writable `user_metadata.role` and persisted it (privilege escalation) | **High** | **Fixed** |
| 2 | `UserSettings.settings` double-encoded + duplicated column values | Medium | **Fixed** |
| 3 | `/auth/profile` payload repeated keys (`name`+`fullName`, `phone`+`mobile`+`mobileNumber`) | Low | **Fixed** |
| 4 | `Budget.alertChannels` returned double-encoded (`"[\"app\"]"`) | Low | **Fixed** |
| 5 | Systemic `JSON.stringify` into `Json` columns (notifications, transactions, groups) | Low–Med | **Documented** (follow-up) |
| 6 | `User` vs `profiles` hold the same identity fields (root cause of #3) | Med | **Documented** (Phase D) |
| 7 | Frontend infers role from email substring (`includes('admin')`) | Low (UI only) | **Documented** |

---

## 0. The reported "leak" is not a leak

`https://mmwrckfqeqjfqciymemh.supabase.co/auth/v1/user` exposing the project ref and the
`sb_publishable_...` key is **by design** — both are meant to ship in the browser bundle
(see [client.ts:4-7](../../frontend/src/utils/supabase/client.ts#L4-L7)). Security is enforced by
Row-Level Security on the Postgres tables, not by hiding the URL. No action required for the ref.

Note: the duplication visible *inside* that response (`email`/`full_name`/`role`/`sub` repeated
across top-level, `user_metadata`, and `identities[].identity_data`) is Supabase's GoTrue format
and cannot be changed. The app should read identity from `GET /auth/profile` (normalized) instead.

## 1. Privilege escalation via `user_metadata.role` — FIXED (High)

`PUT /auth/v1/user` is `supabase.auth.updateUser()`
([OnboardingCompleteStep.tsx:116](../../frontend/src/app/components/auth/onboarding/OnboardingCompleteStep.tsx#L116)),
proving `user_metadata` is browser-writable. The middleware derived `role` from
`user_metadata.role` for users without a DB snapshot and **persisted** it via `ensureUserInDb`,
so a user could self-elevate to admin with `auth.updateUser({ data: { role: 'admin' } })`.

**Fix** ([auth.ts](../../backend/src/middleware/auth.ts)): role is now sourced only from the DB
snapshot (default `'user'`); token metadata is never trusted for privilege. `ensureUserInDb`
always creates shadow rows as `role: 'user'`, `isApproved: false`. Elevation happens only through
the admin/advisor server flows. Regression test:
[auth-role-trust.test.ts](../../backend/tests/integration/auth-role-trust.test.ts).

Audit result: `auth.ts` was the **only** place trusting client metadata for authorization — no
other endpoint derives privilege from client-controlled input.

## 2. `UserSettings` double-encoding + duplicated columns — FIXED (Medium)

The blob was stored via `JSON.stringify(...)` into a `Json` column → returned as a *string*
(`"settings": "{...}"`), and it repeated values that already have columns
(`timezone`, `defaultCurrency`↔`currency`, `languageLabel`↔`language`).

**Fix** ([settings.controller.ts](../../backend/src/features/settings/settings.controller.ts)):
the blob is stored/returned as a real object, and column-owned keys are stripped on read & write
(single source of truth). Backfill:
[backfill-user-settings.cjs](../../backend/scripts/backfill-user-settings.cjs)
(`npm run backfill:user-settings -- --apply`). Tests:
[settings-normalize.test.ts](../../backend/tests/integration/settings-normalize.test.ts).

## 3. `/auth/profile` payload repeated keys — FIXED (Low)

`buildProfilePayload` emitted `name`+`fullName` (identical) and `mobile`+`phone`+`mobileNumber`
(identical). **Fix** ([auth.controller.ts](../../backend/src/features/auth/auth.controller.ts)):
collapsed to canonical `name` + `phone`. Verified safe — the frontend reads via the alias-tolerant
`normalizeRemoteProfile` and `UserProfile` (`data.name`, `data.mobile || data.phone`); `mobileNumber`
had zero consumers. The frontend also stopped trusting `user_metadata.role` in `resolveUserRole`
([AuthContext.tsx](../../frontend/src/contexts/AuthContext.tsx)).

## 4. `Budget.alertChannels` double-encoded response — FIXED (Low)

`alertChannels` (a `Json` column) was written with `JSON.stringify(...)` and returned raw, so the
API returned `"alertChannels": "[\"app\"]"`. **Fix**
([budget.controller.ts](../../backend/src/features/budgets/budget.controller.ts)): store a native
array; `serializeBudget`/`coerceChannels` guarantee an array on every response (also repairs legacy
rows on read).

## 5. Systemic `JSON.stringify` into `Json` columns — DOCUMENTED (follow-up)

The same anti-pattern exists elsewhere. Unlike #2/#4, the read paths here are **defensively
string-or-object tolerant**, so responses are currently correct but storage is double-encoded and
fragile. Remediation pattern: store native objects/arrays; remove the compensating `JSON.parse`
once writes are clean; verify with an integration test per field; optionally backfill.

| Column (type) | Write sites | Reader |
|---|---|---|
| `Notification.deliveryStatus` (Json) | [notification.service.ts:87,275](../../backend/src/features/notifications/notification.service.ts#L87), [webhook.controller.ts:68](../../backend/src/features/webhooks/webhook.controller.ts#L68), plus string literals in collaboration/friends/groups controllers | defensive parse ([notification.service.ts:267-269](../../backend/src/features/notifications/notification.service.ts#L267-L269)) |
| `Notification.channels` (Json) | [notification.service.ts:86](../../backend/src/features/notifications/notification.service.ts#L86), [cross-device-sync.service.ts:52,276](../../backend/src/features/notifications/cross-device-sync.service.ts#L52) | — |
| `Transaction.tags` (Json?) | [transaction.repository.ts:23](../../backend/src/features/transactions/transaction.repository.ts#L23) (`serializeTags`) | `deserializeTags` → response is a clean array; storage only |

Not bugs (these are `String` columns, so `JSON.stringify` is correct): `GroupExpense.members/items`
([schema.prisma:806-807](../../backend/prisma/schema.prisma#L806-L807), already deprecated in favour
of the `GroupExpenseMember` relation), `ExpenseBill.extractedJson`
([schema.prisma:726](../../backend/prisma/schema.prisma#L726)).

## 6. `User` vs `profiles` duplication — DOCUMENTED (Phase D)

[User](../../backend/prisma/schema.prisma#L586-L650) and
[profiles](../../backend/prisma/schema.prisma#L920-L944) both store email, name/full_name,
firstName/first_name, country, state, city, gender, dob, income/salary. This is the root cause of
#3 — `buildProfilePayload` is full of `profileRecord?.x || userRecord?.y` fallbacks, and ~10
controllers write both tables. Recommended: give each table clear ownership (`User` =
auth/role/approval/email; `profiles` = extended PII), backfill `profiles`, then drop the overlapping
`User` columns in a dedicated, reviewed migration. **Deferred** — it is a destructive schema
migration and should ship on its own branch with a backfill + rollback plan.

**Runbook (own branch, against a backup):**
1. Run the non-destructive backfill (provided):
   `npm run backfill:profiles-from-user` (dry run) → `-- --apply`
   ([backfill-profiles-from-user.cjs](../../backend/scripts/backfill-profiles-from-user.cjs)).
   It only fills empty `profiles` fields from `User`; safe and idempotent.
2. Repoint readers/writers: make `profiles` the single source for PII; simplify
   `buildProfilePayload` ([auth.controller.ts](../../backend/src/features/auth/auth.controller.ts))
   and the ~10 controllers that currently write both tables (auth, admin, advisors, friends, groups,
   ai, settings.gdpr) so PII writes go to `profiles` only. `User` keeps auth/role/approval/email.
3. Verify `/auth/profile` is byte-stable for existing users (snapshot test) with the readers repointed.
4. Only then: a Prisma migration dropping the now-unused `User` PII columns
   (`firstName`, `lastName`, `gender`, `dateOfBirth`, `country`, `state`, `city`, `salary`, `jobType`,
   `avatarId`). Keep a DB backup; the drop is irreversible.

## 7. Frontend role inference from email — DOCUMENTED (Low, UI only)

`getRoleFromEmail` ([AuthContext.tsx:221-262](../../frontend/src/contexts/AuthContext.tsx#L221-L262))
returns `'admin'` for any email containing `admin` (e.g. `myadmin@x.com`). This only affects which
UI a user sees; the backend enforces the real role from the DB. Recommend narrowing to exact demo
addresses or removing it outside dev. No data exposure.

---

## Verification performed
- `backend`: `tsc --noEmit` clean; `auth-role-trust.test.ts` (2) + `settings-normalize.test.ts` (6) pass.
- `frontend`: `tsc --noEmit` clean; `permissionService` + `login-flow` + `api` tests (35) pass.
- Manual (requires DB): `GET /api/v1/settings` → `data.settings` is an object with no column
  duplicates; `GET /api/v1/budgets` → `alertChannels` is an array; forged
  `user_metadata.role=admin` token → 403 on admin endpoints.
