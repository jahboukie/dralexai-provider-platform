const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const db = require('../services/database');
const { SupabaseAuth, supabase } = require('../config/supabase');
const logger = require('../services/logger');

const router = express.Router();

// Provider registration
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('firstName').trim().isLength({ min: 1, max: 100 }),
  body('lastName').trim().isLength({ min: 1, max: 100 }),
  body('licenseNumber').optional().isLength({ min: 1, max: 100 }),
  body('specialty').optional().isLength({ min: 1, max: 100 }),
  body('organization').optional().isLength({ min: 1, max: 200 }),
  body('phone').optional().isMobilePhone(),
  body('practiceInfo').optional().isObject()
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
      email,
      password,
      firstName,
      lastName,
      licenseNumber,
      specialty,
      organization,
      phone,
      practiceInfo = {}
    } = req.body;

    // Check if provider already exists
    const existingProvider = await db.query(
      'SELECT id FROM providers WHERE email = $1',
      [email]
    );

    if (existingProvider.rows.length > 0) {
      return res.status(409).json({
        error: 'Provider already exists',
        message: 'An account with this email address already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Start transaction for provider and practice creation
    const result = await db.transaction(async (client) => {
      // Create provider
      const providerResult = await client.query(`
        INSERT INTO providers (
          email, password_hash, first_name, last_name, license_number, 
          specialty, organization, phone, subscription_tier, subscription_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'basic', 'trial')
        RETURNING id, email, first_name, last_name, created_at
      `, [email, passwordHash, firstName, lastName, licenseNumber, specialty, organization, phone]);

      const provider = providerResult.rows[0];

      // Create practice if practice info provided
      let practice = null;
      if (practiceInfo.practiceName) {
        const practiceResult = await client.query(`
          INSERT INTO provider_practices (
            practice_name, practice_type, address_line1, city, state, 
            zip_code, phone, email, specialties
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, practice_name
        `, [
          practiceInfo.practiceName,
          practiceInfo.practiceType || 'individual',
          practiceInfo.address,
          practiceInfo.city,
          practiceInfo.state,
          practiceInfo.zipCode,
          practiceInfo.phone || phone,
          practiceInfo.email || email,
          practiceInfo.specialties || [specialty].filter(Boolean)
        ]);

        practice = practiceResult.rows[0];

        // Link provider to practice
        await client.query(`
          INSERT INTO provider_practice_memberships (
            provider_id, practice_id, role, permissions
          ) VALUES ($1, $2, 'owner', '{"all": true}'::jsonb)
        `, [provider.id, practice.id]);

        // Create initial subscription
        await client.query(`
          INSERT INTO provider_subscriptions (
            provider_id, practice_id, subscription_tier, price_per_month, 
            max_patients, current_period_start, current_period_end, trial_end
          ) VALUES ($1, $2, 'basic', 299.00, 50, NOW(), NOW() + INTERVAL '1 month', NOW() + INTERVAL '14 days')
        `, [provider.id, practice.id]);
      }

      return { provider, practice };
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        providerId: result.provider.id,
        email: result.provider.email,
        role: 'provider'
      },
      process.env.JWT_SECRET || 'dev-secret-key',
      { expiresIn: '24h' }
    );

    logger.info(`New provider registered: ${email}`);

    res.status(201).json({
      message: 'Provider registered successfully',
      provider: {
        id: result.provider.id,
        email: result.provider.email,
        firstName: result.provider.first_name,
        lastName: result.provider.last_name,
        createdAt: result.provider.created_at
      },
      practice: result.practice,
      token,
      expiresIn: '24h'
    });

  } catch (error) {
    logger.error('Provider registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// Provider login with name + email authentication
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Production authentication - Supabase primary, database fallback
    if (supabase) {
      try {
        const result = await SupabaseAuth.loginProvider(email, password);

        // Format response for frontend compatibility
        const response = {
          message: 'Login successful',
          provider: {
            id: result.provider.id,
            email: result.provider.email,
            firstName: result.provider.first_name,
            lastName: result.provider.last_name,
            specialty: result.provider.specialty,
            organization: result.provider.organization,
            subscriptionTier: result.provider.subscription_tier,
            practices: result.provider.provider_practice_memberships || []
          },
          token: result.session.access_token,
          refreshToken: result.session.refresh_token,
          expiresIn: '24h'
        };

        logger.info(`Provider logged in via Supabase: ${email}`);
        return res.json(response);

      } catch (supabaseError) {
        logger.warn('Supabase login failed, trying fallback:', supabaseError.message);
      }
    }

    // Fallback to database authentication if Supabase fails
    if (!db || !db.pool) {
      logger.warn('Database not available, using demo mode');

      // Demo mode for testing - remove in production
      if (email === 'demo@dralexai.com' && password === 'demo123') {
        const demoToken = jwt.sign(
          {
            providerId: 'demo-provider-id',
            email: 'demo@dralexai.com',
            role: 'provider'
          },
          process.env.JWT_SECRET || 'dev-secret-key',
          { expiresIn: '24h' }
        );

        return res.json({
          message: 'Demo login successful',
          provider: {
            id: 'demo-provider-id',
            email: 'demo@dralexai.com',
            firstName: 'Demo',
            lastName: 'Provider',
            specialty: 'Internal Medicine',
            organization: 'Demo Medical Center',
            subscriptionTier: 'professional',
            practices: []
          },
          token: demoToken,
          expiresIn: '24h'
        });
      }

      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Authentication service is currently unavailable. Try demo@dralexai.com / demo123 for testing.'
      });
    }

    // Database fallback authentication
    try {
      const providerResult = await db.query(`
        SELECT
          p.*,
          array_agg(
            json_build_object(
              'practiceId', pr.id,
              'practiceName', pr.practice_name,
              'role', ppm.role,
              'permissions', ppm.permissions
            )
          ) FILTER (WHERE pr.id IS NOT NULL) as practices
        FROM providers p
        LEFT JOIN provider_practice_memberships ppm ON p.id = ppm.provider_id AND ppm.is_active = true
        LEFT JOIN provider_practices pr ON ppm.practice_id = pr.id AND pr.is_active = true
        WHERE p.email = $1
          AND p.is_active = true
        GROUP BY p.id
      `, [email]);

      if (providerResult.rows.length === 0) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      const provider = providerResult.rows[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(password, provider.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          providerId: provider.id,
          email: provider.email,
          role: 'provider',
          practices: provider.practices || []
        },
        process.env.JWT_SECRET || 'dev-secret-key',
        { expiresIn: '24h' }
      );

      // Update last login
      try {
        await db.query(
          'UPDATE providers SET last_login = NOW() WHERE id = $1',
          [provider.id]
        );
      } catch (updateError) {
        logger.warn('Failed to update last login:', updateError);
      }

      logger.info(`Provider logged in via database fallback: ${email}`);

      res.json({
        message: 'Login successful',
        provider: {
          id: provider.id,
          email: provider.email,
          firstName: provider.first_name,
          lastName: provider.last_name,
          specialty: provider.specialty,
          organization: provider.organization,
          subscriptionTier: provider.subscription_tier,
          practices: provider.practices || []
        },
        token,
        expiresIn: '24h'
      });

    } catch (dbError) {
      logger.error('Database fallback authentication failed:', dbError);
      return res.status(500).json({
        error: 'Authentication failed',
        message: 'Unable to authenticate. Please try again later.'
      });
    }

  } catch (error) {
    logger.error('Provider login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login. Please try again.'
    });
  }
});

// Get provider profile
router.get('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get provider with detailed info
    const providerResult = await db.query(`
      SELECT 
        p.*,
        array_agg(
          json_build_object(
            'practiceId', pr.id,
            'practiceName', pr.practice_name,
            'practiceType', pr.practice_type,
            'role', ppm.role,
            'permissions', ppm.permissions,
            'address', json_build_object(
              'line1', pr.address_line1,
              'city', pr.city,
              'state', pr.state,
              'zipCode', pr.zip_code
            )
          )
        ) FILTER (WHERE pr.id IS NOT NULL) as practices
      FROM providers p
      LEFT JOIN provider_practice_memberships ppm ON p.id = ppm.provider_id AND ppm.is_active = true
      LEFT JOIN provider_practices pr ON ppm.practice_id = pr.id AND pr.is_active = true
      WHERE p.id = $1
      GROUP BY p.id
    `, [decoded.providerId]);

    if (providerResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Provider not found'
      });
    }

    const provider = providerResult.rows[0];

    res.json({
      provider: {
        id: provider.id,
        email: provider.email,
        firstName: provider.first_name,
        lastName: provider.last_name,
        licenseNumber: provider.license_number,
        specialty: provider.specialty,
        organization: provider.organization,
        phone: provider.phone,
        subscriptionTier: provider.subscription_tier,
        subscriptionStatus: provider.subscription_status,
        createdAt: provider.created_at,
        lastLogin: provider.last_login,
        practices: provider.practices || []
      }
    });

  } catch (error) {
    logger.error('Get provider profile error:', error);
    res.status(500).json({
      error: 'Profile retrieval failed'
    });
  }
});

// Token verification endpoint with Supabase
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        valid: false,
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7);

    // Production JWT verification
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');



      // Try Supabase token verification if configured
      if (supabase) {
        try {
          const result = await SupabaseAuth.verifySession(token);

          return res.json({
            valid: true,
            provider: {
              id: result.provider.id,
              email: result.provider.email,
              firstName: result.provider.first_name,
              lastName: result.provider.last_name,
              specialty: result.provider.specialty,
              organization: result.provider.organization,
              subscriptionTier: result.provider.subscription_tier
            }
          });

        } catch (supabaseError) {
          logger.warn('Supabase token verification failed, using JWT data:', supabaseError.message);
        }
      }

      // If database is available, verify provider exists
      if (db && db.pool) {
        try {
          const provider = await db.query(
            'SELECT id, email, first_name, last_name, specialty, organization, subscription_tier FROM providers WHERE id = $1',
            [decoded.providerId]
          );

          if (provider.rows.length === 0) {
            return res.status(401).json({
              valid: false,
              error: 'Provider not found'
            });
          }

          return res.json({
            valid: true,
            provider: {
              id: provider.rows[0].id,
              email: provider.rows[0].email,
              firstName: provider.rows[0].first_name,
              lastName: provider.rows[0].last_name,
              specialty: provider.rows[0].specialty,
              organization: provider.rows[0].organization,
              subscriptionTier: provider.rows[0].subscription_tier
            }
          });
        } catch (dbError) {
          logger.warn('Database unavailable during token verification, trusting JWT');
        }
      }

      // Trust JWT token if database is unavailable
      return res.json({
        valid: true,
        provider: {
          id: decoded.providerId,
          email: decoded.email,
          firstName: 'Provider',
          lastName: 'User'
        }
      });

    } catch (jwtError) {
      if (jwtError.name === 'JsonWebTokenError' || jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          valid: false,
          error: 'Invalid or expired token'
        });
      }
      throw jwtError;
    }

  } catch (error) {
    logger.error('Token verification error:', error);
    res.status(500).json({
      valid: false,
      error: 'Token verification failed'
    });
  }
});

module.exports = router;
