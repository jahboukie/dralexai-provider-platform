/**
 * Production Configuration Validation Script
 * Validates all environment variables and connections for Dr. Alex AI
 */

// Load environment variables
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  header: (msg) => console.log(`${colors.bold}${colors.blue}\n🔍 ${msg}${colors.reset}`)
};

async function validateEnvironmentVariables() {
  log.header('ENVIRONMENT VARIABLES VALIDATION');
  
  const requiredVars = [
    'NODE_ENV',
    'PORT',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'ANTHROPIC_API_KEY',
    'JWT_SECRET',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
    'FRONTEND_URL'
  ];

  let allValid = true;

  for (const varName of requiredVars) {
    if (process.env[varName]) {
      log.success(`${varName}: Configured`);
    } else {
      log.error(`${varName}: Missing`);
      allValid = false;
    }
  }

  // Check for production-ready values
  if (process.env.NODE_ENV === 'production') {
    log.success('NODE_ENV: Set to production');
  } else {
    log.warning('NODE_ENV: Not set to production');
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 64) {
    log.success('JWT_SECRET: Strong key configured');
  } else {
    log.error('JWT_SECRET: Weak or missing');
    allValid = false;
  }

  return allValid;
}

async function validateSupabaseConnection() {
  log.header('SUPABASE CONNECTION VALIDATION');
  
  try {
    // Test Supabase connection
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Test public client
    const { data: publicTest, error: publicError } = await supabase
      .from('providers')
      .select('count')
      .limit(1);

    if (publicError) {
      log.error(`Supabase public client: ${publicError.message}`);
      return false;
    } else {
      log.success('Supabase public client: Connected');
    }

    // Test admin client
    const { data: adminTest, error: adminError } = await supabaseAdmin
      .from('providers')
      .select('count')
      .limit(1);

    if (adminError) {
      log.error(`Supabase admin client: ${adminError.message}`);
      return false;
    } else {
      log.success('Supabase admin client: Connected');
    }

    // Test database schema
    const { data: schemaTest, error: schemaError } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['providers', 'provider_subscriptions', 'sales_leads']);

    if (schemaError) {
      log.warning(`Database schema check: ${schemaError.message}`);
    } else {
      const tables = schemaTest.map(t => t.table_name);
      if (tables.includes('providers')) {
        log.success('Database schema: providers table exists');
      } else {
        log.error('Database schema: providers table missing');
      }
      
      if (tables.includes('provider_subscriptions')) {
        log.success('Database schema: provider_subscriptions table exists');
      } else {
        log.warning('Database schema: provider_subscriptions table missing (run migrations)');
      }
    }

    return true;

  } catch (error) {
    log.error(`Supabase connection failed: ${error.message}`);
    return false;
  }
}

async function validateClaudeAI() {
  log.header('CLAUDE AI VALIDATION');
  
  try {
    // Test Claude AI API key format
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      log.error('ANTHROPIC_API_KEY: Not configured');
      return false;
    }

    if (apiKey.startsWith('sk-ant-api03-')) {
      log.success('ANTHROPIC_API_KEY: Valid format');
    } else {
      log.error('ANTHROPIC_API_KEY: Invalid format');
      return false;
    }

    // Note: We don't test the actual API call to avoid charges
    log.info('Claude AI API key format is valid (not testing actual API call)');
    
    return true;

  } catch (error) {
    log.error(`Claude AI validation failed: ${error.message}`);
    return false;
  }
}

async function validateStripeIntegration() {
  log.header('STRIPE INTEGRATION VALIDATION');
  
  try {
    // Test Stripe connection
    const account = await stripe.accounts.retrieve();
    log.success(`Stripe account: ${account.display_name || account.id}`);

    // Test price IDs
    const priceIds = [
      'price_1RYoJmELGHd3NbdJGIdnCsqf', // Essential Monthly
      'price_1RYoTlELGHd3NbdJMPdg5hGv', // Essential Annual
      'price_1RYoPVELGHd3NbdJJvCLCeqD', // Professional Monthly
      'price_1RYoVaELGHd3NbdJdwNWNysa', // Professional Annual
      'price_1RYobAELGHd3NbdJxhJ2UaGw', // Premium Monthly
      'price_1RYoblELGHd3NbdJaoVpRfkm', // Premium Annual
      'price_1RYohsELGHd3NbdJIvRLo95u', // Enterprise Essential Monthly
      'price_1RYoiSELGHd3NbdJdmx76AR8', // Enterprise Essential Annual
      'price_1RYp7HELGHd3NbdJR6mYYwcy', // Enterprise Professional Monthly
      'price_1RYp7HELGHd3NbdJWyGeTqf5', // Enterprise Professional Annual
      'price_1RYpIEELGHd3NbdJzU1KqPIv', // Enterprise Unlimited Monthly
      'price_1RYpIEELGHd3NbdJX0Bk5VDb'  // Enterprise Unlimited Annual
    ];

    let validPrices = 0;
    for (const priceId of priceIds) {
      try {
        const price = await stripe.prices.retrieve(priceId);
        log.success(`Price ${priceId}: $${price.unit_amount / 100}/${price.recurring.interval}`);
        validPrices++;
      } catch (error) {
        log.error(`Price ${priceId}: ${error.message}`);
      }
    }

    log.info(`Stripe validation: ${validPrices}/${priceIds.length} price IDs valid`);
    
    return validPrices === priceIds.length;

  } catch (error) {
    log.error(`Stripe validation failed: ${error.message}`);
    return false;
  }
}

async function validateSecurityConfiguration() {
  log.header('SECURITY CONFIGURATION VALIDATION');
  
  let securityScore = 0;
  const maxScore = 6;

  // Check encryption keys
  if (process.env.ENCRYPTION_MASTER_KEY && 
      process.env.ENCRYPTION_MASTER_KEY !== 'dev-master-key-for-testing-only-not-production') {
    log.success('ENCRYPTION_MASTER_KEY: Production key configured');
    securityScore++;
  } else {
    log.error('ENCRYPTION_MASTER_KEY: Using development key');
  }

  // Check JWT secret strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 64) {
    log.success('JWT_SECRET: Strong key (64+ characters)');
    securityScore++;
  } else {
    log.error('JWT_SECRET: Weak key');
  }

  // Check CORS configuration
  if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.includes('https://')) {
    log.success('CORS_ORIGIN: HTTPS domains configured');
    securityScore++;
  } else {
    log.warning('CORS_ORIGIN: No HTTPS domains configured');
  }

  // Check frontend URL
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.startsWith('https://')) {
    log.success('FRONTEND_URL: HTTPS configured');
    securityScore++;
  } else {
    log.warning('FRONTEND_URL: Not using HTTPS');
  }

  // Check NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    log.success('NODE_ENV: Production mode');
    securityScore++;
  } else {
    log.warning('NODE_ENV: Not in production mode');
  }

  // Check rate limiting
  if (process.env.RATE_LIMIT_MAX_REQUESTS && 
      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) <= 1000) {
    log.success('RATE_LIMIT_MAX_REQUESTS: Configured');
    securityScore++;
  } else {
    log.warning('RATE_LIMIT_MAX_REQUESTS: Not configured or too high');
  }

  log.info(`Security score: ${securityScore}/${maxScore}`);
  
  return securityScore >= 4; // Minimum acceptable score
}

async function main() {
  console.log(`${colors.bold}${colors.blue}
╔══════════════════════════════════════════════════════════════╗
║                 DR. ALEX AI PRODUCTION VALIDATION            ║
║                     Configuration Check                      ║
╚══════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const results = {
    environment: await validateEnvironmentVariables(),
    supabase: await validateSupabaseConnection(),
    claude: await validateClaudeAI(),
    stripe: await validateStripeIntegration(),
    security: await validateSecurityConfiguration()
  };

  // Summary
  log.header('VALIDATION SUMMARY');
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, result]) => {
    if (result) {
      log.success(`${test.toUpperCase()}: PASSED`);
    } else {
      log.error(`${test.toUpperCase()}: FAILED`);
    }
  });

  console.log(`\n${colors.bold}Overall Status: ${passed}/${total} tests passed${colors.reset}`);
  
  if (passed === total) {
    log.success('🎉 ALL VALIDATIONS PASSED - PRODUCTION READY!');
    process.exit(0);
  } else {
    log.error('❌ SOME VALIDATIONS FAILED - REVIEW CONFIGURATION');
    process.exit(1);
  }
}

// Run validation
main().catch(error => {
  log.error(`Validation script failed: ${error.message}`);
  process.exit(1);
});
