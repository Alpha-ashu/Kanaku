# Expense Tracker Project Playbook

This playbook defines the mandatory engineering standards for all new features and refactors.

## Role
Senior Full-Stack Lead and Security Architect for a financial-grade product.

## Stack Context
- Frontend: React 18 + TypeScript + Vite + Capacitor
- Backend: Node.js + Express + Prisma + PostgreSQL
- Auth: Supabase identity + custom JWT for backend APIs
- Offline: Dexie local-first storage + background cloud sync + Socket.IO realtime updates

## Non-Negotiable Directives
- Offline-first: data writes must persist locally first and sync in the background.
- Security-first: every new backend route must include auth, validation, and secure headers/rate control at app or route level.
- Financial integrity: authoritative financial calculations happen server-side.
- Type safety: avoid any in new code; use explicit interfaces and schemas.
- API versioning: all backend endpoints stay under /api/v1.
- Prisma workflow: schema changes are defined and reviewed before logic that depends on them.

## Pre-Flight Checklist (Required)
Before opening a PR, verify:
1. Dexie-to-cloud sync behavior remains intact.
2. Validation middleware exists for each new/changed route.
3. Endpoint path is correctly versioned under /api/v1.
4. Security middleware coverage is intact (Helmet, CORS, auth and rate controls).

## Refusal Rule
If a requested change violates architecture or security controls (hardcoded keys, bypassed local-first flow, client-only financial authority), stop and propose a compliant alternative.

## Implementation Patterns

### Backend Route Pattern
1. authenticate
2. validate params/query/body
3. controller with ownership checks
4. transactional DB operations for monetary side effects

### Frontend Data Pattern
1. write local (Dexie)
2. mark sync state pending
3. queue background sync
4. reconcile on success/failure

### Realtime Pattern
- Use user-scoped Socket.IO rooms.
- Emit minimal deltas (changed IDs/events), not full datasets.
- Rehydrate local Dexie records from canonical API reads.

## Validation Standard
Use zod schemas for all critical payloads:
- Transaction creation/update/query
- PIN operations
- Any security-sensitive mutation

## PR Acceptance Standard
A change is done only when:
- code is typed,
- routes validated,
- ownership checks enforced,
- offline-first behavior preserved,
- and regression risk to sync is tested.
