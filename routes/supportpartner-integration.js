/**
 * SupportPartner Integration API
 * Secure partner access and care coordination system
 * HIPAA-compliant partner education and support framework
 */

const express = require('express');
const router = express.Router();
const database = require('../services/database');
const PHIEncryptionService = require('../services/encryption');
const auditLogger = require('../services/audit-logger');
const authenticateProvider = require('../middleware/auth');
const logger = require('../services/logger');
const crypto = require('crypto');

const encryptionService = new PHIEncryptionService();

// Apply authentication to all SupportPartner routes
router.use(authenticateProvider);

/**
 * Register partner for patient
 * POST /api/supportpartner/partners/register
 */
router.post('/partners/register', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const {
            patientId,
            partnerEmail,
            partnerFirstName,
            partnerLastName,
            relationshipType = 'spouse',
            accessLevel = 'basic',
            consentGiven = false
        } = req.body;

        // Verify patient access
        const patientCheck = await database.query(
            'SELECT id, first_name_encrypted, last_name_encrypted FROM patients WHERE id = $1 AND provider_id = $2',
            [patientId, providerId]
        );

        if (patientCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Patient not found or access denied'
            });
        }

        // Generate secure partner access token
        const partnerToken = crypto.randomBytes(32).toString('hex');
        const invitationCode = crypto.randomBytes(8).toString('hex').toUpperCase();

        // Encrypt partner information
        const encryptedPartnerData = await encryptionService.encryptPHI({
            firstName: partnerFirstName,
            lastName: partnerLastName,
            email: partnerEmail
        }, patientId, 'partner_registration');

        // Create partner record
        const result = await database.query(`
            INSERT INTO support_partners (
                patient_id, provider_id, partner_data_encrypted,
                relationship_type, access_level, partner_token,
                invitation_code, consent_given, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, created_at
        `, [
            patientId, providerId, JSON.stringify(encryptedPartnerData),
            relationshipType, accessLevel, partnerToken,
            invitationCode, consentGiven, providerId
        ]);

        // Send invitation email (would integrate with email service)
        await sendPartnerInvitation(partnerEmail, invitationCode, partnerFirstName);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'SUPPORT_PARTNER_REGISTERED',
            resourceType: 'support_partner',
            resourceId: result.rows[0].id,
            details: {
                patientId,
                relationshipType,
                accessLevel,
                invitationCode,
                registeredAt: result.rows[0].created_at
            },
            phiAccessed: true
        });

        res.status(201).json({
            success: true,
            partner: {
                id: result.rows[0].id,
                patientId,
                relationshipType,
                accessLevel,
                invitationCode,
                consentGiven,
                createdAt: result.rows[0].created_at
            }
        });

    } catch (error) {
        logger.error('Partner registration failed:', error);
        res.status(500).json({
            error: 'Failed to register partner',
            message: 'Please try again later'
        });
    }
});

/**
 * Get educational resources for partners
 * GET /api/supportpartner/education
 */
router.get('/education', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { 
            category = 'all',
            stage = 'all',
            format = 'all'
        } = req.query;

        // Get educational resources
        const resources = await getEducationalResources(category, stage, format);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'PARTNER_EDUCATION_ACCESSED',
            resourceType: 'education',
            details: {
                category,
                stage,
                format,
                resourceCount: resources.length,
                accessedAt: new Date().toISOString()
            },
            phiAccessed: false
        });

        res.json({
            resources,
            filters: {
                category,
                stage,
                format
            },
            totalResources: resources.length
        });

    } catch (error) {
        logger.error('Educational resources retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve educational resources',
            message: 'Please try again later'
        });
    }
});

/**
 * Share care plan with partner
 * POST /api/supportpartner/care-plans/share
 */
router.post('/care-plans/share', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const {
            patientId,
            partnerId,
            carePlanData,
            shareLevel = 'summary',
            expiresInDays = 30
        } = req.body;

        // Verify partner access
        const partnerCheck = await database.query(`
            SELECT sp.id, sp.access_level, sp.consent_given
            FROM support_partners sp
            JOIN patients p ON sp.patient_id = p.id
            WHERE sp.id = $1 AND p.provider_id = $2 AND sp.patient_id = $3
        `, [partnerId, providerId, patientId]);

        if (partnerCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Partner not found or access denied'
            });
        }

        const partner = partnerCheck.rows[0];

        if (!partner.consent_given) {
            return res.status(403).json({
                error: 'Partner consent not given'
            });
        }

        // Filter care plan data based on share level
        const filteredCarePlan = filterCarePlanForPartner(carePlanData, shareLevel, partner.access_level);

        // Encrypt care plan for sharing
        const encryptedCarePlan = await encryptionService.encryptForMenoWellness(
            filteredCarePlan,
            patientId,
            'basic' // Use basic sharing level for partners
        );

        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        // Create shared care plan record
        const result = await database.query(`
            INSERT INTO shared_care_plans (
                patient_id, provider_id, partner_id,
                care_plan_data_encrypted, share_level,
                expires_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
        `, [
            patientId, providerId, partnerId,
            JSON.stringify(encryptedCarePlan),
            shareLevel, expiresAt, providerId
        ]);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'CARE_PLAN_SHARED_WITH_PARTNER',
            resourceType: 'care_plan',
            resourceId: result.rows[0].id,
            details: {
                patientId,
                partnerId,
                shareLevel,
                expiresAt,
                sharedAt: result.rows[0].created_at
            },
            phiAccessed: true
        });

        res.json({
            success: true,
            sharedCarePlan: {
                id: result.rows[0].id,
                patientId,
                partnerId,
                shareLevel,
                expiresAt,
                sharedAt: result.rows[0].created_at
            }
        });

    } catch (error) {
        logger.error('Care plan sharing failed:', error);
        res.status(500).json({
            error: 'Failed to share care plan',
            message: 'Please try again later'
        });
    }
});

/**
 * Get partner communication tips
 * GET /api/supportpartner/communication-tips
 */
router.get('/communication-tips', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { 
            situation = 'general',
            symptom,
            stage = 'perimenopause'
        } = req.query;

        // Get communication tips
        const tips = await getCommunicationTips(situation, symptom, stage);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'COMMUNICATION_TIPS_ACCESSED',
            resourceType: 'communication_tips',
            details: {
                situation,
                symptom,
                stage,
                tipsCount: tips.length,
                accessedAt: new Date().toISOString()
            },
            phiAccessed: false
        });

        res.json({
            tips,
            context: {
                situation,
                symptom,
                stage
            }
        });

    } catch (error) {
        logger.error('Communication tips retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve communication tips',
            message: 'Please try again later'
        });
    }
});

/**
 * Track partner engagement
 * POST /api/supportpartner/engagement/track
 */
router.post('/engagement/track', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const {
            partnerId,
            activityType,
            resourceId,
            duration,
            completionStatus = 'completed'
        } = req.body;

        // Verify partner access
        const partnerCheck = await database.query(`
            SELECT sp.id, sp.patient_id
            FROM support_partners sp
            JOIN patients p ON sp.patient_id = p.id
            WHERE sp.id = $1 AND p.provider_id = $2
        `, [partnerId, providerId]);

        if (partnerCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Partner not found or access denied'
            });
        }

        // Track engagement
        const result = await database.query(`
            INSERT INTO partner_engagement (
                partner_id, patient_id, provider_id,
                activity_type, resource_id, duration_minutes,
                completion_status, tracked_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING id, tracked_at
        `, [
            partnerId, partnerCheck.rows[0].patient_id, providerId,
            activityType, resourceId, duration, completionStatus
        ]);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'PARTNER_ENGAGEMENT_TRACKED',
            resourceType: 'partner_engagement',
            resourceId: result.rows[0].id,
            details: {
                partnerId,
                activityType,
                duration,
                completionStatus,
                trackedAt: result.rows[0].tracked_at
            },
            phiAccessed: false
        });

        res.json({
            success: true,
            engagement: {
                id: result.rows[0].id,
                partnerId,
                activityType,
                duration,
                completionStatus,
                trackedAt: result.rows[0].tracked_at
            }
        });

    } catch (error) {
        logger.error('Partner engagement tracking failed:', error);
        res.status(500).json({
            error: 'Failed to track partner engagement',
            message: 'Please try again later'
        });
    }
});

/**
 * Utility functions
 */
async function sendPartnerInvitation(email, invitationCode, firstName) {
    // Mock email sending (would integrate with email service like SendGrid)
    logger.info(`Partner invitation sent to ${email} with code ${invitationCode}`);
    
    // In production, this would send an actual email with:
    // - Invitation code
    // - Link to SupportPartner app
    // - Instructions for registration
    // - Privacy and consent information
}

async function getEducationalResources(category, stage, format) {
    // Mock educational resources (would come from content management system)
    const allResources = [
        {
            id: 'edu_001',
            title: 'Understanding Menopause: A Partner\'s Guide',
            category: 'basics',
            stage: 'all',
            format: 'article',
            duration: 10,
            description: 'Comprehensive overview of menopause for supportive partners',
            url: '/education/understanding-menopause'
        },
        {
            id: 'edu_002',
            title: 'Supporting Your Partner Through Hot Flashes',
            category: 'symptoms',
            stage: 'perimenopause',
            format: 'video',
            duration: 8,
            description: 'Practical tips for helping during hot flash episodes',
            url: '/education/hot-flash-support'
        },
        {
            id: 'edu_003',
            title: 'Communication During Mood Changes',
            category: 'communication',
            stage: 'all',
            format: 'interactive',
            duration: 15,
            description: 'Interactive guide for effective communication strategies',
            url: '/education/mood-communication'
        },
        {
            id: 'edu_004',
            title: 'Hormone Therapy: What Partners Should Know',
            category: 'treatment',
            stage: 'all',
            format: 'article',
            duration: 12,
            description: 'Understanding hormone therapy options and side effects',
            url: '/education/hormone-therapy-guide'
        }
    ];

    // Filter resources based on criteria
    return allResources.filter(resource => {
        if (category !== 'all' && resource.category !== category) return false;
        if (stage !== 'all' && resource.stage !== 'all' && resource.stage !== stage) return false;
        if (format !== 'all' && resource.format !== format) return false;
        return true;
    });
}

function filterCarePlanForPartner(carePlanData, shareLevel, partnerAccessLevel) {
    // Filter care plan data based on sharing permissions
    const baseData = {
        generalGuidelines: carePlanData.generalGuidelines,
        lifestyleRecommendations: carePlanData.lifestyleRecommendations,
        supportStrategies: carePlanData.supportStrategies
    };

    if (shareLevel === 'detailed' && partnerAccessLevel === 'full') {
        return {
            ...baseData,
            treatmentPlan: carePlanData.treatmentPlan,
            medications: carePlanData.medications?.map(med => ({
                name: med.name,
                purpose: med.purpose,
                // Remove dosage and specific details
            })),
            followUpSchedule: carePlanData.followUpSchedule
        };
    }

    return baseData;
}

async function getCommunicationTips(situation, symptom, stage) {
    // Mock communication tips (would come from expert content)
    const tips = [
        {
            id: 'tip_001',
            situation: 'general',
            title: 'Listen Without Trying to Fix',
            description: 'Sometimes your partner just needs to be heard and validated.',
            actionItems: [
                'Use active listening techniques',
                'Avoid immediately offering solutions',
                'Validate their feelings and experiences'
            ]
        },
        {
            id: 'tip_002',
            situation: 'hot_flash',
            title: 'Supporting During Hot Flashes',
            description: 'Practical ways to help during hot flash episodes.',
            actionItems: [
                'Keep the environment cool',
                'Offer cold water or ice packs',
                'Be patient and understanding',
                'Don\'t take mood changes personally'
            ]
        },
        {
            id: 'tip_003',
            situation: 'mood_changes',
            title: 'Navigating Mood Fluctuations',
            description: 'Understanding and responding to hormonal mood changes.',
            actionItems: [
                'Recognize that mood changes are temporary',
                'Maintain consistent emotional support',
                'Encourage professional help when needed',
                'Practice self-care to avoid burnout'
            ]
        }
    ];

    // Filter tips based on situation and symptom
    return tips.filter(tip => {
        if (situation !== 'general' && tip.situation !== situation) return false;
        return true;
    });
}

module.exports = router;
