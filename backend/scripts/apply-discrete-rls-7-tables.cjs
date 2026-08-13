/**
 * apply-discrete-rls-7-tables.cjs
 *
 * Applies explicit 4-action discrete RLS policies (SELECT, INSERT, UPDATE, DELETE)
 * with (select auth.uid()) for the 7 tables + AdvisorAvailability, AdvisorFollow, AdvisorPost.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

async function main() {
  console.log('Applying discrete SELECT, INSERT, UPDATE, DELETE policies on all tables...');

  // 1. public.user_features (ownership: user_id)
  await prisma.$executeRawUnsafe(`ALTER TABLE public.user_features ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_user_features_all" ON public.user_features;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own user_features select" ON public.user_features;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own user_features insert" ON public.user_features;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own user_features update" ON public.user_features;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own user_features delete" ON public.user_features;`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own user_features select" ON public.user_features FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own user_features insert" ON public.user_features FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own user_features update" ON public.user_features FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())::text) WITH CHECK (user_id = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own user_features delete" ON public.user_features FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid())::text);`);
  console.log('✓ Applied discrete policies to public.user_features');

  // 2. public.recurring_transactions (ownership: userId)
  await prisma.$executeRawUnsafe(`ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_recurring_transactions_all" ON public.recurring_transactions;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own recurring_transactions select" ON public.recurring_transactions;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own recurring_transactions insert" ON public.recurring_transactions;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own recurring_transactions update" ON public.recurring_transactions;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own recurring_transactions delete" ON public.recurring_transactions;`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own recurring_transactions select" ON public.recurring_transactions FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own recurring_transactions insert" ON public.recurring_transactions FOR INSERT TO authenticated WITH CHECK ("userId" = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own recurring_transactions update" ON public.recurring_transactions FOR UPDATE TO authenticated USING ("userId" = (SELECT auth.uid())::text) WITH CHECK ("userId" = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own recurring_transactions delete" ON public.recurring_transactions FOR DELETE TO authenticated USING ("userId" = (SELECT auth.uid())::text);`);
  console.log('✓ Applied discrete policies to public.recurring_transactions');

  // 3. public.user_learning (ownership: user_id)
  await prisma.$executeRawUnsafe(`ALTER TABLE public.user_learning ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_user_learning_all" ON public.user_learning;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own user_learning select" ON public.user_learning;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own user_learning insert" ON public.user_learning;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own user_learning update" ON public.user_learning;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own user_learning delete" ON public.user_learning;`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own user_learning select" ON public.user_learning FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own user_learning insert" ON public.user_learning FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own user_learning update" ON public.user_learning FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())::text) WITH CHECK (user_id = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own user_learning delete" ON public.user_learning FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid())::text);`);
  console.log('✓ Applied discrete policies to public.user_learning');

  // 4. public.todo_lists (ownership: user_id [uuid])
  await prisma.$executeRawUnsafe(`ALTER TABLE public.todo_lists ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_todo_lists_all" ON public.todo_lists;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_lists select" ON public.todo_lists;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_lists insert" ON public.todo_lists;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_lists update" ON public.todo_lists;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_lists delete" ON public.todo_lists;`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_lists select" ON public.todo_lists FOR SELECT TO authenticated USING (user_id::text = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_lists insert" ON public.todo_lists FOR INSERT TO authenticated WITH CHECK (user_id::text = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_lists update" ON public.todo_lists FOR UPDATE TO authenticated USING (user_id::text = (SELECT auth.uid())::text) WITH CHECK (user_id::text = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_lists delete" ON public.todo_lists FOR DELETE TO authenticated USING (user_id::text = (SELECT auth.uid())::text);`);
  console.log('✓ Applied discrete policies to public.todo_lists');

  // 5. public.todo_items (ownership: user_id [uuid])
  await prisma.$executeRawUnsafe(`ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_todo_items_all" ON public.todo_items;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_items select" ON public.todo_items;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_items insert" ON public.todo_items;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_items update" ON public.todo_items;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_items delete" ON public.todo_items;`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_items select" ON public.todo_items FOR SELECT TO authenticated USING (user_id::text = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_items insert" ON public.todo_items FOR INSERT TO authenticated WITH CHECK (user_id::text = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_items update" ON public.todo_items FOR UPDATE TO authenticated USING (user_id::text = (SELECT auth.uid())::text) WITH CHECK (user_id::text = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_items delete" ON public.todo_items FOR DELETE TO authenticated USING (user_id::text = (SELECT auth.uid())::text);`);
  console.log('✓ Applied discrete policies to public.todo_items');

  // 6. public.todo_list_shares (ownership: shared_with_user_id / shared_by)
  await prisma.$executeRawUnsafe(`ALTER TABLE public.todo_list_shares ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_todo_list_shares_all" ON public.todo_list_shares;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_list_shares select" ON public.todo_list_shares;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_list_shares insert" ON public.todo_list_shares;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_list_shares update" ON public.todo_list_shares;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own todo_list_shares delete" ON public.todo_list_shares;`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_list_shares select" ON public.todo_list_shares FOR SELECT TO authenticated USING (shared_with_user_id::text = (SELECT auth.uid())::text OR shared_by::text = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_list_shares insert" ON public.todo_list_shares FOR INSERT TO authenticated WITH CHECK (shared_by::text = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_list_shares update" ON public.todo_list_shares FOR UPDATE TO authenticated USING (shared_by::text = (SELECT auth.uid())::text) WITH CHECK (shared_by::text = (SELECT auth.uid())::text);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own todo_list_shares delete" ON public.todo_list_shares FOR DELETE TO authenticated USING (shared_by::text = (SELECT auth.uid())::text);`);
  console.log('✓ Applied discrete policies to public.todo_list_shares');

  // 7. public.recurring_executions (child of recurring_transactions via ruleId / recurringTransactionId)
  await prisma.$executeRawUnsafe(`ALTER TABLE public.recurring_executions ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "authenticated_select_recurring_executions" ON public.recurring_executions;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own recurring_executions select" ON public.recurring_executions;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own recurring_executions insert" ON public.recurring_executions;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own recurring_executions update" ON public.recurring_executions;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own recurring_executions delete" ON public.recurring_executions;`);
  await prisma.$executeRawUnsafe(`
    CREATE POLICY "own recurring_executions select" ON public.recurring_executions FOR SELECT TO authenticated 
      USING (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text));
  `);
  await prisma.$executeRawUnsafe(`
    CREATE POLICY "own recurring_executions insert" ON public.recurring_executions FOR INSERT TO authenticated 
      WITH CHECK (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text));
  `);
  await prisma.$executeRawUnsafe(`
    CREATE POLICY "own recurring_executions update" ON public.recurring_executions FOR UPDATE TO authenticated 
      USING (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text))
      WITH CHECK (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text));
  `);
  await prisma.$executeRawUnsafe(`
    CREATE POLICY "own recurring_executions delete" ON public.recurring_executions FOR DELETE TO authenticated 
      USING (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text));
  `);
  console.log('✓ Applied discrete policies to public.recurring_executions');

  // 8. AdvisorAvailability, AdvisorFollow, AdvisorPost
  await prisma.$executeRawUnsafe(`ALTER TABLE public."AdvisorAvailability" ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_AdvisorAvailability_select" ON public."AdvisorAvailability";`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_AdvisorAvailability_modify" ON public."AdvisorAvailability";`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own_AdvisorAvailability_select" ON public."AdvisorAvailability" FOR SELECT TO authenticated USING (true);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own_AdvisorAvailability_modify" ON public."AdvisorAvailability" FOR ALL TO authenticated USING ((select auth.uid())::text = "advisorId"::text) WITH CHECK ((select auth.uid())::text = "advisorId"::text);`);
  console.log('✓ Applied policies to public.AdvisorAvailability');

  await prisma.$executeRawUnsafe(`ALTER TABLE public."AdvisorFollow" ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_AdvisorFollow_all" ON public."AdvisorFollow";`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own_AdvisorFollow_all" ON public."AdvisorFollow" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text OR (select auth.uid())::text = "advisorId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text OR (select auth.uid())::text = "advisorId"::text);`);
  console.log('✓ Applied policies to public.AdvisorFollow');

  await prisma.$executeRawUnsafe(`ALTER TABLE public."AdvisorPost" ENABLE ROW LEVEL SECURITY;`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_AdvisorPost_select" ON public."AdvisorPost";`);
  await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "own_AdvisorPost_modify" ON public."AdvisorPost";`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own_AdvisorPost_select" ON public."AdvisorPost" FOR SELECT TO authenticated USING (true);`);
  await prisma.$executeRawUnsafe(`CREATE POLICY "own_AdvisorPost_modify" ON public."AdvisorPost" FOR ALL TO authenticated USING ((select auth.uid())::text = "advisorId"::text) WITH CHECK ((select auth.uid())::text = "advisorId"::text);`);
  console.log('✓ Applied policies to public.AdvisorPost');

  console.log('\nAll discrete single-tenant policies successfully applied!');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
