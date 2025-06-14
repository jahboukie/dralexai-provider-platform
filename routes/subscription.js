/**
 * Subscription Management Routes
 * Handles subscription flow from landing page CTAs
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const db = require('../utils/database');
const logger = require('../services/logger');
const { SUBSCRIPTION_TIERS, getTierByName, getAllTiers } = require('../config/subscription-tiers');

const router = express.Router();

// Get all available subscription tiers
router.get('/tiers', async (req, res) => {
  try {
    const tiers = getAllTiers();
    
    // Format for frontend display
    const formattedTiers = Object.entries(tiers).map(([key, tier]) => ({
      id: key,
      name: tier.name,
      category: tier.category,
      priceMonthly: tier.priceMonthly,
      priceAnnual: tier.priceAnnual,
      aiQueriesPerMonth: tier.aiQueriesPerMonth,
      maxProviders: tier.maxProviders,
      maxPatients: tier.maxPatients,
      popular: tier.popular || false,
      contactSales: tier.contact_sales || false,
      features: Object.entries(tier.features)
        .filter(([key, enabled]) => enabled)
        .map(([key, enabled]) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
    }));

    res.json({
      tiers: formattedTiers,
      categories: {
        small_medium: formattedTiers.filter(t => t.category === 'small_medium'),
        enterprise: formattedTiers.filter(t => t.category === 'enterprise')
      }
    });

  } catch (error) {
    logger.error('Get subscription tiers error:', error);
    res.status(500).json({
      error: 'Failed to retrieve subscription tiers'
    });
  }
});

// Start subscription flow from landing page
router.post('/start', [
  body('tier').isIn(['essential', 'professional', 'premium', 'enterprise_essential', 'enterprise_professional', 'enterprise_unlimited']),
  body('billingCycle').optional().isIn(['monthly', 'annual']).withMessage('Invalid billing cycle'),
  body('email').isEmail().normalizeEmail(),
  body('organizationName').optional().trim().isLength({ min: 1, max: 200 }),
  body('contactName').optional().trim().isLength({ min: 1, max: 100 }),
  body('phone').optional().isMobilePhone(),
  body('contactSales').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { tier, billingCycle = 'monthly', email, organizationName, contactName, phone } = req.body;
    
    const tierConfig = getTierByName(tier);
    if (!tierConfig) {
      return res.status(400).json({
        error: 'Invalid subscription tier'
      });
    }

    // Check if this is a contact sales request (can be overridden by contactSales parameter)
    const isContactSalesRequest = req.body.contactSales === true ||
                                 (tierConfig.contact_sales && req.body.contactSales !== false);

    // For enterprise tiers requesting contact sales, create sales lead
    if (isContactSalesRequest) {
      const leadResult = await db.query(`
        INSERT INTO sales_leads (
          email, organization_name, contact_name, phone, 
          requested_tier, billing_cycle, lead_source, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING id
      `, [
        email, 
        organizationName || 'Not provided', 
        contactName || 'Not provided', 
        phone || 'Not provided',
        tier, 
        billingCycle, 
        'landing_page', 
        'new'
      ]);

      logger.info(`Enterprise sales lead created: ${email} for ${tier}`);

      return res.json({
        type: 'contact_sales',
        message: 'Thank you for your interest! Our sales team will contact you within 24 hours.',
        leadId: leadResult.rows[0].id,
        tier: tierConfig.name,
        estimatedPrice: billingCycle === 'annual' ? tierConfig.priceAnnual : tierConfig.priceMonthly
      });
    }

    // For direct subscription (small/medium tiers or enterprise direct purchase), create Stripe checkout session
    const price = billingCycle === 'annual' ? tierConfig.priceAnnual : tierConfig.priceMonthly;
    const stripePriceId = billingCycle === 'annual' ? tierConfig.stripe_price_id_annual : tierConfig.stripe_price_id_monthly;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: stripePriceId,
        quantity: 1,
      }],
      mode: 'subscription',
      customer_email: email,
      metadata: {
        tier,
        billingCycle,
        organizationName: organizationName || '',
        contactName: contactName || ''
      },
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3004'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3004'}/subscription/cancelled`,
      subscription_data: {
        metadata: {
          tier,
          billingCycle,
          organizationName: organizationName || '',
          contactName: contactName || ''
        }
      }
    });

    logger.info(`Stripe checkout session created: ${email} for ${tier}`);

    res.json({
      type: 'stripe_checkout',
      checkoutUrl: session.url,
      sessionId: session.id,
      tier: tierConfig.name,
      price: price
    });

  } catch (error) {
    logger.error('Start subscription error:', error);
    res.status(500).json({
      error: 'Failed to start subscription process',
      message: 'Please try again or contact support'
    });
  }
});

// Handle successful subscription
router.get('/success', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({
        error: 'Missing session ID'
      });
    }

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status === 'paid') {
      // Create provider account and subscription
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      
      // Store subscription in database
      await db.query(`
        INSERT INTO provider_subscriptions (
          stripe_customer_id, stripe_subscription_id, subscription_tier,
          billing_cycle, status, current_period_start, current_period_end,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        session.customer,
        session.subscription,
        session.metadata.tier,
        session.metadata.billingCycle,
        'active',
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000)
      ]);

      logger.info(`Subscription activated: ${session.customer_email} for ${session.metadata.tier}`);

      res.json({
        success: true,
        message: 'Subscription activated successfully!',
        tier: session.metadata.tier,
        nextStep: 'Please check your email for account setup instructions.'
      });
    } else {
      res.status(400).json({
        error: 'Payment not completed',
        message: 'Please complete your payment to activate your subscription.'
      });
    }

  } catch (error) {
    logger.error('Subscription success handler error:', error);
    res.status(500).json({
      error: 'Failed to process subscription',
      message: 'Please contact support with your session ID'
    });
  }
});

// Handle cancelled subscription
router.get('/cancelled', async (req, res) => {
  res.json({
    message: 'Subscription cancelled',
    nextSteps: [
      'You can restart the subscription process anytime',
      'Contact our sales team if you have questions',
      'Try our free consultation to learn more'
    ]
  });
});

// Webhook handler for Stripe events
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'customer.subscription.created':
      logger.info('Subscription created:', event.data.object.id);
      break;
    case 'customer.subscription.updated':
      logger.info('Subscription updated:', event.data.object.id);
      break;
    case 'customer.subscription.deleted':
      logger.info('Subscription cancelled:', event.data.object.id);
      break;
    case 'invoice.payment_succeeded':
      logger.info('Payment succeeded:', event.data.object.id);
      break;
    case 'invoice.payment_failed':
      logger.error('Payment failed:', event.data.object.id);
      break;
    default:
      logger.info('Unhandled event type:', event.type);
  }

  res.json({received: true});
});

module.exports = router;
