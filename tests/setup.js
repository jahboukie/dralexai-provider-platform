// Test setup and global configurations
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-hipaa-compliant';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-only';
process.env.PORT = '0'; // Use random available port for testing

// Mock environment variables for testing
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_test';

// HIPAA/GDPR/PIPEDA Compliance Test Environment
process.env.ENCRYPTION_MASTER_KEY = 'test-encryption-master-key-32-bytes-long-hipaa-compliant-secure';
process.env.ENCRYPTION_SALT = 'test-encryption-salt-for-key-derivation';
process.env.AUDIT_INTEGRITY_SECRET = 'test-audit-integrity-secret-key';
process.env.DB_USER = 'test_user';
process.env.DB_HOST = 'localhost';
process.env.DB_NAME = 'test_dralexai_provider';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_PORT = '5432';

// Increase timeout for async operations
jest.setTimeout(15000);

// Global test utilities
global.testUtils = {
  createMockProvider: () => ({
    id: 'test-provider-id-12345',
    email: 'test.provider@example.com',
    firstName: 'Test',
    lastName: 'Provider',
    specialty: 'Internal Medicine',
    organization: 'Test Clinic',
    subscriptionTier: 'professional',
    subscriptionStatus: 'active',
    licenseNumber: 'TEST123456',
    licenseState: 'CA',
    role: 'provider',
    mfaEnabled: true,
    isActive: true
  }),

  createMockPatient: () => ({
    id: 'test-patient-id-67890',
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1980-01-01',
    email: 'jane.doe@example.com',
    phone: '+1-555-0123',
    mrn: 'MRN123456789',
    consentGiven: true,
    gdprConsent: true,
    pipedaConsent: true
  }),

  createMockToken: () => 'Bearer test-jwt-token',

  createValidJWT: (payload = {}) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign({
      providerId: 'test-provider-id-12345',
      email: 'test.provider@example.com',
      role: 'provider',
      type: 'access',
      ...payload
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
  },

  mockRequest: (overrides = {}) => ({
    headers: {},
    body: {},
    query: {},
    params: {},
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('test-user-agent'),
    ...overrides
  }),

  mockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
  },

  // HIPAA Test Data
  createMockPHI: () => ({
    patientId: 'test-patient-id-67890',
    diagnosis: 'Menopause transition',
    medications: ['Estradiol 1mg', 'Progesterone 100mg'],
    vitalSigns: {
      bloodPressure: '120/80',
      heartRate: 72,
      temperature: 98.6
    },
    labResults: {
      fsh: 45.2,
      estradiol: 15.3,
      cholesterol: 180
    },
    notes: 'Patient experiencing hot flashes and sleep disturbances'
  }),

  // GDPR Test Data
  createGDPRDataRequest: () => ({
    requestType: 'access',
    dataSubjectId: 'test-patient-id-67890',
    requestedData: ['medical_records', 'personal_info', 'consent_history'],
    requestDate: new Date().toISOString(),
    verificationMethod: 'email_verification'
  })
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
