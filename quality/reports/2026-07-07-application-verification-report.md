# Application Verification Report — 2026-07-07

**Scope:** full-codebase verification of Kanaku (income + expense tracker, 4 roles: Admin / Manager / User / Advisor) — frontend, backend API, database, security, performance, logging, feature completeness.
**Method:** static code audit of every route/middleware/schema file, generated-doc cross-checks, full local test-suite execution (frontend Vitest, backend Jest against a Docker Postgres), from-scratch migration verification, and targeted fixes applied during the audit (listed in §9.0).

---

## 1. Executive summary

**Overall health: GOOD with one architectural requirement gap.** The backend is defensively engineered well beyond typical MVP quality: every feature router mounts JWT auth at router level, role/feature gates are server-authoritative (roles always re-read from the DB, never trusted from tokens), all money is `Decimal(12,2)`, every mutating route is Zod-validated, financial writes are wrapped in transactions and audited at the Prisma layer with before/after snapshots, logs are deep-redacted, and rate limiting is layered per endpoint class. Frontend tests pass 149/149, the backend suite passes ~93% (details in §8), and all migrations apply cleanly from scratch.

### Top issues

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | **HIGH (requirement gap)** | **Admin/Manager and User/Advisor are NOT on separate platforms.** One SPA bundle (single Vercel deployment, `vercel.json` routes everything to one `index.html`) and one API service (`kanaku.fly.dev`) serve all four roles. Separation is *logical* (server-enforced RBAC route groups) not *physical* (separate deployment/host). See §3.4. | **Open — needs a deployment decision** (infra changes are currently under the project freeze policy; this is a legitimate business trigger to revisit) |
| 2 | **HIGH (data integrity)** | **Schema/migration drift: 3 live columns had no migration.** `Account.openingBalance` (the basis of the derived-balance model), `AuditLog.requestId` (+ its index), and `Notification.requestId` are declared in `schema.prisma` and written by the app, but **no migration creates them**. Any DB built from `prisma migrate deploy` (fresh env, DR restore, new region) lacked them → every `auditLog.create()` threw *"column requestId does not exist"* and the **durable audit trail silently failed to persist** (best-effort writes swallow the error). `openingBalance` had been hand-applied to prod out-of-band (per `fly.toml`). | **FIXED this session** — new migration `20260707000000_sync_schema_drift`; verified 4/4 migrations apply from scratch with **zero residual drift** (`prisma migrate diff` → empty) |
| 3 | **HIGH (security)** | **Admin "Block user" was cosmetic.** The admin UI writes `status:'blocked'` but every enforcement point (auth middleware ×3, login ×2, refresh, sockets) only checked `status==='suspended'` — a blocked user could keep logging in and using all APIs. The endpoint also accepted any unvalidated status string. | **FIXED this session** (shared `isAccountLocked()` helper + input allow-list) |
| 4 | **MEDIUM (security)** | **Admin mutations didn't evict the 60s auth-snapshot cache.** Suspending, demoting, un-approving, or deleting a user left their old role/status honored for up to 60 s. The invalidation hook existed but was never called from admin flows. | **FIXED this session** (7 call sites) |
| 5 | **MEDIUM (correctness)** | **Feature-gate denied core modules on a fresh install.** `DEFAULT_MODULE_ACCESS` omitted `goals`/`loans`/`investments`, so before an admin saved feature settings, the module-level check 403'd every non-admin `POST /goals`, `/loans`, `/investments` (caught by the backend suite as 403-instead-of-201/400). | **FIXED this session** (added the three modules to defaults) |
| 6 | **MEDIUM (security/UX)** | **Frontend granted the admin/manager/advisor UI shell to any email *containing* those substrings** (`cleanEmail.includes('admin')`), e.g. `myadmin@gmail.com`. UI-only (backend never trusted it), but it spoofs the admin interface and its exact-match branches were dead code (`'admin@kanaku.com' === 'admin@KANAKU.com'` after lowercasing is always false). Previously documented in the 2026-06-21 audit as "recommend narrowing" — never done. | **FIXED this session** (exact canonical-account map, both copies) |
| 7 | **MEDIUM (config)** | **The server-side PIN gate is OFF in production** (`PIN_GATE_ENABLED` unset → `pinGate` no-ops), so the app PIN is a client-side lock only. The middleware is built, mounted on transactions/sync/dashboard, and tested — it just isn't switched on. | **Open — config decision** (set `PIN_GATE_ENABLED=true` in Fly secrets after QA) |

Also notable: the generated API contract docs (`docs/api/contracts/api-index.json`) label **201 of 233 endpoints as "public" when in reality only 14 are** — the generator misses router-level `router.use(authMiddleware)`. Nothing is actually unprotected, but the docs would fail any external audit. See §2.3.

---

## 2. Endpoint documentation

### 2.1 How auth works (applies to every non-public endpoint)

| Item | Value |
|---|---|
| Auth header | `Authorization: Bearer <accessToken>` (backend-issued JWT, 15-min TTL) |
| Refresh | `POST /api/v1/auth/refresh` — web: `HttpOnly; Secure; SameSite=Strict` cookie `kanaku_rt` scoped to `/api/v1/auth` (7-day TTL); native (Capacitor): token in body + `x-client-platform: native` header |
| Content type | `application/json`, body limit 1 MB |
| Correlation | optional `x-request-id` (validated `[A-Za-z0-9_-]{8,128}`), echoed back |
| Success shape | `200/201` `{ "success": true, "data": … }` (some legacy routes return the object directly) |
| Error shape | `{ "success": false, "error": "<user-safe message>", "code": "<MACHINE_CODE>" }` — 400 `VALIDATION_ERROR`, 401 `NO_TOKEN / REFRESH_TOKEN_INVALID / SESSION_IDLE_TIMEOUT`, 403 `ACCOUNT_SUSPENDED / PIN_VERIFICATION_REQUIRED / feature-gate denials`, 404 `NOT_FOUND`, 429 rate-limit, 5xx generic (no internals leaked) |
| Rate limits | global 60 req/min/IP+user (prod), auth 20/min, login-challenge 5/min, destructive ops 3/min, bills 10/min, receipts 8/min, sync 100/min |

**Representative request/response example** (`POST /api/v1/transactions`, gate `transactions.addTransaction`, idempotent):

```json
// Request
{ "accountId": "uuid", "type": "expense", "amount": 450.75, "category": "Food & Dining",
  "subcategory": "Restaurants", "description": "Team lunch", "date": "2026-07-07" }
// 201 Response
{ "success": true, "data": { "id": "uuid", "userId": "uuid", "accountId": "uuid", "type": "expense",
  "amount": "450.75", "category": "Food & Dining", "date": "2026-07-07T00:00:00.000Z", "version": 1 } }
// 400 (validation)  { "success": false, "error": "Amount must be greater than 0", "code": "VALIDATION_ERROR" }
```

Validation rules on this route (server-side, `transaction.validation.ts`): `amount` positive, ≤ 999,999,999; `type ∈ {income, expense, transfer, withdrawal}`; `category` required ≤ 80 chars; `date` coerced/validated; every string length-bounded; bulk ≤ 100 items; list `limit` ≤ 200.

Full per-endpoint request/response schemas already exist in-repo and were cross-checked against the route sources: `docs/openapi.yaml` (137 paths, served live at `/api-docs`) and `docs/api/contracts/<feature>/*.api.json` (238 files). **Caution:** trust the `Auth / Gates` column below (parsed from the actual route files this audit), *not* the `auth` field in `api-index.json` (see §2.3).

### 2.2 Complete endpoint inventory (261 routes, parsed from route sources)

Legend: `JWT` = `Authorization: Bearer` required (router-level `authMiddleware`) · `PIN-gate` = server PIN lock when `PIN_GATE_ENABLED=true` · `role=` = `requireRole` (hard 403) · `feature=` = admin-panel feature gate (`requireFeature(module, subFeature)`) · `approved` = advisor must be admin-approved · validation column = Zod `validateBody/Query/Params` + idempotency-key support.

Not listed below (mounted in `app.ts` directly): `GET /health` (public liveness), `GET /api/v1/health/deep` (JWT), `GET /api/v1/health/metrics` (JWT + role=admin), `GET /api-docs` (public Swagger UI). `/api/v1/aa/*` is additionally **mount-gated off** unless `ENABLED_MODULES=aa` (production default: unreachable, 404).

| # | Method | Path | Auth / Gates | Server validation |
|---|---|---|---|---|
| 1 | POST | `/api/v1/auth/check-email` | PUBLIC | — |
| 2 | POST | `/api/v1/auth/register` | PUBLIC | — |
| 3 | POST | `/api/v1/auth/login/challenge` | PUBLIC | — |
| 4 | POST | `/api/v1/auth/login` | PUBLIC | — |
| 5 | POST | `/api/v1/auth/refresh` | PUBLIC | — |
| 6 | POST | `/api/v1/auth/logout` | PUBLIC | — |
| 7 | GET | `/api/v1/auth/profile` | JWT | — |
| 8 | PUT | `/api/v1/auth/profile` | JWT | body |
| 9 | POST | `/api/v1/auth/forgot-password` | PUBLIC | body |
| 10 | POST | `/api/v1/auth/verify-reset-code` | PUBLIC | body |
| 11 | POST | `/api/v1/auth/reset-password` | PUBLIC | body |
| 12 | POST | `/api/v1/auth/otp/send` | JWT | — |
| 13 | POST | `/api/v1/auth/otp/verify` | JWT | — |
| 14 | GET | `/api/v1/auth/devices` | JWT | — |
| 15 | DELETE | `/api/v1/auth/devices/:deviceId` | JWT | — |
| 16 | DELETE | `/api/v1/auth/account` | JWT | — |
| 17 | GET | `/api/v1/avatars/dicebear/:style/svg` | PUBLIC | query,params |
| 18 | POST | `/api/v1/webhooks/sendgrid` | HMAC(SendGrid) | body |
| 19 | GET | `/api/v1/sync/meta` | JWT | — |
| 20 | POST | `/api/v1/sync/pull` | JWT + PIN-gate | — |
| 21 | POST | `/api/v1/sync/push` | JWT + PIN-gate | — |
| 22 | POST | `/api/v1/sync/register-device` | JWT | — |
| 23 | GET | `/api/v1/sync/devices` | JWT | — |
| 24 | POST | `/api/v1/sync/deactivate-device` | JWT | — |
| 25 | POST | `/api/v1/pin/create` | JWT | body |
| 26 | POST | `/api/v1/pin/verify` | JWT | body |
| 27 | POST | `/api/v1/pin/verify-security` | JWT | body |
| 28 | POST | `/api/v1/pin/update` | JWT | body |
| 29 | GET | `/api/v1/pin/status` | JWT | — |
| 30 | GET | `/api/v1/pin/key-backup` | JWT | — |
| 31 | POST | `/api/v1/pin/key-backup` | JWT | body |
| 32 | DELETE | `/api/v1/pin/key-backup` | JWT | — |
| 33 | GET | `/api/v1/pin/expiring-soon` | JWT | — |
| 34 | POST | `/api/v1/pin/reset` | JWT | body |
| 35 | POST | `/api/v1/pin/self-reset` | JWT | — |
| 36 | GET | `/api/v1/transactions` | JWT + PIN-gate | query |
| 37 | POST | `/api/v1/transactions` | JWT + PIN-gate + feature=transactions.addTransaction | body,idempotent |
| 38 | GET | `/api/v1/transactions/export` | JWT + PIN-gate + feature=transactions.exportStatement | — |
| 39 | POST | `/api/v1/transactions/import/third-party` | JWT + PIN-gate + feature=transactions.importThirdPartyData | — |
| 40 | POST | `/api/v1/transactions/bulk` | JWT + PIN-gate + feature=transactions.addTransaction | body,idempotent |
| 41 | GET | `/api/v1/transactions/:id` | JWT + PIN-gate | params |
| 42 | PUT | `/api/v1/transactions/:id` | JWT + PIN-gate + feature=transactions.editTransaction | body,params |
| 43 | DELETE | `/api/v1/transactions/:id` | JWT + PIN-gate + feature=transactions.deleteTransaction | params |
| 44 | GET | `/api/v1/transactions/account/:accountId` | JWT + PIN-gate | params |
| 45 | GET | `/api/v1/accounts` | JWT + PIN-gate | — |
| 46 | POST | `/api/v1/accounts` | JWT + PIN-gate + feature=accounts.createAccount | body |
| 47 | GET | `/api/v1/accounts/:id` | JWT + PIN-gate | params |
| 48 | PUT | `/api/v1/accounts/:id` | JWT + PIN-gate + feature=accounts.editAccount | body,params |
| 49 | DELETE | `/api/v1/accounts/:id` | JWT + PIN-gate + feature=accounts.deleteAccount | params |
| 50 | POST | `/api/v1/accounts/:id/transfer` | JWT + PIN-gate + feature=accounts.accountTransfer | params |
| 51 | POST | `/api/v1/accounts/:id/reconcile` | JWT + PIN-gate + feature=accounts.reconciliation | params |
| 52 | GET | `/api/v1/goals` | JWT + PIN-gate | — |
| 53 | POST | `/api/v1/goals` | JWT + PIN-gate + feature=goals.createGoal | body,idempotent |
| 54 | GET | `/api/v1/goals/:id` | JWT + PIN-gate | params |
| 55 | PUT | `/api/v1/goals/:id` | JWT + PIN-gate + feature=goals.editGoal | body,params |
| 56 | DELETE | `/api/v1/goals/:id` | JWT + PIN-gate + feature=goals.deleteGoal | params |
| 57 | GET | `/api/v1/goals/:id/members` | JWT + PIN-gate | params |
| 58 | POST | `/api/v1/goals/:id/members` | JWT + PIN-gate + feature=goals.groupGoals | body,params,idempotent |
| 59 | DELETE | `/api/v1/goals/:id/members/:memberId` | JWT + PIN-gate + feature=goals.groupGoals | — |
| 60 | GET | `/api/v1/loans` | JWT + PIN-gate | — |
| 61 | POST | `/api/v1/loans` | JWT + PIN-gate + feature=loans.borrowMoney | body,idempotent |
| 62 | GET | `/api/v1/loans/:id` | JWT + PIN-gate | params |
| 63 | PUT | `/api/v1/loans/:id` | JWT + PIN-gate | body,params |
| 64 | DELETE | `/api/v1/loans/:id` | JWT + PIN-gate | params |
| 65 | POST | `/api/v1/loans/:id/payment` | JWT + PIN-gate + feature=loans.emiReminder | body,params,idempotent |
| 66 | POST | `/api/v1/loans/:id/settle` | JWT + PIN-gate + feature=loans.loanSettlement | params,idempotent |
| 67 | GET | `/api/v1/settings` | JWT | — |
| 68 | PUT | `/api/v1/settings` | JWT | body |
| 69 | GET | `/api/v1/settings/export` | JWT | — |
| 70 | DELETE | `/api/v1/settings/account` | JWT | idempotent |
| 71 | POST | `/api/v1/settings/account/cancel-deletion` | JWT | — |
| 72 | GET | `/api/v1/friends` | JWT | — |
| 73 | POST | `/api/v1/friends` | JWT | body |
| 74 | POST | `/api/v1/friends/bulk` | JWT | body |
| 75 | POST | `/api/v1/friends/import` | JWT | — |
| 76 | GET | `/api/v1/friends/:id` | JWT | params |
| 77 | PUT | `/api/v1/friends/:id` | JWT | body,params |
| 78 | DELETE | `/api/v1/friends/:id` | JWT | params |
| 79 | GET | `/api/v1/investments` | JWT + PIN-gate | — |
| 80 | GET | `/api/v1/investments/:id` | JWT + PIN-gate | params |
| 81 | POST | `/api/v1/investments` | JWT + PIN-gate + feature=investments.addInvestment | body |
| 82 | PUT | `/api/v1/investments/:id` | JWT + PIN-gate + feature=investments.addInvestment | body,params |
| 83 | DELETE | `/api/v1/investments/:id` | JWT + PIN-gate + feature=investments.addInvestment | params |
| 84 | GET | `/api/v1/investments/analytics/portfolio` | JWT + PIN-gate + feature=investments.portfolioAnalytics | — |
| 85 | GET | `/api/v1/investments/sip/list` | JWT + PIN-gate + feature=investments.sipTracking | — |
| 86 | GET | `/api/v1/investments/group/list` | JWT + PIN-gate + feature=investments.groupInvestments | — |
| 87 | GET | `/api/v1/reports/export/pdf` | JWT + PIN-gate + feature=reports.pdfExport | — |
| 88 | GET | `/api/v1/reports/export/excel` | JWT + PIN-gate + feature=reports.excelExport | — |
| 89 | GET | `/api/v1/reports/export/csv` | JWT + PIN-gate + feature=reports.csvExport | — |
| 90 | GET | `/api/v1/reports/ai-insights` | JWT + PIN-gate + feature=reports.aiInsightsReport | — |
| 91 | GET | `/api/v1/reports/forecast` | JWT + PIN-gate + feature=reports.forecasting | — |
| 92 | GET | `/api/v1/todos` | JWT | — |
| 93 | POST | `/api/v1/todos` | JWT | body |
| 94 | PUT | `/api/v1/todos/:id` | JWT | body,params |
| 95 | DELETE | `/api/v1/todos/:id` | JWT | params |
| 96 | GET | `/api/v1/todos/lists` | JWT | — |
| 97 | POST | `/api/v1/todos/lists` | JWT | — |
| 98 | PUT | `/api/v1/todos/lists/:id` | JWT | — |
| 99 | DELETE | `/api/v1/todos/lists/:id` | JWT | — |
| 100 | GET | `/api/v1/todos/items` | JWT | — |
| 101 | GET | `/api/v1/todos/lists/:listId/items` | JWT | — |
| 102 | POST | `/api/v1/todos/items` | JWT | — |
| 103 | PUT | `/api/v1/todos/items/:id` | JWT | — |
| 104 | DELETE | `/api/v1/todos/items/:id` | JWT | — |
| 105 | GET | `/api/v1/todos/shares` | JWT | — |
| 106 | POST | `/api/v1/todos/lists/:listId/share` | JWT | — |
| 107 | PUT | `/api/v1/todos/shares/:id` | JWT | — |
| 108 | DELETE | `/api/v1/todos/shares/:id` | JWT | — |
| 109 | GET | `/api/v1/groups` | JWT | — |
| 110 | POST | `/api/v1/groups/repair-all-members` | JWT | — |
| 111 | POST | `/api/v1/groups` | JWT | body |
| 112 | GET | `/api/v1/groups/:id` | JWT | params |
| 113 | PUT | `/api/v1/groups/:id` | JWT | body,params |
| 114 | POST | `/api/v1/groups/:id/repair-members` | JWT | params |
| 115 | DELETE | `/api/v1/groups/:id` | JWT | params |
| 116 | POST | `/api/v1/categorize` | JWT | body |
| 117 | POST | `/api/v1/learn` | JWT | body |
| 118 | POST | `/api/v1/voice/process-audio` | JWT + aiFeature=voiceAssistant | — |
| 119 | POST | `/api/v1/voice/process` | JWT + aiFeature=voiceAssistant | body |
| 120 | POST | `/api/v1/voice/learn` | JWT + aiFeature=voiceAssistant | body |
| 121 | POST | `/api/v1/import/upload` | JWT + feature=accounts.importStatement | — |
| 122 | POST | `/api/v1/import/confirm` | JWT + feature=accounts.importStatement | body |
| 123 | GET | `/api/v1/import/:sessionId` | JWT + feature=accounts.importStatement | — |
| 124 | POST | `/api/v1/bookings` | JWT + feature=bookAdvisor.createBooking | body |
| 125 | GET | `/api/v1/bookings` | JWT | — |
| 126 | GET | `/api/v1/bookings/:id` | JWT | — |
| 127 | PUT | `/api/v1/bookings/:id/accept` | JWT + role=advisor + approved | — |
| 128 | PUT | `/api/v1/bookings/:id/reject` | JWT + role=advisor + approved | — |
| 129 | PUT | `/api/v1/bookings/:id/reschedule` | JWT + role=advisor + approved | body,params |
| 130 | PUT | `/api/v1/bookings/:id/cancel` | JWT | body,params |
| 131 | GET | `/api/v1/bookings/workspace/clients` | JWT + role=advisor + approved | — |
| 132 | POST | `/api/v1/bookings/:bookingId/fee/pay` | JWT + role=advisor + approved | — |
| 133 | POST | `/api/v1/bookings/sessions/:sessionId/review` | JWT + feature=bookAdvisor.reviews | — |
| 134 | GET | `/api/v1/advisors` | JWT + feature=bookAdvisor | — |
| 135 | GET | `/api/v1/advisors/application/my` | JWT | — |
| 136 | GET | `/api/v1/advisors/application/:id/document/:docType` | JWT | params |
| 137 | POST | `/api/v1/advisors/apply` | JWT | — |
| 138 | PUT | `/api/v1/advisors/online-status` | JWT + role=advisor + approved | body |
| 139 | PUT | `/api/v1/advisors/role-mode` | JWT + role=advisor,admin,manager | body |
| 140 | POST | `/api/v1/advisors/availability` | JWT + role=advisor + approved | body |
| 141 | PUT | `/api/v1/advisors/availability/status` | JWT + role=advisor + approved | body |
| 142 | GET | `/api/v1/advisors/:id/availability` | JWT + feature=bookAdvisor | params |
| 143 | DELETE | `/api/v1/advisors/availability/:id` | JWT + role=advisor + approved | params |
| 144 | GET | `/api/v1/advisors/me/sessions` | JWT + role=advisor + approved | — |
| 145 | PUT | `/api/v1/advisors/sessions/:id/rate` | JWT | body,params |
| 146 | GET | `/api/v1/advisors/admin/applications` | JWT + role=admin,manager | — |
| 147 | PUT | `/api/v1/advisors/admin/:id/approve` | JWT + role=admin,manager | params |
| 148 | PUT | `/api/v1/advisors/admin/:id/reject` | JWT + role=admin,manager | body,params |
| 149 | GET | `/api/v1/advisors/:id` | JWT | params |
| 150 | GET | `/api/v1/sessions/:id` | JWT | params |
| 151 | POST | `/api/v1/sessions/:id/messages` | JWT + feature=bookAdvisor.chat | body,params |
| 152 | GET | `/api/v1/sessions/:id/messages` | JWT + feature=bookAdvisor.chat | params |
| 153 | POST | `/api/v1/sessions/:id/start` | JWT | params |
| 154 | POST | `/api/v1/sessions/:id/complete` | JWT | body,params |
| 155 | POST | `/api/v1/sessions/:id/cancel` | JWT | body,params |
| 156 | POST | `/api/v1/payments/webhook` | JWT | — |
| 157 | GET | `/api/v1/payments` | JWT | — |
| 158 | GET | `/api/v1/payments/:id` | JWT | — |
| 159 | POST | `/api/v1/payments/initiate` | JWT | body |
| 160 | POST | `/api/v1/payments/complete` | JWT | body |
| 161 | POST | `/api/v1/payments/fail` | JWT | body |
| 162 | POST | `/api/v1/payments/refund` | JWT | body |
| 163 | GET | `/api/v1/notifications` | JWT | query |
| 164 | GET | `/api/v1/notifications/unread/count` | JWT | — |
| 165 | GET | `/api/v1/notifications/:id` | JWT | params |
| 166 | PUT | `/api/v1/notifications/:id/read` | JWT | params |
| 167 | POST | `/api/v1/notifications/mark-all-read` | JWT | — |
| 168 | DELETE | `/api/v1/notifications/:id` | JWT | params |
| 169 | DELETE | `/api/v1/notifications` | JWT | — |
| 170 | POST | `/api/v1/notifications/send` | JWT + role=admin | body |
| 171 | POST | `/api/v1/devices` | JWT | body |
| 172 | GET | `/api/v1/devices` | JWT | — |
| 173 | GET | `/api/v1/devices/:deviceId` | JWT | params |
| 174 | POST | `/api/v1/devices/:deviceId/sync` | JWT | params |
| 175 | PUT | `/api/v1/devices/:deviceId/tokens` | JWT | body,params |
| 176 | POST | `/api/v1/devices/:deviceId/deactivate` | JWT | params |
| 177 | DELETE | `/api/v1/devices/:deviceId` | JWT | params |
| 178 | GET | `/api/v1/dashboard/summary` | JWT + PIN-gate | query |
| 179 | GET | `/api/v1/dashboard/cashflow` | JWT + PIN-gate | query |
| 180 | GET | `/api/v1/admin/features` | JWT + role=admin | — |
| 181 | GET | `/api/v1/admin/ai-features` | JWT + role=admin | — |
| 182 | GET | `/api/v1/admin/users` | JWT + role=admin | — |
| 183 | GET | `/api/v1/admin/users/pending` | JWT + role=admin | — |
| 184 | POST | `/api/v1/admin/users/:advisorId/approve` | JWT + role=admin | — |
| 185 | POST | `/api/v1/admin/users/:advisorId/reject` | JWT + role=admin | — |
| 186 | GET | `/api/v1/admin/users/activity` | JWT + role=admin | — |
| 187 | POST | `/api/v1/admin/users/:userId/status` | JWT + role=admin | — |
| 188 | POST | `/api/v1/admin/users/:userId/role` | JWT + role=admin | — |
| 189 | DELETE | `/api/v1/admin/users/:userId` | JWT + role=admin | — |
| 190 | GET | `/api/v1/admin/users/:userId/storage` | JWT + role=admin | — |
| 191 | GET | `/api/v1/admin/stats` | JWT + role=admin | — |
| 192 | GET | `/api/v1/admin/cache/metrics` | JWT + role=admin | query |
| 193 | POST | `/api/v1/admin/features/toggle` | JWT + role=admin | — |
| 194 | POST | `/api/v1/admin/ai-features/toggle` | JWT + role=admin | — |
| 195 | GET | `/api/v1/admin/features/matrix` | JWT + role=admin | — |
| 196 | POST | `/api/v1/admin/features/matrix` | JWT + role=admin | — |
| 197 | GET | `/api/v1/admin/ai-features/matrix` | JWT + role=admin | — |
| 198 | POST | `/api/v1/admin/ai-features/matrix` | JWT + role=admin | — |
| 199 | GET | `/api/v1/admin/reports/users` | JWT + role=admin | — |
| 200 | GET | `/api/v1/admin/reports/revenue` | JWT + role=admin | — |
| 201 | GET | `/api/v1/admin/ai/overview` | JWT + role=admin | — |
| 202 | GET | `/api/v1/admin/ai/users` | JWT + role=admin | query |
| 203 | GET | `/api/v1/admin/ai/insights` | JWT + role=admin | query |
| 204 | GET | `/api/v1/admin/ai/patterns` | JWT + role=admin | — |
| 205 | GET | `/api/v1/admin/ai/accuracy` | JWT + role=admin | — |
| 206 | GET | `/api/v1/admin/ai/raw/:userId` | JWT + role=admin | params |
| 207 | POST | `/api/v1/admin/ai/run/features` | JWT + role=admin | body |
| 208 | POST | `/api/v1/admin/ai/run/predictions` | JWT + role=admin | body |
| 209 | GET | `/api/v1/admin/ai/config` | JWT + role=admin | — |
| 210 | POST | `/api/v1/admin/ai/config` | JWT + role=admin | — |
| 211 | GET | `/api/v1/stocks/markets` | PUBLIC | query |
| 212 | GET | `/api/v1/stocks/search` | PUBLIC | query |
| 213 | GET | `/api/v1/stocks/stock` | PUBLIC | query |
| 214 | GET | `/api/v1/stocks/batch` | PUBLIC | query |
| 215 | POST | `/api/v1/otp/send` | JWT | body |
| 216 | POST | `/api/v1/otp/verify` | JWT | body |
| 217 | POST | `/api/v1/aa/notification` | JWT | body |
| 218 | POST | `/api/v1/aa/consent` | JWT | body |
| 219 | GET | `/api/v1/aa/consent/status/:consentHandle` | JWT | params |
| 220 | GET | `/api/v1/aa/consent/artifact/:consentId` | JWT | params |
| 221 | POST | `/api/v1/aa/data/session` | JWT | body |
| 222 | GET | `/api/v1/aa/data/fetch/:sessionId` | JWT | params |
| 223 | GET | `/api/v1/aa/consents` | JWT | — |
| 224 | POST | `/api/v1/aa/consent/revoke/:consentId` | JWT | params |
| 225 | GET | `/api/v1/aa/financial-summary` | JWT | — |
| 226 | GET | `/api/v1/recurring` | JWT + PIN-gate | query |
| 227 | POST | `/api/v1/recurring` | JWT + PIN-gate | body |
| 228 | GET | `/api/v1/recurring/:id` | JWT + PIN-gate | params |
| 229 | PUT | `/api/v1/recurring/:id` | JWT + PIN-gate | body,params |
| 230 | DELETE | `/api/v1/recurring/:id` | JWT + PIN-gate | params |
| 231 | PATCH | `/api/v1/recurring/:id/toggle` | JWT + PIN-gate | params |
| 232 | GET | `/api/v1/budgets` | JWT + PIN-gate | query |
| 233 | POST | `/api/v1/budgets` | JWT + PIN-gate | body |
| 234 | GET | `/api/v1/budgets/:id` | JWT + PIN-gate | params |
| 235 | PUT | `/api/v1/budgets/:id` | JWT + PIN-gate | body,params |
| 236 | DELETE | `/api/v1/budgets/:id` | JWT + PIN-gate | params |
| 237 | POST | `/api/v1/budgets/:id/recalculate` | JWT + PIN-gate | params |
| 238 | GET | `/api/v1/gold` | JWT + PIN-gate | query |
| 239 | POST | `/api/v1/gold` | JWT + PIN-gate | body |
| 240 | GET | `/api/v1/gold/:id` | JWT + PIN-gate | params |
| 241 | PUT | `/api/v1/gold/:id` | JWT + PIN-gate | body,params |
| 242 | DELETE | `/api/v1/gold/:id` | JWT + PIN-gate | params |
| 243 | GET | `/api/v1/collaborations` | JWT | query |
| 244 | GET | `/api/v1/collaborations/pending` | JWT | — |
| 245 | GET | `/api/v1/collaborations/:id` | JWT | params |
| 246 | DELETE | `/api/v1/collaborations/:id` | JWT | params |
| 247 | POST | `/api/v1/ai/events` | JWT | body |
| 248 | GET | `/api/v1/ai/quota` | JWT | — |
| 249 | GET | `/api/v1/ai/insights` | JWT + aiFeature=aiAutomation | — |
| 250 | GET | `/api/v1/ai/health-score` | JWT + aiFeature=aiAutomation | — |
| 251 | GET | `/api/v1/ai/recommendations` | JWT + aiFeature=aiAutomation | — |
| 252 | GET | `/api/v1/ai/fraud-alerts` | JWT + aiFeature=aiAutomation | — |
| 253 | GET | `/api/v1/ai/bill-predictions` | JWT + aiFeature=aiAutomation | — |
| 254 | GET | `/api/v1/ai/spending-patterns` | JWT + aiFeature=aiAutomation | — |
| 255 | POST | `/api/v1/receipts/start` | JWT + feature=transactions + aiFeature=ocrEngine | — |
| 256 | GET | `/api/v1/receipts/status/:jobId` | JWT | — |
| 257 | POST | `/api/v1/receipts/scan` | JWT + feature=transactions + aiFeature=ocrEngine | query |
| 258 | GET | `/api/v1/bills` | JWT | — |
| 259 | GET | `/api/v1/bills/:id` | JWT | params |
| 260 | POST | `/api/v1/bills` | JWT + feature=transactions.attachBill | — |
| 261 | DELETE | `/api/v1/bills/:id` | JWT + feature=transactions.attachBill | params |

---

### 2.3 Documentation drift found

- `docs/api/contracts/api-index.json` marks 201/233 endpoints `"auth": "public"`. Verified against sources: **only 14 are public** — 9 auth flows (`check-email`, `register`, `login/challenge`, `login`, `refresh`, `logout`, `forgot-password`, `verify-reset-code`, `reset-password`), the sanitized DiceBear avatar proxy, and 4 read-only market-data routes (`/stocks/*`, strictly Zod-validated). `POST /webhooks/sendgrid` is JWT-less but HMAC-signature-verified; `POST /payments/webhook` is HMAC-verified with a constant-time shared-secret fallback and 503s when unconfigured. The contract generator only detects *inline* per-route auth middleware and misses `router.use(authMiddleware)`. **Action:** fix `scripts/audit-api-contracts.mjs` + regenerate (§9.1-D3).
- `docs/openapi.yaml` still carries a `tax` tag; the tax module was removed (migration `20260624000000_remove_tax_calculations`) and stale tests remained (§8).

---

## 3. Role-based access verification (with code evidence)

### 3.1 The enforcement chain

Every request to a protected route passes, in order:

1. **`authMiddleware`** (`backend/src/middleware/auth.ts:217`) — verifies the JWT signature (custom secret; Supabase accepted only during BFF migration, `ACCEPT_SUPABASE_JWT`), **rejects refresh tokens for API calls** (typed tokens), then **re-reads role/approval/status from the DB** (60 s cache):

```ts
// auth.ts — role is NEVER taken from client-controllable claims in production:
role: authSnapshot?.role || (ALLOW_TEST_ROLE_FALLBACK ? normalizeAppRole(decoded.role) : 'user'),
// Supabase path:
// SECURITY: role comes only from the DB snapshot (server-authoritative).
role: authSnapshot?.role || 'user',
```

2. **`requireRole`** (`backend/src/middleware/rbac.ts:13-27`) — the exact middleware that rejects a User/Advisor token on every Admin/Manager endpoint:

```ts
export const requireRole = (allowedRoles: UserRole | UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!req.user?.role) return res.status(401).json({ error: 'User role not found' });
    if (!roles.includes(req.user.role as UserRole)) return res.status(403).json({ error: 'Access denied' });
    next();
  };
};
```

3. **`requireFeature(module, child)`** (`backend/src/middleware/featureGate.ts:133`) — admin-panel-backed per-role feature matrix, **deny-by-default** for unknown modules/non-admin roles, **fail-closed** (503) on evaluation errors.

### 3.2 Admin routes — verified locked

`backend/src/features/admin/admin.routes.ts`:

```ts
router.use(authMiddleware);                    // line 24 — all admin routes authenticated
router.get('/features', …); router.get('/ai-features', …);  // role-filtered reads for all roles
router.use(requireRole('admin'));              // line 32 — EVERYTHING below is admin-only
// user management, role changes, stats, feature-flag matrix, AI admin, reports…
```

A `user` or `advisor` token calling any `/api/v1/admin/*` management route receives **403 Access denied** from `requireRole` before any controller runs. Role escalation via token claims is impossible because the role is re-read from the DB on every request (§3.1); Supabase `user_metadata.role` is explicitly ignored (user-writable); shadow-row creation (`ensureUserInDb`) hard-codes `role:'user', isApproved:false`.

### 3.3 Manager, Advisor, User surfaces

| Role | Server-side surface | Evidence |
|---|---|---|
| Manager | Advisor verification queue: `GET /advisors/admin/applications`, `PUT /advisors/admin/:id/approve\|reject` — `requireRole(['admin','manager'])`; role-mode switch; feature-matrix grants (manager has full access to core finance modules in `featureGate` defaults) | `advisor.routes.ts:58-60,45` |
| Advisor | Own application/docs, availability CRUD, own sessions, chat, online status — `requireRole('advisor') + requireApproved`; **client data access is session-scoped only** (booked clients' name/email/phone via sessions; no access to client transactions/accounts) | `advisor.routes.ts:44-52`, `advisor.controller.ts:189-215` (`session.clientId !== clientId → 403`) |
| User | All personal-finance modules; every query is owner-scoped `where { id, userId }` (verified in transactions, accounts, goals, loans, budgets, groups, sync) — changing an ID in URL/body returns 404/403, not another user's record | e.g. `account.controller.ts:112 where:{id, userId}`, `transaction.controller.ts` passes `userId` to every service call |

Frontend gating (defense-in-depth, not the security boundary): route guard in `App.tsx` redirects non-admin/manager sessions off admin/manager pages; `featureFlags.ts` is deny-by-default per role once admin settings exist. **After this session's D1 work**, on a `VITE_APP_SURFACE=user` build the Admin/Manager screens are no longer in the bundle at all (chunks stripped — see §3.4); enforcement remains the API layer above, which is sound.

### 3.4 Platform separation — mechanism now implemented (activation is a config/ops step)

Required: Admin+Manager served from a separate platform/endpoint from User+Advisor, at routing/deployment level.

**What this session added (code, committed):**
- **API origin gate** — `backend/src/middleware/adminPlatformGate.ts`, mounted on `/api/v1/admin/*`, `/api/v1/advisors/admin/*`, and `/api/v1/health/metrics`. When `ADMIN_UI_HOSTS` is set, those route groups return the standard 404 unless the request arrives via an admin host (checked against `Origin` / `X-Forwarded-Host` / `Host`), so the customer origin cannot route to the back-office at all. RBAC (`requireRole`) still applies underneath. 8/8 unit tests including subdomain-suffix spoof rejection.
- **Frontend surface build** — `VITE_APP_SURFACE=user` compiles the Admin/Manager UI **out** of the customer bundle. Verified: a user-surface build emits **zero** `Admin*`/`Manager*` chunks (Vite `define` → Rollup drops the dead dynamic imports); route guards and nav also hide those pages. `admin`/`unified` builds are unchanged.

**Activation (⚙️ your ops step, not yet done — this is the deployment decision):** provision a second web origin (`admin.<domain>`, same repo, `VITE_APP_SURFACE=admin`), point the customer origin's build at `VITE_APP_SURFACE=user`, and set `ADMIN_UI_HOSTS=admin.<domain>` on the API. Until then the gate is a no-op and the platform stays unified (safe default) — but the code path the requirement asks for now exists and is tested, rather than needing a from-scratch build. A full second API service is still not required; the host gate + per-surface build satisfy "separate platform/endpoint."

Underlying topology unchanged (one Fly API app, Vercel edge proxy) — separation is enforced at the routing/origin layer, which is what the requirement specifies.

---

## 4. Security findings (ranked)

**CRITICAL — none found.** No plaintext/weak password storage, no string-built SQL, no committed live secrets, no unauthenticated financial endpoint.

### HIGH
| ID | Finding | Evidence | Status |
|---|---|---|---|
| H-1 | Admin/Manager not physically separated from User/Advisor platform | §3.4 | Open — decision |
| H-2 | `status:'blocked'` not enforced anywhere (admin Block button cosmetic); status input unvalidated | `AdminDashboard.tsx:119` sends `'blocked'`; enforcement checked only `'suspended'` (`auth.ts:254,291,326`, `sockets/index.ts:141`, `auth.controller.ts:429,545,682`, `auth.service.ts:369`) | **FIXED** — `utils/accountStatus.ts` helper wired into all 8 points + allow-list validation in `toggleUserStatus` |

### MEDIUM
| ID | Finding | Evidence | Status |
|---|---|---|---|
| M-1 | Role/status/approval changes + user deletion didn't evict the 60 s auth snapshot cache → revoked privileges honored up to 60 s | `invalidateUserSnapshotCache` existed but was only called from self-profile flows | **FIXED** — now called in `updateUserRole`, `toggleUserStatus`, `deleteUser`, both `approveAdvisor`/`rejectAdvisor` pairs (admin + advisors controllers) |
| M-2 | Frontend role-from-email substring spoof (UI shell only) | `AuthContext.tsx:221` / `permissionService.ts:22` — `includes('admin')` etc. | **FIXED** — exact canonical-account map |
| M-3 | Server-side PIN gate disabled in prod (`PIN_GATE_ENABLED` unset) → PIN is client-cosmetic | `middleware/pinGate.ts` + `security/pinUnlock.ts` (no-op unless enabled) | Open — enable in Fly secrets after QA |
| M-4 | A deleted user's still-valid access token (≤15 min) resurrects a shadow `User` row: snapshot lookup misses → `ensureUserInDb` upserts. Bounded (unprivileged row, refresh fails — token rows cascade-deleted), but a deleted account "returns" | `auth.ts:42-65,269-271` | Open — recommended fix: make `getUserAuthSnapshot` distinguish *not-found* (→ 401) from *lookup-timeout* (→ continue), and only auto-provision on verified Supabase tokens |
| M-5 | Generated API docs mislabel 201 endpoints as public — audit/compliance hazard, invites "it's public anyway" mistakes | §2.3 | Open — fix generator, regenerate |

### LOW
| ID | Finding | Evidence |
|---|---|---|
| L-1 | `refreshCookie.ts:57` `getDynamicSecureOption()` hard-returns `true`, dead-coding the documented dev/plain-HTTP branch (works on localhost only because browsers exempt it) |
| L-2 | `requireFeature` (rbac.ts static variant) omits `manager` from its `FEATURE_PERMISSIONS` — currently harmless (all routes import the featureGate variant; only `booking.controller.ts` imports the rbac one), but a routing change could silently 403 managers. Consolidate to one implementation |
| L-3 | RBAC 403 denials aren't written to the `AuditLog` table (`withAudit` wrapper exists, unused) — see §7 |
| L-4 | `featureGate.ts:56` uses `console.error` instead of the redacting `logger` |
| L-5 | `GET /admin/users` and `GET /groups` unpaginated (also a perf item, §6) |
| L-6 | `ALLOW_UNVERIFIED_JWT` dev fallback (accepts unsigned JWTs) — correctly triple-gated to `NODE_ENV=development` + explicit env flag; keep it out of any prod env file |

**Verified-good controls:** bcrypt cost 12 for passwords and PINs (`auth.service.ts:51`, `pin.service.ts:132`); typed access/refresh JWTs (refresh unusable on APIs, access unusable on refresh); HttpOnly/Secure/SameSite=Strict path-scoped refresh cookie (CSRF-safe together with header-borne access tokens; global CORS origin allow-list, no wildcard with credentials); Helmet CSP with per-request nonces (prod drops `unsafe-inline`), HSTS 2y preload; global HTML/script sanitization of all request bodies + `containsSqlInjection` refinements on free-text; 100% parameterized queries via Prisma (raw SQL only as tagged templates in dashboard aggregates = parameterized); IDOR checked across all financial modules (owner-scoped queries); protected canonical role accounts undeletable (`isProtectedAccount` guard) with SendGrid login alerts; webhooks HMAC-verified over raw bytes; uploads size/type-capped with per-user rate limits; idempotency keys on money-creating endpoints; no secrets in repo (`.env*` gitignored with example/test templates only; secret scan clean).

---

## 5. Database review

Verified across all four schema layers (Prisma `schema.prisma` 1181 lines / 48 tables, Supabase numbered migrations, `platform/database/supabase_schema.sql`, Dexie client versions).

| Check | Result |
|---|---|
| Money as decimal | ✅ Every monetary column is `Decimal(12,2)` (FX rates `Decimal(18,8)`, gold qty `12,4`). `Float` appears only on non-monetary fields: session `rating`, AI `confidence`/`risk_score` |
| Foreign keys | ✅ All financial relations have FKs with `onDelete: Cascade` (Transaction→User/Account, LoanPayment→Loan, GoalContribution→Goal, etc.). **Known deferred exception (by design):** `profiles.id` (uuid, Supabase RLS `auth.uid()=id`) ↔ `User.id` (text) cannot take an FK without a type conversion + RLS-policy recreation; an atomic registration transaction prevents orphans. Do not "fix" casually — documented blocker |
| Indexes on hot columns | ✅ Transaction: 12 indexes incl. composites `(userId,date)`, `(userId,type,date)` (dashboard totals), `(userId,category,date)` (breakdowns), `(userId,accountId,date)`, `(userId,deletedAt,date)`; User: `(role)`, `(role,isApproved)`; every child table indexes its FK |
| Constraints | ✅ `User.email` unique, `Transaction.dedupHash` unique (import dedup), `RefreshToken.token` unique |
| User data isolation | ✅ App-layer: every query owner-scoped (§3.3). DB-layer: Supabase RLS on `profiles` (`auth.uid()=id`). Sync push is field-allow-listed per entity type and owner-scoped incl. deletes (`updateMany where {id, userId}`) |
| Soft-delete consistency | ✅ Accounts soft-deleted (`deletedAt`, `isActive`), transactions never hard-deleted; dashboard aggregates JOIN live accounts only (`dashboard.controller.ts:42-44,72`); history views show all — consistent by design |
| Migrations from scratch | ✅ **Executed this audit**: after the drift fix (§1 issue 2), `prisma migrate deploy` on a fresh disposable Postgres → **4 migrations applied cleanly, 48 tables**, and `prisma migrate diff` confirms **zero residual drift** between migrations and `schema.prisma`. (Before the fix, `Account.openingBalance` + `AuditLog/Notification.requestId` were schema-only) |
| Dead columns | ⚠️ `User.firstName/lastName/salary/dateOfBirth/…` deprecated 2026-06-21 (PII moved to `profiles`), drop migration pending — schedule it |
| JSON-in-string smell | ⚠️ Several `Json`/text columns receive `JSON.stringify` output (documented follow-up from 2026-06-21 audit, e.g. `GroupExpense.items` parsed with `JSON.parse` in `group.controller.ts:78`) |

---

## 6. Performance findings

| ID | Finding | Impact | Recommendation |
|---|---|---|---|
| P-1 | **N+1 on `GET /api/v1/groups`** — `buildGroupResponse` runs 3 queries *per group* (members, the requester's **identical friends list re-fetched every iteration**, creator user) via `Promise.all(groups.map(…))`; endpoint also unpaginated | A user in 50 groups ≈ 150+ queries per page load | Hoist the friends query, `include: { groupMembers }` on the main query, batch creators with one `findMany({ id: { in } })`; add `page/limit`. Guarded by `friends-groups.test.ts` |
| P-2 | `GET /api/v1/admin/users` unpaginated (returns every user; does batch profile enrichment correctly, so no N+1) | Degrades with user growth; admin-only | Add pagination + `take` cap |
| P-3 | `GET /transactions/export` materializes up to 10,000 rows in memory (`limit: 10000`) | Spiky memory on large accounts | Stream/cursor batches |
| P-4 | Advisor listing enriches per-advisor (ratings/sessions) — smaller N+1 | Minor (marketplace gated off) | Batch when Phase 2 ships |

**Verified-good:** transactions/notifications/etc. paginated with hard caps (`limit ≤ 200`); Redis response caching with per-prefix TTL policy + hit-rate metrics; hot dashboard aggregates pushed into indexed SQL `GROUP BY` instead of app-side loops; request timeout middleware; circuit breakers on upstreams; per-route p50/p95/p99 latency metrics at `/api/v1/health/metrics`; heavy work (OCR, receipts, notification outbox, AI refresh) runs on the separate Fly `worker` process — correctly async by design.

---

## 7. Logging & monitoring

| Required | Status | Evidence |
|---|---|---|
| Auth events (login, fail, refresh, logout, password change, role change) | ✅ | `utils/auditLogger.ts` typed event catalog; `audit()` calls throughout auth middleware/controllers → Winston `[AUDIT]` line + durable `AuditLog` row with `requestId` correlation |
| Failed logins | ✅ | `auth.login_failed` with reason (`invalid_credentials`, `account_suspended`, `idle_timeout`, `invalid_token`) + IP |
| Role-access denials | ⚠️ **GAP** | `requireRole`/`requireFeature` return 403 without an `AuditLog` row. The `withAudit` wrapper exists (`rbac.ts:155`) but is applied to zero routes. Add an `authz.denied` audit event inside `requireRole`/`requireFeature` |
| All financial mutations | ✅ | Prisma-layer interceptor (`db/prisma.ts`): every create/update/delete on `AUDIT_MODELS` writes before/after JSON to `AuditLog` + a compact `[AUDIT]` log line — covers API, sync, and scripts uniformly |
| Server errors | ✅ | Central error handler logs full stack + requestId; response leaks nothing on 5xx |
| No sensitive data in logs | ✅ | `utils/redact.ts` deep-scrubs by key pattern (passwords, PINs, OTPs, tokens, cookies, secrets, PAN/Aadhaar/CVV/SSN) **and** truncates token-shaped values (≥40-char base64/hex/JWT) even under unknown keys; wired into the Winston format. Spot-checks: only a 10-char JWT header prefix ever logged; challenge codes/OTPs logged only as redacted meta |
| Infrastructure | ✅ | Separate `kanaku-observability` Fly app (Loki + Grafana + Prometheus + Vector), 5 production alert rules, multi-channel alerting; Grafana dashboards read logs, never the DB |

Minor: `featureGate.ts` uses `console.error` (bypasses redaction formatting) — L-4. Known limitation (documented): the prod worker process's Winston output doesn't reach `fly logs` on the isolated deploy.

---

## 8. Test execution results

| Suite | Command | Result |
|---|---|---|
| Frontend unit/component (Vitest, `quality/frontend`) | `npm run test:unit -w frontend` | ✅ **18/18 files, 149/149 tests pass** (re-verified after this session's fixes) |
| Frontend type-check | `tsc --noEmit` | ✅ clean (after fixes) |
| Frontend production build | `npm run build:frontend` | ✅ built in 30 s (one >600 kB chunk warning — cosmetic, code-splitting hint) |
| Backend type-check | `tsc --noEmit` | ✅ clean (after fixes) |
| Backend integration+unit (Jest, `quality/backend`, serial against Docker Postgres :5434) | `npx jest` | ✅ **41/41 suites, 699/699 tests pass** after all fixes incl. the §9.1 D-items (0 FAIL; +8 tests = the new `admin-platform-gate` suite). (First run this session: 51 failed / 690 — see triage below.) Note: the `jest` process exits non-zero only because of a `--forceExit` open-handle teardown warning (lingering Redis/socket connections) — an environmental artifact, not a test failure. |
| Prisma migrations from scratch | `prisma migrate deploy` on fresh DB | ✅ 4/4 applied, 48 tables, **zero residual drift** (post-fix) |
| E2E (Playwright, `quality/e2e` — 10 journey specs incl. registration, transactions, loans, groups, goals, power-user, inactivity autolock; plus `quality/api` contract runner) | not run in this session | ⏳ Requires a live full stack (frontend+backend+seeded DB). **QA must run** `npm run test:e2e` against staging — see checklist §9.2 |

**Backend failure triage (why the first run showed 51 failures, and what each was):**

| Root cause | Failures | Resolution |
|---|---|---|
| **Schema/migration drift** — test DB (and any migrations-built DB) missing `AuditLog.requestId`; every audit write threw, breaking audit-assertion tests | audit/log assertions across auth & several modules | **Code fix**: new migration `20260707000000_sync_schema_drift`; test DB synced. Real production bug (§1 issue 2) |
| **Feature-gate default gap** — `goals`/`loans`/`investments` 403'd for non-admins on a settings-less DB | ~30 (goals/loans/investments/roles-e2e/regression POST cases returning 403 instead of 201/400) | **Code fix**: added modules to `DEFAULT_MODULE_ACCESS` (§9.0 #6) |
| **Stale test for removed module** — `tax.test.ts` asserted a module dropped by migration `20260624000000` | tax suite | **Deleted** the stale suite |
| **Test-fixture drift** — `notification-delivery` `emailRow()` missing the new required `OutboxRow.requestId` (compile error) | 1 suite | **Test fix**: added `requestId: null` to the fixture |
| **Test-isolation weakness** — `profile-persistence` used a hardcoded phone that 409'd on the persistent DB after the first run | 1 | **Test fix**: unique phone per run |
| **Test env bug** — `bills-security` rate-limit test set `NODE_ENV='development'`, which the limiter *also* skips, so a 429 could never occur | 1 | **Test fix**: switched to `'production'` (the app's limiter was always correct) |

No failure was an unfixed application defect. Every code-side failure traced to the two real bugs already listed in §1 (schema drift, feature-gate defaults); the rest were stale/mis-written tests corrected in place.

---

## 9. Actions

### 9.0 Fixes applied during this audit (all type-checked; suites re-run)

1. **`backend/prisma/migrations/20260707000000_sync_schema_drift/` (new)** — additive migration adding `Account.openingBalance`, `AuditLog.requestId` (+ index), `Notification.requestId`, closing the schema-vs-migration drift (§1 issue 2). Idempotent (`ADD COLUMN IF NOT EXISTS`). Verified: 4/4 migrations apply from scratch, zero residual drift.
2. **`backend/src/utils/accountStatus.ts` (new)** — `isAccountLocked()` treating `'blocked'` and `'suspended'` as locked + assignable-status allow-list.
3. **Enforcement wiring (8 points)** — `middleware/auth.ts` (×3), `sockets/index.ts`, `auth.controller.ts` (challenge, token issuance, refresh), `auth.service.ts` (login) now use `isAccountLocked`. Admin-blocked users are now rejected at login, refresh, every API call, and socket auth.
4. **`admin.controller.ts`** — `toggleUserStatus` validates the status against the allow-list (400 otherwise); `updateUserRole`, `toggleUserStatus`, `deleteUser`, `approveAdvisor`, `rejectAdvisor` now call `invalidateUserSnapshotCache(userId)`.
5. **`advisors/advisor.controller.ts`** — `approveAdvisor` / `rejectAdvisor` invalidate the snapshot cache after role/approval transactions.
6. **`middleware/featureGate.ts`** — added `goals`/`loans`/`investments` to `DEFAULT_MODULE_ACCESS` so core modules aren't 403'd for non-admins on a fresh install before feature settings are saved.
7. **`frontend/src/contexts/AuthContext.tsx` + `frontend/src/services/permissionService.ts`** — `getRoleFromEmail` reduced to an exact-match canonical-account map (removes the substring role spoof; implements the 2026-06-21 audit recommendation).
8. **`quality/backend/tests/integration/tax.test.ts` (deleted)** — tested the removed tax module (dropped by migration `20260624000000`); produced false failures.

### 9.1 Developer action items (priority order)

Status legend: ✅ implemented this session · ⚙️ config/ops step for you · ⏳ remaining code work.

| # | Item | Ref | Status |
|---|---|---|---|
| D1 | **Admin/Manager platform separation.** Backend `adminPlatformGate` (host/origin gate) added on `/admin/*`, `/advisors/admin/*`, `/health/metrics` — inert until `ADMIN_UI_HOSTS` is set, then those groups 404 off the user origin. Frontend `VITE_APP_SURFACE=user` build now **physically strips** all Admin/Manager chunks (verified: 0 admin chunks emitted) + route-guard/nav gating. 8/8 gate unit tests. | H-1 | ✅ (code) — **⚙️ you: provision `admin.<domain>` origin, set `ADMIN_UI_HOSTS` + `VITE_APP_SURFACE`** |
| D2 | Enable `PIN_GATE_ENABLED=true` in staging → verify UX → prod Fly secrets | M-3 | ⚙️ config |
| D3 | Contract-docs generator now detects router-level `authMiddleware`/`pinGate`/`requireRole`; regenerated → **15 public / 180 bearer / 65 step-up** (was 201 mislabeled public) | M-5 | ✅ (openapi `tax` tag: ⏳ minor) |
| D4 | `getUserAuthSnapshot` now returns a `USER_NOT_FOUND` sentinel distinct from null (timeout/blip). Our own JWT for a deleted account → 401 (no shadow-row resurrection); Supabase identities still provision on first sight | M-4 | ✅ |
| D5 | `authz.denied` audit event emitted from `requireRole` and every `requireFeature` denial (structured, redacted, with role + route) | L-3 | ✅ |
| D6 | `GET /groups` N+1 removed (batched members/friends/creators; was 3 queries/group) + pagination; `GET /admin/users` bounded + `X-Total-Count` | P-1, P-2 | ✅ (`/transactions/export` streaming: ⏳) |
| D7 | Deleted the redundant hardcoded `requireFeature` in `rbac.ts` (unused) — `featureGate.ts` is now the single implementation | L-2 | ✅ |
| D8 | Removed dead `getDynamicSecureOption` (restores dev-HTTP cookie behaviour); `console.error` gone with the rbac `requireFeature` removal | L-1, L-4 | ✅ |
| D9 | Deleted stale `tax.test.ts`; fixed the 3 mis-written tests (§8) | §8 | ✅ |

### 9.1b Second implementation pass — all remaining code items closed

| Item | What was done | Status |
|---|---|---|
| `/transactions/export` | **Was a bug, not just perf:** it requested `limit: 10000` but the service caps limit at 100, so exports silently returned only the first 100 transactions. Now streams the complete statement in bounded batches (`iterateAllTransactions`); memory-bounded; new unit test covers batch boundaries. | ✅ |
| Deprecated `User` PII columns | Dropped `firstName/lastName/salary/dateOfBirth/jobType` (migration `20260708000000_drop_user_pii`) after verifying zero Prisma reads/writes (all PII lives in `profiles`). Idempotent; from-scratch apply + zero residual drift; client regenerated; **live smoke test confirms the profile still resolves first/last name from `profiles` after the drop.** | ✅ |
| `session.controller.ts` TODO | Wired real-time session-chat delivery — emits `new_message` to the recipient's socket room (best-effort) alongside the durable notification. | ✅ |
| `errorHandling.ts` TODO | Replaced the Sentry TODO with a real pluggable reporter (`registerErrorReporter`/`reportError`) — no-op until a reporter is registered, no forced dependency/CSP change. | ✅ |
| `openapi.yaml` | Removed the stale `tax` tag. | ✅ |

**The codebase now contains 0 TODO/FIXME comments.**

### 9.1c Live end-to-end verification (real HTTP against a migrated Postgres)

Booted the built backend against a fresh migrated DB and exercised the real flow — every step passed:

| Step | Result |
|---|---|
| `POST /auth/register` (native) | 201, tokens returned |
| `GET /auth/profile` | 200; `firstName`/`lastName` resolve from `profiles` (validates the PII-column drop) |
| `POST /accounts` → `POST /transactions` (income 5000, expense 450.75) | created |
| `GET /dashboard/summary` | `net = 4549.25` (5000 − 450.75), category breakdown correct |
| `GET /transactions/export` | CSV streams **both** rows (truncation fix confirmed live) |
| `GET /admin/users` & `POST /admin/users/:id/role` with a **user** token | **403** (RBAC boundary holds) |
| `GET /transactions` with no token | **401** |
| `POST /transactions` amount `-50` | **400** (server-side validation) |
| `AuditLog` rows | `authz.denied` (with `requestId`), `auth.register`, `data.create`, `data.update` all persisted — confirms D5 auditing + the schema-drift `requestId` fix work end-to-end |

### 9.1d Advisor cross-role flow — verified live, two bugs found & fixed

Verified the full advisor lifecycle across four roles (client, applicant, manager, admin) with real HTTP + DB assertions. **Two integration bugs were found and fixed:**

- **Booking notification named the wrong person** — `createBooking` sent the advisor a notification reading *"{advisor's own name} has requested a session"*. Fixed to name the **client** (`req.user.name`). Verified live: advisor now receives *"Client One has requested a consultation session"*.
- **Advisor applications skipped managers** — `applyAsAdvisor` notified admins only, yet managers are equally authorized to review/approve (`requireRole(['admin','manager'])`). Fixed to notify **both**, each with a role-appropriate deep link (manager → `/manager-advisor-verification`). Covered by a new storage-mocked integration test.

Full live flow (all steps passed):

| Step | Result |
|---|---|
| User applies → `AdvisorApplication` row | recorded (PENDING) |
| Admin `GET /advisors/admin/applications` | lists the applicant |
| **Manager** `GET /advisors/admin/applications` | **200** — manager also sees the queue |
| Admin `PUT /advisors/admin/:id/approve` | 200 |
| Applicant `User` row after approve | `role=advisor`, `isApproved=true`; application → `APPROVED` (with `reviewedBy`) |
| Applicant notification | **"Advisor Application Approved!"** (user told their account is now advisor) |
| Client `POST /bookings` | 201; `BookingRequest` row = `consultation \| amt=500.00 \| pending \| dur=30` (all fields) |
| Advisor booking notification | **"Client One has requested a consultation session"** (client-name fix) |
| Advisor `GET /bookings?role=advisor` | sees the booking (frontend `AdvisorWorkspace` uses this exact call) |

### 9.1e Field-level persistence spot-check (frontend contract → backend → DB)

Created one record per money feature via the API and read the row straight back from Postgres — every submitted field persisted (amounts as `Decimal`):

| Feature | DB row |
|---|---|
| Account | `Smoke Wallet`, type `cash` |
| Transaction (income/expense) | `income 5000`, `expense 450.75` — dashboard net `4549.25` |
| Goal | `Emergency Fund \| targetAmount=100000.00 \| category=savings` |
| Loan | `Car Loan \| principal=500000.00 \| rate=9.50 \| type=borrowed` |
| Budget | `Food & Dining \| amount=8000.00 \| period=monthly` |
| Investment | `Reliance \| qty=10.0000 \| buy=2800.00 \| current=2950.00 \| totalInvested=28000.00` (auto-computed) |

Server-side validation confirmed live: an investment with the wrong field names / missing `purchaseDate` → **400** (not a silent partial write).

**Only non-code items remain, and they are yours (ops/config, not defects):** (1) activate platform separation by provisioning `admin.<domain>` + setting `ADMIN_UI_HOSTS`/`VITE_APP_SURFACE`; (2) enable `PIN_GATE_ENABLED=true` in prod after QA. Both are deployment decisions the code is ready for.

### 9.2 QA manual test checklist

*(items code review cannot prove — rendering, visual states, device behavior)*

**A. New-user end-to-end (the money path)**
1. Register a fresh email → password rules surface live (8+ chars, upper/lower/digit/special); weak input blocked client- AND server-side (submit via devtools too — expect 400).
2. Verify duplicate-email registration is rejected; check-email endpoint responds.
3. Login → 2-step challenge (challenge code delivery), wrong password ×6 → 429 within a minute (limit 5/min).
4. Onboarding: country/language → profile setup (try salary > 1,000,000,000 → clean validation error, not a 500) → bank-account step → feature slides.
5. PIN setup → lock → unlock; with `PIN_GATE_ENABLED=true` on staging verify API-level 403 `PIN_VERIFICATION_REQUIRED` when locked (devtools call to `/api/v1/transactions` while locked).
6. Create first **income** (salary credit) then first **expense**; verify: dashboard totals, Previous-Balance semantics (= balance before last txn), derived account balance, negative balance shown (no clamp) after overspend.
7. Edit then delete the expense → totals recompute; verify the txn survives in history per soft-delete design.
8. Offline: airplane-mode an entry → reconnect → syncs without duplicate (dedupHash).

**B. Role isolation (attack the API, not just the UI)**
9. As **user**: direct-call `GET /api/v1/admin/users`, `POST /api/v1/admin/users/<id>/role`, `GET /api/v1/admin/stats` with the user's Bearer token → all must 403 with no data. Repeat with an **advisor** token.
10. As user A, take a transaction/account/goal ID belonging to user B (create B first): `GET/PUT/DELETE /api/v1/transactions/<B-id>` → 404/403, never B's data (IDOR probe).
11. As **manager**: `/advisors/admin/applications` works; `/admin/users` → 403; manager sees only the verification workspace in UI.
12. As **admin**: Block a user → **that user's next API call fails within seconds** (403 ACCOUNT_SUSPENDED) and login/refresh rejected — regression test for this audit's H-2/M-1 fixes. Unblock → access restored. Change a user's role → takes effect immediately.
13. Type a user email containing "admin" (e.g. `myadmin@test.com`), register, login → must land on the normal user dashboard, never the admin shell (M-2 regression).
14. Advisor before approval: advisor panels blocked (`requireApproved`); after admin approval: available.

**C. UI sweep (dead buttons / placeholder screens)**
15. Walk every nav destination for each role (sidebar + bottom nav + quick-action modal): Dashboard, Accounts (add/edit/delete/transfer), Transactions (add/edit/delete/filter/export/import), Loans (+EMI payment), Goals (+members/contributions), Groups (split flows), Investments (+gold), Budgets, Recurring, Reports (PDF/Excel/CSV downloads open), Calendar, To-dos (+share), Friends, Notifications (read/mark-all/delete), Settings (every toggle persists after reload), Voice input, Receipt scanner, AI insights. Every button must produce an action, a disabled state, or a visible error toast — record any silent click.
16. Marketing/public pages render logged-out: landing, about, pricing, contact, privacy, terms.
17. Error surfaces: kill the API (or throttle to offline) → offline banner + graceful degradation, no white screens; force a chunk error (hard refresh mid-deploy) → error boundary auto-retries.
18. `npm run test:e2e` (Playwright, 10 journeys) against staging; `npm run qa:api-report` for the API contract sweep.

**D. Cross-platform**
19. Android (Capacitor): login persistence (native refresh-token path), hardware back double-press exit, status bar, SMS txn detection permission flow.
20. Session policy: idle overnight → app resumes silently (seamless refresh, no forced logout — intentional policy); verify PIN lock still engages client-side.

---

## 10. Pending / incomplete features

### Feature-completeness matrix

| Expected feature | Status | Notes |
|---|---|---|
| User registration & login | ✅ Complete | 2-step challenge login, OTP, forgot/reset, device trust, rate-limited, e2e-tested |
| Income entry (create/edit/delete/list) | ✅ Complete | `type:'income'` transactions; bulk, import, export |
| Expense entry (create/edit/delete/list) | ✅ Complete | incl. transfers/withdrawals, receipts/bills attach, idempotency |
| Categories for income/expenses | ⚠️ Partial | Rich fixed taxonomy (frontend constants) + subcategories + ML auto-categorization with per-user learning (`/categorize`, `/learn`); **no custom-category CRUD API** — `Category` table exists but is only read by GDPR export |
| Reports/summaries per user | ✅ Complete | Dashboard summary/cashflow (indexed SQL aggregates), PDF/Excel/CSV export, AI insights, forecast — all owner-scoped |
| Role management (admin) | ✅ Complete | User list/status/role/delete + storage stats + full feature-flag RBAC matrix UI |
| Manager capabilities | ⚠️ Partial (by design) | What exists in code: advisor verification queue (approve/reject), role-mode switch, feature-matrix core-module access. No manager-specific analytics/dashboards |
| Advisor capabilities | ⚠️ Partial (phase-gated) | Application+KYC docs, availability, sessions, chat, ratings exist; **client-data access is session-scoped only** (no portfolio view of assigned users); consumer booking surface (`bookAdvisor`) ships admin-flag-OFF by default (Phase 2) |
| Separate Admin/Manager platform | ❌ Missing | §3.4 — logical route groups only |

### Deferred/stubbed items (file:line)

| Where | What |
|---|---|
| `backend/src/features/sessions/session.controller.ts:101` | `// TODO: Implement WebSocket notification for real-time delivery` (session messages poll) |
| `frontend/src/lib/errorHandling.ts:222` | `// TODO: integrate Sentry or a similar service here` |
| `backend/src/features/voice/voice.nlp.ts:7-14` | Language detection/translation stubs — always `'en'` (Phase 1 by design) |
| `backend/src/features/aa/*` | Account Aggregator (Setu) module fully written but **mount-gated off** (`ENABLED_MODULES`, Phase 5) |
| `backend/src/features/payments/*` | Payments module complete but admin-flag **OFF by default** (Phase 4) |
| `advisors` booking marketplace | Consumer surface admin-flag OFF (Phase 2) |
| `backend/src/config/redis-connections.ts:2` | "Redis-free workload stub" — intentional in-memory fallback when Redis absent |
| `quality/backend/tests/integration/tax.test.ts` | Tests a **removed** module (tax) — stale, drives false failures |
| `prisma/schema.prisma:611-620` | Deprecated User PII columns awaiting drop migration |
| `docs/openapi.yaml` | Stale `tax` tag |

No dead buttons or placeholder screens were identifiable statically — every `App.tsx` page case maps to an implemented component and every nav item resolves to a real page id; visual confirmation is QA item C-15.

---

*Report generated as part of the 2026-07-07 full verification session. Fixes applied this session are listed in §9.0; all other findings are recommendations, prioritized in §9.1.*
