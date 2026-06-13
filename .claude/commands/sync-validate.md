# Sync Validation

Validate the offline-first sync pipeline between the frontend (Dexie/IndexedDB) and the backend (PostgreSQL via Supabase).

## What to check

**Frontend sync layer:**
1. Read `frontend/src/lib/enhanced-sync.ts` — verify sync queue logic and conflict resolution strategy.
2. Read `frontend/src/services/` — find the sync service and check retry/backoff logic.
3. Verify that all models that should sync have a `syncedAt` or `updatedAt` timestamp field.

**Backend sync endpoints:**
4. Check `backend/src/routes/sync.ts` and `backend/src/modules/sync/sync.routes.ts` — verify all sync endpoints exist.
5. Confirm the sync API accepts delta (incremental) updates, not just full replace.
6. Check Socket.IO handlers in `backend/src/sockets/` for real-time push events.

**Conflict resolution:**
7. Identify the conflict resolution strategy (last-write-wins, server-wins, etc.).
8. Confirm there is handling for network interruption and re-connection.

**Prisma schema:**
9. Verify all syncable models have `updatedAt DateTime @updatedAt` in `backend/prisma/schema.prisma`.

## Report

- List models that are synced vs not synced
- Identify any sync endpoints that return errors
- Flag missing `updatedAt` fields
- Recommend improvements if conflict resolution is missing
