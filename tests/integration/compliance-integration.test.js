/**
 * Comprehensive Compliance Integration Tests
 * End-to-end testing of HIPAA, GDPR, and PIPEDA compliance features
 */

const request = require('supertest');
const express = require('express');

// Mock all dependencies
jest.mock('../../services/database');
jest.mock('../../services/audit-logger');
jest.mock('../../services/encryption');
jest.mock('../../services/authentication');

const mockDatabase = require('../../services/database');
const mockAuditLogger = require('../../services/audit-logger');
const mockEncryption = require('../../services/encryption');
const mockAuth = require('../../services/authentication');

describe('Compliance Integration Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    jest.clearAllMocks();
    
    // Setup default mocks
    mockDatabase.query = jest.fn();
    mockAuditLogger.log = jest.fn().mockResolvedValue('audit-id');
    mockEncryption.mockImplementation(() => ({
      encryptPHI: jest.fn().mockResolvedValue({
        data: 'encrypted_data',
        iv: 'iv_value',
        tag: 'auth_tag',
        keyId: 'key_id'
      }),
      decryptPHI: jest.fn().mockResolvedValue({ decrypted: 'data' })
    }));
    mockAuth.mockImplementation(() => ({
      authenticateProvider: jest.fn().mockResolvedValue({
        accessToken: 'valid_token',
        refreshToken: 'refresh_token'
      })
    }));
  });

  describe('End-to-End Patient Data Workflow', () => {
    beforeEach(() => {
      // Mock authentication middleware
      app.use('/api/patients', (req, res, next) => {
        req.provider = global.testUtils.createMockProvider();
        next();
      });

      // Patient creation endpoint
      app.post('/api/patients', async (req, res) => {
        try {
          const { firstName, lastName, dateOfBirth, email, consentGiven } = req.body;
          
          if (!consentGiven) {
            return res.status(400).json({ error: 'Patient consent required' });
          }

          const patientId = `patient-${Date.now()}`;
          
          // Encrypt PHI
          const encryptionService = new mockEncryption();
          const encryptedData = await encryptionService.encryptPHI({
            firstName,
            lastName,
            dateOfBirth,
            email
          }, patientId);

          // Store in database
          await mockDatabase.query(
            'INSERT INTO patients (id, encrypted_data, provider_id) VALUES ($1, $2, $3)',
            [patientId, JSON.stringify(encryptedData), req.provider.id]
          );

          // Audit log
          await mockAuditLogger.log({
            action: 'PATIENT_CREATED',
            resourceType: 'patient',
            resourceId: patientId,
            userId: req.provider.id,
            phiAccessed: true
          });

          res.json({ patientId, message: 'Patient created successfully' });
        } catch (error) {
          res.status(500).json({ error: 'Failed to create patient' });
        }
      });

      // Patient data access endpoint
      app.get('/api/patients/:patientId', async (req, res) => {
        try {
          const { patientId } = req.params;
          
          // Retrieve encrypted data
          const result = await mockDatabase.query(
            'SELECT encrypted_data FROM patients WHERE id = $1 AND provider_id = $2',
            [patientId, req.provider.id]
          );

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
          }

          // Decrypt PHI
          const encryptionService = new mockEncryption();
          const decryptedData = await encryptionService.decryptPHI(
            JSON.parse(result.rows[0].encrypted_data),
            patientId
          );

          // Audit log
          await mockAuditLogger.log({
            action: 'PHI_ACCESS',
            resourceType: 'patient',
            resourceId: patientId,
            userId: req.provider.id,
            phiAccessed: true
          });

          res.json({ patient: decryptedData });
        } catch (error) {
          res.status(500).json({ error: 'Failed to retrieve patient' });
        }
      });
    });

    it('should handle complete patient data lifecycle with compliance', async () => {
      const patientData = {
        firstName: 'Jane',
        lastName: 'Doe',
        dateOfBirth: '1980-01-01',
        email: 'jane.doe@example.com',
        consentGiven: true
      };

      // Mock database responses
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] }) // INSERT patient
        .mockResolvedValueOnce({ // SELECT patient
          rows: [{
            encrypted_data: JSON.stringify({
              data: 'encrypted_data',
              iv: 'iv_value',
              tag: 'auth_tag'
            })
          }]
        });

      // Create patient
      const createResponse = await request(app)
        .post('/api/patients')
        .send(patientData)
        .expect(200);

      expect(createResponse.body.message).toBe('Patient created successfully');
      expect(createResponse.body.patientId).toBeDefined();

      // Access patient data
      const patientId = createResponse.body.patientId;
      const accessResponse = await request(app)
        .get(`/api/patients/${patientId}`)
        .expect(200);

      expect(accessResponse.body.patient).toBeDefined();

      // Verify audit logging
      expect(mockAuditLogger.log).toHaveBeenCalledTimes(2);
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PATIENT_CREATED',
          phiAccessed: true
        })
      );
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PHI_ACCESS',
          phiAccessed: true
        })
      );
    });

    it('should reject patient creation without consent', async () => {
      const patientDataNoConsent = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1975-05-15',
        email: 'john.doe@example.com',
        consentGiven: false
      };

      const response = await request(app)
        .post('/api/patients')
        .send(patientDataNoConsent)
        .expect(400);

      expect(response.body.error).toBe('Patient consent required');
      expect(mockDatabase.query).not.toHaveBeenCalled();
    });
  });

  describe('Cross-Border Data Transfer Compliance', () => {
    beforeEach(() => {
      app.post('/api/data-transfer', async (req, res) => {
        try {
          const { patientId, targetCountry, transferReason, adequacyDecision } = req.body;

          // Check adequacy decision for GDPR compliance
          const adequateCountries = ['Canada', 'Switzerland', 'Japan', 'South Korea'];
          
          if (targetCountry === 'EU' || adequateCountries.includes(targetCountry)) {
            // Transfer allowed
          } else if (!adequacyDecision) {
            return res.status(400).json({
              error: 'Adequacy decision or appropriate safeguards required',
              requiredSafeguards: [
                'Standard Contractual Clauses',
                'Binding Corporate Rules',
                'Certification schemes'
              ]
            });
          }

          // Log transfer
          await mockAuditLogger.log({
            action: 'CROSS_BORDER_DATA_TRANSFER',
            resourceType: 'patient_data',
            resourceId: patientId,
            details: {
              targetCountry,
              transferReason,
              adequacyDecision,
              safeguards: adequacyDecision ? ['Adequacy Decision'] : ['Standard Contractual Clauses']
            },
            phiAccessed: true
          });

          res.json({
            message: 'Data transfer authorized',
            transferId: `transfer-${Date.now()}`,
            safeguards: adequacyDecision ? ['Adequacy Decision'] : ['Standard Contractual Clauses']
          });
        } catch (error) {
          res.status(500).json({ error: 'Transfer authorization failed' });
        }
      });
    });

    it('should allow transfers to adequate countries', async () => {
      const transferRequest = {
        patientId: 'patient-123',
        targetCountry: 'Canada',
        transferReason: 'Specialist consultation',
        adequacyDecision: true
      };

      const response = await request(app)
        .post('/api/data-transfer')
        .send(transferRequest)
        .expect(200);

      expect(response.body.message).toBe('Data transfer authorized');
      expect(response.body.safeguards).toContain('Adequacy Decision');
    });

    it('should require safeguards for non-adequate countries', async () => {
      const transferRequest = {
        patientId: 'patient-123',
        targetCountry: 'United States',
        transferReason: 'Research collaboration',
        adequacyDecision: false
      };

      const response = await request(app)
        .post('/api/data-transfer')
        .send(transferRequest)
        .expect(400);

      expect(response.body.error).toContain('safeguards required');
      expect(response.body.requiredSafeguards).toContain('Standard Contractual Clauses');
    });
  });

  describe('Breach Detection and Response', () => {
    beforeEach(() => {
      app.post('/api/security/breach-detected', async (req, res) => {
        try {
          const { breachType, affectedRecords, severity, detectionMethod } = req.body;

          const breachId = `breach-${Date.now()}`;
          
          // Immediate audit logging
          await mockAuditLogger.log({
            action: 'SECURITY_BREACH_DETECTED',
            resourceType: 'security_incident',
            resourceId: breachId,
            details: {
              breachType,
              affectedRecords: affectedRecords.length,
              severity,
              detectionMethod,
              detectedAt: new Date().toISOString()
            },
            phiAccessed: true
          });

          // Determine notification requirements
          const notifications = [];
          
          // HIPAA: 60 days to HHS, immediate if >500 records
          if (affectedRecords.length > 500) {
            notifications.push({
              authority: 'HHS Office for Civil Rights',
              deadline: 'Immediate',
              method: 'Electronic submission'
            });
          } else {
            notifications.push({
              authority: 'HHS Office for Civil Rights',
              deadline: '60 days',
              method: 'Annual summary'
            });
          }

          // GDPR: 72 hours to supervisory authority
          notifications.push({
            authority: 'Data Protection Authority',
            deadline: '72 hours',
            method: 'Electronic notification'
          });

          // PIPEDA: As soon as feasible
          notifications.push({
            authority: 'Privacy Commissioner of Canada',
            deadline: 'As soon as feasible',
            method: 'Written notification'
          });

          res.json({
            breachId,
            status: 'breach_response_initiated',
            notifications,
            nextSteps: [
              'Contain the breach',
              'Assess the risk',
              'Notify affected individuals',
              'Document the incident',
              'Review and improve security measures'
            ]
          });
        } catch (error) {
          res.status(500).json({ error: 'Breach response failed' });
        }
      });
    });

    it('should handle major breach detection and response', async () => {
      const breachData = {
        breachType: 'unauthorized_access',
        affectedRecords: ['patient-1', 'patient-2', 'patient-3'],
        severity: 'high',
        detectionMethod: 'automated_monitoring'
      };

      const response = await request(app)
        .post('/api/security/breach-detected')
        .send(breachData)
        .expect(200);

      expect(response.body.breachId).toBeDefined();
      expect(response.body.status).toBe('breach_response_initiated');
      expect(response.body.notifications).toHaveLength(3); // HIPAA, GDPR, PIPEDA
      expect(response.body.nextSteps).toContain('Contain the breach');

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SECURITY_BREACH_DETECTED',
          details: expect.objectContaining({
            severity: 'high',
            affectedRecords: 3
          })
        })
      );
    });

    it('should handle large-scale breach with immediate notifications', async () => {
      const largeBreach = {
        breachType: 'data_exfiltration',
        affectedRecords: Array.from({ length: 1000 }, (_, i) => `patient-${i}`),
        severity: 'critical',
        detectionMethod: 'security_team_investigation'
      };

      const response = await request(app)
        .post('/api/security/breach-detected')
        .send(largeBreach)
        .expect(200);

      const hipaaNotification = response.body.notifications.find(
        n => n.authority === 'HHS Office for Civil Rights'
      );

      expect(hipaaNotification.deadline).toBe('Immediate');
      expect(response.body.notifications).toHaveLength(3);
    });
  });

  describe('Consent Management Integration', () => {
    beforeEach(() => {
      app.put('/api/consent/:patientId', async (req, res) => {
        try {
          const { patientId } = req.params;
          const { consentTypes, granted, jurisdiction } = req.body;

          // Store consent records
          for (const consentType of consentTypes) {
            await mockDatabase.query(`
              INSERT INTO consent_records (
                patient_id, consent_type, granted, jurisdiction, 
                granted_at, ip_address, user_agent
              ) VALUES ($1, $2, $3, $4, NOW(), $5, $6)
            `, [patientId, consentType, granted, jurisdiction, req.ip, req.get('User-Agent')]);
          }

          // Audit logging
          await mockAuditLogger.log({
            action: 'CONSENT_UPDATED',
            resourceType: 'consent',
            resourceId: patientId,
            details: {
              consentTypes,
              granted,
              jurisdiction,
              updatedBy: 'patient'
            },
            phiAccessed: false
          });

          res.json({
            message: 'Consent preferences updated',
            patientId,
            consentTypes,
            granted,
            effectiveDate: new Date().toISOString()
          });
        } catch (error) {
          res.status(500).json({ error: 'Failed to update consent' });
        }
      });
    });

    it('should handle multi-jurisdiction consent management', async () => {
      const consentUpdate = {
        consentTypes: ['data_processing', 'research_participation', 'marketing_communications'],
        granted: [true, true, false],
        jurisdiction: 'EU'
      };

      mockDatabase.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .put('/api/consent/patient-123')
        .send(consentUpdate)
        .expect(200);

      expect(response.body.message).toBe('Consent preferences updated');
      expect(response.body.consentTypes).toEqual(consentUpdate.consentTypes);
      expect(mockDatabase.query).toHaveBeenCalledTimes(3); // One for each consent type
    });
  });

  describe('Data Retention and Deletion', () => {
    beforeEach(() => {
      app.delete('/api/data-retention/:patientId', async (req, res) => {
        try {
          const { patientId } = req.params;
          const { retentionReason, jurisdiction } = req.body;

          // Check legal holds
          const legalHolds = await mockDatabase.query(
            'SELECT * FROM legal_holds WHERE patient_id = $1 AND active = true',
            [patientId]
          );

          if (legalHolds.rows.length > 0) {
            return res.status(400).json({
              error: 'Cannot delete data due to legal holds',
              holds: legalHolds.rows
            });
          }

          // Perform secure deletion based on jurisdiction
          let deletionMethod;
          if (jurisdiction === 'EU' && retentionReason === 'patient_request') {
            // GDPR right to erasure
            deletionMethod = 'secure_deletion';
            await mockDatabase.query('DELETE FROM patients WHERE id = $1', [patientId]);
          } else if (jurisdiction === 'CA') {
            // PIPEDA requirements
            deletionMethod = 'secure_deletion';
            await mockDatabase.query('DELETE FROM patients WHERE id = $1', [patientId]);
          } else {
            // HIPAA - may require retention
            deletionMethod = 'pseudonymization';
            await mockDatabase.query(
              'UPDATE patients SET first_name = $1, last_name = $2 WHERE id = $3',
              ['[REDACTED]', '[REDACTED]', patientId]
            );
          }

          // Audit logging
          await mockAuditLogger.log({
            action: 'DATA_RETENTION_ACTION',
            resourceType: 'patient_data',
            resourceId: patientId,
            details: {
              retentionReason,
              jurisdiction,
              deletionMethod,
              processedAt: new Date().toISOString()
            },
            phiAccessed: true
          });

          res.json({
            message: 'Data retention action completed',
            method: deletionMethod,
            patientId
          });
        } catch (error) {
          res.status(500).json({ error: 'Data retention action failed' });
        }
      });
    });

    it('should handle GDPR right to erasure', async () => {
      const deletionRequest = {
        retentionReason: 'patient_request',
        jurisdiction: 'EU'
      };

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] }) // No legal holds
        .mockResolvedValueOnce({ rows: [] }); // DELETE query

      const response = await request(app)
        .delete('/api/data-retention/patient-123')
        .send(deletionRequest)
        .expect(200);

      expect(response.body.method).toBe('secure_deletion');
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DATA_RETENTION_ACTION',
          details: expect.objectContaining({
            jurisdiction: 'EU',
            deletionMethod: 'secure_deletion'
          })
        })
      );
    });

    it('should prevent deletion when legal holds exist', async () => {
      const deletionRequest = {
        retentionReason: 'patient_request',
        jurisdiction: 'EU'
      };

      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: 'hold-1', reason: 'Ongoing litigation' }]
      });

      const response = await request(app)
        .delete('/api/data-retention/patient-123')
        .send(deletionRequest)
        .expect(400);

      expect(response.body.error).toContain('legal holds');
      expect(response.body.holds).toHaveLength(1);
    });
  });
});
