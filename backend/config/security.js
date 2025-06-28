// Security configuration for MusicConnect
module.exports = {
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex'),
    refreshSecret: process.env.JWT_REFRESH_SECRET || require('crypto').randomBytes(64).toString('hex'),
    accessExpiry: '15m',
    refreshExpiry: '7d',
    issuer: 'musicconnect',
    audience: 'musicconnect-api'
  },

  // Rate Limiting Configuration
  rateLimiting: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    },
    tiers: {
      free: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 100
      },
      supporter: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 500
      },
      superfan: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 2000
      },
      artist: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 5000
      }
    }
  },

  // Content Security Configuration
  contentSecurity: {
    drm: {
      enabled: process.env.DRM_ENABLED === 'true',
      masterKey: process.env.DRM_MASTER_KEY,
      algorithm: 'aes-256-gcm'
    },
    watermarking: {
      enabled: process.env.WATERMARK_ENABLED !== 'false',
      audioFrequency: 18000,
      imageOpacity: 0.01
    },
    fingerprinting: {
      enabled: process.env.FINGERPRINT_ENABLED !== 'false'
    }
  },

  // Data Protection Configuration
  dataProtection: {
    encryption: {
      enabled: process.env.ENCRYPTION_ENABLED !== 'false',
      key: process.env.DATA_ENCRYPTION_KEY,
      algorithm: 'aes-256-gcm'
    },
    gdpr: {
      enabled: process.env.GDPR_ENABLED !== 'false',
      dataRetention: {
        messages: 365,
        logs: 90,
        analytics: 730,
        inactiveUsers: 1095
      }
    },
    pii: {
      encryptedFields: ['email', 'phone', 'dateOfBirth', 'creditCard', 'bankAccount'],
      hashedFields: ['email', 'phone']
    }
  },

  // Authentication Configuration
  authentication: {
    mfa: {
      enabled: process.env.MFA_ENABLED !== 'false',
      issuer: 'MusicConnect',
      window: 2
    },
    oauth: {
      google: {
        enabled: process.env.GOOGLE_OAUTH_ENABLED === 'true',
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET
      },
      spotify: {
        enabled: process.env.SPOTIFY_OAUTH_ENABLED === 'true',
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
      }
    },
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: true,
      preventReuse: 5
    },
    lockout: {
      maxAttempts: 5,
      duration: 30 * 60 * 1000 // 30 minutes
    }
  },

  // Security Headers Configuration
  headers: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "wss:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:"],
        frameSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  },

  // CORS Configuration
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    maxAge: 86400
  },

  // Session Configuration
  session: {
    secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'),
    name: 'musicconnect.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    }
  },

  // Abuse Detection Configuration
  abuseDetection: {
    enabled: process.env.ABUSE_DETECTION_ENABLED !== 'false',
    thresholds: {
      loginAttempts: { count: 5, window: 900 },
      passwordReset: { count: 3, window: 3600 },
      apiRequests: { count: 1000, window: 3600 },
      fileUploads: { count: 10, window: 3600 },
      messageSpam: { count: 50, window: 300 }
    }
  },

  // API Security Configuration
  api: {
    requireHttps: process.env.NODE_ENV === 'production',
    apiKeyLength: 32,
    apiKeyPrefix: 'mck_',
    maxRequestSize: '10mb',
    timeout: 30000
  },

  // File Upload Security
  upload: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedMimeTypes: {
      audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      video: ['video/mp4', 'video/webm', 'video/ogg']
    },
    scanForVirus: process.env.VIRUS_SCAN_ENABLED === 'true'
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    sensitiveFields: ['password', 'token', 'apiKey', 'creditCard', 'ssn'],
    retentionDays: 90
  },

  // WAF Configuration
  waf: {
    enabled: process.env.WAF_ENABLED !== 'false',
    blockSuspiciousUserAgents: true,
    blockSqlInjection: true,
    blockXss: true,
    blockPathTraversal: true
  }
};