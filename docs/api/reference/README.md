# API Endpoint Reference

Auto-generated — one file per endpoint. **246 endpoints** across **38 feature groups** (185 with a full OpenAPI contract, 61 ⚠️ spec-pending stubs). Base prefix: `/api/v1` (servers: `https://api.example.com`, `<prod>`).

> Source of truth for documented endpoints: `backend/src/docs/api-docs.ts`. ⚠️ rows are parsed from the Express routes and need promoting into that spec. Regenerate with `npm run docs:endpoints`. Live Swagger UI: `/api-docs` · raw spec: `/api-docs/openapi.json` · gap checklist: [COVERAGE.md](./COVERAGE.md).

Pairs with the machine-readable JSON contracts in [`../contracts/`](../contracts/README.md) (see [`../README.md`](../README.md)). This human-readable reference is generated from the OpenAPI spec.

## aa

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| POST | `/api/v1/aa/consent` | ⚠️ spec pending | [↗](./aa/POST__consent.md) |
| GET | `/api/v1/aa/consent/artifact/{consentId}` | ⚠️ spec pending | [↗](./aa/GET__consent-artifact-consentId.md) |
| POST | `/api/v1/aa/consent/revoke/{consentId}` | ⚠️ spec pending | [↗](./aa/POST__consent-revoke-consentId.md) |
| GET | `/api/v1/aa/consent/status/{consentHandle}` | ⚠️ spec pending | [↗](./aa/GET__consent-status-consentHandle.md) |
| GET | `/api/v1/aa/consents` | ⚠️ spec pending | [↗](./aa/GET__consents.md) |
| GET | `/api/v1/aa/data/fetch/{sessionId}` | ⚠️ spec pending | [↗](./aa/GET__data-fetch-sessionId.md) |
| POST | `/api/v1/aa/data/session` | ⚠️ spec pending | [↗](./aa/POST__data-session.md) |
| GET | `/api/v1/aa/financial-summary` | ⚠️ spec pending | [↗](./aa/GET__financial-summary.md) |
| POST | `/api/v1/aa/notification` | ⚠️ spec pending | [↗](./aa/POST__notification.md) |

## accounts

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/accounts` | List all accounts | [↗](./accounts/GET__index.md) |
| POST | `/api/v1/accounts` | Create account | [↗](./accounts/POST__index.md) |
| DELETE | `/api/v1/accounts/{id}` | Delete account (soft) | [↗](./accounts/DELETE__id.md) |
| GET | `/api/v1/accounts/{id}` | Get account | [↗](./accounts/GET__id.md) |
| PUT | `/api/v1/accounts/{id}` | Update account | [↗](./accounts/PUT__id.md) |

## admin

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/admin/ai-features` | Get AI feature flags (any authenticated user) | [↗](./admin/GET__ai-features.md) |
| POST | `/api/v1/admin/ai-features/toggle` | Toggle AI feature flag (Admin only) | [↗](./admin/POST__ai-features-toggle.md) |
| GET | `/api/v1/admin/ai/accuracy` | AI accuracy (Admin only) | [↗](./admin/GET__ai-accuracy.md) |
| GET | `/api/v1/admin/ai/config` | Get AI config (Admin only) | [↗](./admin/GET__ai-config.md) |
| POST | `/api/v1/admin/ai/config` | Update AI config (Admin only) | [↗](./admin/POST__ai-config.md) |
| GET | `/api/v1/admin/ai/insights` | AI insights summary (Admin only) | [↗](./admin/GET__ai-insights.md) |
| GET | `/api/v1/admin/ai/overview` | AI overview (Admin only) | [↗](./admin/GET__ai-overview.md) |
| GET | `/api/v1/admin/ai/patterns` | AI patterns (Admin only) | [↗](./admin/GET__ai-patterns.md) |
| GET | `/api/v1/admin/ai/raw/{userId}` | AI raw user data (Admin only) | [↗](./admin/GET__ai-raw-userId.md) |
| POST | `/api/v1/admin/ai/run/features` | Refresh AI features (Admin only) | [↗](./admin/POST__ai-run-features.md) |
| POST | `/api/v1/admin/ai/run/predictions` | Refresh AI predictions (Admin only) | [↗](./admin/POST__ai-run-predictions.md) |
| GET | `/api/v1/admin/ai/users` | AI users (Admin only) | [↗](./admin/GET__ai-users.md) |
| GET | `/api/v1/admin/cache/metrics` | Cache metrics (Admin only) | [↗](./admin/GET__cache-metrics.md) |
| GET | `/api/v1/admin/features` | Get feature flags (any authenticated user) | [↗](./admin/GET__features.md) |
| POST | `/api/v1/admin/features/toggle` | Toggle feature flag (Admin only) | [↗](./admin/POST__features-toggle.md) |
| GET | `/api/v1/admin/reports/revenue` | Revenue report (Admin only) | [↗](./admin/GET__reports-revenue.md) |
| GET | `/api/v1/admin/reports/users` | Users report (Admin only) | [↗](./admin/GET__reports-users.md) |
| GET | `/api/v1/admin/stats` | Platform statistics (Admin only) | [↗](./admin/GET__stats.md) |
| GET | `/api/v1/admin/users` | List all users (Admin only) | [↗](./admin/GET__users.md) |
| POST | `/api/v1/admin/users/{advisorId}/approve` | Approve advisor (Admin only) | [↗](./admin/POST__users-advisorId-approve.md) |
| POST | `/api/v1/admin/users/{advisorId}/reject` | Reject advisor (Admin only) | [↗](./admin/POST__users-advisorId-reject.md) |
| DELETE | `/api/v1/admin/users/{userId}` | Delete user (Admin only) | [↗](./admin/DELETE__users-userId.md) |
| POST | `/api/v1/admin/users/{userId}/role` | Update user role (Admin only) | [↗](./admin/POST__users-userId-role.md) |
| POST | `/api/v1/admin/users/{userId}/status` | Toggle user status (Admin only) | [↗](./admin/POST__users-userId-status.md) |
| GET | `/api/v1/admin/users/{userId}/storage` | User storage stats (Admin only) | [↗](./admin/GET__users-userId-storage.md) |
| GET | `/api/v1/admin/users/activity` | User activity stats (Admin only) | [↗](./admin/GET__users-activity.md) |
| GET | `/api/v1/admin/users/pending` | Pending advisor applications (Admin only) | [↗](./admin/GET__users-pending.md) |

## advisors

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/advisors` | List approved advisors (public) | [↗](./advisors/GET__index.md) |
| GET | `/api/v1/advisors/{id}` | Get advisor profile (public) | [↗](./advisors/GET__id.md) |
| GET | `/api/v1/advisors/{id}/availability` | Get advisor availability | [↗](./advisors/GET__id-availability.md) |
| PUT | `/api/v1/advisors/admin/{id}/approve` | Approve advisor (Admin/Manager) | [↗](./advisors/PUT__admin-id-approve.md) |
| PUT | `/api/v1/advisors/admin/{id}/reject` | Reject advisor (Admin/Manager) | [↗](./advisors/PUT__admin-id-reject.md) |
| GET | `/api/v1/advisors/admin/applications` | Pending advisor applications (Admin/Manager) | [↗](./advisors/GET__admin-applications.md) |
| GET | `/api/v1/advisors/application/{id}/document/{docType}` | ⚠️ spec pending | [↗](./advisors/GET__application-id-document-docType.md) |
| GET | `/api/v1/advisors/application/my` | ⚠️ spec pending | [↗](./advisors/GET__application-my.md) |
| POST | `/api/v1/advisors/apply` | Apply to become advisor | [↗](./advisors/POST__apply.md) |
| POST | `/api/v1/advisors/availability` | Set availability slot (Advisor only) | [↗](./advisors/POST__availability.md) |
| DELETE | `/api/v1/advisors/availability/{id}` | Delete availability slot (Advisor only) | [↗](./advisors/DELETE__availability-id.md) |
| PUT | `/api/v1/advisors/availability/status` | Toggle availability (Advisor only) | [↗](./advisors/PUT__availability-status.md) |
| GET | `/api/v1/advisors/me/sessions` | My sessions (Advisor only) | [↗](./advisors/GET__me-sessions.md) |
| PUT | `/api/v1/advisors/online-status` | ⚠️ spec pending | [↗](./advisors/PUT__online-status.md) |
| PUT | `/api/v1/advisors/role-mode` | ⚠️ spec pending | [↗](./advisors/PUT__role-mode.md) |
| PUT | `/api/v1/advisors/sessions/{id}/rate` | Rate session (Client) | [↗](./advisors/PUT__sessions-id-rate.md) |

## ai

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/ai/bill-predictions` | Predicted upcoming bills | [↗](./ai/GET__bill-predictions.md) |
| POST | `/api/v1/ai/events` | Capture AI event | [↗](./ai/POST__events.md) |
| GET | `/api/v1/ai/fraud-alerts` | Fraud detection alerts | [↗](./ai/GET__fraud-alerts.md) |
| GET | `/api/v1/ai/health-score` | Financial health score (0-100) | [↗](./ai/GET__health-score.md) |
| GET | `/api/v1/ai/insights` | Consolidated AI insights (all agents) | [↗](./ai/GET__insights.md) |
| GET | `/api/v1/ai/quota` | AI usage quota | [↗](./ai/GET__quota.md) |
| GET | `/api/v1/ai/recommendations` | AI recommendations (budget, goals, investments) | [↗](./ai/GET__recommendations.md) |
| GET | `/api/v1/ai/spending-patterns` | Spending pattern analysis | [↗](./ai/GET__spending-patterns.md) |

## auth

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| DELETE | `/api/v1/auth/account` | Delete own account (3/min rate limit) | [↗](./auth/DELETE__account.md) |
| POST | `/api/v1/auth/check-email` | ⚠️ spec pending | [↗](./auth/POST__check-email.md) |
| GET | `/api/v1/auth/devices` | List authenticated devices | [↗](./auth/GET__devices.md) |
| DELETE | `/api/v1/auth/devices/{deviceId}` | Revoke device | [↗](./auth/DELETE__devices-deviceId.md) |
| POST | `/api/v1/auth/login` | Login with email + password | [↗](./auth/POST__login.md) |
| POST | `/api/v1/auth/login/challenge` | Request challenge code (2-phase login) | [↗](./auth/POST__login-challenge.md) |
| POST | `/api/v1/auth/logout` | ⚠️ spec pending | [↗](./auth/POST__logout.md) |
| POST | `/api/v1/auth/otp/send` | Send OTP | [↗](./auth/POST__otp-send.md) |
| POST | `/api/v1/auth/otp/verify` | Verify OTP | [↗](./auth/POST__otp-verify.md) |
| GET | `/api/v1/auth/profile` | Get current user profile | [↗](./auth/GET__profile.md) |
| PUT | `/api/v1/auth/profile` | Update profile | [↗](./auth/PUT__profile.md) |
| POST | `/api/v1/auth/refresh` | ⚠️ spec pending | [↗](./auth/POST__refresh.md) |
| POST | `/api/v1/auth/register` | Register new user | [↗](./auth/POST__register.md) |

## avatars

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/avatars/dicebear/{style}/svg` | Get DiceBear avatar SVG (public) | [↗](./avatars/GET__dicebear-style-svg.md) |

## bills

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/bills` | List uploaded bills | [↗](./bills/GET__index.md) |
| POST | `/api/v1/bills` | Upload bill document (rate: 10/min) | [↗](./bills/POST__index.md) |
| DELETE | `/api/v1/bills/{id}` | Delete bill | [↗](./bills/DELETE__id.md) |
| GET | `/api/v1/bills/{id}` | ⚠️ spec pending | [↗](./bills/GET__id.md) |

## bookings

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/bookings` | List bookings | [↗](./bookings/GET__index.md) |
| POST | `/api/v1/bookings` | Create booking request | [↗](./bookings/POST__index.md) |
| POST | `/api/v1/bookings/{bookingId}/fee/pay` | Mark fee as paid (Advisor only) | [↗](./bookings/POST__bookingId-fee-pay.md) |
| GET | `/api/v1/bookings/{id}` | Get booking | [↗](./bookings/GET__id.md) |
| PUT | `/api/v1/bookings/{id}/accept` | Accept booking (Advisor only) | [↗](./bookings/PUT__id-accept.md) |
| PUT | `/api/v1/bookings/{id}/cancel` | Cancel booking (any party) | [↗](./bookings/PUT__id-cancel.md) |
| PUT | `/api/v1/bookings/{id}/reject` | Reject booking (Advisor only) | [↗](./bookings/PUT__id-reject.md) |
| PUT | `/api/v1/bookings/{id}/reschedule` | Reschedule booking (Advisor only) | [↗](./bookings/PUT__id-reschedule.md) |
| GET | `/api/v1/bookings/workspace/clients` | Advisor client list (Advisor only) | [↗](./bookings/GET__workspace-clients.md) |

## budgets

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/budgets` | ⚠️ spec pending | [↗](./budgets/GET__index.md) |
| POST | `/api/v1/budgets` | ⚠️ spec pending | [↗](./budgets/POST__index.md) |
| DELETE | `/api/v1/budgets/{id}` | ⚠️ spec pending | [↗](./budgets/DELETE__id.md) |
| GET | `/api/v1/budgets/{id}` | ⚠️ spec pending | [↗](./budgets/GET__id.md) |
| PUT | `/api/v1/budgets/{id}` | ⚠️ spec pending | [↗](./budgets/PUT__id.md) |
| POST | `/api/v1/budgets/{id}/recalculate` | ⚠️ spec pending | [↗](./budgets/POST__id-recalculate.md) |

## categorize

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| POST | `/api/v1/categorize` | Auto-categorize transaction | [↗](./categorize/POST__index.md) |

## collaborations

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/collaborations` | ⚠️ spec pending | [↗](./collaborations/GET__index.md) |
| DELETE | `/api/v1/collaborations/{id}` | ⚠️ spec pending | [↗](./collaborations/DELETE__id.md) |
| GET | `/api/v1/collaborations/{id}` | ⚠️ spec pending | [↗](./collaborations/GET__id.md) |
| GET | `/api/v1/collaborations/pending` | ⚠️ spec pending | [↗](./collaborations/GET__pending.md) |

## dashboard

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/dashboard/cashflow` | Monthly cashflow breakdown | [↗](./dashboard/GET__cashflow.md) |
| GET | `/api/v1/dashboard/summary` | Financial dashboard summary | [↗](./dashboard/GET__summary.md) |

## devices

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/devices` | List registered devices | [↗](./devices/GET__index.md) |
| POST | `/api/v1/devices` | Register or update device | [↗](./devices/POST__index.md) |
| DELETE | `/api/v1/devices/{deviceId}` | Delete device | [↗](./devices/DELETE__deviceId.md) |
| GET | `/api/v1/devices/{deviceId}` | Get device | [↗](./devices/GET__deviceId.md) |
| POST | `/api/v1/devices/{deviceId}/deactivate` | Deactivate device | [↗](./devices/POST__deviceId-deactivate.md) |
| POST | `/api/v1/devices/{deviceId}/sync` | Update device sync timestamp | [↗](./devices/POST__deviceId-sync.md) |
| PUT | `/api/v1/devices/{deviceId}/tokens` | Update push notification tokens | [↗](./devices/PUT__deviceId-tokens.md) |

## friends

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/friends` | List contacts | [↗](./friends/GET__index.md) |
| POST | `/api/v1/friends` | Add contact | [↗](./friends/POST__index.md) |
| DELETE | `/api/v1/friends/{id}` | Delete contact | [↗](./friends/DELETE__id.md) |
| GET | `/api/v1/friends/{id}` | ⚠️ spec pending | [↗](./friends/GET__id.md) |
| PUT | `/api/v1/friends/{id}` | Update contact | [↗](./friends/PUT__id.md) |
| POST | `/api/v1/friends/bulk` | ⚠️ spec pending | [↗](./friends/POST__bulk.md) |
| POST | `/api/v1/friends/import` | ⚠️ spec pending | [↗](./friends/POST__import.md) |

## goals

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/goals` | List savings goals | [↗](./goals/GET__index.md) |
| POST | `/api/v1/goals` | Create savings goal | [↗](./goals/POST__index.md) |
| DELETE | `/api/v1/goals/{id}` | Delete goal (soft) | [↗](./goals/DELETE__id.md) |
| GET | `/api/v1/goals/{id}` | Get goal | [↗](./goals/GET__id.md) |
| PUT | `/api/v1/goals/{id}` | Update goal | [↗](./goals/PUT__id.md) |
| GET | `/api/v1/goals/{id}/members` | ⚠️ spec pending | [↗](./goals/GET__id-members.md) |
| POST | `/api/v1/goals/{id}/members` | ⚠️ spec pending | [↗](./goals/POST__id-members.md) |
| DELETE | `/api/v1/goals/{id}/members/{memberId}` | ⚠️ spec pending | [↗](./goals/DELETE__id-members-memberId.md) |

## gold

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/gold` | ⚠️ spec pending | [↗](./gold/GET__index.md) |
| POST | `/api/v1/gold` | ⚠️ spec pending | [↗](./gold/POST__index.md) |
| DELETE | `/api/v1/gold/{id}` | ⚠️ spec pending | [↗](./gold/DELETE__id.md) |
| GET | `/api/v1/gold/{id}` | ⚠️ spec pending | [↗](./gold/GET__id.md) |
| PUT | `/api/v1/gold/{id}` | ⚠️ spec pending | [↗](./gold/PUT__id.md) |

## groups

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/groups` | List group expenses | [↗](./groups/GET__index.md) |
| POST | `/api/v1/groups` | Create group expense | [↗](./groups/POST__index.md) |
| DELETE | `/api/v1/groups/{id}` | Delete group expense | [↗](./groups/DELETE__id.md) |
| GET | `/api/v1/groups/{id}` | ⚠️ spec pending | [↗](./groups/GET__id.md) |
| PUT | `/api/v1/groups/{id}` | Update group expense | [↗](./groups/PUT__id.md) |
| POST | `/api/v1/groups/{id}/repair-members` | ⚠️ spec pending | [↗](./groups/POST__id-repair-members.md) |
| POST | `/api/v1/groups/repair-all-members` | ⚠️ spec pending | [↗](./groups/POST__repair-all-members.md) |

## health

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/health` | Health check | [↗](./health/GET__index.md) |

## import

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/import/{sessionId}` | Get import session preview | [↗](./import/GET__sessionId.md) |
| POST | `/api/v1/import/confirm` | Confirm and save imported transactions | [↗](./import/POST__confirm.md) |
| POST | `/api/v1/import/upload` | Upload bank statement (CSV/Excel) for preview | [↗](./import/POST__upload.md) |

## investments

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/investments` | List investments | [↗](./investments/GET__index.md) |
| POST | `/api/v1/investments` | Create investment | [↗](./investments/POST__index.md) |
| DELETE | `/api/v1/investments/{id}` | Delete investment | [↗](./investments/DELETE__id.md) |
| GET | `/api/v1/investments/{id}` | ⚠️ spec pending | [↗](./investments/GET__id.md) |
| PUT | `/api/v1/investments/{id}` | Update investment | [↗](./investments/PUT__id.md) |

## learn

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| POST | `/api/v1/learn` | Record categorization correction | [↗](./learn/POST__index.md) |

## loans

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/loans` | List loans | [↗](./loans/GET__index.md) |
| POST | `/api/v1/loans` | Create loan | [↗](./loans/POST__index.md) |
| DELETE | `/api/v1/loans/{id}` | Delete loan (soft) | [↗](./loans/DELETE__id.md) |
| GET | `/api/v1/loans/{id}` | Get loan | [↗](./loans/GET__id.md) |
| PUT | `/api/v1/loans/{id}` | Update loan | [↗](./loans/PUT__id.md) |
| POST | `/api/v1/loans/{id}/payment` | Record EMI / loan payment | [↗](./loans/POST__id-payment.md) |

## notifications

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| DELETE | `/api/v1/notifications` | Clear all notifications | [↗](./notifications/DELETE__index.md) |
| GET | `/api/v1/notifications` | List notifications | [↗](./notifications/GET__index.md) |
| DELETE | `/api/v1/notifications/{id}` | Delete notification | [↗](./notifications/DELETE__id.md) |
| GET | `/api/v1/notifications/{id}` | Get notification | [↗](./notifications/GET__id.md) |
| PUT | `/api/v1/notifications/{id}/read` | Mark notification as read | [↗](./notifications/PUT__id-read.md) |
| POST | `/api/v1/notifications/mark-all-read` | Mark all as read | [↗](./notifications/POST__mark-all-read.md) |
| POST | `/api/v1/notifications/send` | Send notification (Admin only) | [↗](./notifications/POST__send.md) |
| GET | `/api/v1/notifications/unread/count` | Unread notification count | [↗](./notifications/GET__unread-count.md) |

## otp

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| POST | `/api/v1/otp/send` | ⚠️ spec pending | [↗](./otp/POST__send.md) |
| POST | `/api/v1/otp/verify` | ⚠️ spec pending | [↗](./otp/POST__verify.md) |

## payments

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/payments` | List payments | [↗](./payments/GET__index.md) |
| GET | `/api/v1/payments/{id}` | Get payment | [↗](./payments/GET__id.md) |
| POST | `/api/v1/payments/complete` | Confirm payment | [↗](./payments/POST__complete.md) |
| POST | `/api/v1/payments/fail` | Record payment failure | [↗](./payments/POST__fail.md) |
| POST | `/api/v1/payments/initiate` | Initiate Stripe checkout | [↗](./payments/POST__initiate.md) |
| POST | `/api/v1/payments/refund` | Refund payment (Stripe) | [↗](./payments/POST__refund.md) |
| POST | `/api/v1/payments/webhook` | Stripe webhook (public, no JWT) | [↗](./payments/POST__webhook.md) |

## pin

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| POST | `/api/v1/pin/create` | Create PIN | [↗](./pin/POST__create.md) |
| GET | `/api/v1/pin/expiring-soon` | Check if PIN expiring soon | [↗](./pin/GET__expiring-soon.md) |
| DELETE | `/api/v1/pin/key-backup` | Clear key backup | [↗](./pin/DELETE__key-backup.md) |
| GET | `/api/v1/pin/key-backup` | Get encrypted key backup | [↗](./pin/GET__key-backup.md) |
| POST | `/api/v1/pin/key-backup` | Save key backup (requires X-Security-Token) | [↗](./pin/POST__key-backup.md) |
| POST | `/api/v1/pin/reset` | Force reset PIN (Admin only) | [↗](./pin/POST__reset.md) |
| POST | `/api/v1/pin/self-reset` | Self-reset PIN (requires X-Security-Token) | [↗](./pin/POST__self-reset.md) |
| GET | `/api/v1/pin/status` | PIN setup status | [↗](./pin/GET__status.md) |
| POST | `/api/v1/pin/update` | Change PIN (requires X-Security-Token header) | [↗](./pin/POST__update.md) |
| POST | `/api/v1/pin/verify` | Verify PIN | [↗](./pin/POST__verify.md) |
| POST | `/api/v1/pin/verify-security` | Issue security token (biometric) | [↗](./pin/POST__verify-security.md) |

## receipts

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| POST | `/api/v1/receipts/scan` | Synchronous receipt scan (deprecated) | [↗](./receipts/POST__scan.md) |
| POST | `/api/v1/receipts/start` | Start async receipt OCR scan | [↗](./receipts/POST__start.md) |
| GET | `/api/v1/receipts/status/{jobId}` | Get receipt scan status | [↗](./receipts/GET__status-jobId.md) |

## recurring

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/recurring` | ⚠️ spec pending | [↗](./recurring/GET__index.md) |
| POST | `/api/v1/recurring` | ⚠️ spec pending | [↗](./recurring/POST__index.md) |
| DELETE | `/api/v1/recurring/{id}` | ⚠️ spec pending | [↗](./recurring/DELETE__id.md) |
| GET | `/api/v1/recurring/{id}` | ⚠️ spec pending | [↗](./recurring/GET__id.md) |
| PUT | `/api/v1/recurring/{id}` | ⚠️ spec pending | [↗](./recurring/PUT__id.md) |
| PATCH | `/api/v1/recurring/{id}/toggle` | ⚠️ spec pending | [↗](./recurring/PATCH__id-toggle.md) |

## sessions

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/sessions/{id}` | Get session details | [↗](./sessions/GET__id.md) |
| POST | `/api/v1/sessions/{id}/cancel` | Cancel session | [↗](./sessions/POST__id-cancel.md) |
| POST | `/api/v1/sessions/{id}/complete` | Complete session (Advisor only) | [↗](./sessions/POST__id-complete.md) |
| GET | `/api/v1/sessions/{id}/messages` | Get chat messages | [↗](./sessions/GET__id-messages.md) |
| POST | `/api/v1/sessions/{id}/messages` | Send chat message | [↗](./sessions/POST__id-messages.md) |
| POST | `/api/v1/sessions/{id}/start` | Start session (Advisor only) | [↗](./sessions/POST__id-start.md) |

## settings

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/settings` | Get user preferences | [↗](./settings/GET__index.md) |
| PUT | `/api/v1/settings` | Update user preferences | [↗](./settings/PUT__index.md) |
| DELETE | `/api/v1/settings/account` | ⚠️ spec pending | [↗](./settings/DELETE__account.md) |
| POST | `/api/v1/settings/account/cancel-deletion` | ⚠️ spec pending | [↗](./settings/POST__account-cancel-deletion.md) |
| GET | `/api/v1/settings/export` | ⚠️ spec pending | [↗](./settings/GET__export.md) |

## stocks

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/stocks/batch` | Batch stock quotes (public) | [↗](./stocks/GET__batch.md) |
| GET | `/api/v1/stocks/markets` | Get market indices (public) | [↗](./stocks/GET__markets.md) |
| GET | `/api/v1/stocks/search` | Search stocks (public) | [↗](./stocks/GET__search.md) |
| GET | `/api/v1/stocks/stock` | Get stock quote (public) | [↗](./stocks/GET__stock.md) |

## sync

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| POST | `/api/v1/sync/deactivate-device` | Deactivate sync device | [↗](./sync/POST__deactivate-device.md) |
| GET | `/api/v1/sync/devices` | List sync devices | [↗](./sync/GET__devices.md) |
| GET | `/api/v1/sync/meta` | ⚠️ spec pending | [↗](./sync/GET__meta.md) |
| POST | `/api/v1/sync/pull` | Pull delta changes from cloud | [↗](./sync/POST__pull.md) |
| POST | `/api/v1/sync/push` | Push local changes to cloud | [↗](./sync/POST__push.md) |
| POST | `/api/v1/sync/register-device` | Register sync device (idempotent) | [↗](./sync/POST__register-device.md) |

## todos

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/todos` | List todos (legacy) | [↗](./todos/GET__index.md) |
| POST | `/api/v1/todos` | Create todo (legacy) | [↗](./todos/POST__index.md) |
| DELETE | `/api/v1/todos/{id}` | Delete todo (legacy) | [↗](./todos/DELETE__id.md) |
| PUT | `/api/v1/todos/{id}` | Update todo (legacy) | [↗](./todos/PUT__id.md) |
| GET | `/api/v1/todos/items` | All todo items across lists | [↗](./todos/GET__items.md) |
| POST | `/api/v1/todos/items` | Create todo item | [↗](./todos/POST__items.md) |
| DELETE | `/api/v1/todos/items/{id}` | Delete todo item | [↗](./todos/DELETE__items-id.md) |
| PUT | `/api/v1/todos/items/{id}` | Update todo item | [↗](./todos/PUT__items-id.md) |
| GET | `/api/v1/todos/lists` | List todo lists (shared) | [↗](./todos/GET__lists.md) |
| POST | `/api/v1/todos/lists` | Create todo list | [↗](./todos/POST__lists.md) |
| DELETE | `/api/v1/todos/lists/{id}` | Delete todo list | [↗](./todos/DELETE__lists-id.md) |
| PUT | `/api/v1/todos/lists/{id}` | Update todo list | [↗](./todos/PUT__lists-id.md) |
| GET | `/api/v1/todos/lists/{listId}/items` | Items in a specific list | [↗](./todos/GET__lists-listId-items.md) |
| POST | `/api/v1/todos/lists/{listId}/share` | Share todo list with user | [↗](./todos/POST__lists-listId-share.md) |
| GET | `/api/v1/todos/shares` | My todo list shares | [↗](./todos/GET__shares.md) |
| DELETE | `/api/v1/todos/shares/{id}` | Remove share | [↗](./todos/DELETE__shares-id.md) |
| PUT | `/api/v1/todos/shares/{id}` | Update share permission | [↗](./todos/PUT__shares-id.md) |

## transactions

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| GET | `/api/v1/transactions` | List transactions | [↗](./transactions/GET__index.md) |
| POST | `/api/v1/transactions` | Create transaction | [↗](./transactions/POST__index.md) |
| DELETE | `/api/v1/transactions/{id}` | Delete transaction (reverses balance) | [↗](./transactions/DELETE__id.md) |
| GET | `/api/v1/transactions/{id}` | Get transaction | [↗](./transactions/GET__id.md) |
| PUT | `/api/v1/transactions/{id}` | Update transaction | [↗](./transactions/PUT__id.md) |
| GET | `/api/v1/transactions/account/{accountId}` | Get transactions by account | [↗](./transactions/GET__account-accountId.md) |
| POST | `/api/v1/transactions/bulk` | ⚠️ spec pending | [↗](./transactions/POST__bulk.md) |

## voice

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| POST | `/api/v1/voice/learn` | Record voice correction | [↗](./voice/POST__learn.md) |
| POST | `/api/v1/voice/process` | Parse voice transcript to financial intents | [↗](./voice/POST__process.md) |
| POST | `/api/v1/voice/process-audio` | Transcribe + process audio file | [↗](./voice/POST__process-audio.md) |

## webhooks

| Method | Endpoint | Summary | Doc |
|---|---|---|---|
| POST | `/api/v1/webhooks/sendgrid` | ⚠️ spec pending | [↗](./webhooks/POST__sendgrid.md) |

