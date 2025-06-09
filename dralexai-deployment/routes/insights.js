const express = require('express');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const db = require('../utils/database');

const router = express.Router();

// Get insights summary for provider
router.get('/summary', async (req, res) => {
  try {
    // Demo insights - in production this would query real data
    const summary = {
      totalPatients: 45,
      activePatients: 38,
      newPatientsThisMonth: 7,
      averageEngagement: 0.78,
      topApps: [
        { name: 'MyConfidant', patients: 15, engagement: 0.85 },
        { name: 'DrAlexAI', patients: 12, engagement: 0.82 },
        { name: 'MenoTracker', patients: 18, engagement: 0.75 }
      ],
      recentAlerts: [
        {
          id: 1,
          patientId: 'patient-123',
          type: 'low_engagement',
          message: 'Patient engagement dropped below threshold',
          severity: 'medium',
          timestamp: new Date().toISOString()
        }
      ],
      correlations: [
        {
          type: 'cross_app_usage',
          description: 'Patients using both MyConfidant and DrAlexAI show 23% better outcomes',
          confidence: 0.87
        },
        {
          type: 'engagement_pattern',
          description: 'Evening sessions correlate with higher treatment adherence',
          confidence: 0.74
        }
      ]
    };
    
    res.json({
      success: true,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get insights summary:', error);
    res.status(500).json({
      error: 'Failed to get insights summary',
      message: error.message
    });
  }
});

// Get insights for specific patient
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Demo patient insights
    const insights = {
      patientId,
      overview: {
        totalApps: 3,
        activeApps: 2,
        engagementScore: 0.82,
        lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        treatmentDuration: '3 months'
      },
      appUsage: [
        {
          appName: 'MyConfidant',
          sessionsThisWeek: 5,
          averageSessionLength: '12 minutes',
          lastSession: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          engagement: 0.85,
          progress: 'improving'
        },
        {
          appName: 'DrAlexAI',
          sessionsThisWeek: 3,
          averageSessionLength: '8 minutes',
          lastSession: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          engagement: 0.78,
          progress: 'stable'
        }
      ],
      healthMetrics: {
        mood: { current: 7.2, trend: 'improving', change: '+0.8' },
        anxiety: { current: 4.1, trend: 'decreasing', change: '-1.2' },
        sleep: { current: 6.8, trend: 'stable', change: '+0.1' }
      },
      recommendations: [
        'Consider introducing partner support through DrAlexAI',
        'Schedule follow-up in 2 weeks',
        'Monitor mood trends closely'
      ],
      alerts: []
    };
    
    res.json({
      success: true,
      insights,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get patient insights:', error);
    res.status(500).json({
      error: 'Failed to get patient insights',
      message: error.message
    });
  }
});

// Get correlation insights
router.get('/correlations', async (req, res) => {
  try {
    const { timeframe = 'month', appName } = req.query;
    
    const correlations = [
      {
        id: 1,
        type: 'cross_app_synergy',
        title: 'MyConfidant + DrAlexAI Combination',
        description: 'Patients using both apps show 23% better treatment outcomes',
        confidence: 0.87,
        sampleSize: 156,
        timeframe: 'last_3_months',
        significance: 'high'
      },
      {
        id: 2,
        type: 'usage_pattern',
        title: 'Evening Session Effectiveness',
        description: 'Sessions between 7-9 PM correlate with higher engagement',
        confidence: 0.74,
        sampleSize: 203,
        timeframe: 'last_month',
        significance: 'medium'
      },
      {
        id: 3,
        type: 'relationship_dynamic',
        title: 'Partner Engagement Impact',
        description: 'When partners use DrAlexAI, patient outcomes improve by 31%',
        confidence: 0.91,
        sampleSize: 89,
        timeframe: 'last_6_months',
        significance: 'very_high'
      }
    ];
    
    res.json({
      success: true,
      correlations,
      timeframe,
      count: correlations.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get correlations:', error);
    res.status(500).json({
      error: 'Failed to get correlations',
      message: error.message
    });
  }
});

// Get trend analysis
router.get('/trends', async (req, res) => {
  try {
    const { metric = 'engagement', timeframe = 'month' } = req.query;
    
    const trends = {
      metric,
      timeframe,
      data: [
        { date: '2024-05-01', value: 0.72 },
        { date: '2024-05-08', value: 0.75 },
        { date: '2024-05-15', value: 0.78 },
        { date: '2024-05-22', value: 0.81 },
        { date: '2024-05-29', value: 0.83 },
        { date: '2024-06-05', value: 0.85 }
      ],
      summary: {
        currentValue: 0.85,
        previousValue: 0.72,
        change: 0.13,
        changePercent: 18.1,
        trend: 'increasing',
        significance: 'high'
      },
      insights: [
        'Engagement has increased consistently over the past month',
        'The upward trend suggests effective treatment protocols',
        'Consider maintaining current approach'
      ]
    };
    
    res.json({
      success: true,
      trends,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get trends:', error);
    res.status(500).json({
      error: 'Failed to get trends',
      message: error.message
    });
  }
});

module.exports = router;
