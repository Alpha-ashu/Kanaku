# 🧩 Feature Template — Kanaku

> Copy this file for every new feature: `docs/features/<feature-name>.md`.
> It operationalizes `docs/RULEBOOK.md`. A feature is not "done" until **§9 Definition of Done** in the Rulebook is fully satisfied. Cite the Rule IDs (e.g., `G2`, `AD1`) you are honoring.

---

## 0. Summary
- **Feature name:**
- **Feature ID:** (next free `F-<MODULE>-NN` in `01_.../Feature_List.csv`)
- **Module:** (one of the 36 backend feature modules, or "Platform")
- **Target role(s):** End User / Client / Advisor / Admin
- **One-line description:**
- **Terms entitlement:** (which `TERMS_*.md` clause permits this role to have it)

## 1. Why (PRD)
- Problem / user need:
- Business value:
- Out of scope:

## 2. User flow
- Happy path (steps):
- Edge cases (offline, low-balance, currency mismatch, conflict, permission denied, rate limit):
- Error handling (user-safe messages, codes):

## 3. UI/UX
- Screen(s) / component(s):
- States: loading / empty / error / offline / success
- `data-testid`s added (per `AUTOMATION_REGISTRY.md`):
- Feature gate key(s):

## 4. API (TRD)
- Endpoint(s) under `/api/v1/<module>`:
- Method · path · auth · role/feature gate · idempotency:
- Zod schemas (`<module>.validation.ts`): body / query / params
- Request/response examples (add to `Request_Response_Schemas.md` + `openapi.yaml`):

## 5. Data
- **Postgres (Prisma):** new/changed models, fields, types (money = `Decimal(18,2)`), indexes, FKs (ownership via `userId`).
- **Dexie (local):** new table? → bump `database.ts` to **v16+**, add `syncStatus` + `cloudId`, update sync engine + `syncSchemaGuard`.
- Migration plan:

## 6. Security & privacy (cite Rule IDs)
- [ ] Ownership filter on every read/write (`G3`)
- [ ] Zod validation, generic error (`G4`)
- [ ] `/api/v1` + JWT + Helmet/CORS/rate-limit (`G5`)
- [ ] RBAC / feature gate, deny-by-default (`G8`)
- [ ] No secrets in code, no raw SQL (`G6`)
- [ ] Export + delete coverage for any new data (`DP3`)
- [ ] Log redaction for any new PII (`DP5`)
- Role-specific: advisor read-only (`AD1`) / client share scope (`CL1`) / admin least-privilege + audit (`ADM1`,`ADM2`) — as applicable.

## 7. Money & integrity (if monetary)
- [ ] `Decimal(18,2)`, no float (`G1`)
- [ ] Balance + record write in one `prisma.$transaction` (`G2`)
- [ ] Idempotency-Key on mutations (`TR3`)

## 8. Offline-first
- [ ] Dexie write-first, `syncStatus='pending'`, optimistic UI (`G7`)
- [ ] Background retry + user-scoped delta; monetary conflict defers to server

## 9. AI / Payments (if applicable)
- AI: not-advice label (`AI1`), human confirm (`AI2`), voice discarded (`AI3`), gated+quota (`AI4`), circuit breaker (`AI5`)
- Payments: price-before-charge (`PAY1`), platform-only (`PAY2`), refund policy (`PAY3`), signed webhook (`PAY4`)

## 10. Tests
- [ ] Backend: Jest/Supertest — happy path, ownership/RBAC denial, validation
- [ ] Offline no-duplicate via Idempotency-Key
- [ ] Frontend: Vitest + Playwright (offline add → sync, no dup)

## 11. Docs to update
- [ ] `01_.../Feature_List.csv` (+ `Detailed_Feature_Specifications.md`)
- [ ] `02_.../API_Specifications.md`, `Request_Response_Schemas.md`, `openapi.yaml`
- [ ] `03_.../Screen_Component_Map.md`
- [ ] `04_.../App_Flow.md` / `Module_Sequence_Diagrams.md`
- [ ] `05_.../Database_Schema.md`, `Tables_Definition.md`, `ER_Diagram.md`

## 12. Definition of Done sign-off
- [ ] All applicable boxes in `RULEBOOK.md` §9 checked.
- [ ] Pre-flight: Dexie↔cloud consistent · validation present · `/api/v1` versioned.
- Reviewer: __________  Date: __________

