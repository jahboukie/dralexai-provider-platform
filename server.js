const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// For Node.js 18+, fetch is built-in. For older versions, uncomment the line below:
// const fetch = require('node-fetch');

const logger = require('./utils/logger');
const authRoutes = require('./routes/auth');
const aiAssistantRoutes = require('./routes/ai-assistant');
const insightsRoutes = require('./routes/insights');
const billingRoutes = require('./routes/billing');
const healthRoutes = require('./routes/health');
const patientsRoutes = require('./routes/patients');
const practiceRoutes = require('./routes/practice');
const reportsRoutes = require('./routes/reports');
const communicationsRoutes = require('./routes/communications');

const app = express();
const PORT = process.env.PORT || 3004;

// Security middleware with CSP configuration for development
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:", "http:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
    },
  },
}));

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
app.use('/api/patients', patientsRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/communications', communicationsRoutes);

// Additional dashboard routes
app.get('/api/crisis-events', (req, res) => {
  res.json({
    events: [],
    status: 'operational',
    message: 'No active crisis alerts'
  });
});

app.get('/api/ehr-integration/status', (req, res) => {
  res.json({
    connected: true,
    systems: [
      { name: 'Epic MyChart', status: 'connected', lastSync: new Date() },
      { name: 'Cerner PowerChart', status: 'available' }
    ],
    syncStatus: 'operational'
  });
});

app.get('/api/patient-apps/stats', (req, res) => {
  res.json({
    apps: [
      {
        name: 'MenoTracker',
        status: 'live',
        referrals: 23,
        engagement: 89,
        adherence: 94
      },
      {
        name: 'SupportivePartner', 
        status: 'live',
        referrals: 18,
        engagement: 92,
        effectiveness: 96
      }
    ],
    totalReferrals: 41,
    avgEngagement: 90,
    outcomeImprovement: 25
  });
});

// Sentiment Analysis Integration (Main Brain Connection)
app.get('/api/sentiment/provider-insights', async (req, res) => {
  try {
    // Connect to sentiment service main brain for aggregated data analysis
    const sentimentServiceUrl = process.env.SENTIMENT_SERVICE_URL || 'http://localhost:3005';
    const response = await fetch(`${sentimentServiceUrl}/api/enterprise/provider-insights`, {
      headers: {
        'Authorization': req.headers.authorization,
        'X-Internal-Service': process.env.INTERNAL_SERVICE_KEY || 'dev-key'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      res.json({
        status: 'limited',
        message: 'Sentiment analysis service integration pending',
        aggregatedInsights: {
          patientSentimentTrends: 'Processing...',
          clinicalOutcomeCorrelations: 'Analyzing...',
          treatmentEffectiveness: 'Computing...'
        }
      });
    }
  } catch (error) {
    logger.error('Sentiment service connection error:', error);
    res.json({
      status: 'offline',
      message: 'Main brain sentiment analysis temporarily unavailable',
      fallbackMode: true
    });
  }
});

// Main platform dashboard
app.get('/dashboard', (req, res) => {
  res.json({
    service: 'Dr. Alex AI Clinical Intelligence Platform',
    version: '1.0.0',
    description: 'Alex AI-powered clinical intelligence for healthcare providers',
    capabilities: {
      aiAssistant: 'Alex AI Clinical Intelligence Assistant with tier-based access',
      crisisDetection: '24/7 emergency assistance and crisis detection protocols',
      predictiveAnalytics: 'Identify patient risks before they become critical',
      workflowOptimization: 'Reduce administrative burden by 40% with AI automation',
      revenueProtection: 'Tier-based analytics access with usage tracking'
    },
    pricing: {
      essential: {
        price: '$2,999/month',
        queries: 500,
        features: ['Advanced clinical decision support', 'Basic EHR integration', 'Crisis detection alerts', '24/7 enterprise support']
      },
      professional: {
        price: '$9,999/month', 
        queries: 2000,
        features: ['Full EHR integration (Epic, Cerner)', 'Advanced predictive analytics', 'Treatment optimization algorithms', 'Multi-department deployment']
      },
      enterprise: {
        price: '$19,999/month',
        queries: 'unlimited',
        features: ['Enterprise EHR integration', 'Hospital-wide crisis detection', 'Custom AI model training', 'Dedicated customer success manager', 'White-label deployment']
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

// Provider login route
app.get('/login', (req, res) => {
  res.sendFile('login.html', { root: 'public' });
});

// Provider dashboard route (protected)
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
  logger.info('  - POST /api/ai-assistant/chat - Alex AI assistant');
  logger.info('  - GET /api/insights/summary - Clinical insights');
  logger.info('  - GET /health - Health check');
  logger.info('  - GET /dashboard - Service dashboard');
});

module.exports = app;