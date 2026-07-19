-- Extend core finance tables so richer local fields can sync across devices.

ALTER TABLE public.friends
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS expense_mode TEXT,
  ADD COLUMN IF NOT EXISTS group_expense_id BIGINT REFERENCES public.group_expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS split_type TEXT,
  ADD COLUMN IF NOT EXISTS import_source TEXT,
  ADD COLUMN IF NOT EXISTS import_metadata JSONB,
  ADD COLUMN IF NOT EXISTS original_category TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS total_payable DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS loan_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS account_id BIGINT REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.group_expenses
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS split_type TEXT,
  ADD COLUMN IF NOT EXISTS your_share DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS expense_transaction_id BIGINT REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS notification_status TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS broker TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS asset_currency TEXT,
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS buy_fx_rate DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS last_known_fx_rate DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS total_invested_native DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS current_value_native DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS valuation_version INTEGER,
  ADD COLUMN IF NOT EXISTS position_status TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_price DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS close_fx_rate DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS gross_sale_value DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS net_sale_value DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS funding_account_id BIGINT REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_fees DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS purchase_transaction_id BIGINT REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_fee_transaction_id BIGINT REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_transaction_id BIGINT REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_fee_transaction_id BIGINT REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closing_fees DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS realized_profit_loss DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS settlement_account_id BIGINT REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS close_notes TEXT;

DROP TRIGGER IF EXISTS update_friends_updated_at ON public.friends;
CREATE TRIGGER update_friends_updated_at
  BEFORE UPDATE ON public.friends
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_group_expenses_updated_at ON public.group_expenses;
CREATE TRIGGER update_group_expenses_updated_at
  BEFORE UPDATE ON public.group_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
