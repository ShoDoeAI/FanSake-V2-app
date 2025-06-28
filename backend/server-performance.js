require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const http = require('http');
const compression = require('compression');
const morgan = require('morgan');
const responseTime = require('response-time');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Performance monitoring
const { StatsD } = require('node-statsd');
const statsd = new StatsD({
  host: process.env.STATSD_HOST || 'localhost',
  port: process.env.STATSD_PORT || 8125,
  prefix: 'musicconnect.',
});

// Cache middleware
const apicache = require('apicache');
const cache = apicache.middleware;

// Import routes
const authRoutes = require('./routes/auth');
const artistRoutes = require('./routes/artists');
const fanRoutes = require('./routes/fans');
const communityRoutes = require('./routes/community');
const discoveryRoutes = require('./routes/discovery');
const uploadRoutes = require('./routes/uploads');
const messagingRoutes = require('./routes/messaging');

// Import services
const { initializeWebSocket } = require('./websocket');
const redisClient = require('./config/redis');
const engagementEngine = require('./services/engagementEngine');
const analyticsService = require('./services/analyticsService');
const cacheService = require('./services/cacheService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

// Response time tracking
app.use(responseTime((req, res, time) => {
  const stat = `response_time.${req.method}.${req.route?.path || 'unknown'}`;
  statsd.timing(stat, time);
}));

// Security middleware with optimized settings
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// Advanced compression with Brotli support
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
}));

// Conditional logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400,
    stream: {
      write: (message) => {
        console.log(message);
        // Log to file or external service
      },
    },
  }));
}

// Enhanced rate limiting with Redis store
const RedisStore = require('rate-limit-redis');
const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:',
  }),
  windowMs: 1 * 60 * 1000,
  max: process.env.MAX_REQUESTS_PER_MINUTE || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for whitelisted IPs
    const whitelist = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
    return whitelist.includes(req.ip);
  },
});

// API-specific rate limits
const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
});

// CORS with caching
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  maxAge: 86400, // 24 hours
}));

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with caching
app.use('/uploads', express.static('uploads', {
  maxAge: '30d',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.jpg') || path.endsWith('.png') || path.endsWith('.webp')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// MongoDB connection with connection pooling
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/musicconnect', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 50,
  minPoolSize: 10,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
})
.then(() => console.log('✅ Connected to MongoDB with connection pooling'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Redis connection is handled in config/redis.js

// API Routes with caching
app.use('/api/auth', authRoutes);
app.use('/api/artists', cache('5 minutes'), artistRoutes);
app.use('/api/fans', cache('5 minutes'), fanRoutes);
app.use('/api/community', cache('2 minutes'), communityRoutes);
app.use('/api/discovery', cache('10 minutes'), discoveryRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/messages', messagingRoutes);

// Performance monitoring endpoint
app.get('/api/metrics', (req, res) => {
  const metrics = {
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
    connections: mongoose.connections[0].readyState,
    cache: cacheService.getStats(),
  };
  res.json(metrics);
});

// Health check with dependency checks
app.get('/api/health', async (req, res) => {
  const checks = {
    api: 'OK',
    database: mongoose.connection.readyState === 1 ? 'OK' : 'ERROR',
    redis: redisClient.status === 'ready' ? 'OK' : 'ERROR',
    timestamp: new Date().toISOString(),
  };
  
  const status = Object.values(checks).every(v => v === 'OK' || typeof v === 'string') ? 200 : 503;
  res.status(status).json(checks);
});

// CDN proxy for static assets
if (process.env.CDN_URL) {
  app.use('/cdn', createProxyMiddleware({
    target: process.env.CDN_URL,
    changeOrigin: true,
    pathRewrite: { '^/cdn': '' },
  }));
}

// Error handling with request tracking
app.use((err, req, res, next) => {
  const errorId = Date.now().toString(36);
  console.error(`Error ${errorId}:`, err.stack);
  
  statsd.increment('errors', 1, [`route:${req.path}`, `method:${req.method}`]);
  
  res.status(err.status || 500).json({ 
    error: 'Something went wrong!',
    errorId,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize WebSocket with optimizations
initializeWebSocket(server, {
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    threshold: 1024,
  },
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  await mongoose.connection.close();
  await redisClient.quit();
  
  process.exit(0);
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 MusicConnect Performance-Optimized API server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket server initialized with compression`);
  console.log(`📊 Performance monitoring enabled`);
  
  // Schedule background tasks
  engagementEngine.scheduleEngagementReminders();
  
  // Warm up cache
  if (process.env.NODE_ENV === 'production') {
    cacheService.warmUpCache();
  }
});

module.exports = { app, server };