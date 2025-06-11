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
