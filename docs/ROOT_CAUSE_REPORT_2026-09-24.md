# KANAKU — Root-cause report & proposed technical solution

**Date:** 2026-09-24 · **Branch:** `main` @ `07f43e99` (== `origin/main`, nothing unpushed)
**Scope:** P0-1 registration · P0-2 cross-device sync · P0-3 advisor application · P1-4 review flow · P1-5 booking/reschedule/chat · P1-6 encryption · P1-7 RBAC & feature flags · P2-8 AI latency
**Audience:** Kanaku development team

---

## 0. How this was produced, and what it is not

Every claim below is anchored to a file and line in the current tree. Where the brief listed a
suspected cause, it was checked against the code rather than accepted; several are **already
fixed**, and two are **factually wrong about this deployment**. Those are called out explicitly in
§1, because acting on them would waste a sprint.

Verified locally:

- `npm run type-check` — **clean**, 3/3 workspaces (backend, frontend, shared).
- Static read of the auth, sync, storage, RBAC, booking, encryption and AI paths.

**Not** verified, and it matters: the production environment variables on Render. Two of the
highest-severity findings (§6, §4) are environment-configuration failures whose presence can only
be confirmed against the running service. §10 gives the one command that settles both.

> ⚠️ `backend/.env` points `DATABASE_URL` at the **production** database. Nothing in this report
> was executed against it, and no remediation step below should be run from a developer machine
> without an explicitly non-production `DATABASE_URL`.

---

## 1. Corrections to the brief's premises

Acting on these as written would produce wrong fixes.

| # | Brief says | Actually |
|---|---|---|
| 1 | "Vercel serverless does not support persistent WebSockets, so the fallback must actually work" | The **backend is not on Vercel**. It runs on Render (`render.yaml`, service `kanaku-api`), which supports WebSockets fine. The socket server exists and works. The failure is in the **web client**, which refuses to open a socket at all — see §3.1. The fix is to connect, not to build a fallback. |
| 2 | "Sync cooldown … skipped if pulled within 5 minutes" | The backend-first cooldown is **90 s**, not 5 min (`auth-sync-integration.ts:2286`), `force=true` bypasses it, and logout already clears every `KANAKU_last_sync_at_*` key (`AuthContext.tsx:344-346`). The cooldown is **not** a root cause. The real defect is that no code path ever requests a *full* pull — see §3.2. |
| 3 | "Attachments are linked as `document:{localId}`" | Already fixed. `relinkBillsToTransactions()` rewrites the pointer to `bill:{cloudId}` (`featureSyncService.ts:780`), and `documents.cloudId` is indexed (Dexie v18). |
| 4 | "Documents are likely local-only" | Partly fixed: bills are pulled metadata-only via `syncBills()` (`featureSyncService.ts:696`). Advisor KYC docs and vault files are separate paths. |
| 5 | "Remove the hardcoded fallback encryption key (`'default-key'`)" | No such string exists anywhere in the repo. The real defect is different and worse — a **silent fail-open to plaintext**. See §6.1. |
| 6 | "Application create endpoint … feature gate or `requireRole` middleware [may block a plain user]" | `POST /advisors/apply` carries **no** role or feature gate (`advisor.routes.ts:45-53`). Any authenticated user may apply. Not the cause. |
| 7 | "Financial amounts: use Decimal (not Float)" | Already done. The only `Float` columns left are `AdvisorSession.rating`, two ML `confidence` scores and `risk_score` — none are money. |
| 8 | "Update `KANAKU_DEVELOPER_CONTEXT.md`" | That file does not exist in the repo. |
| 9 | Frontend identifier prefix `KANKU_` | The actual prefix is `KANAKU_`. |

**Already landed today** (commits `36d2dd11`, `07f43e99`, both pushed): the advisor-apply error
path now distinguishes a storage outage (503 `STORAGE_UNAVAILABLE`) from a bad submission and logs
a real stack trace; the PIN-setup dead-end (`PIN_ALREADY_EXISTS` returned as an indistinguishable
400) is fixed with machine-readable codes; `getStorageHealth()` was added for `/health/deep`.
Sections §2 and §4 account for what those fixed and what they did not.

---

## 2. P0-1 — New user registration

**Verdict:** the backend registration path is sound. The failure is (a) environmental — OTP email
delivery — and (b) a client-side error-masking bug that turns *every* backend failure into the
same misleading message.

### 2.1 Registration is hard-gated on an emailed OTP, and mail is the weak link

`POST /auth/register` creates the user as `pending_verification` and returns **502
`OTP_SEND_FAILED`** if the mail provider rejects the send (`auth.controller.ts:433-440`). Login is
blocked until the code is verified. So *any* mail outage presents as "new users cannot register".

Mail goes out through SendGrid from a `@gmail.com` sender. That fails DMARC alignment, so Gmail
and Yahoo junk or reject it. There is a known prior incident of SendGrid answering
`401 Maximum credits exceeded`, which produced exactly this symptom for every new user. No SMTP
fallback is configured on Render (`render.yaml` provisions `SENDGRID_*` only).

**This is the most likely single cause of the reported P0-1, and it is a configuration fix, not a
code fix.**

### 2.2 The OTP screen reports every backend failure as "invalid code"

`OTPVerification.tsx:104-135` tries the backend first, then falls through to a **dead Supabase
Auth path**:

```ts
} catch (backendErr: any) {
  if (backendErr?.code === 'INVALID_OTP' || backendErr?.code === 'INVALID_OTP_FORMAT') { /* …return */ }
}
// falls through to supabase.auth.verifyOtp(...)  ← the OTP was never issued by Supabase
```

A 502, a 500, a 429 or a network error is swallowed, Supabase is asked to verify a code it never
minted, it fails, and the user is told **"Invalid or expired verification code."** The same dead
Supabase fallback sits in `handleResendOTP` (`:203`). This is why "the real cause is hidden".

### 2.3 Supporting detail

- Duplicate email already returns a clean **409 `EMAIL_EXISTS`** with P2002 / P2010 / 23505
  mapping (`auth.controller.ts:478-520`). Working as required.
- Registration is atomic: User + `profiles` + `userSettings` + default categories in one
  transaction (`auth.service.ts:114-175`). No partial users.
- `AuthFlow.tsx:383` still branches on `VITE_AUTH_CANONICAL === 'supabase'`. It defaults to
  `'backend'` and no env file sets it, so that branch is dead — but it is a loaded gun.
- The PIN-setup dead-end named in the brief was fixed today (`36d2dd11`). `isPinMissing()` no
  longer reads a *failed* status lookup as "no PIN", which was routing users into PIN creation
  against an account that already had one.

### 2.4 Proposed fix

1. **Configure an SMTP fallback on Render** (`SMTP_HOST` / `PORT` / `USER` / `PASS` /
   `SMTP_FROM_EMAIL`, Gmail app password). The provider chain already falls back; a Gmail-SMTP
   `@gmail.com` sender also fixes DMARC. *Permanent fix: custom-domain sender with SendGrid Domain
   Authentication.*
2. **Delete the Supabase OTP fallback** from `OTPVerification.tsx` (verify + resend). Surface the
   backend's real `code` and message; map 502 → "We couldn't send your code right now", 429 →
   retry-after countdown.
3. Add a boot-time assertion that a mail provider is reachable, surfaced on `/health/deep`.
4. Delete the `AUTH_CANONICAL === 'supabase'` branches in `AuthFlow.tsx`.
5. **Test:** extend `quality/backend/tests/integration/registration-remediation.test.ts` to cover
   register → OTP → verify → PIN-create → PIN-status, plus the 502 and 409 paths.

---

## 3. P0-2 — Local-first data does not sync across devices

Four independent defects. The first two explain nearly all of the reported symptom.

### 3.1 🔴 Realtime is switched off for every production web user

```ts
// frontend/src/lib/socket-client.ts:257
if (socketUrl.includes('vercel.app') || window.location.hostname.endsWith('vercel.app')) {
  // "Realtime disabled on Vercel (static host); using on-demand sync."
  this.isConnected = false;
  return;   // no connection, and by the comment's own admission no polling fallback
}
```

Production web is `https://kanaku-fawn.vercel.app` (`render.yaml:104`,
`docs/architecture/OVERVIEW.md:5454`). The second clause therefore matches **always**, on every
web session, regardless of what `VITE_SOCKET_URL` is set to.

The reasoning behind the guard is a category error: Vercel hosts only the **static bundle**. The
socket server lives on Render, which supports WebSockets. Nothing prevents the browser from
opening a socket **directly** to `https://kanaku-api.onrender.com` — `CORS_ORIGIN` already allows
the Vercel origin.

Consequence: the entire realtime fan-out — `transactions_updated`, `bills_updated`,
`budgets_updated`, `recurring_updated`, `categories_updated`, `group_expense_updated`,
`todo_updated`, `account_saved`, `booking_status_changed`, `new_message` — is **dead on web**.
Device B learns nothing until the user navigates. Native Android/iOS builds *do* connect (they set
an absolute `VITE_SOCKET_URL`), which is why this reproduces on web and not on the APK.

**Fix:** delete the hostname clause; keep only an explicit opt-out. Set
`VITE_SOCKET_URL=https://kanaku-api.onrender.com` for the Vercel build. Add a genuine polling
fallback (30 s, visibility-gated) for the case where the socket truly cannot connect, so the
contract holds under any host.

### 3.2 🔴 No code path ever performs a full pull

`triggerDataSync` is the only login-time sync, and it pulls **only the current page's tables**:

```ts
// frontend/src/contexts/AuthContext.tsx:1231-1233
if (requestedTables && requestedTables.length > 0) {
  await syncFromSupabase(user, true, requestedTables);   // = PAGE_REQUIRED_TABLES[currentPage]
}
```

On a fresh device landing on `dashboard` that is 7 of the 10 synced tables; to-do lists arrive
only if the user visits that page. There is no "first login on this device → pull everything"
branch anywhere. Combined with §3.3, a second device shows a partial account and a re-login shows
a partial restore.

**Fix:** add a per-device first-login marker (`KANAKU_device_hydrated_${userId}`). When absent,
run a forced pull over `CORE_SYNC_TABLES` **plus** every feature-sync mirror, with a visible
progress state, before setting the marker. Keep the per-page pull for steady state.

### 3.3 🔴 Tables wiped on logout but never pulled back — real data loss

`clearLocalUserData()` (`AuthContext.tsx:276-318`) clears 30+ Dexie tables. Only 14 have a pull
path (10 in `SyncedTableName` + budgets / categories / recurring / bills). The rest are **written
locally and never re-hydrated**:

| Table | Written at | Server has it? | Result |
|---|---|---|---|
| `loanPayments` | `PayEMI.tsx:84`, `Loans.tsx:804` | **Yes** — `GET /loans` returns `include: { payments }` (`loan.controller.ts:25`) | EMI history vanishes on logout; never on device B |
| `goalContributions` | `GoalDetail.tsx:283`, `goalContributions.ts:52` | **Yes** — `GET /goals/:id/contributions` (`goal.routes.ts:40`) | Contribution history vanishes |
| `importHistories` | `smartExpenseImportService.ts:1634` | **No** — no `ImportHistory` model, no list endpoint | Bank-statement import history is permanently local |
| `gold` | local | `GET /gold` exists | Not wired into any pull |
| `investmentDocuments`, `investmentLinks` | local | no endpoint | Local-only |
| `budgetAlerts` | no writer found | n/a | Dead table |
| `smsTransactions` | local | no endpoint | Local-only (SMS is full-APK only by design) |

The first two are the serious ones: the data **is on the server**, the client just never asks for
it, and then deletes its only copy.

**Fix:**

- Hydrate `loanPayments` from the `payments` already embedded in the loans pull (zero new
  endpoints) and `goalContributions` from `GET /goals/:id/contributions`. Both go into the merge
  step of `syncUserDataFromBackend`, inside `runWithCloudSyncSuppressed`.
- Add `ImportHistory` to Prisma + a `GET /import/history` list endpoint, or stop clearing the
  table on logout and accept it as device-local (product call — recommend syncing it, since the
  brief's acceptance criteria name bank statements explicitly).
- Add a **registry assertion test**: every table cleared by `clearLocalUserData()` must appear
  either in a "has a pull path" registry or on an explicit device-local allowlist. This is the
  class fix — it stops the next table from regressing the same way.

### 3.4 🟠 Sync failures are invisible

- Every `featureSyncService` pull collapses *all* errors to `{ offline: true }`
  (`:207`, `:378`, `:563`, `:705`). A 403 `PIN_VERIFICATION_REQUIRED` from the PIN-gated
  `GET /bills` (`bills.routes.ts:16`), a 500, or an expired session is indistinguishable from
  being offline, and nothing retries until the next session or a manual pull-to-refresh.
- Permanently-rejected queue items are dropped with a `console.warn` and no user-visible state
  (`auth-sync-integration.ts:1408`, `:1535`). The brief's requirement that failed items surface as
  `syncStatus: 'error'` is **not** met.

**Fix:** distinguish transport failure from HTTP failure in the pull helpers; mark rows
`syncStatus: 'error'` with the server's code, and surface a "N changes could not be saved" banner
with a retry action.

### 3.5 🟡 Write-path hygiene

`relinkBillsToTransactions()` writes `db.transactions.update(...)` unsuppressed
(`featureSyncService.ts:781`). Every such write re-runs live queries and queues an echo `PUT` per
row via `bindTableHooks`. Wrap server-confirmed writes in `runWithCloudSyncSuppressed` and batch
them.

### 3.6 Conflict strategy

There is no single documented rule today. **Recommend: last-write-wins by `updatedAt`, server
breaks ties**, with soft-delete tombstones so deletes propagate. This must be written down and
applied identically in `mergeBackendTable` and in every `featureSyncService` reconcile — they
currently differ in how they treat a locally-present / server-absent row.

---

## 4. P0-3 — Advisor role request fails

**Verdict:** storage misconfiguration on the deployed service, not validation and not RBAC.

`POST /advisors/apply` has no role or feature gate. It uploads PAN / Aadhaar / cert through
`uploadBuffer()`, which requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. In production,
missing credentials mean **throw** (`storage.ts:130-134`); outside production it silently writes
to local disk, which is why this never reproduces in dev. Both vars are `sync: false` in
`render.yaml` — dashboard-only, easy to have locally and absent on the deployed service. They were
**missing from `CONFIG_MANIFEST` entirely until commit `b05e61b2`**, which is strong
circumstantial evidence they were never provisioned.

Until today this surfaced as a bare `500 Failed to submit advisor application` with
`logger.error('…', { error })` — which serialises an `Error` to `{}`, so the production logs
recorded only that *something* failed. Commit `36d2dd11` fixed both: a storage outage is now
**503 `STORAGE_UNAVAILABLE`** with a real stack trace, and orphaned uploads are rolled back.

**What remains:**

1. Confirm and set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET`
   (`expense-bills`) on Render. *This is almost certainly the whole bug.*
2. Advisor KYC documents are stored **unencrypted** — see §6.2.
3. The one-active-application rule and re-submit-after-rejection are already enforced by the
   upsert + `blockedBy` check in `applyAsAdvisor`.

---

## 5. P1-4 — Manager / Admin review flow

**Verdict:** the server-side decision logic is correct and complete. The client never finds out.

`advisorReview.service.ts` is a single shared implementation with compare-and-set semantics
(`PENDING|REJECTED → APPROVED`, `PENDING|APPROVED → REJECTED`), 409 on repeat, self-review and
staff-account guards, and it calls `invalidateUserSnapshotCache(userId)`. The backend reads role
from the DB snapshot, not the JWT (`middleware/auth.ts:212-251`), so **API authority flips within
60 s with no re-login**. That part meets the requirement.

Two gaps:

### 5.1 🔴 No role-change push, so the UI lags up to 5 minutes

There is no `role_changed` event on either side (grep: zero hits). The client caches the role in
`localStorage` (`auth_role_cache`) and refreshes it in the background **at most once per 5
minutes** (`permissionService.ts:247`). So after approval the user keeps the `user` shell — no
User/Advisor toggle — until that window elapses or they reload. On web, even adding the event
changes nothing until §3.1 is fixed.

**Fix:** emit `role_changed { role, isApproved }` to `user:${userId}` from
`approveAdvisorApplication` / `rejectAdvisorApplication`; on receipt call
`permissionService.invalidateRoleCacheTimestamp(userId)` and re-fetch immediately.

### 5.2 🟠 The approval notification bypasses the delivery pipeline

```ts
// advisorReview.service.ts:77 and :125
await prisma.notification.create({ /* … */ });
```

This writes a row and stops. It skips `notify()` (`features/notifications/notify.ts:190`), which
applies user preferences, picks channels (`app` / `push` / `email`), dispatches through the outbox
to FCM / APNs, **and calls `emitRealtime(userId, …)`**. So the approved user gets no push, no
socket delivery, and sees the notification only on their next manual fetch.

**Fix:** replace both `prisma.notification.create` calls with `notify({ topic: 'system', … })`.

### 5.3 Confirmed working

Manager and Admin both reach `GET /advisors/admin/applications` and the approve/reject routes
(`advisor.routes.ts:86-88`, `requireRole(['admin','manager'])` + `adminPlatformGate`). Decisions
are audit-logged. Document viewing goes through
`GET /advisors/application/:id/document/:docType` with signed URLs.

---

## 6. P1-6 — Encryption

### 6.1 🔴 Chat encryption fails **open** to plaintext, and the key is not provisioned

`encryptMessageBody()` is correct AES-256-GCM with a per-sender HKDF DEK and `AAD = sessionId`
(`features/sessions/message.crypto.ts`). But:

```ts
// message.crypto.ts:47
if (!isCryptoConfigured()) {
  logger.error('[chat] No encryption root key configured — message stored as PLAINTEXT.');
  return plaintext;
}
```

The key is `AA_ENCRYPTION_ROOT_KEY` (`security/crypto.ts:50`). It is **optional** in
`config/env.ts` and **absent from `render.yaml`** — only `VAULT_ENCRYPTION_ROOT_KEY` is
provisioned (`render.yaml:107`). Unless it was added out-of-band, **every advisor↔client
consultation in production is stored as readable text**, and the only evidence is one log line per
message.

The same key also guards Account-Aggregator financial data (`aa.service.ts:357`), which at least
refuses to persist plaintext in production.

**Fix:**

1. Generate and set `AA_ENCRYPTION_ROOT_KEY` (64 hex chars) on Render; add it to `render.yaml` as
   `sync: false`.
2. Make it **required** in `config/env.ts` for `NODE_ENV=production` — refuse to boot without it,
   matching the treatment of `JWT_SECRET`.
3. Change the chat fallback from "store plaintext" to **fail the send with 503**, consistent with
   the AA path.
4. Ship a backfill that converts pre-existing plaintext rows in place (the `enc:v1:` prefix scheme
   already makes this safe and resumable).

### 6.2 🟠 Uploaded documents are not encrypted at rest

`uploadBuffer()` writes the raw buffer to the bucket. Vault files have their own encryption
(`features/vault/vault.storage.ts`); **advisor KYC documents (PAN, Aadhaar) and bill / receipt
files do not**. The brief requires encrypted blobs. Access control is sound (private bucket,
short-lived signed URLs, ownership / role check) but the object itself is plaintext.

**Fix:** route advisor-application and bill uploads through the same envelope encryption the vault
uses, keyed by owner id, decrypting on signed-URL issue.

### 6.3 Design recommendation (product to confirm)

**Server-side field-level AES-256-GCM, not E2E.** Advisors, Managers and Admins must legitimately
read chat and KYC documents; a PIN-derived client key would make that impossible. The existing
scheme (root key → HKDF per-user DEK → AES-GCM with AAD) is the right shape and already supports
rotation via the version byte. Local Dexie data can keep the client PIN-derived key.

---

## 7. P1-7 — RBAC and feature flags

**Verdict:** better than the brief assumes. Three narrower defects.

Working as required: flags live in the DB (`admin_global_feature_settings`), the backend enforces
them via `requireFeature` with a 30 s cache and **explicit invalidation** on every toggle
(`admin.controller.ts:387`, `:461`, `:525`, `:588`), toggles broadcast `feature_flags_updated`,
and the client has a **20 s polling fallback** plus visibility / reconnect / foreground refresh
(`AppContext.tsx:777-800`). Roles are normalised case-insensitively (`permissionService.ts:42`),
and role changes take effect server-side without re-login (§5).

### 7.1 🟠 Socket propagation is dead on web

Same root cause as §3.1. Today the 20 s poll is doing 100 % of the work on web. It satisfies the
"under 30 s" requirement, but the "within seconds" target needs §3.1.

### 7.2 🟠 Cross-instance invalidation does not exist

The feature cache is per-process in memory. `render.yaml` is `plan: free` → one instance, so this
is latent, not live. It **will** break the moment the service is scaled. Fix when scaling: move
invalidation to a Postgres `LISTEN/NOTIFY` channel, or shorten the TTL.

### 7.3 🟡 Email-derived roles outrank the server role in the UI

`resolveUserRole()` (`AuthContext.tsx:255-259`) and `permissionService.ts:36` check
`EMAIL_ROLE_MAP` **first**, before the server-authoritative cached role. It is exact-match and
UI-only — the API still enforces the real role — but it means `advisor@kanaku.com` renders the
advisor shell even after being demoted. Reorder so the server role wins whenever it is known, and
keep the email map strictly as a cold-start fallback.

### 7.4 Deliverable still owed

The **role-by-feature audit table** the brief asks for does not exist as an artefact. The data is
all in `DEFAULT_SUB_FEATURES` (`middleware/featureGate.ts:39-97`) and its frontend twin
`roleBasedFeatures.ts`. These two must be generated from one source — today they are hand-kept in
sync, with a comment admitting that if they disagree "one side shows a surface the other refuses".

---

## 8. P1-5 — Booking, notes, reschedule, chat gating

**Already correct:** the booking note exists end to end (`BookAdvisor.tsx:638-645` →
`BookingRequest.description`); creates are idempotent (`clientRequestId` + `@@unique`, plus
`idempotency()` and `duplicateSubmitGuard`); chat is genuinely backend-gated — `ChatMessage` hangs
off `AdvisorSession`, which is created only on accept, and `sendMessage` re-checks membership and
session status (`session.controller.ts:84-101`).

### 8.1 🔴 The reschedule flow dead-ends

`rescheduleBooking` sets `status: 'reschedule'` (`booking.controller.ts:426`) and notifies the
client — but **there is no endpoint for the user to accept or decline it**. `booking.routes.ts`
exposes accept / reject for the advisor only. The booking is stranded: it can be cancelled,
nothing else. This is very likely the bulk of the reported "multiple issues when booking".

### 8.2 🟠 No server-side state-machine validation

`rescheduleBooking` does not check the current status — a `completed` or `cancelled` booking can
be rescheduled. `acceptBooking` / `rejectBooking` need the same audit. The brief requires illegal
transitions to return 400; today they return 200.

### 8.3 🟠 Missing schema for the flow the brief specifies

- No reschedule **round counter** → no way to cap at 3.
- No proposal **expiry** → nothing auto-cancels.
- The advisor's reschedule message is stuffed into `rejectionReason` (`:429`), overloading a field
  that means something else.

### 8.4 Proposed fix

1. Migration (additive, non-destructive): `BookingRequest.rescheduleCount Int @default(0)`,
   `rescheduleProposedBy String?`, `rescheduleMessage String?`, `rescheduleExpiresAt DateTime?`.
2. Extract a single `transition(booking, to, actor)` helper holding the full legal-transition
   table; every route calls it; illegal → 400 `INVALID_TRANSITION`.
3. New routes: `PUT /bookings/:id/reschedule/accept` and `…/decline` (client only), plus an
   optional client counter-proposal reusing `/reschedule` with an actor check.
4. Cap at `RESCHEDULE_MAX_ROUNDS = 3`; a worker sweeps expired proposals to `cancelled`.
5. Replace the direct `dispatchNotification` calls with `notify()` so preferences and the outbox
   apply, and emit a socket event on every transition.

---

## 9. P2-8 — K AI latency

Four contributors, in order of impact:

1. **🔴 Render free plan** (`render.yaml:16`). The service spins down after inactivity; the first
   request after that pays a ~50 s cold start. The brief blames "Vercel cold starts" — wrong host.
   *Fix: paid instance, or a keep-alive ping.*
2. **🔴 Gemini free-tier quota — 20 requests/day per model** (`gemini.models.ts:5`). This is the
   documented root cause of "AI is broken". The ladder walks models and applies cooldowns, so a
   quota-exhausted request spends several round trips failing before it answers.
   *Fix: enable billing on the key. The ladder is a mitigation, not a fix.*
3. **🟠 `GET /ai/insights` has no caching and no request dedupe** (`ai.routes.ts:53`). Every call
   runs `runAllAgents` → `loadAgentData` → 7 parallel Prisma queries over 120 days of transactions
   (`agents.ts:100`, `:120`). With the **production DB in Sydney and the service in Singapore
   (~280 ms/query)**, that is a floor of several hundred ms before any analysis. These agents are
   heuristic, not LLM — so this is pure DB cost and is fully cacheable.
   *Fix: cache per user keyed on `max(updatedAt)` across the inputs, TTL 5–15 min, plus in-flight
   coalescing. Stream or skeleton-load in the UI.*
4. **🟠 `withCircuitBreaker` does not wrap the LLM calls.** It is used only by
   `receipt.controller.ts:209` and `paddleOcr.ts:43`. The brief assumed it wrapped everything.
   *Fix: wrap every Gemini / xkiro call; hard per-call timeout; fall back to the heuristic parser.*

No per-endpoint timing metrics exist today, so the "p95 before / after" the brief requires cannot
be produced yet. **Add timing middleware to the AI routes first** — that is a prerequisite for the
acceptance criterion, not a nice-to-have.

---

## 10. Verify the environment before writing any code

Three of the highest-severity findings (§4 storage, §6.1 crypto key, §2.1 mail) are environment
configuration. One request settles the first two:

```bash
curl -s https://kanaku-api.onrender.com/health/deep | jq '{crypto, storage}'
```

- `crypto.configured: false` → §6.1 is live: **all chat is plaintext in production**.
- `storage.probe: "unconfigured"` or `"unusable"` → §4 is the whole advisor-apply bug.

For mail, run `cd backend && npx tsx scripts/email-diag.ts <address>` (must be run by the account
owner — the SendGrid key is not usable from an agent session) and check Render logs for
`[Email/SendGrid] Send failed`.

**It is entirely possible that P0-1 and P0-3 are both fixed by setting environment variables, with
no code change at all.** Confirm that before starting the sprint.

---

## 11. Proposed sequencing

**Phase 0 — configuration (hours, no deploy)**
Set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, `AA_ENCRYPTION_ROOT_KEY`, SMTP fallback on
Render. Re-test registration and advisor apply. → likely closes P0-1 and P0-3.

**Phase 1 — sync correctness (highest user-visible impact)**
§3.1 socket guard + `VITE_SOCKET_URL` + real polling fallback · §3.2 first-login full pull ·
§3.3 `loanPayments` / `goalContributions` hydration + the clear-vs-pull registry test.

**Phase 2 — role & notification propagation**
§5.1 `role_changed` event · §5.2 `notify()` in `advisorReview` · §7.3 role precedence.

**Phase 3 — booking state machine**
§8.1–8.4. Additive migration, transition helper, accept / decline routes, expiry worker.

**Phase 4 — encryption hardening**
§6.1 fail-closed + required env + backfill · §6.2 document envelope encryption.

**Phase 5 — AI latency**
§9.3 insights caching · §9.4 circuit breaker · timing metrics · then measure p95.

**Phase 6 — flag / RBAC hygiene**
§7.4 single-source role×feature matrix · §7.2 cross-instance invalidation (defer until scaling).

---

## 12. Test matrix to be produced at sign-off

| # | Area | Form | Status |
|---|---|---|---|
| 1 | Registration web + Android; fresh email, duplicate email, 502 mail path | backend integration + Playwright | to write |
| 2 | Two-device sync over every table in the audit checklist | isolated E2E stack (disposable Docker Postgres, `:4100` / `:5173`) | to write |
| 3 | Logout → login restores 100 % | Dexie assertion + clear-vs-pull registry unit test | to write |
| 4 | Advisor apply → Manager approve → toggle + notification within seconds | E2E multi-role | partially exists |
| 5 | Booking note / approve / decline / reschedule both paths / chat gating / illegal transition → 400 | backend integration | to write |
| 6 | Encryption: DB shows ciphertext; owner sees plaintext; unauthorised → 403 | backend integration | to write |
| 7 | Feature flags per role: UI, API 403, persistence, multi-tab | existing matrix harness | extend |
| 8 | AI p95 before / after + disabled-flag 403 | timing middleware + load script | to write |
| 9 | `type-check`, `lint`, jest unit, build | CI | **type-check clean today** |

Non-negotiable given this codebase's history: **no destructive migrations**, additive columns
only, and every migration reviewed against the out-of-band triggers and FKs that exist in
production but were never created by a migration.

---

## 13. Open questions for the product owner

1. **Does chat open on approval, or when the advisor starts the conversation?** Today it opens on
   **accept** (session creation). Recommend keeping that — it is already enforced server-side, and
   "advisor must speak first" adds a state with no clear user benefit.
2. **Reschedule rounds / expiry?** Recommend **3 rounds, 48 h expiry**, both env-tunable.
3. **Server-side vs end-to-end encryption?** Recommend **server-side** (§6.3). E2E would lock
   advisors, managers and admins out of data they must read.
4. **Should a Manager see a user's bookings and advisor status?** Needs a decision; it changes the
   RBAC matrix in §7.4. Recommend: advisor status yes, booking *contents* no.

---

# PART II — Implementation record (2026-09-24)

Phases 1–8 of the verified fix plan. Phase 0 could not be completed from here
(see §14). Nothing below was run against the production database.

## 14. Phase 0 — configuration verification: BLOCKED, and made self-announcing

`GET /api/v1/health/deep` requires authentication (`app.ts:444`), and the public
`/health` is deliberately minimal — it returned `{"status":"ok"}` and nothing
else. So the three environment questions (storage credentials, crypto root key,
mail provider) **cannot be answered without a valid production JWT**, which this
session does not have and should not be given.

Rather than leave them unverifiable, the code now refuses to hide them:

| Variable | Before | Now |
|---|---|---|
| `AA_ENCRYPTION_ROOT_KEY` | optional; missing ⇒ chat silently stored as plaintext | **required in production** — the API refuses to boot (`config/env.ts`), and chat sends fail closed with 503 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | missing ⇒ advisor apply returned a bare 500 | already fixed in `36d2dd11` (503 `STORAGE_UNAVAILABLE` + real stack trace) |
| SendGrid / SMTP | missing ⇒ 502 `OTP_SEND_FAILED`, shown to the user as "invalid code" | root cause documented in §2; the client-side masking fix is **not** in this change set |

**Still owed by the operator**, and nothing below substitutes for it:

```bash
# 1. Generate and set the key on Render BEFORE deploying this change set,
#    or the API will refuse to start.
openssl rand -hex 32     # -> Render dashboard -> AA_ENCRYPTION_ROOT_KEY

# 2. Confirm storage + crypto once deployed (needs any valid user token):
curl -s -H "Authorization: Bearer <token>" \
  https://kanaku-api.onrender.com/api/v1/health/deep | jq '.services'

# 3. Count how many consultations were stored in the clear (READ-ONLY):
cd backend && npx tsx scripts/audit-chat-encryption.ts
```

> ⚠️ **Deploy order matters.** `AA_ENCRYPTION_ROOT_KEY` must be set *before*
> this change set reaches Render. It is now a required variable, so a deploy
> without it aborts at boot.

## 15. What changed, by phase

### Phase 1 — chat encryption fails closed

- `message.crypto.ts` — `encryptMessageBody()` now throws
  `MessageEncryptionUnavailableError` instead of returning the plaintext, both
  when no key is configured and when encryption itself fails.
- `session.controller.ts` — both write paths answer **503
  `MESSAGE_ENCRYPTION_UNAVAILABLE`** and persist nothing. The attachment path
  now encrypts the caption *before* `uploadBuffer`, so a refusal cannot strand
  an uploaded object in the bucket. The generic catch no longer echoes
  `error.message` to the client.
- `sockets/index.ts` — the socket send path carries the same code, so protection
  does not depend on which transport the client used.
- `config/env.ts` — `AA_ENCRYPTION_ROOT_KEY` promoted to required in production.
- `render.yaml` — the variable is now declared, with the rotation caveat.
- `scripts/audit-chat-encryption.ts` — **new.** Counts encrypted vs plaintext
  rows (read-only by default) and can backfill with `--apply`. Verifies each
  ciphertext round-trips *before* writing, and never prints a message body.

### Phase 2 — production web realtime

- `socket-client.ts` — deleted the `vercel.app` hostname bail-out that disabled
  realtime for **every** production web session. Replaced with an explicit
  `VITE_REALTIME_DISABLED` opt-out.
- `resolveSocketUrl()` — a production web build now addresses the backend origin
  directly instead of the static host, whose rewrite cannot perform a WebSocket
  upgrade. Dev still rides Vite's `/socket.io` proxy; native still uses its
  absolute URL. **No Vercel dashboard change is required** — the origin comes
  from the same constant native builds already use (`apiBase.getBackendOrigin`).
- `setupReconnectionLogic()` — the visibility handler only logged. It now
  actually retries and resets the attempt budget, as does a new `online`
  handler; previously five failed attempts ended realtime until a full reload.
- `AppContext.tsx` — a real 30 s polling fallback, active **only** while the
  socket is down, the tab is visible and the browser is online.

### Phase 3 — complete data hydration

- `services/initialHydration.ts` — **new.** `needsInitialHydration()` /
  `runInitialHydration()` / `clearHydrationMarker()`. Pulls all
  `CORE_SYNC_TABLES` (forced, cooldown bypassed) then the backend-owned mirrors,
  in dependency order. The marker is set **only if the core pull succeeded**.
- `AuthContext.triggerDataSync` — first login on a device hydrates everything;
  steady state keeps the per-page pull.
- `clearLocalAuthPresentationState` — clears hydration markers on sign-out, so a
  marker can never outlive the Dexie contents it vouches for.

### Phase 4 — logout data loss

- `lib/localDataRegistry.ts` — **new.** Declares all 31 logout-cleared tables
  with a restore strategy and a justification. `clearLocalUserData()` now
  iterates this registry, so the clear list and the sync layer cannot drift.
- `auth-sync-integration.ts` — `mergeLoanPaymentsFromBackend()` hydrates
  `db.loanPayments` from the repayments already embedded in `GET /loans`
  (**no extra request**). Idempotent by `cloudId`, then by
  (loan, amount, calendar day) adoption; never deletes a local-only row.
- `featureSyncService.ts` — `syncGoalContributions()` pulls per goal with
  bounded concurrency. Matches by `cloudId` → `clientRequestId` → same-day
  heuristic, so the contributions that *are* pushed are not duplicated.
- `goalContributions.ts` — now records the server id and idempotency key on the
  local row, which is what makes the above exact rather than heuristic.
- Dexie **v19** — `cloudId` indexed on `loanPayments` and `goalContributions`;
  `clientRequestId` added to the contribution row. Additive only.

**Known gaps, now documented in the registry rather than silent:**
`importHistories` (no server model), `gold` (endpoint exists, nothing requests
it), `investmentDocuments` / `investmentLinks` (no endpoint).

**Also found and NOT fixed here:** `PayEMI.tsx` and the Loans payment modal
write repayments to Dexie only — no client path posts to
`POST /loans/:id/payment`. The pull is therefore only half the lifecycle. The
push is deliberately out of scope because that endpoint *also* debits the
account and reduces the loan balance, which the client currently does itself —
pushing without first moving balance arithmetic to the server would double-apply
it. See §17.

### Phases 5 & 7 — role propagation and notification consistency

- `roleChange.announcer.ts` — **new.** Emits `role_changed` to the user's socket
  room on approve and on revoke.
- `advisorReview.service.ts` — both `prisma.notification.create` calls replaced
  with `notify()`, so approval and rejection now get preference handling, push,
  email **and** the realtime emit they previously skipped entirely.
- `notify.ts` — added the `system`, `booking` and `session` topics (mapped to
  "not silenceable"). Their absence was *why* these call sites bypassed
  `notify()` in the first place.
- `socket-client.ts` / `AuthContext.tsx` — client listens for `role_changed`,
  invalidates the role cache and re-reads from the server. The event is a prompt
  to re-read, never the new state itself, so the server stays authoritative.
  This removes the up-to-5-minute lag before the User/Advisor toggle appeared.
- `booking.controller.ts` (4 sites) and `session.controller.ts` (5 sites) —
  converted from `dispatchNotification` / `prisma.notification.create` to
  `notify()`. Chat messages are coalesced over 5 minutes so a back-and-forth is
  one notification, not twenty.

### Phase 6 — booking reschedule

- `booking.stateMachine.ts` — **new.** The single transition table, plus legacy
  status normalisation (`confirmed` → `accepted`), the round cap and the actor
  rules. Pure and side-effect free.
- `booking.controller.ts` — `rescheduleBooking` validates through the machine,
  accepts proposals from **either** party, stops the proposer answering their
  own proposal, and stores the message in its own column instead of overloading
  `rejectionReason`. New `acceptReschedule` / `declineReschedule` close the dead
  end. `cancelBooking` routed through the same machine and made conditional.
- `booking.routes.ts` — `PUT /bookings/:id/reschedule/accept` and
  `/decline` added; `/reschedule` is no longer advisor-only.
- Migration `20260924000000_booking_reschedule_negotiation` — four additive,
  nullable/defaulted columns and one partial index. **No data is rewritten.**
- `cleanup.worker.ts` — `runExpiredRescheduleSweep()` returns unanswered
  proposals to `pending` (not `cancelled` — the parties still want the
  consultation; only the proposed time expired).

### Phase 8 — KAI, measured before optimised

- `ai.timing.ts` — **new.** Per-operation p50/p95/p99 split by phase
  (`db` / `provider` / `total`) plus counters for timeouts, provider retries,
  cache hits and coalesced duplicates. Surfaced under `ai` on
  `GET /api/v1/health/metrics`. This is what answers "is it the database or the
  model provider", which per-route latency alone could not.
- `insights.cache.ts` — **new.** Per-user TTL cache (5 min, bounded, explicit
  invalidation) **plus in-flight coalescing** — the latter is the fix for
  duplicate/overlapping requests. Failures are never cached.
- `ai.routes.ts` — `/insights` and the four single-agent endpoints now go
  through it. Previously every call re-ran seven cross-region Prisma queries.
- `agents.ts` — `loadAgentData` timed as the `db` phase.
- `chat.llm.ts` — the **whole ladder walk** is timed as the `provider` phase,
  not just the call that answers, and every failover is counted. On the free
  Gemini tier (20 requests/model/day) a quota-exhausted request pays several
  failures first; charging only the successful call would have reported a
  healthy latency for a path that is seconds of failover.

*Not changed:* the ladder already had per-call timeouts (20 s), an overall
deadline (28 s), model cooldowns and a graceful `null` return that drops to
offline heuristics. "Timeouts fail gracefully" was already satisfied; what was
missing was visibility, which is what was added.

## 16. Test results

All run locally on 2026-09-24 against the final tree.

| Gate | Command | Result |
|---|---|---|
| Type-check | `npm run type-check` | **3/3 workspaces clean** |
| Lint | `npm run lint` | **0 errors**; frontend 1171 warnings against a 1171 ceiling, backend 636 against 652 — **zero net new warnings** |
| Backend unit | `npx jest ../quality/backend/unit` | **16 suites, 136 tests, all pass** |
| Frontend | `npx vitest run` | **64 files, 559 tests, all pass** |

New suites (68 tests, all passing):

| Suite | Covers |
|---|---|
| `quality/backend/unit/sessions/chat-encryption-fail-closed.test.ts` (7) | No key ⇒ throws, never returns plaintext; encryption failure ⇒ throws; AAD bound to session; legacy plaintext rows still readable |
| `quality/backend/unit/bookings/booking-state-machine.test.ts` (41) | Every state × actor pair; terminal states; the proposer cannot answer their own proposal; the round cap; **"no state is a dead end before completion"** as an explicit property |
| `quality/frontend/lib/localDataRegistry.test.ts` (8) | Every cleared table resolves to a real Dexie store, declares a strategy and justifies it; the money tables must stay recoverable |
| `quality/frontend/services/initialHydration.test.ts` (12) | All core tables requested (not page-scoped); mirror ordering; **marker not set when the core pull fails**; logout clears markers |

**Regression proof for the encryption fix:** the suite does not compile against
the pre-change module — `TS2305: Module '.../message.crypto' has no exported
member 'MessageEncryptionUnavailableError'`. The behavioural assertion that pins
the actual regression is `expect(returned).toBeUndefined()`, which the old
implementation (returning the plaintext) fails.

**Not run, and why:**

- **Backend integration suites** need a live Postgres. `backend/.env` points at
  **production**, so they were not run from here. They must be run against the
  scratch/staging database before merge — in particular anything touching
  `BookingRequest`, which now has four new columns.
- **Two-device E2E, document round-trip, role-activation timing.** These need
  two real clients and a deployed backend. The behaviour is unit-covered but not
  end-to-end verified; §17 lists what remains.

## 17. Remaining known issues

1. **EMI repayments are still push-orphaned.** Pull is fixed; no client path
   posts one. Fixing it properly means moving balance arithmetic for repayments
   to the server (`POST /loans/:id/payment` already does it, and the client
   currently does it too — doing both would double-apply). Recommend a dedicated
   follow-up on the money path.
2. **Phase 0 is unverified.** §14. `AA_ENCRYPTION_ROOT_KEY` must be set before
   deploying, or the API will not boot — by design, but it is a hard gate.
3. **Plaintext chat backfill not run.** The audit script exists; the count is
   unknown until someone runs it against production.
4. **Registry gaps stay gaps:** `importHistories`, `gold`,
   `investmentDocuments`, `investmentLinks`. Documented, not fixed.
5. **Frontend UI for reschedule accept/decline.** The endpoints and state
   machine exist; `BookAdvisor.tsx` does not yet render the two buttons. The
   client-side half of Phase 6 is not done.
6. **P0-1 client-side masking not fixed.** The dead Supabase OTP fallback in
   `OTPVerification.tsx` still turns a 502 into "invalid code" (§2.2). Left
   alone because P0-1 is most likely a mail-configuration failure and the brief
   put configuration verification first.
7. **Lint ceiling is at its limit.** The frontend gate is `--max-warnings 1171`
   and the tree sits at exactly 1171. The next warning anyone adds fails CI.

---

# PART III — Release validation (2026-09-24, second pass)

Against the "Final Validation & Remaining Critical Fixes" brief. Six items are
complete, four are blocked on access this session does not have, and one new
financial defect was found and fixed.

## 18. 🔴 New finding: goal contributions were double-deducting

Found while mapping the EMI flow (§5 of the brief), because the same derived
balance engine underpins both.

`POST /goals/:id/contribute` and `/withdraw` each write their **own side-effect
`Transaction`** server-side (`goal.controller.ts` →
`transactionRepository.createSideEffectTransaction`). That transaction syncs
into `db.transactions` like any other. The client also kept a
`goalContributions` row for the same movement — and the balance engine counts
**both**:

```ts
// computeAccountDeltas, before the fix
for (const contribution of goalContributions) {
  if (contribution.transactionId != null) continue;   // never set by any sync path
  addDelta(contribution.accountId, -Math.abs(...));   // ← second deduction
}
```

So every contribution made while online deducted twice. It was invisible because
the Goals page does not pull transactions — `PAGE_REQUIRED_TABLES['goals']` is
`['goals']` — so the second deduction only appeared once the user navigated to a
page that does.

**This was pre-existing.** But `syncGoalContributions()` (added in Part II)
would have spread it to every device, which is exactly the cross-module
inconsistency the brief warns against. Caught before merge.

**Fix:** a `serverAccounted` flag records which side owns the cash movement.
Set when the push succeeds, set on every row pulled from the server (a
contribution the server holds always has a transaction behind it), left false
for one recorded offline — which has no server transaction and must still be
counted locally. `computeAccountDeltas` skips a contribution that is
`transactionId != null || serverAccounted`.

Covered by `quality/frontend/lib/balance-double-count.test.ts` (8 tests). The
first returns 6,000 against the old engine and 8,000 against the fixed one.

## 19. §5 — EMI repayment as a financial transaction

### The flow, mapped before any change (as the brief required)

| Step | Before |
|---|---|
| UI | `PayEMI` and the Loans modal, each with their own copy of the logic |
| Payment request | **none — no client path ever called `POST /loans/:id/payment`** |
| Account debit | client: `applyAccountBalanceDeltas` / a direct `db.accounts.update` |
| Payment record | `db.loanPayments.add` — local only, never pushed |
| Loan balance | client subtracts, then pushes the result (`loans` is a synced table) |
| Server | `addLoanPayment` subtracts **again** from its own row; creates **no** cash transaction unless Ledger V2 is on — and `LEDGER_V2_ENABLED` is not set anywhere |
| Sync | repayment existed on one device, vanished at logout |

### Why the naive fix would have paid twice

Adding a POST beside those writes double-reduces the **loan**: the endpoint
subtracts the amount from its own row while the client pushes its own
subtraction through the loan sync. Whichever landed second subtracted again.

The account has the opposite hazard: because the endpoint creates no cash
transaction, the repayment row in Dexie is the *only* record of the money
leaving — so removing the local write would make the debit vanish entirely.

### The rule now enforced

> The **server** owns the loan's outstanding balance.
> The repayment **row** owns the account's cash movement.

`services/loanRepaymentService.ts` is the single path both UIs call. The local
loan write runs under `runWithCloudSyncSuppressed` — an optimistic display value
that is never pushed — and the server's figure replaces it via a `loans` pull as
soon as the POST returns. No explicit account write at all: `computeAccountDeltas`
already derives the debit from the row, which is why the old
`applyAccountBalanceDeltas` call was redundant *and* wrong.

### One action, one debit — four layers

1. the caller's submit lock (`useSubmitLock`, present in both UIs);
2. `clientRequestId`, minted **once** and persisted on the row, so an offline
   repayment pushed days later carries the same key;
3. the same value as the `Idempotency-Key` header;
4. the server's replay check on `LoanPayment.clientRequestId`, plus
   `duplicateSubmitGuard` on the route.

`pushPendingLoanRepayments()` retries offline rows under their original key, and
runs on hydration and on the realtime-fallback tick.

### Tests — `quality/frontend/services/loanRepayment.test.ts` (16)

Successful payment · validation (over-balance, zero, negative) · push failure ·
offline · loan with no server identity · retry reuses the original key · retry
failure leaves the row pending · skips an unpushable parent · **the local loan
write is suppressed** · **no account write** · two genuine actions get two
different keys (a replay is deduplicated; a second real payment is not).

## 20. §3 & §11 — staging integration tests and migration safety

Production was never used. A disposable PostgreSQL 18 cluster on `127.0.0.1:55433`
(database `kanaku_ci`) was created from scratch.

| Check | Result |
|---|---|
| `prisma migrate deploy` on an empty database | **all migrations applied**, including `20260924000000_booking_reschedule_negotiation` |
| Drift guard (`migrate diff --from-migrations --to-schema --exit-code`) | **No difference detected** — schema and migrations agree |
| New columns present and correctly typed | `rescheduleCount` int NOT NULL DEFAULT 0, `rescheduleProposedBy`/`rescheduleMessage` text NULL, `rescheduleExpiresAt` timestamp(3) NULL |
| Partial index | `BookingRequest_reschedule_expiry_idx … WHERE status = 'reschedule'` |
| **Full integration suite** | **87 suites, 1128 tests, all pass** (248 s) |

The migration is additive only — four nullable/defaulted columns and one index.
No data is rewritten, and an older API instance running against the new schema
is unaffected.

### The durable fix: production can no longer be a test database

`backend/.env` points at production and `src/db/prisma.ts` loads it. `.env.test`
happens to win because dotenv never overrides an existing key — but that is an
ordering accident, not a guarantee. `quality/backend/tests/setup.ts` now asserts
the *resolved* `DATABASE_URL` looks like a test database (name matching
`test|ci|scratch|staging|shadow`, or a loopback host) and throws otherwise,
with `ALLOW_NON_TEST_DATABASE=true` as a deliberate override.

## 21. §6 — reschedule UI completed

**Advisor** (`AdvisorWorkspace.tsx`): already had approve / decline / reschedule
with a date-and-time modal. Added the **optional message**, now sent as `reason`
and stored in `rescheduleMessage` rather than being overloaded onto
`rejectionReason`.

**User** (`BookAdvisor.tsx`): the missing half.
- A violet panel on any `reschedule` booking naming who proposed the time, the
  proposed slot and the message. The date/time chips already showed the proposed
  slot, so without this a proposal was indistinguishable from the original booking.
- **Accept new time** / **Decline** buttons calling
  `PUT /bookings/:id/reschedule/accept|decline`.
- When *this user* is the proposer, the buttons are replaced by "Waiting for your
  advisor to respond" — the backend refuses a proposer answering their own
  proposal (`AWAITING_OTHER_PARTY`), so offering the button would only ever 403.
- A single in-flight guard (`answeringBookingId`) blocks a double-tap.

Every UI state corresponds to a backend state; no UI-only states were invented.

## 22. §8 — encryption test cleanup

The previous suite imported `MessageEncryptionUnavailableError`, so against the
fail-open implementation it did not **compile** — the regression surfaced as
`TS2305: has no exported member`, which reads like a broken test rather than a
security regression.

Rewritten to import only `encryptMessageBody` / `decryptMessageBody` and assert
the error's `code` structurally. It now compiles against **either**
implementation. Verified by swapping the pre-change module back in:

```
Expected: "threw"
Received: "returned the PLAINTEXT (consultations would be stored in the clear)"
Expected: "MESSAGE_ENCRYPTION_UNAVAILABLE"
Received: undefined
→ 3 failed, 9 passed
```

Coverage (12 unit + 8 integration): missing key · key present but cipher fails ·
plaintext never returned · error leaks no plaintext · machine-readable code ·
successful encryption · ciphertext contains no plaintext · AAD session binding ·
sender-derived key · successful decryption · legacy plaintext rows still render ·
one unreadable row does not blank a thread. Integration adds ciphertext at rest,
random IV, cross-thread rejection and cross-sender rejection.

## 23. §12 — security review (static portions)

| Check | Result |
|---|---|
| Production secrets committed | **None.** Only `*.example` files and the frontend `.env.android` / `.env.ios`, which carry the Supabase **anon/publishable** key — public by design (it ships in the bundle; RLS is the control) |
| `AA_ENCRYPTION_ROOT_KEY` hardcoded | **No occurrence** in any tracked file |
| Supabase **service-role** key reachable from the client | **No reference** anywhere under `frontend/src` |
| Plaintext fallback in chat | **Removed** — fails closed |
| Sensitive values in logs | No password, token or key **values** logged. Emails and field *names* are, which is pre-existing |
| Vault dev-key fallback | `vault.storage.ts` falls back to `AA_ENCRYPTION_ROOT_KEY`, so **making that key required closes the vault hole too**. Files already written under the public dev key stay that way until `scripts/reencrypt-vault-files.ts` is run — a Phase 0 follow-up |

Authorization (403 for non-party document/chat/booking access, role escalation,
feature-flag bypass) is exercised by `security.test.ts`, `bills-security.test.ts`
and `ai-security.test.ts` — all green in the 87-suite run.

## 24. Full gate status

| Gate | Result |
|---|---|
| Type-check | **3/3 workspaces clean** |
| Lint | **0 errors**; frontend 1171/1171, backend 636/652 — **zero net new warnings** |
| Backend unit | **16 suites, 141 tests pass** |
| Backend integration (scratch PG) | **87 suites, 1128 tests pass** |
| Frontend | **66 files, 583 tests pass** |

New tests this pass: 24 (16 EMI + 8 balance double-count), plus the 12 rewritten
encryption tests.

## 25. Blocked — needs access this session does not have

| Brief item | Blocker | What is needed |
|---|---|---|
| §1 Production encryption key | No Render access | Generate `openssl rand -hex 32`, set `AA_ENCRYPTION_ROOT_KEY`, restart, confirm boot **before** deploying this change set — the API now refuses to start without it |
| §2 Chat encryption audit | No production credentials | `cd backend && npx tsx scripts/audit-chat-encryption.ts` (read-only). **Stop and review before `--apply`** |
| §4 Two-device sync validation | Needs two real devices + deployed backend | The 20-item matrix in §12 of Part I |
| §9 Realtime production validation | Needs the deployed frontend | Web↔Web, Android↔Web, reconnect, polling on/off, no duplicate writes |
| §10 KAI production measurement | Needs production traffic | `GET /api/v1/health/metrics` → `.ai` now reports db/provider/total p50–p99, retries, timeouts, cache hits and coalesced duplicates |

## 26. Remaining known issues

1. **Vault files under the public dev key** — run `reencrypt-vault-files.ts`
   after setting the root key.
2. **Registry gaps** unchanged: `importHistories`, `gold`,
   `investmentDocuments`, `investmentLinks` (documented, not recoverable).
3. **P0-1 client-side masking** — the dead Supabase OTP fallback in
   `OTPVerification.tsx` still turns a 502 into "invalid code" (Part I §2.2).
4. **Lint ceiling at its limit** — frontend is at exactly 1171/1171.
5. **Pre-existing plaintext contributions** — the `serverAccounted` fix applies
   going forward and to pulled rows. Rows written by an older build carry no
   flag and are still counted locally; where the server also created a
   transaction, that account's derived balance stays too low until the
   contribution is re-pulled. A one-off reconciliation may be warranted — worth
   a decision, not a silent migration.
