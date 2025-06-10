-- Additional EHR Tables for Dr. Alex AI Provider Platform
-- SOAP notes, medications, allergies, and clinical data
-- HIPAA-compliant with encryption for PHI

-- ============================================================================
-- SOAP NOTES TABLE
-- ============================================================================

CREATE TABLE soap_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Encrypted SOAP components
    chief_complaint_encrypted JSONB NOT NULL,
    subjective_encrypted JSONB NOT NULL,
    objective_encrypted JSONB NOT NULL,
    assessment_encrypted JSONB NOT NULL,
    plan_encrypted JSONB NOT NULL,
    
    -- Clinical data (can be stored unencrypted as it's not directly identifying)
    vital_signs JSONB, -- Blood pressure, temperature, heart rate, etc.
    medications JSONB, -- Current medications list
    allergies JSONB, -- Known allergies
    icd_codes TEXT[], -- ICD-10 diagnosis codes
    cpt_codes TEXT[], -- CPT procedure codes
    
    -- Follow-up and scheduling
    follow_up_date DATE,
    priority_level VARCHAR(20) DEFAULT 'routine', -- routine, urgent, emergent
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id),
    updated_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- MEDICATIONS TABLE
-- ============================================================================

CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Medication details
    medication_name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    dosage VARCHAR(100) NOT NULL,
    frequency VARCHAR(100) NOT NULL,
    route VARCHAR(50), -- oral, injection, topical, etc.
    
    -- Prescription details
    quantity INTEGER,
    refills_remaining INTEGER DEFAULT 0,
    ndc_code VARCHAR(20), -- National Drug Code
    
    -- Dates
    start_date DATE NOT NULL,
    end_date DATE,
    prescribed_date DATE DEFAULT CURRENT_DATE,
    
    -- Status and notes
    status VARCHAR(20) DEFAULT 'active', -- active, discontinued, completed
    discontinuation_reason TEXT,
    special_instructions TEXT,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id),
    updated_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- ALLERGIES TABLE
-- ============================================================================

CREATE TABLE allergies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Allergy details
    allergen VARCHAR(255) NOT NULL,
    allergen_type VARCHAR(50), -- drug, food, environmental, other
    reaction_type VARCHAR(100), -- rash, anaphylaxis, nausea, etc.
    severity VARCHAR(20) NOT NULL, -- mild, moderate, severe, life-threatening
    
    -- Additional details
    onset_date DATE,
    notes TEXT,
    verified BOOLEAN DEFAULT false,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id),
    updated_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- APPOINTMENTS TABLE
-- ============================================================================

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    practice_id UUID NOT NULL REFERENCES practices(id),
    
    -- Appointment details
    appointment_date TIMESTAMP NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    appointment_type VARCHAR(50) NOT NULL, -- consultation, follow-up, procedure, etc.
    status appointment_status DEFAULT 'scheduled',
    
    -- Location and method
    location VARCHAR(255), -- office, telemedicine, home visit
    room_number VARCHAR(20),
    is_telemedicine BOOLEAN DEFAULT false,
    
    -- Clinical details
    chief_complaint TEXT,
    notes TEXT,
    
    -- Billing
    billing_code VARCHAR(20),
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id),
    updated_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- MEDICAL NOTES TABLE
-- ============================================================================

CREATE TABLE medical_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    appointment_id UUID REFERENCES appointments(id),
    
    -- Note details
    note_type VARCHAR(50) NOT NULL, -- progress, consultation, procedure, discharge
    title VARCHAR(255),
    content_encrypted JSONB NOT NULL, -- Encrypted note content
    
    -- Clinical context
    related_soap_note_id UUID REFERENCES soap_notes(id),
    tags TEXT[], -- searchable tags
    
    -- Status
    is_signed BOOLEAN DEFAULT false,
    signed_at TIMESTAMP,
    signed_by UUID REFERENCES providers(id),
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id),
    updated_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- LAB RESULTS TABLE
-- ============================================================================

CREATE TABLE lab_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    
    -- Lab details
    test_name VARCHAR(255) NOT NULL,
    test_code VARCHAR(50), -- LOINC code
    result_value VARCHAR(255),
    reference_range VARCHAR(255),
    units VARCHAR(50),
    
    -- Status and interpretation
    status VARCHAR(20) DEFAULT 'final', -- preliminary, final, corrected
    abnormal_flag VARCHAR(20), -- normal, high, low, critical
    interpretation TEXT,
    
    -- Dates
    ordered_date DATE,
    collected_date DATE,
    resulted_date DATE,
    
    -- Lab information
    lab_name VARCHAR(255),
    ordering_provider UUID REFERENCES providers(id),
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- VITAL SIGNS TABLE
-- ============================================================================

CREATE TABLE vital_signs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    appointment_id UUID REFERENCES appointments(id),
    
    -- Vital signs measurements
    systolic_bp INTEGER,
    diastolic_bp INTEGER,
    heart_rate INTEGER,
    temperature DECIMAL(4,1),
    temperature_unit VARCHAR(1) DEFAULT 'F', -- F or C
    respiratory_rate INTEGER,
    oxygen_saturation INTEGER,
    
    -- Physical measurements
    height_cm DECIMAL(5,2),
    weight_kg DECIMAL(5,2),
    bmi DECIMAL(4,1),
    
    -- Pain assessment
    pain_scale INTEGER CHECK (pain_scale >= 0 AND pain_scale <= 10),
    
    -- Measurement context
    measured_at TIMESTAMP DEFAULT NOW(),
    measured_by UUID REFERENCES providers(id),
    notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES providers(id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- SOAP notes indexes
CREATE INDEX idx_soap_notes_patient_id ON soap_notes(patient_id);
CREATE INDEX idx_soap_notes_provider_id ON soap_notes(provider_id);
CREATE INDEX idx_soap_notes_created_at ON soap_notes(created_at);

-- Medications indexes
CREATE INDEX idx_medications_patient_id ON medications(patient_id);
CREATE INDEX idx_medications_status ON medications(status);
CREATE INDEX idx_medications_start_date ON medications(start_date);

-- Allergies indexes
CREATE INDEX idx_allergies_patient_id ON allergies(patient_id);
CREATE INDEX idx_allergies_severity ON allergies(severity);

-- Appointments indexes
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_provider_id ON appointments(provider_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Medical notes indexes
CREATE INDEX idx_medical_notes_patient_id ON medical_notes(patient_id);
CREATE INDEX idx_medical_notes_type ON medical_notes(note_type);
CREATE INDEX idx_medical_notes_created_at ON medical_notes(created_at);

-- Lab results indexes
CREATE INDEX idx_lab_results_patient_id ON lab_results(patient_id);
CREATE INDEX idx_lab_results_test_name ON lab_results(test_name);
CREATE INDEX idx_lab_results_resulted_date ON lab_results(resulted_date);

-- Vital signs indexes
CREATE INDEX idx_vital_signs_patient_id ON vital_signs(patient_id);
CREATE INDEX idx_vital_signs_measured_at ON vital_signs(measured_at);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE TRIGGER update_soap_notes_updated_at BEFORE UPDATE ON soap_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medications_updated_at BEFORE UPDATE ON medications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_allergies_updated_at BEFORE UPDATE ON allergies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medical_notes_updated_at BEFORE UPDATE ON medical_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lab_results_updated_at BEFORE UPDATE ON lab_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all EHR tables
ALTER TABLE soap_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE vital_signs ENABLE ROW LEVEL SECURITY;

-- RLS policies will be added in separate migration files
-- These ensure providers can only access their own patients' data
