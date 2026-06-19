# Copilot Instructions: Expense Tracker

You are building a financial-grade app. Follow these constraints for every task.

## 📕 Rulebook (read FIRST for any new feature)
Before creating or changing any feature, route, screen, table, or migration, you
**MUST** consult and comply with **`docs/RULEBOOK.md`** (derived from the app
Terms & Conditions `docs/TERMS_*.md` + these guardrails). For a new feature, fill
**`docs/FEATURE_TEMPLATE.md`** and satisfy **every** applicable box in the
Rulebook's §9 *Definition of Done* before shipping. If a rule blocks the feature,
the rule wins — escalate, do not bypass. Precedence: Law → Terms →
`KANAKU_PROJECT_OVERVIEW.md` → `docs/RULEBOOK.md` → skill docs → individual PRs.

## Architecture Guardrails
- React 18 + TypeScript frontend on Vite + Capacitor.
- Node.js/Express backend with Prisma/PostgreSQL.
- Supabase for identity, custom JWT for backend authorization.
- Local-first data flow using Dexie; cloud sync happens asynchronously.

## Security Requirements
- Keep API routes under /api/v1.
- Use authenticated route access for protected resources.
- Require input validation middleware (zod) for params/query/body.
- Preserve Helmet + CORS + rate limiting controls.
- Do not hardcode secrets or bypass auth/sync controls.

## Data Integrity Requirements
- Monetary logic must be server-authoritative.
- Use DB transactions when balance updates and transaction creation are coupled.
- Enforce ownership checks before read/write operations.

## Type Safety Requirements
- Avoid any in newly written code.
- Prefer explicit interfaces, zod schemas, and typed DTOs.

## Offline-First Requirements
- Local write first, mark sync pending.
- Retry sync in background.
- Keep realtime updates user-scoped and delta-based.

## Pre-Flight Check
Before finalizing code, verify:
1. Dexie-to-cloud sync remains consistent.
2. Validation middleware exists on changed/new routes.
3. Endpoint pathing is correctly versioned under /api/v1.
