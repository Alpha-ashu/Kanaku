-- Quick verification for user_pins migration
-- Run this after 007_add_user_pins_table.sql

-- 1) Confirm table exists
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'user_pins';

-- 2) Confirm expected columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_pins'
ORDER BY ordinal_position;

-- 3) Confirm RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'user_pins';

-- 4) Confirm policies
SELECT policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_pins'
ORDER BY policyname;

-- 5) Confirm trigger
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'user_pins'
ORDER BY trigger_name;
