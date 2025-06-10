/**
 * Database Migration Script
 * Sets up production-ready PostgreSQL database for Dr. Alex AI Provider Platform
 * HIPAA-compliant schema with encryption and audit logging
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const logger = require('../services/logger');

class DatabaseMigrator {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }

    async runMigrations() {
        const client = await this.pool.connect();
        
        try {
            console.log('🚀 Starting Dr. Alex AI database migration...');
            
            // Check if database exists and is accessible
            await this.checkDatabaseConnection(client);
            
            // Run schema creation
            await this.createSchema(client);
            
            // Set up Row Level Security policies
            await this.setupRowLevelSecurity(client);
            
            // Create initial admin user if needed
            await this.createInitialData(client);
            
            // Verify migration success
            await this.verifyMigration(client);
            
            console.log('✅ Database migration completed successfully!');
            
        } catch (error) {
            console.error('❌ Database migration failed:', error);
            throw error;
            
        } finally {
            client.release();
        }
    }

    async checkDatabaseConnection(client) {
        try {
            const result = await client.query('SELECT NOW() as current_time');
            console.log(`📡 Database connected at: ${result.rows[0].current_time}`);
            
        } catch (error) {
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }

    async createSchema(client) {
        try {
            console.log('📋 Creating database schema...');
            
            const schemaSQL = fs.readFileSync(
                path.join(__dirname, 'schema.sql'), 
                'utf8'
            );
            
            await client.query(schemaSQL);
            console.log('✅ Schema created successfully');
            
        } catch (error) {
            throw new Error(`Schema creation failed: ${error.message}`);
        }
    }

    async setupRowLevelSecurity(client) {
        try {
            console.log('🔒 Setting up Row Level Security policies...');
            
            // RLS policy for patients - providers can only access their own patients
            await client.query(`
                CREATE POLICY provider_patients_policy ON patients
                FOR ALL TO authenticated_providers
                USING (provider_id = current_setting('app.current_provider_id')::uuid);
            `);

            // RLS policy for MenoWellness patients
            await client.query(`
                CREATE POLICY provider_menowellness_policy ON menowellness_patients
                FOR ALL TO authenticated_providers
                USING (provider_id = current_setting('app.current_provider_id')::uuid);
            `);

            // RLS policy for shared symptom data
            await client.query(`
                CREATE POLICY provider_symptom_data_policy ON shared_symptom_data
                FOR ALL TO authenticated_providers
                USING (
                    EXISTS (
                        SELECT 1 FROM menowellness_patients mp 
                        WHERE mp.id = menowellness_link_id 
                        AND mp.provider_id = current_setting('app.current_provider_id')::uuid
                    )
                );
            `);

            // RLS policy for provider insights
            await client.query(`
                CREATE POLICY provider_insights_policy ON provider_insights
                FOR ALL TO authenticated_providers
                USING (provider_id = current_setting('app.current_provider_id')::uuid);
            `);

            console.log('✅ Row Level Security policies created');
            
        } catch (error) {
            // RLS policies might already exist, log warning but don't fail
            console.warn('⚠️ RLS policy creation warning:', error.message);
        }
    }

    async createInitialData(client) {
        try {
            console.log('👤 Creating initial data...');
            
            // Check if any practices exist
            const practiceCheck = await client.query('SELECT COUNT(*) FROM practices');
            
            if (parseInt(practiceCheck.rows[0].count) === 0) {
                // Create default practice
                await client.query(`
                    INSERT INTO practices (
                        name, practice_type, hipaa_compliance_date, 
                        business_associate_agreement, subscription_tier
                    ) VALUES (
                        'Dr. Alex AI Demo Practice',
                        'group_practice',
                        NOW(),
                        true,
                        'professional'
                    )
                `);
                
                console.log('✅ Default practice created');
            }

            // Create database roles for RLS
            try {
                await client.query(`
                    CREATE ROLE authenticated_providers;
                `);
                console.log('✅ Database roles created');
            } catch (error) {
                // Role might already exist
                console.log('ℹ️ Database roles already exist');
            }
            
        } catch (error) {
            throw new Error(`Initial data creation failed: ${error.message}`);
        }
    }

    async verifyMigration(client) {
        try {
            console.log('🔍 Verifying migration...');
            
            // Check all required tables exist
            const requiredTables = [
                'practices', 'providers', 'patients', 'menowellness_patients',
                'shared_symptom_data', 'provider_insights', 'hipaa_audit_log'
            ];

            for (const table of requiredTables) {
                const result = await client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = $1
                    )
                `, [table]);

                if (!result.rows[0].exists) {
                    throw new Error(`Required table '${table}' not found`);
                }
            }

            // Check extensions are installed
            const extensions = ['uuid-ossp', 'pgcrypto'];
            for (const ext of extensions) {
                const result = await client.query(`
                    SELECT EXISTS (
                        SELECT FROM pg_extension 
                        WHERE extname = $1
                    )
                `, [ext]);

                if (!result.rows[0].exists) {
                    throw new Error(`Required extension '${ext}' not installed`);
                }
            }

            // Test basic functionality
            await client.query('SELECT uuid_generate_v4()'); // Test UUID generation
            await client.query('SELECT gen_random_bytes(16)'); // Test crypto functions

            console.log('✅ Migration verification passed');
            
        } catch (error) {
            throw new Error(`Migration verification failed: ${error.message}`);
        }
    }

    async rollback() {
        const client = await this.pool.connect();
        
        try {
            console.log('🔄 Rolling back database migration...');
            
            // Drop tables in reverse dependency order
            const dropTables = [
                'hipaa_audit_log',
                'provider_insights',
                'shared_symptom_data',
                'menowellness_patients',
                'patients',
                'providers',
                'practices'
            ];

            for (const table of dropTables) {
                await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
                console.log(`🗑️ Dropped table: ${table}`);
            }

            // Drop custom types
            const dropTypes = [
                'healthcare_practice_type',
                'medical_specialty',
                'provider_role',
                'patient_consent_status',
                'data_sharing_permission',
                'appointment_status'
            ];

            for (const type of dropTypes) {
                await client.query(`DROP TYPE IF EXISTS ${type} CASCADE`);
                console.log(`🗑️ Dropped type: ${type}`);
            }

            console.log('✅ Rollback completed');
            
        } catch (error) {
            console.error('❌ Rollback failed:', error);
            throw error;
            
        } finally {
            client.release();
        }
    }

    async getStatus() {
        const client = await this.pool.connect();
        
        try {
            // Check migration status
            const tables = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            `);

            const extensions = await client.query(`
                SELECT extname 
                FROM pg_extension 
                WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_audit')
            `);

            const practices = await client.query('SELECT COUNT(*) FROM practices');
            const providers = await client.query('SELECT COUNT(*) FROM providers');

            return {
                tables: tables.rows.map(row => row.table_name),
                extensions: extensions.rows.map(row => row.extname),
                practiceCount: parseInt(practices.rows[0].count),
                providerCount: parseInt(providers.rows[0].count),
                migrationComplete: tables.rows.length >= 7
            };
            
        } catch (error) {
            return {
                error: error.message,
                migrationComplete: false
            };
            
        } finally {
            client.release();
        }
    }

    async close() {
        await this.pool.end();
    }
}

// CLI interface
if (require.main === module) {
    const migrator = new DatabaseMigrator();
    const command = process.argv[2];

    async function runCommand() {
        try {
            switch (command) {
                case 'up':
                    await migrator.runMigrations();
                    break;
                    
                case 'down':
                    await migrator.rollback();
                    break;
                    
                case 'status':
                    const status = await migrator.getStatus();
                    console.log('📊 Migration Status:', JSON.stringify(status, null, 2));
                    break;
                    
                default:
                    console.log(`
🏥 Dr. Alex AI Database Migrator

Usage:
  node migrate.js up      - Run migrations
  node migrate.js down    - Rollback migrations  
  node migrate.js status  - Check migration status

Environment Variables Required:
  DATABASE_URL - PostgreSQL connection string
  NODE_ENV     - Environment (development/production)
                    `);
            }
            
        } catch (error) {
            console.error('Migration failed:', error);
            process.exit(1);
            
        } finally {
            await migrator.close();
        }
    }

    runCommand();
}

module.exports = DatabaseMigrator;
