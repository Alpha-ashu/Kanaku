# Archive – Unused / Deprecated Files

> **Golden rule: we never delete code from this repo. We archive it here with a written reason.**

Why: Kanaku is a financial app under audit. Deleted code is invisible to reviewers and impossible to bisect when a regression appears six months later. Archiving preserves history without polluting the active codebase.

## Structure

```
archive-unused/
├── frontend/   ← unused UI components, pages, hooks, services
├── backend/    ← unused routes, services, scripts
├── database/   ← superseded SQL files, dead migrations
├── api/        ← deprecated API handlers (e.g. /api/v0)
├── tests/      ← obsolete tests
└── notes/      ← cross-cutting investigations and rationale
```

## How to archive a file

1. **Verify it is truly unused.** Use:
   - `npx ts-prune` / `npx depcheck`
   - `git grep '<symbol>'` across the whole repo
   - Confirm no dynamic import / string reference / route mount.
2. **Move (do not copy) preserving its original path under the matching area:**
   ```powershell
   git mv frontend/src/components/Foo.tsx archive-unused/frontend/components/Foo.tsx
   ```
3. **Add a `reason.md` next to it** with this template:
   ```markdown
   # Reason: Foo.tsx archived
   - Date: 2026-06-19
   - Author: @yourhandle
   - Replaced by: frontend/src/features/dashboard/components/Bar.tsx
   - Verification:
     - `git grep "Foo"` → no references
     - `npx ts-prune` flagged as unused
   - Safe to delete after: 2026-12-19 (6-month cooling-off)
   ```
4. **Open a PR titled `archive: <path>`** and link the verification output.

## Removal policy

After **6 months** in archive without being restored or referenced, a quarterly cleanup PR may permanently delete the folder — but this requires explicit approval from the security reviewer.

## Currently archived

| Path | Reason | Date |
|---|---|---|
| `platform/config/credentials.ts`, `platform/database/migrations.js`, `platform/database/models.js` | Empty/example scaffolding stubs, never imported anywhere. See [`platform/reason.md`](./platform/reason.md). | 2026-06-19 |
| `.env.example` (repo root) → `config/root.env.example` | Redundant "mega-template"; no process reads a root `.env`. Canonical env files are `backend/.env` + `frontend/.env`. See [`config/reason.md`](./config/reason.md). | 2026-06-19 |

