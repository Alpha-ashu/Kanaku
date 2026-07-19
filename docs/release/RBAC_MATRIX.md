# Kanaku — RBAC Matrix (Beta Audit Snapshot, 2026-07-19)

Source of truth in code: `backend/src/middleware/rbac.ts` (`requireRole`),
`middleware/adminPlatformGate.ts`, `middleware/featureGate.ts` (admin-panel feature
flags, deny-by-default), and per-route gates. Full per-endpoint export:
[Kanaku_Feature_Endpoint_Role_Matrix.xlsx](../../quality/reports/Kanaku_Feature_Endpoint_Role_Matrix.xlsx) and `quality/reports/rbac/`.

## Roles (as implemented)

| Role | Description |
|---|---|
| `user` | Default. Owns and can only touch their own financial data. |
| `advisor` | User + advisor workspace (availability, sessions, clients) after admin/manager approval (`isApproved`). |
| `manager` | Reviews/approves/rejects advisor applications; role-mode switching. |
| `admin` | Full admin module: users, feature flags, AI ops, ledger reconcile, reports, cache metrics. |

> Note: the audit brief listed a "Super Admin" role — **no such role exists in code**.
> `admin` is the top role. If a distinct super-admin is wanted post-beta, it must be added
> to `UserRole` and the matrix re-issued.

## Enforcement layers (in order)

1. `authMiddleware` — JWT verification; role/approval **re-read from DB** (60 s snapshot cache), never trusted from client claims.
2. `adminPlatformGate` — admin/manager surfaces must arrive via the admin host (`ADMIN_UI_HOSTS`); no-op until configured.
3. `requireRole(...)` — 403 + structured `authz.denied` audit event on failure.
4. `requireFeature(module, subKey)` — live feature-flag matrix from the admin panel, deny-by-default, audited.
5. `pinGate` — financial data additionally requires a live PIN unlock session.
6. Ownership scoping — every repository query filters by `userId`; shared modules check membership.

## Role → capability matrix

| Capability | user | advisor | manager | admin |
|---|:-:|:-:|:-:|:-:|
| Own accounts/transactions/goals/loans/budgets/gold/investments CRUD | ✅ | ✅ | ✅ | ✅ |
| Groups & settlements (member-scoped) | ✅ | ✅ | ✅ | ✅ |
| Todos & collaboration invites | ✅ | ✅ | ✅ | ✅ |
| Reports/export (own data) | ✅ | ✅ | ✅ | ✅ |
| Book advisor sessions | ✅ | ✅ | ✅ | ✅ |
| Apply to become advisor | ✅ | — | — | — |
| Advisor workspace (`/advisors/me/*`, availability, session rating receipt) | ❌ | ✅ (approved only) | ❌ | ✅ |
| Switch role-mode (`PUT /advisors/role-mode`) | ❌ | ✅ | ✅ | ✅ |
| List/approve/reject advisor applications (`/advisors/admin/*`) | ❌ | ❌ | ✅ | ✅ |
| Admin module (`/admin/*`: users, feature toggles, AI ops, revenue/user reports, cache metrics, ledger reconcile) | ❌ | ❌ | ❌ | ✅ |
| `GET /admin/features` & `/admin/ai-features` (login-time flag fetch) | ✅ role-filtered view | ✅ | ✅ | ✅ full matrix |
| `GET /system/integrity` (system-wide ledger/ops audit) | ❌ *(fixed in this audit — was any-authenticated)* | ❌ | ❌ | ✅ |
| `GET /api/v1/health/metrics` | ❌ | ❌ | ❌ | ✅ |
| Delete users (`DELETE /admin/users/:id`) | ❌ | ❌ | ❌ | ✅ |

## Public (unauthenticated) surface — intentional

| Endpoint | Guard |
|---|---|
| `POST /auth/register`, `/auth/login*`, `/auth/refresh`, `/auth/forgot-password`, … | per-endpoint rate limits |
| `GET /avatars/dicebear/:style/svg` | static asset proxy, no user data |
| `POST /webhooks/sendgrid`, `POST /payments/webhook` | HMAC signature over raw body |
| `GET /health` | liveness only, minimal info |
| `GET /metrics` | `METRICS_TOKEN` bearer (must be set in production — see RELEASE_CHECKLIST) |
| `GET /stocks/*` (market data) | public quotes, rate-limited |

## Frontend surface separation

Admin/Manager UI chunks are compiled out of the user-facing build
(`VITE_APP_SURFACE=user` → `__ADMIN_UI_ENABLED__=false`), so user builds physically
lack admin screens; server-side RBAC remains the actual enforcement.
