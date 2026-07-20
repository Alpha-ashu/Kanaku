-- ============================================================
-- Migration 018: AI Agents & Insights System
-- ============================================================

-- AI agent events log
CREATE TABLE IF NOT EXISTS ai_agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name VARCHAR(100) NOT NULL,
  trigger_type VARCHAR(30) DEFAULT 'scheduled' CHECK (trigger_type IN ('scheduled','on_demand','event')),
  input_summary TEXT,
  output_summary TEXT,
  execution_ms INTEGER,
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('running','completed','failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI recommendations
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('budget_alert','goal_suggestion','investment_tip','bill_reminder','savings_opportunity','spending_insight','health_tip')),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  action_label VARCHAR(100),
  action_data JSONB,
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Financial health scores (computed daily)
CREATE TABLE IF NOT EXISTS financial_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  savings_rate_score INTEGER DEFAULT 0,
  debt_ratio_score INTEGER DEFAULT 0,
  goal_progress_score INTEGER DEFAULT 0,
  spending_consistency_score INTEGER DEFAULT 0,
  emergency_fund_score INTEGER DEFAULT 0,
  breakdown JSONB,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, DATE(computed_at))
);

-- Fraud flags
CREATE TABLE IF NOT EXISTS fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id VARCHAR(200),
  reason VARCHAR(100) NOT NULL CHECK (reason IN ('unusual_amount','unusual_time','new_merchant_large','rapid_transactions','location_anomaly')),
  severity VARCHAR(20) DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  amount NUMERIC(15,2),
  merchant VARCHAR(200),
  details JSONB,
  is_reviewed BOOLEAN DEFAULT FALSE,
  is_confirmed_fraud BOOLEAN,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bill predictions
CREATE TABLE IF NOT EXISTS bill_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  predicted_amount NUMERIC(15,2),
  amount_variance NUMERIC(15,2),
  predicted_date DATE NOT NULL,
  confidence NUMERIC(4,3),
  is_recurring BOOLEAN DEFAULT TRUE,
  recurrence_pattern VARCHAR(50) CHECK (recurrence_pattern IN ('monthly','weekly','quarterly','annual','irregular')),
  last_seen_date DATE,
  is_notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, merchant, predicted_date)
);

-- Spending patterns
CREATE TABLE IF NOT EXISTS spending_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  category VARCHAR(100) NOT NULL,
  total_amount NUMERIC(15,2),
  transaction_count INTEGER,
  avg_amount NUMERIC(15,2),
  peak_day_of_week INTEGER,
  top_merchant VARCHAR(200),
  vs_previous_period NUMERIC(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, period_start)
);

-- Enable RLS
ALTER TABLE ai_agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE spending_patterns ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "ai_events_user" ON ai_agent_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "ai_recommendations_user" ON ai_recommendations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "financial_health_user" ON financial_health_scores FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "fraud_flags_user" ON fraud_flags FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bill_predictions_user" ON bill_predictions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "spending_patterns_user" ON spending_patterns FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_user_unread ON ai_recommendations(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_scores_user ON financial_health_scores(user_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON fraud_flags(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_predictions_user ON bill_predictions(user_id, predicted_date);
CREATE INDEX IF NOT EXISTS idx_spending_patterns_user ON spending_patterns(user_id, period_start DESC);

