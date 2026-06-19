# 📕 Kanaku Feature Rulebook (Authoritative)

> **This is the binding governance document for building anything in Kanaku.**
> Every new feature, route, screen, table, or migration **MUST** comply with every applicable rule below before it is merged. The rulebook is derived from the app **Terms & Conditions** (`docs/TERMS_*.md`), the **Copilot guardrails** (`.github/copilot-instructions.md`), and the **living architecture** (`KANAKU_PROJECT_OVERVIEW.md`).
>
> **Precedence (highest wins):** Law/Regulation → Terms & Conditions → `KANAKU_PROJECT_OVERVIEW.md` → this Rulebook → skill docs → individual PRs.
>
> **How to use:** When asked to "create a new feature", first read this rulebook, then fill `FEATURE_TEMPLATE.md`, then build so that **every box in §9 Definition of Done** is checked. If a rule cannot be met, stop and escalate — do not ship.

---

## 1. Golden Rules (never violate)

| # | Rule | Source |
|---|------|--------|
| G1 | **Server is the source of truth for money.** All monetary values are `Decimal(18,2)`; never `float`. | T&C §9, Guardrails |
| G2 | **Atomic money writes.** Any balance change coupled with a record write happens in a single `prisma.$transaction`. | Guardrails |
| G3 | **Ownership before access.** Every read/write is filtered by `where: { userId: req.userId }` (or an explicit, audited share). | T&C "access another user's data" = ban |
| G4 | **Validate everything.** Every body/query/param is Zod-validated; failures return a **generic** `VALIDATION_ERROR` (no schema/field leak). | Security audit |
| G5 | **Versioned + protected APIs.** All routes under `/api/v1/<module>`; protected routes require JWT; Helmet + CORS allow-list + rate limit stay intact. | Guardrails |
| G6 | **No secrets in code.** Secrets only via env (`backend/.env`); never commit credentials; never `$queryRawUnsafe`/string-concatenated SQL. | Security audit |
| G7 | **Offline-first.** Local Dexie write first (`syncStatus='pending'`), optimistic UI, background retry, user-scoped deltas; monetary conflicts defer to server. | Guardrails |
| G8 | **Least privilege + deny-by-default RBAC.** A capability is hidden unless explicitly granted to the role via feature gates (Module → Sub-feature → AI). | T&C Admin, Feature gates |
| G9 | **No `any` in new code.** Explicit interfaces, Zod schemas, typed DTOs. | Guardrails |
| G10 | **Privacy by default.** Financial data is never sold; encrypted at rest + in transit; users can export/delete; logs redact PII/secrets/OTP. | T&C §5 |

---

## 2. Eligibility & Account Rules (from Master T&C)

| ID | Rule | Implementation requirement |
|----|------|----------------------------|
| EL1 | Minimum age **18**. | Any signup/KYC feature must capture/verify DOB and reject <18. |
| EL2 | **One person = one account.** | Dedup on email; advisor "multiple accounts" → ban logic; no feature may create silent duplicate accounts. |
| EL3 | Accurate registration info required. | Validate required profile fields; no fabricated defaults that bypass validation. |
| EL4 | Credential security is the user's responsibility, but the app must **enable** it. | Provide password (policy below), PIN, OTP, session/device management on any auth-touching feature. |

**Password policy (enforced):** ≥ 8 chars incl. upper + lower + digit + special → else `PASSWORD_TOO_WEAK`. **Admin** accounts: ≥ 16 chars + MFA mandatory + 30-min timeout + 90-day rotation.
**PIN:** 4–6 digit, client SHA-256 + per-user salt → server Argon2id; lockout after 5 attempts.

---

## 3. Data, Privacy & Security Rules (T&C §5, End User Data)

| ID | Rule | Implementation requirement |
|----|------|----------------------------|
| DP1 | Financial data **never sold**; not shared with third parties without consent. | No feature may export user data to a third party without explicit, revocable consent (e.g., AA consent flow). |
| DP2 | **Encryption** at rest + in transit. | HTTPS/WSS only; AA + KYC + backups use AES-256-GCM (per-user DEK); receipts/KYC in Supabase Storage (signed URLs). |
| DP3 | **Export & delete** rights. | Settings must keep working: JSON export, encrypted cloud backup/restore, `DELETE /auth/account`, clear-local. New data tables must be covered by export + deletion. |
| DP4 | **We do NOT collect** bank login credentials, raw voice, biometrics. | Bank data only via file import or Setu AA (no screen-scraping). Voice raw audio discarded after processing. No biometric storage. |
| DP5 | **Log hygiene.** | `lib/logger` (silent debug/info in prod); redact `password`, `pin`, `Authorization`, OTP, PAN/Aadhaar. Never dump raw API errors to console/toasts. |
| DP6 | **Retention.** | On account termination, data retained 30 days then purged (unless legally required). New tables must honor deletion/retention. |

---

## 4. AI Feature Rules (T&C §6)

| ID | Rule | Implementation requirement |
|----|------|----------------------------|
| AI1 | AI output is **not financial advice** — it is an automation tool. | AI surfaces (insights, categorization, predictions) must be labeled as assistive, not advice. |
| AI2 | **Human-in-the-loop.** AI-extracted data may be wrong; the user reviews/corrects before save. | Receipt OCR + voice flows require an explicit confirm step (e.g., `VoiceReview`, prefilled Add Transaction). |
| AI3 | **Voice is ephemeral.** Raw audio is not stored after processing. | `/voice/process-audio` must discard audio post-transcription; no persistent raw-audio table. |
| AI4 | **AI is gated + quota'd.** | AI reads behind `requireAIFeature('aiAutomation', '<subfeature>')`; respect `/ai/quota`; free tier limits (e.g., 10 receipt scans/month) enforced server-side. |
| AI5 | **Resilience.** | External AI calls wrapped in `withCircuitBreaker` with a fallback (e.g., Tesseract → Gemini → `receipt_ai`). |

---

## 5. Payments & Subscription Rules (T&C §7)

| ID | Rule | Implementation requirement |
|----|------|----------------------------|
| PAY1 | Pricing shown clearly **before** purchase; 30-day notice on changes. | Paywalls/upsell screens show price pre-charge. |
| PAY2 | Advisor session fees flow **only** through the platform gateway. | Off-platform payment solicitation is a terms violation; no feature may facilitate it. |
| PAY3 | **Refund policy** honored (see Client T&C matrix). | Payment state machine: initiate → complete/fail/refund; refunds follow the cancellation matrix. |
| PAY4 | Payment webhooks are **signature-verified**. | `/payments/webhook` + `/webhooks/sendgrid` (ECDSA P-256) verify signatures; fail-closed in prod. |
| PAY5 | Free tier always retains: manual entry, basic budgets, data export. | Feature gating must never paywall these. |

---

## 6. Roles, RBAC & Data-Sharing Rules

Roles (weight): **admin > manager > advisor > user**. Clients are End Users with advisor bookings. Deny-by-default.

### 6.1 End User (baseline) — T&C End User
- Full CRUD over **their own** finance data only. Cannot access another user's data (→ permanent ban + legal).

### 6.2 Client (End User + advisor) — T&C Client
| Rule | Implementation |
|------|----------------|
| CL1 | Client **controls exactly what is shared** with an advisor (transactions / budgets+goals / full / chat-only) and can **revoke anytime**. | Sharing scope stored per session; enforced server-side on every advisor read. |
| CL2 | Advisor access requires an **active, confirmed booking**. | No advisor read path without an active `AdvisorSession`/booking. |
| CL3 | Pay only via platform; rate/review post-session; dispute system. | Payments + ratings + dispute endpoints. |

### 6.3 Advisor — T&C Advisor
| Rule | Implementation |
|------|----------------|
| AD1 | Advisor is **read-only** on client data — **cannot add/edit/delete** any client record. | Advisor-scoped endpoints are read-only; writes limited to session notes/summaries in their lane. |
| AD2 | Advisor sees **only** the categories the client shared; nothing between sessions. | Enforce share scope + active-session check on every field. |
| AD3 | Advisor must be **approved** (KYC verified) before operating. | `isApproved` + `requireApproved`; unverified advisors are gated out. |
| AD4 | No off-platform solicitation, no data copy/sale, individual (not company) accounts, single account. | Conduct rules; multiple advisor accounts → ban. |

### 6.4 Admin — T&C Admin
| Rule | Implementation |
|------|----------------|
| ADM1 | **Least privilege**; access only what a task needs; **documented cause** for sensitive data. | Admin endpoints scoped; sensitive reads (txn detail, chat, receipts) require a ticket/justification. |
| ADM2 | **Immutable audit log** of every admin action (timestamp, adminId, action). Logs cannot be edited/deleted. | `AuditLog` append-only; tampering blocked. |
| ADM3 | **Cannot access** passwords/PINs/OTP (hashed/ephemeral by design). | No endpoint may return these. |
| ADM4 | **Approval levels** for high-impact actions (terminate advisor, bulk-suspend >10, refund > ₹10k, disable global flag, access chat logs, legal export). | Enforce approver checks / second sign-off. |
| ADM5 | MFA mandatory; company-managed device/VPN; 30-min timeout; offboarding revokes immediately. | Admin auth hardening. |
| ADM6 | No conflict of interest (e.g., approving advisor friends/family) → recuse + escalate. | Encode recusal where feasible; log justification. |

---

## 7. Conduct & Anti-Abuse Rules (Master §4)

Every feature must make these **impossible or detected**, never easier:
- No hacking/reverse-engineering/exploiting; no scrapers/bots without permission (rate limits + bot guards stay on).
- No illegal/fraudulent/misleading data; no money laundering; no impersonation; no harassment.
- No credential sharing. Report channels for bugs/security/abuse remain available.

---

## 8. Platform / Technical Rules (architecture)

| ID | Rule |
|----|------|
| TR1 | Backend pattern **Route → Controller → Service → Prisma**; controllers never hold business logic; services never touch `req/res`. |
| TR2 | New route file `*.routes.ts` + Zod `*.validation.ts` + controller + service + types; mount under `/api/v1`. |
| TR3 | Caching via Redis where applicable; invalidate on mutation. Idempotency-Key on mutating endpoints (Redis 24h TTL). |
| TR4 | Realtime via Socket.IO, **user-scoped, delta-based** only. |
| TR5 | New Dexie table → bump `database.ts` schema version (next is **v16**), add `syncStatus` + `cloudId`, mirror in sync engine, keep `syncSchemaGuard` parity. |
| TR6 | Standard response envelope `{ success, data?, error?, code?, requestId }`. |
| TR7 | Tests: Jest/Supertest (backend) + Vitest/Playwright (frontend), incl. ownership/RBAC + offline-sync no-duplicate (via Idempotency-Key). |
| TR8 | Accessibility + `data-testid` for automation (see `AUTOMATION_REGISTRY.md`); responsive + glassmorphic design system. |

---

## 9. ✅ Definition of Done — New-Feature Checklist (the gate)

A feature is **only** "done" when **all applicable** boxes are checked:

**Legal / Terms**
- [ ] Maps to a real entitlement of the target role (End User / Client / Advisor / Admin) per `TERMS_*.md`.
- [ ] No capability exceeds what that role's Terms permit (esp. advisor read-only, admin least-privilege).
- [ ] Privacy: data is exportable + deletable; no third-party leakage; consent captured where required.
- [ ] If AI: labeled "not advice", human confirm step, gated + quota'd, voice audio discarded.
- [ ] If payments: pricing shown pre-charge, platform-only, signature-verified webhook, refund policy respected.

**Security**
- [ ] Routes under `/api/v1`; JWT-protected; Helmet/CORS/rate-limit intact.
- [ ] Zod validation on body/query/params; generic validation error.
- [ ] Ownership check on every read/write; RBAC/feature-gate enforced (deny-by-default).
- [ ] No secrets in code; no `$queryRawUnsafe`; logs redact PII/secrets/OTP.

**Data integrity**
- [ ] Money is `Decimal(18,2)`; balance + record writes in one `prisma.$transaction`.
- [ ] Idempotency-Key on mutating endpoints.

**Offline-first**
- [ ] Dexie write-first (`syncStatus='pending'`), optimistic UI, background retry.
- [ ] Schema parity: Dexie version bumped + `cloudId`; sync engine + `syncSchemaGuard` updated; monetary conflict defers to server.

**Type safety & quality**
- [ ] No `any`; typed DTOs/interfaces/Zod schemas.
- [ ] Standard response envelope; errors via `AppError`.

**Docs & tests**
- [ ] `FEATURE_TEMPLATE.md` filled; `Feature_List.csv`, `API_Specifications.md`, `Request_Response_Schemas.md`, `openapi.yaml` updated.
- [ ] Tests: ownership/RBAC + offline no-duplicate + validation.

**Pre-flight (copilot-instructions mirror)**
- [ ] Dexie→cloud sync consistent · [ ] validation middleware present · [ ] endpoints versioned under `/api/v1`.

---

## 10. Traceability — Terms clause → Rule → Code

| Terms clause | Rule(s) | Where enforced |
|---|---|---|
| Master §2 (age, one account) | EL1, EL2 | auth.controller / register |
| Master §4 (prohibited conduct) | §7, G5, G6 | middleware (rateLimit, sanitiser, auth) |
| Master §5 (data/privacy) | DP1–DP6, G10 | settings (export/backup/delete), crypto, logger |
| Master §6 (AI) | AI1–AI5 | ai/voice/receipts services, requireAIFeature |
| Master §7 (payments) | PAY1–PAY5 | payments service, webhooks signature |
| Master §9 (liability/not advice) | AI1, advisor disclaimers | UI labels, advisor flows |
| End User (features/data rights) | EL*, DP3 | accounts/transactions/budgets/goals/... |
| Client (controlled sharing) | CL1–CL3 | advisor read scope, sessions, payments |
| Advisor (read-only, approval) | AD1–AD4 | advisor routes (requireRole/requireApproved) |
| Admin (least privilege, audit, approvals) | ADM1–ADM6, G8 | admin routes, AuditLog, RBAC |

---

## 11. Change control
- This rulebook changes only via PR with reviewer sign-off.
- When the **Terms** change, update the mapped rules here in the same PR.
- When this rulebook changes, reflect it in `.github/copilot-instructions.md` and `KANAKU_PROJECT_OVERVIEW.md`.

> **Build to the rulebook. If a rule blocks the feature, the rule wins — escalate, don't bypass.**

