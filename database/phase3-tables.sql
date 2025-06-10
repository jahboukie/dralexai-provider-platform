-- Phase 3 Advanced Features Database Tables
-- Telemedicine, SupportPartner Integration, and Analytics
-- HIPAA-compliant with encryption and audit logging

-- ============================================================================
-- TELEMEDICINE TABLES
-- ============================================================================

CREATE TYPE telemedicine_session_status AS ENUM (
    'scheduled', 'active', 'completed', 'cancelled', 'expired'
);

CREATE TABLE telemedicine_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    appointment_id UUID REFERENCES appointments(id),
    
    -- Session details
    session_token VARCHAR(255) NOT NULL UNIQUE,
    room_id VARCHAR(255) NOT NULL,
    session_type VARCHAR(50) DEFAULT 'consultation',
    status telemedicine_session_status DEFAULT 'scheduled',
    
    -- Timing
    scheduled_duration_minutes INTEGER DEFAULT 30,
    actual_duration_minutes INTEGER,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'),
    
    -- Session data (encrypted)
    notes_encrypted JSONB,
    session_notes_encrypted JSONB,
    
    -- Follow-up
    follow_up_required BOOLEAN DEFAULT false,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id),
    updated_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- SUPPORT PARTNER TABLES
-- ============================================================================

CREATE TYPE partner_relationship_type AS ENUM (
    'spouse', 'partner', 'family_member', 'friend', 'caregiver'
);

CREATE TYPE partner_access_level AS ENUM (
    'basic', 'full', 'limited'
);

CREATE TABLE support_partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Partner information (encrypted)
    partner_data_encrypted JSONB NOT NULL, -- firstName, lastName, email
    relationship_type partner_relationship_type DEFAULT 'spouse',
    access_level partner_access_level DEFAULT 'basic',
    
    -- Access control
    partner_token VARCHAR(255) NOT NULL UNIQUE,
    invitation_code VARCHAR(20) NOT NULL,
    consent_given BOOLEAN DEFAULT false,
    consent_date TIMESTAMP,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_access TIMESTAMP,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id),
    updated_by UUID REFERENCES providers(id)
);

-- Shared care plans with partners
CREATE TABLE shared_care_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    partner_id UUID NOT NULL REFERENCES support_partners(id),
    
    -- Care plan data (encrypted for sharing)
    care_plan_data_encrypted JSONB NOT NULL,
    share_level VARCHAR(20) DEFAULT 'summary', -- summary, detailed
    
    -- Access control
    expires_at TIMESTAMP,
    accessed_at TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id)
);

-- Partner engagement tracking
CREATE TABLE partner_engagement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES support_partners(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Activity details
    activity_type VARCHAR(50) NOT NULL, -- education, communication, support
    resource_id VARCHAR(100), -- ID of educational resource or activity
    duration_minutes INTEGER,
    completion_status VARCHAR(20) DEFAULT 'completed', -- started, completed, abandoned
    
    -- Tracking
    tracked_at TIMESTAMP DEFAULT NOW(),
    
    -- Additional data
    engagement_data JSONB, -- Additional activity-specific data
    
    INDEX (partner_id, tracked_at),
    INDEX (activity_type, tracked_at)
);

-- ============================================================================
-- ANALYTICS TABLES
-- ============================================================================

-- Provider analytics cache
CREATE TABLE provider_analytics_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Cache details
    metric_type VARCHAR(50) NOT NULL, -- dashboard, population_health, menopause_insights
    timeframe VARCHAR(20) NOT NULL, -- 7d, 30d, 90d, 180d, 1y
    filters JSONB, -- Additional filters applied
    
    -- Cached data
    analytics_data JSONB NOT NULL,
    
    -- Cache management
    generated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '1 hour'),
    
    INDEX (provider_id, metric_type, timeframe),
    INDEX (expires_at)
);

-- Population health insights
CREATE TABLE population_health_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Insight details
    insight_type VARCHAR(50) NOT NULL, -- trend, benchmark, alert, recommendation
    condition VARCHAR(50), -- menopause, perimenopause, etc.
    age_group VARCHAR(20),
    
    -- Insight data
    insight_data JSONB NOT NULL,
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    
    -- Temporal data
    data_period_start DATE,
    data_period_end DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    reviewed_by_provider BOOLEAN DEFAULT false,
    
    -- Audit fields
    generated_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    
    INDEX (provider_id, insight_type),
    INDEX (condition, age_group),
    INDEX (generated_at)
);

-- ============================================================================
-- ENHANCED SOAP NOTES FOR TELEMEDICINE
-- ============================================================================

-- Add telemedicine session reference to existing SOAP notes table
ALTER TABLE soap_notes ADD COLUMN telemedicine_session_id UUID REFERENCES telemedicine_sessions(id);

-- ============================================================================
-- FHIR EXPORT LOG
-- ============================================================================

CREATE TABLE fhir_export_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Export details
    resource_type VARCHAR(50) NOT NULL, -- Patient, Observation, Condition, etc.
    resource_id UUID, -- ID of the exported resource
    fhir_version VARCHAR(10) DEFAULT 'R4',
    
    -- Request details
    export_format VARCHAR(20) DEFAULT 'json',
    requesting_system VARCHAR(255), -- External system requesting the data
    
    -- Audit fields
    exported_at TIMESTAMP DEFAULT NOW(),
    export_size_bytes INTEGER,
    
    INDEX (provider_id, exported_at),
    INDEX (resource_type, exported_at)
);

-- ============================================================================
-- CLINICAL QUALITY MEASURES
-- ============================================================================

CREATE TABLE clinical_quality_measures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Measure details
    measure_name VARCHAR(100) NOT NULL,
    measure_code VARCHAR(50), -- CMS or other quality measure code
    category VARCHAR(50), -- preventive_care, chronic_care, patient_safety
    
    -- Performance data
    numerator INTEGER NOT NULL, -- Patients meeting criteria
    denominator INTEGER NOT NULL, -- Total eligible patients
    performance_rate DECIMAL(5,2), -- Calculated percentage
    
    -- Benchmarks
    national_benchmark DECIMAL(5,2),
    peer_benchmark DECIMAL(5,2),
    target_rate DECIMAL(5,2),
    
    -- Temporal data
    measurement_period_start DATE NOT NULL,
    measurement_period_end DATE NOT NULL,
    
    -- Status
    is_current BOOLEAN DEFAULT true,
    
    -- Audit fields
    calculated_at TIMESTAMP DEFAULT NOW(),
    calculated_by UUID REFERENCES providers(id),
    
    INDEX (provider_id, measurement_period_end),
    INDEX (measure_code, measurement_period_end)
);

-- ============================================================================
-- PATIENT OUTCOME TRACKING
-- ============================================================================

CREATE TABLE patient_outcomes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Outcome details
    outcome_type VARCHAR(50) NOT NULL, -- symptom_severity, quality_of_life, treatment_response
    measurement_tool VARCHAR(50), -- Scale or assessment tool used
    
    -- Measurement data
    baseline_value DECIMAL(10,2),
    current_value DECIMAL(10,2),
    target_value DECIMAL(10,2),
    improvement_percentage DECIMAL(5,2),
    
    -- Context
    related_condition VARCHAR(50),
    related_treatment VARCHAR(100),
    
    -- Temporal data
    baseline_date DATE,
    measurement_date DATE NOT NULL,
    next_measurement_due DATE,
    
    -- Additional data
    notes TEXT,
    outcome_data JSONB, -- Additional structured outcome data
    
    -- Audit fields
    recorded_at TIMESTAMP DEFAULT NOW(),
    recorded_by UUID REFERENCES providers(id),
    
    INDEX (patient_id, outcome_type),
    INDEX (provider_id, measurement_date),
    INDEX (related_condition, measurement_date)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Telemedicine indexes
CREATE INDEX idx_telemedicine_sessions_patient_id ON telemedicine_sessions(patient_id);
CREATE INDEX idx_telemedicine_sessions_provider_id ON telemedicine_sessions(provider_id);
CREATE INDEX idx_telemedicine_sessions_status ON telemedicine_sessions(status);
CREATE INDEX idx_telemedicine_sessions_created_at ON telemedicine_sessions(created_at);

-- Support partner indexes
CREATE INDEX idx_support_partners_patient_id ON support_partners(patient_id);
CREATE INDEX idx_support_partners_provider_id ON support_partners(provider_id);
CREATE INDEX idx_support_partners_active ON support_partners(is_active) WHERE is_active = true;

-- Shared care plans indexes
CREATE INDEX idx_shared_care_plans_patient_id ON shared_care_plans(patient_id);
CREATE INDEX idx_shared_care_plans_partner_id ON shared_care_plans(partner_id);
CREATE INDEX idx_shared_care_plans_expires_at ON shared_care_plans(expires_at);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE TRIGGER update_telemedicine_sessions_updated_at BEFORE UPDATE ON telemedicine_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_partners_updated_at BEFORE UPDATE ON support_partners
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shared_care_plans_updated_at BEFORE UPDATE ON shared_care_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on Phase 3 tables
ALTER TABLE telemedicine_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_analytics_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE population_health_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir_export_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_quality_measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS policies ensure providers can only access their own data
-- Detailed policies will be implemented in separate migration files

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function to clean up expired telemedicine sessions
CREATE OR REPLACE FUNCTION cleanup_expired_telemedicine_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM telemedicine_sessions 
    WHERE status = 'scheduled' AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired analytics cache
CREATE OR REPLACE FUNCTION cleanup_expired_analytics_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM provider_analytics_cache 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup functions (would be called by cron job)
-- SELECT cleanup_expired_telemedicine_sessions();
-- SELECT cleanup_expired_analytics_cache();
