const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const db = require('../utils/database');
const logger = require('../utils/logger');
const { requireProviderAuth } = require('../middleware/auth');

const router = express.Router();

// Apply provider authentication to all routes
router.use(requireProviderAuth);

// Get communications for a patient
router.get('/patient/:patientId', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(['message', 'call', 'email', 'appointment', 'note']).withMessage('Invalid communication type'),
  query('direction').optional().isIn(['inbound', 'outbound']).withMessage('Invalid direction')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { patientId } = req.params;
    const { page = 1, limit = 20, type, direction } = req.query;
    const providerId = req.provider.id;
    const offset = (page - 1) * limit;

    // Verify provider has access to this patient
    const accessCheck = await db.query(
      'SELECT id FROM provider_patients WHERE provider_id = $1 AND patient_id = $2 AND is_active = true',
      [providerId, patientId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this patient'
      });
    }

    let query = `
      SELECT pc.*, u.first_name, u.last_name
      FROM patient_communications pc
      JOIN users u ON pc.patient_id = u.id
      WHERE pc.patient_id = $1 AND pc.provider_id = $2
    `;

    const params = [patientId, providerId];
    let paramIndex = 3;

    if (type) {
      query += ` AND pc.communication_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (direction) {
      query += ` AND pc.direction = $${paramIndex}`;
      params.push(direction);
      paramIndex++;
    }

    query += ` ORDER BY pc.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    // Mark unread communications as read
    await db.query(`
      UPDATE patient_communications 
      SET is_read = true, read_at = NOW()
      WHERE patient_id = $1 AND provider_id = $2 AND is_read = false AND direction = 'inbound'
    `, [patientId, providerId]);

    res.json({
      communications: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: result.rows.length === parseInt(limit)
      }
    });

  } catch (error) {
    logger.error('Get patient communications error:', error);
    res.status(500).json({
      error: 'Failed to retrieve communications',
      message: 'An error occurred while fetching communications'
    });
  }
});

// Send communication to patient
router.post('/send', [
  body('patientId').isUUID().withMessage('Valid patient ID required'),
  body('type').isIn(['message', 'call', 'email', 'appointment', 'note']).withMessage('Invalid communication type'),
  body('subject').optional().isLength({ min: 1, max: 255 }).withMessage('Subject must be 1-255 characters'),
  body('content').isLength({ min: 1 }).withMessage('Content is required'),
  body('isUrgent').optional().isBoolean(),
  body('scheduledFor').optional().isISO8601().withMessage('Invalid scheduled date'),
  body('metadata').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      patientId,
      type,
      subject,
      content,
      isUrgent = false,
      scheduledFor,
      metadata = {}
    } = req.body;

    const providerId = req.provider.id;

    // Verify provider has access to this patient
    const accessCheck = await db.query(
      'SELECT id FROM provider_patients WHERE provider_id = $1 AND patient_id = $2 AND is_active = true',
      [providerId, patientId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this patient'
      });
    }

    // Create communication record
    const communicationResult = await db.query(`
      INSERT INTO patient_communications (
        patient_id, provider_id, communication_type, direction, subject, 
        content, metadata, is_urgent, scheduled_for
      ) VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      patientId,
      providerId,
      type,
      subject,
      content,
      JSON.stringify(metadata),
      isUrgent,
      scheduledFor ? new Date(scheduledFor) : null
    ]);

    const communication = communicationResult.rows[0];

    // TODO: Integrate with actual communication services (email, SMS, etc.)
    // For now, we'll just log the communication
    logger.info(`Communication sent: ${type} from provider ${providerId} to patient ${patientId}`);

    res.status(201).json({
      message: 'Communication sent successfully',
      communication: {
        id: communication.id,
        type: communication.communication_type,
        subject: communication.subject,
        content: communication.content,
        isUrgent: communication.is_urgent,
        scheduledFor: communication.scheduled_for,
        createdAt: communication.created_at
      }
    });

  } catch (error) {
    logger.error('Send communication error:', error);
    res.status(500).json({
      error: 'Failed to send communication',
      message: 'An error occurred while sending the communication'
    });
  }
});

// Get communication statistics
router.get('/stats', async (req, res) => {
  try {
    const providerId = req.provider.id;

    // Get communication statistics
    const statsResult = await db.query(`
      SELECT 
        communication_type,
        direction,
        COUNT(*) as count,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as last_7_days,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as last_30_days
      FROM patient_communications
      WHERE provider_id = $1
      GROUP BY communication_type, direction
      ORDER BY communication_type, direction
    `, [providerId]);

    // Get unread count
    const unreadResult = await db.query(`
      SELECT COUNT(*) as unread_count
      FROM patient_communications
      WHERE provider_id = $1 AND direction = 'inbound' AND is_read = false
    `, [providerId]);

    // Get recent activity
    const recentResult = await db.query(`
      SELECT 
        pc.*,
        u.first_name,
        u.last_name
      FROM patient_communications pc
      JOIN users u ON pc.patient_id = u.id
      WHERE pc.provider_id = $1
      ORDER BY pc.created_at DESC
      LIMIT 10
    `, [providerId]);

    res.json({
      statistics: statsResult.rows,
      unreadCount: parseInt(unreadResult.rows[0].unread_count),
      recentActivity: recentResult.rows
    });

  } catch (error) {
    logger.error('Get communication stats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve communication statistics',
      message: 'An error occurred while fetching statistics'
    });
  }
});

// Mark communication as read
router.patch('/:communicationId/read', async (req, res) => {
  try {
    const { communicationId } = req.params;
    const providerId = req.provider.id;

    const result = await db.query(`
      UPDATE patient_communications 
      SET is_read = true, read_at = NOW()
      WHERE id = $1 AND provider_id = $2
      RETURNING *
    `, [communicationId, providerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Communication not found'
      });
    }

    res.json({
      message: 'Communication marked as read',
      communication: result.rows[0]
    });

  } catch (error) {
    logger.error('Mark communication read error:', error);
    res.status(500).json({
      error: 'Failed to mark communication as read',
      message: 'An error occurred while updating the communication'
    });
  }
});

// Schedule communication
router.post('/schedule', [
  body('patientId').isUUID().withMessage('Valid patient ID required'),
  body('type').isIn(['call', 'appointment', 'follow_up']).withMessage('Invalid communication type'),
  body('scheduledFor').isISO8601().withMessage('Valid scheduled date required'),
  body('subject').isLength({ min: 1, max: 255 }).withMessage('Subject is required'),
  body('content').optional().isString(),
  body('duration').optional().isInt({ min: 1 }).withMessage('Duration must be positive integer'),
  body('metadata').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      patientId,
      type,
      scheduledFor,
      subject,
      content,
      duration,
      metadata = {}
    } = req.body;

    const providerId = req.provider.id;

    // Verify provider has access to this patient
    const accessCheck = await db.query(
      'SELECT id FROM provider_patients WHERE provider_id = $1 AND patient_id = $2 AND is_active = true',
      [providerId, patientId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this patient'
      });
    }

    // Create scheduled communication
    const scheduledMetadata = {
      ...metadata,
      duration: duration || 30,
      status: 'scheduled'
    };

    const communicationResult = await db.query(`
      INSERT INTO patient_communications (
        patient_id, provider_id, communication_type, direction, subject, 
        content, metadata, scheduled_for
      ) VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7)
      RETURNING *
    `, [
      patientId,
      providerId,
      type,
      subject,
      content,
      JSON.stringify(scheduledMetadata),
      new Date(scheduledFor)
    ]);

    logger.info(`Communication scheduled: ${type} for ${scheduledFor} with patient ${patientId}`);

    res.status(201).json({
      message: 'Communication scheduled successfully',
      communication: communicationResult.rows[0]
    });

  } catch (error) {
    logger.error('Schedule communication error:', error);
    res.status(500).json({
      error: 'Failed to schedule communication',
      message: 'An error occurred while scheduling the communication'
    });
  }
});

module.exports = router;
