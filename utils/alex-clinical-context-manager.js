/**
 * Alex AI Clinical Context Manager
 * PURE CLINICAL FUNCTIONALITY - No sales features
 * Handles clinical sessions, crisis detection, and medical context
 */

const { CRISIS_KEYWORDS, EMERGENCY_INDICATORS, MENOPAUSE_KEYWORDS } = require('../config/alex-clinical-prompt');

class AlexClinicalContextManager {
  constructor() {
    this.sessions = new Map(); // In-memory session storage
  }

  /**
   * Initialize or get clinical session context
   */
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        sessionType: 'clinical_consultation',
        userType: 'healthcare_provider',
        specialty: 'general_practice', // 'general_practice' | 'gynecology' | 'endocrinology' | 'psychiatry'
        conversationHistory: [],
        
        // Clinical context tracking
        clinicalContext: {
          currentPatients: [],
          activeConsultations: [],
          clinicalFocus: [], // areas of clinical interest in this session
          urgencyLevel: 'routine', // 'routine' | 'urgent' | 'emergent' | 'crisis'
          specialtyNeeds: [], // specific clinical areas being discussed
          crisisDetected: false,
          emergencyIndicators: []
        },
        
        // Session analytics for clinical quality
        qualityMetrics: {
          clinicalAccuracy: null,
          responseTime: [],
          evidenceBasedResponses: 0,
          crisisInterventions: 0,
          patientSafetyAlerts: 0
        },
        
        createdAt: new Date(),
        lastActivity: new Date()
      });
    }
    return this.sessions.get(sessionId);
  }

  /**
   * Detect clinical emergency and crisis situations
   */
  detectClinicalEmergency(message) {
    const lowerMessage = message.toLowerCase();
    
    const crisisDetected = CRISIS_KEYWORDS.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );
    
    const emergencyDetected = EMERGENCY_INDICATORS.some(indicator => 
      lowerMessage.includes(indicator.toLowerCase())
    );
    
    let urgencyLevel = 'routine';
    let detectedIndicators = [];
    
    if (crisisDetected) {
      urgencyLevel = 'crisis';
      detectedIndicators = CRISIS_KEYWORDS.filter(keyword => 
        lowerMessage.includes(keyword.toLowerCase())
      );
    } else if (emergencyDetected) {
      urgencyLevel = 'emergent';
      detectedIndicators = EMERGENCY_INDICATORS.filter(indicator => 
        lowerMessage.includes(indicator.toLowerCase())
      );
    } else if (this.detectUrgentSymptoms(message)) {
      urgencyLevel = 'urgent';
      detectedIndicators = this.getUrgentSymptoms(message);
    }
    
    return {
      crisisDetected,
      emergencyDetected,
      urgencyLevel,
      detectedIndicators,
      requiresImmediateAttention: crisisDetected || emergencyDetected
    };
  }

  /**
   * Detect urgent symptoms that require prompt attention
   */
  detectUrgentSymptoms(message) {
    const urgentSymptoms = [
      'severe pain', 'severe headache', 'severe abdominal pain',
      'high fever', 'persistent vomiting', 'severe dizziness',
      'irregular heartbeat', 'severe anxiety', 'panic attack'
    ];
    
    const lowerMessage = message.toLowerCase();
    return urgentSymptoms.some(symptom => lowerMessage.includes(symptom));
  }

  /**
   * Get urgent symptoms from message
   */
  getUrgentSymptoms(message) {
    const urgentSymptoms = [
      'severe pain', 'severe headache', 'severe abdominal pain',
      'high fever', 'persistent vomiting', 'severe dizziness',
      'irregular heartbeat', 'severe anxiety', 'panic attack'
    ];
    
    const lowerMessage = message.toLowerCase();
    return urgentSymptoms.filter(symptom => lowerMessage.includes(symptom));
  }

  /**
   * Detect menopause-related clinical context
   */
  detectMenopauseContext(message) {
    const lowerMessage = message.toLowerCase();
    
    const menopauseDetected = MENOPAUSE_KEYWORDS.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );
    
    if (menopauseDetected) {
      const detectedKeywords = MENOPAUSE_KEYWORDS.filter(keyword => 
        lowerMessage.includes(keyword.toLowerCase())
      );
      
      // Determine menopause stage based on keywords
      let stage = 'unknown';
      if (lowerMessage.includes('perimenopause') || lowerMessage.includes('irregular period')) {
        stage = 'perimenopause';
      } else if (lowerMessage.includes('postmenopause') || lowerMessage.includes('no periods')) {
        stage = 'postmenopause';
      } else if (lowerMessage.includes('menopause') && !lowerMessage.includes('peri')) {
        stage = 'menopause';
      }
      
      return {
        menopauseDetected: true,
        stage,
        symptoms: detectedKeywords,
        clinicalFocus: 'menopause_management'
      };
    }
    
    return {
      menopauseDetected: false,
      stage: null,
      symptoms: [],
      clinicalFocus: null
    };
  }

  /**
   * Detect medical specialty focus
   */
  detectSpecialtyFocus(message) {
    const specialtyKeywords = {
      gynecology: ['gynecological', 'gynecology', 'menstrual', 'reproductive', 'pelvic', 'vaginal'],
      endocrinology: ['hormone', 'hormonal', 'endocrine', 'thyroid', 'diabetes', 'insulin'],
      cardiology: ['heart', 'cardiac', 'cardiovascular', 'blood pressure', 'chest pain'],
      psychiatry: ['mental health', 'depression', 'anxiety', 'mood', 'psychological'],
      orthopedics: ['bone', 'joint', 'fracture', 'osteoporosis', 'arthritis'],
      dermatology: ['skin', 'rash', 'dermatological', 'allergic reaction']
    };
    
    const lowerMessage = message.toLowerCase();
    const detectedSpecialties = [];
    
    for (const [specialty, keywords] of Object.entries(specialtyKeywords)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        detectedSpecialties.push(specialty);
      }
    }
    
    return detectedSpecialties;
  }

  /**
   * Update clinical session context based on new message
   */
  updateClinicalContext(sessionId, message, response) {
    const session = this.getSession(sessionId);
    
    // Add to conversation history
    session.conversationHistory.push({
      timestamp: new Date(),
      userMessage: message,
      aiResponse: response,
      sessionType: 'clinical_consultation'
    });

    // Detect and update clinical context
    const emergencyContext = this.detectClinicalEmergency(message);
    const menopauseContext = this.detectMenopauseContext(message);
    const specialties = this.detectSpecialtyFocus(message);

    // Update clinical context
    if (emergencyContext.requiresImmediateAttention) {
      session.clinicalContext.urgencyLevel = emergencyContext.urgencyLevel;
      session.clinicalContext.crisisDetected = emergencyContext.crisisDetected;
      session.clinicalContext.emergencyIndicators = emergencyContext.detectedIndicators;
      
      // Increment crisis intervention counter
      if (emergencyContext.crisisDetected) {
        session.qualityMetrics.crisisInterventions++;
      }
    }

    // Update menopause context
    if (menopauseContext.menopauseDetected) {
      if (!session.clinicalContext.clinicalFocus.includes('menopause_management')) {
        session.clinicalContext.clinicalFocus.push('menopause_management');
      }
    }

    // Update specialty focus
    specialties.forEach(specialty => {
      if (!session.clinicalContext.specialtyNeeds.includes(specialty)) {
        session.clinicalContext.specialtyNeeds.push(specialty);
      }
    });

    // Update quality metrics
    if (this.isEvidenceBasedResponse(response)) {
      session.qualityMetrics.evidenceBasedResponses++;
    }

    session.lastActivity = new Date();
    return session;
  }

  /**
   * Check if response is evidence-based
   */
  isEvidenceBasedResponse(response) {
    const evidenceIndicators = [
      'evidence shows', 'studies indicate', 'research suggests',
      'clinical trials', 'meta-analysis', 'systematic review',
      'according to guidelines', 'evidence-based', 'peer-reviewed'
    ];
    
    const lowerResponse = response.toLowerCase();
    return evidenceIndicators.some(indicator => lowerResponse.includes(indicator));
  }

  /**
   * Generate clinical session summary
   */
  generateClinicalSummary(sessionId) {
    const session = this.getSession(sessionId);
    
    return {
      sessionId,
      duration: new Date() - session.createdAt,
      conversationLength: session.conversationHistory.length,
      clinicalContext: session.clinicalContext,
      qualityMetrics: session.qualityMetrics,
      clinicalAssessment: {
        urgencyLevel: session.clinicalContext.urgencyLevel,
        specialtyFocus: session.clinicalContext.specialtyNeeds,
        clinicalTopics: session.clinicalContext.clinicalFocus,
        crisisInterventions: session.qualityMetrics.crisisInterventions,
        evidenceBasedRatio: session.qualityMetrics.evidenceBasedResponses / session.conversationHistory.length
      }
    };
  }

  /**
   * Clean up old clinical sessions
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
   * Get clinical analytics for quality improvement
   */
  getClinicalAnalytics(sessionId) {
    const session = this.getSession(sessionId);
    
    return {
      sessionId,
      sessionType: session.sessionType,
      userType: session.userType,
      specialty: session.specialty,
      conversationLength: session.conversationHistory.length,
      clinicalMetrics: {
        urgencyLevel: session.clinicalContext.urgencyLevel,
        crisisDetected: session.clinicalContext.crisisDetected,
        specialtyAreas: session.clinicalContext.specialtyNeeds,
        clinicalFocus: session.clinicalContext.clinicalFocus
      },
      qualityIndicators: {
        evidenceBasedResponses: session.qualityMetrics.evidenceBasedResponses,
        crisisInterventions: session.qualityMetrics.crisisInterventions,
        patientSafetyAlerts: session.qualityMetrics.patientSafetyAlerts,
        avgResponseTime: session.qualityMetrics.responseTime.length > 0 
          ? session.qualityMetrics.responseTime.reduce((a, b) => a + b, 0) / session.qualityMetrics.responseTime.length 
          : 0
      },
      duration: new Date() - session.createdAt,
      lastActivity: session.lastActivity
    };
  }
}

// Export singleton instance
const alexClinicalContextManager = new AlexClinicalContextManager();

module.exports = alexClinicalContextManager;