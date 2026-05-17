#  Quick Reference - Supabase Setup

##  **Run These 3 Scripts:**

Open [Supabase SQL Editor](https://supabase.com/dashboard/project/mmwrckfqeqjfqciymemh/sql)

### 1 **Create Tables** (Required)
```sql
-- Copy content from: supabase/migrations/001_create_tables.sql
-- Paste in SQL Editor  Run
```

### 2 **Enable Security** (Required)
```sql
-- Copy content from: supabase/migrations/002_enable_rls.sql
-- Paste in SQL Editor  Run
```

### 3 **Add Test Data** (Optional)
```sql
-- First, get your user ID:
SELECT id, email FROM auth.users;

-- Then edit 003_seed_data.sql line 17:
v_user_id UUID := 'YOUR_USER_ID_HERE';

-- Copy content from: supabase/migrations/003_seed_data.sql
-- Paste in SQL Editor  Run
```

---

##  **Your Credentials:**

```bash
Project URL: https://mmwrckfqeqjfqciymemh.supabase.co
Publishable Key: sb_publishable_QA4aNzLgHR9xanXUJaPpew_XGRicYBq
Database: postgres.mmwrckfqeqjfqciymemh
```

---

##  **Verify Setup:**

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- Should see 16 tables:
-- accounts, expense_bills, friends, goal_contributions, 
-- goals, group_expenses, investments, loan_payments, 
-- loans, notifications, profiles, tax_calculations, 
-- todo_items, todo_list_shares, todo_lists, transactions
```

---

##  **Test Connection:**

### In Browser:
1. Open http://localhost:5173
2. Look for "Supabase Connection Test" box
3. Click "Test Connection" button

### In Code:
```typescript
import supabase from '@/utils/supabase/client';

// Fetch accounts
const { data, error } = await supabase
  .from('accounts')
  .select('*');

console.log({ data, error });
```

---

##  **Common Queries:**

### Get your user ID:
```sql
SELECT id, email FROM auth.users;
```

### View data:
```sql
SELECT * FROM accounts;
SELECT * FROM transactions ORDER BY date DESC LIMIT 10;
SELECT * FROM goals;
```

### Check RLS is enabled:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
-- All should have rowsecurity = true
```

---

##  **Reset Everything:**

 **WARNING: Deletes ALL data!**

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

Then re-run migrations 001 and 002.

---

##  **Full Documentation:**

- **Setup Guide**: [supabase/SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md)
- **Database Schema**: [supabase/README.md](README.md)
- **Get User ID**: [supabase/GET_USER_ID.md](GET_USER_ID.md)
- **Frontend Guide**: [SUPABASE_SETUP.md](../SUPABASE_SETUP.md)

---

##  **Troubleshooting:**

| Error | Solution |
|-------|----------|
| "permission denied" | Run 002_enable_rls.sql |
| "relation does not exist" | Run 001_create_tables.sql |
| "user does not exist" | Create user in Auth  Users |
| Can't see data | Make sure you're logged in |

---

##  **Next Steps:**

1.  Run migrations 001 & 002
2.  Create a user (Auth  Users)
3.  Run seed data (optional)
4.  Test connection in app
5.  Start building features!

---

**Dashboard**: https://supabase.com/dashboard/project/mmwrckfqeqjfqciymemh

**Ready to code!** 
