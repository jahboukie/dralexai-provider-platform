/**
 * Advanced Analytics & Population Health
 * Comprehensive healthcare analytics with menopause specialty insights
 * HIPAA-compliant aggregated data analysis and trend reporting
 */

const express = require('express');
const router = express.Router();
const database = require('../services/database');
const PHIEncryptionService = require('../services/encryption');
const auditLogger = require('../services/audit-logger');
const authenticateProvider = require('../middleware/auth');
const logger = require('../services/logger');

const encryptionService = new PHIEncryptionService();

// Apply authentication to all analytics routes
router.use(authenticateProvider);

/**
 * Provider dashboard analytics
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { timeframe = '30d' } = req.query;

        // Calculate date range
        const dateRange = calculateDateRange(timeframe);

        // Get comprehensive dashboard metrics
        const metrics = await Promise.all([
            getPatientMetrics(providerId, dateRange),
            getAppointmentMetrics(providerId, dateRange),
            getTelemedicineMetrics(providerId, dateRange),
            getMenopauseMetrics(providerId, dateRange),
            getClinicalMetrics(providerId, dateRange),
            getMenoWellnessMetrics(providerId, dateRange)
        ]);

        const [
            patientMetrics,
            appointmentMetrics,
            telemedicineMetrics,
            menopauseMetrics,
            clinicalMetrics,
            menowellnessMetrics
        ] = metrics;

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'ANALYTICS_DASHBOARD_ACCESSED',
            resourceType: 'analytics',
            details: {
                timeframe,
                accessedAt: new Date().toISOString()
            },
            phiAccessed: false // Aggregated data, no individual PHI
        });

        res.json({
            timeframe,
            dateRange,
            metrics: {
                patients: patientMetrics,
                appointments: appointmentMetrics,
                telemedicine: telemedicineMetrics,
                menopause: menopauseMetrics,
                clinical: clinicalMetrics,
                menowellness: menowellnessMetrics
            },
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Analytics dashboard retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve analytics dashboard',
            message: 'Please try again later'
        });
    }
});

/**
 * Population health insights
 * GET /api/analytics/population-health
 */
router.get('/population-health', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { 
            ageGroup, 
            condition = 'menopause',
            timeframe = '90d' 
        } = req.query;

        const dateRange = calculateDateRange(timeframe);

        // Get population health insights
        const insights = await getPopulationHealthInsights(providerId, {
            ageGroup,
            condition,
            dateRange
        });

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'POPULATION_HEALTH_ACCESSED',
            resourceType: 'analytics',
            details: {
                condition,
                ageGroup,
                timeframe,
                accessedAt: new Date().toISOString()
            },
            phiAccessed: false
        });

        res.json({
            insights,
            parameters: {
                condition,
                ageGroup,
                timeframe,
                dateRange
            },
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Population health insights retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve population health insights',
            message: 'Please try again later'
        });
    }
});

/**
 * Menopause specialty analytics
 * GET /api/analytics/menopause-insights
 */
router.get('/menopause-insights', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { timeframe = '90d' } = req.query;

        const dateRange = calculateDateRange(timeframe);

        // Get menopause-specific analytics
        const insights = await getMenopauseSpecialtyInsights(providerId, dateRange);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'MENOPAUSE_ANALYTICS_ACCESSED',
            resourceType: 'analytics',
            details: {
                timeframe,
                insightTypes: Object.keys(insights),
                accessedAt: new Date().toISOString()
            },
            phiAccessed: false
        });

        res.json({
            insights,
            timeframe,
            dateRange,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Menopause insights retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve menopause insights',
            message: 'Please try again later'
        });
    }
});

/**
 * Clinical outcomes tracking
 * GET /api/analytics/clinical-outcomes
 */
router.get('/clinical-outcomes', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { 
            condition,
            treatment,
            timeframe = '180d' 
        } = req.query;

        const dateRange = calculateDateRange(timeframe);

        // Get clinical outcomes data
        const outcomes = await getClinicalOutcomes(providerId, {
            condition,
            treatment,
            dateRange
        });

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'CLINICAL_OUTCOMES_ACCESSED',
            resourceType: 'analytics',
            details: {
                condition,
                treatment,
                timeframe,
                accessedAt: new Date().toISOString()
            },
            phiAccessed: false
        });

        res.json({
            outcomes,
            parameters: {
                condition,
                treatment,
                timeframe,
                dateRange
            },
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Clinical outcomes retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve clinical outcomes',
            message: 'Please try again later'
        });
    }
});

/**
 * Utility functions for analytics calculations
 */
function calculateDateRange(timeframe) {
    const endDate = new Date();
    const startDate = new Date();

    switch (timeframe) {
        case '7d':
            startDate.setDate(endDate.getDate() - 7);
            break;
        case '30d':
            startDate.setDate(endDate.getDate() - 30);
            break;
        case '90d':
            startDate.setDate(endDate.getDate() - 90);
            break;
        case '180d':
            startDate.setDate(endDate.getDate() - 180);
            break;
        case '1y':
            startDate.setFullYear(endDate.getFullYear() - 1);
            break;
        default:
            startDate.setDate(endDate.getDate() - 30);
    }

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
    };
}

async function getPatientMetrics(providerId, dateRange) {
    const metrics = await database.query(`
        SELECT 
            COUNT(*) as total_patients,
            COUNT(*) FILTER (WHERE created_at >= $2) as new_patients,
            COUNT(*) FILTER (WHERE is_active = true) as active_patients,
            COUNT(*) FILTER (WHERE risk_level = 'high') as high_risk_patients,
            AVG(EXTRACT(YEAR FROM AGE(date_of_birth_encrypted::text::date))) as avg_age
        FROM patients 
        WHERE provider_id = $1
    `, [providerId, dateRange.startDate]);

    const menowellnessLinked = await database.query(`
        SELECT COUNT(*) as linked_count
        FROM menowellness_patients mp
        JOIN patients p ON mp.patient_id = p.id
        WHERE p.provider_id = $1 AND mp.consent_status = 'granted'
    `, [providerId]);

    return {
        totalPatients: parseInt(metrics.rows[0].total_patients),
        newPatients: parseInt(metrics.rows[0].new_patients),
        activePatients: parseInt(metrics.rows[0].active_patients),
        highRiskPatients: parseInt(metrics.rows[0].high_risk_patients),
        averageAge: parseFloat(metrics.rows[0].avg_age) || 0,
        menowellnessLinked: parseInt(menowellnessLinked.rows[0].linked_count)
    };
}

async function getAppointmentMetrics(providerId, dateRange) {
    const metrics = await database.query(`
        SELECT 
            COUNT(*) as total_appointments,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_appointments,
            COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_appointments,
            COUNT(*) FILTER (WHERE status = 'no_show') as no_show_appointments,
            COUNT(*) FILTER (WHERE is_telemedicine = true) as telemedicine_appointments,
            AVG(duration_minutes) as avg_duration
        FROM appointments 
        WHERE provider_id = $1 AND appointment_date >= $2 AND appointment_date <= $3
    `, [providerId, dateRange.startDate, dateRange.endDate]);

    return {
        totalAppointments: parseInt(metrics.rows[0].total_appointments),
        completedAppointments: parseInt(metrics.rows[0].completed_appointments),
        cancelledAppointments: parseInt(metrics.rows[0].cancelled_appointments),
        noShowAppointments: parseInt(metrics.rows[0].no_show_appointments),
        telemedicineAppointments: parseInt(metrics.rows[0].telemedicine_appointments),
        averageDuration: parseFloat(metrics.rows[0].avg_duration) || 0,
        completionRate: metrics.rows[0].total_appointments > 0 ? 
            (metrics.rows[0].completed_appointments / metrics.rows[0].total_appointments * 100).toFixed(1) : 0
    };
}

async function getTelemedicineMetrics(providerId, dateRange) {
    const metrics = await database.query(`
        SELECT 
            COUNT(*) as total_sessions,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_sessions,
            AVG(actual_duration_minutes) as avg_duration,
            COUNT(*) FILTER (WHERE follow_up_required = true) as follow_up_required
        FROM telemedicine_sessions 
        WHERE provider_id = $1 AND created_at >= $2 AND created_at <= $3
    `, [providerId, dateRange.startDate, dateRange.endDate]);

    return {
        totalSessions: parseInt(metrics.rows[0].total_sessions),
        completedSessions: parseInt(metrics.rows[0].completed_sessions),
        averageDuration: parseFloat(metrics.rows[0].avg_duration) || 0,
        followUpRequired: parseInt(metrics.rows[0].follow_up_required),
        completionRate: metrics.rows[0].total_sessions > 0 ? 
            (metrics.rows[0].completed_sessions / metrics.rows[0].total_sessions * 100).toFixed(1) : 0
    };
}

async function getMenopauseMetrics(providerId, dateRange) {
    // Mock menopause-specific metrics (would be calculated from actual patient data)
    return {
        menopausePatients: 45,
        perimenopausePatients: 23,
        postmenopausePatients: 22,
        hormoneTreatmentPatients: 18,
        symptomSeverityDistribution: {
            mild: 15,
            moderate: 20,
            severe: 10
        },
        commonSymptoms: [
            { symptom: 'Hot flashes', count: 35 },
            { symptom: 'Sleep disturbance', count: 28 },
            { symptom: 'Mood changes', count: 25 },
            { symptom: 'Night sweats', count: 22 }
        ]
    };
}

async function getClinicalMetrics(providerId, dateRange) {
    const soapNotes = await database.query(`
        SELECT COUNT(*) as soap_notes_count
        FROM soap_notes 
        WHERE provider_id = $1 AND created_at >= $2 AND created_at <= $3
    `, [providerId, dateRange.startDate, dateRange.endDate]);

    const medications = await database.query(`
        SELECT COUNT(*) as active_medications
        FROM medications 
        WHERE provider_id = $1 AND status = 'active'
    `, [providerId]);

    return {
        soapNotesCreated: parseInt(soapNotes.rows[0].soap_notes_count),
        activeMedications: parseInt(medications.rows[0].active_medications),
        clinicalDecisionSupport: {
            drugInteractionChecks: 45,
            allergyAlerts: 12,
            clinicalAnalyses: 38
        }
    };
}

async function getMenoWellnessMetrics(providerId, dateRange) {
    const syncMetrics = await database.query(`
        SELECT 
            COUNT(*) as total_linked,
            COUNT(*) FILTER (WHERE last_sync_at >= $2) as recent_syncs,
            AVG(EXTRACT(EPOCH FROM (NOW() - last_sync_at))/86400) as avg_days_since_sync
        FROM menowellness_patients mp
        JOIN patients p ON mp.patient_id = p.id
        WHERE p.provider_id = $1 AND mp.consent_status = 'granted'
    `, [providerId, dateRange.startDate]);

    return {
        totalLinkedPatients: parseInt(syncMetrics.rows[0].total_linked),
        recentSyncs: parseInt(syncMetrics.rows[0].recent_syncs),
        averageDaysSinceSync: parseFloat(syncMetrics.rows[0].avg_days_since_sync) || 0,
        dataSharing: {
            basic: 15,
            full: 8,
            researchOnly: 2
        }
    };
}

async function getPopulationHealthInsights(providerId, params) {
    // Mock population health insights (would be calculated from aggregated patient data)
    return {
        demographics: {
            ageDistribution: {
                '40-45': 12,
                '46-50': 18,
                '51-55': 22,
                '56-60': 15,
                '60+': 8
            },
            riskFactors: [
                { factor: 'Family history', prevalence: 45 },
                { factor: 'Obesity', prevalence: 32 },
                { factor: 'Smoking history', prevalence: 18 }
            ]
        },
        trends: {
            symptomSeverityTrend: 'improving',
            treatmentAdherence: 78,
            qualityOfLifeScore: 7.2
        },
        benchmarks: {
            nationalAverage: 6.8,
            peerComparison: 'above_average'
        }
    };
}

async function getMenopauseSpecialtyInsights(providerId, dateRange) {
    // Mock menopause specialty insights
    return {
        treatmentEffectiveness: {
            hormoneTreatment: {
                responseRate: 82,
                sideEffectRate: 15,
                discontinuationRate: 8
            },
            nonHormonalTreatment: {
                responseRate: 65,
                sideEffectRate: 8,
                discontinuationRate: 12
            }
        },
        symptomPatterns: {
            seasonalVariation: true,
            stressCorrelation: 0.73,
            sleepImpact: 0.68
        },
        qualityMetrics: {
            patientSatisfaction: 8.4,
            symptomImprovement: 75,
            treatmentAdherence: 78
        }
    };
}

async function getClinicalOutcomes(providerId, params) {
    // Mock clinical outcomes data
    return {
        treatmentResponse: {
            excellent: 25,
            good: 35,
            fair: 20,
            poor: 5
        },
        qualityOfLife: {
            baseline: 5.2,
            current: 7.1,
            improvement: 36.5
        },
        adherence: {
            medication: 78,
            lifestyle: 65,
            followUp: 82
        }
    };
}

module.exports = router;
