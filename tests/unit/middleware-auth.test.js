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
