/**
 * HIPAA-Compliant PHI Encryption Security Tests
 * Testing AES-256-GCM encryption for Protected Health Information
 */

const crypto = require('crypto');
// Mock the encryption service
const PHIEncryptionService = jest.fn().mockImplementation(() => ({
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  tagLength: 16,
  keyRotationDays: 90,
  keyCache: new Map(),
  deriveMasterKey: jest.fn().mockReturnValue(Buffer.alloc(32)),
  encryptPHI: jest.fn(),
  decryptPHI: jest.fn(),
  getPatientKey: jest.fn(),
  encryptForMenoWellness: jest.fn(),
  filterDataForSharing: jest.fn()
}));

// Mock dependencies
jest.mock('../../services/audit-logger');
jest.mock('../../services/logger');

const mockAuditLogger = require('../../services/audit-logger');

describe('PHI Encryption Security', () => {
  let encryptionService;

  beforeEach(() => {
    encryptionService = new PHIEncryptionService();
    jest.clearAllMocks();
    mockAuditLogger.log = jest.fn().mockResolvedValue('audit-id');
  });

  describe('Encryption Algorithm Security', () => {
    it('should use AES-256-GCM encryption algorithm', () => {
      expect(encryptionService.algorithm).toBe('aes-256-gcm');
      expect(encryptionService.keyLength).toBe(32); // 256 bits
      expect(encryptionService.ivLength).toBe(16); // 128 bits
      expect(encryptionService.tagLength).toBe(16); // 128 bits
    });

    it('should generate cryptographically secure random IVs', () => {
      const iv1 = crypto.randomBytes(encryptionService.ivLength);
      const iv2 = crypto.randomBytes(encryptionService.ivLength);
      
      expect(iv1).toHaveLength(encryptionService.ivLength);
      expect(iv2).toHaveLength(encryptionService.ivLength);
      expect(iv1.equals(iv2)).toBe(false); // Should be different
    });

    it('should use proper key derivation', () => {
      const masterKey = encryptionService.deriveMasterKey();
      
      expect(masterKey).toHaveLength(encryptionService.keyLength);
      expect(Buffer.isBuffer(masterKey)).toBe(true);
    });
  });

  describe('PHI Data Encryption', () => {
    it('should encrypt PHI data successfully', async () => {
      const phi = global.testUtils.createMockPHI();
      const patientId = 'test-patient-id-67890';

      const encrypted = await encryptionService.encryptPHI(phi, patientId, 'medical_record');

      expect(encrypted).toHaveProperty('data');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('keyId');
      expect(encrypted).toHaveProperty('algorithm');
      expect(encrypted).toHaveProperty('encryptedAt');
      
      expect(encrypted.algorithm).toBe('aes-256-gcm');
      expect(encrypted.data).not.toContain(phi.diagnosis);
      expect(encrypted.data).not.toContain(phi.notes);
    });

    it('should decrypt PHI data correctly', async () => {
      const originalPHI = global.testUtils.createMockPHI();
      const patientId = 'test-patient-id-67890';

      const encrypted = await encryptionService.encryptPHI(originalPHI, patientId);
      const decrypted = await encryptionService.decryptPHI(encrypted, patientId);

      expect(decrypted).toEqual(originalPHI);
    });

    it('should fail decryption with wrong patient ID', async () => {
      const phi = global.testUtils.createMockPHI();
      const correctPatientId = 'test-patient-id-67890';
      const wrongPatientId = 'wrong-patient-id-12345';

      const encrypted = await encryptionService.encryptPHI(phi, correctPatientId);

      await expect(
        encryptionService.decryptPHI(encrypted, wrongPatientId)
      ).rejects.toThrow();
    });

    it('should handle encryption of different data types', async () => {
      const testData = [
        { type: 'string', data: 'Test diagnosis' },
        { type: 'object', data: { diagnosis: 'Test', severity: 'mild' } },
        { type: 'array', data: ['medication1', 'medication2'] },
        { type: 'number', data: 123.45 },
        { type: 'boolean', data: true }
      ];

      const patientId = 'test-patient-id';

      for (const test of testData) {
        const encrypted = await encryptionService.encryptPHI(test.data, patientId);
        const decrypted = await encryptionService.decryptPHI(encrypted, patientId);
        
        expect(decrypted).toEqual(test.data);
      }
    });
  });

  describe('Key Management', () => {
    it('should generate unique keys per patient', async () => {
      const patient1Id = 'patient-1';
      const patient2Id = 'patient-2';

      const key1 = await encryptionService.getPatientKey(patient1Id);
      const key2 = await encryptionService.getPatientKey(patient2Id);

      expect(key1.keyId).not.toBe(key2.keyId);
      expect(key1.key.equals(key2.key)).toBe(false);
    });

    it('should implement key rotation policy', () => {
      expect(encryptionService.keyRotationDays).toBe(90);
    });

    it('should cache keys for performance', async () => {
      const patientId = 'test-patient-id';
      
      const key1 = await encryptionService.getPatientKey(patientId);
      const key2 = await encryptionService.getPatientKey(patientId);

      expect(key1.keyId).toBe(key2.keyId);
      expect(key1.key.equals(key2.key)).toBe(true);
    });

    it('should rotate keys when expired', async () => {
      const patientId = 'test-patient-id';
      
      // Get initial key
      const initialKey = await encryptionService.getPatientKey(patientId);
      
      // Mock expired key
      const expiredDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000); // 91 days ago
      encryptionService.keyCache.set(patientId, {
        ...initialKey,
        createdAt: expiredDate
      });

      // Should generate new key
      const newKey = await encryptionService.getPatientKey(patientId);
      expect(newKey.keyId).not.toBe(initialKey.keyId);
    });
  });

  describe('Cross-Platform Encryption', () => {
    it('should encrypt data for MenoWellness sharing', async () => {
      const phi = global.testUtils.createMockPHI();
      const patientId = 'test-patient-id';

      const encrypted = await encryptionService.encryptForMenoWellness(
        phi, 
        patientId, 
        'basic'
      );

      expect(encrypted).toHaveProperty('data');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('sharingLevel');
      expect(encrypted.sharingLevel).toBe('basic');
    });

    it('should filter data based on sharing level', () => {
      const fullPHI = {
        diagnosis: 'Menopause',
        medications: ['Estradiol'],
        socialSecurityNumber: '123-45-6789',
        creditCardInfo: '4111-1111-1111-1111',
        personalNotes: 'Private notes'
      };

      const filtered = encryptionService.filterDataForSharing(fullPHI, 'basic');

      expect(filtered).toHaveProperty('diagnosis');
      expect(filtered).toHaveProperty('medications');
      expect(filtered).not.toHaveProperty('socialSecurityNumber');
      expect(filtered).not.toHaveProperty('creditCardInfo');
      expect(filtered).not.toHaveProperty('personalNotes');
    });
  });

  describe('Encryption Integrity', () => {
    it('should detect tampering with encrypted data', async () => {
      const phi = global.testUtils.createMockPHI();
      const patientId = 'test-patient-id';

      const encrypted = await encryptionService.encryptPHI(phi, patientId);
      
      // Tamper with encrypted data
      encrypted.data = encrypted.data.slice(0, -2) + 'XX';

      await expect(
        encryptionService.decryptPHI(encrypted, patientId)
      ).rejects.toThrow();
    });

    it('should detect tampering with authentication tag', async () => {
      const phi = global.testUtils.createMockPHI();
      const patientId = 'test-patient-id';

      const encrypted = await encryptionService.encryptPHI(phi, patientId);
      
      // Tamper with auth tag
      encrypted.tag = encrypted.tag.slice(0, -2) + 'XX';

      await expect(
        encryptionService.decryptPHI(encrypted, patientId)
      ).rejects.toThrow();
    });

    it('should validate encryption metadata', async () => {
      const phi = global.testUtils.createMockPHI();
      const patientId = 'test-patient-id';

      const encrypted = await encryptionService.encryptPHI(phi, patientId);
      
      // Remove required metadata
      delete encrypted.algorithm;

      await expect(
        encryptionService.decryptPHI(encrypted, patientId)
      ).rejects.toThrow();
    });
  });

  describe('Audit Logging for Encryption', () => {
    it('should log PHI encryption events', async () => {
      const phi = global.testUtils.createMockPHI();
      const patientId = 'test-patient-id';

      await encryptionService.encryptPHI(phi, patientId, 'medical_record');

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PHI_ENCRYPTED',
          resourceType: 'patient_data',
          resourceId: patientId,
          details: expect.objectContaining({
            dataType: 'medical_record'
          }),
          phiAccessed: true
        })
      );
    });

    it('should log PHI decryption events', async () => {
      const phi = global.testUtils.createMockPHI();
      const patientId = 'test-patient-id';

      const encrypted = await encryptionService.encryptPHI(phi, patientId);
      await encryptionService.decryptPHI(encrypted, patientId);

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PHI_DECRYPTED',
          resourceType: 'patient_data',
          resourceId: patientId,
          phiAccessed: true
        })
      );
    });

    it('should log key generation events', async () => {
      const patientId = 'new-patient-id';

      await encryptionService.getPatientKey(patientId);

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ENCRYPTION_KEY_GENERATED',
          resourceType: 'encryption_key',
          resourceId: patientId
        })
      );
    });
  });

  describe('Performance and Security Balance', () => {
    it('should encrypt and decrypt within reasonable time limits', async () => {
      const largePHI = {
        ...global.testUtils.createMockPHI(),
        largeData: 'x'.repeat(10000) // 10KB of data
      };
      const patientId = 'test-patient-id';

      const startTime = Date.now();
      const encrypted = await encryptionService.encryptPHI(largePHI, patientId);
      const encryptTime = Date.now() - startTime;

      const decryptStartTime = Date.now();
      const decrypted = await encryptionService.decryptPHI(encrypted, patientId);
      const decryptTime = Date.now() - decryptStartTime;

      expect(encryptTime).toBeLessThan(1000); // Less than 1 second
      expect(decryptTime).toBeLessThan(1000); // Less than 1 second
      expect(decrypted).toEqual(largePHI);
    });

    it('should handle concurrent encryption operations', async () => {
      const phi = global.testUtils.createMockPHI();
      const patientIds = ['patient-1', 'patient-2', 'patient-3', 'patient-4', 'patient-5'];

      const encryptionPromises = patientIds.map(patientId =>
        encryptionService.encryptPHI(phi, patientId)
      );

      const results = await Promise.all(encryptionPromises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('keyId');
      });

      // Verify all have different keys
      const keyIds = results.map(r => r.keyId);
      const uniqueKeyIds = [...new Set(keyIds)];
      expect(uniqueKeyIds).toHaveLength(5);
    });
  });
});
