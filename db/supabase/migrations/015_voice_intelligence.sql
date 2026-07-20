-- ============================================================
-- Migration 015: Voice Intelligence System
-- ============================================================

-- Voice memos (stores audio metadata, not audio itself)
CREATE TABLE IF NOT EXISTS voice_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  duration_seconds INTEGER,
  language VARCHAR(10) DEFAULT 'en',
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voice transcripts (processed text from speech)
CREATE TABLE IF NOT EXISTS voice_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memo_id UUID REFERENCES voice_memos(id) ON DELETE SET NULL,
  original_text TEXT NOT NULL,
  cleaned_text TEXT,
  actions_count INTEGER DEFAULT 0,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Financial actions extracted from voice
CREATE TABLE IF NOT EXISTS financial_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript_id UUID REFERENCES voice_transcripts(id) ON DELETE SET NULL,
  action_type VARCHAR(30) NOT NULL CHECK (action_type IN ('expense','income','transfer','loan_borrow','loan_lend','goal','investment','unknown')),
  raw_segment TEXT,
  amount NUMERIC(15,2),
  category VARCHAR(100),
  subcategory VARCHAR(100),
  person_name VARCHAR(200),
  merchant VARCHAR(200),
  description TEXT,
  transaction_date DATE,
  payment_method VARCHAR(50),
  confidence NUMERIC(4,3) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','edited')),
  saved_to_module VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User voice behavior learning
CREATE TABLE IF NOT EXISTS user_voice_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  corrected_type VARCHAR(30),
  corrected_category VARCHAR(100),
  corrected_amount NUMERIC(15,2),
  applied_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, original_text)
);

-- Enable RLS
ALTER TABLE voice_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_voice_learning ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "voice_memos_user_only" ON voice_memos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "voice_transcripts_user_only" ON voice_transcripts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "financial_actions_user_only" ON financial_actions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "user_voice_learning_user_only" ON user_voice_learning FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_voice_transcripts_user ON voice_transcripts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_actions_user ON financial_actions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_voice_learning_user ON user_voice_learning(user_id);

