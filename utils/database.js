const { Pool } = require('pg');
const logger = require('./logger');

// Database connection configuration
let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Handle pool errors
  pool.on('error', (err, client) => {
    logger.error('Unexpected error on idle client', err);
  });

  // Test database connection
  pool.connect((err, client, release) => {
    if (err) {
      logger.error('Error acquiring client', err.stack);
      logger.warn('Database connection failed - running in demo mode');
      return;
    }

    client.query('SELECT NOW()', (err, result) => {
      release();
      if (err) {
        logger.error('Error executing query', err.stack);
        logger.warn('Database query failed - running in demo mode');
        return;
      }
      logger.info('Provider Dashboard database connected successfully');
    });
  });
} else {
  logger.warn('No DATABASE_URL provided - running in demo mode without database');
}

// Query wrapper with error handling and logging
const query = async (text, params) => {
  if (!pool) {
    logger.warn('Database not available - returning mock data');
    return { rows: [], rowCount: 0 };
  }

  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 100) {
      logger.warn(`Slow provider query detected: ${duration}ms`, { query: text, params });
    }

    return res;
  } catch (error) {
    logger.error('Provider database query error:', { error: error.message, query: text, params });
    throw error;
  }
};

// Transaction wrapper
const transaction = async (callback) => {
  if (!pool) {
    logger.warn('Database not available - skipping transaction');
    return null;
  }

  const client = await pool.connect();
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
};

// Health check
const healthCheck = async () => {
  if (!pool) {
    logger.warn('Database not available - health check skipped');
    return false;
  }

  try {
    const result = await query('SELECT 1 as health_check');
    return result.rows[0].health_check === 1;
  } catch (error) {
    logger.error('Provider database health check failed:', error);
    return false;
  }
};

// Graceful shutdown
const shutdown = async () => {
  if (!pool) {
    logger.info('No database pool to close');
    return;
  }

  try {
    await pool.end();
    logger.info('Provider database pool closed');
  } catch (error) {
    logger.error('Error closing provider database pool:', error);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = {
  query,
  transaction,
  healthCheck,
  pool
};
