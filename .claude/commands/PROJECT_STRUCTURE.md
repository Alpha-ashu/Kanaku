# Project Structure

This is the current high-level layout of the repo after the organization pass.

```text
Expense Tracker/
 frontend/                 React app, local-first UX, OCR/import/voice flows
 backend/                  Express API, Prisma, auth, sync, sockets
 database/                 Raw SQL and direct DB helpers
 api/                      Serverless endpoints
 supabase/                 Supabase migrations, setup, edge functions
 tests/                    Fixtures, runners, manual checks, scenario notes
 samples/                  Demo/sample file staging area
 scripts/                  Repo-wide automation
 resources/                Shared assets and archived experiments
 docs/                     Current and historical documentation
 android/                  Capacitor Android project
```

## Runtime boundaries

### `frontend/`

- React UI
- Dexie/IndexedDB storage
- local import and scanning flows
- frontend unit tests

### `backend/`

- REST API
- socket auth and realtime logic
- Prisma runtime model
- server-side security checks
- backend integration tests

### `database/`

- raw SQL references
- older bootstrap helpers

### `api/`

- thin serverless handlers

### `supabase/`

- RLS/storage SQL migrations
- Supabase-specific setup material

## Non-runtime support areas

### `tests/`

- `fixtures/`: reusable JSON payloads and import samples
- `manual/`: browser/manual helpers
- `runners/`: ad-hoc or historical runner scripts
- `scenarios/`: human-readable scenarios

### `samples/`

Staging area for demo receipts, statements, imports, and presentation files that are useful for manual verification but should not live inside runtime folders.

### `resources/archive/frontend-experiments/`

Archived frontend backup files that are not part of the build.

## Current caution

The backend still contains a number of older helper scripts and logs at folder root. Those are historical utilities; the supported path is through `backend/src/`, `backend/prisma/`, `backend/tests/`, and `backend/scripts/`.
