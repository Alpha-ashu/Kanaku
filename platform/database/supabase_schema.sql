-- ==============================================================================
-- FinanceLife: The Comprehensive Supabase Relational Database Schema
-- ==============================================================================
-- Completely idempotent. Run this directly in your Supabase SQL Editor.
-- Covers every single module: Core Finance, Advisor/Chat, Social/Groups, and Apps (ToDos).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. TABLE CREATIONS
-- ==========================================

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  job_type TEXT,
  monthly_income NUMERIC,
  annual_income NUMERIC,
  date_of_birth DATE,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DEVICES
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  device_id TEXT UNIQUE NOT NULL,
  device_name TEXT,
  device_type TEXT,
  platform TEXT,
  app_version TEXT,
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USER PINS
CREATE TABLE IF NOT EXISTS public.user_pins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  pin_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  failed_attempts INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ACCOUNTS
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'bank', 
  provider TEXT,
  country TEXT,
  balance NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  sync_status TEXT DEFAULT 'synced',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Ensure existing projects also get new account metadata columns.
ALTER TABLE IF EXISTS public.accounts ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE IF EXISTS public.accounts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE IF EXISTS public.accounts ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';
ALTER TABLE IF EXISTS public.accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'accounts'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%balance >= 0%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.accounts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- FRIENDS
CREATE TABLE IF NOT EXISTS public.friends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar TEXT,
  notes TEXT,
  sync_status TEXT DEFAULT 'synced',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  created_from_import BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (user_id, name, type)
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  account_id TEXT NOT NULL, 
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  merchant TEXT,
  date TIMESTAMPTZ NOT NULL,
  tags TEXT[],
  attachment TEXT,
  transfer_to_account_id TEXT,
  transfer_type TEXT,
  expense_mode TEXT,
  group_expense_id TEXT,
  group_name TEXT,
  split_type TEXT,
  import_source TEXT,
  import_metadata JSONB DEFAULT '{}'::jsonb,
  original_category TEXT,
  imported_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'synced',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS attachment TEXT;
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS expense_mode TEXT;
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS group_expense_id TEXT;
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS split_type TEXT;
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS import_source TEXT;
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS import_metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS original_category TEXT;
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';
ALTER TABLE IF EXISTS public.transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- GOALS
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  target_amount NUMERIC NOT NULL,
  current_amount NUMERIC DEFAULT 0,
  target_date TIMESTAMPTZ NOT NULL,
  category TEXT,
  is_group_goal BOOLEAN DEFAULT false,
  sync_status TEXT DEFAULT 'synced',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS public.goals ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS public.goals ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';
ALTER TABLE IF EXISTS public.goals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- GOAL CONTRIBUTIONS
CREATE TABLE IF NOT EXISTS public.goal_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  member_name TEXT,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOANS
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  principal_amount NUMERIC NOT NULL,
  outstanding_balance NUMERIC NOT NULL,
  interest_rate NUMERIC,
  emi_amount NUMERIC,
  due_date TIMESTAMPTZ,
  frequency TEXT,
  status TEXT DEFAULT 'active',
  contact_person TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVESTMENTS
CREATE TABLE IF NOT EXISTS public.investments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  asset_type TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  buy_price NUMERIC NOT NULL,
  current_price NUMERIC NOT NULL,
  total_invested NUMERIC NOT NULL,
  current_value NUMERIC NOT NULL,
  profit_loss NUMERIC NOT NULL,
  purchase_date TIMESTAMPTZ NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USER SETTINGS
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  theme TEXT DEFAULT 'light',
  language TEXT DEFAULT 'en',
  currency TEXT DEFAULT 'USD',
  timezone TEXT DEFAULT 'UTC',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GROUP EXPENSES
CREATE TABLE IF NOT EXISTS public.group_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  paid_by TEXT,
  date TIMESTAMPTZ NOT NULL,
  members JSONB DEFAULT '[]'::jsonb,
  items JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  category TEXT,
  subcategory TEXT,
  split_type TEXT,
  your_share NUMERIC,
  expense_transaction_id TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name TEXT,
  status TEXT,
  notification_status TEXT,
  sync_status TEXT DEFAULT 'synced',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS split_type TEXT;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS your_share NUMERIC;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS expense_transaction_id TEXT;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS notification_status TEXT;
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';
ALTER TABLE IF EXISTS public.group_expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- IMPORT LOGS
CREATE TABLE IF NOT EXISTS public.import_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  total_records INT NOT NULL DEFAULT 0,
  imported_records INT NOT NULL DEFAULT 0,
  skipped_records INT NOT NULL DEFAULT 0,
  duplicate_records INT NOT NULL DEFAULT 0,
  failed_records INT NOT NULL DEFAULT 0,
  created_accounts JSONB DEFAULT '[]'::jsonb,
  created_categories JSONB DEFAULT '[]'::jsonb,
  created_goals JSONB DEFAULT '[]'::jsonb,
  updated_goals JSONB DEFAULT '[]'::jsonb,
  errors JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IMPORT / FINANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_accounts_user_active ON public.accounts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_friends_user_name ON public.friends(user_id, name);
CREATE INDEX IF NOT EXISTS idx_categories_user_type_name ON public.categories(user_id, type, name);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON public.transactions(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_group_expense ON public.transactions(group_expense_id);
CREATE INDEX IF NOT EXISTS idx_transactions_import_source ON public.transactions(import_source);
CREATE INDEX IF NOT EXISTS idx_goals_user_target_date ON public.goals(user_id, target_date);
CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_date ON public.goal_contributions(goal_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_group_expenses_user_date ON public.group_expenses(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_import_logs_user_created_at ON public.import_logs(user_id, created_at DESC);

-- TAX CALCULATIONS
CREATE TABLE IF NOT EXISTS public.tax_calculations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  year INT NOT NULL,
  total_income NUMERIC NOT NULL,
  total_expense NUMERIC NOT NULL,
  net_profit NUMERIC NOT NULL,
  taxable_income NUMERIC NOT NULL,
  estimated_tax NUMERIC NOT NULL,
  tax_rate NUMERIC NOT NULL,
  deductions NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FINANCE ADVISORS
CREATE TABLE IF NOT EXISTS public.finance_advisors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  specialization TEXT[],
  experience INT DEFAULT 0,
  qualifications TEXT[],
  rating NUMERIC DEFAULT 0,
  total_reviews INT DEFAULT 0,
  clients_completed INT DEFAULT 0,
  active_clients INT DEFAULT 0,
  social_links JSONB DEFAULT '{}'::jsonb,
  availability BOOLEAN DEFAULT false,
  hourly_rate NUMERIC DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ADVISOR SESSIONS
CREATE TABLE IF NOT EXISTS public.advisor_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advisor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  duration INT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled',
  notes TEXT,
  meeting_link TEXT,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BOOKING REQUESTS
CREATE TABLE IF NOT EXISTS public.booking_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advisor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  advisor_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  requested_date TIMESTAMPTZ,
  preferred_time TEXT,
  topic TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',
  session_type TEXT NOT NULL,
  response_message TEXT,
  sequence_number INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHAT CONVERSATIONS
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id TEXT UNIQUE NOT NULL,
  advisor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  advisor_initiated BOOLEAN DEFAULT false,
  last_message TEXT,
  last_message_time TIMESTAMPTZ,
  unread_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHAT MESSAGES
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id TEXT NOT NULL REFERENCES public.chat_conversations(conversation_id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT false,
  attachment_url TEXT
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  due_date TIMESTAMPTZ,
  is_read BOOLEAN DEFAULT false,
  related_id TEXT,
  deep_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TODO LISTS
CREATE TABLE IF NOT EXISTS public.todo_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TODO ITEMS
CREATE TABLE IF NOT EXISTS public.todo_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id INT,
  list_id UUID REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT false,
  priority TEXT DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 2. AUTOMATIC TIMESTAMP TRIGGERS (Idempotent Setup)
-- ==============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers (safely dropping existing ones if they exist)
DO $$
DECLARE
  t TEXT;
  arr TEXT[] := ARRAY['profiles', 'devices', 'user_pins', 'accounts', 'friends', 'categories', 'transactions', 'goals', 'goal_contributions', 'loans', 'investments', 'user_settings', 'group_expenses', 'tax_calculations', 'finance_advisors', 'advisor_sessions', 'booking_requests', 'chat_conversations', 'todo_lists', 'todo_items'];
BEGIN
  FOREACH t IN ARRAY arr
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ==============================================================================
-- 3. ENABLING ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_advisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 4. APPLYING POLICIES (Idempotent Policy Generation)
-- ==============================================================================

-- General function to create generic CRUD RLS where `user_id` is the owner
CREATE OR REPLACE FUNCTION apply_generic_rls(table_name text) RETURNS void AS $$
BEGIN
    EXECUTE format('DROP POLICY IF EXISTS "Users can view own data" ON public.%I', table_name);
    EXECUTE format('CREATE POLICY "Users can view own data" ON public.%I FOR SELECT USING (auth.uid() = user_id)', table_name);
    
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert own data" ON public.%I', table_name);
    EXECUTE format('CREATE POLICY "Users can insert own data" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', table_name);

    EXECUTE format('DROP POLICY IF EXISTS "Users can update own data" ON public.%I', table_name);
    EXECUTE format('CREATE POLICY "Users can update own data" ON public.%I FOR UPDATE USING (auth.uid() = user_id)', table_name);

    EXECUTE format('DROP POLICY IF EXISTS "Users can delete own data" ON public.%I', table_name);
    EXECUTE format('CREATE POLICY "Users can delete own data" ON public.%I FOR DELETE USING (auth.uid() = user_id)', table_name);
END;
$$ LANGUAGE plpgsql;

-- Apply generic `user_id` ownership to appropriate core tables
DO $$
DECLARE
  t TEXT;
  generic_tables TEXT[] := ARRAY['devices', 'user_pins', 'accounts', 'friends', 'categories', 'transactions', 'goals', 'goal_contributions', 'loans', 'investments', 'user_settings', 'group_expenses', 'import_logs', 'tax_calculations', 'notifications'];
BEGIN
  FOREACH t IN ARRAY generic_tables
  LOOP
    PERFORM apply_generic_rls(t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Custom Policy Assignments (For tables lacking straight `user_id` mapping)
-- ---------------------------------------------------------------------------

-- Profiles Custom RLS
DROP POLICY IF EXISTS "Users can view own data" ON public.profiles;
CREATE POLICY "Users can view own data" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own data" ON public.profiles;
CREATE POLICY "Users can insert own data" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own data" ON public.profiles;
CREATE POLICY "Users can update own data" ON public.profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can delete own data" ON public.profiles;
CREATE POLICY "Users can delete own data" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- Finance Advisors (Publicly Viewable, only updatable by themselves)
DROP POLICY IF EXISTS "Anyone can view advisors" ON public.finance_advisors;
CREATE POLICY "Anyone can view advisors" ON public.finance_advisors FOR SELECT USING (true);
DROP POLICY IF EXISTS "Advisors can update own data" ON public.finance_advisors;
CREATE POLICY "Advisors can update own data" ON public.finance_advisors FOR ALL USING (auth.uid() = user_id);

-- Advisor Sessions & Booking Requests (Viewable/Editable by Client OR Advisor)
DO $$
DECLARE t TEXT; shared_tables TEXT[] := ARRAY['advisor_sessions', 'booking_requests', 'chat_conversations'];
BEGIN
  FOREACH t IN ARRAY shared_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Participants can manage data" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Participants can manage data" ON public.%I FOR ALL USING (auth.uid() = advisor_id OR auth.uid() = client_id)', t);
  END LOOP;
END $$;

-- Chat Messages (Participants in conversation)
DROP POLICY IF EXISTS "Participants can chat" ON public.chat_messages;
CREATE POLICY "Participants can chat" ON public.chat_messages FOR ALL USING (
  auth.uid() IN (
    SELECT advisor_id FROM public.chat_conversations WHERE conversation_id = chat_messages.conversation_id
  ) OR auth.uid() IN (
    SELECT client_id FROM public.chat_conversations WHERE conversation_id = chat_messages.conversation_id
  )
);

-- Todo Lists (owner_id handles logic)
DROP POLICY IF EXISTS "Owners can manage todo lists" ON public.todo_lists;
CREATE POLICY "Owners can manage todo lists" ON public.todo_lists FOR ALL USING (auth.uid() = owner_id);

-- Todo Items (created_by handles logic)
DROP POLICY IF EXISTS "Creators can manage items" ON public.todo_items;
CREATE POLICY "Creators can manage items" ON public.todo_items FOR ALL USING (auth.uid() = created_by);
