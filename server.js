const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const authRoutes = require('./routes/auth');
const aiAssistantRoutes = require('./routes/ai-assistant');
const insightsRoutes = require('./routes/insights');
const billingRoutes = require('./routes/billing');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3004;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['https://dralexai.com', 'http://localhost:3004'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Provider-ID']
}));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api', apiLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static('public'));

// Health check routes (no auth required)
app.use('/health', healthRoutes);

// Authentication routes
app.use('/api/auth', authRoutes);

// Protected routes (require provider authentication)
app.use('/api/ai-assistant', aiAssistantRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/billing', billingRoutes);

// Main platform dashboard
app.get('/dashboard', (req, res) => {
  res.json({
    service: 'Dr. Alex AI Clinical Intelligence Platform',
    version: '1.0.0',
    description: 'Claude AI-powered clinical intelligence for healthcare providers',
    capabilities: {
      aiAssistant: 'Claude AI Clinical Intelligence Assistant with tier-based access',
      crisisDetection: '24/7 emergency assistance and crisis detection protocols',
      predictiveAnalytics: 'Identify patient risks before they become critical',
      workflowOptimization: 'Reduce administrative burden by 40% with AI automation',
      revenueProtection: 'Tier-based analytics access with usage tracking'
    },
    pricing: {
      essential: {
        price: '$299/month',
        queries: 50,
        features: ['Basic navigation', 'Simple explanations']
      },
      professional: {
        price: '$999/month', 
        queries: 200,
        features: ['Clinical insights', 'Trend analysis', 'Treatment recommendations']
      },
      enterprise: {
        price: '$1,999/month',
        queries: 1000,
        features: ['Emergency assistance', 'Predictive analytics', 'Workflow optimization']
      }
    },
    endpoints: {
      frontend: 'GET / - Dr. Alex AI Platform Interface',
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        profile: 'GET /api/auth/profile'
      },
      aiAssistant: {
        chat: 'POST /api/ai-assistant/chat',
        stats: 'GET /api/ai-assistant/stats',
        upgrade: 'POST /api/ai-assistant/upgrade'
      },
      insights: {
        summary: 'GET /api/insights/summary',
        correlations: 'GET /api/insights/correlations',
        trends: 'GET /api/insights/trends'
      },
      billing: {
        subscription: 'GET /api/billing/subscription',
        usage: 'GET /api/billing/usage',
        upgrade: 'POST /api/billing/upgrade'
      }
    },
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

// Root route serves the main platform interface
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

// Provider dashboard route
app.get('/provider-dashboard', (req, res) => {
  res.sendFile('dashboard.html', { root: 'public' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    service: 'Dr. Alex AI Clinical Intelligence Platform',
    suggestion: 'Visit https://dralexai.com for the main platform interface'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    service: 'Dr. Alex AI Clinical Intelligence Platform'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, () => {
  logger.info(`🤖 Dr. Alex AI Clinical Intelligence Platform running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Frontend: https://dralexai.com or http://localhost:${PORT}`);
  logger.info('Available endpoints:');
  logger.info('  - GET / - Dr. Alex AI Platform Interface');
  logger.info('  - POST /api/auth/login - Provider authentication');
  logger.info('  - POST /api/ai-assistant/chat - Claude AI assistant');
  logger.info('  - GET /api/insights/summary - Clinical insights');
  logger.info('  - GET /health - Health check');
  logger.info('  - GET /dashboard - Service dashboard');
});

module.exports = app;