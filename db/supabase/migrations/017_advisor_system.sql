-- ============================================================
-- Migration 017: Advisor & Consultation System
-- ============================================================

-- Advisor profiles (additional metadata beyond users table)
CREATE TABLE IF NOT EXISTS advisor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  bio TEXT,
  specializations TEXT[] DEFAULT '{}',
  fee_per_session NUMERIC(12,2) DEFAULT 0,
  fee_currency VARCHAR(5) DEFAULT 'INR',
  experience_years INTEGER DEFAULT 0,
  languages TEXT[] DEFAULT '{"English"}',
  certifications TEXT[] DEFAULT '{}',
  linkedin_url VARCHAR(500),
  is_featured BOOLEAN DEFAULT FALSE,
  total_sessions INTEGER DEFAULT 0,
  average_rating NUMERIC(3,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Advisor-client relationships
CREATE TABLE IF NOT EXISTS advisor_client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'ended')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  UNIQUE(advisor_id, client_id)
);

-- Session notes by advisor
CREATE TABLE IF NOT EXISTS advisor_session_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(200),
  notes TEXT NOT NULL,
  action_items TEXT[] DEFAULT '{}',
  next_session_date DATE,
  is_private BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Advisor fee transactions
CREATE TABLE IF NOT EXISTS advisor_fee_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(200),
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(5) DEFAULT 'INR',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','disputed')),
  payment_method VARCHAR(50),
  payment_reference VARCHAR(200),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Advisor payout requests
CREATE TABLE IF NOT EXISTS advisor_payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(5) DEFAULT 'INR',
  bank_account_last4 VARCHAR(4),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  notes TEXT
);

-- Enable RLS
ALTER TABLE advisor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_fee_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_payout_requests ENABLE ROW LEVEL SECURITY;

-- Advisor profiles: advisors manage their own, clients can read approved
CREATE POLICY "advisor_profiles_read" ON advisor_profiles FOR SELECT USING (true);
CREATE POLICY "advisor_profiles_write" ON advisor_profiles FOR ALL USING (auth.uid() = user_id);

-- Assignments: advisor and client can see their own
CREATE POLICY "assignments_advisor" ON advisor_client_assignments FOR ALL USING (auth.uid() = advisor_id OR auth.uid() = client_id);

-- Notes: advisor-only
CREATE POLICY "session_notes_advisor" ON advisor_session_notes FOR ALL USING (auth.uid() = advisor_id);

-- Fee transactions: both parties
CREATE POLICY "fee_transactions_parties" ON advisor_fee_transactions FOR ALL USING (auth.uid() = advisor_id OR auth.uid() = client_id);

-- Payout: advisor-only
CREATE POLICY "payout_advisor" ON advisor_payout_requests FOR ALL USING (auth.uid() = advisor_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_advisor_profiles_user ON advisor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_advisor ON advisor_client_assignments(advisor_id);
CREATE INDEX IF NOT EXISTS idx_assignments_client ON advisor_client_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_fee_transactions_advisor ON advisor_fee_transactions(advisor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_advisor ON advisor_payout_requests(advisor_id, requested_at DESC);

