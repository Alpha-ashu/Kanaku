-- Add roleMode and advisorStatus columns to User table
ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "roleMode" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "advisorStatus" TEXT NOT NULL DEFAULT 'NOT_AVAILABLE';

-- Create AdvisorApplication table
CREATE TABLE IF NOT EXISTS public."AdvisorApplication" (
  "id"                  TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "fullName"            TEXT NOT NULL,
  "email"               TEXT NOT NULL,
  "phone"               TEXT NOT NULL,
  "experienceYears"     INTEGER NOT NULL,
  "expertise"           TEXT NOT NULL,
  "organizationName"    TEXT,
  "bio"                 TEXT NOT NULL,
  "panDocumentPath"     TEXT,
  "aadhaarDocumentPath" TEXT,
  "certDocumentPath"    TEXT,
  "status"              TEXT NOT NULL DEFAULT 'PENDING',
  "rejectionReason"     TEXT,
  "reviewedBy"          TEXT,
  "reviewedAt"          TIMESTAMP(3),
  "submittedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvisorApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdvisorApplication_userId_key" UNIQUE ("userId"),
  CONSTRAINT "AdvisorApplication_user_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE,
  CONSTRAINT "AdvisorApplication_reviewer_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES public."User"("id")
);

CREATE INDEX IF NOT EXISTS "AdvisorApplication_status_idx" ON public."AdvisorApplication"("status");
CREATE INDEX IF NOT EXISTS "AdvisorApplication_userId_idx" ON public."AdvisorApplication"("userId");
