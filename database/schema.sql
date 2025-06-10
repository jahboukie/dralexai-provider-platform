-- Dr. Alex AI Provider Platform - Production Database Schema
-- HIPAA-Compliant Healthcare Database Architecture
-- Created: 2024 - Production Ready

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_audit";

-- Custom types for healthcare data
CREATE TYPE healthcare_practice_type AS ENUM (
    'solo_practice', 'group_practice', 'hospital_system', 
    'clinic', 'specialty_practice', 'academic_medical_center'
);

CREATE TYPE medical_specialty AS ENUM (
    'internal_medicine', 'family_medicine', 'gynecology', 'endocrinology',
    'psychiatry', 'cardiology', 'dermatology', 'neurology', 'oncology',
    'orthopedics', 'pediatrics', 'radiology', 'surgery', 'other'
);

CREATE TYPE provider_role AS ENUM (
    'admin', 'attending_physician', 'resident', 'nurse_practitioner',
    'physician_assistant', 'registered_nurse', 'medical_assistant', 'staff'
);

CREATE TYPE patient_consent_status AS ENUM (
    'pending', 'granted', 'revoked', 'expired'
);

CREATE TYPE data_sharing_permission AS ENUM (
    'none', 'basic', 'full', 'research_only'
);

CREATE TYPE appointment_status AS ENUM (
    'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'
);

-- ============================================================================
-- CORE PRACTICE & PROVIDER TABLES
-- ============================================================================

-- Practices/Organizations
CREATE TABLE practices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    npi_number VARCHAR(10) UNIQUE, -- National Provider Identifier
    practice_type healthcare_practice_type NOT NULL,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    
    -- HIPAA Compliance
    hipaa_compliance_date TIMESTAMP,
    business_associate_agreement BOOLEAN DEFAULT false,
    last_security_assessment TIMESTAMP,
    
    -- Subscription & Billing
    subscription_tier VARCHAR(50) DEFAULT 'essential',
    query_limit INTEGER DEFAULT 1000,
    billing_contact_email VARCHAR(255),
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- Providers (Healthcare professionals)
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    
    -- Authentication
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret VARCHAR(255), -- TOTP secret (encrypted)
    backup_codes TEXT[], -- Recovery codes (encrypted)
    
    -- Professional Information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    license_state VARCHAR(2),
    license_expiry DATE,
    dea_number VARCHAR(20), -- Drug Enforcement Administration
    specialty medical_specialty,
    board_certifications TEXT[],
    
    -- Role & Permissions
    role provider_role DEFAULT 'attending_physician',
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    
    -- HIPAA Training & Compliance
    last_hipaa_training TIMESTAMP,
    hipaa_training_valid_until TIMESTAMP,
    security_clearance_level INTEGER DEFAULT 1,
    
    -- Usage Tracking
    monthly_usage INTEGER DEFAULT 0,
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP,
    
    -- Encrypted Profile Data (PHI)
    encrypted_profile JSONB, -- Additional sensitive data
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- ============================================================================
-- PATIENT MANAGEMENT TABLES
-- ============================================================================

-- Patients (Core patient information)
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    practice_id UUID NOT NULL REFERENCES practices(id),
    
    -- Basic Demographics (Encrypted)
    medical_record_number VARCHAR(50) UNIQUE NOT NULL,
    first_name_encrypted BYTEA NOT NULL, -- AES-256 encrypted
    last_name_encrypted BYTEA NOT NULL,
    date_of_birth_encrypted BYTEA,
    ssn_encrypted BYTEA, -- Social Security Number
    
    -- Contact Information (Encrypted)
    phone_encrypted BYTEA,
    email_encrypted BYTEA,
    address_encrypted JSONB, -- Full address as encrypted JSON
    
    -- Medical Information
    gender VARCHAR(20),
    preferred_language VARCHAR(50) DEFAULT 'English',
    emergency_contact_encrypted JSONB,
    
    -- Insurance Information (Encrypted)
    insurance_info_encrypted JSONB,
    
    -- Care Management
    primary_provider_id UUID REFERENCES providers(id),
    care_team_ids UUID[],
    risk_level VARCHAR(20) DEFAULT 'low', -- low, medium, high, critical
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    deceased_date DATE,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id),
    updated_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- MENOWELLNESS INTEGRATION TABLES
-- ============================================================================

-- MenoWellness Patient Linkage
CREATE TABLE menowellness_patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    
    -- Secure linkage to MenoWellness platform
    menowellness_patient_id_encrypted BYTEA, -- Encrypted reference
    linkage_token_hash VARCHAR(255), -- Secure token for API calls
    
    -- Consent Management
    consent_status patient_consent_status DEFAULT 'pending',
    consent_granted_at TIMESTAMP,
    consent_expires_at TIMESTAMP,
    data_sharing_level data_sharing_permission DEFAULT 'basic',
    
    -- Integration Settings
    sync_enabled BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP,
    sync_frequency_hours INTEGER DEFAULT 24,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id)
);

-- Shared Symptom Data from MenoWellness
CREATE TABLE shared_symptom_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menowellness_link_id UUID NOT NULL REFERENCES menowellness_patients(id),
    
    -- Encrypted symptom data from MenoWellness
    symptom_data_encrypted JSONB NOT NULL, -- AES-256 encrypted symptom logs
    severity_trends JSONB, -- Processed trend data
    ai_insights JSONB, -- AI-generated insights
    
    -- Temporal data
    data_period_start TIMESTAMP NOT NULL,
    data_period_end TIMESTAMP NOT NULL,
    imported_at TIMESTAMP DEFAULT NOW(),
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id)
);

-- Provider Insights for MenoWellness
CREATE TABLE provider_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menowellness_link_id UUID NOT NULL REFERENCES menowellness_patients(id),
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Clinical insights to share with MenoWellness
    insight_type VARCHAR(50) NOT NULL, -- medication_adjustment, lifestyle_recommendation, etc.
    insight_data_encrypted JSONB NOT NULL,
    clinical_notes_encrypted BYTEA,
    
    -- Sharing permissions
    shared_with_patient BOOLEAN DEFAULT false,
    shared_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- AUDIT & SECURITY TABLES
-- ============================================================================

-- HIPAA Audit Log
CREATE TABLE hipaa_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Who
    user_id UUID, -- Could be provider or system
    user_type VARCHAR(50), -- provider, system, api
    user_ip_address INET,
    user_agent TEXT,
    
    -- What
    action VARCHAR(100) NOT NULL, -- CREATE, READ, UPDATE, DELETE, LOGIN, etc.
    resource_type VARCHAR(50), -- patient, provider, appointment, etc.
    resource_id UUID,
    
    -- When & Where
    timestamp TIMESTAMP DEFAULT NOW(),
    session_id VARCHAR(255),
    
    -- Details
    details JSONB, -- Additional context
    phi_accessed BOOLEAN DEFAULT false,
    
    -- Compliance
    retention_until TIMESTAMP, -- When this log can be purged
    
    INDEX (user_id, timestamp),
    INDEX (resource_type, resource_id),
    INDEX (action, timestamp),
    INDEX (phi_accessed, timestamp)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Provider indexes
CREATE INDEX idx_providers_practice_id ON providers(practice_id);
CREATE INDEX idx_providers_email ON providers(email);
CREATE INDEX idx_providers_license ON providers(license_number);
CREATE INDEX idx_providers_active ON providers(is_active) WHERE is_active = true;

-- Patient indexes
CREATE INDEX idx_patients_provider_id ON patients(provider_id);
CREATE INDEX idx_patients_practice_id ON patients(practice_id);
CREATE INDEX idx_patients_mrn ON patients(medical_record_number);
CREATE INDEX idx_patients_active ON patients(is_active) WHERE is_active = true;

-- MenoWellness integration indexes
CREATE INDEX idx_menowellness_patients_provider ON menowellness_patients(provider_id);
CREATE INDEX idx_menowellness_patients_patient ON menowellness_patients(patient_id);
CREATE INDEX idx_menowellness_consent ON menowellness_patients(consent_status);

-- Audit indexes
CREATE INDEX idx_audit_timestamp ON hipaa_audit_log(timestamp);
CREATE INDEX idx_audit_user ON hipaa_audit_log(user_id, timestamp);
CREATE INDEX idx_audit_resource ON hipaa_audit_log(resource_type, resource_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on sensitive tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE menowellness_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_symptom_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies will be added in separate migration files
-- This ensures providers can only access their own patients

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_practices_updated_at BEFORE UPDATE ON practices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA & CONFIGURATION
-- ============================================================================

-- This schema is ready for production deployment
-- Next steps: Run migrations, set up encryption keys, configure RLS policies
