/**
 * HIPAA-Compliant Patient Management System
 * Comprehensive patient data management with encryption and audit logging
 * Advanced search, filtering, and clinical data organization
 */

const express = require('express');
const router = express.Router();
const database = require('../services/database');
const PHIEncryptionService = require('../services/encryption');
const auditLogger = require('../services/audit-logger');
const demoAuth = require('../middleware/demo-auth');
const logger = require('../services/logger');

const encryptionService = new PHIEncryptionService();

// Apply authentication to all patient routes
router.use(demoAuth);

/**
 * Get all patients for provider with search and filtering
 * GET /api/patients
 */
router.get('/', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const {
            search = '',
            status = 'active',
            riskLevel = '',
            page = 1,
            limit = 20,
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (page - 1) * limit;

        // Build dynamic query with filters
        let query = `
            SELECT
                p.id, p.medical_record_number, p.gender, p.preferred_language,
                p.risk_level, p.is_active, p.created_at, p.updated_at,
                p.first_name_encrypted, p.last_name_encrypted, p.date_of_birth_encrypted,
                p.phone_encrypted, p.email_encrypted,
                ml.id as menowellness_linked
            FROM patients p
            LEFT JOIN menowellness_patients ml ON p.id = ml.patient_id
            WHERE p.provider_id = $1
        `;

        const params = [providerId];
        let paramCount = 1;

        // Add filters
        if (status === 'active') {
            query += ` AND p.is_active = true`;
        } else if (status === 'inactive') {
            query += ` AND p.is_active = false`;
        }

        if (riskLevel) {
            query += ` AND p.risk_level = $${++paramCount}`;
            params.push(riskLevel);
        }

        // Add ordering and pagination
        query += ` ORDER BY p.${sortBy} ${sortOrder}`;
        query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);

        const result = await database.query(query, params);

        // Decrypt patient data for display
        const patients = await Promise.all(result.rows.map(async (patient) => {
            try {
                const firstName = await encryptionService.decryptPHI(
                    JSON.parse(patient.first_name_encrypted),
                    patient.id,
                    'patient_list_access'
                );
                const lastName = await encryptionService.decryptPHI(
                    JSON.parse(patient.last_name_encrypted),
                    patient.id,
                    'patient_list_access'
                );

                // Apply search filter after decryption
                const fullName = `${firstName} ${lastName}`.toLowerCase();
                if (search && !fullName.includes(search.toLowerCase()) &&
                    !patient.medical_record_number.toLowerCase().includes(search.toLowerCase())) {
                    return null;
                }

                return {
                    id: patient.id,
                    medicalRecordNumber: patient.medical_record_number,
                    firstName,
                    lastName,
                    fullName: `${firstName} ${lastName}`,
                    gender: patient.gender,
                    preferredLanguage: patient.preferred_language,
                    riskLevel: patient.risk_level,
                    isActive: patient.is_active,
                    menowellnessLinked: !!patient.menowellness_linked,
                    createdAt: patient.created_at,
                    updatedAt: patient.updated_at
                };
            } catch (error) {
                logger.error(`Failed to decrypt patient ${patient.id}:`, error);
                return {
                    id: patient.id,
                    medicalRecordNumber: patient.medical_record_number,
                    firstName: '[Encrypted]',
                    lastName: '[Encrypted]',
                    fullName: '[Encrypted Data]',
                    error: 'Decryption failed'
                };
            }
        }));

        // Filter out null results from search
        const filteredPatients = patients.filter(p => p !== null);

        // Get total count for pagination
        const countResult = await database.query(
            'SELECT COUNT(*) FROM patients WHERE provider_id = $1 AND is_active = $2',
            [providerId, status === 'active']
        );

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'PATIENT_LIST_ACCESSED',
            resourceType: 'patient',
            details: {
                searchTerm: search,
                filters: { status, riskLevel },
                resultCount: filteredPatients.length,
                accessedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json({
            patients: filteredPatients,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            },
            filters: {
                search,
                status,
                riskLevel,
                sortBy,
                sortOrder
            }
        });

    } catch (error) {
        logger.error('Patient list retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve patient list',
            message: 'Please try again later'
        });
    }
});

/**
 * Get detailed patient information
 * GET /api/patients/:patientId
 */
router.get('/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        const providerId = req.user.providerId;

        // Get patient with all related data
        const patientResult = await database.query(`
            SELECT
                p.*,
                pr.first_name as provider_first_name,
                pr.last_name as provider_last_name,
                ml.consent_status as menowellness_consent,
                ml.data_sharing_level as menowellness_sharing_level,
                ml.last_sync_at as menowellness_last_sync
            FROM patients p
            LEFT JOIN providers pr ON p.primary_provider_id = pr.id
            LEFT JOIN menowellness_patients ml ON p.id = ml.patient_id
            WHERE p.id = $1 AND p.provider_id = $2
        `, [patientId, providerId]);

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Patient not found or access denied'
            });
        }

        const patient = patientResult.rows[0];

        // Decrypt patient data
        const decryptedData = await decryptPatientData(patient);

        // Get recent appointments (placeholder - would need appointments table)
        // const appointmentsResult = await database.query(`
        //     SELECT id, appointment_date, appointment_type, status, notes
        //     FROM appointments
        //     WHERE patient_id = $1
        //     ORDER BY appointment_date DESC
        //     LIMIT 10
        // `, [patientId]);

        // Get recent medical notes (placeholder - would need medical_notes table)
        // const notesResult = await database.query(`
        //     SELECT id, note_type, created_at, created_by, summary
        //     FROM medical_notes
        //     WHERE patient_id = $1
        //     ORDER BY created_at DESC
        //     LIMIT 5
        // `, [patientId]);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'PATIENT_RECORD_ACCESSED',
            resourceType: 'patient',
            resourceId: patientId,
            details: {
                accessType: 'full_record',
                accessedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json({
            patient: {
                ...decryptedData,
                primaryProvider: patient.provider_first_name ? {
                    firstName: patient.provider_first_name,
                    lastName: patient.provider_last_name
                } : null,
                menowellness: {
                    linked: !!patient.menowellness_consent,
                    consentStatus: patient.menowellness_consent,
                    sharingLevel: patient.menowellness_sharing_level,
                    lastSync: patient.menowellness_last_sync
                }
            },
            // recentAppointments: appointmentsResult.rows,
            // recentNotes: notesResult.rows,
            // medications: medicationsResult.rows,
            // allergies: allergiesResult.rows
        });

    } catch (error) {
        logger.error('Patient detail retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve patient details',
            message: 'Please try again later'
        });
    }
});

/**
 * Create new patient
 * POST /api/patients
 */
router.post('/', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const {
            firstName, lastName, dateOfBirth, gender, phone, email,
            address, emergencyContact, insurance, preferredLanguage = 'English'
        } = req.body;

        // Generate medical record number
        const mrn = await generateMedicalRecordNumber();

        // Encrypt patient data
        const encryptedFirstName = await encryptionService.encryptPHI(firstName, null, 'patient_creation');
        const encryptedLastName = await encryptionService.encryptPHI(lastName, null, 'patient_creation');
        const encryptedDOB = await encryptionService.encryptPHI(dateOfBirth, null, 'patient_creation');
        const encryptedPhone = await encryptionService.encryptPHI(phone, null, 'patient_creation');
        const encryptedEmail = await encryptionService.encryptPHI(email, null, 'patient_creation');
        const encryptedAddress = await encryptionService.encryptPHI(address, null, 'patient_creation');
        const encryptedEmergencyContact = await encryptionService.encryptPHI(emergencyContact, null, 'patient_creation');
        const encryptedInsurance = await encryptionService.encryptPHI(insurance, null, 'patient_creation');

        // Insert patient
        const result = await database.query(`
            INSERT INTO patients (
                provider_id, practice_id, medical_record_number,
                first_name_encrypted, last_name_encrypted, date_of_birth_encrypted,
                phone_encrypted, email_encrypted, address_encrypted,
                emergency_contact_encrypted, insurance_info_encrypted,
                gender, preferred_language, primary_provider_id, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id, created_at
        `, [
            providerId, req.user.practiceId, mrn,
            JSON.stringify(encryptedFirstName), JSON.stringify(encryptedLastName), JSON.stringify(encryptedDOB),
            JSON.stringify(encryptedPhone), JSON.stringify(encryptedEmail), JSON.stringify(encryptedAddress),
            JSON.stringify(encryptedEmergencyContact), JSON.stringify(encryptedInsurance),
            gender, preferredLanguage, providerId, providerId
        ]);

        const newPatient = result.rows[0];

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'PATIENT_CREATED',
            resourceType: 'patient',
            resourceId: newPatient.id,
            details: {
                medicalRecordNumber: mrn,
                createdAt: newPatient.created_at
            },
            phiAccessed: true
        });

        res.status(201).json({
            success: true,
            patient: {
                id: newPatient.id,
                medicalRecordNumber: mrn,
                firstName,
                lastName,
                createdAt: newPatient.created_at
            }
        });

    } catch (error) {
        logger.error('Patient creation failed:', error);
        res.status(500).json({
            error: 'Failed to create patient',
            message: 'Please try again later'
        });
    }
});

/**
 * Utility functions
 */
async function decryptPatientData(patient) {
    try {
        const firstName = await encryptionService.decryptPHI(
            JSON.parse(patient.first_name_encrypted),
            patient.id,
            'patient_detail_access'
        );
        const lastName = await encryptionService.decryptPHI(
            JSON.parse(patient.last_name_encrypted),
            patient.id,
            'patient_detail_access'
        );
        const dateOfBirth = await encryptionService.decryptPHI(
            JSON.parse(patient.date_of_birth_encrypted),
            patient.id,
            'patient_detail_access'
        );
        const phone = patient.phone_encrypted ? await encryptionService.decryptPHI(
            JSON.parse(patient.phone_encrypted),
            patient.id,
            'patient_detail_access'
        ) : null;
        const email = patient.email_encrypted ? await encryptionService.decryptPHI(
            JSON.parse(patient.email_encrypted),
            patient.id,
            'patient_detail_access'
        ) : null;

        return {
            id: patient.id,
            medicalRecordNumber: patient.medical_record_number,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            dateOfBirth,
            phone,
            email,
            gender: patient.gender,
            preferredLanguage: patient.preferred_language,
            riskLevel: patient.risk_level,
            isActive: patient.is_active,
            createdAt: patient.created_at,
            updatedAt: patient.updated_at
        };
    } catch (error) {
        logger.error('Patient data decryption failed:', error);
        throw error;
    }
}

async function generateMedicalRecordNumber() {
    // Generate unique MRN with format: MRN-YYYYMMDD-XXXX
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    return `MRN-${date}-${random}`;
}

module.exports = router;
