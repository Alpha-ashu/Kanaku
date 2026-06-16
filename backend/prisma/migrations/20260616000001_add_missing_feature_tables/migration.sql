-- Add gold_assets, recurring_transactions, budgets, and tax_calculations tables
-- These were defined in schema.prisma but never had a migration file.

CREATE TABLE IF NOT EXISTS "gold_assets" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "type"              TEXT NOT NULL DEFAULT 'gold',
    "quantity"          DECIMAL(12,4) NOT NULL,
    "unit"              TEXT NOT NULL DEFAULT 'gram',
    "purchasePrice"     DECIMAL(12,2) NOT NULL,
    "currentPrice"      DECIMAL(12,2) NOT NULL,
    "purchaseDate"      TIMESTAMP(3) NOT NULL,
    "purityPercentage"  DECIMAL(5,2) NOT NULL DEFAULT 99.9,
    "location"          TEXT,
    "certificateNumber" TEXT,
    "notes"             TEXT,
    "clientRequestId"   TEXT,
    "syncStatus"        TEXT NOT NULL DEFAULT 'synced',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"         TIMESTAMP(3),
    CONSTRAINT "gold_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gold_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gold_assets_clientRequestId_key" UNIQUE ("clientRequestId")
);

CREATE INDEX IF NOT EXISTS "gold_assets_userId_idx" ON "gold_assets"("userId");
CREATE INDEX IF NOT EXISTS "gold_assets_type_idx" ON "gold_assets"("type");
CREATE INDEX IF NOT EXISTS "gold_assets_syncStatus_idx" ON "gold_assets"("syncStatus");
CREATE INDEX IF NOT EXISTS "gold_assets_deletedAt_idx" ON "gold_assets"("deletedAt");

CREATE TABLE IF NOT EXISTS "recurring_transactions" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "amount"            DECIMAL(12,2) NOT NULL,
    "category"          TEXT NOT NULL,
    "subcategory"       TEXT,
    "interval"          TEXT NOT NULL DEFAULT 'monthly',
    "nextDueDate"       TIMESTAMP(3) NOT NULL,
    "autoProcess"       BOOLEAN NOT NULL DEFAULT false,
    "status"            TEXT NOT NULL DEFAULT 'active',
    "accountId"         TEXT,
    "description"       TEXT,
    "merchant"          TEXT,
    "lastProcessedAt"   TIMESTAMP(3),
    "clientRequestId"   TEXT,
    "syncStatus"        TEXT NOT NULL DEFAULT 'synced',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"         TIMESTAMP(3),
    CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurring_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recurring_transactions_clientRequestId_key" UNIQUE ("clientRequestId")
);

CREATE INDEX IF NOT EXISTS "recurring_transactions_userId_idx" ON "recurring_transactions"("userId");
CREATE INDEX IF NOT EXISTS "recurring_transactions_status_idx" ON "recurring_transactions"("status");
CREATE INDEX IF NOT EXISTS "recurring_transactions_nextDueDate_idx" ON "recurring_transactions"("nextDueDate");
CREATE INDEX IF NOT EXISTS "recurring_transactions_syncStatus_idx" ON "recurring_transactions"("syncStatus");
CREATE INDEX IF NOT EXISTS "recurring_transactions_deletedAt_idx" ON "recurring_transactions"("deletedAt");

CREATE TABLE IF NOT EXISTS "budgets" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "category"          TEXT NOT NULL,
    "amount"            DECIMAL(12,2) NOT NULL,
    "spent"             DECIMAL(12,2) NOT NULL DEFAULT 0,
    "period"            TEXT NOT NULL DEFAULT 'monthly',
    "threshold"         INTEGER NOT NULL DEFAULT 80,
    "startDate"         TIMESTAMP(3),
    "endDate"           TIMESTAMP(3),
    "alertEnabled"      BOOLEAN NOT NULL DEFAULT true,
    "alertChannels"     JSONB NOT NULL DEFAULT '["app"]',
    "clientRequestId"   TEXT,
    "syncStatus"        TEXT NOT NULL DEFAULT 'synced',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"         TIMESTAMP(3),
    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "budgets_userId_category_period_key" UNIQUE ("userId", "category", "period"),
    CONSTRAINT "budgets_clientRequestId_key" UNIQUE ("clientRequestId")
);

CREATE INDEX IF NOT EXISTS "budgets_userId_idx" ON "budgets"("userId");
CREATE INDEX IF NOT EXISTS "budgets_category_idx" ON "budgets"("category");
CREATE INDEX IF NOT EXISTS "budgets_period_idx" ON "budgets"("period");
CREATE INDEX IF NOT EXISTS "budgets_syncStatus_idx" ON "budgets"("syncStatus");
CREATE INDEX IF NOT EXISTS "budgets_deletedAt_idx" ON "budgets"("deletedAt");

CREATE TABLE IF NOT EXISTS "tax_calculations" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "year"              INTEGER NOT NULL,
    "regime"            TEXT,
    "country"           TEXT NOT NULL DEFAULT 'India',
    "totalIncome"       DECIMAL(12,2) NOT NULL,
    "totalExpense"      DECIMAL(12,2) NOT NULL,
    "netProfit"         DECIMAL(12,2) NOT NULL,
    "taxableIncome"     DECIMAL(12,2) NOT NULL,
    "estimatedTax"      DECIMAL(12,2) NOT NULL,
    "taxRate"           DECIMAL(5,2) NOT NULL,
    "deductions"        DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency"          TEXT NOT NULL DEFAULT 'INR',
    "notes"             TEXT,
    "metadata"          JSONB,
    "clientRequestId"   TEXT,
    "syncStatus"        TEXT NOT NULL DEFAULT 'synced',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"         TIMESTAMP(3),
    CONSTRAINT "tax_calculations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_calculations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_calculations_clientRequestId_key" UNIQUE ("clientRequestId")
);

CREATE INDEX IF NOT EXISTS "tax_calculations_userId_idx" ON "tax_calculations"("userId");
CREATE INDEX IF NOT EXISTS "tax_calculations_year_idx" ON "tax_calculations"("year");
CREATE INDEX IF NOT EXISTS "tax_calculations_deletedAt_idx" ON "tax_calculations"("deletedAt");
