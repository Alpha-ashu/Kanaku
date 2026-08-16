/**
 * Non-destructive additive schema migration
 * Adds accountType, demoStatus, emailVerified to User and creates ApprovalRequest table.
 */

const { config } = require('dotenv');
config();

const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/prisma');

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL or DIRECT_URL is required');
  process.exit(1);
}

const adapter = new PrismaPg(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🔄 Applying additive schema updates to database...');

  // 1. Add User columns
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."User" 
    ADD COLUMN IF NOT EXISTS "accountType" TEXT NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS "demoStatus" TEXT NOT NULL DEFAULT 'ENABLED',
    ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
  `);
  console.log('  ✅ User columns updated (accountType, demoStatus, emailVerified)');

  // 2. Add indexes
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "User_accountType_idx" ON public."User"("accountType");
    CREATE INDEX IF NOT EXISTS "User_demoStatus_idx" ON public."User"("demoStatus");
    CREATE INDEX IF NOT EXISTS "User_emailVerified_idx" ON public."User"("emailVerified");
  `);
  console.log('  ✅ User indexes created');

  // 3. Create ApprovalRequest table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."ApprovalRequest" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "requesterId" TEXT NOT NULL,
      "targetUserId" TEXT,
      "actionType" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "reason" TEXT,
      "payload" JSONB,
      "reviewedBy" TEXT,
      "reviewedAt" TIMESTAMP(3),
      "rejectionReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ApprovalRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ApprovalRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  console.log('  ✅ ApprovalRequest table created');

  // 4. Create ApprovalRequest indexes
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ApprovalRequest_requesterId_idx" ON public."ApprovalRequest"("requesterId");
    CREATE INDEX IF NOT EXISTS "ApprovalRequest_targetUserId_idx" ON public."ApprovalRequest"("targetUserId");
    CREATE INDEX IF NOT EXISTS "ApprovalRequest_reviewedBy_idx" ON public."ApprovalRequest"("reviewedBy");
    CREATE INDEX IF NOT EXISTS "ApprovalRequest_status_idx" ON public."ApprovalRequest"("status");
    CREATE INDEX IF NOT EXISTS "ApprovalRequest_actionType_idx" ON public."ApprovalRequest"("actionType");
    CREATE INDEX IF NOT EXISTS "ApprovalRequest_createdAt_idx" ON public."ApprovalRequest"("createdAt");
  `);
  console.log('  ✅ ApprovalRequest indexes created');

  // 5. Backfill existing users: mark verified existing users as emailVerified: true
  await prisma.$executeRawUnsafe(`
    UPDATE public."User"
    SET "emailVerified" = true
    WHERE "status" IN ('verified', 'active') AND "emailVerified" = false;
  `);
  console.log('  ✅ Backfilled emailVerified=true for existing active users');

  console.log('✨ All additive schema updates applied successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error applying schema updates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
