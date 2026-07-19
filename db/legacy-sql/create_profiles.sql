CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  avatar_id TEXT,
  phone TEXT,
  gender TEXT,
  date_of_birth TIMESTAMPTZ,
  monthly_income DECIMAL(15, 2),
  annual_income DECIMAL(15, 2),
  job_type TEXT,
  country TEXT,
  state TEXT,
  city TEXT,
  currency TEXT DEFAULT 'USD',
  language TEXT DEFAULT 'en',
  pin_code TEXT,
  visible_features JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
