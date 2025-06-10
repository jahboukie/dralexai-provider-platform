/**
 * FHIR R4 Compliance API
 * Fast Healthcare Interoperability Resources (FHIR) R4 implementation
 * Standardized healthcare data exchange with external systems
 */

const express = require('express');
const router = express.Router();
const database = require('../services/database');
const PHIEncryptionService = require('../services/encryption');
const auditLogger = require('../services/audit-logger');
const authenticateProvider = require('../middleware/auth');
const logger = require('../services/logger');

const encryptionService = new PHIEncryptionService();

// Apply authentication to all FHIR routes
router.use(authenticateProvider);

/**
 * FHIR Patient Resource
 * GET /api/fhir/Patient/:patientId
 */
router.get('/Patient/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        const providerId = req.user.providerId;

        // Verify patient access
        const patientResult = await database.query(`
            SELECT 
                p.id, p.medical_record_number, p.gender, p.preferred_language,
                p.first_name_encrypted, p.last_name_encrypted, p.date_of_birth_encrypted,
                p.phone_encrypted, p.email_encrypted, p.address_encrypted,
                p.created_at, p.updated_at
            FROM patients p
            WHERE p.id = $1 AND p.provider_id = $2
        `, [patientId, providerId]);

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'not-found',
                    diagnostics: 'Patient not found or access denied'
                }]
            });
        }

        const patient = patientResult.rows[0];

        // Decrypt patient data
        const firstName = await encryptionService.decryptPHI(
            JSON.parse(patient.first_name_encrypted),
            patientId,
            'fhir_export'
        );
        const lastName = await encryptionService.decryptPHI(
            JSON.parse(patient.last_name_encrypted),
            patientId,
            'fhir_export'
        );
        const dateOfBirth = await encryptionService.decryptPHI(
            JSON.parse(patient.date_of_birth_encrypted),
            patientId,
            'fhir_export'
        );

        // Convert to FHIR Patient resource
        const fhirPatient = {
            resourceType: 'Patient',
            id: patientId,
            meta: {
                versionId: '1',
                lastUpdated: patient.updated_at,
                profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient']
            },
            identifier: [{
                use: 'usual',
                type: {
                    coding: [{
                        system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                        code: 'MR',
                        display: 'Medical Record Number'
                    }]
                },
                value: patient.medical_record_number
            }],
            active: true,
            name: [{
                use: 'official',
                family: lastName,
                given: [firstName]
            }],
            gender: mapGenderToFHIR(patient.gender),
            birthDate: dateOfBirth.split('T')[0], // YYYY-MM-DD format
            communication: [{
                language: {
                    coding: [{
                        system: 'urn:ietf:bcp:47',
                        code: mapLanguageToFHIR(patient.preferred_language),
                        display: patient.preferred_language
                    }]
                },
                preferred: true
            }]
        };

        // Add contact information if available
        if (patient.phone_encrypted) {
            const phone = await encryptionService.decryptPHI(
                JSON.parse(patient.phone_encrypted),
                patientId,
                'fhir_export'
            );
            fhirPatient.telecom = [{
                system: 'phone',
                value: phone,
                use: 'mobile'
            }];
        }

        if (patient.email_encrypted) {
            const email = await encryptionService.decryptPHI(
                JSON.parse(patient.email_encrypted),
                patientId,
                'fhir_export'
            );
            if (!fhirPatient.telecom) fhirPatient.telecom = [];
            fhirPatient.telecom.push({
                system: 'email',
                value: email,
                use: 'home'
            });
        }

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'FHIR_PATIENT_EXPORTED',
            resourceType: 'patient',
            resourceId: patientId,
            details: {
                fhirVersion: 'R4',
                exportedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json(fhirPatient);

    } catch (error) {
        logger.error('FHIR Patient export failed:', error);
        res.status(500).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'exception',
                diagnostics: 'Internal server error during FHIR export'
            }]
        });
    }
});

/**
 * FHIR Observation Resource (Vital Signs)
 * GET /api/fhir/Observation
 */
router.get('/Observation', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { patient, category, code, date } = req.query;

        if (!patient) {
            return res.status(400).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'required',
                    diagnostics: 'Patient parameter is required'
                }]
            });
        }

        // Get vital signs observations
        let query = `
            SELECT vs.*, p.medical_record_number
            FROM vital_signs vs
            JOIN patients p ON vs.patient_id = p.id
            WHERE p.id = $1 AND p.provider_id = $2
        `;
        const params = [patient, providerId];

        if (date) {
            query += ` AND DATE(vs.measured_at) = $3`;
            params.push(date);
        }

        query += ` ORDER BY vs.measured_at DESC LIMIT 50`;

        const result = await database.query(query, params);

        // Convert to FHIR Observation resources
        const observations = [];

        for (const vs of result.rows) {
            // Blood Pressure
            if (vs.systolic_bp && vs.diastolic_bp) {
                observations.push(createBloodPressureObservation(vs, patient));
            }

            // Heart Rate
            if (vs.heart_rate) {
                observations.push(createHeartRateObservation(vs, patient));
            }

            // Body Temperature
            if (vs.temperature) {
                observations.push(createTemperatureObservation(vs, patient));
            }

            // BMI
            if (vs.bmi) {
                observations.push(createBMIObservation(vs, patient));
            }

            // Weight
            if (vs.weight_kg) {
                observations.push(createWeightObservation(vs, patient));
            }

            // Height
            if (vs.height_cm) {
                observations.push(createHeightObservation(vs, patient));
            }
        }

        // Create FHIR Bundle
        const bundle = {
            resourceType: 'Bundle',
            id: `observations-${patient}-${Date.now()}`,
            meta: {
                lastUpdated: new Date().toISOString()
            },
            type: 'searchset',
            total: observations.length,
            entry: observations.map(obs => ({
                fullUrl: `${req.protocol}://${req.get('host')}/api/fhir/Observation/${obs.id}`,
                resource: obs
            }))
        };

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'FHIR_OBSERVATIONS_EXPORTED',
            resourceType: 'observation',
            resourceId: patient,
            details: {
                observationCount: observations.length,
                fhirVersion: 'R4',
                exportedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json(bundle);

    } catch (error) {
        logger.error('FHIR Observation export failed:', error);
        res.status(500).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'exception',
                diagnostics: 'Internal server error during FHIR export'
            }]
        });
    }
});

/**
 * FHIR Condition Resource
 * GET /api/fhir/Condition
 */
router.get('/Condition', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { patient } = req.query;

        if (!patient) {
            return res.status(400).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'required',
                    diagnostics: 'Patient parameter is required'
                }]
            });
        }

        // Get conditions from SOAP notes (ICD codes)
        const result = await database.query(`
            SELECT sn.id, sn.icd_codes, sn.created_at, sn.assessment_encrypted
            FROM soap_notes sn
            JOIN patients p ON sn.patient_id = p.id
            WHERE p.id = $1 AND p.provider_id = $2
            AND sn.icd_codes IS NOT NULL
            ORDER BY sn.created_at DESC
        `, [patient, providerId]);

        const conditions = [];

        for (const note of result.rows) {
            if (note.icd_codes && note.icd_codes.length > 0) {
                for (const icdCode of note.icd_codes) {
                    conditions.push(createConditionResource(note, icdCode, patient));
                }
            }
        }

        // Create FHIR Bundle
        const bundle = {
            resourceType: 'Bundle',
            id: `conditions-${patient}-${Date.now()}`,
            meta: {
                lastUpdated: new Date().toISOString()
            },
            type: 'searchset',
            total: conditions.length,
            entry: conditions.map(condition => ({
                fullUrl: `${req.protocol}://${req.get('host')}/api/fhir/Condition/${condition.id}`,
                resource: condition
            }))
        };

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'FHIR_CONDITIONS_EXPORTED',
            resourceType: 'condition',
            resourceId: patient,
            details: {
                conditionCount: conditions.length,
                fhirVersion: 'R4',
                exportedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json(bundle);

    } catch (error) {
        logger.error('FHIR Condition export failed:', error);
        res.status(500).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'exception',
                diagnostics: 'Internal server error during FHIR export'
            }]
        });
    }
});

/**
 * FHIR Capability Statement
 * GET /api/fhir/metadata
 */
router.get('/metadata', async (req, res) => {
    try {
        const capabilityStatement = {
            resourceType: 'CapabilityStatement',
            id: 'dralexai-provider-platform',
            meta: {
                lastUpdated: new Date().toISOString()
            },
            url: `${req.protocol}://${req.get('host')}/api/fhir/metadata`,
            version: '1.0.0',
            name: 'DrAlexAIProviderPlatform',
            title: 'Dr. Alex AI Provider Platform FHIR R4 API',
            status: 'active',
            experimental: false,
            date: new Date().toISOString(),
            publisher: 'Dr. Alex AI',
            description: 'FHIR R4 API for Dr. Alex AI Provider Platform with menopause specialty support',
            kind: 'instance',
            software: {
                name: 'Dr. Alex AI Provider Platform',
                version: '1.0.0'
            },
            implementation: {
                description: 'Dr. Alex AI Provider Platform FHIR R4 Implementation',
                url: `${req.protocol}://${req.get('host')}/api/fhir`
            },
            fhirVersion: '4.0.1',
            format: ['json'],
            rest: [{
                mode: 'server',
                security: {
                    cors: true,
                    service: [{
                        coding: [{
                            system: 'http://terminology.hl7.org/CodeSystem/restful-security-service',
                            code: 'OAuth',
                            display: 'OAuth'
                        }]
                    }],
                    description: 'OAuth 2.0 with provider authentication'
                },
                resource: [
                    {
                        type: 'Patient',
                        interaction: [
                            { code: 'read' },
                            { code: 'search-type' }
                        ],
                        searchParam: [
                            { name: 'identifier', type: 'token' },
                            { name: 'name', type: 'string' },
                            { name: 'birthdate', type: 'date' }
                        ]
                    },
                    {
                        type: 'Observation',
                        interaction: [
                            { code: 'read' },
                            { code: 'search-type' }
                        ],
                        searchParam: [
                            { name: 'patient', type: 'reference' },
                            { name: 'category', type: 'token' },
                            { name: 'code', type: 'token' },
                            { name: 'date', type: 'date' }
                        ]
                    },
                    {
                        type: 'Condition',
                        interaction: [
                            { code: 'read' },
                            { code: 'search-type' }
                        ],
                        searchParam: [
                            { name: 'patient', type: 'reference' },
                            { name: 'category', type: 'token' },
                            { name: 'code', type: 'token' }
                        ]
                    }
                ]
            }]
        };

        res.json(capabilityStatement);

    } catch (error) {
        logger.error('FHIR Capability Statement failed:', error);
        res.status(500).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'exception',
                diagnostics: 'Internal server error'
            }]
        });
    }
});

/**
 * Utility functions for FHIR resource creation
 */
function mapGenderToFHIR(gender) {
    const genderMap = {
        'male': 'male',
        'female': 'female',
        'other': 'other',
        'unknown': 'unknown'
    };
    return genderMap[gender?.toLowerCase()] || 'unknown';
}

function mapLanguageToFHIR(language) {
    const languageMap = {
        'English': 'en',
        'Spanish': 'es',
        'French': 'fr',
        'German': 'de',
        'Italian': 'it',
        'Portuguese': 'pt',
        'Chinese': 'zh',
        'Japanese': 'ja',
        'Korean': 'ko',
        'Arabic': 'ar'
    };
    return languageMap[language] || 'en';
}

function createBloodPressureObservation(vitalSigns, patientId) {
    return {
        resourceType: 'Observation',
        id: `bp-${vitalSigns.id}`,
        meta: {
            profile: ['http://hl7.org/fhir/StructureDefinition/bp']
        },
        status: 'final',
        category: [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
                display: 'Vital Signs'
            }]
        }],
        code: {
            coding: [{
                system: 'http://loinc.org',
                code: '85354-9',
                display: 'Blood pressure panel with all children optional'
            }]
        },
        subject: {
            reference: `Patient/${patientId}`
        },
        effectiveDateTime: vitalSigns.measured_at,
        component: [
            {
                code: {
                    coding: [{
                        system: 'http://loinc.org',
                        code: '8480-6',
                        display: 'Systolic blood pressure'
                    }]
                },
                valueQuantity: {
                    value: vitalSigns.systolic_bp,
                    unit: 'mmHg',
                    system: 'http://unitsofmeasure.org',
                    code: 'mm[Hg]'
                }
            },
            {
                code: {
                    coding: [{
                        system: 'http://loinc.org',
                        code: '8462-4',
                        display: 'Diastolic blood pressure'
                    }]
                },
                valueQuantity: {
                    value: vitalSigns.diastolic_bp,
                    unit: 'mmHg',
                    system: 'http://unitsofmeasure.org',
                    code: 'mm[Hg]'
                }
            }
        ]
    };
}

function createHeartRateObservation(vitalSigns, patientId) {
    return {
        resourceType: 'Observation',
        id: `hr-${vitalSigns.id}`,
        status: 'final',
        category: [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
                display: 'Vital Signs'
            }]
        }],
        code: {
            coding: [{
                system: 'http://loinc.org',
                code: '8867-4',
                display: 'Heart rate'
            }]
        },
        subject: {
            reference: `Patient/${patientId}`
        },
        effectiveDateTime: vitalSigns.measured_at,
        valueQuantity: {
            value: vitalSigns.heart_rate,
            unit: 'beats/min',
            system: 'http://unitsofmeasure.org',
            code: '/min'
        }
    };
}

function createTemperatureObservation(vitalSigns, patientId) {
    return {
        resourceType: 'Observation',
        id: `temp-${vitalSigns.id}`,
        status: 'final',
        category: [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
                display: 'Vital Signs'
            }]
        }],
        code: {
            coding: [{
                system: 'http://loinc.org',
                code: '8310-5',
                display: 'Body temperature'
            }]
        },
        subject: {
            reference: `Patient/${patientId}`
        },
        effectiveDateTime: vitalSigns.measured_at,
        valueQuantity: {
            value: vitalSigns.temperature,
            unit: vitalSigns.temperature_unit === 'C' ? 'Cel' : '[degF]',
            system: 'http://unitsofmeasure.org',
            code: vitalSigns.temperature_unit === 'C' ? 'Cel' : '[degF]'
        }
    };
}

function createBMIObservation(vitalSigns, patientId) {
    return {
        resourceType: 'Observation',
        id: `bmi-${vitalSigns.id}`,
        status: 'final',
        category: [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
                display: 'Vital Signs'
            }]
        }],
        code: {
            coding: [{
                system: 'http://loinc.org',
                code: '39156-5',
                display: 'Body mass index (BMI) [Ratio]'
            }]
        },
        subject: {
            reference: `Patient/${patientId}`
        },
        effectiveDateTime: vitalSigns.measured_at,
        valueQuantity: {
            value: vitalSigns.bmi,
            unit: 'kg/m2',
            system: 'http://unitsofmeasure.org',
            code: 'kg/m2'
        }
    };
}

function createWeightObservation(vitalSigns, patientId) {
    return {
        resourceType: 'Observation',
        id: `weight-${vitalSigns.id}`,
        status: 'final',
        category: [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
                display: 'Vital Signs'
            }]
        }],
        code: {
            coding: [{
                system: 'http://loinc.org',
                code: '29463-7',
                display: 'Body weight'
            }]
        },
        subject: {
            reference: `Patient/${patientId}`
        },
        effectiveDateTime: vitalSigns.measured_at,
        valueQuantity: {
            value: vitalSigns.weight_kg,
            unit: 'kg',
            system: 'http://unitsofmeasure.org',
            code: 'kg'
        }
    };
}

function createHeightObservation(vitalSigns, patientId) {
    return {
        resourceType: 'Observation',
        id: `height-${vitalSigns.id}`,
        status: 'final',
        category: [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
                display: 'Vital Signs'
            }]
        }],
        code: {
            coding: [{
                system: 'http://loinc.org',
                code: '8302-2',
                display: 'Body height'
            }]
        },
        subject: {
            reference: `Patient/${patientId}`
        },
        effectiveDateTime: vitalSigns.measured_at,
        valueQuantity: {
            value: vitalSigns.height_cm,
            unit: 'cm',
            system: 'http://unitsofmeasure.org',
            code: 'cm'
        }
    };
}

function createConditionResource(soapNote, icdCode, patientId) {
    return {
        resourceType: 'Condition',
        id: `condition-${soapNote.id}-${icdCode.code}`,
        clinicalStatus: {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                code: 'active',
                display: 'Active'
            }]
        },
        verificationStatus: {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
                code: 'confirmed',
                display: 'Confirmed'
            }]
        },
        category: [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'encounter-diagnosis',
                display: 'Encounter Diagnosis'
            }]
        }],
        code: {
            coding: [{
                system: 'http://hl7.org/fhir/sid/icd-10-cm',
                code: icdCode.code,
                display: icdCode.description
            }]
        },
        subject: {
            reference: `Patient/${patientId}`
        },
        recordedDate: soapNote.created_at
    };
}

module.exports = router;
