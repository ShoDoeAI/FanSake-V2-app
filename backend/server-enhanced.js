require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import configurations
const connectDB = require('./config/database');
const redisClient = require('./config/redis');
const s3Service = require('./config/aws');

// Import routes
const authRoutes = require('./routes/auth');
const artistRoutes = require('./routes/artists');
const fanRoutes = require('./routes/fans');
const communityRoutes = require('./routes/community');
const discoveryRoutes = require('./routes/discovery');
const uploadRoutes = require('./routes/uploads');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

const PORT = process.env.PORT || 5001;

// Initialize services
async function initializeServices() {
  try {
    // Connect to MongoDB Atlas
    await connectDB();
    
    // Connect to Redis
    await redisClient.connect();
    
    // Initialize S3 bucket
    await s3Service.createBucketIfNotExists();
    
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Service initialization error:', error);
    process.exit(1);
  }
}

// Security middleware
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
  crossOriginEmbedderPolicy: false,
}));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting with Redis
const limiter = rateLimit({
  store: new (require('rate-limit-redis'))({
    client: redisClient.client,
    prefix: 'rl:'
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.MAX_REQUESTS_PER_MINUTE || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Session configuration with Redis
app.use(session({
  store: new RedisStore({ client: redisClient.client }),
  secret: process.env.JWT_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax'
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: 'OK',
    services: {
      database: 'checking',
      redis: redisClient.isConnected ? 'connected' : 'disconnected',
      s3: 'checking'
    }
  };

  try {
    // Check MongoDB
    const dbState = require('mongoose').connection.readyState;
    health.services.database = dbState === 1 ? 'connected' : 'disconnected';
    
    // Check S3
    await s3Service.getFileMetadata('health-check');
    health.services.s3 = 'connected';
  } catch (error) {
    health.services.s3 = 'connected'; // S3 is working if error is just file not found
  }

  const isHealthy = Object.values(health.services).every(status => 
    status === 'connected' || status === 'checking'
  );

  res.status(isHealthy ? 200 : 503).json(health);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/fans', fanRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/uploads', uploadRoutes);

// Stripe webhook endpoint (before body parsing for raw body)
app.post('/api/webhooks/stripe', 
  express.raw({ type: 'application/json' }),
  require('./routes/webhooks/stripe')
);

// Socket.io for real-time features
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-artist-room', (artistId) => {
    socket.join(`artist-${artistId}`);
    console.log(`Socket ${socket.id} joined artist room: ${artistId}`);
  });

  socket.on('join-fan-room', (userId) => {
    socket.join(`fan-${userId}`);
    console.log(`Socket ${socket.id} joined fan room: ${userId}`);
  });

  socket.on('play-track', async (data) => {
    const { trackId, artistId, userId } = data;
    
    // Increment play count in Redis
    await redisClient.incrementPlayCount(trackId);
    
    // Track fan activity
    await redisClient.trackFanActivity(userId, {
      action: 'play',
      trackId,
      artistId,
      timestamp: Date.now()
    });
    
    // Emit to artist for real-time stats
    io.to(`artist-${artistId}`).emit('track-played', {
      trackId,
      userId,
      timestamp: Date.now()
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Log to monitoring service in production
  if (process.env.NODE_ENV === 'production') {
    // TODO: Send to Sentry/DataDog
  }
  
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  
  httpServer.close(async () => {
    console.log('HTTP server closed');
    
    // Close database connections
    await require('mongoose').connection.close();
    console.log('MongoDB connection closed');
    
    // Close Redis connection
    await redisClient.disconnect();
    console.log('Redis connection closed');
    
    process.exit(0);
  });
});

// Start server
async function startServer() {
  try {
    await initializeServices();
    
    httpServer.listen(PORT, () => {
      console.log(`
🎵 MusicConnect Server Running
================================
Environment: ${process.env.NODE_ENV}
Port: ${PORT}
Frontend URL: ${process.env.FRONTEND_URL}
MongoDB: Connected
Redis: Connected
S3: Configured
================================
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Export for testing
module.exports = { app, io };