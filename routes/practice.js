const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const db = require('../utils/database');
const logger = require('../services/logger');
const { requireProviderAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Apply provider authentication to all routes
router.use(requireProviderAuth);

// Get practice information
router.get('/', async (req, res) => {
  try {
    const providerId = req.provider.id;

    // Get practices associated with this provider
    const practicesResult = await db.query(`
      SELECT 
        pp.*,
        ppm.role,
        ppm.permissions,
        ppm.joined_at,
        ps.subscription_tier,
        ps.status as subscription_status,
        ps.current_period_end,
        ps.max_patients,
        COUNT(DISTINCT pat.patient_id) as current_patients,
        COUNT(DISTINCT prov.provider_id) as total_providers
      FROM provider_practices pp
      JOIN provider_practice_memberships ppm ON pp.id = ppm.practice_id
      LEFT JOIN provider_subscriptions ps ON pp.id = ps.practice_id AND ps.status = 'active'
      LEFT JOIN provider_patients pat ON pp.id = pat.practice_id AND pat.is_active = true
      LEFT JOIN provider_practice_memberships prov ON pp.id = prov.practice_id AND prov.is_active = true
      WHERE ppm.provider_id = $1 AND ppm.is_active = true AND pp.is_active = true
      GROUP BY pp.id, ppm.role, ppm.permissions, ppm.joined_at, ps.subscription_tier, 
               ps.status, ps.current_period_end, ps.max_patients
      ORDER BY ppm.joined_at DESC
    `, [providerId]);

    const practices = practicesResult.rows.map(practice => ({
      id: practice.id,
      name: practice.practice_name,
      type: practice.practice_type,
      address: {
        line1: practice.address_line1,
        line2: practice.address_line2,
        city: practice.city,
        state: practice.state,
        zipCode: practice.zip_code,
        country: practice.country
      },
      contact: {
        phone: practice.phone,
        email: practice.email,
        website: practice.website
      },
      credentials: {
        taxId: practice.tax_id,
        npiNumber: practice.npi_number,
        licenseNumbers: practice.license_numbers
      },
      specialties: practice.specialties,
      membership: {
        role: practice.role,
        permissions: practice.permissions,
        joinedAt: practice.joined_at
      },
      subscription: {
        tier: practice.subscription_tier,
        status: practice.subscription_status,
        currentPeriodEnd: practice.current_period_end,
        maxPatients: practice.max_patients,
        currentPatients: parseInt(practice.current_patients) || 0
      },
      stats: {
        totalProviders: parseInt(practice.total_providers) || 0
      },
      createdAt: practice.created_at,
      updatedAt: practice.updated_at
    }));

    res.json({
      practices
    });

  } catch (error) {
    logger.error('Get practice information error:', error);
    res.status(500).json({
      error: 'Failed to retrieve practice information',
      message: 'An error occurred while fetching practice details'
    });
  }
});

// Create new practice
router.post('/', [
  body('practiceName').isLength({ min: 1, max: 200 }).withMessage('Practice name is required'),
  body('practiceType').isIn(['individual', 'group', 'hospital', 'clinic']).withMessage('Invalid practice type'),
  body('address').optional().isObject(),
  body('contact').optional().isObject(),
  body('credentials').optional().isObject(),
  body('specialties').optional().isArray()
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
      practiceName,
      practiceType,
      address = {},
      contact = {},
      credentials = {},
      specialties = []
    } = req.body;

    const providerId = req.provider.id;

    // Create practice and associate provider
    const result = await db.transaction(async (client) => {
      // Create practice
      const practiceResult = await client.query(`
        INSERT INTO provider_practices (
          practice_name, practice_type, address_line1, address_line2, city, state, 
          zip_code, country, phone, email, website, tax_id, npi_number, 
          license_numbers, specialties
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        practiceName,
        practiceType,
        address.line1,
        address.line2,
        address.city,
        address.state,
        address.zipCode,
        address.country || 'US',
        contact.phone,
        contact.email,
        contact.website,
        credentials.taxId,
        credentials.npiNumber,
        JSON.stringify(credentials.licenseNumbers || {}),
        specialties
      ]);

      const practice = practiceResult.rows[0];

      // Associate provider as owner
      await client.query(`
        INSERT INTO provider_practice_memberships (
          provider_id, practice_id, role, permissions
        ) VALUES ($1, $2, 'owner', '{"all": true}'::jsonb)
      `, [providerId, practice.id]);

      // Create initial subscription
      await client.query(`
        INSERT INTO provider_subscriptions (
          provider_id, practice_id, subscription_tier, price_per_month, 
          max_patients, current_period_start, current_period_end, trial_end
        ) VALUES ($1, $2, 'basic', 299.00, 50, NOW(), NOW() + INTERVAL '1 month', NOW() + INTERVAL '14 days')
      `, [providerId, practice.id]);

      return practice;
    });

    logger.info(`New practice created: ${practiceName} by provider ${providerId}`);

    res.status(201).json({
      message: 'Practice created successfully',
      practice: {
        id: result.id,
        name: result.practice_name,
        type: result.practice_type,
        createdAt: result.created_at
      }
    });

  } catch (error) {
    logger.error('Create practice error:', error);
    res.status(500).json({
      error: 'Failed to create practice',
      message: 'An error occurred while creating the practice'
    });
  }
});

// Update practice information
router.put('/:practiceId', [
  requirePermission('practice_management'),
  body('practiceName').optional().isLength({ min: 1, max: 200 }),
  body('practiceType').optional().isIn(['individual', 'group', 'hospital', 'clinic']),
  body('address').optional().isObject(),
  body('contact').optional().isObject(),
  body('credentials').optional().isObject(),
  body('specialties').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { practiceId } = req.params;
    const updates = req.body;
    const providerId = req.provider.id;

    // Verify provider has access to this practice
    const accessCheck = await db.query(`
      SELECT ppm.role, ppm.permissions
      FROM provider_practice_memberships ppm
      WHERE ppm.provider_id = $1 AND ppm.practice_id = $2 AND ppm.is_active = true
    `, [providerId, practiceId]);

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this practice'
      });
    }

    // Build update query
    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (updates.practiceName) {
      updateFields.push(`practice_name = $${paramIndex}`);
      params.push(updates.practiceName);
      paramIndex++;
    }

    if (updates.practiceType) {
      updateFields.push(`practice_type = $${paramIndex}`);
      params.push(updates.practiceType);
      paramIndex++;
    }

    if (updates.address) {
      if (updates.address.line1) {
        updateFields.push(`address_line1 = $${paramIndex}`);
        params.push(updates.address.line1);
        paramIndex++;
      }
      if (updates.address.line2) {
        updateFields.push(`address_line2 = $${paramIndex}`);
        params.push(updates.address.line2);
        paramIndex++;
      }
      if (updates.address.city) {
        updateFields.push(`city = $${paramIndex}`);
        params.push(updates.address.city);
        paramIndex++;
      }
      if (updates.address.state) {
        updateFields.push(`state = $${paramIndex}`);
        params.push(updates.address.state);
        paramIndex++;
      }
      if (updates.address.zipCode) {
        updateFields.push(`zip_code = $${paramIndex}`);
        params.push(updates.address.zipCode);
        paramIndex++;
      }
    }

    if (updates.contact) {
      if (updates.contact.phone) {
        updateFields.push(`phone = $${paramIndex}`);
        params.push(updates.contact.phone);
        paramIndex++;
      }
      if (updates.contact.email) {
        updateFields.push(`email = $${paramIndex}`);
        params.push(updates.contact.email);
        paramIndex++;
      }
      if (updates.contact.website) {
        updateFields.push(`website = $${paramIndex}`);
        params.push(updates.contact.website);
        paramIndex++;
      }
    }

    if (updates.specialties) {
      updateFields.push(`specialties = $${paramIndex}`);
      params.push(updates.specialties);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No valid updates provided'
      });
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(practiceId);

    const updateQuery = `
      UPDATE provider_practices 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(updateQuery, params);

    logger.info(`Practice updated: ${practiceId} by provider ${providerId}`);

    res.json({
      message: 'Practice updated successfully',
      practice: result.rows[0]
    });

  } catch (error) {
    logger.error('Update practice error:', error);
    res.status(500).json({
      error: 'Failed to update practice',
      message: 'An error occurred while updating the practice'
    });
  }
});

module.exports = router;
