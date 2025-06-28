const redis = require('redis');
const { promisify } = require('util');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379
        },
        password: process.env.REDIS_PASSWORD || undefined,
        database: process.env.REDIS_DB || 0
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.isConnected = true;
      });

      await this.client.connect();

      // Promisify Redis commands for async/await
      this.getAsync = promisify(this.client.get).bind(this.client);
      this.setAsync = promisify(this.client.set).bind(this.client);
      this.delAsync = promisify(this.client.del).bind(this.client);
      this.existsAsync = promisify(this.client.exists).bind(this.client);
      this.expireAsync = promisify(this.client.expire).bind(this.client);
      this.ttlAsync = promisify(this.client.ttl).bind(this.client);
      this.incrAsync = promisify(this.client.incr).bind(this.client);
      this.decrAsync = promisify(this.client.decr).bind(this.client);
      this.hgetAsync = promisify(this.client.hget).bind(this.client);
      this.hsetAsync = promisify(this.client.hset).bind(this.client);
      this.hgetallAsync = promisify(this.client.hgetall).bind(this.client);
      this.zaddAsync = promisify(this.client.zadd).bind(this.client);
      this.zrangeAsync = promisify(this.client.zrange).bind(this.client);

      return this.client;
    } catch (error) {
      console.error('Redis connection error:', error);
      throw error;
    }
  }

  // Cache management methods
  async cacheGet(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Redis get error for key ${key}:`, error);
      return null;
    }
  }

  async cacheSet(key, value, ttlSeconds = 3600) {
    try {
      const stringValue = JSON.stringify(value);
      await this.client.setEx(key, ttlSeconds, stringValue);
      return true;
    } catch (error) {
      console.error(`Redis set error for key ${key}:`, error);
      return false;
    }
  }

  async cacheDelete(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`Redis delete error for key ${key}:`, error);
      return false;
    }
  }

  // Pattern-based cache invalidation
  async invalidatePattern(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error(`Redis pattern delete error for ${pattern}:`, error);
      return false;
    }
  }

  // Session management
  async getSession(sessionId) {
    return this.cacheGet(`session:${sessionId}`);
  }

  async setSession(sessionId, data, ttlSeconds = 86400) { // 24 hours default
    return this.cacheSet(`session:${sessionId}`, data, ttlSeconds);
  }

  async deleteSession(sessionId) {
    return this.cacheDelete(`session:${sessionId}`);
  }

  // Artist profile caching
  async getArtistProfile(artistId) {
    return this.cacheGet(`artist:profile:${artistId}`);
  }

  async setArtistProfile(artistId, profile, ttlSeconds = 3600) { // 1 hour
    return this.cacheSet(`artist:profile:${artistId}`, profile, ttlSeconds);
  }

  async invalidateArtistProfile(artistId) {
    return this.cacheDelete(`artist:profile:${artistId}`);
  }

  // Trending data caching
  async getTrending(genre, timeframe = 'daily') {
    return this.cacheGet(`trending:${genre}:${timeframe}`);
  }

  async setTrending(genre, timeframe, data, ttlSeconds = 300) { // 5 minutes
    return this.cacheSet(`trending:${genre}:${timeframe}`, data, ttlSeconds);
  }

  // Play count tracking
  async incrementPlayCount(trackId) {
    const today = new Date().toISOString().split('T')[0];
    const key = `plays:${trackId}:${today}`;
    await this.client.incr(key);
    await this.client.expire(key, 86400 * 7); // Keep for 7 days
  }

  // Fan activity tracking
  async trackFanActivity(userId, activity) {
    const key = `fan:activity:${userId}`;
    const timestamp = Date.now();
    await this.client.hSet(key, timestamp.toString(), JSON.stringify(activity));
    await this.client.expire(key, 3600); // 1 hour
  }

  // Real-time metrics
  async incrementMetric(metric, value = 1) {
    const key = `metrics:${metric}:${new Date().toISOString().split('T')[0]}`;
    await this.client.incrBy(key, value);
    await this.client.expire(key, 86400 * 30); // Keep for 30 days
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

// Create singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;