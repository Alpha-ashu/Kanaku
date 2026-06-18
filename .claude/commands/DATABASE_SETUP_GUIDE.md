# Database Setup & Data Management Guide

## Overview
Your Expense Tracker database is designed with clean separation between **production data** and **development/testing data**.

---

##  Migration Files (Execution Order)

### 1 `001_create_tables.sql` - Schema Creation
- Creates all 16 database tables
- Sets up relationships and constraints
- **Run this FIRST in Supabase SQL Editor**

### 2 `002_enable_rls.sql` - Security Policies
- Enables Row Level Security (RLS) on all tables
- Ensures users can only access their own data
- **Run this SECOND after tables are created**

### 3 `004_create_profile_on_signup.sql` - Auto Profile Creation
- Creates trigger to auto-generate user profile on signup
- **Run this THIRD** (actually before seed data)
- Ensures new users get empty, clean state with no mock data

### 4 `003_seed_data.sql` - Development Data (Optional)
- **FOR DEVELOPMENT/TESTING ONLY**
- Adds 50+ sample records across all tables
- **Run this LAST and ONLY when needed for testing**
- **NOT automatically run for new users**

---

##  New User Registration Flow

When a new user signs up:

```
User Signs Up  Auth System Creates User Record
                        
                Auto-trigger fires (handle_new_user)
                        
                Profile table gets ONE entry
                (email, full_name, created_at)
                        
                 Clean, Empty App Ready
      (NO mock accounts, transactions, etc.)
```

**Result:** User sees empty Dashboard with "No data yet" message

---

##  Development/Testing Setup

### If you want to TEST with sample data:

1. **Sign up in your app** (or use existing user ID)
2. **Get your User ID:**
   ```sql
   SELECT id, email FROM auth.users;
   ```
3. **Open** [003_seed_data.sql](./003_seed_data.sql)
4. **Replace the user ID** on line 23:
   ```sql
   v_user_id UUID := 'YOUR-ACTUAL-USER-ID-HERE';
   ```
5. **Run in Supabase SQL Editor**

### Safety Features:
-  **Idempotency Check:** Prevents duplicate data if script is run twice
-  **User Verification:** Exits if user doesn't exist
-  **Clear Error Messages:** Tells you if data already exists

### Example Error Prevention:
```
First Run:   SUCCESS - 50+ records created
Second Run:  ERROR - "Seed data already exists for this user"
             Delete existing data first or use different user
```

---

##  Cleaning Up Test Data

To remove test data and start fresh:

```sql
-- Connect as user and delete their data
DELETE FROM public.expense_bills WHERE user_id = 'USER_ID';
DELETE FROM public.todo_items WHERE user_id = 'USER_ID';
DELETE FROM public.todo_lists WHERE user_id = 'USER_ID';
DELETE FROM public.notifications WHERE user_id = 'USER_ID';
DELETE FROM public.investments WHERE user_id = 'USER_ID';
DELETE FROM public.goal_contributions WHERE user_id = 'USER_ID';
DELETE FROM public.goals WHERE user_id = 'USER_ID';
DELETE FROM public.loan_payments WHERE user_id = 'USER_ID';
DELETE FROM public.loans WHERE user_id = 'USER_ID';
DELETE FROM public.transactions WHERE user_id = 'USER_ID';
DELETE FROM public.friends WHERE user_id = 'USER_ID';
DELETE FROM public.accounts WHERE user_id = 'USER_ID';
DELETE FROM public.group_expenses WHERE user_id = 'USER_ID';

-- Then run seed data again if needed
```

---

##  Data Isolation with RLS

Each user's data is isolated at the database level using Row Level Security:

-  Users can ONLY see their own records
-  Users can ONLY create/edit/delete their own data
-  No user can access another user's financial data
-  Even admin cannot bypass RLS in the app

**Example:**
```sql
-- User A tries to see User B's transactions
-- RLS automatically filters to return 0 rows
SELECT * FROM transactions WHERE user_id = 'user-b-id';
-- Result: [] (empty - even though data exists)
```

---

##  Production Checklist

- [ ] 1. Run `001_create_tables.sql`
- [ ] 2. Run `002_enable_rls.sql`
- [ ] 3. Run `004_create_profile_on_signup.sql`
- [ ] 4.  DO NOT run `003_seed_data.sql` in production
- [ ] 5. Test user signup - should be clean with no mock data
- [ ] 6. Verify RLS policies are enabled
- [ ] 7. Test that users see only their own data

---

##  Development Checklist

- [ ] 1-3. Run all three main migrations
- [ ] 4. Sign up as test user
- [ ] 5. Get user ID from Settings
- [ ] 6. Update and run `003_seed_data.sql`
- [ ] 7. Refresh app - should see 50+ test records
- [ ] 8. Build features against real-looking data
- [ ] 9. Create cleanup script when done

---

##  No Automatic Duplicates

The system is designed to prevent duplicates:

| Scenario | Before | After |
|----------|--------|-------|
| User signs up | No data | Profile only (no mock data) |
| Run seed once | Empty app | 50+ test records |
| Run seed again | Test data exists |  Error + no duplicates |
| Delete user | All data gone | Ready for new setup |

---

##  Notes

- Seed script is **idempotent** - safe to run ONCE per user
- **Never** run seed script on production accounts
- New users get **completely clean** database state
- Mock data only created when **explicitly requested** via 003_seed_data.sql
- All user data is isolated and secure with RLS

---

##  Troubleshooting

**Q: New user signs up but sees old test data?**
A: Check if RLS policies didn't apply. Run `002_enable_rls.sql` again.

**Q: Seed data fails with "already exists" error?**
A: This is correct behavior. Delete existing records first (see cleanup script above).

**Q: Production user got mock data?**
A: This shouldn't happen. 003_seed_data.sql is manually run only. Verify migrations were correct.

**Q: How to verify no duplicates?**
A: Run: `SELECT COUNT(*) FROM accounts WHERE user_id = 'YOUR_ID';`
Should return the exact number of accounts you created once.

---

**Last Updated:** February 6, 2026
**Version:** 1.0
