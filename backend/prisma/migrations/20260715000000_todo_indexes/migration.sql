-- Migration: 20260715000000_todo_indexes
-- Purpose: Add performance indexes and create raw-SQL todo tables if not existing.

-- Create raw todo_lists, todo_items, and todo_list_shares tables
CREATE TABLE IF NOT EXISTS public.todo_lists (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  archived    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.todo_items (
  id           BIGSERIAL PRIMARY KEY,
  list_id      BIGINT REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
  user_id      UUID NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  completed    BOOLEAN DEFAULT false,
  priority     TEXT CHECK (priority IN ('low','medium','high')) DEFAULT 'medium',
  due_date     TIMESTAMPTZ,
  created_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.todo_list_shares (
  id                  BIGSERIAL PRIMARY KEY,
  list_id             BIGINT REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
  shared_with_user_id UUID NOT NULL,
  shared_by           UUID NOT NULL,
  permission          TEXT CHECK (permission IN ('view','edit')) DEFAULT 'view',
  shared_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, shared_with_user_id)
);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_todo_lists_user_id ON public.todo_lists (user_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_list_id ON public.todo_items(list_id);
CREATE INDEX IF NOT EXISTS idx_todo_list_shares_shared_with ON public.todo_list_shares (shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_todo_list_shares_list_id ON public.todo_list_shares (list_id);



