const Redis = require('ioredis');
const crypto = require('crypto');

class AbuseDetectionService {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });
    
    // Detection thresholds
    this.thresholds = {
      loginAttempts: { count: 5, window: 900 }, // 5 attempts in 15 minutes
      passwordReset: { count: 3, window: 3600 }, // 3 resets in 1 hour
      apiRequests: { count: 1000, window: 3600 }, // 1000 requests in 1 hour
      fileUploads: { count: 10, window: 3600 }, // 10 uploads in 1 hour
      messageSpam: { count: 50, window: 300 }, // 50 messages in 5 minutes
      contentViews: { count: 100, window: 60 }, // 100 views in 1 minute
      registrations: { count: 5, window: 3600 }, // 5 registrations from same IP in 1 hour
      suspiciousPatterns: { count: 10, window: 86400 } // 10 suspicious activities in 24 hours
    };
    
    // Abuse patterns
    this.patterns = {
      sqlInjection: /(\b(union|select|insert|update|delete|drop)\b.*\b(from|where)\b)/gi,
      xssAttempt: /<script|javascript:|onerror=|onload=/gi,
      pathTraversal: /\.\.\/|\.\.\\|%2e%2e/gi,
      bruteForce: /^(admin|root|test|user|password|123456)/i,
      botUserAgent: /bot|crawler|spider|scraper|curl|wget/i,
      suspiciousReferer: /casino|viagra|pills|loan|adult/i
    };
  }

  // Track user action
  async trackAction(userId, action, metadata = {}) {
    const key = `abuse:${action}:${userId}`;
    const now = Date.now();
    const threshold = this.thresholds[action] || this.thresholds.apiRequests;
    
    // Add to sorted set with timestamp as score
    await this.redis.zadd(key, now, `${now}:${JSON.stringify(metadata)}`);
    
    // Remove old entries outside the window
    const windowStart = now - (threshold.window * 1000);
    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    
    // Set expiry
    await this.redis.expire(key, threshold.window);
    
    // Get count within window
    const count = await this.redis.zcard(key);
    
    // Check if threshold exceeded
    if (count > threshold.count) {
      await this.handleAbuse(userId, action, count, metadata);
      return { blocked: true, reason: `${action} limit exceeded` };
    }
    
    return { blocked: false, count, remaining: threshold.count - count };
  }

  // Detect suspicious patterns
  async detectSuspiciousPattern(userId, requestData) {
    const suspicious = [];
    
    // Check URL
    if (requestData.url) {
      for (const [pattern, regex] of Object.entries(this.patterns)) {
        if (regex.test(requestData.url)) {
          suspicious.push({ type: pattern, location: 'url' });
        }
      }
    }
    
    // Check headers
    if (requestData.headers) {
      const userAgent = requestData.headers['user-agent'] || '';
      const referer = requestData.headers['referer'] || '';
      
      if (this.patterns.botUserAgent.test(userAgent)) {
        suspicious.push({ type: 'bot_user_agent', value: userAgent });
      }
      
      if (this.patterns.suspiciousReferer.test(referer)) {
        suspicious.push({ type: 'suspicious_referer', value: referer });
      }
    }
    
    // Check body
    if (requestData.body) {
      const bodyString = JSON.stringify(requestData.body);
      for (const [pattern, regex] of Object.entries(this.patterns)) {
        if (regex.test(bodyString)) {
          suspicious.push({ type: pattern, location: 'body' });
        }
      }
    }
    
    // Track suspicious patterns
    if (suspicious.length > 0) {
      await this.trackAction(userId, 'suspiciousPatterns', { patterns: suspicious });
      
      // Log for analysis
      console.warn('Suspicious patterns detected:', {
        userId,
        patterns: suspicious,
        timestamp: new Date().toISOString()
      });
    }
    
    return suspicious;
  }

  // Check IP reputation
  async checkIPReputation(ip) {
    const key = `ip_reputation:${ip}`;
    const reputation = await this.redis.hgetall(key);
    
    if (!reputation.score) {
      // Initialize reputation
      await this.redis.hmset(key, {
        score: 100,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        requests: 0
      });
      await this.redis.expire(key, 86400 * 30); // 30 days
      return { score: 100, status: 'new' };
    }
    
    // Update last seen
    await this.redis.hincrby(key, 'requests', 1);
    await this.redis.hset(key, 'lastSeen', Date.now());
    
    const score = parseInt(reputation.score);
    
    if (score < 30) {
      return { score, status: 'blocked', reason: 'Low reputation score' };
    } else if (score < 60) {
      return { score, status: 'suspicious' };
    } else {
      return { score, status: 'trusted' };
    }
  }

  // Update IP reputation
  async updateIPReputation(ip, change, reason) {
    const key = `ip_reputation:${ip}`;
    const newScore = await this.redis.hincrby(key, 'score', change);
    
    // Keep score between 0 and 100
    if (newScore < 0) {
      await this.redis.hset(key, 'score', 0);
    } else if (newScore > 100) {
      await this.redis.hset(key, 'score', 100);
    }
    
    // Log reputation change
    await this.redis.lpush(`ip_reputation_log:${ip}`, JSON.stringify({
      change,
      reason,
      newScore: Math.max(0, Math.min(100, newScore)),
      timestamp: Date.now()
    }));
    
    // Keep only last 100 logs
    await this.redis.ltrim(`ip_reputation_log:${ip}`, 0, 99);
  }

  // Velocity check
  async checkVelocity(identifier, action, limit, window) {
    const key = `velocity:${action}:${identifier}`;
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.expire(key, window);
    }
    
    return {
      count,
      exceeded: count > limit,
      remaining: Math.max(0, limit - count)
    };
  }

  // Device fingerprinting
  generateDeviceFingerprint(requestData) {
    const components = [
      requestData.headers['user-agent'],
      requestData.headers['accept-language'],
      requestData.headers['accept-encoding'],
      requestData.headers['sec-ch-ua'],
      requestData.headers['sec-ch-ua-platform'],
      requestData.headers['sec-ch-ua-mobile']
    ].filter(Boolean);
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  // Track device
  async trackDevice(userId, fingerprint, metadata = {}) {
    const key = `user_devices:${userId}`;
    const deviceKey = `device:${fingerprint}`;
    
    // Add device to user's device list
    await this.redis.sadd(key, fingerprint);
    
    // Store device metadata
    await this.redis.hmset(deviceKey, {
      lastSeen: Date.now(),
      firstSeen: metadata.firstSeen || Date.now(),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      userId
    });
    
    // Check for suspicious device activity
    const deviceCount = await this.redis.scard(key);
    if (deviceCount > 10) {
      await this.flagSuspiciousActivity(userId, 'multiple_devices', {
        count: deviceCount
      });
    }
    
    return { deviceCount, fingerprint };
  }

  // Content abuse detection
  async checkContentAbuse(content, contentType) {
    const abuses = [];
    
    // Check for spam patterns
    const spamPatterns = [
      /\b(viagra|cialis|casino|lottery|prize|winner)\b/gi,
      /(http|https):\/\/[^\s]+/g, // URLs (count them)
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // Emails
      /\b\d{10,}\b/g, // Phone numbers
      /(.)\1{9,}/g // Repeated characters
    ];
    
    for (const pattern of spamPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 3) {
        abuses.push({
          type: 'spam_pattern',
          pattern: pattern.source,
          count: matches.length
        });
      }
    }
    
    // Check for prohibited content
    const prohibitedTerms = await this.getProhibitedTerms();
    for (const term of prohibitedTerms) {
      if (content.toLowerCase().includes(term.toLowerCase())) {
        abuses.push({
          type: 'prohibited_content',
          term: term
        });
      }
    }
    
    // Calculate abuse score
    const abuseScore = abuses.reduce((score, abuse) => {
      switch (abuse.type) {
        case 'spam_pattern': return score + 10;
        case 'prohibited_content': return score + 20;
        default: return score + 5;
      }
    }, 0);
    
    return {
      abuses,
      score: abuseScore,
      blocked: abuseScore >= 30
    };
  }

  // Handle detected abuse
  async handleAbuse(userId, action, count, metadata) {
    const severity = this.calculateSeverity(action, count);
    
    // Log abuse incident
    await this.logAbuseIncident({
      userId,
      action,
      count,
      severity,
      metadata,
      timestamp: Date.now()
    });
    
    // Take action based on severity
    switch (severity) {
      case 'low':
        // Just log and monitor
        break;
        
      case 'medium':
        // Temporary restrictions
        await this.applyTemporaryRestriction(userId, action);
        break;
        
      case 'high':
        // Block user temporarily
        await this.blockUser(userId, 3600); // 1 hour
        break;
        
      case 'critical':
        // Permanent ban consideration
        await this.flagForReview(userId, 'potential_ban', { action, count });
        break;
    }
    
    // Notify security team if needed
    if (severity !== 'low') {
      await this.notifySecurityTeam({
        userId,
        action,
        severity,
        metadata
      });
    }
  }

  // Calculate abuse severity
  calculateSeverity(action, count) {
    const threshold = this.thresholds[action];
    if (!threshold) return 'low';
    
    const ratio = count / threshold.count;
    
    if (ratio < 2) return 'low';
    if (ratio < 5) return 'medium';
    if (ratio < 10) return 'high';
    return 'critical';
  }

  // Apply temporary restriction
  async applyTemporaryRestriction(userId, action, duration = 3600) {
    const key = `restriction:${action}:${userId}`;
    await this.redis.setex(key, duration, JSON.stringify({
      action,
      appliedAt: Date.now(),
      duration
    }));
  }

  // Check if user is restricted
  async isRestricted(userId, action) {
    const key = `restriction:${action}:${userId}`;
    const restriction = await this.redis.get(key);
    return restriction !== null;
  }

  // Block user
  async blockUser(userId, duration) {
    const key = `blocked:${userId}`;
    await this.redis.setex(key, duration, JSON.stringify({
      blockedAt: Date.now(),
      duration,
      reason: 'abuse_detection'
    }));
  }

  // Check if user is blocked
  async isBlocked(userId) {
    const key = `blocked:${userId}`;
    const blocked = await this.redis.get(key);
    return blocked !== null;
  }

  // Helper methods
  async getProhibitedTerms() {
    // Return list of prohibited terms
    return ['spam', 'scam', 'phishing']; // Simplified
  }

  async logAbuseIncident(incident) {
    const key = `abuse_log:${new Date().toISOString().split('T')[0]}`;
    await this.redis.lpush(key, JSON.stringify(incident));
    await this.redis.expire(key, 86400 * 90); // Keep logs for 90 days
  }

  async flagSuspiciousActivity(userId, type, details) {
    const key = `suspicious:${userId}`;
    await this.redis.lpush(key, JSON.stringify({
      type,
      details,
      timestamp: Date.now()
    }));
    await this.redis.ltrim(key, 0, 99); // Keep last 100 activities
  }

  async flagForReview(userId, reason, details) {
    const key = 'security_review_queue';
    await this.redis.lpush(key, JSON.stringify({
      userId,
      reason,
      details,
      timestamp: Date.now()
    }));
  }

  async notifySecurityTeam(incident) {
    // Send notification to security team
    console.error('Security incident:', incident);
    // In production, send email/Slack notification
  }

  // Cleanup old data
  async cleanup() {
    // Run daily cleanup of old abuse tracking data
    const patterns = [
      'abuse:*',
      'velocity:*',
      'ip_reputation_log:*'
    ];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) {
          // No expiry set, set one
          await this.redis.expire(key, 86400 * 7); // 7 days
        }
      }
    }
  }
}

module.exports = new AbuseDetectionService();