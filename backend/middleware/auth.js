const jwt = require('jsonwebtoken');
const User = require('../models/User');
const MockUser = require('../models/MockUser');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    
    // For demo/testing, use MockUser
    let user;
    if (process.env.USE_MOCK_DATA !== 'false') {
      user = MockUser.findById(decoded.userId);
    } else {
      user = await User.findById(decoded.userId).select('-password');
    }

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User not found or inactive'
      });
    }

    // Add user to request object
    req.user = user;
    next();

  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Token verification failed'
    });
  }
};

// Middleware to verify user is an artist
const requireArtist = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'User must be authenticated'
    });
  }

  if (req.user.userType !== 'artist') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'This endpoint requires artist privileges'
    });
  }

  next();
};

// Middleware to verify user is a fan
const requireFan = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'User must be authenticated'
    });
  }

  if (req.user.userType !== 'fan') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'This endpoint requires fan privileges'
    });
  }

  next();
};

// Middleware to verify user has required fan tier
const requireFanTier = (requiredTier) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated'
      });
    }

    if (req.user.userType !== 'fan') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This endpoint requires fan privileges'
      });
    }

    const { FAN_TIERS } = require('../../shared/types');
    const tierLevels = Object.values(FAN_TIERS);
    const userTierLevel = tierLevels.indexOf(req.user.fanInfo.tier);
    const requiredTierLevel = tierLevels.indexOf(requiredTier);

    if (userTierLevel < requiredTierLevel) {
      return res.status(403).json({
        error: 'Insufficient tier level',
        message: `This content requires ${requiredTier} tier or higher`,
        currentTier: req.user.fanInfo.tier,
        requiredTier
      });
    }

    next();
  };
};

// Middleware to verify user is admin
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'User must be authenticated'
    });
  }

  if (req.user.role !== 'admin' && req.user.userType !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'This endpoint requires admin privileges'
    });
  }

  next();
};

// Optional authentication - adds user to request if token is valid, but doesn't require it
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      req.user = null;
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const user = await User.findById(decoded.userId).select('-password');

    if (user && user.isActive) {
      req.user = user;
    } else {
      req.user = null;
    }

    next();

  } catch (error) {
    // If token is invalid, just set user to null and continue
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  requireArtist,
  requireFan,
  requireFanTier,
  optionalAuth,
  isAdmin
};

