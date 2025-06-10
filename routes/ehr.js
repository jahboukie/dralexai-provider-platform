/**
 * Electronic Health Records (EHR) System
 * SOAP notes, clinical decision support, and medical record management
 * HIPAA-compliant with comprehensive audit logging
 */

const express = require('express');
const router = express.Router();
const database = require('../services/database');
const PHIEncryptionService = require('../services/encryption');
const auditLogger = require('../services/audit-logger');
const authenticateProvider = require('../middleware/auth');
const logger = require('../services/logger');

const encryptionService = new PHIEncryptionService();

// Apply authentication to all EHR routes
router.use(authenticateProvider);

/**
 * Create SOAP note
 * POST /api/ehr/soap-notes
 */
router.post('/soap-notes', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const {
            patientId,
            subjective,
            objective,
            assessment,
            plan,
            chiefComplaint,
            vitalSigns,
            medications,
            allergies,
            icdCodes,
            cptCodes,
            followUpDate
        } = req.body;

        // Verify patient access
        const patientCheck = await database.query(
            'SELECT id FROM patients WHERE id = $1 AND provider_id = $2',
            [patientId, providerId]
        );

        if (patientCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Patient not found or access denied'
            });
        }

        // Encrypt SOAP note data
        const encryptedSubjective = await encryptionService.encryptPHI(subjective, patientId, 'soap_note');
        const encryptedObjective = await encryptionService.encryptPHI(objective, patientId, 'soap_note');
        const encryptedAssessment = await encryptionService.encryptPHI(assessment, patientId, 'soap_note');
        const encryptedPlan = await encryptionService.encryptPHI(plan, patientId, 'soap_note');
        const encryptedChiefComplaint = await encryptionService.encryptPHI(chiefComplaint, patientId, 'soap_note');

        // Insert SOAP note
        const result = await database.query(`
            INSERT INTO soap_notes (
                patient_id, provider_id, chief_complaint_encrypted,
                subjective_encrypted, objective_encrypted, assessment_encrypted, plan_encrypted,
                vital_signs, medications, allergies, icd_codes, cpt_codes,
                follow_up_date, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id, created_at
        `, [
            patientId, providerId,
            JSON.stringify(encryptedChiefComplaint),
            JSON.stringify(encryptedSubjective),
            JSON.stringify(encryptedObjective),
            JSON.stringify(encryptedAssessment),
            JSON.stringify(encryptedPlan),
            JSON.stringify(vitalSigns),
            JSON.stringify(medications),
            JSON.stringify(allergies),
            JSON.stringify(icdCodes),
            JSON.stringify(cptCodes),
            followUpDate,
            providerId
        ]);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'SOAP_NOTE_CREATED',
            resourceType: 'soap_note',
            resourceId: result.rows[0].id,
            details: {
                patientId,
                noteId: result.rows[0].id,
                icdCodes,
                cptCodes,
                createdAt: result.rows[0].created_at
            },
            phiAccessed: true
        });

        res.status(201).json({
            success: true,
            soapNote: {
                id: result.rows[0].id,
                patientId,
                createdAt: result.rows[0].created_at
            }
        });

    } catch (error) {
        logger.error('SOAP note creation failed:', error);
        res.status(500).json({
            error: 'Failed to create SOAP note',
            message: 'Please try again later'
        });
    }
});

/**
 * Get SOAP notes for patient
 * GET /api/ehr/patients/:patientId/soap-notes
 */
router.get('/patients/:patientId/soap-notes', async (req, res) => {
    try {
        const { patientId } = req.params;
        const providerId = req.user.providerId;
        const { page = 1, limit = 10 } = req.query;

        const offset = (page - 1) * limit;

        // Verify patient access
        const patientCheck = await database.query(
            'SELECT id FROM patients WHERE id = $1 AND provider_id = $2',
            [patientId, providerId]
        );

        if (patientCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Patient not found or access denied'
            });
        }

        // Get SOAP notes
        const result = await database.query(`
            SELECT 
                sn.id, sn.created_at, sn.follow_up_date,
                sn.chief_complaint_encrypted, sn.subjective_encrypted,
                sn.objective_encrypted, sn.assessment_encrypted, sn.plan_encrypted,
                sn.vital_signs, sn.medications, sn.allergies, sn.icd_codes, sn.cpt_codes,
                p.first_name, p.last_name
            FROM soap_notes sn
            JOIN providers p ON sn.provider_id = p.id
            WHERE sn.patient_id = $1 AND sn.provider_id = $2
            ORDER BY sn.created_at DESC
            LIMIT $3 OFFSET $4
        `, [patientId, providerId, limit, offset]);

        // Decrypt SOAP notes
        const soapNotes = await Promise.all(result.rows.map(async (note) => {
            try {
                const chiefComplaint = await encryptionService.decryptPHI(
                    JSON.parse(note.chief_complaint_encrypted),
                    patientId,
                    'soap_note_access'
                );
                const subjective = await encryptionService.decryptPHI(
                    JSON.parse(note.subjective_encrypted),
                    patientId,
                    'soap_note_access'
                );
                const objective = await encryptionService.decryptPHI(
                    JSON.parse(note.objective_encrypted),
                    patientId,
                    'soap_note_access'
                );
                const assessment = await encryptionService.decryptPHI(
                    JSON.parse(note.assessment_encrypted),
                    patientId,
                    'soap_note_access'
                );
                const plan = await encryptionService.decryptPHI(
                    JSON.parse(note.plan_encrypted),
                    patientId,
                    'soap_note_access'
                );

                return {
                    id: note.id,
                    chiefComplaint,
                    subjective,
                    objective,
                    assessment,
                    plan,
                    vitalSigns: note.vital_signs,
                    medications: note.medications,
                    allergies: note.allergies,
                    icdCodes: note.icd_codes,
                    cptCodes: note.cpt_codes,
                    followUpDate: note.follow_up_date,
                    createdAt: note.created_at,
                    provider: {
                        firstName: note.first_name,
                        lastName: note.last_name
                    }
                };
            } catch (error) {
                logger.error(`Failed to decrypt SOAP note ${note.id}:`, error);
                return {
                    id: note.id,
                    error: 'Decryption failed',
                    createdAt: note.created_at
                };
            }
        }));

        // Get total count
        const countResult = await database.query(
            'SELECT COUNT(*) FROM soap_notes WHERE patient_id = $1 AND provider_id = $2',
            [patientId, providerId]
        );

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'SOAP_NOTES_ACCESSED',
            resourceType: 'soap_note',
            resourceId: patientId,
            details: {
                patientId,
                notesCount: soapNotes.length,
                accessedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json({
            soapNotes,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        });

    } catch (error) {
        logger.error('SOAP notes retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve SOAP notes',
            message: 'Please try again later'
        });
    }
});

/**
 * Clinical Decision Support - Drug Interaction Check
 * POST /api/ehr/drug-interactions
 */
router.post('/drug-interactions', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { medications, newMedication } = req.body;

        // Simulate drug interaction checking (would integrate with real drug database)
        const interactions = await checkDrugInteractions(medications, newMedication);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'DRUG_INTERACTION_CHECK',
            resourceType: 'clinical_decision_support',
            details: {
                medicationsChecked: medications.length + 1,
                interactionsFound: interactions.length,
                checkedAt: new Date().toISOString()
            },
            phiAccessed: false
        });

        res.json({
            interactions,
            newMedication,
            riskLevel: calculateInteractionRisk(interactions),
            recommendations: generateInteractionRecommendations(interactions)
        });

    } catch (error) {
        logger.error('Drug interaction check failed:', error);
        res.status(500).json({
            error: 'Failed to check drug interactions',
            message: 'Please try again later'
        });
    }
});

/**
 * Clinical Decision Support - Allergy Alerts
 * POST /api/ehr/allergy-check
 */
router.post('/allergy-check', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { patientId, medication } = req.body;

        // Get patient allergies
        const allergiesResult = await database.query(`
            SELECT allergies_encrypted FROM patients WHERE id = $1 AND provider_id = $2
        `, [patientId, providerId]);

        if (allergiesResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Patient not found or access denied'
            });
        }

        // Decrypt and check allergies
        let allergies = [];
        if (allergiesResult.rows[0].allergies_encrypted) {
            allergies = await encryptionService.decryptPHI(
                JSON.parse(allergiesResult.rows[0].allergies_encrypted),
                patientId,
                'allergy_check'
            );
        }

        const allergyAlerts = checkMedicationAllergies(allergies, medication);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'ALLERGY_CHECK_PERFORMED',
            resourceType: 'clinical_decision_support',
            resourceId: patientId,
            details: {
                patientId,
                medication: medication.name,
                alertsFound: allergyAlerts.length,
                checkedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json({
            allergyAlerts,
            medication,
            riskLevel: allergyAlerts.length > 0 ? 'high' : 'low',
            recommendations: allergyAlerts.length > 0 ? 
                ['Review patient allergies before prescribing', 'Consider alternative medications'] : 
                ['No known allergies to this medication']
        });

    } catch (error) {
        logger.error('Allergy check failed:', error);
        res.status(500).json({
            error: 'Failed to check allergies',
            message: 'Please try again later'
        });
    }
});

/**
 * Utility functions for clinical decision support
 */
async function checkDrugInteractions(medications, newMedication) {
    // Simulate drug interaction database lookup
    const interactions = [];
    
    // Common drug interactions (simplified for demo)
    const interactionDatabase = {
        'warfarin': ['aspirin', 'ibuprofen', 'amoxicillin'],
        'metformin': ['alcohol', 'contrast_dye'],
        'lisinopril': ['potassium', 'nsaids'],
        'simvastatin': ['grapefruit', 'gemfibrozil']
    };

    const newMedName = newMedication.name.toLowerCase();
    
    medications.forEach(med => {
        const medName = med.name.toLowerCase();
        
        if (interactionDatabase[newMedName]?.includes(medName) ||
            interactionDatabase[medName]?.includes(newMedName)) {
            interactions.push({
                medication1: med.name,
                medication2: newMedication.name,
                severity: 'moderate',
                description: `Potential interaction between ${med.name} and ${newMedication.name}`,
                recommendation: 'Monitor patient closely and consider dose adjustment'
            });
        }
    });

    return interactions;
}

function calculateInteractionRisk(interactions) {
    if (interactions.length === 0) return 'low';
    if (interactions.some(i => i.severity === 'severe')) return 'high';
    if (interactions.some(i => i.severity === 'moderate')) return 'moderate';
    return 'low';
}

function generateInteractionRecommendations(interactions) {
    if (interactions.length === 0) {
        return ['No significant drug interactions detected'];
    }
    
    return [
        'Review all drug interactions carefully',
        'Consider alternative medications if possible',
        'Monitor patient for adverse effects',
        'Adjust dosages as needed',
        'Document interaction assessment in patient record'
    ];
}

function checkMedicationAllergies(allergies, medication) {
    const alerts = [];
    
    allergies.forEach(allergy => {
        if (medication.name.toLowerCase().includes(allergy.allergen.toLowerCase()) ||
            medication.class?.toLowerCase().includes(allergy.allergen.toLowerCase())) {
            alerts.push({
                allergen: allergy.allergen,
                reaction: allergy.reaction,
                severity: allergy.severity,
                medication: medication.name,
                alert: `Patient has known allergy to ${allergy.allergen}`
            });
        }
    });

    return alerts;
}

module.exports = router;
