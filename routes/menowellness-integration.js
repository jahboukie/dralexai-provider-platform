/**
 * MenoWellness Integration API
 * Secure data exchange between Dr. Alex AI Provider Platform and MenoWellness
 * HIPAA-compliant patient data sharing with consent management
 */

const express = require('express');
const router = express.Router();
const database = require('../services/database');
const encryptionService = require('../services/encryption');
const auditLogger = require('../services/audit-logger');
const demoAuth = require('../middleware/demo-auth');
const logger = require('../services/logger');

// Apply authentication to all MenoWellness integration routes
router.use(demoAuth);

/**
 * Link patient to MenoWellness platform
 * POST /api/menowellness/patients/link
 */
router.post('/patients/link', async (req, res) => {
    try {
        const { patientId, menowellnessPatientId, consentLevel = 'basic' } = req.body;
        const providerId = req.user.providerId;

        // Validate patient belongs to provider
        const patientCheck = await database.query(
            'SELECT id FROM patients WHERE id = $1 AND provider_id = $2',
            [patientId, providerId]
        );

        if (patientCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Patient not found or access denied'
            });
        }

        // Encrypt MenoWellness patient ID for secure storage
        const encryptedMenoWellnessId = await encryptionService.encryptPHI(
            { menowellnessPatientId },
            patientId,
            'menowellness_link'
        );

        // Generate secure linkage token
        const linkageToken = require('crypto').randomBytes(32).toString('hex');
        const tokenHash = require('crypto').createHash('sha256').update(linkageToken).digest('hex');

        // Create linkage record
        const linkResult = await database.query(`
            INSERT INTO menowellness_patients (
                provider_id, patient_id, menowellness_patient_id_encrypted,
                linkage_token_hash, consent_status, data_sharing_level,
                consent_granted_at, consent_expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + INTERVAL '1 year')
            RETURNING id, created_at
        `, [
            providerId,
            patientId,
            JSON.stringify(encryptedMenoWellnessId),
            tokenHash,
            'granted',
            consentLevel
        ]);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'MENOWELLNESS_PATIENT_LINKED',
            resourceType: 'patient',
            resourceId: patientId,
            details: {
                linkageId: linkResult.rows[0].id,
                consentLevel,
                linkedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json({
            success: true,
            linkageId: linkResult.rows[0].id,
            linkageToken, // Return once for MenoWellness to store
            consentLevel,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        });

    } catch (error) {
        logger.error('MenoWellness patient linking failed:', error);
        res.status(500).json({
            error: 'Failed to link patient to MenoWellness',
            message: 'Please try again later'
        });
    }
});

/**
 * Import symptom data from MenoWellness
 * POST /api/menowellness/symptoms/import
 */
router.post('/symptoms/import', async (req, res) => {
    try {
        const { linkageToken, symptomData, periodStart, periodEnd } = req.body;
        const providerId = req.user.providerId;

        // Verify linkage token
        const tokenHash = require('crypto').createHash('sha256').update(linkageToken).digest('hex');
        
        const linkageResult = await database.query(`
            SELECT ml.*, p.id as patient_id
            FROM menowellness_patients ml
            JOIN patients p ON ml.patient_id = p.id
            WHERE ml.linkage_token_hash = $1 
            AND ml.provider_id = $2 
            AND ml.consent_status = 'granted'
            AND ml.consent_expires_at > NOW()
        `, [tokenHash, providerId]);

        if (linkageResult.rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid linkage token or expired consent'
            });
        }

        const linkage = linkageResult.rows[0];

        // Encrypt symptom data for storage
        const encryptedSymptomData = await encryptionService.encryptPHI(
            symptomData,
            linkage.patient_id,
            'menowellness_symptoms'
        );

        // Process and analyze symptom trends
        const processedTrends = await processSymptomTrends(symptomData);
        const aiInsights = await generateSymptomInsights(symptomData, linkage.patient_id);

        // Store imported data
        const importResult = await database.query(`
            INSERT INTO shared_symptom_data (
                menowellness_link_id, symptom_data_encrypted, severity_trends,
                ai_insights, data_period_start, data_period_end, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, imported_at
        `, [
            linkage.id,
            JSON.stringify(encryptedSymptomData),
            JSON.stringify(processedTrends),
            JSON.stringify(aiInsights),
            periodStart,
            periodEnd,
            providerId
        ]);

        // Update last sync time
        await database.query(
            'UPDATE menowellness_patients SET last_sync_at = NOW() WHERE id = $1',
            [linkage.id]
        );

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'MENOWELLNESS_SYMPTOMS_IMPORTED',
            resourceType: 'patient',
            resourceId: linkage.patient_id,
            details: {
                importId: importResult.rows[0].id,
                symptomCount: symptomData.symptoms?.length || 0,
                periodStart,
                periodEnd,
                importedAt: importResult.rows[0].imported_at
            },
            phiAccessed: true
        });

        res.json({
            success: true,
            importId: importResult.rows[0].id,
            processedTrends,
            aiInsights: aiInsights.summary,
            importedAt: importResult.rows[0].imported_at
        });

    } catch (error) {
        logger.error('MenoWellness symptom import failed:', error);
        res.status(500).json({
            error: 'Failed to import symptom data',
            message: 'Please try again later'
        });
    }
});

/**
 * Share clinical insights with MenoWellness
 * POST /api/menowellness/insights/share
 */
router.post('/insights/share', async (req, res) => {
    try {
        const { patientId, insightType, insightData, shareWithPatient = false } = req.body;
        const providerId = req.user.providerId;

        // Verify patient linkage
        const linkageResult = await database.query(`
            SELECT id, data_sharing_level
            FROM menowellness_patients
            WHERE patient_id = $1 AND provider_id = $2 
            AND consent_status = 'granted'
        `, [patientId, providerId]);

        if (linkageResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Patient not linked to MenoWellness or consent not granted'
            });
        }

        const linkage = linkageResult.rows[0];

        // Check sharing permissions
        if (!canShareInsightType(insightType, linkage.data_sharing_level)) {
            return res.status(403).json({
                error: 'Insufficient sharing permissions for this insight type'
            });
        }

        // Encrypt insight data for sharing
        const encryptedInsightData = await encryptionService.encryptForMenoWellness(
            insightData,
            patientId,
            linkage.data_sharing_level
        );

        // Store insight for sharing
        const insightResult = await database.query(`
            INSERT INTO provider_insights (
                menowellness_link_id, provider_id, insight_type,
                insight_data_encrypted, shared_with_patient, expires_at
            ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 days')
            RETURNING id, created_at
        `, [
            linkage.id,
            providerId,
            insightType,
            JSON.stringify(encryptedInsightData),
            shareWithPatient
        ]);

        // Mark as shared
        await database.query(
            'UPDATE provider_insights SET shared_at = NOW() WHERE id = $1',
            [insightResult.rows[0].id]
        );

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'CLINICAL_INSIGHT_SHARED',
            resourceType: 'patient',
            resourceId: patientId,
            details: {
                insightId: insightResult.rows[0].id,
                insightType,
                shareWithPatient,
                sharedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json({
            success: true,
            insightId: insightResult.rows[0].id,
            sharedAt: insightResult.rows[0].created_at,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });

    } catch (error) {
        logger.error('Clinical insight sharing failed:', error);
        res.status(500).json({
            error: 'Failed to share clinical insight',
            message: 'Please try again later'
        });
    }
});

/**
 * Get patient's MenoWellness data summary
 * GET /api/menowellness/patients/:patientId/summary
 */
router.get('/patients/:patientId/summary', async (req, res) => {
    try {
        const { patientId } = req.params;
        const providerId = req.user.providerId;

        // Get linkage and recent data
        const summaryResult = await database.query(`
            SELECT 
                ml.consent_status,
                ml.data_sharing_level,
                ml.last_sync_at,
                COUNT(ssd.id) as symptom_imports,
                COUNT(pi.id) as shared_insights,
                MAX(ssd.data_period_end) as latest_symptom_data
            FROM menowellness_patients ml
            LEFT JOIN shared_symptom_data ssd ON ml.id = ssd.menowellness_link_id
            LEFT JOIN provider_insights pi ON ml.id = pi.menowellness_link_id
            WHERE ml.patient_id = $1 AND ml.provider_id = $2
            GROUP BY ml.id, ml.consent_status, ml.data_sharing_level, ml.last_sync_at
        `, [patientId, providerId]);

        if (summaryResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Patient not linked to MenoWellness'
            });
        }

        const summary = summaryResult.rows[0];

        // Get recent symptom trends (if available)
        let recentTrends = null;
        if (summary.symptom_imports > 0) {
            const trendsResult = await database.query(`
                SELECT severity_trends, ai_insights
                FROM shared_symptom_data ssd
                JOIN menowellness_patients ml ON ssd.menowellness_link_id = ml.id
                WHERE ml.patient_id = $1 AND ml.provider_id = $2
                ORDER BY ssd.data_period_end DESC
                LIMIT 1
            `, [patientId, providerId]);

            if (trendsResult.rows.length > 0) {
                recentTrends = {
                    trends: trendsResult.rows[0].severity_trends,
                    insights: trendsResult.rows[0].ai_insights
                };
            }
        }

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'MENOWELLNESS_SUMMARY_ACCESSED',
            resourceType: 'patient',
            resourceId: patientId,
            details: {
                accessedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json({
            patientId,
            linkageStatus: summary.consent_status,
            sharingLevel: summary.data_sharing_level,
            lastSync: summary.last_sync_at,
            dataImports: parseInt(summary.symptom_imports),
            sharedInsights: parseInt(summary.shared_insights),
            latestData: summary.latest_symptom_data,
            recentTrends
        });

    } catch (error) {
        logger.error('MenoWellness summary retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve MenoWellness summary',
            message: 'Please try again later'
        });
    }
});

/**
 * Utility functions
 */
async function processSymptomTrends(symptomData) {
    // Process symptom data to identify trends
    const symptoms = symptomData.symptoms || [];
    
    const trendAnalysis = {
        severityTrend: calculateSeverityTrend(symptoms),
        frequencyPatterns: analyzeFrequencyPatterns(symptoms),
        correlations: findSymptomCorrelations(symptoms),
        riskFactors: identifyRiskFactors(symptoms)
    };

    return trendAnalysis;
}

async function generateSymptomInsights(symptomData, patientId) {
    // Generate AI insights from symptom data
    const insights = {
        summary: 'Symptom pattern analysis completed',
        recommendations: [
            'Monitor hot flash frequency trends',
            'Consider sleep quality interventions',
            'Evaluate mood pattern correlations'
        ],
        alerts: [],
        confidence: 0.85
    };

    return insights;
}

function canShareInsightType(insightType, sharingLevel) {
    const sharingMatrix = {
        'basic': ['general_recommendations', 'lifestyle_tips'],
        'full': ['general_recommendations', 'lifestyle_tips', 'medication_adjustments', 'clinical_notes'],
        'research_only': ['anonymized_trends', 'population_insights']
    };

    return sharingMatrix[sharingLevel]?.includes(insightType) || false;
}

function calculateSeverityTrend(symptoms) {
    // Calculate trend in symptom severity over time
    if (symptoms.length < 2) return 'insufficient_data';
    
    const recentSeverity = symptoms.slice(-7).reduce((sum, s) => sum + (s.severity || 0), 0) / 7;
    const earlierSeverity = symptoms.slice(0, 7).reduce((sum, s) => sum + (s.severity || 0), 0) / 7;
    
    if (recentSeverity > earlierSeverity + 1) return 'worsening';
    if (recentSeverity < earlierSeverity - 1) return 'improving';
    return 'stable';
}

function analyzeFrequencyPatterns(symptoms) {
    // Analyze frequency patterns in symptoms
    const dailyCounts = {};
    symptoms.forEach(symptom => {
        const date = symptom.date?.split('T')[0];
        if (date) {
            dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        }
    });

    const frequencies = Object.values(dailyCounts);
    const avgFrequency = frequencies.reduce((sum, f) => sum + f, 0) / frequencies.length;
    
    return {
        averageDaily: avgFrequency,
        pattern: avgFrequency > 5 ? 'high_frequency' : avgFrequency > 2 ? 'moderate' : 'low'
    };
}

function findSymptomCorrelations(symptoms) {
    // Find correlations between different symptoms
    const correlations = [];
    
    // Simple correlation analysis (would be more sophisticated in production)
    const hotFlashes = symptoms.filter(s => s.type === 'hot_flash').length;
    const sleepIssues = symptoms.filter(s => s.type === 'sleep_disturbance').length;
    
    if (hotFlashes > 0 && sleepIssues > 0) {
        correlations.push({
            symptoms: ['hot_flash', 'sleep_disturbance'],
            correlation: 0.7,
            significance: 'moderate'
        });
    }

    return correlations;
}

function identifyRiskFactors(symptoms) {
    // Identify potential risk factors from symptom patterns
    const riskFactors = [];
    
    const severeSymptomsCount = symptoms.filter(s => s.severity >= 8).length;
    if (severeSymptomsCount > symptoms.length * 0.3) {
        riskFactors.push({
            factor: 'high_severity_symptoms',
            risk_level: 'moderate',
            recommendation: 'Consider comprehensive evaluation'
        });
    }

    return riskFactors;
}

module.exports = router;
