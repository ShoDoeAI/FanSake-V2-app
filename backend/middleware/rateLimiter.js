const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const { redis: redisConfig } = require('../config/redis');

// Create Redis client for rate limiting
const redisClient = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1
});

// Tier-based rate limit configurations
const rateLimitTiers = {
  free: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many requests from this IP. Please upgrade to increase your rate limits.'
  },
  supporter: {
    windowMs: 15 * 60 * 1000,
    max: 500, // 500 requests per window
    message: 'Rate limit exceeded for supporter tier.'
  },
  superfan: {
    windowMs: 15 * 60 * 1000,
    max: 2000, // 2000 requests per window
    message: 'Rate limit exceeded for superfan tier.'
  },
  artist: {
    windowMs: 15 * 60 * 1000,
    max: 5000, // 5000 requests per window
    message: 'Rate limit exceeded for artist tier.'
  }
};

// API endpoint-specific rate limits
const endpointLimits = {
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: 'Too many authentication attempts. Please try again later.'
  },
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Upload limit reached. Please try again later.'
  },
  streaming: {
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'Streaming rate limit exceeded.'
  },
  messaging: {
    windowMs: 60 * 1000,
    max: 60,
    message: 'Message rate limit exceeded.'
  },
  api: {
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'API rate limit exceeded.'
  }
};

// DDoS protection - strict limits for non-authenticated requests
const ddosProtection = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute for non-authenticated users
  message: 'Too many requests. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    client: redisClient,
    prefix: 'ddos:'
  }),
  skip: (req) => req.user && req.user.verified // Skip for verified users
});

// Create tier-based rate limiter
const createTierLimiter = (tier) => {
  const config = rateLimitTiers[tier] || rateLimitTiers.free;
  
  return rateLimit({
    ...config,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      client: redisClient,
      prefix: `tier:${tier}:`
    }),
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      return req.user ? `user:${req.user.id}` : req.ip;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: config.message,
        retryAfter: req.rateLimit.resetTime,
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        tier: tier
      });
    }
  });
};

// Create endpoint-specific rate limiters
const createEndpointLimiter = (endpoint) => {
  const config = endpointLimits[endpoint] || endpointLimits.api;
  
  return rateLimit({
    ...config,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      client: redisClient,
      prefix: `endpoint:${endpoint}:`
    }),
    keyGenerator: (req) => {
      return req.user ? `user:${req.user.id}` : req.ip;
    }
  });
};

// Middleware to apply tier-based rate limiting
const applyTierRateLimit = (req, res, next) => {
  let tier = 'free';
  
  if (req.user) {
    if (req.user.role === 'artist') {
      tier = 'artist';
    } else if (req.user.subscription) {
      tier = req.user.subscription.tier || 'free';
    }
  }
  
  const limiter = createTierLimiter(tier);
  limiter(req, res, next);
};

// Rate limit by request cost (for expensive operations)
const costBasedRateLimit = (cost = 1) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const key = `cost:${req.user.id}`;
    const limit = req.user.subscription?.tier === 'superfan' ? 10000 : 
                  req.user.subscription?.tier === 'supporter' ? 5000 : 1000;
    
    try {
      const current = await redisClient.incrby(key, cost);
      
      if (current === cost) {
        // First request, set expiry
        await redisClient.expire(key, 3600); // 1 hour window
      }
      
      if (current > limit) {
        return res.status(429).json({
          error: 'Request cost limit exceeded',
          limit: limit,
          windowReset: Date.now() + (await redisClient.ttl(key)) * 1000
        });
      }
      
      res.setHeader('X-RateLimit-Cost', cost);
      res.setHeader('X-RateLimit-Cost-Limit', limit);
      res.setHeader('X-RateLimit-Cost-Remaining', limit - current);
      
      next();
    } catch (error) {
      console.error('Cost-based rate limit error:', error);
      next(); // Don't block on Redis errors
    }
  };
};

// IP-based rate limiting for specific IPs
const ipRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  message: 'Too many requests from this IP address',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    client: redisClient,
    prefix: 'ip:'
  }),
  keyGenerator: (req) => req.ip
});

// Monitor rate limit violations
const monitorRateLimits = async (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode === 429) {
      const user = req.user ? req.user.id : 'anonymous';
      const endpoint = req.originalUrl;
      
      // Log rate limit violation
      console.warn('Rate limit violation:', {
        user,
        ip: req.ip,
        endpoint,
        timestamp: new Date().toISOString()
      });
      
      // Could also emit metrics or alerts here
    }
  });
  next();
};

module.exports = {
  ddosProtection,
  applyTierRateLimit,
  createEndpointLimiter,
  costBasedRateLimit,
  ipRateLimit,
  monitorRateLimits,
  
  // Specific endpoint limiters
  authLimiter: createEndpointLimiter('auth'),
  uploadLimiter: createEndpointLimiter('upload'),
  streamingLimiter: createEndpointLimiter('streaming'),
  messagingLimiter: createEndpointLimiter('messaging'),
  apiLimiter: createEndpointLimiter('api')
};