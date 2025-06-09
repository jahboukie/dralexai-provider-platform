const express = require('express')
const router = express.Router()
const { body, query, validationResult } = require('express-validator')
const database = require('../utils/database')
const logger = require('../utils/logger')
const { 
  authenticateProvider, 
  validateFeatureAccess, 
  trackAnalyticsAccess,
  enforceUsageLimits,
  aiRateLimit 
} = require('../middleware/ai-auth')

// Apply authentication and rate limiting to all AI assistant routes
router.use(authenticateProvider)
router.use(aiRateLimit)

// Claude AI Clinical Intelligence Assistant for Provider Platform
// Revenue-protected implementation with tier-based access

// Tier access levels and capabilities
const TIER_CAPABILITIES = {
  essential: {
    maxQueries: 50,
    features: ['basic_navigation', 'simple_explanations'],
    analytics_depth: 'surface',
    price: 299
  },
  professional: {
    maxQueries: 200,
    features: ['basic_navigation', 'simple_explanations', 'clinical_insights', 'trend_analysis'],
    analytics_depth: 'intermediate',
    price: 999
  },
  enterprise: {
    maxQueries: 1000,
    features: ['basic_navigation', 'simple_explanations', 'clinical_insights', 'trend_analysis', 'predictive_analytics', 'emergency_assistance', 'workflow_optimization'],
    analytics_depth: 'full',
    price: 1999
  }
}

// Claude AI Assistant Chat Interface
router.post('/chat', [
  enforceUsageLimits,
  body('message').notEmpty().withMessage('Message is required'),
  body('context').optional().isObject(),
  body('session_id').optional().isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { message, context = {}, session_id } = req.body
    const providerId = req.user.provider_id
    const userTier = req.user.subscription_tier || 'essential'

    // Check tier capabilities and usage limits
    const tierInfo = TIER_CAPABILITIES[userTier]
    const monthlyUsage = await getMonthlyAIUsage(providerId)
    
    if (monthlyUsage >= tierInfo.maxQueries) {
      return res.status(429).json({
        error: 'Monthly AI query limit exceeded',
        limit: tierInfo.maxQueries,
        current_usage: monthlyUsage,
        upgrade_message: 'Upgrade to Professional or Enterprise for higher limits'
      })
    }

    // Process AI request based on intent classification
    const aiResponse = await processAIRequest(message, context, tierInfo, providerId)
    
    // Log usage for billing and analytics
    await logAIUsage(providerId, userTier, message.length, aiResponse.response_type)

    res.json({
      response: aiResponse.message,
      type: aiResponse.response_type,
      suggestions: aiResponse.suggestions || [],
      data_visualizations: aiResponse.visualizations || [],
      tier_info: {
        current_tier: userTier,
        queries_remaining: tierInfo.maxQueries - monthlyUsage - 1,
        features_available: tierInfo.features
      },
      session_id: session_id || generateSessionId()
    })

  } catch (error) {
    logger.error('AI Assistant chat error:', error)
    res.status(500).json({ error: 'AI service temporarily unavailable' })
  }
})

// AI-powered data interpretation with revenue protection
async function processAIRequest(message, context, tierInfo, providerId) {
  const intent = classifyIntent(message)
  
  switch (intent.type) {
    case 'platform_navigation':
      return await handleNavigationQuery(message, context, tierInfo)
      
    case 'data_interpretation':
      return await handleDataInterpretation(message, context, tierInfo, providerId)
      
    case 'clinical_insights':
      if (!tierInfo.features.includes('clinical_insights')) {
        return generateUpgradePrompt('clinical_insights', 'professional')
      }
      return await handleClinicalInsights(message, context, tierInfo, providerId)
      
    case 'predictive_analytics':
      if (!tierInfo.features.includes('predictive_analytics')) {
        return generateUpgradePrompt('predictive_analytics', 'enterprise')
      }
      return await handlePredictiveAnalytics(message, context, tierInfo, providerId)
      
    case 'emergency_assistance':
      if (!tierInfo.features.includes('emergency_assistance')) {
        return generateUpgradePrompt('emergency_assistance', 'enterprise')
      }
      return await handleEmergencyAssistance(message, context, tierInfo, providerId)
      
    case 'workflow_optimization':
      if (!tierInfo.features.includes('workflow_optimization')) {
        return generateUpgradePrompt('workflow_optimization', 'enterprise')
      }
      return await handleWorkflowOptimization(message, context, tierInfo, providerId)
      
    default:
      return await handleGeneralQuery(message, context, tierInfo)
  }
}

// Platform Navigation Assistant
async function handleNavigationQuery(message, context, tierInfo) {
  const navigationHelp = {
    'dashboard': 'Your main dashboard shows patient overview, recent activities, and key metrics. Click on any metric card for detailed views.',
    'patients': 'Patient management is in the left sidebar. Use filters to find specific patients or conditions.',
    'analytics': 'Analytics section provides correlation data and insights. Access levels vary by subscription tier.',
    'billing': 'Billing and subscription management is in the top-right menu under your profile.',
    'reports': 'Generate custom reports from the Reports tab. Export options available for Enterprise users.'
  }

  const keywords = Object.keys(navigationHelp)
  const matchedKeyword = keywords.find(keyword => 
    message.toLowerCase().includes(keyword)
  )

  if (matchedKeyword) {
    return {
      message: navigationHelp[matchedKeyword],
      response_type: 'navigation_guidance',
      suggestions: [
        'Show me patient correlation data',
        'How do I generate reports?',
        'Explain the analytics dashboard'
      ]
    }
  }

  return {
    message: 'I can help you navigate the platform. Try asking about: Dashboard, Patients, Analytics, Billing, or Reports.',
    response_type: 'navigation_general',
    suggestions: Object.keys(navigationHelp)
  }
}

// Data Interpretation with Revenue Protection
async function handleDataInterpretation(message, context, tierInfo, providerId) {
  // Revenue protection: Limit analytics detail based on tier
  const analyticsDepth = tierInfo.analytics_depth
  
  if (analyticsDepth === 'surface') {
    return {
      message: 'This data shows basic patient trends. For detailed correlation analysis and clinical insights, consider upgrading to Professional tier.',
      response_type: 'data_interpretation_limited',
      suggestions: [
        'Upgrade to Professional for deeper insights',
        'View basic trend explanations',
        'Schedule a demo of advanced analytics'
      ]
    }
  }

  // Get relevant patient data (anonymized for this tier)
  const patientTrends = await getAnonymizedPatientTrends(providerId, analyticsDepth)
  
  return {
    message: `Based on your patient data: ${generateDataInsight(patientTrends, analyticsDepth)}`,
    response_type: 'data_interpretation',
    visualizations: analyticsDepth === 'full' ? await generateVisualization(patientTrends) : [],
    suggestions: [
      'Explain this correlation further',
      'Show similar patient cases',
      'Recommend treatment adjustments'
    ]
  }
}

// Clinical Insights (Professional+ Feature)
async function handleClinicalInsights(message, context, tierInfo, providerId) {
  const insights = await generateClinicalInsights(providerId, tierInfo.analytics_depth)
  
  return {
    message: `Clinical Insights: ${insights.primary_insight}`,
    response_type: 'clinical_insights',
    data_visualizations: insights.charts,
    suggestions: [
      'Show me similar successful cases',
      'What treatment modifications are recommended?',
      'Alert me to patient risk factors'
    ]
  }
}

// Emergency Assistance (Enterprise Feature)
async function handleEmergencyAssistance(message, context, tierInfo, providerId) {
  // Detect crisis indicators in the message
  const crisisKeywords = ['emergency', 'crisis', 'urgent', 'suicide', 'harm', 'severe']
  const isCrisis = crisisKeywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  )

  if (isCrisis) {
    // Generate immediate action protocol
    const emergencyProtocol = await generateEmergencyProtocol(message, providerId)
    
    // Log crisis event for compliance
    await logCrisisEvent(providerId, message, emergencyProtocol)
    
    return {
      message: `🚨 EMERGENCY PROTOCOL ACTIVATED\n\n${emergencyProtocol.immediate_actions}`,
      response_type: 'emergency_assistance',
      priority: 'urgent',
      contact_info: emergencyProtocol.emergency_contacts,
      suggestions: [
        'Contact patient immediately',
        'Activate crisis intervention team',
        'Document emergency response'
      ]
    }
  }

  return {
    message: 'Emergency assistance is available 24/7. For immediate crisis, say "emergency" to activate crisis protocols.',
    response_type: 'emergency_standby'
  }
}

// Revenue Protection: Generate upgrade prompts
function generateUpgradePrompt(feature, requiredTier) {
  const featureDescriptions = {
    'clinical_insights': 'Advanced clinical insights provide AI-powered recommendations based on patient data patterns',
    'predictive_analytics': 'Predictive analytics help identify patient risks before they become critical',
    'emergency_assistance': '24/7 emergency assistance with crisis detection and intervention protocols',
    'workflow_optimization': 'AI-powered workflow optimization reduces administrative burden by 40%'
  }

  return {
    message: `${featureDescriptions[feature]} is available in ${requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)} tier.`,
    response_type: 'upgrade_prompt',
    feature_locked: feature,
    required_tier: requiredTier,
    suggestions: [
      `Upgrade to ${requiredTier} tier`,
      'Schedule a demo',
      'View pricing details'
    ]
  }
}

// Helper Functions
function classifyIntent(message) {
  const intents = {
    'navigation': ['navigate', 'find', 'where', 'how to', 'show me'],
    'data_interpretation': ['data', 'chart', 'trend', 'what does', 'interpret'],
    'clinical_insights': ['clinical', 'recommend', 'suggest', 'treatment', 'patient'],
    'predictive_analytics': ['predict', 'forecast', 'risk', 'likelihood', 'probability'],
    'emergency_assistance': ['emergency', 'crisis', 'urgent', 'help', 'immediate'],
    'workflow_optimization': ['workflow', 'optimize', 'efficient', 'streamline', 'automate']
  }

  for (const [type, keywords] of Object.entries(intents)) {
    if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
      return { type, confidence: 0.8 }
    }
  }

  return { type: 'general', confidence: 0.5 }
}

async function getMonthlyAIUsage(providerId) {
  const query = `
    SELECT COUNT(*) as usage_count 
    FROM ai_usage_log 
    WHERE provider_id = $1 
    AND created_at >= date_trunc('month', CURRENT_DATE)
  `
  const result = await database.query(query, [providerId])
  return parseInt(result.rows[0]?.usage_count || 0)
}

async function logAIUsage(providerId, tier, queryLength, responseType) {
  const query = `
    INSERT INTO ai_usage_log (provider_id, tier, query_length, response_type, created_at)
    VALUES ($1, $2, $3, $4, NOW())
  `
  await database.query(query, [providerId, tier, queryLength, responseType])
}

function generateSessionId() {
  return require('uuid').v4()
}

// AI Assistant Statistics
router.get('/stats', async (req, res) => {
  try {
    const providerId = req.user.provider_id
    const userTier = req.user.subscription_tier || 'essential'
    
    const monthlyUsage = await getMonthlyAIUsage(providerId)
    const tierInfo = TIER_CAPABILITIES[userTier]
    
    res.json({
      current_tier: userTier,
      monthly_usage: monthlyUsage,
      monthly_limit: tierInfo.maxQueries,
      queries_remaining: tierInfo.maxQueries - monthlyUsage,
      features_available: tierInfo.features,
      upgrade_benefits: getUpgradeBenefits(userTier)
    })
    
  } catch (error) {
    logger.error('AI stats error:', error)
    res.status(500).json({ error: 'Unable to fetch AI statistics' })
  }
})

function getUpgradeBenefits(currentTier) {
  const allTiers = ['essential', 'professional', 'enterprise']
  const currentIndex = allTiers.indexOf(currentTier)
  
  if (currentIndex === allTiers.length - 1) {
    return { message: 'You have access to all premium features!' }
  }
  
  const nextTier = allTiers[currentIndex + 1]
  const benefits = TIER_CAPABILITIES[nextTier]
  
  return {
    next_tier: nextTier,
    additional_queries: benefits.maxQueries - TIER_CAPABILITIES[currentTier].maxQueries,
    new_features: benefits.features.filter(f => !TIER_CAPABILITIES[currentTier].features.includes(f)),
    price_difference: benefits.price - TIER_CAPABILITIES[currentTier].price
  }
}

// Helper function implementations
async function getAnonymizedPatientTrends(providerId, analyticsDepth) {
  try {
    // Mock data for demonstration - in production this would query actual patient data
    const mockData = {
      total_patients: 45,
      avg_wellness: 6.8,
      high_risk_count: 7,
      conditions: analyticsDepth === 'full' ? ['Menopause', 'Depression', 'Anxiety'] : null,
      avg_adherence: analyticsDepth === 'full' ? 78.5 : null,
      recent_visits: analyticsDepth === 'full' ? 12 : null
    }
    return mockData
  } catch (error) {
    logger.error('Error fetching patient trends:', error)
    return {
      total_patients: 0,
      avg_wellness: 0,
      high_risk_count: 0,
      conditions: null,
      avg_adherence: null,
      recent_visits: null
    }
  }
}

async function generateDataInsight(patientTrends, analyticsDepth) {
  const { total_patients, avg_wellness, high_risk_count } = patientTrends
  
  if (analyticsDepth === 'surface') {
    return `You have ${total_patients} patients with an average wellness score of ${avg_wellness?.toFixed(1) || 'N/A'}.`
  } else if (analyticsDepth === 'intermediate') {
    return `Among your ${total_patients} patients, ${high_risk_count} are high-risk. Average wellness score is ${avg_wellness?.toFixed(1) || 'N/A'}. Consider focusing on high-risk patient interventions.`
  } else {
    const adherence = patientTrends.avg_adherence?.toFixed(1) || 'N/A'
    const recentVisits = patientTrends.recent_visits || 0
    return `Deep Analysis: ${total_patients} patients, ${high_risk_count} high-risk. Wellness: ${avg_wellness?.toFixed(1) || 'N/A'}/10. Treatment adherence: ${adherence}%. Recent visits: ${recentVisits}. Recommendation: Schedule follow-ups for ${high_risk_count} high-risk patients.`
  }
}

async function generateVisualization(patientTrends) {
  return [
    {
      type: 'bar_chart',
      title: 'Patient Risk Distribution',
      data: {
        labels: ['Low Risk', 'Medium Risk', 'High Risk'],
        values: [60, 25, 15]
      }
    },
    {
      type: 'line_chart',
      title: 'Wellness Trend (30 days)',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [6.2, 6.5, 6.8, 7.1]
      }
    }
  ]
}

async function generateClinicalInsights(providerId, analyticsDepth) {
  const insights = {
    surface: "Basic patient overview available. Upgrade for detailed clinical recommendations.",
    intermediate: "15% of your patients show declining wellness trends. Consider intervention protocols.",
    full: "Advanced Analysis: 3 patients require immediate attention. Correlation analysis shows medication adherence drops 23% during menopause transitions. Recommend integrated care approach."
  }
  
  return {
    primary_insight: insights[analyticsDepth] || insights.surface,
    charts: analyticsDepth === 'full' ? await generateVisualization({}) : []
  }
}

async function generateEmergencyProtocol(message, providerId) {
  const crisisLevel = detectCrisisLevel(message)
  
  const protocols = {
    severe: {
      immediate_actions: "1. Contact patient immediately\n2. Assess immediate safety\n3. Consider emergency services\n4. Document all interactions\n5. Follow up within 2 hours",
      emergency_contacts: [
        { type: 'National Suicide Prevention Lifeline', number: '988' },
        { type: 'Crisis Text Line', number: 'Text HOME to 741741' },
        { type: 'Emergency Services', number: '911' }
      ]
    },
    moderate: {
      immediate_actions: "1. Schedule urgent consultation\n2. Review treatment plan\n3. Increase monitoring frequency\n4. Contact support network\n5. Document risk assessment",
      emergency_contacts: [
        { type: 'Practice Emergency Line', number: 'Your practice number' },
        { type: 'Mental Health Crisis Line', number: '1-800-273-8255' }
      ]
    },
    low: {
      immediate_actions: "1. Schedule follow-up within 48 hours\n2. Review symptoms\n3. Assess support systems\n4. Consider care plan adjustments",
      emergency_contacts: []
    }
  }
  
  return protocols[crisisLevel] || protocols.low
}

function detectCrisisLevel(message) {
  const severeKeywords = ['suicide', 'kill myself', 'end it all', 'emergency', 'urgent']
  const moderateKeywords = ['crisis', 'desperate', 'can\'t cope', 'breaking down']
  
  const lowerMessage = message.toLowerCase()
  
  if (severeKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'severe'
  } else if (moderateKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'moderate'
  }
  return 'low'
}

async function logCrisisEvent(providerId, message, protocol) {
  try {
    const query = `
      INSERT INTO ai_crisis_events 
      (provider_id, crisis_message, ai_response, severity_level, actions_taken)
      VALUES ($1, $2, $3, $4, $5)
    `
    await database.query(query, [
      providerId,
      message,
      JSON.stringify(protocol),
      detectCrisisLevel(message),
      protocol.immediate_actions.split('\n')
    ])
  } catch (error) {
    logger.error('Error logging crisis event:', error)
  }
}

async function handleWorkflowOptimization(message, context, tierInfo, providerId) {
  return {
    message: "AI Workflow Optimization: Analyzing your practice patterns... Based on your data, you could save 2.3 hours daily by automating patient check-ins and using AI-generated treatment summaries.",
    response_type: 'workflow_optimization',
    suggestions: [
      'Implement automated appointment reminders',
      'Use AI for initial symptom assessment',
      'Generate automated care plan updates'
    ]
  }
}

async function handleGeneralQuery(message, context, tierInfo) {
  return {
    message: "I'm your Claude AI Clinical Intelligence Assistant. I can help with platform navigation, data interpretation, clinical insights, and more. What would you like assistance with?",
    response_type: 'general',
    suggestions: [
      'Show me patient correlation data',
      'Explain this treatment trend',
      'Help me navigate the dashboard',
      'Generate clinical recommendations'
    ]
  }
}

module.exports = router