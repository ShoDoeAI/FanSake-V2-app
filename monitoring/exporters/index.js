const express = require('express');
const { Registry, Gauge, Counter, Histogram, Summary } = require('prom-client');
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');

const app = express();
const register = new Registry();

// Business Metrics
const activeUsers = new Gauge({
  name: 'fansake_active_users_total',
  help: 'Total number of active users',
  labelNames: ['user_type'],
  registers: [register]
});

const subscriptions = new Gauge({
  name: 'fansake_subscriptions_total',
  help: 'Total number of active subscriptions',
  labelNames: ['tier', 'status'],
  registers: [register]
});

const revenue = new Gauge({
  name: 'fansake_revenue_total',
  help: 'Total revenue in cents',
  labelNames: ['currency', 'type'],
  registers: [register]
});

const contentUploads = new Counter({
  name: 'fansake_content_uploads_total',
  help: 'Total number of content uploads',
  labelNames: ['type', 'tier'],
  registers: [register]
});

const streamingMinutes = new Counter({
  name: 'fansake_streaming_minutes_total',
  help: 'Total minutes of content streamed',
  labelNames: ['content_type'],
  registers: [register]
});

// Performance Metrics
const apiRequestDuration = new Histogram({
  name: 'fansake_api_request_duration_ms',
  help: 'API request duration in milliseconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register]
});

const databaseQueryDuration = new Histogram({
  name: 'fansake_database_query_duration_ms',
  help: 'Database query duration in milliseconds',
  labelNames: ['operation', 'collection'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500],
  registers: [register]
});

const websocketConnections = new Gauge({
  name: 'fansake_websocket_connections',
  help: 'Current WebSocket connections',
  labelNames: ['type'],
  registers: [register]
});

const cacheHitRate = new Gauge({
  name: 'fansake_cache_hit_rate',
  help: 'Cache hit rate percentage',
  labelNames: ['cache_type'],
  registers: [register]
});

// User Engagement Metrics
const messagesSent = new Counter({
  name: 'fansake_messages_sent_total',
  help: 'Total messages sent',
  labelNames: ['type'],
  registers: [register]
});

const listeningParties = new Gauge({
  name: 'fansake_listening_parties_active',
  help: 'Currently active listening parties',
  registers: [register]
});

const fanEngagementScore = new Summary({
  name: 'fansake_fan_engagement_score',
  help: 'Fan engagement score (0-100)',
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [register]
});

// Infrastructure Metrics
const errorRate = new Counter({
  name: 'fansake_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'severity'],
  registers: [register]
});

const paymentFailures = new Counter({
  name: 'fansake_payment_failures_total',
  help: 'Total payment failures',
  labelNames: ['reason', 'provider'],
  registers: [register]
});

let mongoClient, redisClient;

async function connectDatabases() {
  try {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    
    redisClient = new Redis(process.env.REDIS_URL);
    
    console.log('Connected to databases for metrics collection');
  } catch (error) {
    console.error('Failed to connect to databases:', error);
  }
}

async function collectMetrics() {
  if (!mongoClient || !redisClient) return;

  const db = mongoClient.db();

  try {
    // Collect user metrics
    const artistCount = await db.collection('users').countDocuments({ userType: 'artist' });
    const fanCount = await db.collection('users').countDocuments({ userType: 'fan' });
    activeUsers.set({ user_type: 'artist' }, artistCount);
    activeUsers.set({ user_type: 'fan' }, fanCount);

    // Collect subscription metrics
    const subscriptionStats = await db.collection('subscriptions').aggregate([
      {
        $group: {
          _id: { tier: '$tierName', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    subscriptionStats.forEach(stat => {
      subscriptions.set(
        { tier: stat._id.tier, status: stat._id.status },
        stat.count
      );
    });

    // Collect revenue metrics
    const revenueStats = await db.collection('payments').aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { currency: '$currency', type: '$type' },
          total: { $sum: '$amount' }
        }
      }
    ]).toArray();

    revenueStats.forEach(stat => {
      revenue.set(
        { currency: stat._id.currency, type: stat._id.type },
        stat.total
      );
    });

    // Collect cache metrics
    const cacheInfo = await redisClient.info('stats');
    const hitRate = parseFloat(cacheInfo.match(/keyspace_hits:(\d+)/)?.[1] || 0) /
                   (parseFloat(cacheInfo.match(/keyspace_hits:(\d+)/)?.[1] || 0) +
                    parseFloat(cacheInfo.match(/keyspace_misses:(\d+)/)?.[1] || 1)) * 100;
    
    cacheHitRate.set({ cache_type: 'redis' }, hitRate);

    // Collect listening party metrics
    const activeParties = await db.collection('listeningParties')
      .countDocuments({ status: 'active' });
    listeningParties.set(activeParties);

    // Collect engagement metrics
    const engagementScores = await db.collection('userEngagement').aggregate([
      { $sample: { size: 1000 } },
      { $project: { score: 1 } }
    ]).toArray();

    engagementScores.forEach(({ score }) => {
      fanEngagementScore.observe(score);
    });

  } catch (error) {
    console.error('Error collecting metrics:', error);
    errorRate.inc({ type: 'metrics_collection', severity: 'error' });
  }
}

// Collect metrics every 15 seconds
setInterval(collectMetrics, 15000);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    await collectMetrics();
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error.message);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    mongodb: mongoClient?.topology?.isConnected() ? 'connected' : 'disconnected',
    redis: redisClient?.status === 'ready' ? 'connected' : 'disconnected',
    uptime: process.uptime()
  };
  
  const isHealthy = health.mongodb === 'connected' && health.redis === 'connected';
  res.status(isHealthy ? 200 : 503).json(health);
});

const PORT = process.env.PORT || 9400;

connectDatabases().then(() => {
  app.listen(PORT, () => {
    console.log(`FanSake metrics exporter listening on port ${PORT}`);
  });
});