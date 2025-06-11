const express = require('express');
const { body, query, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const db = require('../utils/database');
const logger = require('../utils/logger');
const { requireProviderAuth } = require('../middleware/auth');
const { SUBSCRIPTION_TIERS, getTierByName, getAllTiers, validateTierLimits } = require('../config/subscription-tiers');

const router = express.Router();

// Apply provider authentication to all routes
router.use(requireProviderAuth);

// Get subscription information
router.get('/subscription', async (req, res) => {
  try {
    const providerId = req.provider.id;

    // Get current subscription details
    const subscriptionResult = await db.query(`
      SELECT 
        ps.*,
        pp.practice_name,
        COUNT(DISTINCT pat.patient_id) as current_patients,
        pu.patients_accessed as monthly_patients_accessed,
        pu.reports_generated as monthly_reports_generated,
        pu.api_calls as monthly_api_calls,
        pu.data_exported_mb as monthly_data_exported
      FROM provider_subscriptions ps
      JOIN provider_practices pp ON ps.practice_id = pp.id
      LEFT JOIN provider_patients pat ON ps.practice_id = pat.practice_id AND pat.is_active = true
      LEFT JOIN provider_usage pu ON ps.provider_id = pu.provider_id 
        AND pu.usage_date >= DATE_TRUNC('month', CURRENT_DATE)
      WHERE ps.provider_id = $1 AND ps.status IN ('active', 'trialing', 'past_due')
      GROUP BY ps.id, pp.practice_name, pu.patients_accessed, pu.reports_generated, 
               pu.api_calls, pu.data_exported_mb
      ORDER BY ps.created_at DESC
      LIMIT 1
    `, [providerId]);

    if (subscriptionResult.rows.length === 0) {
      return res.status(404).json({
        error: 'No active subscription found',
        message: 'Please contact support to set up your subscription'
      });
    }

    const subscription = subscriptionResult.rows[0];

    // Get Stripe subscription details if available
    let stripeSubscription = null;
    if (subscription.stripe_subscription_id) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      } catch (stripeError) {
        logger.warn('Failed to retrieve Stripe subscription:', stripeError);
      }
    }

    // Calculate usage percentages
    const usage = {
      patients: {
        current: parseInt(subscription.current_patients) || 0,
        limit: subscription.max_patients,
        percentage: Math.round(((parseInt(subscription.current_patients) || 0) / subscription.max_patients) * 100)
      },
      monthlyActivity: {
        patientsAccessed: parseInt(subscription.monthly_patients_accessed) || 0,
        reportsGenerated: parseInt(subscription.monthly_reports_generated) || 0,
        apiCalls: parseInt(subscription.monthly_api_calls) || 0,
        dataExported: parseFloat(subscription.monthly_data_exported) || 0
      }
    };

    res.json({
      subscription: {
        id: subscription.id,
        tier: subscription.subscription_tier,
        status: subscription.status,
        billingCycle: subscription.billing_cycle,
        pricePerMonth: parseFloat(subscription.price_per_month),
        maxPatients: subscription.max_patients,
        features: subscription.features,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        trialEnd: subscription.trial_end,
        practiceName: subscription.practice_name
      },
      usage,
      stripeDetails: stripeSubscription ? {
        status: stripeSubscription.status,
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end
      } : null
    });

  } catch (error) {
    logger.error('Get subscription error:', error);
    res.status(500).json({
      error: 'Failed to retrieve subscription information',
      message: 'An error occurred while fetching subscription details'
    });
  }
});

// Get usage statistics
router.get('/usage', [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const providerId = req.provider.id;
    const { startDate, endDate } = req.query;

    // Default to current month if no dates provided
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const end = endDate || new Date().toISOString();

    // Get usage data
    const usageResult = await db.query(`
      SELECT 
        usage_date,
        patients_accessed,
        reports_generated,
        api_calls,
        data_exported_mb,
        features_used
      FROM provider_usage
      WHERE provider_id = $1 
        AND usage_date >= $2::date 
        AND usage_date <= $3::date
      ORDER BY usage_date DESC
    `, [providerId, start, end]);

    // Calculate totals
    const totals = usageResult.rows.reduce((acc, row) => ({
      patientsAccessed: acc.patientsAccessed + (parseInt(row.patients_accessed) || 0),
      reportsGenerated: acc.reportsGenerated + (parseInt(row.reports_generated) || 0),
      apiCalls: acc.apiCalls + (parseInt(row.api_calls) || 0),
      dataExported: acc.dataExported + (parseFloat(row.data_exported_mb) || 0)
    }), {
      patientsAccessed: 0,
      reportsGenerated: 0,
      apiCalls: 0,
      dataExported: 0
    });

    // Get feature usage breakdown
    const featureUsage = {};
    usageResult.rows.forEach(row => {
      if (row.features_used) {
        Object.entries(row.features_used).forEach(([feature, count]) => {
          featureUsage[feature] = (featureUsage[feature] || 0) + count;
        });
      }
    });

    res.json({
      period: { startDate: start, endDate: end },
      dailyUsage: usageResult.rows,
      totals,
      featureUsage
    });

  } catch (error) {
    logger.error('Get usage statistics error:', error);
    res.status(500).json({
      error: 'Failed to retrieve usage statistics',
      message: 'An error occurred while fetching usage data'
    });
  }
});

// Get invoices
router.get('/invoices', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const providerId = req.provider.id;
    const { limit = 10 } = req.query;

    // Get subscription to find Stripe customer ID
    const subscriptionResult = await db.query(
      'SELECT stripe_customer_id FROM provider_subscriptions WHERE provider_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [providerId, 'active']
    );

    if (subscriptionResult.rows.length === 0 || !subscriptionResult.rows[0].stripe_customer_id) {
      return res.json({
        invoices: [],
        message: 'No billing history available'
      });
    }

    const stripeCustomerId = subscriptionResult.rows[0].stripe_customer_id;

    // Get invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: parseInt(limit)
    });

    const formattedInvoices = invoices.data.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amount: invoice.total / 100, // Convert from cents
      currency: invoice.currency.toUpperCase(),
      created: new Date(invoice.created * 1000),
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      paidAt: invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
      description: invoice.description,
      periodStart: new Date(invoice.period_start * 1000),
      periodEnd: new Date(invoice.period_end * 1000)
    }));

    res.json({
      invoices: formattedInvoices
    });

  } catch (error) {
    logger.error('Get invoices error:', error);
    res.status(500).json({
      error: 'Failed to retrieve invoices',
      message: 'An error occurred while fetching billing history'
    });
  }
});

// Update subscription
router.post('/subscription/update', [
  body('tier').isIn(['essential', 'professional', 'premium', 'enterprise_essential', 'enterprise_professional', 'enterprise_unlimited']).withMessage('Invalid subscription tier'),
  body('billingCycle').optional().isIn(['monthly', 'annual']).withMessage('Invalid billing cycle')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { tier, billingCycle = 'monthly' } = req.body;
    const providerId = req.provider.id;

    // Get tier configuration from centralized config
    const tierConfig = getTierByName(tier);
    if (!tierConfig) {
      return res.status(400).json({
        error: 'Invalid subscription tier',
        message: `Tier '${tier}' is not available`
      });
    }

    const price = billingCycle === 'annual' ? tierConfig.priceAnnual : tierConfig.priceMonthly;

    // Get current subscription
    const currentSubscription = await db.query(
      'SELECT * FROM provider_subscriptions WHERE provider_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [providerId, 'active']
    );

    if (currentSubscription.rows.length === 0) {
      return res.status(404).json({
        error: 'No active subscription found'
      });
    }

    const subscription = currentSubscription.rows[0];

    // Update subscription in database
    const updateResult = await db.query(`
      UPDATE provider_subscriptions
      SET subscription_tier = $1, billing_cycle = $2, price_per_month = $3,
          max_patients = $4, max_providers = $5, ai_queries_per_month = $6,
          features = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [
      tier,
      billingCycle,
      billingCycle === 'monthly' ? price : price / 12,
      tierConfig.maxPatients,
      tierConfig.maxProviders,
      tierConfig.aiQueriesPerMonth,
      JSON.stringify(tierConfig.features),
      subscription.id
    ]);

    // TODO: Update Stripe subscription if exists
    if (subscription.stripe_subscription_id) {
      try {
        // This would update the Stripe subscription
        // await stripe.subscriptions.update(subscription.stripe_subscription_id, { ... });
        logger.info(`Stripe subscription update needed for ${subscription.stripe_subscription_id}`);
      } catch (stripeError) {
        logger.error('Stripe subscription update failed:', stripeError);
      }
    }

    logger.info(`Subscription updated: Provider ${providerId} to ${tier} (${billingCycle})`);

    res.json({
      message: 'Subscription updated successfully',
      subscription: updateResult.rows[0]
    });

  } catch (error) {
    logger.error('Update subscription error:', error);
    res.status(500).json({
      error: 'Failed to update subscription',
      message: 'An error occurred while updating the subscription'
    });
  }
});

module.exports = router;
