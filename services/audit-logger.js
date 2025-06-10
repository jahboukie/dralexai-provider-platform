/**
 * HIPAA-Compliant Audit Logging Service
 * Comprehensive audit trail for all PHI access and system actions
 * Tamper-proof logging with retention policies
 */

const database = require('./database');
const crypto = require('crypto');
const logger = require('./logger');

class HIPAAAuditLogger {
    constructor() {
        this.retentionYears = 6; // HIPAA requirement: minimum 6 years
        this.batchSize = 100;
        this.batchTimeout = 5000; // 5 seconds
        this.logQueue = [];
        this.processingBatch = false;
        
        // Start batch processing
        this.startBatchProcessor();
        
        // Audit log integrity
        this.integritySecret = process.env.AUDIT_INTEGRITY_SECRET || 'audit-integrity-key';
    }

    /**
     * Log audit event
     */
    async log(auditEvent) {
        try {
            const enrichedEvent = await this.enrichAuditEvent(auditEvent);
            
            // Add to queue for batch processing
            this.logQueue.push(enrichedEvent);
            
            // Process immediately if critical event
            if (this.isCriticalEvent(auditEvent.action)) {
                await this.processBatch();
            }
            
            return enrichedEvent.id;
            
        } catch (error) {
            logger.error('Audit logging failed:', error);
            // Critical: audit logging failure should not break the application
            // but should be logged to system logs
            throw error;
        }
    }

    /**
     * Enrich audit event with additional metadata
     */
    async enrichAuditEvent(event) {
        const timestamp = new Date();
        const auditId = crypto.randomUUID();
        
        const enrichedEvent = {
            id: auditId,
            timestamp,
            
            // Who (User information)
            userId: event.userId || null,
            userType: event.userType || 'provider',
            userIpAddress: event.userIpAddress || null,
            userAgent: event.userAgent || null,
            sessionId: event.sessionId || null,
            
            // What (Action information)
            action: event.action,
            resourceType: event.resourceType || null,
            resourceId: event.resourceId || null,
            
            // When & Where
            timestamp,
            
            // Details
            details: event.details || {},
            phiAccessed: event.phiAccessed || false,
            
            // Compliance
            retentionUntil: new Date(timestamp.getTime() + (this.retentionYears * 365 * 24 * 60 * 60 * 1000)),
            
            // Integrity
            checksum: null // Will be calculated before storage
        };
        
        // Calculate integrity checksum
        enrichedEvent.checksum = this.calculateChecksum(enrichedEvent);
        
        return enrichedEvent;
    }

    /**
     * Calculate tamper-proof checksum for audit record
     */
    calculateChecksum(auditEvent) {
        const data = {
            id: auditEvent.id,
            timestamp: auditEvent.timestamp.toISOString(),
            userId: auditEvent.userId,
            action: auditEvent.action,
            resourceType: auditEvent.resourceType,
            resourceId: auditEvent.resourceId,
            phiAccessed: auditEvent.phiAccessed
        };
        
        const dataString = JSON.stringify(data, Object.keys(data).sort());
        return crypto.createHmac('sha256', this.integritySecret)
                    .update(dataString)
                    .digest('hex');
    }

    /**
     * Verify audit record integrity
     */
    verifyIntegrity(auditRecord) {
        const expectedChecksum = this.calculateChecksum(auditRecord);
        return auditRecord.checksum === expectedChecksum;
    }

    /**
     * Start batch processor for efficient database writes
     */
    startBatchProcessor() {
        setInterval(async () => {
            if (this.logQueue.length > 0 && !this.processingBatch) {
                await this.processBatch();
            }
        }, this.batchTimeout);
    }

    /**
     * Process queued audit events in batch
     */
    async processBatch() {
        if (this.processingBatch || this.logQueue.length === 0) {
            return;
        }

        this.processingBatch = true;
        
        try {
            const batch = this.logQueue.splice(0, this.batchSize);
            await this.insertAuditBatch(batch);
            
        } catch (error) {
            logger.error('Audit batch processing failed:', error);
            // Re-queue failed events
            this.logQueue.unshift(...batch);
            
        } finally {
            this.processingBatch = false;
        }
    }

    /**
     * Insert batch of audit events to database
     */
    async insertAuditBatch(auditEvents) {
        if (auditEvents.length === 0) return;

        const client = await database.getClient();
        
        try {
            await client.query('BEGIN');
            
            const insertQuery = `
                INSERT INTO hipaa_audit_log (
                    id, user_id, user_type, user_ip_address, user_agent, session_id,
                    action, resource_type, resource_id, timestamp, details, 
                    phi_accessed, retention_until, checksum
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `;
            
            for (const event of auditEvents) {
                await client.query(insertQuery, [
                    event.id,
                    event.userId,
                    event.userType,
                    event.userIpAddress,
                    event.userAgent,
                    event.sessionId,
                    event.action,
                    event.resourceType,
                    event.resourceId,
                    event.timestamp,
                    JSON.stringify(event.details),
                    event.phiAccessed,
                    event.retentionUntil,
                    event.checksum
                ]);
            }
            
            await client.query('COMMIT');
            
            logger.info(`Audit batch processed: ${auditEvents.length} events`);
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
            
        } finally {
            client.release();
        }
    }

    /**
     * Check if event requires immediate processing
     */
    isCriticalEvent(action) {
        const criticalActions = [
            'LOGIN_FAILED',
            'ACCOUNT_LOCKED',
            'PHI_DECRYPTION_FAILED',
            'UNAUTHORIZED_ACCESS_ATTEMPT',
            'SECURITY_BREACH',
            'DATA_EXPORT',
            'ADMIN_ACTION'
        ];
        
        return criticalActions.includes(action);
    }

    /**
     * Query audit logs with filtering
     */
    async queryAuditLogs(filters = {}) {
        try {
            let query = 'SELECT * FROM hipaa_audit_log WHERE 1=1';
            const params = [];
            let paramCount = 0;

            // Add filters
            if (filters.userId) {
                query += ` AND user_id = $${++paramCount}`;
                params.push(filters.userId);
            }

            if (filters.resourceType) {
                query += ` AND resource_type = $${++paramCount}`;
                params.push(filters.resourceType);
            }

            if (filters.resourceId) {
                query += ` AND resource_id = $${++paramCount}`;
                params.push(filters.resourceId);
            }

            if (filters.action) {
                query += ` AND action = $${++paramCount}`;
                params.push(filters.action);
            }

            if (filters.phiAccessed !== undefined) {
                query += ` AND phi_accessed = $${++paramCount}`;
                params.push(filters.phiAccessed);
            }

            if (filters.startDate) {
                query += ` AND timestamp >= $${++paramCount}`;
                params.push(filters.startDate);
            }

            if (filters.endDate) {
                query += ` AND timestamp <= $${++paramCount}`;
                params.push(filters.endDate);
            }

            // Add ordering and pagination
            query += ' ORDER BY timestamp DESC';
            
            if (filters.limit) {
                query += ` LIMIT $${++paramCount}`;
                params.push(filters.limit);
            }

            if (filters.offset) {
                query += ` OFFSET $${++paramCount}`;
                params.push(filters.offset);
            }

            const result = await database.query(query, params);
            
            // Verify integrity of returned records
            const verifiedRecords = result.rows.map(record => ({
                ...record,
                integrityVerified: this.verifyIntegrity(record)
            }));

            return verifiedRecords;

        } catch (error) {
            logger.error('Audit log query failed:', error);
            throw error;
        }
    }

    /**
     * Generate audit report for compliance
     */
    async generateComplianceReport(startDate, endDate, options = {}) {
        try {
            const filters = {
                startDate,
                endDate,
                ...options
            };

            const auditLogs = await this.queryAuditLogs(filters);
            
            const report = {
                reportId: crypto.randomUUID(),
                generatedAt: new Date(),
                period: { startDate, endDate },
                summary: {
                    totalEvents: auditLogs.length,
                    phiAccessEvents: auditLogs.filter(log => log.phi_accessed).length,
                    failedLoginAttempts: auditLogs.filter(log => log.action === 'LOGIN_FAILED').length,
                    uniqueUsers: new Set(auditLogs.map(log => log.user_id)).size,
                    integrityIssues: auditLogs.filter(log => !log.integrityVerified).length
                },
                eventsByAction: this.groupEventsByAction(auditLogs),
                eventsByUser: this.groupEventsByUser(auditLogs),
                phiAccessSummary: this.generatePHIAccessSummary(auditLogs),
                securityEvents: auditLogs.filter(log => this.isSecurityEvent(log.action)),
                integrityReport: {
                    totalRecords: auditLogs.length,
                    verifiedRecords: auditLogs.filter(log => log.integrityVerified).length,
                    corruptedRecords: auditLogs.filter(log => !log.integrityVerified)
                }
            };

            // Log report generation
            await this.log({
                action: 'COMPLIANCE_REPORT_GENERATED',
                resourceType: 'audit_report',
                resourceId: report.reportId,
                details: {
                    period: { startDate, endDate },
                    eventCount: auditLogs.length,
                    generatedBy: options.generatedBy
                },
                phiAccessed: false
            });

            return report;

        } catch (error) {
            logger.error('Compliance report generation failed:', error);
            throw error;
        }
    }

    /**
     * Utility functions for report generation
     */
    groupEventsByAction(auditLogs) {
        return auditLogs.reduce((acc, log) => {
            acc[log.action] = (acc[log.action] || 0) + 1;
            return acc;
        }, {});
    }

    groupEventsByUser(auditLogs) {
        return auditLogs.reduce((acc, log) => {
            if (log.user_id) {
                acc[log.user_id] = (acc[log.user_id] || 0) + 1;
            }
            return acc;
        }, {});
    }

    generatePHIAccessSummary(auditLogs) {
        const phiLogs = auditLogs.filter(log => log.phi_accessed);
        
        return {
            totalAccess: phiLogs.length,
            byResourceType: this.groupBy(phiLogs, 'resource_type'),
            byAction: this.groupBy(phiLogs, 'action'),
            byUser: this.groupBy(phiLogs, 'user_id')
        };
    }

    groupBy(array, key) {
        return array.reduce((acc, item) => {
            const group = item[key] || 'unknown';
            acc[group] = (acc[group] || 0) + 1;
            return acc;
        }, {});
    }

    isSecurityEvent(action) {
        const securityActions = [
            'LOGIN_FAILED',
            'ACCOUNT_LOCKED',
            'UNAUTHORIZED_ACCESS_ATTEMPT',
            'PHI_DECRYPTION_FAILED',
            'RATE_LIMIT_EXCEEDED',
            'SECURITY_BREACH',
            'SUSPICIOUS_ACTIVITY'
        ];
        
        return securityActions.includes(action);
    }

    /**
     * Cleanup expired audit logs (retention policy)
     */
    async cleanupExpiredLogs() {
        try {
            const result = await database.query(
                'DELETE FROM hipaa_audit_log WHERE retention_until < NOW() RETURNING id'
            );
            
            logger.info(`Cleaned up ${result.rowCount} expired audit logs`);
            
            // Log cleanup action
            await this.log({
                action: 'AUDIT_LOG_CLEANUP',
                resourceType: 'audit_log',
                details: {
                    deletedCount: result.rowCount,
                    cleanupDate: new Date().toISOString()
                },
                phiAccessed: false
            });
            
            return result.rowCount;
            
        } catch (error) {
            logger.error('Audit log cleanup failed:', error);
            throw error;
        }
    }

    /**
     * Export audit logs for external compliance systems
     */
    async exportAuditLogs(filters, format = 'json') {
        try {
            const auditLogs = await this.queryAuditLogs(filters);
            
            // Log export action
            await this.log({
                action: 'AUDIT_LOG_EXPORT',
                resourceType: 'audit_log',
                details: {
                    exportedCount: auditLogs.length,
                    format,
                    filters,
                    exportedAt: new Date().toISOString()
                },
                phiAccessed: false
            });

            switch (format) {
                case 'csv':
                    return this.convertToCSV(auditLogs);
                case 'xml':
                    return this.convertToXML(auditLogs);
                default:
                    return JSON.stringify(auditLogs, null, 2);
            }

        } catch (error) {
            logger.error('Audit log export failed:', error);
            throw error;
        }
    }

    convertToCSV(auditLogs) {
        if (auditLogs.length === 0) return '';
        
        const headers = Object.keys(auditLogs[0]).join(',');
        const rows = auditLogs.map(log => 
            Object.values(log).map(value => 
                typeof value === 'object' ? JSON.stringify(value) : value
            ).join(',')
        );
        
        return [headers, ...rows].join('\n');
    }

    convertToXML(auditLogs) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<audit_logs>\n';
        
        auditLogs.forEach(log => {
            xml += '  <audit_log>\n';
            Object.entries(log).forEach(([key, value]) => {
                xml += `    <${key}>${this.escapeXML(value)}</${key}>\n`;
            });
            xml += '  </audit_log>\n';
        });
        
        xml += '</audit_logs>';
        return xml;
    }

    escapeXML(value) {
        if (typeof value === 'object') {
            value = JSON.stringify(value);
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

module.exports = new HIPAAAuditLogger();
