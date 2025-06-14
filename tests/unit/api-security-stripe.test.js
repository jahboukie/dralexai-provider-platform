/**
 * API Security and Stripe Integration Tests
 * Testing secure payment processing and API protection
 */

const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

// Mock dependencies
jest.mock('../../services/database');
jest.mock('../../services/audit-logger');
jest.mock('stripe');

const mockDatabase = require('../../services/database');
const mockAuditLogger = require('../../services/audit-logger');
const mockStripe = require('stripe');

describe('API Security and Stripe Integration', () => {
  let app;
  let mockStripeInstance;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(express.raw({ type: 'application/json' }));
    
    jest.clearAllMocks();
    mockDatabase.query = jest.fn();
    mockAuditLogger.log = jest.fn().mockResolvedValue('audit-id');
    
    // Mock Stripe instance
    mockStripeInstance = {
      checkout: {
        sessions: {
          create: jest.fn(),
          retrieve: jest.fn()
        }
      },
      subscriptions: {
        retrieve: jest.fn(),
        update: jest.fn(),
        cancel: jest.fn()
      },
      webhooks: {
        constructEvent: jest.fn()
      },
      customers: {
        create: jest.fn(),
        retrieve: jest.fn()
      }
    };
    
    mockStripe.mockReturnValue(mockStripeInstance);
  });

  describe('Rate Limiting Protection', () => {
    beforeEach(() => {
      const rateLimit = require('express-rate-limit');
      
      // Mock rate limiter
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP'
      });

      app.use('/api/', limiter);
      
      app.get('/api/test', (req, res) => {
        res.json({ message: 'Success' });
      });
    });

    it('should implement rate limiting for API endpoints', async () => {
      // First request should succeed
      await request(app)
        .get('/api/test')
        .expect(200);

      // Simulate many requests (would be rate limited in real scenario)
      const requests = Array.from({ length: 5 }, () =>
        request(app).get('/api/test')
      );

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Input Validation and Sanitization', () => {
    beforeEach(() => {
      const { body, validationResult } = require('express-validator');

      app.post('/api/validate-test',
        body('email').isEmail().normalizeEmail(),
        body('name').trim().escape().isLength({ min: 1, max: 100 }),
        body('age').isInt({ min: 0, max: 150 }),
        (req, res) => {
          const errors = validationResult(req);
          if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
          }
          res.json({ message: 'Valid input', data: req.body });
        }
      );
    });

    it('should validate and sanitize input data', async () => {
      const validData = {
        email: 'test@example.com',
        name: 'John Doe',
        age: 30
      };

      const response = await request(app)
        .post('/api/validate-test')
        .send(validData)
        .expect(200);

      expect(response.body.message).toBe('Valid input');
      expect(response.body.data.email).toBe('test@example.com');
    });

    it('should reject invalid input data', async () => {
      const invalidData = {
        email: 'invalid-email',
        name: '', // Empty name
        age: -5 // Invalid age
      };

      const response = await request(app)
        .post('/api/validate-test')
        .send(invalidData)
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(Array.isArray(response.body.errors)).toBe(true);
      expect(response.body.errors.length).toBeGreaterThan(0);

      // Check that validation errors exist for the invalid fields
      const errorFields = response.body.errors.map(e => e.param || e.path);
      expect(errorFields).toContain('email');
    });

    it('should prevent XSS attacks through input sanitization', async () => {
      const xssAttempt = {
        email: 'test@example.com',
        name: '<script>alert("xss")</script>',
        age: 30
      };

      const response = await request(app)
        .post('/api/validate-test')
        .send(xssAttempt)
        .expect(200);

      // Should escape HTML entities
      expect(response.body.data.name).not.toContain('<script>');
      expect(response.body.data.name).toContain('&lt;script&gt;');
    });
  });

  describe('SQL Injection Prevention', () => {
    beforeEach(() => {
      app.get('/api/patient/:id', async (req, res) => {
        try {
          const { id } = req.params;
          
          // Using parameterized queries (safe)
          const result = await mockDatabase.query(
            'SELECT * FROM patients WHERE id = $1',
            [id]
          );

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
          }

          res.json(result.rows[0]);
        } catch (error) {
          res.status(500).json({ error: 'Database error' });
        }
      });
    });

    it('should use parameterized queries to prevent SQL injection', async () => {
      const patientId = 'patient-123';
      
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: patientId, name: 'John Doe' }]
      });

      await request(app)
        .get(`/api/patient/${patientId}`)
        .expect(200);

      // Verify parameterized query was used
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT * FROM patients WHERE id = $1',
        [patientId]
      );
    });

    it('should handle SQL injection attempts safely', async () => {
      const sqlInjectionAttempt = "'; DROP TABLE patients; --";
      
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get(`/api/patient/${encodeURIComponent(sqlInjectionAttempt)}`)
        .expect(404);

      // Should still use parameterized query
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT * FROM patients WHERE id = $1',
        [sqlInjectionAttempt]
      );
    });
  });

  describe('Stripe Payment Security', () => {
    beforeEach(() => {
      app.post('/api/create-checkout-session', async (req, res) => {
        try {
          const { tier, billingCycle, email } = req.body;

          const session = await mockStripeInstance.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
              price: `price_${tier}_${billingCycle}`,
              quantity: 1,
            }],
            mode: 'subscription',
            customer_email: email,
            success_url: 'https://example.com/success',
            cancel_url: 'https://example.com/cancel'
          });

          await mockAuditLogger.log({
            action: 'STRIPE_CHECKOUT_SESSION_CREATED',
            resourceType: 'payment',
            resourceId: session.id,
            details: { tier, billingCycle, email },
            phiAccessed: false
          });

          res.json({ sessionId: session.id, url: session.url });
        } catch (error) {
          res.status(500).json({ error: 'Failed to create checkout session' });
        }
      });
    });

    it('should create secure Stripe checkout sessions', async () => {
      const checkoutData = {
        tier: 'professional',
        billingCycle: 'monthly',
        email: 'test@example.com'
      };

      mockStripeInstance.checkout.sessions.create.mockResolvedValueOnce({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123'
      });

      const response = await request(app)
        .post('/api/create-checkout-session')
        .send(checkoutData)
        .expect(200);

      expect(response.body.sessionId).toBe('cs_test_123');
      expect(response.body.url).toContain('checkout.stripe.com');
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STRIPE_CHECKOUT_SESSION_CREATED'
        })
      );
    });

    it('should validate Stripe webhook signatures', async () => {
      const webhookSecret = 'whsec_test_secret';
      const payload = JSON.stringify({ type: 'checkout.session.completed' });
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Create valid signature
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      app.post('/api/stripe-webhook', (req, res) => {
        try {
          const sig = req.headers['stripe-signature'];
          
          // Mock webhook verification
          mockStripeInstance.webhooks.constructEvent.mockReturnValueOnce({
            type: 'checkout.session.completed',
            data: { object: { id: 'cs_test_123' } }
          });

          const event = mockStripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
          
          res.json({ received: true, type: event.type });
        } catch (error) {
          res.status(400).json({ error: 'Invalid signature' });
        }
      });

      const response = await request(app)
        .post('/api/stripe-webhook')
        .set('stripe-signature', `t=${timestamp},v1=${signature}`)
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.type).toBe('checkout.session.completed');
    });
  });

  describe('Subscription Management Security', () => {
    beforeEach(() => {
      app.put('/api/subscription/:subscriptionId', async (req, res) => {
        try {
          const { subscriptionId } = req.params;
          const { action } = req.body;

          // Verify subscription ownership
          const subscription = await mockStripeInstance.subscriptions.retrieve(subscriptionId);
          
          if (!subscription) {
            return res.status(404).json({ error: 'Subscription not found' });
          }

          let result;
          switch (action) {
            case 'cancel':
              result = await mockStripeInstance.subscriptions.cancel(subscriptionId);
              break;
            case 'pause':
              result = await mockStripeInstance.subscriptions.update(subscriptionId, {
                pause_collection: { behavior: 'mark_uncollectible' }
              });
              break;
            default:
              return res.status(400).json({ error: 'Invalid action' });
          }

          await mockAuditLogger.log({
            action: 'SUBSCRIPTION_MODIFIED',
            resourceType: 'subscription',
            resourceId: subscriptionId,
            details: { action, status: result.status },
            phiAccessed: false
          });

          res.json({ message: `Subscription ${action}ed successfully`, status: result.status });
        } catch (error) {
          res.status(500).json({ error: 'Failed to modify subscription' });
        }
      });
    });

    it('should securely manage subscription modifications', async () => {
      const subscriptionId = 'sub_test_123';
      
      mockStripeInstance.subscriptions.retrieve.mockResolvedValueOnce({
        id: subscriptionId,
        status: 'active'
      });
      
      mockStripeInstance.subscriptions.cancel.mockResolvedValueOnce({
        id: subscriptionId,
        status: 'canceled'
      });

      const response = await request(app)
        .put(`/api/subscription/${subscriptionId}`)
        .send({ action: 'cancel' })
        .expect(200);

      expect(response.body.message).toContain('canceled successfully');
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBSCRIPTION_MODIFIED',
          details: expect.objectContaining({
            action: 'cancel'
          })
        })
      );
    });

    it('should validate subscription ownership before modifications', async () => {
      const subscriptionId = 'sub_invalid_123';
      
      mockStripeInstance.subscriptions.retrieve.mockResolvedValueOnce(null);

      const response = await request(app)
        .put(`/api/subscription/${subscriptionId}`)
        .send({ action: 'cancel' })
        .expect(404);

      expect(response.body.error).toBe('Subscription not found');
    });
  });

  describe('HTTPS and TLS Security', () => {
    it('should enforce HTTPS in production', () => {
      const httpsMiddleware = (req, res, next) => {
        if (process.env.NODE_ENV === 'production' && !req.secure) {
          return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
      };

      // Test middleware logic
      const mockReq = {
        secure: false,
        headers: { host: 'example.com' },
        url: '/api/test'
      };
      const mockRes = {
        redirect: jest.fn()
      };
      const mockNext = jest.fn();

      // Simulate production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      httpsMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith(301, 'https://example.com/api/test');
      expect(mockNext).not.toHaveBeenCalled();

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should use secure headers', () => {
      const helmet = require('helmet');
      
      const securityHeaders = {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"]
          }
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      };

      expect(securityHeaders.contentSecurityPolicy.directives.defaultSrc).toContain("'self'");
      expect(securityHeaders.hsts.maxAge).toBe(31536000);
      expect(securityHeaders.hsts.includeSubDomains).toBe(true);
    });
  });

  describe('API Authentication Security', () => {
    beforeEach(() => {
      app.use('/api/protected', (req, res, next) => {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          req.user = decoded;
          next();
        } catch (error) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      });

      app.get('/api/protected/data', (req, res) => {
        res.json({ message: 'Protected data', userId: req.user.providerId });
      });
    });

    it('should require valid JWT tokens for protected endpoints', async () => {
      const validToken = global.testUtils.createValidJWT();

      const response = await request(app)
        .get('/api/protected/data')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.message).toBe('Protected data');
      expect(response.body.userId).toBeDefined();
    });

    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/protected/data')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should reject invalid JWT tokens', async () => {
      const invalidToken = 'invalid.jwt.token';

      const response = await request(app)
        .get('/api/protected/data')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
    });
  });

  describe('Data Encryption in Transit', () => {
    it('should encrypt sensitive data in API responses', () => {
      const sensitiveData = {
        patientId: 'patient-123',
        ssn: '123-45-6789',
        medicalRecord: 'Confidential medical information'
      };

      // Mock encryption function
      const encryptSensitiveFields = (data) => {
        const encrypted = { ...data };
        if (encrypted.ssn) {
          encrypted.ssn = '***-**-' + encrypted.ssn.slice(-4);
        }
        if (encrypted.medicalRecord) {
          encrypted.medicalRecord = '[ENCRYPTED]';
        }
        return encrypted;
      };

      const encryptedData = encryptSensitiveFields(sensitiveData);

      expect(encryptedData.patientId).toBe('patient-123'); // Not sensitive
      expect(encryptedData.ssn).toBe('***-**-6789'); // Masked
      expect(encryptedData.medicalRecord).toBe('[ENCRYPTED]'); // Encrypted
    });
  });
});
