# API Specifications — Kanaku (Complete Endpoint Catalog)

> Source of truth: `backend/src/features/*/*.routes.ts` (36 modules). All routes are mounted under **`/api/v1/<module>`**, JWT-protected unless marked **PUBLIC**, Zod-validated on mutating routes, ownership-checked, and monetary writes wrapped in `prisma.$transaction`.

**Conventions**
- Auth header: `Authorization: Bearer <accessToken>`; idempotency via `Idempotency-Key`.
- Response shape: `{ success, data?, error?, code?, requestId }`.
- Status codes: `400` validation, `401` unauthenticated, `403` ownership/role, `404` not found, `409` conflict, `429` rate limited, `503` DB unavailable.
- Exact request/response shapes: see `Request_Response_Schemas.md` and `openapi.yaml`.

---

## auth — `/api/v1/auth`
| Method | Path | Notes |
|---|---|---|
| POST | `/check-email` | PUBLIC, authLimiter |
| POST | `/register` | PUBLIC, password strength enforced |
| POST | `/login/challenge` | PUBLIC, 6-digit challenge (Redis 60s) |
| POST | `/login` | PUBLIC, issues JWT + refresh |
| POST | `/refresh` | rotating refresh |
| POST | `/logout` | denylist refresh |
| GET/PUT | `/profile` | auth |
| POST | `/otp/send`, `/otp/verify` | email/mobile change |
| GET | `/devices` ; DELETE `/devices/:deviceId` | |
| DELETE | `/account` | destructiveLimiter |

## pin — `/api/v1/pin`
`POST /create`, `POST /verify`, `POST /verify-security`, `POST /update` (securityGate), `GET /status`, `GET|POST|DELETE /key-backup`, `GET /expiring-soon`, `POST /reset`, `POST /self-reset`.

## otp — `/api/v1/otp`
`POST /send`, `POST /verify`.

## sessions — `/api/v1/sessions` (advisor chat sessions)
`GET /:id`, `POST /:id/messages`, `GET /:id/messages`, `POST /:id/start`, `POST /:id/complete`, `POST /:id/cancel`.

## devices — `/api/v1/devices`
`POST /`, `GET /`, `GET /:deviceId`, `POST /:deviceId/sync`, `PUT /...`, `POST /...`, `DELETE /:deviceId`.

## settings — `/api/v1/settings`
`GET /`, `PUT /`, plus backup/restore (`GET`/`POST`/`DELETE`).

## avatars — `/api/v1/avatars`
`GET /`, `PUT /me`.

## accounts — `/api/v1/accounts`
`GET /` (cached), `POST /` (requireFeature createAccount), `GET /:id` (cached), `PUT /:id` (editAccount), `DELETE /:id` (deleteAccount).

## transactions — `/api/v1/transactions`
`GET /`, `POST /`, `POST /bulk`, `PATCH /:id`, `DELETE /:id`. Balance writes atomic.

## recurring — `/api/v1/recurring`
`GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `PATCH /:id/toggle`.

## categorization — `/api/v1/categorization`
`POST /` (predict), `POST /learn` (feedback).

## goals — `/api/v1/goals`
`GET /` (cached), `POST /` (idempotency), `GET /:id`, `PUT /:id`, `DELETE /:id`, `GET /:id/members`, `POST /:id/members` (idempotency), `DELETE /:id/members/:memberId`.

## budgets — `/api/v1/budgets`
`GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `POST /:id/recalculate`.

## loans — `/api/v1/loans`
`GET /` (cached), `POST /` (idempotency), `GET /:id`, `PUT /:id`, `DELETE /:id`, `POST /:id/payments` (EMI, atomic).

## investments — `/api/v1/investments`
`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.

## stocks — `/api/v1/stocks`
`GET /markets`, `GET /search`, `GET /stock` (quote, cached 60s), `GET /batch`, `GET /meta`.

## gold — `/api/v1/gold`
`GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`.

## bills — `/api/v1/bills`
`GET /`, `GET /:id`, `POST /` (upload, rate-limited), `DELETE /:id`.

## tax — `/api/v1/tax`
`GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`.

## dashboard — `/api/v1/dashboard`
`GET /summary` (cached), `GET /cashflow`.

## friends — `/api/v1/friends`
`GET /`, `POST /`, `POST /bulk`, `POST /import` (CSV), `GET /:id`, `PUT /:id`, `DELETE /:id`.

## groups — `/api/v1/groups`
`GET /`, `POST /repair-all-members`, `POST /`, `GET /:id`, `PUT /:id`, `POST /:id/repair-members`, `DELETE /:id`.

## todos — `/api/v1/todos`
Items: `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`. Lists: `GET|POST /lists`, `PUT|DELETE /lists/:id`, `GET /items`, `GET /lists/:listId/items`, `POST /items`, `PUT|DELETE /items/:id`. Shares: `GET /shares`, `POST /lists/:listId/share`, `PUT|DELETE /shares/:id`.

## collaboration — `/api/v1/collaboration`
`GET /`, `GET /pending`, `GET /:id`, `DELETE /:id`.

## advisors — `/api/v1/advisors`
`GET /`, `GET /application/my`, `GET /application/:id/document/:docType`, `POST /apply`, `PUT /online-status` (advisor), `PUT /role-mode`, `POST /availability`, `PUT /availability/status`, `GET /:id/availability`, `DELETE /availability/:id`, `GET /me/sessions`, `PUT /sessions/:id/rate`, `GET /admin/applications` (admin/manager), `PUT /admin/:id/approve|reject` (admin/manager), `GET /:id`.

## bookings — `/api/v1/bookings`
`GET /`, `GET /:id`, plus status transitions via `PUT`/`POST` (pending→confirmed→in_session→completed/cancelled).

## payments — `/api/v1/payments`
`POST /webhook` (PUBLIC), `GET /`, `GET /:id`, `POST /initiate`, `POST /complete`, `POST /fail`, `POST /refund`.

## notifications — `/api/v1/notifications`
`GET /`, `GET /unread/count`, `GET /:id`, `PUT /:id/read`, `POST /mark-all-read`, `DELETE /:id`, `DELETE /` (clear all), `POST /send` (admin).

## sync — `/api/v1/sync`
`POST /pull`, `POST /push`, `POST /register-device`, `GET /devices`, `POST /deactivate-device`.

## import — `/api/v1/import`
`POST /upload` (gated importStatement, Multer), `POST /confirm`, `GET /:sessionId`.

## receipts — `/api/v1/receipts`
`POST /parse` (Tesseract → Gemini, circuit breaker), plus document GET/POST/PUT/DELETE.

## voice — `/api/v1/voice`
`POST /process-audio` (gated voiceAssistant, audio upload), `POST /process` (transcript), `POST /learn`.

## ai — `/api/v1/ai`
`POST /events`, `GET /quota`, `GET /insights` (aiAutomation), `GET /health-score`, `GET /recommendations` (smartCategorization), `GET /fraud-alerts` (anomalyDetection), `GET /bill-predictions` (subscriptionDetection), `GET /spending-patterns`.

## aa — `/api/v1/aa` (Setu Account Aggregator)
`POST /notification` (PUBLIC webhook), `POST /consent`, `GET /consent/status/:consentHandle`, `GET /consent/artifact/:consentId`, `POST /data/session`, `GET /data/fetch/:sessionId`, `GET /consents`, `POST /consent/revoke/:consentId`, `GET /financial-summary`.

## admin — `/api/v1/admin`
`GET /features`, `GET /ai-features`, `GET /users`, `GET /users/pending`, `POST /users/:advisorId/approve|reject`, `GET /users/activity`, `POST /users/:userId/status`, `POST /users/:userId/role`, `DELETE /users/:userId`, `GET /users/:userId/storage`, `GET /stats`, `GET /cache/metrics`, `POST /features/toggle`, `POST /ai-features/toggle`, `GET /reports/users`, `GET /reports/revenue`, and AI ops: `GET /ai/overview|users|insights|patterns|accuracy`, `GET /ai/raw/:userId`, `POST /ai/run/features|predictions`, `GET|POST /ai/config`.

## webhooks — `/api/v1/webhooks`
`POST /sendgrid` (ECDSA P-256 signature verified).

## Cross-cutting routers
- `routes/docs.ts` — `GET /api/v1/docs` (OpenAPI JSON), `/docs/ui` (Swagger).
- `routes/sync.ts`, `routes/index.ts` — cross-feature mounts.
- Edge proxies under `api/` (Vercel): `auth.ts`, `health.ts`, `stocks.ts`, `users.ts`, `index.ts`.

---

## Request/Response examples
### POST /api/v1/transactions
```json
// Request
{ "accountId": "uuid", "type": "expense", "amount": 12.99, "category": "food",
  "date": "2026-06-19T10:00:00Z", "description": "Lunch", "clientId": "uuid" }
// 201
{ "success": true, "data": { "id": "uuid", "balanceAfter": 502.30 }, "requestId": "..." }
```
### Error (generic, no schema leak)
```json
{ "success": false, "error": "Some of your inputs look incorrect…", "code": "VALIDATION_ERROR", "requestId": "..." }
```

