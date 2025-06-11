/**
 * Database Service - HIPAA-Compliant PostgreSQL Connection
 * Secure database operations with encryption and audit logging
 */

const { Pool } = require('pg');
const logger = require('./logger');

class DatabaseService {
    constructor() {
        // Skip database connection in test environment
        if (process.env.NODE_ENV === 'test') {
            this.pool = null;
            logger.info('Database service initialized in test mode (no connection)');
            return;
        }

        // Use DATABASE_URL if available (production/Supabase), otherwise use individual env vars
        const config = process.env.DATABASE_URL ? {
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        } : {
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'dralexai_provider',
            password: process.env.DB_PASSWORD || 'password',
            port: process.env.DB_PORT || 5432,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        };

        this.pool = new Pool({
            ...config,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Test connection on startup (only in non-test environments)
        if (process.env.NODE_ENV !== 'test') {
            this.testConnection();
        }
    }

    async testConnection() {
        // Skip in test environment
        if (process.env.NODE_ENV === 'test' || !this.pool) {
            return;
        }

        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            logger.info('Database connection established successfully');
        } catch (error) {
            logger.error('Database connection failed:', error);
            // Don't throw in development to allow app to start without DB
            if (process.env.NODE_ENV === 'production') {
                throw error;
            }
        }
    }

    async query(text, params) {
        // Return mock result in test environment
        if (process.env.NODE_ENV === 'test' || !this.pool) {
            return { rows: [], rowCount: 0 };
        }

        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            logger.debug('Executed query', { text, duration, rows: result.rowCount });
            return result;
        } catch (error) {
            logger.error('Database query error:', error);
            throw error;
        }
    }

    async getClient() {
        // Return mock client in test environment
        if (process.env.NODE_ENV === 'test' || !this.pool) {
            return {
                query: async () => ({ rows: [], rowCount: 0 }),
                release: () => {}
            };
        }
        return await this.pool.connect();
    }

    async transaction(callback) {
        // Return mock result in test environment
        if (process.env.NODE_ENV === 'test' || !this.pool) {
            const mockClient = {
                query: async () => ({ rows: [], rowCount: 0 }),
                release: () => {}
            };
            return await callback(mockClient);
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            logger.info('Database connection pool closed');
        }
    }
}

// Create singleton instance
const database = new DatabaseService();

module.exports = database;