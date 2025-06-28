const jwt = require('jsonwebtoken');
const authService = require('../services/authService');
const abuseDetection = require('../services/abuseDetection');
const { InputValidator } = require('./security');

// Enhanced authentication middleware
const authenticate = async (req, res, next) => {
  try {
    // Check if user is blocked
    const ipBlocked = await abuseDetection.isBlocked(req.ip);
    if (ipBlocked) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Your access has been temporarily blocked'
      });
    }
    
    // Extract token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No valid authentication token provided'
      });
    }
    
    const token = authHeader.substring(7);
    
    // Verify token
    const decoded = await authService.verifyToken(token, 'access');
    
    // Check if user is blocked
    const userBlocked = await abuseDetection.isBlocked(decoded.userId);
    if (userBlocked) {
      return res.status(403).json({
        error: 'Account blocked',
        message: 'Your account has been temporarily blocked'
      });
    }
    
    // Load user
    const User = require('../models/User');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User not found or inactive'
      });
    }
    
    // Check session validity
    if (decoded.sessionId) {
      const validSession = await authService.validateSession(decoded.sessionId);
      if (!validSession) {
        return res.status(401).json({
          error: 'Session expired',
          message: 'Your session has expired. Please login again.'
        });
      }
    }
    
    // Attach user to request
    req.user = user;
    req.token = token;
    req.tokenData = decoded;
    
    // Track API usage
    await abuseDetection.trackAction(user._id, 'apiRequests', {
      endpoint: req.path,
      method: req.method
    });
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your authentication token has expired'
      });
    }
    
    return res.status(401).json({
      error: 'Authentication failed',
      message: error.message || 'Invalid authentication token'
    });
  }
};

// Multi-factor authentication middleware
const requireMFA = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user.mfaEnabled) {
      return next(); // MFA not enabled for this user
    }
    
    const mfaToken = req.headers['x-mfa-token'];
    if (!mfaToken) {
      return res.status(401).json({
        error: 'MFA required',
        message: 'Multi-factor authentication token required',
        mfaRequired: true
      });
    }
    
    // Verify MFA token
    try {
      const verified = await authService.verifyMFA(user._id, mfaToken);
      if (!verified) {
        throw new Error('Invalid MFA token');
      }
    } catch (error) {
      await abuseDetection.trackAction(user._id, 'mfaAttempts', {
        success: false
      });
      
      return res.status(401).json({
        error: 'MFA failed',
        message: 'Invalid multi-factor authentication token'
      });
    }
    
    next();
  } catch (error) {
    console.error('MFA error:', error);
    return res.status(500).json({
      error: 'MFA error',
      message: 'Multi-factor authentication verification failed'
    });
  }
};

// Role-based access control
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this resource'
      });
    }
    
    next();
  };
};

// Tier-based access control
const requireTier = (minTier) => {
  const tierLevels = {
    free: 0,
    supporter: 1,
    superfan: 2
  };
  
  return (req, res, next) => {
    const userTier = req.user.subscription?.tier || 'free';
    const userLevel = tierLevels[userTier] || 0;
    const requiredLevel = tierLevels[minTier] || 0;
    
    if (userLevel < requiredLevel) {
      return res.status(403).json({
        error: 'Insufficient tier',
        message: `This feature requires ${minTier} tier or higher`,
        requiredTier: minTier,
        currentTier: userTier
      });
    }
    
    next();
  };
};

// API key authentication
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        message: 'Please provide a valid API key'
      });
    }
    
    // Validate API key format
    if (!InputValidator.validateApiKey(apiKey)) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'API key format is invalid'
      });
    }
    
    // Look up API key
    const ApiKey = require('../models/ApiKey');
    const keyDoc = await ApiKey.findOne({ 
      key: apiKey,
      isActive: true
    }).populate('user');
    
    if (!keyDoc) {
      await abuseDetection.trackAction(req.ip, 'invalidApiKey', {
        key: apiKey.substring(0, 8) + '...'
      });
      
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is invalid or inactive'
      });
    }
    
    // Check rate limits for API key
    const rateLimitCheck = await abuseDetection.trackAction(
      `apikey:${keyDoc._id}`,
      'apiKeyRequests',
      { endpoint: req.path }
    );
    
    if (rateLimitCheck.blocked) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'API key rate limit exceeded'
      });
    }
    
    // Update last used
    keyDoc.lastUsed = new Date();
    keyDoc.usageCount += 1;
    await keyDoc.save();
    
    // Attach user and API key info to request
    req.user = keyDoc.user;
    req.apiKey = keyDoc;
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'API key authentication failed'
    });
  }
};

// OAuth authentication
const authenticateOAuth = (provider) => {
  return async (req, res, next) => {
    try {
      const token = req.body.token || req.query.token;
      
      if (!token) {
        return res.status(401).json({
          error: 'OAuth token required',
          message: `Please provide a valid ${provider} OAuth token`
        });
      }
      
      // Authenticate with OAuth provider
      const user = await authService.authenticateOAuth(provider, token, req.body.profile);
      
      if (!user) {
        return res.status(401).json({
          error: 'OAuth authentication failed',
          message: `Failed to authenticate with ${provider}`
        });
      }
      
      // Generate JWT tokens
      const tokens = authService.generateTokens(user, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        provider
      });
      
      // Set user and tokens on request
      req.user = user;
      req.tokens = tokens;
      
      next();
    } catch (error) {
      console.error(`OAuth ${provider} error:`, error);
      return res.status(401).json({
        error: 'OAuth error',
        message: error.message || `OAuth authentication with ${provider} failed`
      });
    }
  };
};

// Session validation
const validateSession = async (req, res, next) => {
  try {
    const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
    
    if (!sessionId) {
      return next(); // Session optional
    }
    
    const valid = await authService.validateSession(sessionId);
    if (!valid) {
      return res.status(401).json({
        error: 'Session invalid',
        message: 'Your session has expired or is invalid'
      });
    }
    
    req.sessionId = sessionId;
    next();
  } catch (error) {
    console.error('Session validation error:', error);
    next(); // Don't block on session errors
  }
};

// Device fingerprint validation
const validateDevice = async (req, res, next) => {
  try {
    if (!req.user) {
      return next();
    }
    
    const fingerprint = authService.generateDeviceFingerprint(req);
    const deviceTracking = await abuseDetection.trackDevice(
      req.user._id,
      fingerprint,
      {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip
      }
    );
    
    req.deviceFingerprint = fingerprint;
    req.deviceTracking = deviceTracking;
    
    next();
  } catch (error) {
    console.error('Device validation error:', error);
    next(); // Don't block on device tracking errors
  }
};

// IP reputation check
const checkIPReputation = async (req, res, next) => {
  try {
    const reputation = await abuseDetection.checkIPReputation(req.ip);
    
    if (reputation.status === 'blocked') {
      return res.status(403).json({
        error: 'Access denied',
        message: reputation.reason || 'Your IP has been blocked'
      });
    }
    
    req.ipReputation = reputation;
    
    if (reputation.status === 'suspicious') {
      // Add additional security checks for suspicious IPs
      req.requireCaptcha = true;
    }
    
    next();
  } catch (error) {
    console.error('IP reputation check error:', error);
    next(); // Don't block on reputation check errors
  }
};

// Security headers for authenticated routes
const securityHeaders = (req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  
  next();
};

module.exports = {
  authenticate,
  requireMFA,
  authorize,
  requireTier,
  authenticateApiKey,
  authenticateOAuth,
  validateSession,
  validateDevice,
  checkIPReputation,
  securityHeaders,
  
  // Combined middleware for maximum security
  enhancedAuth: [
    securityHeaders,
    checkIPReputation,
    authenticate,
    validateSession,
    validateDevice
  ],
  
  // API authentication
  apiAuth: [
    securityHeaders,
    checkIPReputation,
    authenticateApiKey
  ]
};