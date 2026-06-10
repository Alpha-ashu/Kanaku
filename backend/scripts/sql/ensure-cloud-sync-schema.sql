CREATE OR REPLACE FUNCTION public.KANAKU_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  full_name text,
  first_name text,
  last_name text,
  avatar_url text,
  avatar_id text,
  phone text,
  gender text,
  date_of_birth timestamptz,
  monthly_income numeric(15, 2),
  annual_income numeric(15, 2),
  job_type text,
  country text,
  state text,
  city text,
  visible_features jsonb,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS avatar_id text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth timestamptz,
  ADD COLUMN IF NOT EXISTS monthly_income numeric(15, 2),
  ADD COLUMN IF NOT EXISTS annual_income numeric(15, 2),
  ADD COLUMN IF NOT EXISTS job_type text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS visible_features jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.accounts (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id bigint NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  provider text,
  country text,
  balance numeric(18, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz
);

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS balance numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_local_id ON public.accounts(user_id, local_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_deleted_at ON public.accounts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON public.accounts(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.friends_sync (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id bigint NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  avatar text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_sync_user_local_id ON public.friends_sync(user_id, local_id);
CREATE INDEX IF NOT EXISTS idx_friends_sync_user_id ON public.friends_sync(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_sync_deleted_at ON public.friends_sync(deleted_at);
CREATE INDEX IF NOT EXISTS idx_friends_sync_updated_at ON public.friends_sync(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.goals (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id bigint NOT NULL,
  name text NOT NULL,
  description text,
  target_amount numeric(18, 2) NOT NULL DEFAULT 0,
  current_amount numeric(18, 2) NOT NULL DEFAULT 0,
  target_date timestamptz,
  category text,
  is_group_goal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_user_local_id ON public.goals(user_id, local_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_deleted_at ON public.goals(deleted_at);
CREATE INDEX IF NOT EXISTS idx_goals_updated_at ON public.goals(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.group_expenses_sync (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id bigint NOT NULL,
  name text NOT NULL,
  total_amount numeric(18, 2) NOT NULL DEFAULT 0,
  paid_by bigint,
  date timestamptz NOT NULL DEFAULT NOW(),
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  items jsonb,
  description text,
  category text,
  subcategory text,
  split_type text,
  your_share numeric(18, 2),
  expense_transaction_id bigint,
  created_by text,
  created_by_name text,
  status text,
  notification_status text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_expenses_sync_user_local_id ON public.group_expenses_sync(user_id, local_id);
CREATE INDEX IF NOT EXISTS idx_group_expenses_sync_user_id ON public.group_expenses_sync(user_id);
CREATE INDEX IF NOT EXISTS idx_group_expenses_sync_deleted_at ON public.group_expenses_sync(deleted_at);
CREATE INDEX IF NOT EXISTS idx_group_expenses_sync_updated_at ON public.group_expenses_sync(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.transactions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id bigint NOT NULL,
  type text NOT NULL,
  amount numeric(18, 2) NOT NULL DEFAULT 0,
  account_id bigint NOT NULL,
  category text NOT NULL,
  subcategory text,
  description text,
  merchant text,
  date timestamptz NOT NULL DEFAULT NOW(),
  tags jsonb,
  attachment text,
  transfer_to_account_id bigint,
  transfer_type text,
  expense_mode text,
  group_expense_id bigint,
  group_name text,
  split_type text,
  import_source text,
  import_metadata jsonb,
  original_category text,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS expense_mode text,
  ADD COLUMN IF NOT EXISTS group_expense_id bigint,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS split_type text,
  ADD COLUMN IF NOT EXISTS import_source text,
  ADD COLUMN IF NOT EXISTS import_metadata jsonb,
  ADD COLUMN IF NOT EXISTS original_category text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_local_id ON public.transactions(user_id, local_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_group_expense_id ON public.transactions(group_expense_id);
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON public.transactions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_updated_at ON public.transactions(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.loans (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id bigint NOT NULL,
  type text NOT NULL,
  name text NOT NULL,
  principal_amount numeric(18, 2) NOT NULL DEFAULT 0,
  outstanding_balance numeric(18, 2) NOT NULL DEFAULT 0,
  interest_rate numeric(10, 4),
  total_payable numeric(18, 2),
  emi_amount numeric(18, 2),
  due_date timestamptz,
  loan_date timestamptz,
  frequency text,
  status text NOT NULL DEFAULT 'active',
  contact_person text,
  friend_id bigint,
  contact_email text,
  contact_phone text,
  account_id bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_user_local_id ON public.loans(user_id, local_id);
CREATE INDEX IF NOT EXISTS idx_loans_user_id ON public.loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_deleted_at ON public.loans(deleted_at);
CREATE INDEX IF NOT EXISTS idx_loans_updated_at ON public.loans(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.investments (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id bigint NOT NULL,
  asset_type text NOT NULL,
  asset_name text NOT NULL,
  quantity numeric(18, 6) NOT NULL DEFAULT 0,
  buy_price numeric(18, 6) NOT NULL DEFAULT 0,
  current_price numeric(18, 6) NOT NULL DEFAULT 0,
  total_invested numeric(18, 6) NOT NULL DEFAULT 0,
  current_value numeric(18, 6) NOT NULL DEFAULT 0,
  profit_loss numeric(18, 6) NOT NULL DEFAULT 0,
  purchase_date timestamptz NOT NULL DEFAULT NOW(),
  last_updated timestamptz NOT NULL DEFAULT NOW(),
  broker text,
  description text,
  asset_currency text,
  base_currency text,
  buy_fx_rate numeric(18, 6),
  last_known_fx_rate numeric(18, 6),
  total_invested_native numeric(18, 6),
  current_value_native numeric(18, 6),
  valuation_version integer,
  position_status text,
  closed_at timestamptz,
  close_price numeric(18, 6),
  close_fx_rate numeric(18, 6),
  gross_sale_value numeric(18, 6),
  net_sale_value numeric(18, 6),
  funding_account_id bigint,
  purchase_fees numeric(18, 6),
  purchase_transaction_id bigint,
  purchase_fee_transaction_id bigint,
  sale_transaction_id bigint,
  sale_fee_transaction_id bigint,
  closing_fees numeric(18, 6),
  realized_profit_loss numeric(18, 6),
  settlement_account_id bigint,
  close_notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_investments_user_local_id ON public.investments(user_id, local_id);
CREATE INDEX IF NOT EXISTS idx_investments_user_id ON public.investments(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_deleted_at ON public.investments(deleted_at);
CREATE INDEX IF NOT EXISTS idx_investments_updated_at ON public.investments(updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'KANAKU_profiles_set_updated_at'
  ) THEN
    CREATE TRIGGER KANAKU_profiles_set_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.KANAKU_set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'KANAKU_accounts_set_updated_at'
  ) THEN
    CREATE TRIGGER KANAKU_accounts_set_updated_at
      BEFORE UPDATE ON public.accounts
      FOR EACH ROW
      EXECUTE FUNCTION public.KANAKU_set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'KANAKU_friends_sync_set_updated_at'
  ) THEN
    CREATE TRIGGER KANAKU_friends_sync_set_updated_at
      BEFORE UPDATE ON public.friends_sync
      FOR EACH ROW
      EXECUTE FUNCTION public.KANAKU_set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'KANAKU_goals_set_updated_at'
  ) THEN
    CREATE TRIGGER KANAKU_goals_set_updated_at
      BEFORE UPDATE ON public.goals
      FOR EACH ROW
      EXECUTE FUNCTION public.KANAKU_set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'KANAKU_group_expenses_sync_set_updated_at'
  ) THEN
    CREATE TRIGGER KANAKU_group_expenses_sync_set_updated_at
      BEFORE UPDATE ON public.group_expenses_sync
      FOR EACH ROW
      EXECUTE FUNCTION public.KANAKU_set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'KANAKU_transactions_set_updated_at'
  ) THEN
    CREATE TRIGGER KANAKU_transactions_set_updated_at
      BEFORE UPDATE ON public.transactions
      FOR EACH ROW
      EXECUTE FUNCTION public.KANAKU_set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'KANAKU_loans_set_updated_at'
  ) THEN
    CREATE TRIGGER KANAKU_loans_set_updated_at
      BEFORE UPDATE ON public.loans
      FOR EACH ROW
      EXECUTE FUNCTION public.KANAKU_set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'KANAKU_investments_set_updated_at'
  ) THEN
    CREATE TRIGGER KANAKU_investments_set_updated_at
      BEFORE UPDATE ON public.investments
      FOR EACH ROW
      EXECUTE FUNCTION public.KANAKU_set_updated_at();
  END IF;
END $$;

DO $$
DECLARE
  auth_uid_exists boolean := to_regprocedure('auth.uid()') IS NOT NULL;
  table_name text;
BEGIN
  IF NOT auth_uid_exists THEN
    RETURN;
  END IF;

  FOREACH table_name IN ARRAY ARRAY['profiles', 'accounts', 'transactions', 'goals', 'loans', 'investments', 'friends_sync', 'group_expenses_sync']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = table_name || '_owner_policy'
    ) THEN
      IF table_name = 'profiles' THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I USING (auth.uid() = id) WITH CHECK (auth.uid() = id)',
          table_name || '_owner_policy',
          table_name
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
          table_name || '_owner_policy',
          table_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;
