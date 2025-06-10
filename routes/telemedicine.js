/**
 * Telemedicine Platform
 * HIPAA-compliant video consultations with encrypted communications
 * Real-time patient-provider interactions with clinical documentation
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

// Apply authentication to all telemedicine routes
router.use(authenticateProvider);

/**
 * Create telemedicine session
 * POST /api/telemedicine/sessions
 */
router.post('/sessions', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const {
            patientId,
            appointmentId,
            sessionType = 'consultation',
            scheduledDuration = 30,
            notes
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

        // Generate secure session credentials
        const sessionId = crypto.randomUUID();
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const roomId = `room_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

        // Encrypt session notes if provided
        let encryptedNotes = null;
        if (notes) {
            encryptedNotes = await encryptionService.encryptPHI(notes, patientId, 'telemedicine_session');
        }

        // Create telemedicine session
        const result = await database.query(`
            INSERT INTO telemedicine_sessions (
                id, patient_id, provider_id, appointment_id,
                session_token, room_id, session_type,
                scheduled_duration_minutes, status,
                notes_encrypted, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, created_at, expires_at
        `, [
            sessionId, patientId, providerId, appointmentId,
            sessionToken, roomId, sessionType,
            scheduledDuration, 'scheduled',
            encryptedNotes ? JSON.stringify(encryptedNotes) : null,
            providerId
        ]);

        // Update appointment status if linked
        if (appointmentId) {
            await database.query(
                'UPDATE appointments SET status = $1, is_telemedicine = true WHERE id = $2',
                ['in_progress', appointmentId]
            );
        }

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'TELEMEDICINE_SESSION_CREATED',
            resourceType: 'telemedicine_session',
            resourceId: sessionId,
            details: {
                patientId,
                sessionType,
                roomId,
                scheduledDuration,
                createdAt: result.rows[0].created_at
            },
            phiAccessed: true
        });

        res.status(201).json({
            success: true,
            session: {
                id: sessionId,
                roomId,
                sessionToken,
                patientId,
                sessionType,
                scheduledDuration,
                status: 'scheduled',
                createdAt: result.rows[0].created_at,
                expiresAt: result.rows[0].expires_at,
                joinUrl: `${process.env.TELEMEDICINE_BASE_URL}/join/${roomId}?token=${sessionToken}`
            }
        });

    } catch (error) {
        logger.error('Telemedicine session creation failed:', error);
        res.status(500).json({
            error: 'Failed to create telemedicine session',
            message: 'Please try again later'
        });
    }
});

/**
 * Join telemedicine session
 * POST /api/telemedicine/sessions/:sessionId/join
 */
router.post('/sessions/:sessionId/join', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { sessionToken } = req.body;
        const providerId = req.user.providerId;

        // Verify session and token
        const sessionResult = await database.query(`
            SELECT 
                ts.*, p.first_name_encrypted, p.last_name_encrypted,
                pr.first_name as provider_first_name, pr.last_name as provider_last_name
            FROM telemedicine_sessions ts
            JOIN patients p ON ts.patient_id = p.id
            JOIN providers pr ON ts.provider_id = pr.id
            WHERE ts.id = $1 AND ts.session_token = $2 AND ts.provider_id = $3
        `, [sessionId, sessionToken, providerId]);

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Session not found or invalid token'
            });
        }

        const session = sessionResult.rows[0];

        // Check if session is still valid
        if (new Date() > session.expires_at) {
            return res.status(410).json({
                error: 'Session has expired'
            });
        }

        // Update session status to active
        await database.query(
            'UPDATE telemedicine_sessions SET status = $1, started_at = NOW() WHERE id = $2',
            ['active', sessionId]
        );

        // Decrypt patient name for session
        const firstName = await encryptionService.decryptPHI(
            JSON.parse(session.first_name_encrypted),
            session.patient_id,
            'telemedicine_join'
        );
        const lastName = await encryptionService.decryptPHI(
            JSON.parse(session.last_name_encrypted),
            session.patient_id,
            'telemedicine_join'
        );

        // Generate WebRTC configuration
        const webrtcConfig = await generateWebRTCConfig(session.room_id);

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'TELEMEDICINE_SESSION_JOINED',
            resourceType: 'telemedicine_session',
            resourceId: sessionId,
            details: {
                patientId: session.patient_id,
                roomId: session.room_id,
                joinedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json({
            success: true,
            session: {
                id: sessionId,
                roomId: session.room_id,
                patient: {
                    id: session.patient_id,
                    firstName,
                    lastName,
                    fullName: `${firstName} ${lastName}`
                },
                provider: {
                    firstName: session.provider_first_name,
                    lastName: session.provider_last_name
                },
                sessionType: session.session_type,
                status: 'active',
                startedAt: new Date().toISOString(),
                webrtcConfig
            }
        });

    } catch (error) {
        logger.error('Telemedicine session join failed:', error);
        res.status(500).json({
            error: 'Failed to join telemedicine session',
            message: 'Please try again later'
        });
    }
});

/**
 * End telemedicine session
 * POST /api/telemedicine/sessions/:sessionId/end
 */
router.post('/sessions/:sessionId/end', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const providerId = req.user.providerId;
        const { sessionNotes, duration, followUpRequired = false } = req.body;

        // Verify session ownership
        const sessionResult = await database.query(
            'SELECT patient_id, started_at FROM telemedicine_sessions WHERE id = $1 AND provider_id = $2',
            [sessionId, providerId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Session not found or access denied'
            });
        }

        const session = sessionResult.rows[0];

        // Calculate actual duration
        const actualDuration = duration || (session.started_at ? 
            Math.round((new Date() - new Date(session.started_at)) / 60000) : 0);

        // Encrypt session notes
        let encryptedSessionNotes = null;
        if (sessionNotes) {
            encryptedSessionNotes = await encryptionService.encryptPHI(
                sessionNotes, 
                session.patient_id, 
                'telemedicine_notes'
            );
        }

        // End session
        await database.query(`
            UPDATE telemedicine_sessions 
            SET status = $1, ended_at = NOW(), actual_duration_minutes = $2,
                session_notes_encrypted = $3, follow_up_required = $4
            WHERE id = $5
        `, [
            'completed', 
            actualDuration, 
            encryptedSessionNotes ? JSON.stringify(encryptedSessionNotes) : null,
            followUpRequired,
            sessionId
        ]);

        // Create automatic SOAP note if session notes provided
        if (sessionNotes) {
            await createTelemedicineSOAPNote(session.patient_id, providerId, sessionNotes, sessionId);
        }

        // Audit log
        await auditLogger.log({
            userId: providerId,
            action: 'TELEMEDICINE_SESSION_ENDED',
            resourceType: 'telemedicine_session',
            resourceId: sessionId,
            details: {
                patientId: session.patient_id,
                actualDuration,
                followUpRequired,
                endedAt: new Date().toISOString()
            },
            phiAccessed: true
        });

        res.json({
            success: true,
            session: {
                id: sessionId,
                status: 'completed',
                actualDuration,
                followUpRequired,
                endedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Telemedicine session end failed:', error);
        res.status(500).json({
            error: 'Failed to end telemedicine session',
            message: 'Please try again later'
        });
    }
});

/**
 * Get telemedicine session history
 * GET /api/telemedicine/sessions
 */
router.get('/sessions', async (req, res) => {
    try {
        const providerId = req.user.providerId;
        const { 
            patientId, 
            status, 
            page = 1, 
            limit = 20,
            startDate,
            endDate 
        } = req.query;

        const offset = (page - 1) * limit;
        let query = `
            SELECT 
                ts.id, ts.session_type, ts.status, ts.scheduled_duration_minutes,
                ts.actual_duration_minutes, ts.created_at, ts.started_at, ts.ended_at,
                ts.follow_up_required, p.first_name_encrypted, p.last_name_encrypted,
                p.medical_record_number
            FROM telemedicine_sessions ts
            JOIN patients p ON ts.patient_id = p.id
            WHERE ts.provider_id = $1
        `;

        const params = [providerId];
        let paramCount = 1;

        if (patientId) {
            query += ` AND ts.patient_id = $${++paramCount}`;
            params.push(patientId);
        }

        if (status) {
            query += ` AND ts.status = $${++paramCount}`;
            params.push(status);
        }

        if (startDate) {
            query += ` AND ts.created_at >= $${++paramCount}`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND ts.created_at <= $${++paramCount}`;
            params.push(endDate);
        }

        query += ` ORDER BY ts.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);

        const result = await database.query(query, params);

        // Decrypt patient names
        const sessions = await Promise.all(result.rows.map(async (session) => {
            try {
                const firstName = await encryptionService.decryptPHI(
                    JSON.parse(session.first_name_encrypted),
                    session.patient_id,
                    'session_history'
                );
                const lastName = await encryptionService.decryptPHI(
                    JSON.parse(session.last_name_encrypted),
                    session.patient_id,
                    'session_history'
                );

                return {
                    id: session.id,
                    sessionType: session.session_type,
                    status: session.status,
                    scheduledDuration: session.scheduled_duration_minutes,
                    actualDuration: session.actual_duration_minutes,
                    followUpRequired: session.follow_up_required,
                    patient: {
                        firstName,
                        lastName,
                        fullName: `${firstName} ${lastName}`,
                        medicalRecordNumber: session.medical_record_number
                    },
                    createdAt: session.created_at,
                    startedAt: session.started_at,
                    endedAt: session.ended_at
                };
            } catch (error) {
                logger.error(`Failed to decrypt session ${session.id}:`, error);
                return {
                    id: session.id,
                    error: 'Decryption failed'
                };
            }
        }));

        // Get total count
        const countResult = await database.query(
            'SELECT COUNT(*) FROM telemedicine_sessions WHERE provider_id = $1',
            [providerId]
        );

        res.json({
            sessions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        });

    } catch (error) {
        logger.error('Telemedicine session history retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to retrieve session history',
            message: 'Please try again later'
        });
    }
});

/**
 * Utility functions
 */
async function generateWebRTCConfig(roomId) {
    // In production, this would integrate with a WebRTC service like Twilio Video, Agora, or Jitsi
    return {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ],
        roomId,
        // Additional WebRTC configuration would go here
        sdpSemantics: 'unified-plan'
    };
}

async function createTelemedicineSOAPNote(patientId, providerId, sessionNotes, sessionId) {
    try {
        // Create a SOAP note from telemedicine session
        const soapData = {
            subjective: `Telemedicine consultation conducted. ${sessionNotes}`,
            objective: 'Patient appeared via video consultation. Vital signs not assessed remotely.',
            assessment: 'Telemedicine consultation completed. Further assessment may be needed.',
            plan: 'Continue current treatment plan. Follow-up as needed.'
        };

        // Encrypt SOAP components
        const encryptedSubjective = await encryptionService.encryptPHI(soapData.subjective, patientId, 'soap_note');
        const encryptedObjective = await encryptionService.encryptPHI(soapData.objective, patientId, 'soap_note');
        const encryptedAssessment = await encryptionService.encryptPHI(soapData.assessment, patientId, 'soap_note');
        const encryptedPlan = await encryptionService.encryptPHI(soapData.plan, patientId, 'soap_note');
        const encryptedChiefComplaint = await encryptionService.encryptPHI('Telemedicine consultation', patientId, 'soap_note');

        // Insert SOAP note
        await database.query(`
            INSERT INTO soap_notes (
                patient_id, provider_id, chief_complaint_encrypted,
                subjective_encrypted, objective_encrypted, assessment_encrypted, plan_encrypted,
                telemedicine_session_id, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            patientId, providerId,
            JSON.stringify(encryptedChiefComplaint),
            JSON.stringify(encryptedSubjective),
            JSON.stringify(encryptedObjective),
            JSON.stringify(encryptedAssessment),
            JSON.stringify(encryptedPlan),
            sessionId,
            providerId
        ]);

    } catch (error) {
        logger.error('Failed to create telemedicine SOAP note:', error);
    }
}

module.exports = router;
