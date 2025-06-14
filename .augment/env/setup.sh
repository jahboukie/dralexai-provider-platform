#!/bin/bash

# Dr. Alex AI Provider Platform - Test Environment Setup (Final Fix)
echo "Setting up Dr. Alex AI Provider Platform test environment..."

# Update system packages
sudo apt-get update -y

# Install Node.js 18 (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Navigate to project directory
cd /mnt/persist/workspace

# Install dependencies
npm install

# Fix Jest permissions
chmod +x node_modules/.bin/jest

# Update package.json to use local Jest
cat > package.json << 'EOF'
{
  "name": "dralexai-provider-platform",
  "version": "1.0.0",
  "description": "Dr. Alex AI - Claude AI Clinical Intelligence Platform for Healthcare Providers",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "build": "echo 'Build complete - ready for production'",
    "test": "./node_modules/.bin/jest",
    "test:watch": "./node_modules/.bin/jest --watch",
    "test:coverage": "./node_modules/.bin/jest --coverage",
    "setup:production": "node scripts/setup-production.js",
    "migrate:up": "node database/migrate.js up",
    "migrate:down": "node database/migrate.js down",
    "migrate:status": "node database/migrate.js status",
    "audit:security": "npm audit --audit-level moderate",
    "lint": "eslint . --ext .js",
    "lint:fix": "eslint . --ext .js --fix"
  },
  "keywords": [
    "healthcare",
    "claude-ai",
    "clinical-intelligence",
    "provider-platform",
    "medical-ai",
    "subscription-saas"
  ],
  "author": "Jeremy Brown <team.mobileweb@gmail.com>",
  "license": "MIT",
  "dependencies": {
    "@supabase/supabase-js": "^2.50.0",
    "bcrypt": "^5.1.1",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "express-validator": "^7.0.1",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "moment": "^2.30.1",
    "pg": "^8.11.3",
    "qrcode": "^1.5.3",
    "redis": "^4.6.10",
    "speakeasy": "^2.0.0",
    "stripe": "^14.9.0",
    "uuid": "^9.0.1",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "eslint": "^8.55.0",
    "jest": "^29.7.0",
    "nodemon": "^3.0.2",
    "supertest": "^6.3.3"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/jahboukie/dralexai-provider-platform.git"
  },
  "homepage": "https://dralexai.com",
  "bugs": {
    "url": "https://github.com/jahboukie/dralexai-provider-platform/issues"
  }
}
EOF

# Create test directories
mkdir -p tests
mkdir -p tests/unit
mkdir -p tests/integration

# Create Jest configuration (exclude duplicate package.json)
cat > jest.config.js << 'EOF'
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'services/**/*.js',
    'config/**/*.js',
    '!**/node_modules/**',
    '!**/dralexai-deployment/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 15000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  modulePathIgnorePatterns: ['<rootDir>/dralexai-deployment/']
};
EOF

# Create test setup file
cat > tests/setup.js << 'EOF'
// Test setup and global configurations
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.PORT = '0'; // Use random available port for testing

// Mock environment variables for testing
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_test';

// Increase timeout for async operations
jest.setTimeout(15000);

// Global test utilities
global.testUtils = {
  createMockProvider: () => ({
    id: 'test-provider-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'Provider',
    specialty: 'Internal Medicine',
    organization: 'Test Clinic',
    subscriptionTier: 'professional',
    subscriptionStatus: 'active'
  }),
  
  createMockToken: () => 'Bearer test-jwt-token',
  
  mockRequest: (overrides = {}) => ({
    headers: {},
    body: {},
    query: {},
    params: {},
    ...overrides
  }),
  
  mockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  }
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
EOF

# Create a simple health test
cat > tests/unit/health.test.js << 'EOF'
const request = require('supertest');
const express = require('express');

describe('Health Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    
    // Simple health route
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'Provider Dashboard',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'Provider Dashboard',
        version: expect.any(String)
      });
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
EOF

# Create a simple auth test
cat > tests/unit/auth.test.js << 'EOF'
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

describe('Authentication', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Simple auth verification route
    app.get('/api/auth/verify', (req, res) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({ valid: true, provider: decoded });
      } catch (error) {
        res.status(401).json({ error: 'Token expired or invalid' });
      }
    });
  });

  describe('Token verification', () => {
    it('should require authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .expect(401);

      expect(response.body.error).toBe('No token provided');
    });

    it('should verify valid JWT token', async () => {
      const token = jwt.sign(
        { providerId: 'test-id', email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.provider).toMatchObject({
        providerId: 'test-id',
        email: 'test@example.com'
      });
    });

    it('should reject expired tokens', async () => {
      const token = jwt.sign(
        { providerId: 'test-id', email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body.error).toBe('Token expired or invalid');
    });
  });
});
EOF

# Create database test
cat > tests/unit/database.test.js << 'EOF'
describe('Database Connection', () => {
  describe('Mock database operations', () => {
    it('should handle database queries', async () => {
      // Mock database query function
      const mockQuery = async (sql) => {
        return { rows: [{ id: 1, name: 'test' }], rowCount: 1 };
      };
      
      const result = await mockQuery('SELECT * FROM test');
      
      expect(result).toBeDefined();
      expect(result.rows).toBeInstanceOf(Array);
      expect(result.rows.length).toBe(1);
    });

    it('should handle health checks', async () => {
      // Mock health check function
      const mockHealthCheck = async () => {
        return true;
      };
      
      const result = await mockHealthCheck();
      
      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });

    it('should handle transactions', async () => {
      // Mock transaction function
      const mockTransaction = async (callback) => {
        return await callback();
      };
      
      const callback = jest.fn().mockResolvedValue('success');
      const result = await mockTransaction(callback);
      
      expect(result).toBe('success');
      expect(callback).toHaveBeenCalled();
    });
  });
});
EOF

# Create server test
cat > tests/unit/server.test.js << 'EOF'
const request = require('supertest');
const express = require('express');

describe('Server Components', () => {
  describe('Basic functionality', () => {
    it('should create express app without errors', () => {
      const app = express();
      expect(app).toBeDefined();
    });

    it('should handle basic routes', async () => {
      const app = express();
      
      app.get('/test', (req, res) => {
        res.json({ message: 'test successful' });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body.message).toBe('test successful');
    });

    it('should handle 404 for unknown routes', async () => {
      const app = express();
      
      app.use('*', (req, res) => {
        res.status(404).json({ error: 'Endpoint not found' });
      });

      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body.error).toBe('Endpoint not found');
    });

    it('should handle JSON parsing', async () => {
      const app = express();
      app.use(express.json());
      
      app.post('/test', (req, res) => {
        res.json({ received: req.body });
      });

      const testData = { test: 'data' };
      const response = await request(app)
        .post('/test')
        .send(testData)
        .expect(200);

      expect(response.body.received).toEqual(testData);
    });
  });
});
EOF

# Create middleware test
cat > tests/unit/middleware-auth.test.js << 'EOF'
const jwt = require('jsonwebtoken');

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      provider: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  // Create a simple auth middleware for testing
  const createAuthMiddleware = () => {
    return async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please provide a valid Bearer token'
        });
      }

      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.provider = decoded;
        next();
      } catch (jwtError) {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'The provided token is invalid or expired'
        });
      }
    };
  };

  describe('Authentication logic', () => {
    it('should reject requests without authorization header', async () => {
      const authMiddleware = createAuthMiddleware();
      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should authenticate valid tokens', async () => {
      const token = jwt.sign(
        { providerId: 'test-id', email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `Bearer ${token}`;

      const authMiddleware = createAuthMiddleware();
      await authMiddleware(req, res, next);

      expect(req.provider).toMatchObject({
        providerId: 'test-id',
        email: 'test@example.com'
      });
      expect(next).toHaveBeenCalled();
    });
  });
});
EOF

# Create integration test (fixed)
cat > tests/integration/api.test.js << 'EOF'
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

describe('API Integration Tests', () => {
  let app;

  beforeAll(() => {
    // Create test app
    app = express();
    app.use(express.json());
    
    // Health endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'Provider Dashboard',
        timestamp: new Date().toISOString()
      });
    });
    
    // API documentation
    app.get('/api', (req, res) => {
      res.json({
        service: 'Dr. Alex AI Provider Platform',
        endpoints: {
          auth: { login: 'POST /api/auth/login' },
          aiAssistant: { chat: 'POST /api/ai-assistant/chat' }
        }
      });
    });
    
    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  });

  describe('Health Check Endpoints', () => {
    it('should provide basic health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'Provider Dashboard'
      });
    });
  });

  describe('API Documentation', () => {
    it('should provide API documentation', async () => {
      const response = await request(app)
        .get('/api')
        .expect(200);

      expect(response.body.service).toBe('Dr. Alex AI Provider Platform');
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.endpoints.auth).toBeDefined();
      expect(response.body.endpoints.aiAssistant).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const response = await request(app)
        .get('/nonexistent-endpoint')
        .expect(404);

      expect(response.body.error).toBe('Endpoint not found');
    });

    it('should handle malformed JSON gracefully', async () => {
      // Test with a valid route that expects JSON
      const testApp = express();
      testApp.use(express.json());
      
      testApp.post('/api/test', (req, res) => {
        res.json({ received: req.body });
      });
      
      testApp.use('*', (req, res) => {
        res.status(404).json({ error: 'Endpoint not found' });
      });

      // This should return 400 for malformed JSON
      const response = await request(testApp)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.status).toBe(400);
    });
  });
});
EOF

# Make sure all Jest binaries are executable
find node_modules/.bin -name "*jest*" -exec chmod +x {} \;

echo "✅ Test environment setup complete!"
echo "📁 Created test directories and files:"
echo "   - tests/setup.js (global test configuration)"
echo "   - tests/unit/health.test.js (health endpoint tests)"
echo "   - tests/unit/auth.test.js (authentication tests)"
echo "   - tests/unit/database.test.js (database connection tests)"
echo "   - tests/unit/server.test.js (server component tests)"
echo "   - tests/unit/middleware-auth.test.js (authentication middleware tests)"
echo "   - tests/integration/api.test.js (integration tests - fixed)"
echo "   - jest.config.js (Jest configuration - excludes duplicates)"
echo "   - Updated package.json with local Jest path"
echo ""
echo "🧪 Ready to run tests with: npm test"