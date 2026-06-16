-- Unified Collaboration, Invitation & Notification System
-- Shared participant/invitation tracking across Group Expenses, Together
-- To-Do Lists, Together Goals, and future collaborative modules.

CREATE TABLE IF NOT EXISTS "CollaborationParticipant" (
    "id"         TEXT NOT NULL,
    "moduleType" TEXT NOT NULL,
    "moduleId"   TEXT NOT NULL,
    "moduleName" TEXT,
    "email"      TEXT NOT NULL,
    "name"       TEXT,
    "userId"     TEXT,
    "status"     TEXT NOT NULL DEFAULT 'PENDING_REGISTRATION',
    "invitedBy"  TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedAt"   TIMESTAMP(3),
    CONSTRAINT "CollaborationParticipant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CollaborationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CollaborationParticipant_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollaborationParticipant_moduleType_moduleId_email_key" UNIQUE ("moduleType", "moduleId", "email")
);

CREATE INDEX IF NOT EXISTS "CollaborationParticipant_email_idx" ON "CollaborationParticipant"("email");
CREATE INDEX IF NOT EXISTS "CollaborationParticipant_status_idx" ON "CollaborationParticipant"("status");
CREATE INDEX IF NOT EXISTS "CollaborationParticipant_moduleType_moduleId_idx" ON "CollaborationParticipant"("moduleType", "moduleId");

CREATE TABLE IF NOT EXISTS "GoalMember" (
    "id"        TEXT NOT NULL,
    "goalId"    TEXT NOT NULL,
    "userId"    TEXT,
    "name"      TEXT NOT NULL,
    "email"     TEXT,
    "phone"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "GoalMember_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GoalMember_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "GoalMember_goalId_idx" ON "GoalMember"("goalId");
CREATE INDEX IF NOT EXISTS "GoalMember_userId_idx" ON "GoalMember"("userId");
CREATE INDEX IF NOT EXISTS "GoalMember_deletedAt_idx" ON "GoalMember"("deletedAt");
