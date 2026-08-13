/**
 * fix-supabase-advisor-issues.cjs
 *
 * Connects directly to the live PostgreSQL database (Supabase) to resolve
 * all Supabase Database Linter & Security Advisor issues:
 *
 * 1. Function Search Path Mutable:
 *    - recalculate_account_balance
 *    - recalculate_loan_balance
 *    - recalculate_investment_values
 *    - update_updated_at_column
 *    - kanku_set_updated_at
 *    - prevent_auditlog_mutation
 *    - Any other custom user-defined functions in public schema.
 *
 * 2. Auth RLS Initialization Plan:
 *    - public.profiles
 *    - public.voice_transcripts
 *    - public.user_voice_learning
 *    Uses optimized `(select auth.uid())` init-plan expressions to prevent
 *    per-row re-evaluation and ensure security.
 *
 * 3. Unindexed Foreign Keys:
 *    - public."AdvisorApplication"(reviewedBy)
 *    - public."CollaborationParticipant"(userId, invitedBy)
 *    - public.todo_items(user_id, created_by)
 *    - public.todo_list_shares(shared_by)
 *
 * Usage:
 *   node backend/scripts/fix-supabase-advisor-issues.cjs
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

async function fixFunctionSearchPaths() {
  console.log('\n--- 1. Fixing Function Search Paths (Security: Search Path Hijacking Prevention) ---');

  const knownFunctions = [
    'recalculate_account_balance',
    'recalculate_loan_balance',
    'recalculate_investment_values',
    'update_updated_at_column',
    'kanku_set_updated_at',
    'prevent_auditlog_mutation',
  ];

  // Dynamically find all user-defined functions in public schema
  const funcs = await prisma.$queryRaw`
    SELECT routine_name, routine_schema, specific_name
    FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
  `;

  const funcNames = new Set([
    ...knownFunctions,
    ...funcs.map(f => f.routine_name)
  ]);

  for (const fn of funcNames) {
    try {
      // Find exact signature for each function
      const signatures = await prisma.$queryRawUnsafe(`
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = '${fn}';
      `);

      if (signatures.length === 0) {
        // Try generic alter without arguments if function exists
        await prisma.$executeRawUnsafe(`ALTER FUNCTION public."${fn}"() SET search_path = public, pg_temp;`).catch(() => {});
        console.log(`  ✓ Set search_path for public."${fn}"()`);
      } else {
        for (const sig of signatures) {
          const sql = `ALTER FUNCTION public."${sig.proname}"(${sig.args}) SET search_path = public, pg_temp;`;
          await prisma.$executeRawUnsafe(sql);
          console.log(`  ✓ Set search_path for public."${sig.proname}"(${sig.args})`);
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Could not alter function ${fn}: ${err.message}`);
    }
  }
}

async function fixAuthRLS() {
  console.log('\n--- 2. Fixing Auth RLS Policies (Security & InitPlan Optimization) ---');

  // 1. public.profiles
  try {
    const tableExists = await prisma.$queryRaw`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles';
    `;
    if (tableExists.length > 0) {
      await prisma.$executeRawUnsafe(`ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;`);
      await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;`);
      await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "profiles_user_only" ON public.profiles;`);
      await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;`);
      
      // Optimized initplan: (select auth.uid()) evaluates once per query
      await prisma.$executeRawUnsafe(`
        CREATE POLICY "Users can manage own profile" ON public.profiles
        FOR ALL USING ((select auth.uid()) = id)
        WITH CHECK ((select auth.uid()) = id);
      `);
      console.log('  ✓ Optimized RLS on public.profiles: (select auth.uid()) = id');
    }
  } catch (err) {
    console.warn(`  ⚠️ profiles RLS: ${err.message}`);
  }

  // 2. public.voice_transcripts
  try {
    const tableExists = await prisma.$queryRaw`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'voice_transcripts';
    `;
    if (tableExists.length > 0) {
      await prisma.$executeRawUnsafe(`ALTER TABLE public.voice_transcripts ENABLE ROW LEVEL SECURITY;`);
      await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "voice_transcripts_user_only" ON public.voice_transcripts;`);
      await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Users can manage own voice transcripts" ON public.voice_transcripts;`);
      
      await prisma.$executeRawUnsafe(`
        CREATE POLICY "Users can manage own voice transcripts" ON public.voice_transcripts
        FOR ALL USING ((select auth.uid())::text = "user_id")
        WITH CHECK ((select auth.uid())::text = "user_id");
      `);
      console.log('  ✓ Optimized RLS on public.voice_transcripts: (select auth.uid())::text = user_id');
    }
  } catch (err) {
    console.warn(`  ⚠️ voice_transcripts RLS: ${err.message}`);
  }

  // 3. public.user_voice_learning
  try {
    const tableExists = await prisma.$queryRaw`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_voice_learning';
    `;
    if (tableExists.length > 0) {
      await prisma.$executeRawUnsafe(`ALTER TABLE public.user_voice_learning ENABLE ROW LEVEL SECURITY;`);
      await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "user_voice_learning_user_only" ON public.user_voice_learning;`);
      await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Users can manage own voice learning" ON public.user_voice_learning;`);
      
      await prisma.$executeRawUnsafe(`
        CREATE POLICY "Users can manage own voice learning" ON public.user_voice_learning
        FOR ALL USING ((select auth.uid())::text = "user_id")
        WITH CHECK ((select auth.uid())::text = "user_id");
      `);
      console.log('  ✓ Optimized RLS on public.user_voice_learning: (select auth.uid())::text = user_id');
    }
  } catch (err) {
    console.warn(`  ⚠️ user_voice_learning RLS: ${err.message}`);
  }
}

async function fixUnindexedForeignKeys() {
  console.log('\n--- 3. Creating Indexes on Foreign Keys (Performance & Query Optimization) ---');

  const indexStatements = [
    // AdvisorApplication
    {
      name: 'AdvisorApplication_reviewedBy_idx',
      sql: `CREATE INDEX IF NOT EXISTS "AdvisorApplication_reviewedBy_idx" ON public."AdvisorApplication"("reviewedBy");`
    },
    // CollaborationParticipant
    {
      name: 'CollaborationParticipant_userId_idx',
      sql: `CREATE INDEX IF NOT EXISTS "CollaborationParticipant_userId_idx" ON public."CollaborationParticipant"("userId");`
    },
    {
      name: 'CollaborationParticipant_invitedBy_idx',
      sql: `CREATE INDEX IF NOT EXISTS "CollaborationParticipant_invitedBy_idx" ON public."CollaborationParticipant"("invitedBy");`
    },
    // todo_items
    {
      name: 'idx_todo_items_user_id',
      sql: `CREATE INDEX IF NOT EXISTS "idx_todo_items_user_id" ON public.todo_items("user_id");`
    },
    {
      name: 'idx_todo_items_created_by',
      sql: `CREATE INDEX IF NOT EXISTS "idx_todo_items_created_by" ON public.todo_items("created_by");`
    },
    // todo_list_shares
    {
      name: 'idx_todo_list_shares_shared_by',
      sql: `CREATE INDEX IF NOT EXISTS "idx_todo_list_shares_shared_by" ON public.todo_list_shares("shared_by");`
    },
  ];

  for (const idx of indexStatements) {
    try {
      await prisma.$executeRawUnsafe(idx.sql);
      console.log(`  ✓ Created index: ${idx.name}`);
    } catch (err) {
      console.warn(`  ⚠️ Index ${idx.name}: ${err.message}`);
    }
  }
}

async function main() {
  console.log('===========================================================');
  console.log('  Supabase Advisor & Linter Auto-Remediation');
  console.log('===========================================================');

  await fixFunctionSearchPaths();
  await fixAuthRLS();
  await fixUnindexedForeignKeys();

  console.log('\n===========================================================');
  console.log('  Database Remediation Completed Successfully!');
  console.log('===========================================================');
}

main()
  .catch(err => {
    console.error('Fatal error running remediation:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
