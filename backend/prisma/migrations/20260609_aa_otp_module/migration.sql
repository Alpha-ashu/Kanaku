-- Account Aggregator & OTP Module Migration
-- RBI-Compliant financial data sharing + secure OTP verification
-- Created: 2026-06-09

-- ─── OTP Requests Table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."otp_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "destination" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiryTime" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "otp_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "otp_requests_destination_purpose_status_idx" ON "public"."otp_requests"("destination", "purpose", "status");
CREATE INDEX IF NOT EXISTS "otp_requests_userId_idx" ON "public"."otp_requests"("userId");
CREATE INDEX IF NOT EXISTS "otp_requests_createdAt_idx" ON "public"."otp_requests"("createdAt");

-- ─── AA Consent Table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."aa_consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentHandle" TEXT,
    "consentId" TEXT,
    "vua" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "purpose" TEXT,
    "fiTypes" TEXT,
    "consentTypes" TEXT,
    "dataFrom" TIMESTAMP(3),
    "dataTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aa_consent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "aa_consent_consentId_key" ON "public"."aa_consent"("consentId");
CREATE INDEX IF NOT EXISTS "aa_consent_userId_idx" ON "public"."aa_consent"("userId");
CREATE INDEX IF NOT EXISTS "aa_consent_consentHandle_idx" ON "public"."aa_consent"("consentHandle");
CREATE INDEX IF NOT EXISTS "aa_consent_status_idx" ON "public"."aa_consent"("status");

-- ─── AA Consent Artifact Table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."aa_consent_artifact" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "artifactJson" TEXT,
    "signature" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aa_consent_artifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "aa_consent_artifact_consentId_key" ON "public"."aa_consent_artifact"("consentId");

-- ─── AA Data Session Table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."aa_data_session" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sessionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aa_data_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "aa_data_session_sessionId_key" ON "public"."aa_data_session"("sessionId");
CREATE INDEX IF NOT EXISTS "aa_data_session_consentId_idx" ON "public"."aa_data_session"("consentId");
CREATE INDEX IF NOT EXISTS "aa_data_session_userId_idx" ON "public"."aa_data_session"("userId");

-- ─── AA Financial Data Table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."aa_financial_data" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "accountType" TEXT,
    "maskedAccountNumber" TEXT,
    "dataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aa_financial_data_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "aa_financial_data_userId_idx" ON "public"."aa_financial_data"("userId");
CREATE INDEX IF NOT EXISTS "aa_financial_data_consentId_idx" ON "public"."aa_financial_data"("consentId");

-- ─── AA Transactions Table (processed financial transactions) ────────────────────

CREATE TABLE IF NOT EXISTS "public"."aa_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "maskedAccountNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aa_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "aa_transactions_userId_idx" ON "public"."aa_transactions"("userId");
CREATE INDEX IF NOT EXISTS "aa_transactions_consentId_idx" ON "public"."aa_transactions"("consentId");
CREATE INDEX IF NOT EXISTS "aa_transactions_transactionDate_idx" ON "public"."aa_transactions"("transactionDate");

