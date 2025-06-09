const jwt = require('jsonwebtoken');
const db = require('../utils/database');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate provider requests
 */
const requireProviderAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token'
      });
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided token is invalid or expired'
      });
    }

    // Check if it's a provider token
    if (decoded.role !== 'provider') {
      return res.status(403).json({
        error: 'Provider access required',
        message: 'This endpoint requires provider privileges'
      });
    }

    // Get provider details from database
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
      WHERE p.id = $1 AND p.is_active = true
      GROUP BY p.id
    `, [decoded.providerId]);

    if (providerResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Provider not found',
        message: 'Provider account not found or inactive'
      });
    }

    const provider = providerResult.rows[0];

    // Add provider info to request
    req.provider = {
      id: provider.id,
      email: provider.email,
      firstName: provider.first_name,
      lastName: provider.last_name,
      specialty: provider.specialty,
      organization: provider.organization,
      subscriptionTier: provider.subscription_tier,
      subscriptionStatus: provider.subscription_status,
      practices: provider.practices || []
    };

    next();

  } catch (error) {
    logger.error('Provider authentication error:', error);
    return res.status(500).json({
      error: 'Authentication service error',
      message: 'An error occurred during authentication'
    });
  }
};

/**
 * Middleware to check if provider has access to specific practice
 */
const requirePracticeAccess = (practiceId) => {
  return (req, res, next) => {
    if (!req.provider) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const hasAccess = req.provider.practices.some(practice => 
      practice.practiceId === practiceId
    );

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Practice access denied',
        message: 'You do not have access to this practice'
      });
    }

    // Add practice info to request
    const practice = req.provider.practices.find(p => p.practiceId === practiceId);
    req.practice = practice;

    next();
  };
};

/**
 * Middleware to check if provider has specific permission
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.provider) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // Check if provider has permission in any of their practices
    const hasPermission = req.provider.practices.some(practice => {
      const permissions = practice.permissions || {};
      return permissions.all === true || permissions[permission] === true;
    });

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Permission denied',
        message: `You do not have the required permission: ${permission}`
      });
    }

    next();
  };
};

/**
 * Middleware to check subscription limits
 */
const checkSubscriptionLimits = (feature) => {
  return async (req, res, next) => {
    try {
      if (!req.provider) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }

      // Get current subscription details
      const subscriptionResult = await db.query(`
        SELECT ps.*, pp.practice_name
        FROM provider_subscriptions ps
        JOIN provider_practices pp ON ps.practice_id = pp.id
        WHERE ps.provider_id = $1 AND ps.status = 'active'
        ORDER BY ps.created_at DESC
        LIMIT 1
      `, [req.provider.id]);

      if (subscriptionResult.rows.length === 0) {
        return res.status(403).json({
          error: 'No active subscription',
          message: 'Please upgrade your subscription to access this feature'
        });
      }

      const subscription = subscriptionResult.rows[0];
      const features = subscription.features || {};

      // Check feature access
      if (features[feature] === false) {
        return res.status(403).json({
          error: 'Feature not available',
          message: `This feature is not available in your ${subscription.subscription_tier} plan`
        });
      }

      // Check usage limits for specific features
      if (feature === 'patient_access') {
        const patientCountResult = await db.query(
          'SELECT COUNT(*) as count FROM provider_patients WHERE provider_id = $1 AND is_active = true',
          [req.provider.id]
        );

        const currentPatients = parseInt(patientCountResult.rows[0].count);
        if (currentPatients >= subscription.max_patients) {
          return res.status(403).json({
            error: 'Patient limit reached',
            message: `You have reached your patient limit of ${subscription.max_patients}. Please upgrade your plan.`
          });
        }
      }

      req.subscription = subscription;
      next();

    } catch (error) {
      logger.error('Subscription check error:', error);
      return res.status(500).json({
        error: 'Subscription service error'
      });
    }
  };
};

module.exports = {
  requireProviderAuth,
  requirePracticeAccess,
  requirePermission,
  checkSubscriptionLimits
};
