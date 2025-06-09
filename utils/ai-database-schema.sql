-- AI Assistant Database Schema for Provider Dashboard
-- Revenue protection and usage tracking

-- AI Usage Tracking Table
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id SERIAL PRIMARY KEY,
    provider_id UUID NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'essential',
    query_length INTEGER NOT NULL,
    response_type VARCHAR(50) NOT NULL,
    session_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_provider_month (provider_id, created_at),
    INDEX idx_tier_usage (tier, created_at)
);

-- AI Chat Sessions Table
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    tier VARCHAR(20) NOT NULL,
    total_tokens_used INTEGER DEFAULT 0
);

-- AI Crisis Events Log (Compliance & Emergency Tracking)
CREATE TABLE IF NOT EXISTS ai_crisis_events (
    id SERIAL PRIMARY KEY,
    provider_id UUID NOT NULL,
    patient_id UUID,
    crisis_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    severity_level VARCHAR(20) NOT NULL,
    actions_taken TEXT[],
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_crisis_provider (provider_id, created_at),
    INDEX idx_crisis_severity (severity_level, created_at)
);

-- Provider Subscription Tiers (Enhanced with AI features)
CREATE TABLE IF NOT EXISTS provider_subscriptions (
    id SERIAL PRIMARY KEY,
    provider_id UUID UNIQUE NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'essential',
    ai_queries_used_month INTEGER DEFAULT 0,
    ai_features_enabled TEXT[] DEFAULT ARRAY['basic_navigation', 'simple_explanations'],
    subscription_start DATE NOT NULL,
    subscription_end DATE,
    auto_renew BOOLEAN DEFAULT TRUE,
    monthly_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Feature Usage Analytics
CREATE TABLE IF NOT EXISTS ai_feature_analytics (
    id SERIAL PRIMARY KEY,
    provider_id UUID NOT NULL,
    feature_name VARCHAR(50) NOT NULL,
    usage_count INTEGER DEFAULT 1,
    success_rate DECIMAL(5,2) DEFAULT 0.0,
    avg_response_time_ms INTEGER DEFAULT 0,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    month_year VARCHAR(7) NOT NULL, -- YYYY-MM format
    UNIQUE(provider_id, feature_name, month_year)
);

-- Revenue Protection: Anonymized Analytics Access Log
CREATE TABLE IF NOT EXISTS analytics_access_log (
    id SERIAL PRIMARY KEY,
    provider_id UUID NOT NULL,
    tier VARCHAR(20) NOT NULL,
    analytics_type VARCHAR(50) NOT NULL,
    depth_level VARCHAR(20) NOT NULL, -- surface, intermediate, full
    data_points_accessed INTEGER DEFAULT 0,
    revenue_value DECIMAL(10,2) DEFAULT 0.0, -- Estimated value of data accessed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_revenue_tracking (tier, analytics_type, created_at)
);

-- AI Assistant Performance Metrics
CREATE TABLE IF NOT EXISTS ai_performance_metrics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    tier VARCHAR(20) NOT NULL,
    total_queries INTEGER DEFAULT 0,
    successful_responses INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER DEFAULT 0,
    upgrade_prompts_shown INTEGER DEFAULT 0,
    conversions_to_higher_tier INTEGER DEFAULT 0,
    revenue_generated DECIMAL(12,2) DEFAULT 0.0,
    PRIMARY KEY (date, tier)
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_month 
ON ai_usage_log(provider_id, date_trunc('month', created_at));

CREATE INDEX IF NOT EXISTS idx_subscription_tier_active 
ON provider_subscriptions(tier) WHERE subscription_end IS NULL OR subscription_end > CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_crisis_events_recent 
ON ai_crisis_events(created_at DESC) WHERE created_at > CURRENT_DATE - INTERVAL '30 days';

-- Functions for Usage Limits and Billing
CREATE OR REPLACE FUNCTION check_ai_query_limit(p_provider_id UUID, p_tier VARCHAR(20))
RETURNS BOOLEAN AS $$
DECLARE
    current_usage INTEGER;
    tier_limit INTEGER;
BEGIN
    -- Get current month usage
    SELECT COUNT(*) INTO current_usage
    FROM ai_usage_log 
    WHERE provider_id = p_provider_id 
    AND created_at >= date_trunc('month', CURRENT_DATE);
    
    -- Get tier limit
    tier_limit := CASE p_tier
        WHEN 'essential' THEN 50
        WHEN 'professional' THEN 200
        WHEN 'enterprise' THEN 1000
        ELSE 10 -- Default minimal limit
    END;
    
    RETURN current_usage < tier_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate revenue protection value
CREATE OR REPLACE FUNCTION calculate_analytics_value(p_analytics_type VARCHAR(50), p_depth VARCHAR(20))
RETURNS DECIMAL(10,2) AS $$
BEGIN
    RETURN CASE 
        WHEN p_depth = 'full' AND p_analytics_type = 'correlation_analysis' THEN 50.00
        WHEN p_depth = 'full' AND p_analytics_type = 'predictive_insights' THEN 75.00
        WHEN p_depth = 'intermediate' THEN 15.00
        WHEN p_depth = 'surface' THEN 2.00
        ELSE 0.00
    END;
END;
$$ LANGUAGE plpgsql;