const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('No DIRECT_URL or DATABASE_URL provided in environment.');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('Connected to Postgres DB. Applying Vault tables DDL...');

  const ddl = `
    CREATE TABLE IF NOT EXISTS "public"."vault_folders" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "user_id" TEXT NOT NULL,
      "parent_id" TEXT,
      "name" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'Personal Documents',
      "is_default" BOOLEAN NOT NULL DEFAULT false,
      "color" TEXT,
      "icon" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deleted_at" TIMESTAMP(3),
      CONSTRAINT "vault_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "vault_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."vault_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "vault_folders_user_id_idx" ON "public"."vault_folders"("user_id");
    CREATE INDEX IF NOT EXISTS "vault_folders_parent_id_idx" ON "public"."vault_folders"("parent_id");
    CREATE INDEX IF NOT EXISTS "vault_folders_category_idx" ON "public"."vault_folders"("category");

    CREATE TABLE IF NOT EXISTS "public"."vault_documents" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deleted_at" TIMESTAMP(3),
      CONSTRAINT "vault_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "vault_documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."vault_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "vault_documents_user_id_idx" ON "public"."vault_documents"("user_id");
    CREATE INDEX IF NOT EXISTS "vault_documents_folder_id_idx" ON "public"."vault_documents"("folder_id");
    CREATE INDEX IF NOT EXISTS "vault_documents_category_idx" ON "public"."vault_documents"("category");
    CREATE INDEX IF NOT EXISTS "vault_documents_expiry_date_idx" ON "public"."vault_documents"("expiry_date");

    CREATE TABLE IF NOT EXISTS "public"."vault_document_versions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "document_id" TEXT NOT NULL,
      "version_number" INTEGER NOT NULL,
      "file_name" TEXT NOT NULL,
      "storage_path" TEXT NOT NULL,
      "file_size" INTEGER NOT NULL,
      "file_type" TEXT NOT NULL,
      "uploaded_by" TEXT NOT NULL,
      "note" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "vault_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."vault_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "vault_document_versions_document_id_version_number_key" UNIQUE ("document_id", "version_number")
    );

    CREATE INDEX IF NOT EXISTS "vault_document_versions_document_id_idx" ON "public"."vault_document_versions"("document_id");

    CREATE TABLE IF NOT EXISTS "public"."vault_shares" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
      CONSTRAINT "vault_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "vault_shares_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "vault_shares_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."vault_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "vault_shares_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."vault_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "vault_shares_owner_id_idx" ON "public"."vault_shares"("owner_id");
    CREATE INDEX IF NOT EXISTS "vault_shares_shared_with_user_id_idx" ON "public"."vault_shares"("shared_with_user_id");
    CREATE INDEX IF NOT EXISTS "vault_shares_document_id_idx" ON "public"."vault_shares"("document_id");
    CREATE INDEX IF NOT EXISTS "vault_shares_folder_id_idx" ON "public"."vault_shares"("folder_id");
    CREATE INDEX IF NOT EXISTS "vault_shares_status_idx" ON "public"."vault_shares"("status");

    CREATE TABLE IF NOT EXISTS "public"."vault_audit_logs" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "owner_id" TEXT NOT NULL,
      "actor_id" TEXT NOT NULL,
      "document_id" TEXT,
      "folder_id" TEXT,
      "action" TEXT NOT NULL,
      "details" TEXT,
      "ip_address" TEXT,
      "user_agent" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "vault_audit_logs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "vault_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "vault_audit_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."vault_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "vault_audit_logs_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."vault_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "vault_audit_logs_owner_id_idx" ON "public"."vault_audit_logs"("owner_id");
    CREATE INDEX IF NOT EXISTS "vault_audit_logs_actor_id_idx" ON "public"."vault_audit_logs"("actor_id");
    CREATE INDEX IF NOT EXISTS "vault_audit_logs_document_id_idx" ON "public"."vault_audit_logs"("document_id");
    CREATE INDEX IF NOT EXISTS "vault_audit_logs_folder_id_idx" ON "public"."vault_audit_logs"("folder_id");
    CREATE INDEX IF NOT EXISTS "vault_audit_logs_action_idx" ON "public"."vault_audit_logs"("action");
    CREATE INDEX IF NOT EXISTS "vault_audit_logs_created_at_idx" ON "public"."vault_audit_logs"("created_at");

    CREATE TABLE IF NOT EXISTS "public"."vault_lock_settings" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "user_id" TEXT NOT NULL UNIQUE,
      "is_lock_enabled" BOOLEAN NOT NULL DEFAULT false,
      "vault_pin_hash" TEXT,
      "auto_lock_minutes" INTEGER NOT NULL DEFAULT 5,
      "last_unlocked_at" TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "vault_lock_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `;

  await client.query(ddl);
  console.log('Successfully created all Kanakku Vault tables and indexes!');
  await client.end();
}

main().catch((err) => {
  console.error('Failed to apply Vault DDL:', err);
  process.exit(1);
});
