# Kanaku — Code Quality Report (Beta Audit, 2026-07-19)

## Verdict

Architecture and conventions are strong and consistent (feature folders, layered
routes→controller→service→repository, zod validation, shared middleware). The debt is
concentrated in two places: a **legacy unrouted frontend tree** and **lint noise**.

## What's clean (verified)

- **Zero TODO/FIXME/placeholder markers** in backend product code (only 6 benign comment
  matches repo-wide); no placeholder pages or dead links in the live UI surface.
- Type-safe: both workspaces pass strict `tsc --noEmit`.
- SOLID/DRY: cross-cutting concerns centralized once each (auth, RBAC, feature gate,
  validation, caching, idempotency, audit) — no copy-pasted variants found.
- Naming: consistent kebab/camel conventions; consistent API envelope.
- Money handling: single `utils/money.ts` decimal toolkit used by services.

## Findings

### Q-1 — Legacy unrouted frontend tree (MEDIUM, scheduled deletion)
Import-graph walk from `frontend/src/index.tsx`: 326 modules, 193 reachable, **133 unreachable**:
- `src/pages/**` (11 page dirs + `VoiceAssistantPage`) — an older page implementation, fully
  superseded by `src/app/components/**`. Contains the only broken API call in the repo
  (`/api/v1/group-expenses` in `voiceTransactionService`) — unreachable at runtime.
- ~20 legacy services/libs/hooks (`voice*`, `KANKUIntelligenceEngine`,
  `bankStatementScannerService`, `device-sync-manager`, `enhanced-sync`, `useRBAC`, …).
  **Note:** several are still exercised by unit tests, so deletion must move/retire those
  tests in the same change.
- ~52 of the 133 are `app/components/ui/*` shadcn primitives — an intentional design-system
  kit; keep.
- Effect: none at runtime (Vite tree-shakes them out of the bundle — verified by build
  output). Cost: maintenance confusion and misleading audits.
- **Plan:** post-beta PR deleting `src/pages/**` + confirmed-dead services with their tests,
  guarded by `npm run build && npm run test`. List: `docs/release/dead-modules-inventory.txt`.

### Q-2 — Lint debt (LOW)
Backend eslint: 105 errors / 571 warnings (dominant: `no-unused-vars` on imports,
`no-explicit-any`). CI currently runs lint non-blocking (`|| true`). Plan: `lint:fix` sweep,
then make CI blocking with `--max-warnings` budget.

### Q-3 — Root-level doc/scripts sprawl (LOW)
- 4 overlapping root architecture docs (`KANAKU_PROJECT_OVERVIEW.md` 442 KB,
  `kanaku_architecture_workflow.md`, `implementation_plan.md`, `ENGINEERING_DECISIONS.md`)
  vs. `docs/` set — consolidation plan in BETA_READINESS_REPORT §Docs.
- Pre-Prisma SQL helpers in `backend/` root (`schema*.sql`, `create_*.sql`,
  `apply_schema.cjs`) — archive under `backend/scripts/legacy/`.
- `scratch/`, `test-results/`, `rbac-export/` in repo root — fold into `quality/`.

### Q-4 — Dead API wrappers (FIXED in this audit)
4 frontend wrappers pointing at nonexistent endpoints removed/redirected ([api.ts](../../frontend/src/lib/api.ts));
`scale_benchmark.cjs` `/group-expenses` → `/groups`.

### Q-5 — Duplicated components in live tree (LOW)
Two `FeatureGate` implementations (`app/components/shared` vs `app/components/ui` — the ui/
one is unreachable) and unused `Header.tsx` (TopBar is live) — fold into the Q-1 deletion PR.

## Dead-code inventory

Full machine-generated list of the 133 unreachable modules:
[dead-modules-inventory.txt](dead-modules-inventory.txt) (regenerate with the import-graph
walker documented inside).
