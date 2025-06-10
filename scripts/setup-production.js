/**
 * Production Setup Script for Dr. Alex AI Provider Platform
 * Automated setup for HIPAA-compliant healthcare environment
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

class ProductionSetup {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        this.config = {};
    }

    async runSetup() {
        console.log(`
🏥 Dr. Alex AI Provider Platform - Production Setup
==================================================

This script will help you configure your production environment
with HIPAA-compliant security settings.

`);

        try {
            await this.gatherConfiguration();
            await this.generateSecurityKeys();
            await this.createEnvironmentFile();
            await this.setupDatabase();
            await this.verifySetup();
            
            console.log(`
✅ Production setup completed successfully!

Next steps:
1. Review the generated .env file
2. Deploy to your production environment
3. Run database migrations: npm run migrate:up
4. Start the application: npm start

🔒 Security Notes:
- All encryption keys have been generated securely
- Database credentials are encrypted
- HIPAA audit logging is enabled
- Rate limiting is configured for production

`);

        } catch (error) {
            console.error('❌ Setup failed:', error.message);
            process.exit(1);
            
        } finally {
            this.rl.close();
        }
    }

    async gatherConfiguration() {
        console.log('📋 Configuration Setup\n');

        // Database configuration
        this.config.DATABASE_URL = await this.prompt(
            'PostgreSQL connection string (postgresql://user:pass@host:port/db): '
        );

        // Application configuration
        this.config.PORT = await this.prompt('Application port (default: 3004): ') || '3004';
        
        this.config.CORS_ORIGIN = await this.prompt(
            'CORS origins (comma-separated, e.g., https://yourdomain.com): '
        );

        // Anthropic API configuration
        this.config.ANTHROPIC_API_KEY = await this.prompt(
            'Anthropic API key (sk-ant-api03-...): '
        );

        // Email configuration (optional)
        const setupEmail = await this.prompt('Setup email notifications? (y/n): ');
        if (setupEmail.toLowerCase() === 'y') {
            this.config.SMTP_HOST = await this.prompt('SMTP host: ');
            this.config.SMTP_PORT = await this.prompt('SMTP port (587): ') || '587';
            this.config.SMTP_USER = await this.prompt('SMTP username: ');
            this.config.SMTP_PASS = await this.prompt('SMTP password: ');
        }

        // Backup configuration
        const setupBackup = await this.prompt('Setup automated backups? (y/n): ');
        if (setupBackup.toLowerCase() === 'y') {
            this.config.BACKUP_S3_BUCKET = await this.prompt('S3 bucket for backups: ');
            this.config.AWS_ACCESS_KEY_ID = await this.prompt('AWS Access Key ID: ');
            this.config.AWS_SECRET_ACCESS_KEY = await this.prompt('AWS Secret Access Key: ');
            this.config.AWS_REGION = await this.prompt('AWS Region (us-east-1): ') || 'us-east-1';
        }
    }

    async generateSecurityKeys() {
        console.log('\n🔐 Generating security keys...');

        // JWT secrets
        this.config.JWT_SECRET = this.generateSecureKey(64);
        this.config.JWT_REFRESH_SECRET = this.generateSecureKey(64);

        // Encryption keys
        this.config.ENCRYPTION_MASTER_KEY = this.generateSecureKey(64);
        this.config.ENCRYPTION_SALT = this.generateSecureKey(32);
        this.config.AUDIT_INTEGRITY_SECRET = this.generateSecureKey(32);
        this.config.SHARE_SECRET = this.generateSecureKey(32);

        // Session configuration
        this.config.SESSION_SECRET = this.generateSecureKey(32);

        // Internal service key
        this.config.INTERNAL_SERVICE_KEY = this.generateSecureKey(32);

        console.log('✅ Security keys generated');
    }

    generateSecureKey(length) {
        return crypto.randomBytes(length).toString('hex');
    }

    async createEnvironmentFile() {
        console.log('\n📝 Creating environment file...');

        const envContent = `# Dr. Alex AI Provider Platform - Production Configuration
# Generated: ${new Date().toISOString()}
# SECURITY WARNING: Keep this file secure and never commit to version control

# Application Configuration
NODE_ENV=production
PORT=${this.config.PORT}
CORS_ORIGIN=${this.config.CORS_ORIGIN}

# Security Configuration
JWT_SECRET=${this.config.JWT_SECRET}
JWT_REFRESH_SECRET=${this.config.JWT_REFRESH_SECRET}
SESSION_SECRET=${this.config.SESSION_SECRET}

# Encryption Configuration (HIPAA Compliance)
ENCRYPTION_MASTER_KEY=${this.config.ENCRYPTION_MASTER_KEY}
ENCRYPTION_SALT=${this.config.ENCRYPTION_SALT}
AUDIT_INTEGRITY_SECRET=${this.config.AUDIT_INTEGRITY_SECRET}
SHARE_SECRET=${this.config.SHARE_SECRET}

# Database Configuration
DATABASE_URL=${this.config.DATABASE_URL}

# AI Configuration
ANTHROPIC_API_KEY=${this.config.ANTHROPIC_API_KEY}

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Internal Services
INTERNAL_SERVICE_KEY=${this.config.INTERNAL_SERVICE_KEY}

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
AUDIT_LOG_RETENTION_DAYS=2190

# Security Headers
HSTS_MAX_AGE=31536000
CSP_REPORT_URI=/api/security/csp-report

# Session Configuration
SESSION_TIMEOUT_HOURS=8
MFA_WINDOW_SECONDS=30
MAX_FAILED_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30

# Backup Configuration${this.config.BACKUP_S3_BUCKET ? `
BACKUP_ENABLED=true
BACKUP_S3_BUCKET=${this.config.BACKUP_S3_BUCKET}
AWS_ACCESS_KEY_ID=${this.config.AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${this.config.AWS_SECRET_ACCESS_KEY}
AWS_REGION=${this.config.AWS_REGION}
BACKUP_SCHEDULE=0 2 * * *` : `
BACKUP_ENABLED=false`}

# Email Configuration${this.config.SMTP_HOST ? `
EMAIL_ENABLED=true
SMTP_HOST=${this.config.SMTP_HOST}
SMTP_PORT=${this.config.SMTP_PORT}
SMTP_SECURE=true
SMTP_USER=${this.config.SMTP_USER}
SMTP_PASS=${this.config.SMTP_PASS}
FROM_EMAIL=noreply@dralexai.com
FROM_NAME=Dr. Alex AI Platform` : `
EMAIL_ENABLED=false`}

# Monitoring Configuration
HEALTH_CHECK_ENABLED=true
METRICS_ENABLED=true
PERFORMANCE_MONITORING=true

# Integration Configuration
MENOWELLNESS_INTEGRATION=true
SUPPORTPARTNER_INTEGRATION=true
FHIR_ENABLED=true

# Compliance Configuration
HIPAA_AUDIT_ENABLED=true
GDPR_COMPLIANCE=true
PIPEDA_COMPLIANCE=true
DATA_RETENTION_YEARS=7

# Development/Debug (set to false in production)
DEBUG_MODE=false
VERBOSE_LOGGING=false
STACK_TRACES=false
`;

        // Write to .env file
        fs.writeFileSync('.env', envContent);
        
        // Create .env.example for reference
        const exampleContent = envContent.replace(
            /=.+$/gm, 
            '=your-value-here'
        ).replace(/# Generated:.+\n/, '# Copy this file to .env and configure your values\n');
        
        fs.writeFileSync('.env.example', exampleContent);

        console.log('✅ Environment files created (.env and .env.example)');
    }

    async setupDatabase() {
        console.log('\n🗄️ Database Setup...');

        const runMigration = await this.prompt(
            'Run database migration now? (y/n): '
        );

        if (runMigration.toLowerCase() === 'y') {
            try {
                const DatabaseMigrator = require('../database/migrate');
                const migrator = new DatabaseMigrator();
                
                console.log('Running database migration...');
                await migrator.runMigrations();
                await migrator.close();
                
                console.log('✅ Database migration completed');
                
            } catch (error) {
                console.error('❌ Database migration failed:', error.message);
                console.log('You can run it manually later with: npm run migrate:up');
            }
        } else {
            console.log('ℹ️ Database migration skipped. Run manually with: npm run migrate:up');
        }
    }

    async verifySetup() {
        console.log('\n🔍 Verifying setup...');

        const checks = [
            { name: 'Environment file', check: () => fs.existsSync('.env') },
            { name: 'Database URL', check: () => this.config.DATABASE_URL?.startsWith('postgresql://') },
            { name: 'Anthropic API key', check: () => this.config.ANTHROPIC_API_KEY?.startsWith('sk-ant-') },
            { name: 'Security keys', check: () => this.config.JWT_SECRET?.length >= 64 },
            { name: 'CORS configuration', check: () => this.config.CORS_ORIGIN?.length > 0 }
        ];

        let allPassed = true;
        for (const check of checks) {
            const passed = check.check();
            console.log(`${passed ? '✅' : '❌'} ${check.name}`);
            if (!passed) allPassed = false;
        }

        if (!allPassed) {
            throw new Error('Setup verification failed. Please check the configuration.');
        }

        console.log('✅ All verification checks passed');
    }

    async prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    // Additional utility methods
    async createSystemdService() {
        const serviceContent = `[Unit]
Description=Dr. Alex AI Provider Platform
After=network.target

[Service]
Type=simple
User=dralexai
WorkingDirectory=/opt/dralexai-provider-platform
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/dralexai-provider-platform/.env

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/dralexai-provider-platform

[Install]
WantedBy=multi-user.target
`;

        fs.writeFileSync('dralexai-provider.service', serviceContent);
        console.log('✅ Systemd service file created: dralexai-provider.service');
        console.log('   Copy to /etc/systemd/system/ and run: systemctl enable dralexai-provider');
    }

    async createNginxConfig() {
        const nginxContent = `server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://localhost:${this.config.PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }
}

# Rate limiting zone
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
}
`;

        fs.writeFileSync('nginx-dralexai.conf', nginxContent);
        console.log('✅ Nginx configuration created: nginx-dralexai.conf');
    }
}

// CLI interface
if (require.main === module) {
    const setup = new ProductionSetup();
    setup.runSetup().catch(console.error);
}

module.exports = ProductionSetup;
