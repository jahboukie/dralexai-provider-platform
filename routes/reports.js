const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const db = require('../utils/database');
const logger = require('../services/logger');
const { requireProviderAuth, checkSubscriptionLimits } = require('../middleware/auth');
const { generatePatientReport, generatePopulationReport } = require('../services/reportGenerator');

const router = express.Router();

// Apply provider authentication to all routes
router.use(requireProviderAuth);

// Get reports list
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(['patient_summary', 'progress_report', 'outcome_analysis', 'population_health']).withMessage('Invalid report type'),
  query('status').optional().isIn(['generating', 'completed', 'failed']).withMessage('Invalid status')
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
      page = 1,
      limit = 20,
      type,
      status
    } = req.query;

    const offset = (page - 1) * limit;
    const providerId = req.provider.id;

    let query = `
      SELECT 
        cr.*,
        pp.practice_name,
        COUNT(CASE WHEN cr.patient_ids IS NOT NULL THEN array_length(cr.patient_ids, 1) END) as patient_count
      FROM clinical_reports cr
      LEFT JOIN provider_practices pp ON cr.practice_id = pp.id
      WHERE cr.provider_id = $1
    `;

    const params = [providerId];
    let paramIndex = 2;

    if (type) {
      query += ` AND cr.report_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (status) {
      query += ` AND cr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += `
      GROUP BY cr.id, pp.practice_name
      ORDER BY cr.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM clinical_reports cr
      WHERE cr.provider_id = $1
    `;

    const countParams = [providerId];
    let countParamIndex = 2;

    if (type) {
      countQuery += ` AND cr.report_type = $${countParamIndex}`;
      countParams.push(type);
      countParamIndex++;
    }

    if (status) {
      countQuery += ` AND cr.status = $${countParamIndex}`;
      countParams.push(status);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    const reports = result.rows.map(row => ({
      id: row.id,
      type: row.report_type,
      title: row.title,
      description: row.description,
      status: row.status,
      patientCount: parseInt(row.patient_count) || 0,
      fileSize: row.file_size,
      downloadCount: row.download_count,
      createdAt: row.created_at,
      generatedAt: row.generated_at,
      expiresAt: row.expires_at,
      practiceName: row.practice_name
    }));

    res.json({
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get reports error:', error);
    res.status(500).json({
      error: 'Failed to retrieve reports',
      message: 'An error occurred while fetching reports'
    });
  }
});

// Generate new report
router.post('/generate', [
  checkSubscriptionLimits('reports'),
  body('type').isIn(['patient_summary', 'progress_report', 'outcome_analysis', 'population_health']).withMessage('Invalid report type'),
  body('title').isLength({ min: 1, max: 255 }).withMessage('Title is required'),
  body('description').optional().isString(),
  body('patientIds').optional().isArray().withMessage('Patient IDs must be an array'),
  body('dateRange').optional().isObject(),
  body('parameters').optional().isObject()
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
      type,
      title,
      description,
      patientIds = [],
      dateRange = {},
      parameters = {}
    } = req.body;

    const providerId = req.provider.id;

    // Get practice ID
    const practiceResult = await db.query(`
      SELECT pp.id as practice_id
      FROM provider_practice_memberships ppm
      JOIN provider_practices pp ON ppm.practice_id = pp.id
      WHERE ppm.provider_id = $1 AND ppm.is_active = true
      ORDER BY ppm.joined_at DESC
      LIMIT 1
    `, [providerId]);

    const practiceId = practiceResult.rows[0]?.practice_id;

    // Validate patient access if specific patients requested
    if (patientIds.length > 0) {
      const accessCheck = await db.query(`
        SELECT patient_id
        FROM provider_patients
        WHERE provider_id = $1 AND patient_id = ANY($2) AND is_active = true
      `, [providerId, patientIds]);

      const accessiblePatients = accessCheck.rows.map(row => row.patient_id);
      const inaccessiblePatients = patientIds.filter(id => !accessiblePatients.includes(id));

      if (inaccessiblePatients.length > 0) {
        return res.status(403).json({
          error: 'Access denied',
          message: `You do not have access to some of the requested patients`,
          inaccessiblePatients
        });
      }
    }

    // Create report record
    const reportResult = await db.query(`
      INSERT INTO clinical_reports (
        provider_id, practice_id, report_type, title, description,
        parameters, patient_ids, date_range, status, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'generating', NOW() + INTERVAL '30 days')
      RETURNING *
    `, [
      providerId,
      practiceId,
      type,
      title,
      description,
      JSON.stringify(parameters),
      patientIds,
      JSON.stringify(dateRange)
    ]);

    const report = reportResult.rows[0];

    // Start report generation asynchronously
    generateReportAsync(report.id, type, {
      providerId,
      practiceId,
      patientIds,
      dateRange,
      parameters
    }).catch(error => {
      logger.error('Report generation failed:', error);
      // Update report status to failed
      db.query(
        'UPDATE clinical_reports SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', report.id]
      );
    });

    logger.info(`Report generation started: ${report.id} (${type}) by provider ${providerId}`);

    res.status(202).json({
      message: 'Report generation started',
      report: {
        id: report.id,
        type: report.report_type,
        title: report.title,
        status: report.status,
        createdAt: report.created_at,
        estimatedCompletionTime: '5-15 minutes'
      }
    });

  } catch (error) {
    logger.error('Generate report error:', error);
    res.status(500).json({
      error: 'Failed to generate report',
      message: 'An error occurred while starting report generation'
    });
  }
});

// Get specific report details
router.get('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const providerId = req.provider.id;

    const reportResult = await db.query(`
      SELECT 
        cr.*,
        pp.practice_name
      FROM clinical_reports cr
      LEFT JOIN provider_practices pp ON cr.practice_id = pp.id
      WHERE cr.id = $1 AND cr.provider_id = $2
    `, [reportId, providerId]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Report not found'
      });
    }

    const report = reportResult.rows[0];

    res.json({
      report: {
        id: report.id,
        type: report.report_type,
        title: report.title,
        description: report.description,
        status: report.status,
        parameters: report.parameters,
        patientIds: report.patient_ids,
        dateRange: report.date_range,
        reportData: report.report_data,
        filePath: report.file_path,
        fileSize: report.file_size,
        downloadCount: report.download_count,
        createdAt: report.created_at,
        generatedAt: report.generated_at,
        expiresAt: report.expires_at,
        practiceName: report.practice_name
      }
    });

  } catch (error) {
    logger.error('Get report details error:', error);
    res.status(500).json({
      error: 'Failed to retrieve report details',
      message: 'An error occurred while fetching report information'
    });
  }
});

// Download report
router.get('/:reportId/download', async (req, res) => {
  try {
    const { reportId } = req.params;
    const providerId = req.provider.id;

    const reportResult = await db.query(`
      SELECT *
      FROM clinical_reports
      WHERE id = $1 AND provider_id = $2 AND status = 'completed'
    `, [reportId, providerId]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Report not found or not ready for download'
      });
    }

    const report = reportResult.rows[0];

    // Check if report has expired
    if (report.expires_at && new Date() > report.expires_at) {
      return res.status(410).json({
        error: 'Report has expired',
        message: 'This report is no longer available for download'
      });
    }

    // Increment download count
    await db.query(
      'UPDATE clinical_reports SET download_count = download_count + 1 WHERE id = $1',
      [reportId]
    );

    // TODO: Implement actual file download
    // For now, return the report data as JSON
    res.json({
      reportId: report.id,
      title: report.title,
      generatedAt: report.generated_at,
      data: report.report_data,
      downloadCount: report.download_count + 1
    });

  } catch (error) {
    logger.error('Download report error:', error);
    res.status(500).json({
      error: 'Failed to download report',
      message: 'An error occurred while downloading the report'
    });
  }
});

// Delete report
router.delete('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const providerId = req.provider.id;

    const result = await db.query(`
      DELETE FROM clinical_reports
      WHERE id = $1 AND provider_id = $2
      RETURNING id, title
    `, [reportId, providerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Report not found'
      });
    }

    logger.info(`Report deleted: ${reportId} by provider ${providerId}`);

    res.json({
      message: 'Report deleted successfully',
      reportId: result.rows[0].id,
      title: result.rows[0].title
    });

  } catch (error) {
    logger.error('Delete report error:', error);
    res.status(500).json({
      error: 'Failed to delete report',
      message: 'An error occurred while deleting the report'
    });
  }
});

// Async report generation function
async function generateReportAsync(reportId, type, options) {
  try {
    let reportData;

    switch (type) {
      case 'patient_summary':
      case 'progress_report':
        reportData = await generatePatientReport(type, options);
        break;
      case 'outcome_analysis':
      case 'population_health':
        reportData = await generatePopulationReport(type, options);
        break;
      default:
        throw new Error(`Unsupported report type: ${type}`);
    }

    // Update report with generated data
    await db.query(`
      UPDATE clinical_reports 
      SET status = 'completed', report_data = $1, generated_at = NOW(), file_size = $2
      WHERE id = $3
    `, [
      JSON.stringify(reportData),
      JSON.stringify(reportData).length,
      reportId
    ]);

    logger.info(`Report generation completed: ${reportId}`);

  } catch (error) {
    logger.error(`Report generation failed for ${reportId}:`, error);
    
    await db.query(`
      UPDATE clinical_reports 
      SET status = 'failed', updated_at = NOW()
      WHERE id = $1
    `, [reportId]);
  }
}

module.exports = router;
