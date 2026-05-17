# Supabase Row Level Security (RLS) Setup Guide

This guide explains how to set up RLS policies in Supabase to secure your FinanceLife application.

## Prerequisites

- Supabase project created
- Access to Supabase dashboard at https://app.supabase.com

## Tables to Create and Secure

Based on the application, these tables need RLS policies:

1. **accounts** - User's bank accounts
2. **transactions** - User's transactions  
3. **loans** - User's loan records
4. **goals** - User's saving goals
5. **group_expenses** - Shared group expenses
6. **investments** - User's investments
7. **todo_lists** - User's to-do lists
8. **advisor_assignments** - Advisor-user assignments
9. **chat_messages** - Messages between advisors and users
10. **booking_requests** - Consultation booking requests

## SQL Setup Scripts

### Step 1: Enable RLS on All Tables

Run this SQL in the Supabase SQL Editor:

```sql
-- Enable RLS for all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;
```

### Step 2: Create Auth Policies

```sql
-- ACCOUNTS - Users can only see their own accounts
CREATE POLICY "Users can view own accounts"
  ON accounts FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own accounts"
  ON accounts FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own accounts"
  ON accounts FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own accounts"
  ON accounts FOR DELETE
  USING (auth.uid()::text = user_id);

-- TRANSACTIONS - Users can only see their own transactions
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM accounts 
      WHERE accounts.id = transactions.account_id 
      AND accounts.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can create own transactions"
  ON transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts 
      WHERE accounts.id = transactions.account_id 
      AND accounts.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM accounts 
      WHERE accounts.id = transactions.account_id 
      AND accounts.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM accounts 
      WHERE accounts.id = transactions.account_id 
      AND accounts.user_id = auth.uid()::text
    )
  );

-- LOANS - Users can only see their own loans
CREATE POLICY "Users can view own loans"
  ON loans FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own loans"
  ON loans FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own loans"
  ON loans FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own loans"
  ON loans FOR DELETE
  USING (auth.uid()::text = user_id);

-- GOALS - Users can only see their own goals
CREATE POLICY "Users can view own goals"
  ON goals FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own goals"
  ON goals FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own goals"
  ON goals FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own goals"
  ON goals FOR DELETE
  USING (auth.uid()::text = user_id);

-- INVESTMENTS - Users can only see their own investments
CREATE POLICY "Users can view own investments"
  ON investments FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own investments"
  ON investments FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own investments"
  ON investments FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own investments"
  ON investments FOR DELETE
  USING (auth.uid()::text = user_id);

-- TODO_LISTS - Users can view and edit their own lists
CREATE POLICY "Users can view own todo lists"
  ON todo_lists FOR SELECT
  USING (auth.uid()::text = owner_id);

CREATE POLICY "Users can create todo lists"
  ON todo_lists FOR INSERT
  WITH CHECK (auth.uid()::text = owner_id);

CREATE POLICY "Users can update own todo lists"
  ON todo_lists FOR UPDATE
  USING (auth.uid()::text = owner_id);

CREATE POLICY "Users can delete own todo lists"
  ON todo_lists FOR DELETE
  USING (auth.uid()::text = owner_id);

-- ADVISOR_ASSIGNMENTS - Both advisor and user can view
CREATE POLICY "Advisors can view own assignments"
  ON advisor_assignments FOR SELECT
  USING (
    auth.uid()::text = advisor_id 
    OR auth.uid()::text = user_id
  );

CREATE POLICY "System can create assignments"
  ON advisor_assignments FOR INSERT
  WITH CHECK (true); -- Should be restricted to admin service role

CREATE POLICY "Advisors can update own assignments"
  ON advisor_assignments FOR UPDATE
  USING (auth.uid()::text = advisor_id);

-- CHAT_MESSAGES - Both participants can view messages in their conversation
CREATE POLICY "Users can view chat messages"
  ON chat_messages FOR SELECT
  USING (
    (auth.uid()::text = sender_id) 
    OR 
    (conversation_id LIKE CONCAT(auth.uid()::text, '%') 
     OR conversation_id LIKE CONCAT('%_', auth.uid()::text))
  );

CREATE POLICY "Users can create chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid()::text = sender_id);

CREATE POLICY "Users can update own messages"
  ON chat_messages FOR UPDATE
  USING (auth.uid()::text = sender_id);

-- BOOKING_REQUESTS - Advisor and user can view their booking
CREATE POLICY "Users can view own bookings"
  ON booking_requests FOR SELECT
  USING (
    auth.uid()::text = user_id 
    OR auth.uid()::text = advisor_id
  );

CREATE POLICY "Users can create booking requests"
  ON booking_requests FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Advisors can update booking status"
  ON booking_requests FOR UPDATE
  USING (auth.uid()::text = advisor_id);
```

### Step 3: Create GROUP_EXPENSES Policies (handles shared access)

```sql
-- GROUP_EXPENSES - Shared access for group members
-- Store member IDs as array or JSON
CREATE POLICY "Group members can view group expenses"
  ON group_expenses FOR SELECT
  USING (
    member_ids @> auth.uid()::text::jsonb 
    OR auth.uid()::text = created_by
  );

CREATE POLICY "Users can create group expenses"
  ON group_expenses FOR INSERT
  WITH CHECK (auth.uid()::text = created_by);

CREATE POLICY "Group members can update"
  ON group_expenses FOR UPDATE
  USING (
    member_ids @> auth.uid()::text::jsonb 
    OR auth.uid()::text = created_by
  );

CREATE POLICY "Group creator can delete"
  ON group_expenses FOR DELETE
  USING (auth.uid()::text = created_by);
```

## Implementation Steps in Supabase Dashboard

1. **Go to Authentication > Policies** in Supabase Dashboard
2. Select each table and create the policies above
3. Test policies in the SQL Editor
4. Verify in the Data editor that policies work correctly

## Testing RLS Policies

### Using Supabase SQL Editor

```sql
-- Test as authenticated user
SET request.jwt.claims = '{"sub": "<user-id>", "role":"authenticated"}';

SELECT * FROM accounts;
-- Should return only user's accounts
```

### In Your Application

RLS will be automatically applied when you:
- Use Supabase client with authenticated session
- Make queries via your frontend
- Policies will block unauthorized access

## Important Notes

 **Service Role Key**: When using the service role key on the backend, RLS policies are bypassed. Only use this for admin operations.

 **Testing**: Always test policies with different users to ensure security.

 **Performance**: Add indexes to user_id columns for better performance:

```sql
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_investments_user_id ON investments(user_id);
CREATE INDEX idx_todo_lists_owner_id ON todo_lists(owner_id);
CREATE INDEX idx_advisor_assignments_advisor_id ON advisor_assignments(advisor_id);
CREATE INDEX idx_advisor_assignments_user_id ON advisor_assignments(user_id);
CREATE INDEX idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX idx_booking_requests_advisor_id ON booking_requests(advisor_id);
CREATE INDEX idx_booking_requests_user_id ON booking_requests(user_id);
```

## Troubleshooting

**Issue**: Getting "permission denied" errors
**Solution**: Check that auth.uid() matches the user_id column. Ensure user is authenticated.

**Issue**: Admin operations failing
**Solution**: Use Supabase client initialized with service role key for admin operations.

**Issue**: Shared data (groups) not accessible to all members
**Solution**: Use JSON/array operations to check membership like `member_ids @> auth.uid()::text::jsonb`

## Next Steps

1. Set up these policies in your Supabase project
2. Test extensively with different user roles
3. Monitor performance with indexes
4. Update frontend to handle permission errors gracefully
5. Add audit logging for sensitive operations
