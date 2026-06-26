# Kanaku Docs — Structured Documentation Set

All documentation files have been consolidated into single, topic-specific files directly in the `docs` directory to make reading, search, and editing efficient.

> **📕 Build governance:** Before creating any new feature, read **`RULEBOOK.md`** (binding rules derived from the app Terms & Conditions + guardrails) and fill **`FEATURE_TEMPLATE.md`**. A feature is only "done" when the Rulebook §9 Definition of Done is satisfied.

> **Depth note (updated):** These docs are now mined directly from the live codebase — **36 backend feature modules**, every `/api/v1` endpoint, **48 Prisma models**, **Dexie schema v15** (40+ local tables), and **every React screen/component**. For the full canonical context, also read the repo-root `KANAKU_PROJECT_OVERVIEW.md` (living architecture reference) and `docs/FEATURE_INVENTORY.md`.

| Topic # | Consolidated File | Scope & Contents |
|:---:|---|---|
| 01 | [01_PRD.md](./01_PRD.md) | Product Requirement Document: overview, goals, features, user stories, acceptance criteria, detailed feature specifications. |
| 02 | [02_TRD.md](./02_TRD.md) | Technical Requirement Document: system architecture, tech stack reference, full API specifications catalog, validation schemas, third-party integrations, component diagrams. |
| 03 | [03_UI_UX_DESIGN.md](./03_UI_UX_DESIGN.md) | UI/UX Design & Screen Map: marketing surfaces, auth and onboarding, accounts and transactions, wealth screens, social, context hooks, wireframes, and UI flows. |
| 04 | [04_APP_FLOW.md](./04_APP_FLOW.md) | System Architecture & App Flows: Component diagrams, roles permission matrix, request lifecycles, and technical/non-technical visual flows (Login challenge, PIN gates, sync retry, Setu AA). |
| 05 | [05_DATABASE_SCHEMA.md](./05_DATABASE_SCHEMA.md) | Database Schema & Tables Definition: cloud Postgres tables (Prisma) and client IndexedDB schemas (Dexie v15), Index history, local rules, and ERD diagrams. |
| 06 | [06_IMPLEMENTATION_PLAN.md](./06_IMPLEMENTATION_PLAN.md) | Project Roadmap & Implementation Plan: sprint timelines, task breakdowns, dependency backlogs, and developer AI prompt guardrails. |

## Additional Resources
- **[Feature_List.csv](./Feature_List.csv)**: Complete feature spreadsheet list.
- **[openapi.yaml](./openapi.yaml)**: Swagger-ready API specifications.
- **[api-viewer.html](./api-viewer.html)**: Interactive viewer interface for API specifications.
- **[AUTOMATION_REGISTRY.md](./AUTOMATION_REGISTRY.md)**: Playwright test-ids reference.
- **[DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)**: Database Baseline workflow documentation.
- **[legal/](./legal/)**: User agreement and regulatory terms.
- **[skills/](./skills/)**: Guidelines for engineering development agents.

