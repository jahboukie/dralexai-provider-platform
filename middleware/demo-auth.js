/**
 * Demo Authentication Middleware
 * Temporary solution for testing - bypasses authentication
 */

const demoAuth = (req, res, next) => {
    // Set demo provider data
    req.user = { 
        providerId: 'demo-provider',
        provider_id: 'demo-provider',
        email: 'demo@example.com',
        subscription_tier: 'professional'
    };
    req.provider = { 
        id: 'demo-provider',
        email: 'demo@example.com'
    };
    next();
};

module.exports = demoAuth;