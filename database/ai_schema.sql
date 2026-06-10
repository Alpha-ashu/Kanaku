-- 🔐 PRIVACY-FIRST AI DATABASE SCHEMA
-- Admin-only visibility, never exposed to users

-- AI Raw Input Data (Privacy-first, encrypted storage)
CREATE TABLE IF NOT EXISTS ai_raw_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "User"(id),
    input_type VARCHAR(20) NOT NULL CHECK (input_type IN ('ocr', 'voice', 'manual')),
    raw_input TEXT NOT NULL, -- Encrypted at rest
    processed_data JSONB, -- Encrypted at rest
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    source_device VARCHAR(100),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days'),
    
    -- Privacy constraints
    CONSTRAINT ai_raw_data_retention CHECK (expires_at > created_at)
);

-- AI Predictions (Learning system data)
CREATE TABLE IF NOT EXISTS ai_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "User"(id),
    prediction_type VARCHAR(20) NOT NULL CHECK (prediction_type IN ('category', 'merchant', 'amount', 'date')),
    input_hash VARCHAR(64) NOT NULL, -- Hash of input for deduplication
    prediction JSONB NOT NULL, -- {category: "Food", confidence: 0.85}
    actual_result JSONB, -- What user actually chose
    feedback VARCHAR(20) CHECK (feedback IN ('correct', 'incorrect', 'neutral', 'pending')),
    feedback_timestamp TIMESTAMP WITH TIME ZONE,
    model_version VARCHAR(20) DEFAULT 'KANAKU-v1.0',
    confidence_score DECIMAL(3,2),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Privacy constraints
    CONSTRAINT ai_predictions_feedback_check CHECK (
        feedback IS NULL OR 
        feedback_timestamp IS NOT NULL
    )
);

-- AI Learning Patterns (Aggregated, anonymized insights)
CREATE TABLE IF NOT EXISTS ai_learning_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "User"(id),
    pattern_type VARCHAR(20) NOT NULL CHECK (pattern_type IN ('merchant_category', 'voice_pattern', 'ocr_pattern')),
    pattern_key VARCHAR(255) NOT NULL, -- e.g., "dominos", "spent 500 rupees"
    pattern_value JSONB NOT NULL, -- e.g., {"category": "Food & Dining", "confidence": 0.92}
    occurrence_count INTEGER DEFAULT 1,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    confidence_score DECIMAL(3,2) DEFAULT 0.5,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT ai_learning_patterns_counts CHECK (
        occurrence_count >= success_count + failure_count
    ),
    CONSTRAINT ai_learning_patterns_confidence CHECK (
        confidence_score >= 0 AND confidence_score <= 1
    )
);

-- AI Model Performance Metrics (Admin analytics)
CREATE TABLE IF NOT EXISTS ai_model_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(50) NOT NULL,
    model_version VARCHAR(20) NOT NULL,
    metric_type VARCHAR(30) NOT NULL, -- 'accuracy', 'processing_time', 'confidence', 'usage'
    metric_value DECIMAL(10,2) NOT NULL,
    metric_unit VARCHAR(20), -- 'ms', 'percentage', 'count'
    sample_size INTEGER, -- Number of data points
    date_bucket DATE NOT NULL, -- Daily aggregation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT ai_model_metrics_positive CHECK (metric_value >= 0),
    CONSTRAINT ai_model_metrics_bucket CHECK (date_bucket <= CURRENT_DATE)
);

-- AI Feedback Loop (User corrections)
CREATE TABLE IF NOT EXISTS ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "User"(id),
    prediction_id UUID REFERENCES ai_predictions(id),
    original_prediction JSONB NOT NULL,
    corrected_data JSONB NOT NULL,
    feedback_type VARCHAR(20) NOT NULL CHECK (feedback_type IN ('category', 'merchant', 'amount', 'date')),
    feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Privacy constraints
    CONSTRAINT ai_feedback_rating_check CHECK (
        feedback_rating IS NOT NULL
    )
);

-- AI Usage Statistics (Aggregated, anonymized)
CREATE TABLE IF NOT EXISTS ai_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_bucket DATE NOT NULL,
    input_type VARCHAR(20) NOT NULL CHECK (input_type IN ('ocr', 'voice', 'manual')),
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    avg_processing_time_ms DECIMAL(10,2),
    avg_confidence_score DECIMAL(3,2),
    unique_users INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT ai_usage_stats_totals CHECK (
        total_requests >= successful_requests + failed_requests
    )
);

-- 🔒 SECURITY INDEXES (Admin-only access)
CREATE INDEX IF NOT EXISTS idx_ai_raw_data_user_id ON ai_raw_data(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_raw_data_created_at ON ai_raw_data(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_raw_data_expires_at ON ai_raw_data(expires_at);

CREATE INDEX IF NOT EXISTS idx_ai_predictions_user_id ON ai_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_type ON ai_predictions(prediction_type);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_feedback ON ai_predictions(feedback);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_created_at ON ai_predictions(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_user_id ON ai_learning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_type ON ai_learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_key ON ai_learning_patterns(pattern_key);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_confidence ON ai_learning_patterns(confidence_score);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_user_id ON ai_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_prediction_id ON ai_feedback(prediction_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_type ON ai_feedback(feedback_type);

CREATE INDEX IF NOT EXISTS idx_ai_usage_stats_date ON ai_usage_stats(date_bucket);
CREATE INDEX IF NOT EXISTS idx_ai_usage_stats_type ON ai_usage_stats(input_type);

-- 🔐 ROW LEVEL SECURITY (RLS) - Admin-only access
ALTER TABLE ai_raw_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_learning_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_stats ENABLE ROW LEVEL SECURITY;

-- Only admins can access AI data
CREATE POLICY ai_admin_only ON ai_raw_data
    FOR ALL TO authenticated_users
    USING (EXISTS (
        SELECT 1 FROM "User" u 
        WHERE u.id = current_user_id() 
        AND u.role IN ('admin')
    ));

CREATE POLICY ai_admin_only ON ai_predictions
    FOR ALL TO authenticated_users
    USING (EXISTS (
        SELECT 1 FROM "User" u 
        WHERE u.id = current_user_id() 
        AND u.role IN ('admin')
    ));

CREATE POLICY ai_admin_only ON ai_learning_patterns
    FOR ALL TO authenticated_users
    USING (EXISTS (
        SELECT 1 FROM "User" u 
        WHERE u.id = current_user_id() 
        AND u.role IN ('admin')
    ));

CREATE POLICY ai_admin_only ON ai_feedback
    FOR ALL TO authenticated_users
    USING (EXISTS (
        SELECT 1 FROM "User" u 
        WHERE u.id = current_user_id() 
        AND u.role IN ('admin')
    ));

CREATE POLICY ai_admin_only ON ai_usage_stats
    FOR ALL TO authenticated_users
    USING (EXISTS (
        SELECT 1 FROM "User" u 
        WHERE u.id = current_user_id() 
        AND u.role IN ('admin')
    ));

-- 🗑️ AUTOMATIC CLEANUP FUNCTIONS
CREATE OR REPLACE FUNCTION cleanup_expired_ai_data()
RETURNS void AS $$
BEGIN
    -- Delete expired raw data (90-day retention)
    DELETE FROM ai_raw_data 
    WHERE expires_at < CURRENT_TIMESTAMP;
    
    -- Archive old predictions (keep 1 year for learning)
    DELETE FROM ai_predictions 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 year';
    
    -- Clean up very old feedback (2 years)
    DELETE FROM ai_feedback 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '2 years';
    
    RAISE NOTICE 'AI data cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- 📊 AGGREGATION FUNCTIONS FOR ADMIN DASHBOARD
CREATE OR REPLACE FUNCTION update_ai_usage_stats()
RETURNS void AS $$
BEGIN
    INSERT INTO ai_usage_stats (
        date_bucket,
        input_type,
        total_requests,
        successful_requests,
        failed_requests,
        avg_processing_time_ms,
        avg_confidence_score,
        unique_users
    )
    SELECT 
        CURRENT_DATE - INTERVAL '1 day' as date_bucket,
        input_type,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE confidence_score > 0.5) as successful_requests,
        COUNT(*) FILTER (WHERE confidence_score <= 0.5) as failed_requests,
        AVG(processing_time_ms) as avg_processing_time_ms,
        AVG(confidence_score) as avg_confidence_score,
        COUNT(DISTINCT user_id) as unique_users
    FROM ai_raw_data
    WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
        AND created_at < CURRENT_DATE
    GROUP BY input_type
    ON CONFLICT (date_bucket, input_type) 
    DO UPDATE SET
        total_requests = EXCLUDED.total_requests,
        successful_requests = EXCLUDED.successful_requests,
        failed_requests = EXCLUDED.failed_requests,
        avg_processing_time_ms = EXCLUDED.avg_processing_time_ms,
        avg_confidence_score = EXCLUDED.avg_confidence_score,
        unique_users = EXCLUDED.unique_users,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- 🕐 SCHEDULED CLEANUP (Requires pg_cron extension)
-- SELECT cron.schedule('cleanup-ai-data', '0 2 * * *', 'SELECT cleanup_expired_ai_data();');
-- SELECT cron.schedule('update-ai-stats', '0 1 * * *', 'SELECT update_ai_usage_stats();');

-- 🔐 ENCRYPTION NOTES
-- 1. Use pgcrypto extension for column-level encryption
-- 2. Encrypt sensitive fields before storage
-- 3. Use application-level encryption for additional security

-- Example encryption with pgcrypto:
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- INSERT INTO ai_raw_data (user_id, raw_input, processed_data)
-- VALUES (
--     user_uuid,
--     pgp_sym_encrypt(raw_text, encryption_key),
--     pgp_sym_encrypt(json_data::text, encryption_key)
-- );

COMMENT ON TABLE ai_raw_data IS 'Privacy-first AI raw data - admin only, 90-day retention';
COMMENT ON TABLE ai_predictions IS 'AI predictions and learning data - admin only';
COMMENT ON TABLE ai_learning_patterns IS 'Learned patterns for personalization - admin only';
COMMENT ON TABLE ai_feedback IS 'User feedback for AI improvement - admin only';
COMMENT ON TABLE ai_usage_stats IS 'Aggregated usage statistics - admin only';
