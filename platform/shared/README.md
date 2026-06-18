# Platform · Shared — Cross-Cutting Building Blocks

Code shared **across features**. Physical files stay inside `frontend/` and
`backend/` to keep each app's build graph intact; this is the index.

## Frontend shared

| What | Location |
|---|---|
| UI components | `frontend/src/components/` |
| Hooks (cross-feature) | `frontend/src/hooks/` |
| Utils / formatters / money helpers | `frontend/src/utils/`, `frontend/src/lib/` |
| Constants | `frontend/src/constants/` |
| Types (cross-feature) | `frontend/src/types/` |
| Contexts (auth, theme, sync) | `frontend/src/contexts/` |

## Backend shared

| What | Location |
|---|---|
| Logger / error handler | `backend/src/utils/` |
| Middleware (auth, RBAC, validate, rateLimit) | `backend/src/middleware/` |
| Prisma client | `backend/src/db/` |
| Audit logger | `backend/src/utils/auditLogger.ts` |
| Sanitization | `backend/src/utils/sanitize.ts` |
| Sockets | `backend/src/sockets/` |
| Workers (sync, scheduled jobs) | `backend/src/workers/` |

## Rules

1. A file belongs here only if used by **2+ features**. One-offs stay in the feature.
2. No business logic in shared — only pure helpers, types, infra glue.
3. Everything typed (no `any`).
4. A change here requires re-running the **full** test matrix.

