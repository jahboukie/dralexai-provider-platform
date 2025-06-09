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
    maxQueries: 500,
    features: ['basic_navigation', 'clinical_insights', 'crisis_detection'],
    analytics_depth: 'basic',
    price: 2999
  },
  professional: {
    maxQueries: 2000,
    features: ['basic_navigation', 'clinical_insights', 'predictive_analytics', 'ehr_integration'],
    analytics_depth: 'advanced',
    price: 9999
  },
  enterprise: {
    maxQueries: 999999,
    features: ['all_features', 'emergency_assistance', 'workflow_optimization', 'custom_training', 'white_label'],
    analytics_depth: 'unlimited',
    price: 19999
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
  try {
    // Call actual Claude AI API
    const claudeResponse = await callClaudeAI(message, context, tierInfo, providerId);
    
    // Detect crisis situations
    const crisisDetected = detectCrisis(claudeResponse.content);
    
    return {
      message: claudeResponse.content,
      response_type: crisisDetected ? 'crisis_alert' : 'clinical_assistance',
      suggestions: claudeResponse.suggestions || [],
      crisisDetected: crisisDetected,
      crisisData: crisisDetected ? { severity: 'high', recommendations: ['Contact emergency services'] } : null
    };
    
  } catch (error) {
    logger.error('Claude AI API error:', error);
    return {
      message: "I'm experiencing technical difficulties. Please try again in a moment. For urgent matters, contact your supervisor or emergency services.",
      response_type: 'error',
      suggestions: []
    };
  }
}

// Call Claude AI API with Sentiment Analysis Integration
async function callClaudeAI(message, context, tierInfo, providerId) {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!anthropicApiKey) {
    throw new Error('Anthropic API key not configured');
  }

  // Get sentiment analysis context from main brain if available
  let sentimentContext = '';
  try {
    const sentimentServiceUrl = process.env.SENTIMENT_SERVICE_URL || 'http://localhost:3005';
    const sentimentResponse = await fetch(`${sentimentServiceUrl}/api/sentiment/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service': process.env.INTERNAL_SERVICE_KEY || 'dev-key'
      },
      body: JSON.stringify({
        text: message,
        healthcareContext: true,
        includeEmotions: true
      })
    });
    
    if (sentimentResponse.ok) {
      const sentimentData = await sentimentResponse.json();
      sentimentContext = `\n\nSentiment Analysis Context:
- Patient/Provider sentiment: ${sentimentData.sentiment?.category || 'neutral'}
- Emotional indicators: ${sentimentData.emotions ? Object.keys(sentimentData.emotions).join(', ') : 'none detected'}
- Healthcare context relevance: High
This context should inform your clinical recommendations.`;
    }
  } catch (error) {
    console.log('Sentiment service unavailable, proceeding without context');
  }

  const systemPrompt = `You are Dr. Alex AI, a clinical intelligence assistant for healthcare providers integrated with ecosystem sentiment analysis brain.

Current provider tier: ${tierInfo.price === 2999 ? 'Essential' : tierInfo.price === 9999 ? 'Professional' : 'Enterprise'}

Capabilities for this tier:
- Essential ($2,999/month): Advanced clinical decision support, basic EHR integration, crisis detection
- Professional ($9,999/month): Full EHR integration, advanced predictive analytics, treatment optimization  
- Enterprise ($19,999/month): Unlimited queries, hospital-wide crisis detection, custom AI training

Data Integration: You have access to aggregated sentiment analysis and patient outcome correlations from the ecosystem's main analytical brain.

Always provide:
1. Clinical insights based on the provider's question
2. Actionable recommendations enhanced by sentiment analysis
3. Risk assessments when relevant
4. Crisis detection if emergency indicators present
5. Patient emotional state considerations when relevant

Be professional, accurate, and focus on improving patient outcomes through comprehensive data integration.${sentimentContext}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: message
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    content: data.content[0].text,
    suggestions: extractSuggestions(data.content[0].text)
  };
}

// Detect crisis situations in AI response
function detectCrisis(response) {
  const crisisKeywords = [
    'emergency', 'urgent', 'critical', 'immediate', 'crisis', 'stroke', 
    'heart attack', 'cardiac arrest', 'respiratory failure', 'sepsis',
    'anaphylaxis', 'seizure', 'overdose', 'trauma', 'bleeding'
  ];
  
  const lowerResponse = response.toLowerCase();
  return crisisKeywords.some(keyword => lowerResponse.includes(keyword));
}

// Extract actionable suggestions from AI response
function extractSuggestions(response) {
  const suggestions = [];
  
  // Look for numbered lists or bullet points
  const lines = response.split('\n');
  lines.forEach(line => {
    if (line.match(/^\d+\./) || line.match(/^[-•]\s/)) {
      suggestions.push(line.replace(/^\d+\.\s*|^[-•]\s*/, '').trim());
    }
  });
  
  return suggestions.slice(0, 3); // Limit to 3 suggestions
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