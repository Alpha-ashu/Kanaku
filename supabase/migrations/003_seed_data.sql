-- =====================================================
-- DEVELOPMENT SEED DATA (Testing & Demo Only)
-- =====================================================
-- ⚠️ THIS FILE IS FOR DEVELOPMENT/TESTING ONLY
-- 
-- NEW USERS: This script is NOT automatically run on user registration.
-- Production users will NOT have mock data created.
-- 
-- IDEMPOTENT: Safe to run multiple times - checks for existing data
-- and skips insertion if data already exists.
-- 
-- Instructions:
-- 1. Sign up in your app
-- 2. Get your user ID: SELECT id FROM auth.users;
-- 3. Replace 'aecbed92-87e2-481c-985b-33dbc1f03fa2' with your user ID
-- 4. Go to Supabase SQL Editor
-- 5. Paste this entire file and run ONLY ONCE per user
-- =====================================================

-- Replace this with your actual user ID from auth.users
-- Get it by running: SELECT id, email FROM auth.users;
DO $$
DECLARE
  v_user_id UUID := 'aecbed92-87e2-481c-985b-33dbc1f03fa2'; -- ⚠️ REPLACE THIS!
  v_account1_id BIGINT;
  v_account2_id BIGINT;
  v_account3_id BIGINT;
  v_friend1_id BIGINT;
  v_loan1_id BIGINT;
  v_goal1_id BIGINT;
  v_todo_list1_id BIGINT;
BEGIN
  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'User ID % does not exist. Please sign up first or use correct user ID.', v_user_id;
  END IF;

  -- =====================================================
  -- IDEMPOTENCY CHECK: Skip if data already exists
  -- =====================================================
  IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'Seed data already exists for this user. Please delete existing data first or use a different user.';
  END IF;

  RAISE NOTICE 'Creating development sample data for user: %', v_user_id;

  -- =====================================================
  -- ACCOUNTS
  -- =====================================================
  INSERT INTO public.accounts (user_id, name, type, balance, currency, is_active)
  VALUES 
    (v_user_id, 'Main Bank Account', 'bank', 15000.00, 'USD', true),
    (v_user_id, 'Credit Card', 'card', -2500.00, 'USD', true),
    (v_user_id, 'Cash Wallet', 'cash', 500.00, 'USD', true),
    (v_user_id, 'Savings Account', 'bank', 25000.00, 'USD', true);

  -- Get account IDs
  SELECT id INTO v_account1_id FROM public.accounts 
    WHERE user_id = v_user_id AND name = 'Main Bank Account' LIMIT 1;
  SELECT id INTO v_account2_id FROM public.accounts 
    WHERE user_id = v_user_id AND name = 'Credit Card' LIMIT 1;
  SELECT id INTO v_account3_id FROM public.accounts 
    WHERE user_id = v_user_id AND name = 'Cash Wallet' LIMIT 1;

  RAISE NOTICE 'Created 4 accounts';

  -- =====================================================
  -- FRIENDS
  -- =====================================================
  INSERT INTO public.friends (user_id, name, email, phone, notes)
  VALUES 
    (v_user_id, 'John Doe', 'john@example.com', '+1234567890', 'College friend'),
    (v_user_id, 'Jane Smith', 'jane@example.com', '+1234567891', 'Work colleague'),
    (v_user_id, 'Mike Johnson', 'mike@example.com', '+1234567892', 'Business partner');

  -- Get friend ID
  SELECT id INTO v_friend1_id FROM public.friends 
    WHERE user_id = v_user_id AND name = 'John Doe' LIMIT 1;

  RAISE NOTICE 'Created 3 friends';

  -- =====================================================
  -- TRANSACTIONS (Last 30 days)
  -- =====================================================
  INSERT INTO public.transactions (user_id, type, amount, account_id, category, subcategory, description, merchant, date)
  VALUES 
    -- Income
    (v_user_id, 'income', 5000.00, v_account1_id, 'Salary', 'Monthly Pay', 'Monthly salary deposit', 'Employer Inc', NOW() - INTERVAL '25 days'),
    (v_user_id, 'income', 500.00, v_account1_id, 'Freelance', 'Web Design', 'Freelance project payment', 'Client XYZ', NOW() - INTERVAL '10 days'),
    
    -- Expenses - Food
    (v_user_id, 'expense', 85.50, v_account1_id, 'Food', 'Groceries', 'Weekly grocery shopping', 'Whole Foods', NOW() - INTERVAL '2 days'),
    (v_user_id, 'expense', 45.00, v_account2_id, 'Food', 'Dining Out', 'Dinner with friends', 'Italian Restaurant', NOW() - INTERVAL '5 days'),
    (v_user_id, 'expense', 12.50, v_account3_id, 'Food', 'Coffee', 'Morning coffee', 'Starbucks', NOW() - INTERVAL '1 days'),
    
    -- Expenses - Transport
    (v_user_id, 'expense', 65.00, v_account2_id, 'Transport', 'Gas', 'Fuel for car', 'Shell Gas Station', NOW() - INTERVAL '7 days'),
    (v_user_id, 'expense', 18.50, v_account3_id, 'Transport', 'Ride Sharing', 'Uber to office', 'Uber', NOW() - INTERVAL '3 days'),
    
    -- Expenses - Shopping
    (v_user_id, 'expense', 150.00, v_account2_id, 'Shopping', 'Clothing', 'New shirt and jeans', 'H&M', NOW() - INTERVAL '15 days'),
    (v_user_id, 'expense', 80.00, v_account2_id, 'Shopping', 'Electronics', 'Phone charger and cable', 'Best Buy', NOW() - INTERVAL '12 days'),
    
    -- Expenses - Bills
    (v_user_id, 'expense', 120.00, v_account1_id, 'Bills', 'Electricity', 'Monthly electricity bill', 'Power Company', NOW() - INTERVAL '20 days'),
    (v_user_id, 'expense', 60.00, v_account1_id, 'Bills', 'Internet', 'Monthly internet', 'ISP Provider', NOW() - INTERVAL '20 days'),
    (v_user_id, 'expense', 1200.00, v_account1_id, 'Bills', 'Rent', 'Monthly rent payment', 'Landlord', NOW() - INTERVAL '25 days'),
    
    -- Expenses - Entertainment
    (v_user_id, 'expense', 25.00, v_account2_id, 'Entertainment', 'Streaming', 'Netflix subscription', 'Netflix', NOW() - INTERVAL '15 days'),
    (v_user_id, 'expense', 50.00, v_account3_id, 'Entertainment', 'Movies', 'Movie tickets', 'AMC Theaters', NOW() - INTERVAL '8 days'),
    
    -- Transfer
    (v_user_id, 'transfer', 500.00, v_account1_id, 'Transfer', NULL, 'Transfer to savings', NULL, NOW() - INTERVAL '10 days');

  RAISE NOTICE 'Created 15 transactions';

  -- =====================================================
  -- LOANS
  -- =====================================================
  INSERT INTO public.loans (user_id, type, name, principal_amount, outstanding_balance, interest_rate, emi_amount, due_date, frequency, status, contact_person, friend_id)
  VALUES 
    (v_user_id, 'borrowed', 'Personal Loan', 10000.00, 7500.00, 8.5, 500.00, NOW() + INTERVAL '15 days', 'monthly', 'active', 'John Doe', v_friend1_id),
    (v_user_id, 'lent', 'Loan to Mike', 2000.00, 1500.00, 0, NULL, NOW() + INTERVAL '30 days', 'custom', 'active', 'Mike Johnson', NULL),
    (v_user_id, 'emi', 'Car Loan', 25000.00, 18000.00, 6.5, 750.00, NOW() + INTERVAL '20 days', 'monthly', 'active', 'Bank of America', NULL);

  -- Get loan ID
  SELECT id INTO v_loan1_id FROM public.loans 
    WHERE user_id = v_user_id AND name = 'Personal Loan' LIMIT 1;

  RAISE NOTICE 'Created 3 loans';

  -- =====================================================
  -- LOAN PAYMENTS
  -- =====================================================
  INSERT INTO public.loan_payments (user_id, loan_id, amount, account_id, date, notes)
  VALUES 
    (v_user_id, v_loan1_id, 500.00, v_account1_id, NOW() - INTERVAL '30 days', 'First EMI payment'),
    (v_user_id, v_loan1_id, 500.00, v_account1_id, NOW() - INTERVAL '60 days', 'Second EMI payment');

  RAISE NOTICE 'Created 2 loan payments';

  -- =====================================================
  -- GOALS
  -- =====================================================
  INSERT INTO public.goals (user_id, name, target_amount, current_amount, target_date, category, is_group_goal)
  VALUES 
    (v_user_id, 'Emergency Fund', 10000.00, 6500.00, NOW() + INTERVAL '180 days', 'Savings', false),
    (v_user_id, 'Vacation to Hawaii', 5000.00, 2000.00, NOW() + INTERVAL '120 days', 'Travel', false),
    (v_user_id, 'New Laptop', 2000.00, 800.00, NOW() + INTERVAL '60 days', 'Electronics', false),
    (v_user_id, 'Home Down Payment', 50000.00, 15000.00, NOW() + INTERVAL '365 days', 'Real Estate', false);

  -- Get goal ID
  SELECT id INTO v_goal1_id FROM public.goals 
    WHERE user_id = v_user_id AND name = 'Emergency Fund' LIMIT 1;

  RAISE NOTICE 'Created 4 goals';

  -- =====================================================
  -- GOAL CONTRIBUTIONS
  -- =====================================================
  INSERT INTO public.goal_contributions (user_id, goal_id, amount, account_id, date, notes)
  VALUES 
    (v_user_id, v_goal1_id, 1000.00, v_account1_id, NOW() - INTERVAL '60 days', 'Initial contribution'),
    (v_user_id, v_goal1_id, 500.00, v_account1_id, NOW() - INTERVAL '30 days', 'Monthly saving'),
    (v_user_id, v_goal1_id, 500.00, v_account1_id, NOW() - INTERVAL '15 days', 'Extra contribution');

  RAISE NOTICE 'Created 3 goal contributions';

  -- =====================================================
  -- GROUP EXPENSES
  -- =====================================================
  INSERT INTO public.group_expenses (user_id, name, total_amount, paid_by, date, members, items)
  VALUES 
    (v_user_id, 'Dinner Party', 150.00, v_account1_id, NOW() - INTERVAL '5 days',
     '[{"name": "You", "share": 50, "paid": true}, {"name": "John", "share": 50, "paid": false}, {"name": "Jane", "share": 50, "paid": true}]'::jsonb,
     '[{"name": "Food", "amount": 100, "sharedBy": ["You", "John", "Jane"]}, {"name": "Drinks", "amount": 50, "sharedBy": ["You", "John", "Jane"]}]'::jsonb),
    (v_user_id, 'Weekend Trip', 600.00, v_account2_id, NOW() - INTERVAL '20 days',
     '[{"name": "You", "share": 200, "paid": true}, {"name": "Mike", "share": 200, "paid": true}, {"name": "Sarah", "share": 200, "paid": false}]'::jsonb,
     '[{"name": "Hotel", "amount": 400, "sharedBy": ["You", "Mike", "Sarah"]}, {"name": "Gas", "amount": 100, "sharedBy": ["You", "Mike", "Sarah"]}, {"name": "Food", "amount": 100, "sharedBy": ["You", "Mike", "Sarah"]}]'::jsonb);

  RAISE NOTICE 'Created 2 group expenses';

  -- =====================================================
  -- INVESTMENTS
  -- =====================================================
  INSERT INTO public.investments (user_id, asset_type, asset_name, quantity, buy_price, current_price, total_invested, current_value, profit_loss, purchase_date, last_updated)
  VALUES 
    (v_user_id, 'stock', 'Apple Inc. (AAPL)', 10, 150.00, 175.50, 1500.00, 1755.00, 255.00, NOW() - INTERVAL '90 days', NOW()),
    (v_user_id, 'crypto', 'Bitcoin (BTC)', 0.5, 45000.00, 48000.00, 22500.00, 24000.00, 1500.00, NOW() - INTERVAL '180 days', NOW()),
    (v_user_id, 'stock', 'Tesla Inc. (TSLA)', 5, 700.00, 750.00, 3500.00, 3750.00, 250.00, NOW() - INTERVAL '120 days', NOW()),
    (v_user_id, 'gold', 'Gold ETF', 100, 180.00, 185.50, 18000.00, 18550.00, 550.00, NOW() - INTERVAL '60 days', NOW());

  RAISE NOTICE 'Created 4 investments';

  -- =====================================================
  -- NOTIFICATIONS
  -- =====================================================
  INSERT INTO public.notifications (user_id, type, title, message, due_date, is_read, related_id)
  VALUES 
    (v_user_id, 'emi', 'Car Loan EMI Due', 'Your car loan EMI of $750 is due in 5 days', NOW() + INTERVAL '5 days', false, NULL),
    (v_user_id, 'loan', 'Personal Loan Payment', 'Personal loan payment of $500 is due soon', NOW() + INTERVAL '10 days', false, v_loan1_id),
    (v_user_id, 'goal', 'Goal Progress', 'You are 65% towards your Emergency Fund goal!', NOW() + INTERVAL '30 days', false, v_goal1_id);

  RAISE NOTICE 'Created 3 notifications';

  -- =====================================================
  -- TODO LISTS
  -- =====================================================
  INSERT INTO public.todo_lists (user_id, name, description, archived)
  VALUES 
    (v_user_id, 'Personal Tasks', 'Daily personal tasks and reminders', false),
    (v_user_id, 'Work Projects', 'Work-related tasks and deadlines', false),
    (v_user_id, 'Shopping List', 'Things to buy', false);

  -- Get todo list ID
  SELECT id INTO v_todo_list1_id FROM public.todo_lists 
    WHERE user_id = v_user_id AND name = 'Personal Tasks' LIMIT 1;

  RAISE NOTICE 'Created 3 todo lists';

  -- =====================================================
  -- TODO ITEMS
  -- =====================================================
  INSERT INTO public.todo_items (list_id, user_id, title, description, completed, priority, due_date, created_by)
  VALUES 
    (v_todo_list1_id, v_user_id, 'Pay electricity bill', 'Monthly electricity bill payment', false, 'high', NOW() + INTERVAL '3 days', v_user_id),
    (v_todo_list1_id, v_user_id, 'Call dentist', 'Schedule dental checkup', false, 'medium', NOW() + INTERVAL '7 days', v_user_id),
    (v_todo_list1_id, v_user_id, 'Gym workout', 'Complete 30 min cardio', true, 'low', NOW(), v_user_id);

  RAISE NOTICE 'Created 3 todo items';

  -- =====================================================
  -- SUMMARY
  -- =====================================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SEED DATA CREATED SUCCESSFULLY!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '- 4 Accounts (Bank, Card, Cash, Savings)';
  RAISE NOTICE '- 3 Friends';
  RAISE NOTICE '- 15 Transactions (Income, Expenses, Transfer)';
  RAISE NOTICE '- 3 Loans (Borrowed, Lent, EMI)';
  RAISE NOTICE '- 2 Loan Payments';
  RAISE NOTICE '- 4 Goals (Emergency Fund, Vacation, Laptop, Home)';
  RAISE NOTICE '- 3 Goal Contributions';
  RAISE NOTICE '- 2 Group Expenses';
  RAISE NOTICE '- 4 Investments (Stocks, Crypto, Gold)';
  RAISE NOTICE '- 3 Notifications';
  RAISE NOTICE '- 3 Todo Lists';
  RAISE NOTICE '- 3 Todo Items';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'You can now test your app with real data!';
  RAISE NOTICE '========================================';

END $$;
