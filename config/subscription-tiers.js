/**
 * Dr. Alex AI Subscription Tiers Configuration
 * Aligned with https://www.dralexai.com/ pricing
 */

const SUBSCRIPTION_TIERS = {
  // ============================================================================
  // SMALL & MEDIUM PRACTICES
  // ============================================================================
  
  essential: {
    name: 'Essential',
    category: 'small_medium',
    priceMonthly: 599.00,
    priceAnnual: 5990.00, // 10 months pricing
    aiQueriesPerMonth: 100,
    maxProviders: 1,
    maxPatients: 100,
    features: {
      // Core Features
      clinical_decision_support: true,
      basic_ehr_integration: true,
      crisis_detection_alerts: true,
      patient_app_referrals: true,
      
      // Support
      email_support: true,
      phone_support: false,
      priority_support: false,
      dedicated_account_manager: false,
      
      // Advanced Features
      advanced_clinical_analytics: false,
      full_ehr_integration: false,
      predictive_insights: false,
      treatment_optimization: false,
      multi_provider_access: false,
      custom_integrations: false,
      white_label_deployment: false,
      custom_ai_model_training: false,
      
      // Enterprise Features
      department_wide_deployment: false,
      multi_department_deployment: false,
      hospital_wide_crisis_detection: false,
      sla_guarantees: false
    },
    limits: {
      ai_queries_per_month: 100,
      providers: 1,
      patients: 100,
      api_calls_per_month: 1000,
      data_export_mb_per_month: 100
    },
    stripe_price_id_monthly: 'price_1RYoJmELGHd3NbdJGIdnCsqf',
    stripe_price_id_annual: 'price_1RYoTlELGHd3NbdJMPdg5hGv'
  },

  professional: {
    name: 'Professional',
    category: 'small_medium',
    priceMonthly: 899.00,
    priceAnnual: 8990.00,
    aiQueriesPerMonth: 180,
    maxProviders: 3,
    maxPatients: 300,
    popular: true, // Show "POPULAR" badge
    features: {
      // Core Features
      clinical_decision_support: true,
      basic_ehr_integration: true,
      crisis_detection_alerts: true,
      patient_app_referrals: true,
      
      // Professional Features
      advanced_clinical_analytics: true,
      full_ehr_integration: true,
      predictive_insights: true,
      patient_app_referral_tracking: true,
      
      // Support
      email_support: true,
      phone_support: false,
      priority_support: true,
      dedicated_account_manager: false,
      
      // Advanced Features
      treatment_optimization: false,
      multi_provider_access: true,
      custom_integrations: false,
      white_label_deployment: false,
      custom_ai_model_training: false,
      
      // Enterprise Features
      department_wide_deployment: false,
      multi_department_deployment: false,
      hospital_wide_crisis_detection: false,
      sla_guarantees: false
    },
    limits: {
      ai_queries_per_month: 180,
      providers: 3,
      patients: 300,
      api_calls_per_month: 5000,
      data_export_mb_per_month: 500
    },
    stripe_price_id_monthly: 'price_1RYoPVELGHd3NbdJJvCLCeqD',
    stripe_price_id_annual: 'price_1RYoVaELGHd3NbdJdwNWNysa'
  },

  premium: {
    name: 'Premium',
    category: 'small_medium',
    priceMonthly: 1299.00,
    priceAnnual: 12990.00,
    aiQueriesPerMonth: 300,
    maxProviders: 5,
    maxPatients: 500,
    features: {
      // Core Features
      clinical_decision_support: true,
      basic_ehr_integration: true,
      crisis_detection_alerts: true,
      patient_app_referrals: true,
      
      // Professional Features
      advanced_clinical_analytics: true,
      full_ehr_integration: true,
      predictive_insights: true,
      patient_app_referral_tracking: true,
      
      // Premium Features
      advanced_predictive_analytics: true,
      treatment_optimization: true,
      multi_provider_access: true,
      custom_integrations: true,
      
      // Support
      email_support: true,
      phone_support: true,
      priority_support: true,
      dedicated_account_manager: false,
      
      // Advanced Features
      white_label_deployment: false,
      custom_ai_model_training: false,
      
      // Enterprise Features
      department_wide_deployment: false,
      multi_department_deployment: false,
      hospital_wide_crisis_detection: false,
      sla_guarantees: false
    },
    limits: {
      ai_queries_per_month: 300,
      providers: 5,
      patients: 500,
      api_calls_per_month: 10000,
      data_export_mb_per_month: 1000
    },
    stripe_price_id_monthly: 'price_1RYobAELGHd3NbdJxhJ2UaGw',
    stripe_price_id_annual: 'price_1RYoblELGHd3NbdJaoVpRfkm'
  },

  // ============================================================================
  // LARGE HEALTHCARE SYSTEMS
  // ============================================================================

  enterprise_essential: {
    name: 'Enterprise Essential',
    category: 'enterprise',
    priceMonthly: 2999.00,
    priceAnnual: 29990.00,
    aiQueriesPerMonth: 500,
    maxProviders: 10,
    maxPatients: 1000,
    features: {
      // All Core & Professional Features
      clinical_decision_support: true,
      basic_ehr_integration: true,
      crisis_detection_alerts: true,
      patient_app_referrals: true,
      advanced_clinical_analytics: true,
      full_ehr_integration: true,
      predictive_insights: true,
      patient_app_referral_tracking: true,
      advanced_predictive_analytics: true,
      treatment_optimization: true,
      multi_provider_access: true,
      custom_integrations: true,
      
      // Enterprise Features
      advanced_clinical_decision_support: true,
      enterprise_ehr_integration: true,
      department_wide_deployment: true,
      training_and_onboarding: true,
      
      // Support
      email_support: true,
      phone_support: true,
      priority_support: true,
      enterprise_support_24_7: true,
      dedicated_account_manager: false,
      
      // Advanced Enterprise Features
      multi_department_deployment: false,
      hospital_wide_crisis_detection: false,
      white_label_deployment: false,
      custom_ai_model_training: false,
      sla_guarantees: false
    },
    limits: {
      ai_queries_per_month: 500,
      providers: 10,
      patients: 1000,
      api_calls_per_month: 25000,
      data_export_mb_per_month: 5000
    },
    stripe_price_id_monthly: 'price_1RYohsELGHd3NbdJIvRLo95u',
    stripe_price_id_annual: 'price_1RYoiSELGHd3NbdJdmx76AR8',
    contact_sales: true
  },

  enterprise_professional: {
    name: 'Enterprise Professional',
    category: 'enterprise',
    priceMonthly: 9999.00,
    priceAnnual: 99990.00,
    aiQueriesPerMonth: 2000,
    maxProviders: 50,
    maxPatients: 5000,
    popular: true, // Show "MOST POPULAR" badge for enterprise
    features: {
      // All Previous Features
      clinical_decision_support: true,
      basic_ehr_integration: true,
      crisis_detection_alerts: true,
      patient_app_referrals: true,
      advanced_clinical_analytics: true,
      full_ehr_integration: true,
      predictive_insights: true,
      patient_app_referral_tracking: true,
      advanced_predictive_analytics: true,
      treatment_optimization: true,
      multi_provider_access: true,
      custom_integrations: true,
      advanced_clinical_decision_support: true,
      enterprise_ehr_integration: true,
      department_wide_deployment: true,
      training_and_onboarding: true,
      
      // Enterprise Professional Features
      full_ehr_integration_epic_cerner: true,
      treatment_optimization_algorithms: true,
      multi_department_deployment: true,
      
      // Support
      email_support: true,
      phone_support: true,
      priority_support: true,
      enterprise_support_24_7: true,
      dedicated_account_manager: true,
      
      // Advanced Features
      white_label_deployment: false,
      custom_ai_model_training: false,
      hospital_wide_crisis_detection: false,
      sla_guarantees: false
    },
    limits: {
      ai_queries_per_month: 2000,
      providers: 50,
      patients: 5000,
      api_calls_per_month: 100000,
      data_export_mb_per_month: 25000
    },
    stripe_price_id_monthly: 'price_1RYp7HELGHd3NbdJR6mYYwcy',
    stripe_price_id_annual: 'price_1RYp7HELGHd3NbdJWyGeTqf5',
    contact_sales: true
  },

  enterprise_unlimited: {
    name: 'Enterprise Unlimited',
    category: 'enterprise',
    priceMonthly: 19999.00,
    priceAnnual: 199990.00,
    aiQueriesPerMonth: -1, // Unlimited
    maxProviders: -1, // Unlimited
    maxPatients: -1, // Unlimited
    features: {
      // All Features Enabled
      clinical_decision_support: true,
      basic_ehr_integration: true,
      crisis_detection_alerts: true,
      patient_app_referrals: true,
      advanced_clinical_analytics: true,
      full_ehr_integration: true,
      predictive_insights: true,
      patient_app_referral_tracking: true,
      advanced_predictive_analytics: true,
      treatment_optimization: true,
      multi_provider_access: true,
      custom_integrations: true,
      advanced_clinical_decision_support: true,
      enterprise_ehr_integration: true,
      department_wide_deployment: true,
      training_and_onboarding: true,
      full_ehr_integration_epic_cerner: true,
      treatment_optimization_algorithms: true,
      multi_department_deployment: true,
      
      // Ultimate Features
      unlimited_ai_queries: true,
      hospital_wide_crisis_detection: true,
      custom_ai_model_training: true,
      white_label_deployment: true,
      sla_guarantees: true,
      
      // Ultimate Support
      email_support: true,
      phone_support: true,
      priority_support: true,
      enterprise_support_24_7: true,
      dedicated_account_manager: true,
      dedicated_customer_success_team: true
    },
    limits: {
      ai_queries_per_month: -1, // Unlimited
      providers: -1, // Unlimited
      patients: -1, // Unlimited
      api_calls_per_month: -1, // Unlimited
      data_export_mb_per_month: -1 // Unlimited
    },
    stripe_price_id_monthly: 'price_1RYpIEELGHd3NbdJzU1KqPIv',
    stripe_price_id_annual: 'price_1RYpIEELGHd3NbdJX0Bk5VDb',
    contact_sales: true
  }
};

// Helper functions
const getTierByName = (tierName) => {
  return SUBSCRIPTION_TIERS[tierName] || null;
};

const getAllTiers = () => {
  return SUBSCRIPTION_TIERS;
};

const getSmallMediumTiers = () => {
  return Object.fromEntries(
    Object.entries(SUBSCRIPTION_TIERS).filter(([key, tier]) => tier.category === 'small_medium')
  );
};

const getEnterpriseTiers = () => {
  return Object.fromEntries(
    Object.entries(SUBSCRIPTION_TIERS).filter(([key, tier]) => tier.category === 'enterprise')
  );
};

const validateTierLimits = (tierName, usage) => {
  const tier = getTierByName(tierName);
  if (!tier) return { valid: false, error: 'Invalid tier' };

  const violations = [];
  
  if (tier.limits.ai_queries_per_month !== -1 && usage.ai_queries > tier.limits.ai_queries_per_month) {
    violations.push(`AI queries exceeded: ${usage.ai_queries}/${tier.limits.ai_queries_per_month}`);
  }
  
  if (tier.limits.providers !== -1 && usage.providers > tier.limits.providers) {
    violations.push(`Provider limit exceeded: ${usage.providers}/${tier.limits.providers}`);
  }
  
  if (tier.limits.patients !== -1 && usage.patients > tier.limits.patients) {
    violations.push(`Patient limit exceeded: ${usage.patients}/${tier.limits.patients}`);
  }

  return {
    valid: violations.length === 0,
    violations
  };
};

module.exports = {
  SUBSCRIPTION_TIERS,
  getTierByName,
  getAllTiers,
  getSmallMediumTiers,
  getEnterpriseTiers,
  validateTierLimits
};
