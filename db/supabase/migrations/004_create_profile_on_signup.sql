-- =====================================================
-- Auto-create Profile on User Registration
-- =====================================================
-- This trigger automatically creates a profile entry
-- when a new user signs up via Supabase Auth.
-- 
-- NO MOCK DATA is created here - only the profile record.
-- =====================================================

-- Create a function to handle user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NOW(), NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup (only create if doesn't exist)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- Summary
-- =====================================================
-- This trigger ensures:
-- ✅ Profile is automatically created when user signs up
-- ✅ NO mock data is created (accounts, transactions, etc.)
-- ✅ Each new user gets a clean, empty app
-- ✅ Optional seed data can be added manually via 003_seed_data.sql
-- =====================================================
