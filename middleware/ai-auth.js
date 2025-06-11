const jwt = require('jsonwebtoken')
const database = require('../services/database')
const logger = require('../services/logger')

// AI Assistant Authentication & Revenue Protection Middleware
// Ensures proper tier access and usage tracking

async function authenticateProvider(req, res, next) {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret')

    // Production-only authentication - demo mode removed

    // Get provider details and subscription info for real users
    const providerId = decoded.providerId || decoded.provider_id
    const providerQuery = `
      SELECT p.*, ps.tier, ps.ai_queries_used_month, ps.ai_features_enabled
      FROM providers p
      LEFT JOIN provider_subscriptions ps ON p.id = ps.provider_id
      WHERE p.id = $1 AND p.active = true
    `

    const result = await database.query(providerQuery, [providerId])

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token or inactive provider' })
    }

    const provider = result.rows[0]

    // Add provider info to request
    req.user = {
      provider_id: provider.id,
      subscription_tier: provider.tier || 'essential',
      ai_queries_used: provider.ai_queries_used_month || 0,
      features_enabled: provider.ai_features_enabled || ['basic_navigation', 'simple_explanations'],
      practice_name: provider.practice_name,
      license_number: provider.license_number,
      demo_mode: false
    }

    next()
  } catch (error) {
    logger.error('Provider authentication error:', error)
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Revenue Protection: Validate AI feature access
function validateFeatureAccess(requiredFeature) {
  return (req, res, next) => {
    const userTier = req.user.subscription_tier
    const featuresEnabled = req.user.features_enabled

    if (!featuresEnabled.includes(requiredFeature)) {
      return res.status(403).json({
        error: 'Feature access denied',
        required_feature: requiredFeature,
        current_tier: userTier,
        message: `${requiredFeature} is not available in your current plan`,
        upgrade_required: true,
        available_tiers: getAvailableTiers(requiredFeature)
      })
    }

    next()
  }
}

// Revenue Protection: Track analytics access value
async function trackAnalyticsAccess(analyticsType, depthLevel, dataPointsAccessed = 1) {
  return async (req, res, next) => {
    try {
      const providerId = req.user.provider_id
      const tier = req.user.subscription_tier
      
      // Calculate revenue value of accessed analytics
      const revenueValue = calculateAnalyticsValue(analyticsType, depthLevel)
      
      // Log analytics access for revenue tracking
      const logQuery = `
        INSERT INTO analytics_access_log 
        (provider_id, tier, analytics_type, depth_level, data_points_accessed, revenue_value)
        VALUES ($1, $2, $3, $4, $5, $6)
      `
      
      await database.query(logQuery, [
        providerId, tier, analyticsType, depthLevel, dataPointsAccessed, revenueValue
      ])

      // Add tracking info to request for downstream use
      req.analytics_tracking = {
        type: analyticsType,
        depth: depthLevel,
        value: revenueValue
      }

      next()
    } catch (error) {
      logger.error('Analytics tracking error:', error)
      next() // Continue despite tracking error
    }
  }
}

// Usage limit enforcement
async function enforceUsageLimits(req, res, next) {
  try {
    const providerId = req.user.provider_id
    const tier = req.user.subscription_tier

    // Skip usage limits for demo mode
    if (req.user.demo_mode) {
      return next()
    }

    // Check if provider has exceeded monthly AI query limit
    const hasQuotaQuery = `SELECT check_ai_query_limit($1, $2) as has_quota`
    const quotaResult = await database.query(hasQuotaQuery, [providerId, tier])

    if (!quotaResult.rows[0].has_quota) {
      const tierLimits = {
        essential: 50,
        professional: 200,
        enterprise: 1000
      }

      return res.status(429).json({
        error: 'Monthly AI query limit exceeded',
        current_tier: tier,
        monthly_limit: tierLimits[tier],
        upgrade_message: 'Upgrade your subscription to increase limits',
        available_upgrades: getUpgradeOptions(tier)
      })
    }

    next()
  } catch (error) {
    logger.error('Usage limit check error:', error)
    next() // Continue on error - fail open for user experience
  }
}

// Helper functions
function getAvailableTiers(feature) {
  const featureTiers = {
    'clinical_insights': ['professional', 'enterprise'],
    'predictive_analytics': ['enterprise'],
    'emergency_assistance': ['enterprise'],
    'workflow_optimization': ['enterprise'],
    'basic_navigation': ['essential', 'professional', 'enterprise'],
    'simple_explanations': ['essential', 'professional', 'enterprise']
  }
  
  return featureTiers[feature] || []
}

function getUpgradeOptions(currentTier) {
  const upgrades = {
    essential: {
      professional: {
        price: 999,
        additional_queries: 150,
        new_features: ['clinical_insights', 'trend_analysis']
      },
      enterprise: {
        price: 1999,
        additional_queries: 950,
        new_features: ['clinical_insights', 'trend_analysis', 'predictive_analytics', 'emergency_assistance']
      }
    },
    professional: {
      enterprise: {
        price: 1999,
        additional_queries: 800,
        new_features: ['predictive_analytics', 'emergency_assistance', 'workflow_optimization']
      }
    }
  }
  
  return upgrades[currentTier] || {}
}

function calculateAnalyticsValue(analyticsType, depthLevel) {
  const values = {
    correlation_analysis: {
      surface: 2.00,
      intermediate: 15.00,
      full: 50.00
    },
    predictive_insights: {
      surface: 5.00,
      intermediate: 25.00,
      full: 75.00
    },
    patient_trends: {
      surface: 1.00,
      intermediate: 8.00,
      full: 30.00
    },
    clinical_recommendations: {
      surface: 3.00,
      intermediate: 18.00,
      full: 60.00
    }
  }
  
  return values[analyticsType]?.[depthLevel] || 0.00
}

// Rate limiting specifically for AI endpoints
const aiRateLimit = require('express-rate-limit')({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    const tier = req.user?.subscription_tier || 'essential'
    const limits = {
      essential: 5,
      professional: 15,
      enterprise: 30
    }
    return limits[tier]
  },
  message: {
    error: 'AI query rate limit exceeded',
    message: 'Too many AI requests. Please wait before making another request.',
    upgrade_message: 'Upgrade to Professional or Enterprise for higher rate limits'
  },
  standardHeaders: true
})

module.exports = {
  authenticateProvider,
  validateFeatureAccess,
  trackAnalyticsAccess,
  enforceUsageLimits,
  aiRateLimit
}