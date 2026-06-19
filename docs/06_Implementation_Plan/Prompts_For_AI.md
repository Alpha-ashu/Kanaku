# Prompts For AI — Kanaku (codebase-accurate)

> These prompts are aligned to the **real** Kanaku codebase (36 backend feature modules, 48 Prisma models, Dexie schema v15). Paste the Guardrails block with any coding task. Canonical context: repo-root `KANAKU_PROJECT_OVERVIEW.md` + `.github/copilot-instructions.md` + the docs in this set.

## Master Prompt (docs generation)
```
Act as a Senior Product Manager + Technical Architect + UI/UX Designer for Kanaku,
a financial-grade, offline-first personal finance app (React 18 + TS on Vite +
Capacitor; Node/Express + Prisma/PostgreSQL; Supabase identity + custom JWT;
Dexie local-first with async dexie-cloud sync; Redis; Socket.IO; Setu Account
Aggregator; Gemini + Tesseract for OCR/voice).

Produce or update, grounded in the actual code (cite file paths):
1. PRD — features + sub-features (see docs/01.../Feature_List.csv, Detailed_Feature_Specifications.md)
2. TRD — middleware chain, RBAC, feature gates (Module → Sub-feature → AI capability)
3. UI/UX — screen → component → service → API map (docs/03.../Screen_Component_Map.md)
4. App flow — sequence diagrams per module (docs/04.../*Sequence_Diagrams.md)
5. DB schema — 48 Prisma models + Dexie v15 local tables (docs/05.../*)
6. API — endpoints + exact Zod request/response (docs/02.../API_Specifications.md,
   Request_Response_Schemas.md, openapi.yaml)
7. Implementation plan — sprints/tasks (docs/06.../*)

Make it developer-ready, QA-testable, stakeholder-understandable. Always include
edge cases, validation rules (Zod), error handling (generic, no schema leak), and
real workflows. Never contradict KANAKU_PROJECT_OVERVIEW.md (it wins).
```

## Project Guardrails (paste with any coding prompt)
```
Stack: React 18 + TS 5 (Vite + Capacitor), TailwindCSS + shadcn/ui + Framer Motion,
Dexie 4 (+ dexie-cloud), Socket.IO client. Backend: Node 22 + Express 4 + TS 6,
Prisma 6.19.2 + PostgreSQL 16, Redis 7, Supabase identity + custom HS256 JWT,
Zod 3, Winston, Helmet + CORS allow-list + express-rate-limit.

Architecture pattern (backend): Route → Controller → Service → Prisma.
  - *.routes.ts: HTTP verbs + authenticate + validate(zod) + requireFeature/requireRole
  - *.controller.ts: parse req, delegate, return { success, data, requestId }
  - *.service.ts: business rules + prisma.$transaction + cache invalidation (no req/res)

Hard rules:
- All routes under /api/v1/<module>; protected routes require JWT; ownership re-checked
  server-side (where: { id, userId: req.userId }) before any read/write.
- Validate body/query/params with Zod via validateBody/validateQuery/validateParams.
  Validation failures return a GENERIC message (code VALIDATION_ERROR); never echo Zod
  issue paths to the client (log them server-side only).
- Monetary values are Decimal(18,2), server-authoritative; never float. Any balance
  update coupled with a record write goes in a single prisma.$transaction.
- Idempotency: mutating endpoints accept Idempotency-Key (Redis, 24h TTL); the client
  sends its local record id / clientRequestId.
- Preserve Helmet + CORS + rate limiting + the global body sanitiser. Never hardcode
  secrets (use env: backend/.env). Never use $queryRawUnsafe/$executeRawUnsafe.
- No `any` in new code; use explicit interfaces, Zod schemas, typed DTOs.
- Feature gates are deny-by-default RBAC at Module → Sub-feature → AI capability.

Offline-first (frontend):
- Write to Dexie first with syncStatus='pending'; optimistic UI; reconcile via the
  sync engine (sync-service / backend-sync-service / offline-sync-engine).
- Use cloudId (camelCase) for server ids; keep schema parity with database.ts (v15).
- Conflict: last-write-wins per field, EXCEPT monetary fields defer to server.
- Use lib/logger (silent debug/info in prod) and lib/errorHandling; never dump raw
  API errors to the console or toasts.

Pre-flight before finalizing (mirror copilot-instructions):
1. Dexie → cloud sync stays consistent (pending/synced/cloudId handling).
2. Zod validation middleware exists on every changed/new route.
3. Endpoints correctly versioned under /api/v1 (+ Helmet/CORS/rate-limit intact).
4. Ownership + prisma.$transaction on monetary writes; no `any`; standard response shape.
```

## Targeted Prompts (real modules)
- "Add `POST /api/v1/<module>` following Route→Controller→Service. Create the Zod schema in
  `<module>.validation.ts`, wire `validateBody`, enforce ownership in the service, and wrap
  any balance change in `prisma.$transaction`. Return `{ success, data, requestId }`."
- "Implement `POST /api/v1/loans/:id/payments`: validate `{ amount>0, accountId?, notes? }`,
  in one `prisma.$transaction` insert LoanPayment + a transaction + decrement `loans.outstanding`
  + adjust `accounts.balance`, then enqueue an 'EMI paid' notification."
- "Add a transfer transaction: `transactionCreateSchema` already requires `transferToAccountId`
  when `type='transfer'` (superRefine) — implement the service to debit/credit both accounts atomically."
- "Wire a new Dexie table at schema **v16** with `syncStatus` + `cloudId`, mirror it in the sync
  engine, and keep `syncSchemaGuard` parity (don't break v15)."
- "Write a Playwright e2e: offline add-expense → go online → assert single server row via the
  Idempotency-Key/clientId (no duplicate), and Dexie row flips pending→synced with cloudId."
- "Add a Setu AA consent flow test: `POST /aa/consent` (validate fiTypes/dataRange), handle the
  `/aa/notification` webhook (CONSENT_STATUS_UPDATE), then `/aa/data/session` → `/aa/data/fetch`."
- "Gate a new AI read behind `requireAIFeature('aiAutomation', '<subfeature>')` and surface it in
  AdminAIDashboard feature toggles."

## Review Checklist Prompt (use before PR)
```
Review this diff against Kanaku guardrails and report violations:
- /api/v1 versioning; Helmet/CORS/rate-limit untouched.
- Zod validation on every new/changed route; generic validation error (no schema leak).
- Ownership filter on all reads/writes; prisma.$transaction on coupled monetary writes.
- Decimal(18,2) money; no float; no `any`; typed DTOs.
- Dexie write-first + syncStatus + cloudId parity (schema v15/next); conflict rules respected.
- Secrets only via env; no $queryRawUnsafe; logger used (no raw error leakage).
```

## Best Practices
- Prefix doc folders with `01_`, `02_` to preserve order; keep docs in Markdown.
- Diagrams via Mermaid (code) or export from draw.io / Figma.
- Keep `openapi.yaml` and `Request_Response_Schemas.md` in sync with `*.validation.ts`.
- When facts conflict, `KANAKU_PROJECT_OVERVIEW.md` is authoritative.

