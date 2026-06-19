# Kanaku Docs — Structured Documentation Set

Numbered folders preserve reading order. All docs are Markdown for easy editing + version control. Diagrams use Mermaid (renders in GitHub/VS Code) or are exported from draw.io / Figma.

> **Depth note (updated):** These docs are now mined directly from the live codebase — **36 backend feature modules**, every `/api/v1` endpoint, **48 Prisma models**, **Dexie schema v15** (40+ local tables), and **every React screen/component**. For the full canonical context, also read the repo-root `KANAKU_PROJECT_OVERVIEW.md` (living architecture reference) and `docs/FEATURE_INVENTORY.md`.

| # | Folder | Key deep docs |
|---|--------|----------|
| 01 | `01_Product_Requirement_Document_PRD/` | PRD_Main, User_Stories, Acceptance_Criteria, **Detailed_Feature_Specifications.md**, **Feature_List.csv** (every feature + sub-feature) |
| 02 | `02_Technical_Requirement_Document_TRD/` | TRD_Main, Architecture_Diagram, **API_Specifications.md** (all endpoints), **Request_Response_Schemas.md** (exact Zod shapes), **openapi.yaml** (OpenAPI 3.1, Swagger-ready) + **api-viewer.html** (Redoc/Swagger viewer), **Tech_Stack.md** (authoritative) |
| 03 | `03_UI_UX_Design/` | **Screen_Component_Map.md** (every screen→component→service→API), Wireframes, Sequence_Diagrams |
| 04 | `04_App_Flow/` | **App_Flow.md** (end-to-end), **Module_Sequence_Diagrams.md** (per-module Mermaid), User_Journey, Sequence_Diagrams, Flowcharts |
| 05 | `05_Backend_Data_Schema/` | **Database_Schema.md** (48 models), **Tables_Definition.md** (Dexie v15), ER_Diagram, API_Data_Contracts |
| 06 | `06_Implementation_Plan/` | Roadmap, Sprint_Plan, Task_Breakdown, Prompts_For_AI |

## Traceability
- Feature IDs in `Feature_List.csv` (e.g. `F-TXN-02`) are referenced from `Detailed_Feature_Specifications.md` and `API_Specifications.md`.
- The endpoint catalog is generated from `backend/src/features/*/*.routes.ts`.
- Local/cloud schema parity: `Tables_Definition.md` (Dexie v15) ↔ `Database_Schema.md` (Prisma).

## Notes on binary files
- `Feature_List.xlsx` → maintained as `Feature_List.csv` (version-control friendly).
- `*.png` wireframes → add exported images into `03_UI_UX_Design/Wireframes/` (see its README).

## Project guardrails
See `06_Implementation_Plan/Prompts_For_AI.md` for the reusable guardrails prompt (offline-first, `/api/v1`, zod, server-authoritative money, ownership checks, no `any`).
