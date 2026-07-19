-- ============================================================
-- Migration 016: Smart Import & Categorization System
-- ============================================================

-- Main categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('expense', 'income', 'both')),
  icon VARCHAR(50),
  color VARCHAR(20),
  is_system BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subcategories
CREATE TABLE IF NOT EXISTS subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  is_system BOOLEAN DEFAULT TRUE,
  UNIQUE(category_id, name)
);

-- Keyword → category mappings
CREATE TABLE IF NOT EXISTS keyword_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  confidence NUMERIC(4,3) DEFAULT 0.8,
  is_exact BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword)
);

-- Import sessions
CREATE TABLE IF NOT EXISTS import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_filename VARCHAR(255),
  source_type VARCHAR(20) CHECK (source_type IN ('csv','excel','pdf','bank')),
  total_rows INTEGER DEFAULT 0,
  saved_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  column_map JSONB,
  status VARCHAR(20) DEFAULT 'preview' CHECK (status IN ('preview','confirmed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

-- Imported transactions (staging before final save)
CREATE TABLE IF NOT EXISTS imported_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  row_index INTEGER,
  description TEXT,
  amount NUMERIC(15,2),
  transaction_date DATE,
  raw_category VARCHAR(100),
  suggested_category VARCHAR(100),
  suggested_subcategory VARCHAR(100),
  confidence NUMERIC(4,3),
  final_category VARCHAR(100),
  final_subcategory VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','saved','skipped','error')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User categorization learning (corrections improve future suggestions)
CREATE TABLE IF NOT EXISTS categorization_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_text VARCHAR(500) NOT NULL,
  original_category VARCHAR(100),
  corrected_category VARCHAR(100) NOT NULL,
  corrected_subcategory VARCHAR(100),
  applied_count INTEGER DEFAULT 1,
  last_applied TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, input_text)
);

-- Enable RLS
ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorization_learning ENABLE ROW LEVEL SECURITY;

-- Public tables (system data)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_read_all" ON categories FOR SELECT USING (true);
CREATE POLICY "subcategories_read_all" ON subcategories FOR SELECT USING (true);
CREATE POLICY "keyword_mappings_read_all" ON keyword_mappings FOR SELECT USING (true);

CREATE POLICY "import_sessions_user_only" ON import_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "imported_transactions_user_only" ON imported_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "categorization_learning_user_only" ON categorization_learning FOR ALL USING (auth.uid() = user_id);

-- Seed system categories
INSERT INTO categories (name, type, icon, sort_order) VALUES
  ('Food & Dining', 'expense', '🍽️', 1),
  ('Transportation', 'expense', '🚗', 2),
  ('Shopping', 'expense', '🛍️', 3),
  ('Bills & Utilities', 'expense', '💡', 4),
  ('Health & Medical', 'expense', '🏥', 5),
  ('Entertainment', 'expense', '🎬', 6),
  ('Education', 'expense', '📚', 7),
  ('Travel', 'expense', '✈️', 8),
  ('Investment', 'expense', '📈', 9),
  ('Loan Payment', 'expense', '🏦', 10),
  ('Others', 'expense', '📦', 11),
  ('Salary', 'income', '💰', 1),
  ('Business Income', 'income', '💼', 2),
  ('Investment Returns', 'income', '📊', 3),
  ('Freelance', 'income', '💻', 4),
  ('Other Income', 'income', '💵', 5)
ON CONFLICT (name) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_import_sessions_user ON import_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imported_transactions_session ON imported_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_keyword_mappings_keyword ON keyword_mappings(keyword);
CREATE INDEX IF NOT EXISTS idx_categorization_learning_user ON categorization_learning(user_id, input_text);

