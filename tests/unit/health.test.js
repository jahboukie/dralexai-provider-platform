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
