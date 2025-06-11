/**
 * Stripe Webhook Handler for Dr. Alex AI Subscriptions
 * Handles subscription lifecycle events from Stripe
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../utils/database');
const logger = require('../utils/logger');
const { getTierByName } = require('../config/subscription-tiers');

const router = express.Router();

// Webhook endpoint - must be raw body for signature verification
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    logger.info(`Stripe webhook received: ${event.type}`);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
        
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object);
        break;
        
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({received: true});
  } catch (error) {
    logger.error('Webhook handler error:', error);
    res.status(500).json({error: 'Webhook processing failed'});
  }
});

/**
 * Handle successful checkout session
 */
async function handleCheckoutSessionCompleted(session) {
  logger.info(`Checkout session completed: ${session.id}`);
  
  try {
    // Get the subscription details
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const customer = await stripe.customers.retrieve(session.customer);
    
    // Extract metadata
    const tier = session.metadata.tier;
    const billingCycle = session.metadata.billingCycle || 'monthly';
    const organizationName = session.metadata.organizationName || '';
    const contactName = session.metadata.contactName || '';
    
    // Get tier configuration
    const tierConfig = getTierByName(tier);
    if (!tierConfig) {
      throw new Error(`Invalid tier: ${tier}`);
    }
    
    // Create or update provider subscription
    const subscriptionResult = await db.query(`
      INSERT INTO provider_subscriptions (
        stripe_customer_id, stripe_subscription_id, subscription_tier,
        billing_cycle, status, current_period_start, current_period_end,
        price_per_month, max_patients, max_providers, ai_queries_per_month,
        features, customer_email, organization_name, contact_name,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      ON CONFLICT (stripe_subscription_id) 
      DO UPDATE SET
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        updated_at = NOW()
      RETURNING id
    `, [
      session.customer,
      session.subscription,
      tier,
      billingCycle,
      subscription.status,
      new Date(subscription.current_period_start * 1000),
      new Date(subscription.current_period_end * 1000),
      billingCycle === 'monthly' ? tierConfig.priceMonthly : tierConfig.priceAnnual / 12,
      tierConfig.maxPatients,
      tierConfig.maxProviders,
      tierConfig.aiQueriesPerMonth,
      JSON.stringify(tierConfig.features),
      customer.email,
      organizationName,
      contactName
    ]);
    
    logger.info(`Subscription created in database: ${subscriptionResult.rows[0].id}`);
    
    // TODO: Send welcome email
    // TODO: Create provider account if needed
    // TODO: Set up onboarding flow
    
  } catch (error) {
    logger.error('Error handling checkout session completed:', error);
    throw error;
  }
}

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(subscription) {
  logger.info(`Subscription created: ${subscription.id}`);
  
  try {
    // Update subscription status
    await db.query(`
      UPDATE provider_subscriptions 
      SET status = $1, updated_at = NOW()
      WHERE stripe_subscription_id = $2
    `, [subscription.status, subscription.id]);
    
  } catch (error) {
    logger.error('Error handling subscription created:', error);
    throw error;
  }
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription) {
  logger.info(`Subscription updated: ${subscription.id}`);
  
  try {
    // Update subscription details
    await db.query(`
      UPDATE provider_subscriptions 
      SET 
        status = $1,
        current_period_start = $2,
        current_period_end = $3,
        updated_at = NOW()
      WHERE stripe_subscription_id = $4
    `, [
      subscription.status,
      new Date(subscription.current_period_start * 1000),
      new Date(subscription.current_period_end * 1000),
      subscription.id
    ]);
    
    // Handle plan changes
    if (subscription.metadata && subscription.metadata.tier_change) {
      logger.info(`Tier change detected for subscription: ${subscription.id}`);
      // TODO: Handle tier change logic
    }
    
  } catch (error) {
    logger.error('Error handling subscription updated:', error);
    throw error;
  }
}

/**
 * Handle subscription deleted/cancelled
 */
async function handleSubscriptionDeleted(subscription) {
  logger.info(`Subscription cancelled: ${subscription.id}`);
  
  try {
    // Update subscription status
    await db.query(`
      UPDATE provider_subscriptions 
      SET 
        status = 'cancelled',
        cancelled_at = NOW(),
        updated_at = NOW()
      WHERE stripe_subscription_id = $1
    `, [subscription.id]);
    
    // TODO: Handle access revocation
    // TODO: Send cancellation email
    // TODO: Export data if requested
    
  } catch (error) {
    logger.error('Error handling subscription deleted:', error);
    throw error;
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice) {
  logger.info(`Payment succeeded: ${invoice.id} for subscription: ${invoice.subscription}`);
  
  try {
    // Record payment
    await db.query(`
      INSERT INTO subscription_payments (
        stripe_invoice_id, stripe_subscription_id, amount_paid,
        currency, payment_date, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (stripe_invoice_id) DO NOTHING
    `, [
      invoice.id,
      invoice.subscription,
      invoice.amount_paid,
      invoice.currency,
      new Date(invoice.created * 1000),
      'succeeded'
    ]);
    
    // Reset usage counters for new billing period
    if (invoice.billing_reason === 'subscription_cycle') {
      await resetUsageCounters(invoice.subscription);
    }
    
    // TODO: Send payment confirmation email
    
  } catch (error) {
    logger.error('Error handling payment succeeded:', error);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
  logger.error(`Payment failed: ${invoice.id} for subscription: ${invoice.subscription}`);
  
  try {
    // Record failed payment
    await db.query(`
      INSERT INTO subscription_payments (
        stripe_invoice_id, stripe_subscription_id, amount_due,
        currency, payment_date, status, failure_reason, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (stripe_invoice_id) DO NOTHING
    `, [
      invoice.id,
      invoice.subscription,
      invoice.amount_due,
      invoice.currency,
      new Date(invoice.created * 1000),
      'failed',
      invoice.last_finalization_error?.message || 'Payment failed'
    ]);
    
    // Update subscription status if needed
    await db.query(`
      UPDATE provider_subscriptions 
      SET status = 'past_due', updated_at = NOW()
      WHERE stripe_subscription_id = $1 AND status = 'active'
    `, [invoice.subscription]);
    
    // TODO: Send payment failure notification
    // TODO: Implement dunning management
    
  } catch (error) {
    logger.error('Error handling payment failed:', error);
    throw error;
  }
}

/**
 * Handle trial ending soon
 */
async function handleTrialWillEnd(subscription) {
  logger.info(`Trial will end soon: ${subscription.id}`);
  
  try {
    // TODO: Send trial ending notification
    // TODO: Prompt for payment method
    
  } catch (error) {
    logger.error('Error handling trial will end:', error);
    throw error;
  }
}

/**
 * Reset usage counters for new billing period
 */
async function resetUsageCounters(stripeSubscriptionId) {
  try {
    // Get provider subscription
    const subscriptionResult = await db.query(`
      SELECT provider_id FROM provider_subscriptions 
      WHERE stripe_subscription_id = $1
    `, [stripeSubscriptionId]);
    
    if (subscriptionResult.rows.length === 0) {
      logger.warn(`No provider subscription found for Stripe subscription: ${stripeSubscriptionId}`);
      return;
    }
    
    const providerId = subscriptionResult.rows[0].provider_id;
    
    // Reset monthly usage counters
    await db.query(`
      UPDATE provider_subscriptions 
      SET 
        ai_queries_used_this_month = 0,
        updated_at = NOW()
      WHERE stripe_subscription_id = $1
    `, [stripeSubscriptionId]);
    
    // Create new usage tracking record for the month
    await db.query(`
      INSERT INTO subscription_usage_tracking (
        provider_id, subscription_id, usage_month, ai_queries_used,
        api_calls_used, data_export_mb_used, patients_active, providers_active
      ) 
      SELECT 
        $1, ps.id, DATE_TRUNC('month', NOW()), 0, 0, 0, 0, 0
      FROM provider_subscriptions ps 
      WHERE ps.stripe_subscription_id = $2
      ON CONFLICT (provider_id, usage_month) DO NOTHING
    `, [providerId, stripeSubscriptionId]);
    
    logger.info(`Usage counters reset for subscription: ${stripeSubscriptionId}`);
    
  } catch (error) {
    logger.error('Error resetting usage counters:', error);
    throw error;
  }
}

module.exports = router;
