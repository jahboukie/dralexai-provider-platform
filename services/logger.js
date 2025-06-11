/**
 * Logger Service - HIPAA-Compliant Logging
 * Structured logging with PHI protection and audit compliance
 */

const winston = require('winston');
const path = require('path');

// Custom format to sanitize PHI
const sanitizePHI = winston.format((info) => {
    // Remove or mask common PHI patterns
    const phiPatterns = [
        /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
        /\b\d{3}-\d{3}-\d{4}\b/g, // Phone numbers
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
        /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, // Dates
    ];

    let message = info.message;
    phiPatterns.forEach(pattern => {
        message = message.replace(pattern, '[REDACTED]');
    });

    info.message = message;
    return info;
});

// Create logs directory if it doesn't exist (skip in serverless environments)
let logDir = path.join(__dirname, '../logs');
try {
    require('fs').mkdirSync(logDir, { recursive: true });
} catch (error) {
    // In serverless environments like Vercel, use /tmp for logs
    if (error.code === 'ENOENT' || error.code === 'EACCES') {
        logDir = '/tmp/logs';
        try {
            require('fs').mkdirSync(logDir, { recursive: true });
        } catch (tmpError) {
            // If /tmp also fails, use console only
            logDir = null;
        }
    }
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        sanitizePHI(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { 
        service: 'dr-alex-ai-provider',
        version: '1.0.0'
    },
    transports: logDir ? [
        // Error log file
        new winston.transports.File({ 
            filename: path.join(logDir, 'error.log'), 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // Combined log file
        new winston.transports.File({ 
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // Audit log file (for HIPAA compliance)
        new winston.transports.File({
            filename: path.join(logDir, 'audit.log'),
            level: 'info',
            maxsize: 10485760, // 10MB
            maxFiles: 10,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    ] : [
        // Console only for serverless environments
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Add console logging in development (only if we have file transports)
if (process.env.NODE_ENV !== 'production' && logDir) {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

module.exports = logger;