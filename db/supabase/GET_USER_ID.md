# Getting Your User ID for Seed Data

After running the table and RLS migrations, you need your user ID to add sample data.

##  **Method 1: Supabase Dashboard (Easiest)**

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/mmwrckfqeqjfqciymemh
2. Click **Authentication**  **Users** in the left sidebar
3. If no users exist, click **"Add user"**  **"Create new user"**
4. Fill in:
   - **Email**: your-email@example.com
   - **Password**: YourPassword123!
   - **Auto Confirm User**:  Check this box
5. Click "Create user"
6. Copy the **User UID** (it looks like: `a1b2c3d4-1234-5678-abcd-1234567890ab`)

---

##  **Method 2: SQL Query**

1. Go to **SQL Editor** in Supabase Dashboard
2. Run this query:

```sql
-- View all users
SELECT id, email, created_at 
FROM auth.users;
```

3. Copy the `id` from the results

---

##  **Method 3: Sign Up in Your App**

1. Make sure your dev server is running: `npm run dev`
2. Open http://localhost:5173
3. Sign up with email/password in your app
4. Then go to SQL Editor and run:

```sql
SELECT id, email FROM auth.users;
```

5. Copy your user ID

---

##  **Use Your User ID**

1. Open [`supabase/migrations/003_seed_data.sql`](migrations/003_seed_data.sql)
2. Find line 17: 
   ```sql
   v_user_id UUID := 'YOUR_USER_ID_HERE';
   ```
3. Replace `'YOUR_USER_ID_HERE'` with your actual user ID:
   ```sql
   v_user_id UUID := 'a1b2c3d4-1234-5678-abcd-1234567890ab';
   ```
4. Save the file
5. Run it in **SQL Editor**

---

##  **Expected Output**

After running the seed data script, you should see:

```
NOTICE:  Creating sample data for user: a1b2c3d4-1234-5678-abcd-1234567890ab
NOTICE:  Created 4 accounts
NOTICE:  Created 3 friends
NOTICE:  Created 15 transactions
NOTICE:  Created 3 loans
...
NOTICE:  SEED DATA CREATED SUCCESSFULLY!
```

---

##  **Test Your Data**

Go to **Table Editor** and check:

- **accounts** table should have 4 records
- **transactions** table should have 15 records
- **loans** table should have 3 records
- **goals** table should have 4 records
- All records should have your `user_id`

---

##  **Troubleshooting**

### **Error: "User ID ... does not exist"**
 You haven't created a user yet. Use Method 1 or 3 above.

### **Error: "invalid input syntax for type uuid"**
 Make sure you copied the full UUID (36 characters with dashes)

### **No data appears in app**
 Make sure you're logged in with the same user whose ID you used in the seed data

---

**Ready to test with real data!** 
