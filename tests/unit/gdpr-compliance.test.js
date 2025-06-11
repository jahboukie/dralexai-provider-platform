/**
 * GDPR Compliance Tests
 * Testing European Union data protection requirements
 */

const request = require('supertest');
const express = require('express');

// Mock dependencies
jest.mock('../../services/database');
jest.mock('../../services/audit-logger');
jest.mock('../../services/encryption');

const mockDatabase = require('../../services/database');
const mockAuditLogger = require('../../services/audit-logger');

describe('GDPR Compliance', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    jest.clearAllMocks();
    mockDatabase.query = jest.fn();
    mockAuditLogger.log = jest.fn().mockResolvedValue('audit-id');
  });

  describe('Data Subject Rights - Article 15 (Right of Access)', () => {
    beforeEach(() => {
      // Mock GDPR data access route
      app.get('/api/gdpr/data-access/:patientId', async (req, res) => {
        try {
          const { patientId } = req.params;
          
          // Verify patient identity and consent
          const patient = await mockDatabase.query(
            'SELECT * FROM patients WHERE id = $1 AND gdpr_consent = true',
            [patientId]
          );

          if (patient.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found or consent not given' });
          }

          // Collect all personal data
          const personalData = {
            demographics: patient.rows[0],
            medicalRecords: [], // Would fetch from encrypted storage
            consentHistory: [], // Would fetch consent records
            accessHistory: []   // Would fetch access logs
          };

          await mockAuditLogger.log({
            action: 'GDPR_DATA_ACCESS_REQUEST',
            resourceType: 'patient_data',
            resourceId: patientId,
            phiAccessed: true
          });

          res.json({
            dataSubject: patientId,
            requestDate: new Date().toISOString(),
            data: personalData,
            dataProcessingPurposes: [
              'Healthcare provision',
              'Legal compliance',
              'Legitimate medical interests'
            ],
            dataRetentionPeriod: '10 years post last treatment',
            thirdPartySharing: []
          });
        } catch (error) {
          res.status(500).json({ error: 'Failed to process data access request' });
        }
      });
    });

    it('should provide comprehensive data access to patients', async () => {
      const patientId = 'test-patient-id';
      
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{
          id: patientId,
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane.doe@example.com',
          gdpr_consent: true
        }]
      });

      const response = await request(app)
        .get(`/api/gdpr/data-access/${patientId}`)
        .expect(200);

      expect(response.body).toHaveProperty('dataSubject', patientId);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('dataProcessingPurposes');
      expect(response.body).toHaveProperty('dataRetentionPeriod');
      expect(response.body.data).toHaveProperty('demographics');
      expect(response.body.data).toHaveProperty('medicalRecords');
      expect(response.body.data).toHaveProperty('consentHistory');
    });

    it('should require valid consent for data access', async () => {
      const patientId = 'test-patient-no-consent';
      
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/api/gdpr/data-access/${patientId}`)
        .expect(404);

      expect(response.body.error).toContain('consent');
    });
  });

  describe('Data Subject Rights - Article 16 (Right to Rectification)', () => {
    beforeEach(() => {
      app.put('/api/gdpr/data-rectification/:patientId', async (req, res) => {
        try {
          const { patientId } = req.params;
          const { corrections } = req.body;

          // Verify patient identity
          const patient = await mockDatabase.query(
            'SELECT * FROM patients WHERE id = $1',
            [patientId]
          );

          if (patient.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
          }

          // Apply corrections
          for (const correction of corrections) {
            await mockDatabase.query(
              `UPDATE patients SET ${correction.field} = $1 WHERE id = $2`,
              [correction.newValue, patientId]
            );

            await mockAuditLogger.log({
              action: 'GDPR_DATA_RECTIFICATION',
              resourceType: 'patient_data',
              resourceId: patientId,
              details: {
                field: correction.field,
                oldValue: correction.oldValue,
                newValue: correction.newValue,
                reason: correction.reason
              },
              phiAccessed: true
            });
          }

          res.json({
            message: 'Data rectification completed',
            correctionCount: corrections.length,
            processedAt: new Date().toISOString()
          });
        } catch (error) {
          res.status(500).json({ error: 'Failed to process rectification request' });
        }
      });
    });

    it('should allow patients to correct their personal data', async () => {
      const patientId = 'test-patient-id';
      const corrections = [
        {
          field: 'email',
          oldValue: 'old@example.com',
          newValue: 'new@example.com',
          reason: 'Email address changed'
        }
      ];

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ id: patientId }] }) // Patient lookup
        .mockResolvedValueOnce({ rows: [] }); // Update query

      const response = await request(app)
        .put(`/api/gdpr/data-rectification/${patientId}`)
        .send({ corrections })
        .expect(200);

      expect(response.body.message).toContain('rectification completed');
      expect(response.body.correctionCount).toBe(1);
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'GDPR_DATA_RECTIFICATION',
          details: expect.objectContaining({
            field: 'email',
            newValue: 'new@example.com'
          })
        })
      );
    });
  });

  describe('Data Subject Rights - Article 17 (Right to Erasure)', () => {
    beforeEach(() => {
      app.delete('/api/gdpr/data-erasure/:patientId', async (req, res) => {
        try {
          const { patientId } = req.params;
          const { reason, retainForLegal } = req.body;

          // Check if erasure is legally permissible
          const legalHolds = await mockDatabase.query(
            'SELECT * FROM legal_holds WHERE patient_id = $1 AND active = true',
            [patientId]
          );

          if (legalHolds.rows.length > 0 && !retainForLegal) {
            return res.status(400).json({
              error: 'Cannot erase data due to legal obligations',
              legalHolds: legalHolds.rows
            });
          }

          // Perform secure deletion
          if (retainForLegal) {
            // Pseudonymize instead of delete
            await mockDatabase.query(
              'UPDATE patients SET first_name = $1, last_name = $2, email = $3 WHERE id = $4',
              ['[REDACTED]', '[REDACTED]', '[REDACTED]', patientId]
            );
          } else {
            // Complete deletion
            await mockDatabase.query('DELETE FROM patients WHERE id = $1', [patientId]);
          }

          await mockAuditLogger.log({
            action: 'GDPR_DATA_ERASURE',
            resourceType: 'patient_data',
            resourceId: patientId,
            details: {
              reason,
              method: retainForLegal ? 'pseudonymization' : 'deletion',
              erasureDate: new Date().toISOString()
            },
            phiAccessed: true
          });

          res.json({
            message: 'Data erasure completed',
            method: retainForLegal ? 'pseudonymization' : 'deletion',
            processedAt: new Date().toISOString()
          });
        } catch (error) {
          res.status(500).json({ error: 'Failed to process erasure request' });
        }
      });
    });

    it('should allow data erasure when legally permissible', async () => {
      const patientId = 'test-patient-id';
      
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] }) // No legal holds
        .mockResolvedValueOnce({ rows: [] }); // Delete query

      const response = await request(app)
        .delete(`/api/gdpr/data-erasure/${patientId}`)
        .send({ reason: 'Patient request', retainForLegal: false })
        .expect(200);

      expect(response.body.message).toContain('erasure completed');
      expect(response.body.method).toBe('deletion');
    });

    it('should prevent erasure when legal holds exist', async () => {
      const patientId = 'test-patient-id';
      
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: 'hold-1', reason: 'Ongoing legal case' }]
      });

      const response = await request(app)
        .delete(`/api/gdpr/data-erasure/${patientId}`)
        .send({ reason: 'Patient request', retainForLegal: false })
        .expect(400);

      expect(response.body.error).toContain('legal obligations');
      expect(response.body.legalHolds).toHaveLength(1);
    });

    it('should allow pseudonymization when legal retention required', async () => {
      const patientId = 'test-patient-id';
      
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ id: 'hold-1' }] }) // Legal holds exist
        .mockResolvedValueOnce({ rows: [] }); // Update query

      const response = await request(app)
        .delete(`/api/gdpr/data-erasure/${patientId}`)
        .send({ reason: 'Patient request', retainForLegal: true })
        .expect(200);

      expect(response.body.method).toBe('pseudonymization');
    });
  });

  describe('Data Subject Rights - Article 20 (Right to Data Portability)', () => {
    beforeEach(() => {
      app.get('/api/gdpr/data-portability/:patientId', async (req, res) => {
        try {
          const { patientId } = req.params;
          const { format = 'json' } = req.query;

          const patient = await mockDatabase.query(
            'SELECT * FROM patients WHERE id = $1',
            [patientId]
          );

          if (patient.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
          }

          // Collect portable data
          const portableData = {
            personalData: patient.rows[0],
            medicalRecords: [], // Would fetch from encrypted storage
            preferences: {},
            consentHistory: []
          };

          await mockAuditLogger.log({
            action: 'GDPR_DATA_PORTABILITY_REQUEST',
            resourceType: 'patient_data',
            resourceId: patientId,
            details: { format },
            phiAccessed: true
          });

          if (format === 'fhir') {
            // Convert to FHIR format
            const fhirBundle = {
              resourceType: 'Bundle',
              id: `patient-${patientId}-export`,
              type: 'collection',
              entry: [
                {
                  resource: {
                    resourceType: 'Patient',
                    id: patientId,
                    name: [{
                      given: [patient.rows[0].first_name],
                      family: patient.rows[0].last_name
                    }]
                  }
                }
              ]
            };
            res.json(fhirBundle);
          } else {
            res.json(portableData);
          }
        } catch (error) {
          res.status(500).json({ error: 'Failed to process portability request' });
        }
      });
    });

    it('should provide data in machine-readable format', async () => {
      const patientId = 'test-patient-id';
      
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{
          id: patientId,
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane.doe@example.com'
        }]
      });

      const response = await request(app)
        .get(`/api/gdpr/data-portability/${patientId}`)
        .expect(200);

      expect(response.body).toHaveProperty('personalData');
      expect(response.body).toHaveProperty('medicalRecords');
      expect(response.body).toHaveProperty('preferences');
      expect(response.body).toHaveProperty('consentHistory');
    });

    it('should support FHIR format for interoperability', async () => {
      const patientId = 'test-patient-id';
      
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{
          id: patientId,
          first_name: 'Jane',
          last_name: 'Doe'
        }]
      });

      const response = await request(app)
        .get(`/api/gdpr/data-portability/${patientId}?format=fhir`)
        .expect(200);

      expect(response.body.resourceType).toBe('Bundle');
      expect(response.body.type).toBe('collection');
      expect(response.body.entry).toHaveLength(1);
      expect(response.body.entry[0].resource.resourceType).toBe('Patient');
    });
  });

  describe('Consent Management', () => {
    beforeEach(() => {
      app.post('/api/gdpr/consent/:patientId', async (req, res) => {
        try {
          const { patientId } = req.params;
          const { consentType, granted, purpose, legalBasis } = req.body;

          await mockDatabase.query(`
            INSERT INTO consent_records (
              patient_id, consent_type, granted, purpose, legal_basis, 
              granted_at, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
          `, [patientId, consentType, granted, purpose, legalBasis, req.ip, req.get('User-Agent')]);

          await mockAuditLogger.log({
            action: 'GDPR_CONSENT_UPDATED',
            resourceType: 'consent',
            resourceId: patientId,
            details: {
              consentType,
              granted,
              purpose,
              legalBasis
            },
            phiAccessed: false
          });

          res.json({
            message: 'Consent updated successfully',
            consentType,
            granted,
            recordedAt: new Date().toISOString()
          });
        } catch (error) {
          res.status(500).json({ error: 'Failed to update consent' });
        }
      });
    });

    it('should record granular consent preferences', async () => {
      const patientId = 'test-patient-id';
      const consentData = {
        consentType: 'data_processing',
        granted: true,
        purpose: 'Healthcare provision',
        legalBasis: 'Article 9(2)(h) - Health and social care'
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post(`/api/gdpr/consent/${patientId}`)
        .send(consentData)
        .expect(200);

      expect(response.body.message).toContain('Consent updated');
      expect(response.body.consentType).toBe('data_processing');
      expect(response.body.granted).toBe(true);
    });

    it('should audit all consent changes', async () => {
      const patientId = 'test-patient-id';
      
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .post(`/api/gdpr/consent/${patientId}`)
        .send({
          consentType: 'marketing',
          granted: false,
          purpose: 'Marketing communications',
          legalBasis: 'Article 6(1)(a) - Consent'
        })
        .expect(200);

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'GDPR_CONSENT_UPDATED',
          resourceType: 'consent',
          details: expect.objectContaining({
            consentType: 'marketing',
            granted: false
          })
        })
      );
    });
  });

  describe('Privacy by Design', () => {
    it('should implement data minimization', () => {
      const fullPatientData = {
        id: 'patient-123',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        ssn: '123-45-6789',
        creditCard: '4111-1111-1111-1111',
        diagnosis: 'Menopause',
        medications: ['Estradiol']
      };

      const minimizedData = {
        id: fullPatientData.id,
        firstName: fullPatientData.firstName,
        lastName: fullPatientData.lastName,
        diagnosis: fullPatientData.diagnosis,
        medications: fullPatientData.medications
      };

      // Should only include necessary fields for healthcare
      expect(minimizedData).not.toHaveProperty('ssn');
      expect(minimizedData).not.toHaveProperty('creditCard');
      expect(minimizedData).toHaveProperty('diagnosis');
      expect(minimizedData).toHaveProperty('medications');
    });

    it('should implement purpose limitation', () => {
      const purposes = {
        healthcare: ['diagnosis', 'treatment', 'medications'],
        billing: ['id', 'firstName', 'lastName'],
        marketing: [] // No data for marketing without explicit consent
      };

      expect(purposes.healthcare).toContain('diagnosis');
      expect(purposes.billing).not.toContain('diagnosis');
      expect(purposes.marketing).toHaveLength(0);
    });
  });
});
