# Supabase Setup Guide

##  What's Been Configured

Your Supabase connection is now properly set up for a **React + Vite** project.

### Files Updated:
1. **`.env`** - Root environment variables
2. **`frontend/.env.local`** - Frontend-specific variables  
3. **`frontend/src/utils/supabase/client.ts`** - Main Supabase client
4. **`frontend/src/app/page.tsx`** - Updated to use React hooks (not Next.js)

### Files Removed:
-  `frontend/src/utils/supabase/server.ts` (Next.js only)
-  `frontend/src/utils/supabase/middleware.ts` (Next.js only)

---

##  Your Supabase Credentials

**Project URL:** https://mmwrckfqeqjfqciymemh.supabase.co

**Public Keys (safe for browser):**
- Publishable Key: `sb_publishable_QA4aNzLgHR9xanXUJaPpew_XGRicYBq`
- Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Secret Keys (server-side only):**
- Service Role Key: `sb_secret_rLtUWQRvgcjFaM5mzR4c0w_bQd6Oywx`
- JWT Secret: `7f8126c6-802e-4430-8905-83a11f8e8de3`

**Database:**
- Host: `aws-1-ap-southeast-2.pooler.supabase.com`
- Database: `postgres`
- User: `postgres.mmwrckfqeqjfqciymemh`
- Password: `PacWTmZyQzS7LOM8`

---

##  How to Use Supabase in Your App

### 1. Import the client:
```typescript
import supabase from '@/utils/supabase/client';
```

### 2. Query data:
```typescript
import { useState, useEffect } from 'react';
import supabase from '@/utils/supabase/client';

function MyComponent() {
  const [data, setData] = useState([]);

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase
        .from('your_table')
        .select('*');
      
      if (error) console.error(error);
      else setData(data);
    }
    
    fetchData();
  }, []);

  return <div>{/* render data */}</div>;
}
```

### 3. Insert data:
```typescript
const { data, error } = await supabase
  .from('your_table')
  .insert({ name: 'John', age: 30 });
```

### 4. Update data:
```typescript
const { data, error } = await supabase
  .from('your_table')
  .update({ age: 31 })
  .eq('name', 'John');
```

### 5. Delete data:
```typescript
const { data, error } = await supabase
  .from('your_table')
  .delete()
  .eq('name', 'John');
```

### 6. Real-time subscriptions:
```typescript
const subscription = supabase
  .channel('your_channel')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'your_table' },
    (payload) => console.log('Change:', payload)
  )
  .subscribe();

// Cleanup
return () => subscription.unsubscribe();
```

---

##  Testing Your Connection

### Option 1: Use the Test Component
Add this to your `App.tsx` temporarily:

```typescript
import SupabaseTest from '@/app/components/SupabaseTest';

function App() {
  return (
    <div>
      <SupabaseTest />
      {/* rest of your app */}
    </div>
  );
}
```

### Option 2: Run in Console
Open your browser console and run:

```javascript
import supabase from './utils/supabase/client';

const { data, error } = await supabase.from('todos').select();
console.log({ data, error });
```

### Option 3: Command Line Test
```bash
npm run dev
# Then open http://localhost:5173 and check console
```

---

##  Next Steps

### 1. **Create Tables in Supabase**
Go to your Supabase dashboard  Table Editor  Create new table

Example SQL:
```sql
CREATE TABLE todos (
  id BIGSERIAL PRIMARY KEY,
  task TEXT NOT NULL,
  is_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (recommended)
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- Create a policy (allow all for testing)
CREATE POLICY "Allow all" ON todos FOR ALL USING (true);
```

### 2. **Set Up Authentication (optional)**
```typescript
// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123'
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

// Sign out
await supabase.auth.signOut();

// Get current user
const { data: { user } } = await supabase.auth.getUser();
```

### 3. **Enable Row Level Security**
Go to Supabase Dashboard  Authentication  Policies
Create policies to secure your data.

---

##  Troubleshooting

### "Cannot read properties of undefined"
-  Make sure `.env` files exist and have the correct prefix (`VITE_`)
-  Restart your dev server after changing `.env` files
-  Check that environment variables are loaded: `console.log(import.meta.env.VITE_SUPABASE_URL)`

### "relation does not exist" error
-  The table hasn't been created yet - go to Supabase Table Editor
-  Check table name spelling (case-sensitive)

### CORS errors
-  Add your domain to Supabase  Settings  API  CORS
-  For local dev, add `http://localhost:5173`

### "Invalid API key"
-  Don't use the publishable key - use the Anon key for client-side
-  Check if you copied the full key (they're long!)

---

##  Resources

- [Supabase Docs](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Your Supabase Dashboard](https://supabase.com/dashboard/project/mmwrckfqeqjfqciymemh)

---

##  Security Notes

 **Never commit these to Git:**
- Service Role Key
- JWT Secret  
- Database password

 **Safe to expose (already configured):**
- Project URL
- Publishable/Anon Key (with RLS enabled)

Add to `.gitignore`:
```
.env
.env.local
.env*.local
```
