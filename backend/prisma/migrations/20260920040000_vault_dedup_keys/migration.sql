-- Migration: 20260920040000_vault_dedup_keys
--
-- Vault was the only user-record feature with NO duplicate protection at any
-- layer: no duplicateSubmitGuard on its create routes, no Idempotency-Key
-- replay, no clientRequestId column, and no unique constraint on VaultFolder,
-- VaultDocument or VaultShare. A double-tapped "New folder" made two identical
-- folders; a retried upload made two documents and two storage objects.
--
-- The route guards added alongside this migration stop the double-tap, but they
-- are in-memory (single instance, Redis disabled), so they do not survive a
-- restart and do not span instances. These columns are the durable backstop:
-- the per-user unique index makes a replayed create fail closed at the database
-- rather than silently succeed twice.
--
-- Plain unique indexes, matching Account / Goal / Loan / Investment / Budget /
-- GoldAsset. Postgres treats NULLs as distinct in a unique index, so every
-- pre-existing row (client_request_id NULL) stays valid and only rows that
-- actually carry a key are constrained. No backfill is needed or wanted:
-- inventing keys for historical rows would assert a de-duplication that was
-- never performed.

ALTER TABLE "vault_folders"   ADD COLUMN IF NOT EXISTS "client_request_id" TEXT;
ALTER TABLE "vault_documents" ADD COLUMN IF NOT EXISTS "client_request_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "vault_folders_user_id_client_request_id_key"
  ON "vault_folders" ("user_id", "client_request_id");

CREATE UNIQUE INDEX IF NOT EXISTS "vault_documents_user_id_client_request_id_key"
  ON "vault_documents" ("user_id", "client_request_id");
