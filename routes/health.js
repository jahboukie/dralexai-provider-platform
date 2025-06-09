const express = require('express');
const logger = require('../utils/logger');

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Provider Dashboard',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    service: 'Provider Dashboard',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    dependencies: {
      stripe: {
        status: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not_configured',
        lastChecked: new Date().toISOString()
      }
    }
  };

  res.json(healthCheck);
});

// Readiness check
router.get('/ready', (req, res) => {
  res.json({ status: 'ready' });
});

// Liveness check
router.get('/live', (req, res) => {
  res.json({ 
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
