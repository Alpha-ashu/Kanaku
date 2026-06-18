# Backend modules

The backend is organised as **feature modules** under `backend/src/modules/<feature>/`.
Each module owns one domain and is mounted under a base path in [`../routes/index.ts`](../routes/index.ts).

## Canonical module shape

| File | Role |
|---|---|
| `<m>.routes.ts` | Express router — declares endpoints, wires middleware (auth, validation, feature gates, cache). |
| `<m>.controller.ts` | HTTP layer — parses the request, calls the service, shapes the response. No business logic. |
| `<m>.service.ts` | Business logic — orchestration, rules, cross-entity coordination. |
| `<m>.repository.ts` | Data access — Prisma queries for this domain. (Not every module has one yet.) |
| `<m>.validation.ts` | Zod request schemas (the DTO/schema layer) used by `validateBody`/`validateParams`. |
| `<m>.types.ts` | Shared TypeScript types for the module. |
| `README.md` | This catalog entry — purpose, endpoints, files, conformance. |

> Convention: keep HTTP concerns in the controller, business rules in the service, and DB access in the
> repository. New modules should follow `accounts/` or `transactions/` (the most complete examples).

## Conformance legend

The **Shape** column shows which canonical files exist (in order):
**C**ontroller · **S**ervice · **D**ata-access (repository) · **V**alidation · **R**outes · **T**ypes.

## Module catalog

| Module | Base path | Endpoints | Shape | Purpose |
|---|---|---|---|---|
| [`aa`](./aa/README.md) | `/api/v1/aa` | 9 | SVRT | RBI Account Aggregator (Setu) integration — consent flows and financial-data fetch. |
| [`accounts`](./accounts/README.md) | `/api/v1/accounts` | 5 | CSDVR | User bank/cash/credit accounts — CRUD with feature-gated create/edit/delete. |
| [`admin`](./admin/README.md) | `/api/v1/admin` | 27 | CVR | Admin console — user/role management, feature flags, and operational dashboards (admin role required). |
| [`advisors`](./advisors/README.md) | `/api/v1/advisors` | 16 | CR | Financial advisor directory, verification, and ratings. |
| [`ai`](./ai/README.md) | `/api/v1/ai` | 8 | CVRT | AI/LLM features — insights, NLQ, document intelligence (lazy-loaded). |
| [`auth`](./auth/README.md) | `/api/v1/auth` | 11 | CSRT | Authentication — login, registration, token issuance, device + OTP services (public). |
| [`avatars`](./avatars/README.md) | `/api/v1/avatars` | 1 | R | Avatar gallery and user avatar assignment (public assets). |
| [`bills`](./bills/README.md) | `/api/v1/bills` | 4 | CR | Secure bill/document uploads with file-type validation (lazy-loaded). |
| [`bookings`](./bookings/README.md) | `/api/v1/bookings` | 9 | CVR | Advisor session bookings. |
| [`budgets`](./budgets/README.md) | `/api/v1/budgets` | 6 | CVR | Budgets and budget-alert thresholds. |
| [`categorization`](./categorization/README.md) | `/api/v1/categorize` | 1 | CVR | Transaction auto-categorization and learning (also mounts /learn). |
| [`collaboration`](./collaboration/README.md) | `/api/v1/collaborations` | 4 | CSVR | Unified invitation/notification system across Group Expenses, To-Do Lists, and Goals. |
| [`dashboard`](./dashboard/README.md) | `/api/v1/dashboard` | 2 | CR | Cross-feature dashboard aggregation. |
| [`devices`](./devices/README.md) | `/api/v1/devices` | 7 | CSR | Device registration and management for multi-device sync. |
| [`friends`](./friends/README.md) | `/api/v1/friends` | 7 | CVR | Friends list and friend requests. |
| [`goals`](./goals/README.md) | `/api/v1/goals` | 8 | CVR | Savings goals — CRUD and contribution tracking. |
| [`gold`](./gold/README.md) | `/api/v1/gold` | 5 | CVR | Gold/precious-metal holdings and live rates. |
| [`groups`](./groups/README.md) | `/api/v1/groups` | 7 | CVR | Group expenses and shared-expense settlement. |
| [`import`](./import/README.md) | `/api/v1/import` | 3 | CR | Statement/CSV import and smart expense ingestion. |
| [`investments`](./investments/README.md) | `/api/v1/investments` | 5 | CVR | Investment holdings (stocks, MFs, etc.) and valuation. |
| [`loans`](./loans/README.md) | `/api/v1/loans` | 6 | CVR | Loans and EMI tracking. |
| [`notifications`](./notifications/README.md) | `/api/v1/notifications` | 8 | CSR | In-app notifications and notification preferences. |
| [`otp`](./otp/README.md) | `/api/v1/otp` | 2 | SVRT | RBI-compliant OTP generation and verification. |
| [`payments`](./payments/README.md) | `/api/v1/payments` | 7 | CVR | Payment processing and settlement (includes provider webhook). |
| [`pin`](./pin/README.md) | `/api/v1/pin` | 11 | SR | App PIN setup and verification. |
| [`receipts`](./receipts/README.md) | `/api/v1/receipts` | 3 | CVR | Receipt OCR scanning and parsing (lazy-loaded). |
| [`recurring`](./recurring/README.md) | `/api/v1/recurring` | 6 | CVR | Recurring transactions and schedules. |
| [`sessions`](./sessions/README.md) | `/api/v1/sessions` | 6 | CVR | Advisor↔client session lifecycle. |
| [`settings`](./settings/README.md) | `/api/v1/settings` | 2 | CVR | User preferences and app settings. |
| [`stocks`](./stocks/README.md) | `/api/v1/stocks` | 4 | CR | Public stock/market quotes proxy. |
| [`sync`](./sync/README.md) | `/api/v1/sync` | 5 | SR | Offline-first client↔server data synchronization. |
| [`tax`](./tax/README.md) | `/api/v1/tax` | 5 | CVR | Tax estimation and calculators. |
| [`todos`](./todos/README.md) | `/api/v1/todos` | 17 | CSDVR | To-do lists with collaboration/sharing. |
| [`transactions`](./transactions/README.md) | `/api/v1/transactions` | 6 | CSDVR | Core income/expense transactions — CRUD with feature gates. |
| [`voice`](./voice/README.md) | `/api/v1/voice` | 3 | CR | Voice command parsing and voice-driven transaction entry. |
| [`webhooks`](./webhooks/README.md) | `/api/v1/webhooks` | 1 | CR | Inbound webhooks from external providers (e.g. SendGrid) — public. |

---
_Auto-generated by `scripts/gen-module-readmes.mjs`. Run `node scripts/gen-module-readmes.mjs` after adding/removing routes or modules._
