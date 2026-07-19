# Kanaku — API Reference (Beta Audit Snapshot, 2026-07-19)

**265 endpoints** across **37 feature modules**, all under `/api/v1`. This document is the
audit index; the canonical per-endpoint reference (method, auth, permissions, headers,
request/response schemas, validation rules, errors, examples) is generated from code:

- **Per-endpoint docs:** [docs/api/reference/](../api/reference/) (one file per endpoint, per module)
- **OpenAPI:** [docs/openapi.yaml](../openapi.yaml) + interactive [api-viewer.html](../api-viewer.html) and Swagger UI at `/api-docs`
- **Machine contracts:** `docs/api/contracts/` (261 QA contracts driving `qa:api-report`)
- **Regenerate:** `npm run docs:endpoints` · audit gaps: `npm run qa:contract-audit`

## Endpoint inventory by module (verified against route files)

| Module | Mount | Routes | Auth | Extra gates |
|---|---|---:|---|---|
| auth | /auth | 17 | public+token | per-endpoint rate limits (login/register/OTP/refresh/destructive) |
| pin | /pin | 11 | ✅ | PIN session issuance |
| sync | /sync | 6 | ✅ | user-scoped rate limit 100/min |
| accounts | /accounts | 7 | ✅ | pinGate, idempotency, responseCache |
| transactions | /transactions | 9 | ✅ | pinGate, idempotency, responseCache |
| recurring | /recurring | 6 | ✅ | pinGate |
| budgets | /budgets | 6 | ✅ | pinGate |
| goals | /goals | 8 | ✅ | pinGate, members sub-resource |
| loans | /loans | 7 | ✅ | pinGate, feature flag `loans`, idempotent payments |
| gold | /gold | 5 | ✅ | pinGate |
| investments | /investments | 8 | ✅ | pinGate, feature flag |
| dashboard | /dashboard | 2 | ✅ | pinGate, aggregation |
| reports | /reports | 5 | ✅ | pinGate, export csv/excel/pdf, forecast, ai-insights |
| groups | /groups | 8 | ✅ | membership checks; ledger events (V2) |
| friends | /friends | 7 | ✅ | bulk + import |
| collaborations | /collaborations | 4 | ✅ | unified invites (groups/todos/goals) |
| todos | /todos | 17 | ✅ | lists/items/shares |
| notifications | /notifications | 8 | ✅ | admin broadcast requires role |
| devices | /devices | 7 | ✅ | per-device sync + FCM tokens |
| settings | /settings | 6 | ✅ | export, clear-data, account deletion + cancel |
| categorize + learn | /categorize, /learn | 2 | ✅ | ML categorization feedback |
| import | /import | 3 | ✅ | multer 10 MB, session confirm flow |
| bills | /bills | 4 | ✅ | 10/min rate limit, magic-byte validation |
| receipts | /receipts | 3 | ✅ | 8/min rate limit, OCR job status |
| voice | /voice | 3 | ✅ | feature-flagged |
| ai | /ai | 8 | ✅ | quota endpoint, feature-flagged |
| stocks | /stocks | 4 | public | market data (also Vercel edge fn) |
| otp | /otp | 2 | ✅ | RBI-compliant verification |
| avatars | /avatars | 1 | public | dicebear proxy |
| bookings | /bookings | 10 | ✅ | advisor/client role checks |
| advisors | /advisors | 16 | ✅ | advisor/manager/admin gates (see RBAC_MATRIX) |
| sessions | /sessions | 6 | ✅ | chat + lifecycle |
| payments | /payments | 7 | ✅ | feature flag `payments`; HMAC webhook |
| webhooks | /webhooks | 1 | HMAC | SendGrid events |
| admin | /admin | 32 | ✅ admin | adminPlatformGate router-wide |
| system | /system | 1 | ✅ admin | integrity audit (admin-only as of this audit) |
| aa | /aa | 9 | ✅ | mounted only when `ENABLED_MODULES=aa` |

## Audit results (frontend ↔ backend contract)

- ✅ Every API called by the **live** frontend surface resolves to an existing backend route
  (verified by static extraction of all fetch/apiClient paths vs. route inventory).
- ✅ No duplicate endpoints; naming consistent (`/module`, `/module/:id`, `/module/:id/action`).
- ✅ Standard envelope `{ success, data | error, code }`; correct 2xx/4xx/5xx usage; 404 handler; central error middleware.
- 🔧 Fixed during audit: 4 dead frontend wrappers pointing at nonexistent endpoints removed
  (`verify-email`, `change-password`, `goal contributions`, `POST /reports/export`);
  QA benchmark `/group-expenses` → `/groups`.
- 📋 Open (documentation debt, not runtime): 260/261 QA contracts missing optional fields
  (descriptions/request-body examples) — backfill via `qa:contract-enrich`; see BETA_READINESS_REPORT §Docs.
- Backend routes with no live-frontend caller are intentional: admin/ops tooling, advisor
  flows exercised via advisor surface, AA (dormant), and export/AI endpoints invoked dynamically.
