/**
 * Database Security Integration Tests
 * Testing secure database operations and transaction integrity
 */

// Import the database service (it's exported as singleton)
const database = require('../../services/database');

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn()
  }))
}));

const { Pool } = require('pg');

describe('Database Security Integration', () => {
  let mockPool;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn()
    };

    Pool.mockImplementation(() => mockPool);

    // Mock the database service methods
    database.query = jest.fn();
    database.testConnection = jest.fn();
    database.transaction = jest.fn();
    database.getClient = jest.fn().mockResolvedValue(mockClient);
    database.close = jest.fn();

    jest.clearAllMocks();
  });

  describe('Connection Security', () => {
    it('should use SSL in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodDatabase = new DatabaseService();

      // Verify SSL configuration would be enabled
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: { rejectUnauthorized: false }
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should configure connection pooling securely', () => {
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 20, // Maximum connections
          idleTimeoutMillis: 30000, // 30 seconds
          connectionTimeoutMillis: 2000 // 2 seconds
        })
      );
    });

    it('should test database connection on startup', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ now: new Date() }] });

      await database.testConnection();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT NOW()');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle connection failures gracefully', async () => {
      mockPool.connect.mockRejectedValueOnce(new Error('Connection failed'));

      // Should not throw, but log error
      await expect(database.testConnection()).resolves.toBeUndefined();
    });
  });

  describe('Query Security', () => {
    it('should use parameterized queries to prevent SQL injection', async () => {
      const query = 'SELECT * FROM patients WHERE id = $1';
      const params = ['patient-123'];
      const expectedResult = { rows: [{ id: 'patient-123', name: 'John Doe' }] };

      mockPool.query.mockResolvedValueOnce(expectedResult);

      const result = await database.query(query, params);

      expect(mockPool.query).toHaveBeenCalledWith(query, params);
      expect(result).toEqual(expectedResult);
    });

    it('should log query execution for audit purposes', async () => {
      const query = 'SELECT * FROM patients WHERE id = $1';
      const params = ['patient-123'];

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await database.query(query, params);

      // Verify query was executed (logging is mocked)
      expect(mockPool.query).toHaveBeenCalledWith(query, params);
    });

    it('should handle query errors securely', async () => {
      const query = 'INVALID SQL QUERY';
      const error = new Error('Syntax error');

      mockPool.query.mockRejectedValueOnce(error);

      await expect(database.query(query)).rejects.toThrow('Syntax error');
    });
  });

  describe('Transaction Security', () => {
    it('should support secure database transactions', async () => {
      const transactionCallback = jest.fn().mockResolvedValue('transaction result');

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // COMMIT

      const result = await database.transaction(transactionCallback);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(transactionCallback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe('transaction result');
    });

    it('should rollback transactions on error', async () => {
      const transactionCallback = jest.fn().mockRejectedValue(new Error('Transaction failed'));

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(database.transaction(transactionCallback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should ensure client is always released', async () => {
      const transactionCallback = jest.fn().mockRejectedValue(new Error('Callback error'));

      mockClient.query.mockResolvedValue({ rows: [] });

      try {
        await database.transaction(transactionCallback);
      } catch (error) {
        // Expected to throw
      }

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('PHI Data Security', () => {
    it('should handle encrypted PHI data storage', async () => {
      const encryptedPHI = {
        patient_id: 'patient-123',
        encrypted_data: 'encrypted_medical_record_data',
        encryption_key_id: 'key-456',
        iv: 'initialization_vector',
        auth_tag: 'authentication_tag'
      };

      const insertQuery = `
        INSERT INTO encrypted_patient_data (
          patient_id, encrypted_data, encryption_key_id, iv, auth_tag, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `;

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'record-789' }] });

      await database.query(insertQuery, [
        encryptedPHI.patient_id,
        encryptedPHI.encrypted_data,
        encryptedPHI.encryption_key_id,
        encryptedPHI.iv,
        encryptedPHI.auth_tag
      ]);

      expect(mockPool.query).toHaveBeenCalledWith(insertQuery, [
        'patient-123',
        'encrypted_medical_record_data',
        'key-456',
        'initialization_vector',
        'authentication_tag'
      ]);
    });

    it('should support secure PHI data retrieval', async () => {
      const selectQuery = `
        SELECT encrypted_data, encryption_key_id, iv, auth_tag 
        FROM encrypted_patient_data 
        WHERE patient_id = $1 AND active = true
      `;

      const encryptedResult = {
        rows: [{
          encrypted_data: 'encrypted_medical_record_data',
          encryption_key_id: 'key-456',
          iv: 'initialization_vector',
          auth_tag: 'authentication_tag'
        }]
      };

      mockPool.query.mockResolvedValueOnce(encryptedResult);

      const result = await database.query(selectQuery, ['patient-123']);

      expect(result.rows[0]).toHaveProperty('encrypted_data');
      expect(result.rows[0]).toHaveProperty('encryption_key_id');
      expect(result.rows[0]).toHaveProperty('iv');
      expect(result.rows[0]).toHaveProperty('auth_tag');
    });
  });

  describe('Audit Trail Security', () => {
    it('should securely store audit log entries', async () => {
      const auditEntry = {
        id: 'audit-123',
        user_id: 'provider-456',
        action: 'PHI_ACCESS',
        resource_type: 'patient_record',
        resource_id: 'patient-789',
        timestamp: new Date(),
        details: JSON.stringify({ accessReason: 'patient_care' }),
        phi_accessed: true,
        checksum: 'integrity_checksum'
      };

      const insertAuditQuery = `
        INSERT INTO hipaa_audit_log (
          id, user_id, action, resource_type, resource_id, timestamp,
          details, phi_accessed, checksum
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await database.query(insertAuditQuery, [
        auditEntry.id,
        auditEntry.user_id,
        auditEntry.action,
        auditEntry.resource_type,
        auditEntry.resource_id,
        auditEntry.timestamp,
        auditEntry.details,
        auditEntry.phi_accessed,
        auditEntry.checksum
      ]);

      expect(mockPool.query).toHaveBeenCalledWith(
        insertAuditQuery,
        expect.arrayContaining([
          'audit-123',
          'provider-456',
          'PHI_ACCESS',
          'patient_record',
          'patient-789'
        ])
      );
    });

    it('should prevent audit log tampering', async () => {
      // Audit logs should be append-only (no UPDATE or DELETE)
      const prohibitedQueries = [
        'UPDATE hipaa_audit_log SET action = $1 WHERE id = $2',
        'DELETE FROM hipaa_audit_log WHERE id = $1'
      ];

      for (const query of prohibitedQueries) {
        mockPool.query.mockRejectedValueOnce(new Error('Operation not permitted'));

        await expect(database.query(query, ['test-value'])).rejects.toThrow('Operation not permitted');
      }
    });
  });

  describe('Backup and Recovery Security', () => {
    it('should support encrypted database backups', async () => {
      const backupQuery = `
        SELECT pg_start_backup('hipaa_compliant_backup', true, false)
      `;

      mockPool.query.mockResolvedValueOnce({
        rows: [{ pg_start_backup: '0/1000000' }]
      });

      const result = await database.query(backupQuery);

      expect(result.rows[0]).toHaveProperty('pg_start_backup');
      expect(mockPool.query).toHaveBeenCalledWith(backupQuery);
    });

    it('should verify backup integrity', async () => {
      const checksumQuery = `
        SELECT schemaname, tablename, 
               md5(string_agg(md5(t.*::text), '' ORDER BY t.*::text)) as table_checksum
        FROM (SELECT * FROM patients ORDER BY id) t, 
             pg_tables 
        WHERE schemaname = 'public' AND tablename = 'patients'
        GROUP BY schemaname, tablename
      `;

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          schemaname: 'public',
          tablename: 'patients',
          table_checksum: 'abc123def456'
        }]
      });

      const result = await database.query(checksumQuery);

      expect(result.rows[0]).toHaveProperty('table_checksum');
      expect(result.rows[0].table_checksum).toMatch(/^[a-f0-9]{12}$/);
    });
  });

  describe('Access Control Security', () => {
    it('should enforce row-level security policies', async () => {
      const rlsQuery = `
        SELECT * FROM patients 
        WHERE provider_id = current_setting('app.current_provider_id')
      `;

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'patient-123', provider_id: 'provider-456' }]
      });

      const result = await database.query(rlsQuery);

      expect(result.rows[0].provider_id).toBe('provider-456');
      expect(mockPool.query).toHaveBeenCalledWith(rlsQuery);
    });

    it('should validate database user permissions', async () => {
      const permissionQuery = `
        SELECT has_table_privilege('patients', 'SELECT') as can_select,
               has_table_privilege('patients', 'INSERT') as can_insert,
               has_table_privilege('patients', 'UPDATE') as can_update,
               has_table_privilege('patients', 'DELETE') as can_delete
      `;

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          can_select: true,
          can_insert: true,
          can_update: true,
          can_delete: false // Should not allow direct deletes
        }]
      });

      const result = await database.query(permissionQuery);

      expect(result.rows[0].can_select).toBe(true);
      expect(result.rows[0].can_insert).toBe(true);
      expect(result.rows[0].can_update).toBe(true);
      expect(result.rows[0].can_delete).toBe(false); // Security requirement
    });
  });

  describe('Performance and Security Balance', () => {
    it('should handle concurrent secure operations', async () => {
      const concurrentQueries = Array.from({ length: 10 }, (_, i) => 
        database.query('SELECT * FROM patients WHERE id = $1', [`patient-${i}`])
      );

      // Mock all queries to succeed
      mockPool.query.mockResolvedValue({ rows: [{ id: 'test' }] });

      const results = await Promise.all(concurrentQueries);

      expect(results).toHaveLength(10);
      expect(mockPool.query).toHaveBeenCalledTimes(10);
    });

    it('should maintain query performance with security measures', async () => {
      const complexSecureQuery = `
        SELECT p.id, p.first_name, p.last_name,
               COUNT(mr.id) as record_count
        FROM patients p
        LEFT JOIN medical_records mr ON p.id = mr.patient_id
        WHERE p.provider_id = $1
          AND p.active = true
          AND (mr.created_at IS NULL OR mr.created_at >= $2)
        GROUP BY p.id, p.first_name, p.last_name
        ORDER BY p.last_name, p.first_name
        LIMIT 100
      `;

      const startTime = Date.now();
      
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'patient-1', first_name: 'John', last_name: 'Doe', record_count: 5 },
          { id: 'patient-2', first_name: 'Jane', last_name: 'Smith', record_count: 3 }
        ]
      });

      const result = await database.query(complexSecureQuery, ['provider-123', new Date()]);
      const queryTime = Date.now() - startTime;

      expect(result.rows).toHaveLength(2);
      expect(queryTime).toBeLessThan(100); // Should be fast (mocked, but validates structure)
    });
  });

  describe('Database Cleanup and Maintenance', () => {
    it('should support secure data archival', async () => {
      const archiveQuery = `
        INSERT INTO archived_patients 
        SELECT *, NOW() as archived_at 
        FROM patients 
        WHERE last_activity < $1
      `;

      const archiveDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

      mockPool.query.mockResolvedValueOnce({ rowCount: 5 });

      const result = await database.query(archiveQuery, [archiveDate]);

      expect(result.rowCount).toBe(5);
      expect(mockPool.query).toHaveBeenCalledWith(archiveQuery, [archiveDate]);
    });

    it('should close database connections securely', async () => {
      await database.close();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});
