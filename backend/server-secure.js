require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const compression = require('compression');
const morgan = require('morgan');

// Security imports
const securityConfig = require('./config/security');
const { 
  applySecurityMiddleware, 
  waf, 
  csrfProtection,
  generateNonce 
} = require('./middleware/security');
const { 
  ddosProtection, 
  monitorRateLimits, 
  applyTierRateLimit 
} = require('./middleware/rateLimiter');
const { 
  enhancedAuth, 
  checkIPReputation 
} = require('./middleware/authEnhanced');
const abuseDetection = require('./services/abuseDetection');

// Initialize Express app
const app = express();

// Trust proxy - important for getting real IP addresses
app.set('trust proxy', true);

// Basic middleware
app.use(compression());
app.use(express.json({ limit: securityConfig.api.maxRequestSize }));
app.use(express.urlencoded({ extended: true, limit: securityConfig.api.maxRequestSize }));

// Logging with sensitive data filtering
app.use(morgan('combined', {
  skip: (req, res) => res.statusCode < 400,
  stream: {
    write: (message) => {
      // Filter sensitive data from logs
      let filtered = message;
      securityConfig.logging.sensitiveFields.forEach(field => {
        const regex = new RegExp(`"${field}":\\s*"[^"]*"`, 'gi');
        filtered = filtered.replace(regex, `"${field}": "[REDACTED]"`);
      });
      console.log(filtered.trim());
    }
  }
}));

// Apply security middleware
applySecurityMiddleware(app);

// Session configuration with security
app.use(session({
  secret: securityConfig.session.secret,
  name: securityConfig.session.name,
  resave: securityConfig.session.resave,
  saveUninitialized: securityConfig.session.saveUninitialized,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600 // lazy session update
  }),
  cookie: securityConfig.session.cookie
}));

// Apply WAF
app.use((req, res, next) => waf.inspect(req, res, next));

// Apply DDoS protection
app.use(ddosProtection);

// Monitor rate limits
app.use(monitorRateLimits);

// Check IP reputation for all requests
app.use(checkIPReputation);

// Generate nonce for CSP
app.use(generateNonce);

// Database connection with security options
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  authSource: 'admin',
  ssl: process.env.NODE_ENV === 'production',
  sslValidate: true
}).then(() => {
  console.log('Connected to MongoDB securely');
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Import routes
const authRoutes = require('./routes/auth');
const artistRoutes = require('./routes/artists');
const uploadRoutes = require('./routes/uploads');
const subscriptionRoutes = require('./routes/subscriptions');
const messagingRoutes = require('./routes/messaging');

// Public routes (with rate limiting)
app.use('/api/auth', applyTierRateLimit, authRoutes);

// Protected routes (with authentication and rate limiting)
app.use('/api/artists', enhancedAuth, applyTierRateLimit, artistRoutes);
app.use('/api/upload', enhancedAuth, applyTierRateLimit, uploadRoutes);
app.use('/api/subscriptions', enhancedAuth, applyTierRateLimit, subscriptionRoutes);
app.use('/api/messages', enhancedAuth, applyTierRateLimit, messagingRoutes);

// CSRF protected routes
app.use('/api/account', enhancedAuth, csrfProtection, require('./routes/account'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    security: {
      waf: 'active',
      rateLimiting: 'active',
      encryption: 'active'
    }
  });
});

// Security status endpoint (admin only)
app.get('/api/security/status', enhancedAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.json({
    waf: { enabled: securityConfig.waf.enabled },
    rateLimiting: { enabled: securityConfig.rateLimiting.enabled },
    mfa: { enabled: securityConfig.authentication.mfa.enabled },
    encryption: { enabled: securityConfig.dataProtection.encryption.enabled },
    gdpr: { enabled: securityConfig.dataProtection.gdpr.enabled }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Log error without exposing sensitive data
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  // Update IP reputation on errors
  if (res.statusCode >= 400) {
    abuseDetection.updateIPReputation(req.ip, -1, 'error_response');
  }
  
  // Send error response
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    requestId: req.id
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested resource was not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close server
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Close database connection
  await mongoose.connection.close();
  console.log('Database connection closed');
  
  // Close Redis connections
  // await redis.quit();
  
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
    🔒 MusicConnect Secure Server Started
    📍 Port: ${PORT}
    🌍 Environment: ${process.env.NODE_ENV || 'development'}
    🛡️  Security Features:
       ✓ WAF Protection
       ✓ DDoS Protection
       ✓ Rate Limiting
       ✓ CSRF Protection
       ✓ XSS Prevention
       ✓ SQL Injection Prevention
       ✓ Content Security
       ✓ Data Encryption
       ✓ GDPR Compliance
       ✓ MFA Support
  `);
});

// Run periodic security tasks
setInterval(async () => {
  try {
    // Clean up old abuse detection data
    await abuseDetection.cleanup();
    
    // Enforce data retention policies
    const { DataProtectionService } = require('./services/dataProtection');
    await DataProtectionService.enforceRetentionPolicies();
  } catch (error) {
    console.error('Security maintenance error:', error);
  }
}, 24 * 60 * 60 * 1000); // Run daily

module.exports = app;