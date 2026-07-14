-- Migration: 20260715000000_todo_indexes
-- Purpose: Add indexes on public.todo_lists, todo_items, and todo_list_shares to bring
--          GET /todos endpoint under the 500ms SLA (currently ~679ms mean, 797ms P95).
--          The todo tables are managed as raw SQL (not Prisma models) so indexes must be
--          added manually. All three use CREATE INDEX IF NOT EXISTS for idempotency.

-- Index: todo_lists filtered by user (primary query pattern in TodoRepository.findLists)
CREATE INDEX IF NOT EXISTS idx_todo_lists_user_id
  ON public.todo_lists (user_id);

-- Index: todo_items filtered by list (primary join in TodoRepository.findItems)
CREATE INDEX IF NOT EXISTS idx_todo_items_list_id
  ON public.todo_items (list_id);

-- Index: todo_list_shares filtered by shared_with_user_id (used in findLists sub-select)
CREATE INDEX IF NOT EXISTS idx_todo_list_shares_shared_with
  ON public.todo_list_shares (shared_with_user_id);

-- Index: todo_list_shares filtered by list_id (secondary join path)
CREATE INDEX IF NOT EXISTS idx_todo_list_shares_list_id
  ON public.todo_list_shares (list_id);
