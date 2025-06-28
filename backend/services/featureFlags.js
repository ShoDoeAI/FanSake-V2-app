const Redis = require('redis');
const { promisify } = require('util');

class FeatureFlagService {
  constructor() {
    this.client = Redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });
    
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setAsync = promisify(this.client.set).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);
    this.keysAsync = promisify(this.client.keys).bind(this.client);
    
    // Default feature flags
    this.defaultFlags = {
      'new-upload-flow': { enabled: false, rollout: 0 },
      'enhanced-messaging': { enabled: false, rollout: 0 },
      'ai-recommendations': { enabled: false, rollout: 0 },
      'video-streaming': { enabled: true, rollout: 100 },
      'listening-parties': { enabled: true, rollout: 100 },
      'artist-analytics-v2': { enabled: false, rollout: 0 },
      'payment-retry': { enabled: true, rollout: 100 },
      'social-sharing': { enabled: false, rollout: 0 }
    };
    
    this.initializeFlags();
  }
  
  async initializeFlags() {
    for (const [flag, config] of Object.entries(this.defaultFlags)) {
      const exists = await this.getAsync(`feature:${flag}`);
      if (!exists) {
        await this.setAsync(`feature:${flag}`, JSON.stringify(config));
      }
    }
  }
  
  async isEnabled(flagName, userId = null, attributes = {}) {
    try {
      const flagData = await this.getAsync(`feature:${flagName}`);
      if (!flagData) return false;
      
      const flag = JSON.parse(flagData);
      
      // Check if feature is globally enabled
      if (!flag.enabled) return false;
      
      // Check rollout percentage
      if (flag.rollout < 100 && userId) {
        const userHash = this.hashUserId(userId);
        const threshold = flag.rollout / 100;
        if (userHash > threshold) return false;
      }
      
      // Check targeting rules
      if (flag.targeting && flag.targeting.length > 0) {
        return this.evaluateTargeting(flag.targeting, userId, attributes);
      }
      
      // Check A/B test assignment
      if (flag.abTest && userId) {
        return this.getABTestVariant(flagName, userId) === 'treatment';
      }
      
      return true;
    } catch (error) {
      console.error(`Error checking feature flag ${flagName}:`, error);
      return false;
    }
  }
  
  async getFlag(flagName) {
    const flagData = await this.getAsync(`feature:${flagName}`);
    return flagData ? JSON.parse(flagData) : null;
  }
  
  async setFlag(flagName, config) {
    await this.setAsync(`feature:${flagName}`, JSON.stringify(config));
    await this.logFlagChange(flagName, config);
  }
  
  async updateRollout(flagName, percentage) {
    const flag = await this.getFlag(flagName);
    if (flag) {
      flag.rollout = Math.max(0, Math.min(100, percentage));
      await this.setFlag(flagName, flag);
    }
  }
  
  async enableFlag(flagName) {
    const flag = await this.getFlag(flagName);
    if (flag) {
      flag.enabled = true;
      await this.setFlag(flagName, flag);
    }
  }
  
  async disableFlag(flagName) {
    const flag = await this.getFlag(flagName);
    if (flag) {
      flag.enabled = false;
      await this.setFlag(flagName, flag);
    }
  }
  
  async getAllFlags() {
    const keys = await this.keysAsync('feature:*');
    const flags = {};
    
    for (const key of keys) {
      const flagName = key.replace('feature:', '');
      flags[flagName] = await this.getFlag(flagName);
    }
    
    return flags;
  }
  
  // A/B Testing
  async createABTest(flagName, config) {
    const flag = await this.getFlag(flagName);
    if (flag) {
      flag.abTest = {
        ...config,
        startDate: new Date().toISOString(),
        status: 'active'
      };
      await this.setFlag(flagName, flag);
    }
  }
  
  getABTestVariant(flagName, userId) {
    // Consistent hash to assign users to variants
    const hash = this.hashUserId(`${flagName}:${userId}`);
    return hash < 0.5 ? 'control' : 'treatment';
  }
  
  async trackEvent(flagName, userId, event, properties = {}) {
    const variant = this.getABTestVariant(flagName, userId);
    const eventData = {
      flagName,
      userId,
      variant,
      event,
      properties,
      timestamp: new Date().toISOString()
    };
    
    // Store in Redis for real-time analysis
    await this.client.lpush('ab-test-events', JSON.stringify(eventData));
    
    // Also send to analytics service
    if (process.env.NODE_ENV === 'production') {
      await this.sendToAnalytics(eventData);
    }
  }
  
  async getABTestResults(flagName, metric) {
    const flag = await this.getFlag(flagName);
    if (!flag || !flag.abTest) return null;
    
    // Calculate conversion rates for each variant
    const results = {
      control: { total: 0, conversions: 0 },
      treatment: { total: 0, conversions: 0 }
    };
    
    // In production, this would query analytics database
    // For now, return mock data
    return {
      flagName,
      metric,
      startDate: flag.abTest.startDate,
      results: {
        control: {
          users: 5000,
          conversions: 250,
          conversionRate: 0.05,
          confidence: 0.95
        },
        treatment: {
          users: 5000,
          conversions: 300,
          conversionRate: 0.06,
          confidence: 0.95
        },
        improvement: 0.20,
        pValue: 0.03,
        significant: true
      }
    };
  }
  
  // Targeting Rules
  evaluateTargeting(rules, userId, attributes) {
    for (const rule of rules) {
      if (this.evaluateRule(rule, userId, attributes)) {
        return true;
      }
    }
    return false;
  }
  
  evaluateRule(rule, userId, attributes) {
    switch (rule.type) {
      case 'user':
        return rule.values.includes(userId);
      
      case 'attribute':
        return rule.values.includes(attributes[rule.attribute]);
      
      case 'percentage':
        const hash = this.hashUserId(userId);
        return hash < (rule.value / 100);
      
      case 'date':
        const now = new Date();
        const ruleDate = new Date(rule.value);
        return rule.operator === 'after' ? now > ruleDate : now < ruleDate;
      
      default:
        return false;
    }
  }
  
  // Gradual Rollout
  async gradualRollout(flagName, schedule) {
    const steps = schedule.steps;
    let currentStep = 0;
    
    const rolloutInterval = setInterval(async () => {
      if (currentStep >= steps.length) {
        clearInterval(rolloutInterval);
        return;
      }
      
      const step = steps[currentStep];
      await this.updateRollout(flagName, step.percentage);
      
      console.log(`Updated ${flagName} rollout to ${step.percentage}%`);
      
      if (step.waitMinutes && currentStep < steps.length - 1) {
        currentStep++;
      } else {
        clearInterval(rolloutInterval);
      }
    }, (steps[currentStep]?.waitMinutes || 1) * 60 * 1000);
  }
  
  // Utilities
  hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) / 2147483647;
  }
  
  async logFlagChange(flagName, config) {
    const logEntry = {
      flagName,
      config,
      timestamp: new Date().toISOString(),
      changedBy: 'system' // In production, track actual user
    };
    
    await this.client.lpush('feature-flag-changes', JSON.stringify(logEntry));
  }
  
  async sendToAnalytics(data) {
    // Integration with analytics service
    // This would send to Segment, Mixpanel, etc.
    console.log('Analytics event:', data);
  }
  
  // Middleware for Express
  middleware() {
    return async (req, res, next) => {
      req.featureFlags = {
        isEnabled: async (flag) => {
          const userId = req.user?.id;
          const attributes = {
            role: req.user?.role,
            plan: req.user?.subscriptionTier,
            region: req.headers['cf-ipcountry'] || 'US'
          };
          
          return this.isEnabled(flag, userId, attributes);
        },
        
        track: async (flag, event, properties) => {
          if (req.user?.id) {
            await this.trackEvent(flag, req.user.id, event, properties);
          }
        }
      };
      
      next();
    };
  }
}

module.exports = new FeatureFlagService();