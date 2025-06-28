const redis = require('../config/redis');
const { promisify } = require('util');

class CacheService {
  constructor() {
    this.defaultTTL = 300; // 5 minutes
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };
    
    // Promisify Redis methods
    this.getAsync = promisify(redis.get).bind(redis);
    this.setAsync = promisify(redis.set).bind(redis);
    this.delAsync = promisify(redis.del).bind(redis);
    this.existsAsync = promisify(redis.exists).bind(redis);
    this.ttlAsync = promisify(redis.ttl).bind(redis);
    this.mgetAsync = promisify(redis.mget).bind(redis);
    this.msetAsync = promisify(redis.mset).bind(redis);
    this.keysAsync = promisify(redis.keys).bind(redis);
  }

  // Generate cache key
  generateKey(namespace, identifier) {
    return `cache:${namespace}:${identifier}`;
  }

  // Get cached data
  async get(key) {
    try {
      const data = await this.getAsync(key);
      
      if (data) {
        this.stats.hits++;
        return JSON.parse(data);
      }
      
      this.stats.misses++;
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // Set cached data
  async set(key, data, ttl = this.defaultTTL) {
    try {
      const serialized = JSON.stringify(data);
      await this.setAsync(key, serialized, 'EX', ttl);
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  // Delete cached data
  async del(key) {
    try {
      await this.delAsync(key);
      this.stats.deletes++;
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  // Delete multiple keys by pattern
  async deletePattern(pattern) {
    try {
      const keys = await this.keysAsync(pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.delAsync(key)));
        this.stats.deletes += keys.length;
      }
      return keys.length;
    } catch (error) {
      console.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  // Get or set with callback
  async getOrSet(key, callback, ttl = this.defaultTTL) {
    try {
      // Try to get from cache
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }

      // If not in cache, execute callback
      const data = await callback();
      
      // Store in cache
      await this.set(key, data, ttl);
      
      return data;
    } catch (error) {
      console.error('Cache getOrSet error:', error);
      throw error;
    }
  }

  // Batch get
  async mget(keys) {
    try {
      const values = await this.mgetAsync(keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  // Check if key exists
  async exists(key) {
    try {
      const exists = await this.existsAsync(key);
      return exists === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  // Get remaining TTL
  async ttl(key) {
    try {
      const ttl = await this.ttlAsync(key);
      return ttl;
    } catch (error) {
      console.error('Cache ttl error:', error);
      return -1;
    }
  }

  // Cache invalidation strategies
  async invalidateUser(userId) {
    const patterns = [
      `cache:user:${userId}:*`,
      `cache:artist:${userId}:*`,
      `cache:fan:${userId}:*`,
    ];
    
    let totalDeleted = 0;
    for (const pattern of patterns) {
      totalDeleted += await this.deletePattern(pattern);
    }
    
    return totalDeleted;
  }

  async invalidateContent(contentId) {
    const patterns = [
      `cache:content:${contentId}:*`,
      `cache:discovery:*`, // Invalidate discovery cache when content changes
    ];
    
    let totalDeleted = 0;
    for (const pattern of patterns) {
      totalDeleted += await this.deletePattern(pattern);
    }
    
    return totalDeleted;
  }

  // Warm up cache with frequently accessed data
  async warmUpCache() {
    console.log('Warming up cache...');
    
    try {
      // Cache popular artists
      const Artist = require('../models/Artist');
      const popularArtists = await Artist.find({ isVerified: true })
        .sort({ monthlyListeners: -1 })
        .limit(100)
        .lean();
      
      for (const artist of popularArtists) {
        const key = this.generateKey('artist', artist._id);
        await this.set(key, artist, 3600); // 1 hour
      }
      
      // Cache discovery data
      const discoveryData = await this.generateDiscoveryData();
      await this.set('cache:discovery:trending', discoveryData.trending, 600);
      await this.set('cache:discovery:recommended', discoveryData.recommended, 600);
      
      console.log('Cache warm-up completed');
    } catch (error) {
      console.error('Cache warm-up error:', error);
    }
  }

  async generateDiscoveryData() {
    // Implementation for generating discovery data
    return {
      trending: [],
      recommended: [],
    };
  }

  // Get cache statistics
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    
    return {
      ...this.stats,
      hitRate: hitRate.toFixed(2) + '%',
    };
  }

  // Reset statistics
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };
  }

  // Express middleware for caching
  middleware(options = {}) {
    const {
      ttl = this.defaultTTL,
      keyGenerator = (req) => `${req.method}:${req.originalUrl}`,
      condition = () => true,
    } = options;

    return async (req, res, next) => {
      // Check if caching should be applied
      if (!condition(req)) {
        return next();
      }

      const key = `cache:api:${keyGenerator(req)}`;
      
      try {
        // Try to get from cache
        const cached = await this.get(key);
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          return res.json(cached);
        }
      } catch (error) {
        console.error('Cache middleware error:', error);
      }

      // Store original res.json
      const originalJson = res.json;
      
      // Override res.json to cache the response
      res.json = (data) => {
        res.setHeader('X-Cache', 'MISS');
        
        // Cache the response
        this.set(key, data, ttl).catch(error => {
          console.error('Failed to cache response:', error);
        });
        
        // Call original res.json
        return originalJson.call(res, data);
      };
      
      next();
    };
  }
}

module.exports = new CacheService();