const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const db = require('../utils/database');
const logger = require('../utils/logger');
const { requireProviderAuth } = require('../middleware/auth');

const router = express.Router();

// Apply provider authentication to all routes
router.use(requireProviderAuth);

// Get provider's patients list
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isLength({ min: 1 }).withMessage('Search term required'),
  query('status').optional().isIn(['active', 'inactive', 'pending']).withMessage('Invalid status'),
  query('onboardingStatus').optional().isIn(['initiated', 'consent_pending', 'forms_pending', 'completed']).withMessage('Invalid onboarding status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      search,
      status,
      onboardingStatus
    } = req.query;

    const offset = (page - 1) * limit;
    const providerId = req.provider.id;

    let query = `
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.date_of_birth,
        u.gender,
        u.created_at,
        u.last_login,
        pp.relationship_type,
        pp.consent_given,
        pp.consent_date,
        pp.created_at as relationship_created,
        po.onboarding_status,
        po.started_at as onboarding_started,
        po.completed_at as onboarding_completed,
        COUNT(pc.id) as communication_count,
        MAX(pc.created_at) as last_communication,
        array_agg(DISTINCT ar.app_name) FILTER (WHERE ar.app_name IS NOT NULL) as active_apps
      FROM users u
      JOIN provider_patients pp ON u.id = pp.patient_id
      LEFT JOIN patient_onboarding po ON u.id = po.patient_id AND po.provider_id = pp.provider_id
      LEFT JOIN patient_communications pc ON u.id = pc.patient_id AND pc.provider_id = pp.provider_id
      LEFT JOIN user_app_subscriptions uas ON u.id = uas.user_id AND uas.subscription_status = 'active'
      LEFT JOIN app_registrations ar ON uas.app_id = ar.id
      WHERE pp.provider_id = $1 AND pp.is_active = true
    `;

    const params = [providerId];
    let paramIndex = 2;

    // Add filters
    if (search) {
      query += ` AND (u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      if (status === 'active') {
        query += ` AND pp.consent_given = true AND u.is_active = true`;
      } else if (status === 'inactive') {
        query += ` AND (pp.consent_given = false OR u.is_active = false)`;
      } else if (status === 'pending') {
        query += ` AND pp.consent_given IS NULL`;
      }
    }

    if (onboardingStatus) {
      query += ` AND po.onboarding_status = $${paramIndex}`;
      params.push(onboardingStatus);
      paramIndex++;
    }

    query += `
      GROUP BY u.id, pp.relationship_type, pp.consent_given, pp.consent_date, 
               pp.created_at, po.onboarding_status, po.started_at, po.completed_at
      ORDER BY pp.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      JOIN provider_patients pp ON u.id = pp.patient_id
      LEFT JOIN patient_onboarding po ON u.id = po.patient_id AND po.provider_id = pp.provider_id
      WHERE pp.provider_id = $1 AND pp.is_active = true
    `;

    const countParams = [providerId];
    let countParamIndex = 2;

    if (search) {
      countQuery += ` AND (u.first_name ILIKE $${countParamIndex} OR u.last_name ILIKE $${countParamIndex} OR u.email ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (status) {
      if (status === 'active') {
        countQuery += ` AND pp.consent_given = true AND u.is_active = true`;
      } else if (status === 'inactive') {
        countQuery += ` AND (pp.consent_given = false OR u.is_active = false)`;
      } else if (status === 'pending') {
        countQuery += ` AND pp.consent_given IS NULL`;
      }
    }

    if (onboardingStatus) {
      countQuery += ` AND po.onboarding_status = $${countParamIndex}`;
      countParams.push(onboardingStatus);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    const patients = result.rows.map(row => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      createdAt: row.created_at,
      lastLogin: row.last_login,
      relationship: {
        type: row.relationship_type,
        consentGiven: row.consent_given,
        consentDate: row.consent_date,
        relationshipCreated: row.relationship_created
      },
      onboarding: {
        status: row.onboarding_status,
        startedAt: row.onboarding_started,
        completedAt: row.onboarding_completed
      },
      activity: {
        communicationCount: parseInt(row.communication_count) || 0,
        lastCommunication: row.last_communication,
        activeApps: row.active_apps || []
      }
    }));

    res.json({
      patients,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      },
      filters: { search, status, onboardingStatus }
    });

  } catch (error) {
    logger.error('Get patients error:', error);
    res.status(500).json({
      error: 'Failed to retrieve patients',
      message: 'An error occurred while fetching patients'
    });
  }
});

// Get individual patient details
router.get('/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const providerId = req.provider.id;

    // Verify provider has access to this patient
    const accessCheck = await db.query(
      'SELECT id FROM provider_patients WHERE provider_id = $1 AND patient_id = $2 AND is_active = true',
      [providerId, patientId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this patient'
      });
    }

    // Get comprehensive patient details
    const patientResult = await db.query(`
      SELECT 
        u.*,
        pp.relationship_type,
        pp.consent_given,
        pp.consent_date,
        po.onboarding_status,
        po.intake_form_data,
        po.medical_history,
        po.current_medications,
        po.allergies,
        po.emergency_contact,
        po.insurance_info,
        po.chief_complaint,
        po.goals,
        array_agg(DISTINCT 
          json_build_object(
            'appName', ar.app_name,
            'subscriptionStatus', uas.subscription_status,
            'subscriptionTier', uas.subscription_tier,
            'startedAt', uas.started_at
          )
        ) FILTER (WHERE ar.app_name IS NOT NULL) as app_subscriptions
      FROM users u
      JOIN provider_patients pp ON u.id = pp.patient_id
      LEFT JOIN patient_onboarding po ON u.id = po.patient_id AND po.provider_id = pp.provider_id
      LEFT JOIN user_app_subscriptions uas ON u.id = uas.user_id
      LEFT JOIN app_registrations ar ON uas.app_id = ar.id
      WHERE u.id = $1 AND pp.provider_id = $2
      GROUP BY u.id, pp.relationship_type, pp.consent_given, pp.consent_date,
               po.onboarding_status, po.intake_form_data, po.medical_history,
               po.current_medications, po.allergies, po.emergency_contact,
               po.insurance_info, po.chief_complaint, po.goals
    `, [patientId, providerId]);

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Patient not found'
      });
    }

    const patient = patientResult.rows[0];

    // Get recent communications
    const communicationsResult = await db.query(`
      SELECT *
      FROM patient_communications
      WHERE patient_id = $1 AND provider_id = $2
      ORDER BY created_at DESC
      LIMIT 10
    `, [patientId, providerId]);

    // Get recent clinical notes
    const notesResult = await db.query(`
      SELECT *
      FROM clinical_notes
      WHERE patient_id = $1 AND provider_id = $2
      ORDER BY created_at DESC
      LIMIT 5
    `, [patientId, providerId]);

    res.json({
      patient: {
        id: patient.id,
        email: patient.email,
        firstName: patient.first_name,
        lastName: patient.last_name,
        phone: patient.phone,
        dateOfBirth: patient.date_of_birth,
        gender: patient.gender,
        createdAt: patient.created_at,
        lastLogin: patient.last_login,
        profileData: patient.profile_data,
        relationship: {
          type: patient.relationship_type,
          consentGiven: patient.consent_given,
          consentDate: patient.consent_date
        },
        onboarding: {
          status: patient.onboarding_status,
          intakeFormData: patient.intake_form_data,
          medicalHistory: patient.medical_history,
          currentMedications: patient.current_medications,
          allergies: patient.allergies,
          emergencyContact: patient.emergency_contact,
          insuranceInfo: patient.insurance_info,
          chiefComplaint: patient.chief_complaint,
          goals: patient.goals
        },
        appSubscriptions: patient.app_subscriptions || []
      },
      recentCommunications: communicationsResult.rows,
      recentNotes: notesResult.rows
    });

  } catch (error) {
    logger.error('Get patient details error:', error);
    res.status(500).json({
      error: 'Failed to retrieve patient details',
      message: 'An error occurred while fetching patient information'
    });
  }
});

// Patient onboarding workflow
router.post('/:patientId/onboarding', [
  body('intakeFormData').optional().isObject(),
  body('medicalHistory').optional().isObject(),
  body('currentMedications').optional().isArray(),
  body('allergies').optional().isArray(),
  body('emergencyContact').optional().isObject(),
  body('insuranceInfo').optional().isObject(),
  body('chiefComplaint').optional().isString(),
  body('goals').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { patientId } = req.params;
    const providerId = req.provider.id;
    const {
      intakeFormData,
      medicalHistory,
      currentMedications,
      allergies,
      emergencyContact,
      insuranceInfo,
      chiefComplaint,
      goals
    } = req.body;

    // Verify provider has access to this patient
    const accessCheck = await db.query(
      'SELECT id FROM provider_patients WHERE provider_id = $1 AND patient_id = $2 AND is_active = true',
      [providerId, patientId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this patient'
      });
    }

    // Get practice ID
    const practiceResult = await db.query(`
      SELECT pp.id as practice_id
      FROM provider_practice_memberships ppm
      JOIN provider_practices pp ON ppm.practice_id = pp.id
      WHERE ppm.provider_id = $1 AND ppm.is_active = true
      ORDER BY ppm.joined_at DESC
      LIMIT 1
    `, [providerId]);

    const practiceId = practiceResult.rows[0]?.practice_id;

    // Update or create onboarding record
    const onboardingResult = await db.query(`
      INSERT INTO patient_onboarding (
        patient_id, provider_id, practice_id, intake_form_data, medical_history,
        current_medications, allergies, emergency_contact, insurance_info,
        chief_complaint, goals, onboarding_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'forms_pending')
      ON CONFLICT (patient_id, provider_id)
      DO UPDATE SET
        intake_form_data = COALESCE($4, patient_onboarding.intake_form_data),
        medical_history = COALESCE($5, patient_onboarding.medical_history),
        current_medications = COALESCE($6, patient_onboarding.current_medications),
        allergies = COALESCE($7, patient_onboarding.allergies),
        emergency_contact = COALESCE($8, patient_onboarding.emergency_contact),
        insurance_info = COALESCE($9, patient_onboarding.insurance_info),
        chief_complaint = COALESCE($10, patient_onboarding.chief_complaint),
        goals = COALESCE($11, patient_onboarding.goals),
        onboarding_status = CASE
          WHEN patient_onboarding.onboarding_status = 'initiated' THEN 'forms_pending'
          ELSE patient_onboarding.onboarding_status
        END,
        updated_at = NOW()
      RETURNING *
    `, [
      patientId, providerId, practiceId,
      JSON.stringify(intakeFormData),
      JSON.stringify(medicalHistory),
      JSON.stringify(currentMedications),
      allergies,
      JSON.stringify(emergencyContact),
      JSON.stringify(insuranceInfo),
      chiefComplaint,
      goals
    ]);

    logger.info(`Patient onboarding updated: ${patientId} by provider ${providerId}`);

    res.json({
      message: 'Onboarding information updated successfully',
      onboarding: onboardingResult.rows[0]
    });

  } catch (error) {
    logger.error('Patient onboarding error:', error);
    res.status(500).json({
      error: 'Failed to update onboarding information',
      message: 'An error occurred while updating patient onboarding'
    });
  }
});

// Patient consent management
router.post('/:patientId/consent', [
  body('consentGiven').isBoolean(),
  body('consentType').optional().isString(),
  body('consentDetails').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { patientId } = req.params;
    const providerId = req.provider.id;
    const { consentGiven, consentType, consentDetails } = req.body;

    // Update consent status
    const result = await db.query(`
      UPDATE provider_patients
      SET consent_given = $1, consent_date = NOW(), updated_at = NOW()
      WHERE provider_id = $2 AND patient_id = $3 AND is_active = true
      RETURNING *
    `, [consentGiven, providerId, patientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Patient relationship not found'
      });
    }

    // Update onboarding status if consent given
    if (consentGiven) {
      await db.query(`
        UPDATE patient_onboarding
        SET onboarding_status = CASE
          WHEN onboarding_status = 'consent_pending' THEN 'forms_pending'
          WHEN onboarding_status = 'initiated' THEN 'forms_pending'
          ELSE onboarding_status
        END,
        updated_at = NOW()
        WHERE patient_id = $1 AND provider_id = $2
      `, [patientId, providerId]);
    }

    logger.info(`Patient consent updated: ${patientId} - ${consentGiven ? 'granted' : 'revoked'}`);

    res.json({
      message: 'Consent status updated successfully',
      consent: {
        given: consentGiven,
        date: new Date().toISOString(),
        type: consentType,
        details: consentDetails
      }
    });

  } catch (error) {
    logger.error('Patient consent error:', error);
    res.status(500).json({
      error: 'Failed to update consent status',
      message: 'An error occurred while updating consent'
    });
  }
});

module.exports = router;
