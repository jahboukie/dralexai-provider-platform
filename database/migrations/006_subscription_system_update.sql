-- ============================================================================
-- Dr. Alex AI Subscription System Update
-- Aligns with https://www.dralexai.com/ pricing structure
-- ============================================================================

-- Update provider_subscriptions table to match new tiers
ALTER TABLE provider_subscriptions
ADD COLUMN IF NOT EXISTS ai_queries_per_month INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS max_providers INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS ai_queries_used_this_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP,
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP,
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS organization_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS contact_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;

-- Update subscription_tier enum to match new tiers
ALTER TABLE provider_subscriptions 
DROP CONSTRAINT IF EXISTS provider_subscriptions_subscription_tier_check;

ALTER TABLE provider_subscriptions 
ADD CONSTRAINT provider_subscriptions_subscription_tier_check 
CHECK (subscription_tier IN (
  'essential', 'professional', 'premium', 
  'enterprise_essential', 'enterprise_professional', 'enterprise_unlimited'
));

-- Create sales_leads table for enterprise inquiries
CREATE TABLE IF NOT EXISTS sales_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    organization_name VARCHAR(200),
    contact_name VARCHAR(100),
    phone VARCHAR(20),
    requested_tier VARCHAR(50) NOT NULL,
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    lead_source VARCHAR(50) DEFAULT 'landing_page',
    status VARCHAR(50) DEFAULT 'new',
    notes TEXT,
    assigned_to UUID, -- Reference to sales team member
    follow_up_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT sales_leads_tier_check 
    CHECK (requested_tier IN (
      'essential', 'professional', 'premium', 
      'enterprise_essential', 'enterprise_professional', 'enterprise_unlimited'
    )),
    
    CONSTRAINT sales_leads_status_check 
    CHECK (status IN ('new', 'contacted', 'qualified', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost'))
);

-- Create subscription_usage_tracking table
CREATE TABLE IF NOT EXISTS subscription_usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES provider_subscriptions(id) ON DELETE CASCADE,
    usage_month DATE NOT NULL, -- First day of the month
    ai_queries_used INTEGER DEFAULT 0,
    api_calls_used INTEGER DEFAULT 0,
    data_export_mb_used DECIMAL(10,2) DEFAULT 0,
    patients_active INTEGER DEFAULT 0,
    providers_active INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(provider_id, usage_month)
);

-- Create subscription_tier_changes table for audit trail
CREATE TABLE IF NOT EXISTS subscription_tier_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES provider_subscriptions(id) ON DELETE CASCADE,
    old_tier VARCHAR(50),
    new_tier VARCHAR(50) NOT NULL,
    old_billing_cycle VARCHAR(20),
    new_billing_cycle VARCHAR(20),
    change_reason VARCHAR(200),
    changed_by UUID, -- Reference to admin or provider who made change
    effective_date TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create subscription_payments table for payment tracking
CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stripe_invoice_id VARCHAR(100) UNIQUE NOT NULL,
    stripe_subscription_id VARCHAR(100) NOT NULL,
    amount_paid INTEGER DEFAULT 0, -- Amount in cents
    amount_due INTEGER DEFAULT 0, -- Amount due in cents
    currency VARCHAR(3) DEFAULT 'usd',
    payment_date TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL, -- succeeded, failed, pending
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT subscription_payments_status_check
    CHECK (status IN ('succeeded', 'failed', 'pending', 'refunded'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_leads_email ON sales_leads(email);
CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_created_at ON sales_leads(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_provider_month ON subscription_usage_tracking(provider_id, usage_month);
CREATE INDEX IF NOT EXISTS idx_tier_changes_provider ON subscription_tier_changes(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_tier ON provider_subscriptions(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_stripe_customer ON provider_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_stripe_subscription ON provider_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_stripe_subscription ON subscription_payments(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_date ON subscription_payments(payment_date);

-- Update existing subscriptions to new tier structure
-- Map old tiers to new tiers
UPDATE provider_subscriptions 
SET subscription_tier = CASE 
    WHEN subscription_tier = 'basic' THEN 'essential'
    WHEN subscription_tier = 'professional' THEN 'professional'
    WHEN subscription_tier = 'enterprise' THEN 'enterprise_essential'
    ELSE subscription_tier
END
WHERE subscription_tier IN ('basic', 'enterprise');

-- Update pricing for existing subscriptions
UPDATE provider_subscriptions 
SET 
    price_per_month = CASE subscription_tier
        WHEN 'essential' THEN 599.00
        WHEN 'professional' THEN 899.00
        WHEN 'premium' THEN 1299.00
        WHEN 'enterprise_essential' THEN 2999.00
        WHEN 'enterprise_professional' THEN 9999.00
        WHEN 'enterprise_unlimited' THEN 19999.00
        ELSE price_per_month
    END,
    ai_queries_per_month = CASE subscription_tier
        WHEN 'essential' THEN 100
        WHEN 'professional' THEN 180
        WHEN 'premium' THEN 300
        WHEN 'enterprise_essential' THEN 500
        WHEN 'enterprise_professional' THEN 2000
        WHEN 'enterprise_unlimited' THEN -1
        ELSE 100
    END,
    max_providers = CASE subscription_tier
        WHEN 'essential' THEN 1
        WHEN 'professional' THEN 3
        WHEN 'premium' THEN 5
        WHEN 'enterprise_essential' THEN 10
        WHEN 'enterprise_professional' THEN 50
        WHEN 'enterprise_unlimited' THEN -1
        ELSE 1
    END,
    max_patients = CASE subscription_tier
        WHEN 'essential' THEN 100
        WHEN 'professional' THEN 300
        WHEN 'premium' THEN 500
        WHEN 'enterprise_essential' THEN 1000
        WHEN 'enterprise_professional' THEN 5000
        WHEN 'enterprise_unlimited' THEN -1
        ELSE 100
    END;

-- Create function to check subscription limits
CREATE OR REPLACE FUNCTION check_subscription_limits(
    p_provider_id UUID,
    p_usage_type VARCHAR(50),
    p_usage_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
    v_subscription RECORD;
    v_current_usage INTEGER;
    v_limit INTEGER;
BEGIN
    -- Get current subscription
    SELECT ps.*, pt.ai_queries_per_month, pt.max_providers, pt.max_patients
    INTO v_subscription
    FROM provider_subscriptions ps
    JOIN providers p ON p.id = ps.provider_id
    WHERE ps.provider_id = p_provider_id 
      AND ps.status = 'active'
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Check based on usage type
    CASE p_usage_type
        WHEN 'ai_query' THEN
            IF v_subscription.ai_queries_per_month = -1 THEN
                RETURN TRUE; -- Unlimited
            END IF;
            
            SELECT COALESCE(ai_queries_used, 0) INTO v_current_usage
            FROM subscription_usage_tracking
            WHERE provider_id = p_provider_id 
              AND usage_month = DATE_TRUNC('month', NOW());
            
            RETURN (v_current_usage + p_usage_amount) <= v_subscription.ai_queries_per_month;
            
        WHEN 'provider' THEN
            IF v_subscription.max_providers = -1 THEN
                RETURN TRUE; -- Unlimited
            END IF;
            
            SELECT COUNT(*) INTO v_current_usage
            FROM providers
            WHERE id = p_provider_id; -- Simplified - would need practice membership logic
            
            RETURN v_current_usage <= v_subscription.max_providers;
            
        WHEN 'patient' THEN
            IF v_subscription.max_patients = -1 THEN
                RETURN TRUE; -- Unlimited
            END IF;
            
            -- Would need patient count logic here
            RETURN TRUE; -- Placeholder
            
        ELSE
            RETURN FALSE;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update usage tracking
CREATE OR REPLACE FUNCTION update_usage_tracking() RETURNS TRIGGER AS $$
BEGIN
    -- This would be called when AI queries are made
    -- Implementation depends on how AI queries are tracked
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE sales_leads IS 'Tracks enterprise sales leads from landing page CTAs';
COMMENT ON TABLE subscription_usage_tracking IS 'Monthly usage tracking for subscription limits';
COMMENT ON TABLE subscription_tier_changes IS 'Audit trail for subscription tier changes';
COMMENT ON FUNCTION check_subscription_limits IS 'Validates if provider can perform action within subscription limits';
