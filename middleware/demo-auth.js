/**
 * Demo Authentication Middleware
 * Temporary middleware for testing purposes
 */

const jwt = require('jsonwebtoken');
const logger = require('../services/logger');

const demoAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token'
      });
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
    } catch (jwtError) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided token is invalid or expired'
      });
    }

    // Add user info to request
    req.user = {
      providerId: decoded.providerId,
      email: decoded.email,
      role: decoded.role || 'provider'
    };

    next();

  } catch (error) {
    logger.error('Demo authentication error:', error);
    return res.status(500).json({
      error: 'Authentication service error',
      message: 'An error occurred during authentication'
    });
  }
};

module.exports = demoAuth;
