require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const http = require('http');
const compression = require('compression');
const morgan = require('morgan');

// Import routes
const authRoutes = require('./routes/auth');
const artistRoutes = require('./routes/artists');
const fanRoutes = require('./routes/fans');
const communityRoutes = require('./routes/community');
const discoveryRoutes = require('./routes/discovery');
const uploadRoutes = require('./routes/uploads');
const messagingRoutes = require('./routes/messaging');
// const featureFlagsRoutes = require('./routes/featureFlags');

// Import services
const { initializeWebSocket } = require('./websocket');
// const redisClient = require('./config/redis');
// const engagementEngine = require('./services/engagementEngine');
const analyticsService = require('./services/analyticsService');
// const featureFlags = require('./services/featureFlags');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

// Security middleware
app.use(helmet());

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Rate limiting
const limiter = rateLimit({
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
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Feature flags middleware
// app.use(featureFlags.middleware());

// Static files
app.use('/uploads', express.static('uploads'));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/musicconnect', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Connect to Redis (disabled for now)
// (async () => {
//   try {
//     await redisClient.connect();
//     console.log('✅ Connected to Redis');
//   } catch (err) {
//     console.error('❌ Redis connection error:', err);
//     // Continue without Redis - it's optional for basic functionality
//   }
// })();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/fans', fanRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/messages', messagingRoutes);
// app.use('/api/features', featureFlagsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Music Discovery MVP API is running',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize WebSocket
initializeWebSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 MusicConnect API server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket server initialized`);
  
  // Schedule engagement reminders
  // engagementEngine.scheduleEngagementReminders();
});

