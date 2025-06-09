/**
 * Alex AI Context Manager
 * Handles dual-role context switching between clinical and sales modes
 * Maintains conversation history and organization type detection
 */

class AlexContextManager {
  constructor() {
    this.sessions = new Map(); // In-memory session storage
  }

  /**
   * Initialize or get session context
   */
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        role: 'clinical', // 'clinical' | 'sales' | 'demo'
        userType: 'provider', // 'patient' | 'provider' | 'prospect' | 'admin'
        organizationType: 'small_practice', // 'solo_practice' | 'small_practice' | 'health_system' | 'enterprise'
        conversationHistory: [],
        salesContext: {
          inquiryStage: 'initial', // 'initial' | 'evaluation' | 'demo' | 'trial' | 'negotiation'
          keyInterests: [],
          concernsRaised: [],
          competitorsDiscussed: []
        },
        clinicalContext: {
          patientCases: [],
          specialties: [],
          urgencyLevel: 'routine'
        },
        createdAt: new Date(),
        lastActivity: new Date()
      });
    }
    return this.sessions.get(sessionId);
  }

  /**
   * Detect sales intent from message content
   */
  detectSalesIntent(message) {
    const salesKeywords = [
      'potential healthcare provider customer',
      'evaluating platforms',
      'platform capabilities',
      'platform features',
      'differentiation',
      'pricing',
      'subscription',
      'cost',
      'ROI',
      'return on investment',
      'compared to',
      'competitive analysis',
      'evaluation',
      'demo',
      'trial',
      'pilot program',
      'enterprise',
      'health system',
      'hospital implementation',
      'Epic integration',
      'Cerner integration',
      'business case',
      'implementation',
      'procurement',
      'vendor evaluation'
    ];

    return salesKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Detect organization type from message content
   */
  detectOrganizationType(message) {
    const orgPatterns = {
      solo_practice: ['solo', 'single provider', 'independent practice', 'private practice'],
      small_practice: ['practice', 'clinic', 'medical group', 'small practice', 'family practice'],
      health_system: ['health system', 'hospital', 'medical center', 'health network', 'hospital system'],
      enterprise: ['enterprise', 'large organization', 'multi-location', 'corporation', 'health plan']
    };

    for (const [type, keywords] of Object.entries(orgPatterns)) {
      if (keywords.some(keyword => message.toLowerCase().includes(keyword.toLowerCase()))) {
        return type;
      }
    }
    return 'small_practice'; // default
  }

  /**
   * Update session context based on new message
   */
  updateContext(sessionId, message, response) {
    const session = this.getSession(sessionId);
    
    // Add to conversation history
    session.conversationHistory.push({
      timestamp: new Date(),
      userMessage: message,
      aiResponse: response,
      role: session.role
    });

    // Detect and update context
    const isSalesInquiry = this.detectSalesIntent(message);
    const orgType = this.detectOrganizationType(message);

    if (isSalesInquiry && session.role !== 'sales') {
      // Switch to sales mode
      session.role = 'sales';
      session.userType = 'prospect';
      session.organizationType = orgType;
      
      // Track sales context
      this.updateSalesContext(session, message);
    }

    session.lastActivity = new Date();
    return session;
  }

  /**
   * Update sales-specific context tracking
   */
  updateSalesContext(session, message) {
    const lowerMessage = message.toLowerCase();

    // Track inquiry stage
    if (lowerMessage.includes('demo') || lowerMessage.includes('demonstration')) {
      session.salesContext.inquiryStage = 'demo';
    } else if (lowerMessage.includes('trial') || lowerMessage.includes('pilot')) {
      session.salesContext.inquiryStage = 'trial';
    } else if (lowerMessage.includes('pricing') || lowerMessage.includes('cost')) {
      session.salesContext.inquiryStage = 'negotiation';
    } else if (lowerMessage.includes('evaluation') || lowerMessage.includes('comparing')) {
      session.salesContext.inquiryStage = 'evaluation';
    }

    // Track key interests
    const interests = ['security', 'compliance', 'integration', 'ROI', 'analytics', 'workflow'];
    interests.forEach(interest => {
      if (lowerMessage.includes(interest) && !session.salesContext.keyInterests.includes(interest)) {
        session.salesContext.keyInterests.push(interest);
      }
    });

    // Track competitors mentioned
    const competitors = ['epic', 'cerner', 'athenahealth', 'allscripts', 'nextgen'];
    competitors.forEach(competitor => {
      if (lowerMessage.includes(competitor) && !session.salesContext.competitorsDiscussed.includes(competitor)) {
        session.salesContext.competitorsDiscussed.push(competitor);
      }
    });
  }

  /**
   * Get recommended pricing tier based on organization type
   */
  getRecommendedPricingTier(organizationType) {
    const pricingTiers = {
      solo_practice: {
        tier: 'Essential',
        price: '$2,999/month',
        queries: '1,000 AI queries',
        features: 'Basic EHR integration, clinical decision support',
        roi: '$120K+ annual savings through 25% admin reduction'
      },
      small_practice: {
        tier: 'Professional',
        price: '$9,999/month',
        queries: '5,000 AI queries',
        features: 'Advanced analytics, full EHR integration, predictive insights',
        roi: '$500K+ annual savings through 40% admin reduction + risk mitigation'
      },
      health_system: {
        tier: 'Enterprise Professional',
        price: '$19,999/month',
        queries: 'Unlimited queries',
        features: 'Hospital-wide integration, custom training, white-label options',
        roi: '$1.2M+ annual savings through complete workflow optimization'
      },
      enterprise: {
        tier: 'Enterprise Unlimited',
        price: 'Custom pricing',
        queries: 'Unlimited queries',
        features: 'Multi-tenant deployment, custom development, dedicated support',
        roi: 'Scalable ROI based on organization size and complexity'
      }
    };

    return pricingTiers[organizationType] || pricingTiers.small_practice;
  }

  /**
   * Generate ROI example based on organization type
   */
  generateROIExample(organizationType) {
    const examples = {
      solo_practice: 'At $2,999/month for 1,000 AI queries, you pay $3 per clinical decision enhancement. Compare that to specialist referral costs of $200+ per case.',
      small_practice: 'At $9,999/month for 5,000 AI queries, you pay $2 per clinical decision. Your current consulting costs are likely 50x that per case.',
      health_system: 'At $19,999/month for unlimited queries, there are no per-case costs. For health systems seeing 1,000+ cases monthly, this delivers exceptional value.',
      enterprise: 'Custom pricing ensures optimal value for your specific use case and scale. Unlimited queries mean predictable costs regardless of growth.'
    };

    return examples[organizationType] || examples.small_practice;
  }

  /**
   * Clean up old sessions (call periodically)
   */
  cleanupSessions(maxAgeHours = 24) {
    const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < cutoffTime) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get session analytics for sales tracking
   */
  getSessionAnalytics(sessionId) {
    const session = this.getSession(sessionId);
    
    return {
      sessionId,
      role: session.role,
      userType: session.userType,
      organizationType: session.organizationType,
      conversationLength: session.conversationHistory.length,
      salesContext: session.salesContext,
      duration: new Date() - session.createdAt,
      lastActivity: session.lastActivity
    };
  }
}

// Export singleton instance
const alexContextManager = new AlexContextManager();

module.exports = alexContextManager;
