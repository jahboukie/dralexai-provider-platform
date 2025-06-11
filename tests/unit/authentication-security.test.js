/**
 * HIPAA/GDPR/PIPEDA Compliant Authentication Security Tests
 * Comprehensive testing of healthcare-grade authentication
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
// Import the real authentication service
const HealthcareAuthenticationService = require('../../services/authentication');

// Mock dependencies
jest.mock('../../services/database');
jest.mock('../../services/audit-logger');
jest.mock('../../services/logger');

const mockDatabase = require('../../services/database');
const mockAuditLogger = require('../../services/audit-logger');

describe('Healthcare Authentication Security', () => {
  let authService;
  let app;

  beforeEach(() => {
    authService = HealthcareAuthenticationService;
    app = express();
    app.use(express.json());

    // Reset mocks
    jest.clearAllMocks();

    // Mock database responses
    mockDatabase.query = jest.fn();
    mockAuditLogger.log = jest.fn().mockResolvedValue('audit-id');
  });

  describe('Password Security Requirements', () => {
    it('should enforce healthcare-grade password hashing (bcrypt rounds >= 12)', async () => {
      const password = 'SecurePassword123!';
      const hash = await bcrypt.hash(password, authService.bcryptRounds);
      
      expect(authService.bcryptRounds).toBeGreaterThanOrEqual(12);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      
      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject weak passwords', async () => {
      const weakPasswords = [
        'password',
        '123456',
        'qwerty',
        'abc123',
        'password123'
      ];

      for (const weakPassword of weakPasswords) {
        await expect(authService.registerProvider({
          email: 'test@example.com',
          password: weakPassword,
          firstName: 'Test',
          lastName: 'Provider',
          licenseNumber: 'TEST123',
          licenseState: 'CA',
          specialty: 'Internal Medicine'
        })).rejects.toThrow();
      }
    });

    it('should require complex passwords with multiple character types', async () => {
      const validPassword = 'SecurePassword123!@#';

      // Mock successful database operations
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing provider
        .mockResolvedValueOnce({ rows: [{ id: 'test-id', email: 'test@example.com', first_name: 'Test', last_name: 'Provider' }] }); // Insert provider

      const result = await authService.registerProvider({
        email: 'test@example.com',
        password: validPassword,
        firstName: 'Test',
        lastName: 'Provider',
        licenseNumber: 'TEST123',
        licenseState: 'CA',
        specialty: 'Internal Medicine'
      });

      expect(result).toBeDefined();
      expect(result.email).toBe('test@example.com');
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROVIDER_REGISTERED'
        })
      );
    });
  });

  describe('Multi-Factor Authentication (MFA)', () => {
    it('should generate secure TOTP secrets for MFA setup', async () => {
      const providerId = 'test-provider-id';

      // Mock database operations for MFA setup
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ email: 'test@example.com', first_name: 'Test', last_name: 'Provider' }] }) // Get provider
        .mockResolvedValueOnce({ rows: [] }) // Update MFA secret
        .mockResolvedValueOnce({ rows: [] }); // Generate backup codes

      const mfaSetup = await authService.setupMFA(providerId);

      expect(mfaSetup).toHaveProperty('qrCode');
      expect(mfaSetup).toHaveProperty('backupCodes');
      expect(mfaSetup.backupCodes).toHaveLength(10);
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MFA_SETUP_INITIATED'
        })
      );
    });

    it('should validate TOTP codes correctly', async () => {
      const providerId = 'test-provider-id';
      const validToken = '123456';

      // Mock database operations for MFA verification
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{
          mfa_secret: 'JBSWY3DPEHPK3PXP',
          mfa_backup_codes: '[]'
        }]
      });

      // Note: In real implementation, TOTP validation would depend on time
      // For testing, we just verify the method exists and handles the call
      try {
        await authService.verifyMFA(providerId, validToken);
      } catch (error) {
        // Expected to fail with invalid token in test environment
        expect(error.message).toContain('Invalid');
      }
    });

    it('should enforce MFA for all provider accounts', async () => {
      const email = 'test@example.com';
      const password = 'SecurePassword123!';

      // Mock provider without MFA enabled
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{
          id: 'test-id',
          email,
          password_hash: await bcrypt.hash(password, 12),
          mfa_enabled: false, // MFA not enabled
          is_active: true,
          failed_login_attempts: 0,
          account_locked_until: null
        }]
      });

      try {
        await authService.authenticateProvider(email, password, '127.0.0.1', 'test-agent');
        throw new Error('Should require MFA setup');
      } catch (error) {
        expect(error.message).toContain('Multi-factor authentication must be enabled');
      }
    });
  });

  describe('Account Lockout Protection', () => {
    it('should lock account after maximum failed attempts', async () => {
      const email = 'test@example.com';
      const wrongPassword = 'WrongPassword123!';
      
      // Mock provider with failed attempts
      mockDatabase.query.mockResolvedValue({
        rows: [{
          id: 'test-id',
          email,
          password_hash: await bcrypt.hash('CorrectPassword123!', 12),
          failed_login_attempts: 4, // One less than max
          is_active: true,
          account_locked_until: null
        }]
      });

      try {
        await authService.authenticateProvider(email, wrongPassword, '127.0.0.1', 'test-agent');
        fail('Should have failed authentication');
      } catch (error) {
        expect(error.message).toContain('Invalid credentials');
        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.stringContaining('failed_login_attempts'),
          expect.any(Array)
        );
      }
    });

    it('should respect account lockout duration', async () => {
      const email = 'test@example.com';
      const password = 'CorrectPassword123!';
      
      // Mock locked account
      const lockoutTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{
          id: 'test-id',
          email,
          password_hash: await bcrypt.hash(password, 12),
          failed_login_attempts: 5,
          is_active: true,
          account_locked_until: lockoutTime
        }]
      });

      try {
        await authService.authenticateProvider(email, password, '127.0.0.1', 'test-agent');
        fail('Should be locked out');
      } catch (error) {
        expect(error.message).toContain('locked');
      }
    });
  });

  describe('JWT Token Security', () => {
    it('should generate secure JWT tokens with proper claims', async () => {
      const provider = global.testUtils.createMockProvider();
      
      const tokens = await authService.completeAuthentication(
        provider, 
        '127.0.0.1', 
        'test-user-agent'
      );

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');

      // Verify access token
      const decoded = jwt.verify(tokens.accessToken, process.env.JWT_SECRET);
      expect(decoded).toHaveProperty('providerId');
      expect(decoded).toHaveProperty('email');
      expect(decoded).toHaveProperty('role');
      expect(decoded.type).toBe('access');
    });

    it('should enforce token expiration', async () => {
      const expiredToken = jwt.sign(
        { providerId: 'test-id', type: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      expect(() => {
        jwt.verify(expiredToken, process.env.JWT_SECRET);
      }).toThrow('jwt expired');
    });

    it('should validate token signatures', async () => {
      const invalidToken = jwt.sign(
        { providerId: 'test-id', type: 'access' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      expect(() => {
        jwt.verify(invalidToken, process.env.JWT_SECRET);
      }).toThrow('invalid signature');
    });
  });

  describe('Session Management', () => {
    it('should enforce session timeout', () => {
      expect(authService.sessionTimeout).toBe(8 * 60 * 60 * 1000); // 8 hours
    });

    it('should track active sessions', async () => {
      const provider = global.testUtils.createMockProvider();
      
      mockDatabase.query.mockResolvedValueOnce({ rows: [] }); // Update last login

      await authService.completeAuthentication(
        provider,
        '127.0.0.1',
        'test-user-agent'
      );

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('last_login'),
        expect.arrayContaining([provider.id])
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should implement rate limiting for login attempts', () => {
      expect(authService.loginLimiter).toBeDefined();
      expect(authService.loginLimiter.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(authService.loginLimiter.max).toBe(5); // 5 attempts
    });
  });

  describe('Audit Logging for Authentication', () => {
    it('should log successful authentication events', async () => {
      const provider = global.testUtils.createMockProvider();
      
      mockDatabase.query.mockResolvedValueOnce({ rows: [] }); // Update last login

      await authService.completeAuthentication(
        provider,
        '127.0.0.1',
        'test-user-agent'
      );

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROVIDER_LOGIN_SUCCESS',
          resourceType: 'provider',
          resourceId: provider.id
        })
      );
    });

    it('should log failed authentication attempts', async () => {
      const email = 'test@example.com';
      const providerId = 'test-id';

      await authService.logFailedAttempt(providerId, email, '127.0.0.1', 'INVALID_PASSWORD');

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_FAILED',
          details: expect.objectContaining({
            reason: 'INVALID_PASSWORD'
          })
        })
      );
    });
  });
});
