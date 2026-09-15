-- Supabase compatibility shim for plain PostgreSQL (CI only — never run in Supabase).
--
-- The RLS migrations (20260719000000, 20260813000000, 20260813120000,
-- 20260912010000) grant to Supabase's built-in roles and call auth.uid(). Those
-- exist in every Supabase project but not in the postgres:16 service container,
-- so replaying the migration history into CI's shadow database failed with
-- `role "authenticated" does not exist`. Idempotent: safe to run repeatedly.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

-- Same signature as Supabase's auth.uid(): the JWT subject, or NULL.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
