-- Migration: vault_tables_rls
--
-- Why this exists:
--   The Vault tables were created by backend/scripts/apply-vault-schema.cjs, not
--   by a migration, so no environment built from migrations had them and
--   `prisma migrate deploy` never created them. That script also omitted
--   vault_lock_settings.pin_length (added to schema.prisma afterwards), and —
--   because the tables were created outside the RLS migrations — none of them
--   had Row Level Security.
--
--   These tables live in `public`, which Supabase exposes through PostgREST to
--   anyone holding the anon key shipped in the frontend bundle. Without RLS that
--   means vault document metadata (titles, document numbers, institutions),
--   share grants, audit logs with IPs, and vault PIN bcrypt hashes were readable
--   through the REST API. The backend is the only legitimate reader: it connects
--   as the table owner, which bypasses RLS, so enabling RLS with a deny-all
--   policy for anon/authenticated closes PostgREST without touching the API.
--
--   Idempotent throughout; on a database that already has the tables it only
--   adds the missing column and the RLS protection.

-- Tables
CREATE TABLE IF NOT EXISTS "vault_folders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Personal Documents',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "icon" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vault_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vault_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "folder_id" TEXT,
    "title" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "is_encrypted" BOOLEAN NOT NULL DEFAULT true,
    "encryption_iv" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT NOT NULL DEFAULT 'Personal Documents',
    "institution" TEXT,
    "document_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "renewal_date" TIMESTAMP(3),
    "reminder_date" TIMESTAMP(3),
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vault_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vault_document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_document_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vault_shares" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "shared_with_user_id" TEXT NOT NULL,
    "document_id" TEXT,
    "folder_id" TEXT,
    "permission" TEXT NOT NULL DEFAULT 'viewer',
    "status" TEXT NOT NULL DEFAULT 'active',
    "can_download" BOOLEAN NOT NULL DEFAULT true,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "vault_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vault_audit_logs" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "document_id" TEXT,
    "folder_id" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vault_lock_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_lock_enabled" BOOLEAN NOT NULL DEFAULT false,
    "vault_pin_hash" TEXT,
    "pin_length" INTEGER DEFAULT 6,
    "auto_lock_minutes" INTEGER NOT NULL DEFAULT 5,
    "last_unlocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_lock_settings_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "vault_folders_user_id_idx" ON "vault_folders"("user_id");
CREATE INDEX IF NOT EXISTS "vault_folders_parent_id_idx" ON "vault_folders"("parent_id");
CREATE INDEX IF NOT EXISTS "vault_folders_category_idx" ON "vault_folders"("category");
CREATE INDEX IF NOT EXISTS "vault_documents_user_id_idx" ON "vault_documents"("user_id");
CREATE INDEX IF NOT EXISTS "vault_documents_folder_id_idx" ON "vault_documents"("folder_id");
CREATE INDEX IF NOT EXISTS "vault_documents_category_idx" ON "vault_documents"("category");
CREATE INDEX IF NOT EXISTS "vault_documents_expiry_date_idx" ON "vault_documents"("expiry_date");
CREATE INDEX IF NOT EXISTS "vault_document_versions_document_id_idx" ON "vault_document_versions"("document_id");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "vault_document_versions_document_id_version_number_key" ON "vault_document_versions"("document_id", "version_number");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "vault_shares_owner_id_idx" ON "vault_shares"("owner_id");
CREATE INDEX IF NOT EXISTS "vault_shares_shared_with_user_id_idx" ON "vault_shares"("shared_with_user_id");
CREATE INDEX IF NOT EXISTS "vault_shares_document_id_idx" ON "vault_shares"("document_id");
CREATE INDEX IF NOT EXISTS "vault_shares_folder_id_idx" ON "vault_shares"("folder_id");
CREATE INDEX IF NOT EXISTS "vault_shares_status_idx" ON "vault_shares"("status");
CREATE INDEX IF NOT EXISTS "vault_audit_logs_owner_id_idx" ON "vault_audit_logs"("owner_id");
CREATE INDEX IF NOT EXISTS "vault_audit_logs_actor_id_idx" ON "vault_audit_logs"("actor_id");
CREATE INDEX IF NOT EXISTS "vault_audit_logs_document_id_idx" ON "vault_audit_logs"("document_id");
CREATE INDEX IF NOT EXISTS "vault_audit_logs_folder_id_idx" ON "vault_audit_logs"("folder_id");
CREATE INDEX IF NOT EXISTS "vault_audit_logs_action_idx" ON "vault_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "vault_audit_logs_created_at_idx" ON "vault_audit_logs"("created_at");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "vault_lock_settings_user_id_key" ON "vault_lock_settings"("user_id");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "vault_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "vault_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_document_versions" ADD CONSTRAINT "vault_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "vault_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_shares" ADD CONSTRAINT "vault_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_shares" ADD CONSTRAINT "vault_shares_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_shares" ADD CONSTRAINT "vault_shares_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "vault_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_shares" ADD CONSTRAINT "vault_shares_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "vault_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_audit_logs" ADD CONSTRAINT "vault_audit_logs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_audit_logs" ADD CONSTRAINT "vault_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_audit_logs" ADD CONSTRAINT "vault_audit_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "vault_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_audit_logs" ADD CONSTRAINT "vault_audit_logs_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "vault_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vault_lock_settings" ADD CONSTRAINT "vault_lock_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Column added to schema.prisma after apply-vault-schema.cjs ran.
ALTER TABLE "vault_lock_settings" ADD COLUMN IF NOT EXISTS "pin_length" INTEGER DEFAULT 6;

-- Row Level Security: deny all PostgREST access (anon/authenticated). Not FORCEd,
-- so the owning backend role keeps full access.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['vault_folders', 'vault_documents', 'vault_document_versions', 'vault_shares', 'vault_audit_logs', 'vault_lock_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_client_access', t);
    BEGIN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t || '_no_client_access', t);
    EXCEPTION WHEN undefined_object THEN
      NULL; -- plain Postgres (CI) has no anon/authenticated roles; RLS alone already denies them
    END;
  END LOOP;
END $$;
