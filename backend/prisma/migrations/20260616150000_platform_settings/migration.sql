-- Singleton platform-wide settings table, replacing the fragile pattern of
-- storing global admin config inside whichever User.role='admin' an unordered
-- query happened to return first.

CREATE TABLE IF NOT EXISTS "PlatformSettings" (
    "id"        TEXT NOT NULL DEFAULT 'global',
    "settings"  JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
