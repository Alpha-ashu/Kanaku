# Role-Based Access Control Audit

Audit the RBAC implementation for all four roles: End User, Client, Advisor, Admin.

## Role definitions to verify

| Role | Expected access |
|------|----------------|
| `user` | Own financial data only — transactions, accounts, budgets, goals, bills, loans, investments |
| `client` | User data PLUS advisor search, booking, session history |
| `advisor` | Own profile + assigned client data (read-only) + session management |
| `admin` | Full platform access + feature flags + advisor approval |

## Audit steps

**Step 1 — Backend middleware:**
1. Read `backend/src/middleware/rbac.ts` — verify `requireRole()` correctly checks `req.user.role`.
2. Grep all route files: `grep -r "requireRole\|requireAuth" backend/src/modules/ --include="*.ts"` — list which routes have no auth guard.

**Step 2 — Route-by-route check:**
3. For each module folder in `backend/src/modules/`: open the `.routes.ts` file and verify every endpoint has the correct middleware.
4. Special focus: `/api/admin/*` must require `admin` role. `/api/advisors/clients/*` must require `advisor` role.

**Step 3 — Horizontal isolation:**
5. In transaction/account controllers, verify queries include `WHERE userId = req.user.id` (not just auth, but ownership).
6. Check if an advisor can accidentally query a client not assigned to them.

**Step 4 — Frontend RBAC:**
7. Read `frontend/src/hooks/useRBAC.ts` and `frontend/src/hooks/usePermissions.ts` — verify UI gating matches backend.
8. Check `frontend/src/hooks/useFeatureFlags.ts` — are feature gates tied to roles correctly?

**Step 5 — Advisor data access:**
9. Verify that when an advisor views a client's dashboard, only explicitly shared data is returned (not all transactions).

## Output

- List of routes with missing auth guards (critical)
- List of routes with wrong role guard (e.g., user-accessible admin endpoint)
- Horizontal isolation gaps
- Frontend vs backend permission mismatches
