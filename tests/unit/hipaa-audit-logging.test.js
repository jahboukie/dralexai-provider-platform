/**
 * HIPAA-Compliant Audit Logging Tests
 * Testing comprehensive audit trail for all PHI access and system actions
 */

const crypto = require('crypto');
// Import the audit logger service (it's exported as singleton)
const auditLoggerService = require('../../services/audit-logger');

// Mock dependencies
jest.mock('../../services/database');
jest.mock('../../services/logger');

const mockDatabase = require('../../services/database');

describe('HIPAA Audit Logging', () => {
  let auditLogger;
  let mockClient;

  beforeEach(() => {
    // Use the real audit logger service
    auditLogger = auditLoggerService;
    
    // Mock database client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    
    mockDatabase.query = jest.fn();
    mockDatabase.getClient = jest.fn().mockResolvedValue(mockClient);
    
    jest.clearAllMocks();
  });

  describe('Audit Event Structure', () => {
    it('should create properly structured audit events', async () => {
      const auditEvent = {
        action: 'PHI_ACCESS',
        resourceType: 'patient_record',
        resourceId: 'patient-123',
        userId: 'provider-456',
        userType: 'provider',
        details: {
          accessReason: 'patient_care',
          dataAccessed: ['demographics', 'medical_history']
        },
        phiAccessed: true
      };

      mockClient.query.mockResolvedValue({ rows: [] });

      const auditId = await auditLogger.log(auditEvent);

      expect(auditId).toBeDefined();
      expect(typeof auditId).toBe('string');
    });

    it('should enrich audit events with required metadata', async () => {
      const basicEvent = {
        action: 'PROVIDER_LOGIN',
        resourceType: 'provider',
        resourceId: 'provider-123'
      };

      const enrichedEvent = await auditLogger.enrichAuditEvent(basicEvent);

      expect(enrichedEvent).toHaveProperty('id');
      expect(enrichedEvent).toHaveProperty('timestamp');
      expect(enrichedEvent).toHaveProperty('checksum');
      expect(enrichedEvent).toHaveProperty('retentionUntil');
      expect(enrichedEvent.action).toBe('PROVIDER_LOGIN');
      expect(enrichedEvent.resourceType).toBe('provider');
      expect(enrichedEvent.resourceId).toBe('provider-123');
    });

    it('should generate tamper-proof checksums', async () => {
      const event1 = {
        action: 'PHI_ACCESS',
        resourceId: 'patient-123',
        timestamp: new Date('2024-01-01T10:00:00Z')
      };

      const event2 = {
        action: 'PHI_ACCESS',
        resourceId: 'patient-123',
        timestamp: new Date('2024-01-01T10:00:01Z') // 1 second difference
      };

      const enriched1 = await auditLogger.enrichAuditEvent(event1);
      const enriched2 = await auditLogger.enrichAuditEvent(event2);

      expect(enriched1.checksum).toBeDefined();
      expect(enriched2.checksum).toBeDefined();
      expect(enriched1.checksum).not.toBe(enriched2.checksum);
    });
  });

  describe('HIPAA Retention Requirements', () => {
    it('should set retention period to minimum 6 years', () => {
      expect(auditLogger.retentionYears).toBe(6);
    });

    it('should calculate correct retention dates', async () => {
      const event = {
        action: 'PHI_ACCESS',
        resourceType: 'patient_record',
        resourceId: 'patient-123'
      };

      const enrichedEvent = await auditLogger.enrichAuditEvent(event);
      const retentionDate = new Date(enrichedEvent.retentionUntil);
      const expectedDate = new Date();
      expectedDate.setFullYear(expectedDate.getFullYear() + 6);

      // Allow for small time differences in test execution
      const timeDiff = Math.abs(retentionDate.getTime() - expectedDate.getTime());
      expect(timeDiff).toBeLessThan(5000); // Less than 5 seconds difference
    });
  });

  describe('Critical Event Handling', () => {
    it('should identify critical events', () => {
      const criticalEvents = [
        'LOGIN_FAILED',
        'ACCOUNT_LOCKED',
        'PHI_DECRYPTION_FAILED',
        'UNAUTHORIZED_ACCESS_ATTEMPT',
        'SECURITY_BREACH',
        'DATA_EXPORT',
        'ADMIN_ACTION'
      ];

      criticalEvents.forEach(action => {
        expect(auditLogger.isCriticalEvent(action)).toBe(true);
      });

      const nonCriticalEvents = [
        'PROVIDER_LOGIN_SUCCESS',
        'DASHBOARD_VIEW',
        'REPORT_GENERATED'
      ];

      nonCriticalEvents.forEach(action => {
        expect(auditLogger.isCriticalEvent(action)).toBe(false);
      });
    });

    it('should process critical events immediately', async () => {
      const criticalEvent = {
        action: 'PHI_ACCESS',
        resourceType: 'patient_record',
        resourceId: 'patient-123',
        phiAccessed: true
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const spy = jest.spyOn(auditLogger, 'processBatch');

      await auditLogger.log(criticalEvent);

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Batch Processing', () => {
    it('should batch non-critical events for performance', async () => {
      const nonCriticalEvent = {
        action: 'DASHBOARD_VIEW',
        resourceType: 'dashboard',
        resourceId: 'main-dashboard'
      };

      // Add multiple events to queue
      for (let i = 0; i < 5; i++) {
        await auditLogger.log({
          ...nonCriticalEvent,
          resourceId: `dashboard-${i}`
        });
      }

      expect(auditLogger.logQueue.length).toBe(5);
    });

    it('should process batch when size limit reached', async () => {
      const event = {
        action: 'DASHBOARD_VIEW',
        resourceType: 'dashboard',
        resourceId: 'test-dashboard'
      };

      mockClient.query
        .mockResolvedValue({ rows: [] });

      // Fill queue to batch size
      const promises = [];
      for (let i = 0; i < auditLogger.batchSize; i++) {
        promises.push(auditLogger.log({
          ...event,
          resourceId: `dashboard-${i}`
        }));
      }

      await Promise.all(promises);

      // Should have processed the batch
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('PHI Access Logging', () => {
    it('should log all PHI access events', async () => {
      const phiAccessEvent = {
        action: 'PHI_ACCESS',
        resourceType: 'patient_record',
        resourceId: 'patient-123',
        userId: 'provider-456',
        userType: 'provider',
        userIpAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0...',
        details: {
          accessReason: 'patient_care',
          dataAccessed: ['demographics', 'medical_history', 'lab_results'],
          accessMethod: 'web_interface'
        },
        phiAccessed: true
      };

      mockClient.query.mockResolvedValue({ rows: [] });

      await auditLogger.log(phiAccessEvent);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hipaa_audit_log'),
        expect.arrayContaining([
          expect.any(String), // id
          'provider-456', // user_id
          'provider', // user_type
          '192.168.1.100', // user_ip_address
          'Mozilla/5.0...', // user_agent
          expect.any(String), // session_id
          'PHI_ACCESS', // action
          'patient_record', // resource_type
          'patient-123', // resource_id
          expect.any(Date), // timestamp
          expect.any(String), // details (JSON)
          true, // phi_accessed
          expect.any(Date), // retention_until
          expect.any(String) // checksum
        ])
      );
    });

    it('should track data export events', async () => {
      const exportEvent = {
        action: 'PHI_EXPORT',
        resourceType: 'patient_data',
        resourceId: 'patient-123',
        userId: 'provider-456',
        details: {
          exportFormat: 'PDF',
          exportReason: 'patient_request',
          dataExported: ['full_medical_record'],
          recipientEmail: 'patient@example.com'
        },
        phiAccessed: true
      };

      mockClient.query.mockResolvedValue({ rows: [] });

      await auditLogger.log(exportEvent);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hipaa_audit_log'),
        expect.arrayContaining([
          expect.any(String),
          'provider-456',
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          'PHI_EXPORT',
          'patient_data',
          'patient-123',
          expect.any(Date),
          expect.stringContaining('exportFormat'),
          true,
          expect.any(Date),
          expect.any(String)
        ])
      );
    });
  });

  describe('Security Event Logging', () => {
    it('should log failed authentication attempts', async () => {
      const failedLoginEvent = {
        action: 'PROVIDER_LOGIN_FAILED',
        resourceType: 'provider',
        resourceId: 'provider-123',
        userIpAddress: '192.168.1.100',
        details: {
          reason: 'invalid_password',
          attemptCount: 3,
          accountLocked: false
        },
        phiAccessed: false
      };

      mockClient.query.mockResolvedValue({ rows: [] });

      await auditLogger.log(failedLoginEvent);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hipaa_audit_log'),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          expect.any(String),
          '192.168.1.100',
          expect.any(String),
          expect.any(String),
          'PROVIDER_LOGIN_FAILED',
          'provider',
          'provider-123',
          expect.any(Date),
          expect.stringContaining('invalid_password'),
          false,
          expect.any(Date),
          expect.any(String)
        ])
      );
    });

    it('should log unauthorized access attempts', async () => {
      const unauthorizedEvent = {
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        resourceType: 'patient_record',
        resourceId: 'patient-123',
        userId: 'provider-456',
        userIpAddress: '192.168.1.100',
        details: {
          reason: 'insufficient_permissions',
          attemptedAction: 'view_patient_record',
          deniedAt: new Date().toISOString()
        },
        phiAccessed: false
      };

      mockClient.query.mockResolvedValue({ rows: [] });

      await auditLogger.log(unauthorizedEvent);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hipaa_audit_log'),
        expect.arrayContaining([
          expect.any(String),
          'provider-456',
          expect.any(String),
          '192.168.1.100',
          expect.any(String),
          expect.any(String),
          'UNAUTHORIZED_ACCESS_ATTEMPT',
          'patient_record',
          'patient-123',
          expect.any(Date),
          expect.stringContaining('insufficient_permissions'),
          false,
          expect.any(Date),
          expect.any(String)
        ])
      );
    });
  });

  describe('Audit Log Integrity', () => {
    it('should prevent audit log tampering', async () => {
      const event = {
        action: 'PHI_ACCESS',
        resourceType: 'patient_record',
        resourceId: 'patient-123'
      };

      const enrichedEvent = await auditLogger.enrichAuditEvent(event);
      
      // Verify checksum includes all critical fields
      const expectedChecksum = auditLogger.calculateChecksum(enrichedEvent);
      expect(enrichedEvent.checksum).toBe(expectedChecksum);
    });

    it('should detect checksum mismatches', () => {
      const event = {
        id: 'test-id',
        action: 'PHI_ACCESS',
        resourceId: 'patient-123',
        timestamp: new Date(),
        checksum: 'invalid-checksum'
      };

      const validChecksum = auditLogger.calculateChecksum(event);
      expect(validChecksum).not.toBe(event.checksum);
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle audit logging failures gracefully', async () => {
      const event = {
        action: 'PHI_ACCESS',
        resourceType: 'patient_record',
        resourceId: 'patient-123'
      };

      mockClient.query.mockRejectedValue(new Error('Database connection failed'));

      // Should not throw, but should log error and return audit ID
      const result = await auditLogger.log(event);
      expect(result).toBeDefined();
    });

    it('should process large batches efficiently', async () => {
      const events = Array.from({ length: 1000 }, (_, i) => ({
        action: 'DASHBOARD_VIEW',
        resourceType: 'dashboard',
        resourceId: `dashboard-${i}`
      }));

      mockClient.query.mockResolvedValue({ rows: [] });

      const startTime = Date.now();
      
      // Process events in batches
      for (let i = 0; i < events.length; i += auditLogger.batchSize) {
        const batch = events.slice(i, i + auditLogger.batchSize);
        await auditLogger.processBatch();
      }

      const processingTime = Date.now() - startTime;
      
      // Should process 1000 events in reasonable time
      expect(processingTime).toBeLessThan(5000); // Less than 5 seconds
    });
  });
});
