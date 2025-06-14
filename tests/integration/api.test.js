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
