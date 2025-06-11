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
