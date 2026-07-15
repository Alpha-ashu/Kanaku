-- Migration: 20260715000000_todo_indexes
-- Purpose: Add performance indexes on the raw-SQL todo tables to bring GET /todos under SLA.
-- Note: todo_lists, todo_items, todo_list_shares are NOT Prisma-managed models.
--       They exist in the public schema but are not in schema.prisma.
--       This migration creates indexes only if the tables exist.

DO $$
BEGIN
  -- Index on todo_lists.user_id (primary filter in TodoRepository.findLists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_lists') THEN
    CREATE INDEX IF NOT EXISTS idx_todo_lists_user_id ON public.todo_lists (user_id);
    RAISE NOTICE 'Created/verified index idx_todo_lists_user_id';
  ELSE
    RAISE NOTICE 'Skipping todo_lists indexes: table does not exist in this environment';
  END IF;

  -- Index on todo_items.list_id (primary join path)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_items') THEN
    CREATE INDEX IF NOT EXISTS idx_todo_items_list_id ON public.todo_items (list_id);
    RAISE NOTICE 'Created/verified index idx_todo_items_list_id';
  END IF;

  -- Indexes on todo_list_shares (sub-select in findLists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_list_shares') THEN
    CREATE INDEX IF NOT EXISTS idx_todo_list_shares_shared_with ON public.todo_list_shares (shared_with_user_id);
    CREATE INDEX IF NOT EXISTS idx_todo_list_shares_list_id ON public.todo_list_shares (list_id);
    RAISE NOTICE 'Created/verified indexes on todo_list_shares';
  END IF;
END$$;

