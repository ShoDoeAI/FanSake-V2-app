const mongoose = require('mongoose');
const User = require('../models/User');
const Track = require('../models/Track');
const redisClient = require('../config/redis');
const Bull = require('bull');

// Analytics queue for batch processing
const analyticsQueue = new Bull('analytics', {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

// Analytics event schema
const AnalyticsEvent = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  artistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  metadata: mongoose.Schema.Types.Mixed,
  sessionId: String,
  deviceInfo: {
    platform: String,
    browser: String,
    os: String,
    deviceType: String
  },
  location: {
    country: String,
    region: String,
    city: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const Analytics = mongoose.model('Analytics', AnalyticsEvent);

class AnalyticsService {
  constructor() {
    this.setupQueueProcessors();
  }
  
  setupQueueProcessors() {
    // Process analytics events
    analyticsQueue.process('track_event', async (job) => {
      await this.processEvent(job.data);
    });
    
    // Process aggregations
    analyticsQueue.process('aggregate_daily', async (job) => {
      await this.aggregateDailyStats(job.data.date);
    });
    
    // Process reports
    analyticsQueue.process('generate_report', async (job) => {
      await this.generateReport(job.data);
    });
  }
  
  async trackEvent(eventType, data = {}) {
    try {
      // Queue for async processing
      await analyticsQueue.add('track_event', {
        eventType,
        ...data,
        timestamp: new Date()
      });
      
      // Update real-time counters
      await this.updateRealTimeMetrics(eventType, data);
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }
  
  async processEvent(eventData) {
    try {
      // Store in database
      await Analytics.create(eventData);
      
      // Update aggregated metrics
      await this.updateAggregatedMetrics(eventData);
      
      // Trigger real-time dashboards
      if (this.isSignificantEvent(eventData.eventType)) {
        await this.notifyRealTimeDashboard(eventData);
      }
    } catch (error) {
      console.error('Error processing analytics event:', error);
    }
  }
  
  async updateRealTimeMetrics(eventType, data) {
    const today = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();
    
    // Global metrics
    await redisClient.hincrby(`analytics:global:${today}`, eventType, 1);
    await redisClient.hincrby(`analytics:global:${today}:h${hour}`, eventType, 1);
    
    // User metrics
    if (data.userId) {
      await redisClient.hincrby(`analytics:user:${data.userId}:${today}`, eventType, 1);
    }
    
    // Artist metrics
    if (data.artistId) {
      await redisClient.hincrby(`analytics:artist:${data.artistId}:${today}`, eventType, 1);
      
      // Track revenue metrics
      if (eventType === 'subscription' || eventType === 'purchase') {
        const amount = data.amount || 0;
        await redisClient.hincrbyfloat(`analytics:artist:${data.artistId}:revenue:${today}`, 'total', amount);
      }
    }
    
    // Set expiration
    await redisClient.expire(`analytics:global:${today}`, 86400 * 90); // 90 days
    await redisClient.expire(`analytics:global:${today}:h${hour}`, 86400 * 7); // 7 days
  }
  
  async updateAggregatedMetrics(eventData) {
    const { eventType, userId, artistId, metadata } = eventData;
    
    switch (eventType) {
      case 'track_play':
        await this.updatePlayMetrics(metadata.trackId, userId, artistId);
        break;
        
      case 'track_complete':
        await this.updateCompletionMetrics(metadata.trackId, userId, artistId);
        break;
        
      case 'subscription':
        await this.updateSubscriptionMetrics(artistId, metadata);
        break;
        
      case 'revenue':
        await this.updateRevenueMetrics(artistId, metadata);
        break;
    }
  }
  
  async updatePlayMetrics(trackId, userId, artistId) {
    // Update track play count
    await Track.findByIdAndUpdate(trackId, {
      $inc: { 'stats.plays': 1 }
    });
    
    // Update artist play count
    if (artistId) {
      await User.findByIdAndUpdate(artistId, {
        $inc: { 'analytics.totalPlays': 1 }
      });
    }
    
    // Track unique listeners
    const today = new Date().toISOString().split('T')[0];
    await redisClient.sadd(`track:${trackId}:listeners:${today}`, userId);
    await redisClient.expire(`track:${trackId}:listeners:${today}`, 86400 * 30);
  }
  
  async updateCompletionMetrics(trackId, userId, artistId) {
    // Track completion rate
    const completionKey = `track:${trackId}:completions`;
    await redisClient.hincrby(completionKey, 'total', 1);
    
    // Update track stats
    await Track.findByIdAndUpdate(trackId, {
      $inc: { 'stats.completions': 1 }
    });
  }
  
  async updateSubscriptionMetrics(artistId, metadata) {
    const { tier, amount } = metadata;
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    // Update artist subscription metrics
    await User.findByIdAndUpdate(artistId, {
      $inc: {
        [`analytics.subscriptions.${tier}`]: 1,
        'analytics.monthlyRevenue': amount
      }
    });
    
    // Track MRR (Monthly Recurring Revenue)
    await redisClient.hincrbyfloat(
      `artist:${artistId}:mrr:${month}`,
      tier,
      amount
    );
  }
  
  async updateRevenueMetrics(artistId, metadata) {
    const { source, amount, fee } = metadata;
    const today = new Date().toISOString().split('T')[0];
    
    // Update artist revenue
    await User.findByIdAndUpdate(artistId, {
      $inc: {
        'analytics.totalRevenue': amount - fee,
        'analytics.platformFees': fee
      }
    });
    
    // Track daily revenue
    await redisClient.hincrbyfloat(
      `artist:${artistId}:revenue:${today}`,
      source,
      amount - fee
    );
  }
  
  isSignificantEvent(eventType) {
    const significantEvents = [
      'subscription',
      'purchase',
      'milestone_achieved',
      'viral_content',
      'high_engagement'
    ];
    
    return significantEvents.includes(eventType);
  }
  
  async notifyRealTimeDashboard(eventData) {
    const io = require('../websocket').getIO();
    
    // Notify artist dashboard
    if (eventData.artistId) {
      io.to(`user:${eventData.artistId}`).emit('analytics_update', {
        eventType: eventData.eventType,
        data: eventData.metadata,
        timestamp: eventData.timestamp
      });
    }
    
    // Notify admin dashboard
    io.to('admin_dashboard').emit('global_analytics_update', eventData);
  }
  
  async getArtistAnalytics(artistId, period = '30d') {
    try {
      const endDate = new Date();
      const startDate = new Date();
      
      // Parse period
      const match = period.match(/(\d+)([dhm])/);
      if (match) {
        const [, num, unit] = match;
        const value = parseInt(num);
        
        switch (unit) {
          case 'd':
            startDate.setDate(startDate.getDate() - value);
            break;
          case 'h':
            startDate.setHours(startDate.getHours() - value);
            break;
          case 'm':
            startDate.setMonth(startDate.getMonth() - value);
            break;
        }
      }
      
      // Get analytics events
      const events = await Analytics.find({
        artistId,
        timestamp: { $gte: startDate, $lte: endDate }
      });
      
      // Aggregate metrics
      const metrics = {
        overview: await this.getOverviewMetrics(artistId, startDate, endDate),
        engagement: await this.getEngagementMetrics(artistId, startDate, endDate),
        revenue: await this.getRevenueMetrics(artistId, startDate, endDate),
        audience: await this.getAudienceMetrics(artistId, startDate, endDate),
        content: await this.getContentMetrics(artistId, startDate, endDate),
        trends: await this.getTrendMetrics(artistId, startDate, endDate)
      };
      
      return metrics;
    } catch (error) {
      console.error('Error getting artist analytics:', error);
      throw error;
    }
  }
  
  async getOverviewMetrics(artistId, startDate, endDate) {
    const artist = await User.findById(artistId);
    
    // Get current period metrics
    const currentMetrics = await Analytics.aggregate([
      {
        $match: {
          artistId: mongoose.Types.ObjectId(artistId),
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalPlays: { $sum: { $cond: [{ $eq: ['$eventType', 'track_play'] }, 1, 0] } },
          uniqueListeners: { $addToSet: { $cond: [{ $eq: ['$eventType', 'track_play'] }, '$userId', null] } },
          totalRevenue: { $sum: { $cond: [{ $eq: ['$eventType', 'revenue'] }, '$metadata.amount', 0] } }
        }
      }
    ]);
    
    // Get previous period for comparison
    const prevEndDate = new Date(startDate);
    const prevStartDate = new Date(startDate);
    prevStartDate.setTime(prevStartDate.getTime() - (endDate - startDate));
    
    const prevMetrics = await Analytics.aggregate([
      {
        $match: {
          artistId: mongoose.Types.ObjectId(artistId),
          timestamp: { $gte: prevStartDate, $lte: prevEndDate }
        }
      },
      {
        $group: {
          _id: null,
          totalPlays: { $sum: { $cond: [{ $eq: ['$eventType', 'track_play'] }, 1, 0] } },
          uniqueListeners: { $addToSet: { $cond: [{ $eq: ['$eventType', 'track_play'] }, '$userId', null] } },
          totalRevenue: { $sum: { $cond: [{ $eq: ['$eventType', 'revenue'] }, '$metadata.amount', 0] } }
        }
      }
    ]);
    
    const current = currentMetrics[0] || { totalPlays: 0, uniqueListeners: [], totalRevenue: 0 };
    const previous = prevMetrics[0] || { totalPlays: 0, uniqueListeners: [], totalRevenue: 0 };
    
    return {
      totalPlays: {
        value: current.totalPlays,
        change: this.calculatePercentChange(current.totalPlays, previous.totalPlays)
      },
      uniqueListeners: {
        value: current.uniqueListeners.filter(id => id !== null).length,
        change: this.calculatePercentChange(
          current.uniqueListeners.filter(id => id !== null).length,
          previous.uniqueListeners.filter(id => id !== null).length
        )
      },
      totalRevenue: {
        value: current.totalRevenue,
        change: this.calculatePercentChange(current.totalRevenue, previous.totalRevenue)
      },
      followers: {
        value: artist.analytics?.followerCount || 0,
        change: 0 // Would calculate based on historical data
      }
    };
  }
  
  async getEngagementMetrics(artistId, startDate, endDate) {
    const engagementEvents = await Analytics.aggregate([
      {
        $match: {
          artistId: mongoose.Types.ObjectId(artistId),
          timestamp: { $gte: startDate, $lte: endDate },
          eventType: { $in: ['like', 'comment', 'share', 'playlist_add'] }
        }
      },
      {
        $group: {
          _id: '$eventType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const engagement = {};
    engagementEvents.forEach(event => {
      engagement[event._id] = event.count;
    });
    
    // Calculate engagement rate
    const totalPlays = await Analytics.countDocuments({
      artistId: mongoose.Types.ObjectId(artistId),
      timestamp: { $gte: startDate, $lte: endDate },
      eventType: 'track_play'
    });
    
    const totalEngagements = Object.values(engagement).reduce((a, b) => a + b, 0);
    const engagementRate = totalPlays > 0 ? (totalEngagements / totalPlays) * 100 : 0;
    
    return {
      likes: engagement.like || 0,
      comments: engagement.comment || 0,
      shares: engagement.share || 0,
      playlistAdds: engagement.playlist_add || 0,
      engagementRate: engagementRate.toFixed(2)
    };
  }
  
  async getRevenueMetrics(artistId, startDate, endDate) {
    const revenueEvents = await Analytics.aggregate([
      {
        $match: {
          artistId: mongoose.Types.ObjectId(artistId),
          timestamp: { $gte: startDate, $lte: endDate },
          eventType: 'revenue'
        }
      },
      {
        $group: {
          _id: '$metadata.source',
          total: { $sum: '$metadata.amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const revenueBySource = {};
    let totalRevenue = 0;
    
    revenueEvents.forEach(source => {
      revenueBySource[source._id] = {
        amount: source.total,
        transactions: source.count
      };
      totalRevenue += source.total;
    });
    
    // Get daily revenue trend
    const dailyRevenue = await Analytics.aggregate([
      {
        $match: {
          artistId: mongoose.Types.ObjectId(artistId),
          timestamp: { $gte: startDate, $lte: endDate },
          eventType: 'revenue'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          revenue: { $sum: '$metadata.amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    return {
      total: totalRevenue,
      bySource: revenueBySource,
      dailyTrend: dailyRevenue,
      averageTransactionValue: revenueEvents.length > 0 
        ? (totalRevenue / revenueEvents.reduce((sum, s) => sum + s.count, 0)).toFixed(2)
        : 0
    };
  }
  
  async getAudienceMetrics(artistId, startDate, endDate) {
    // Get demographic data
    const demographics = await Analytics.aggregate([
      {
        $match: {
          artistId: mongoose.Types.ObjectId(artistId),
          timestamp: { $gte: startDate, $lte: endDate },
          eventType: 'track_play',
          userId: { $exists: true }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $group: {
          _id: null,
          countries: { $push: '$location.country' },
          ages: { $push: '$user.profile.age' },
          tiers: { $push: '$user.tier' }
        }
      }
    ]);
    
    const audience = demographics[0] || { countries: [], ages: [], tiers: [] };
    
    // Process demographics
    const countryCount = {};
    audience.countries.forEach(country => {
      if (country) countryCount[country] = (countryCount[country] || 0) + 1;
    });
    
    const tierCount = { free: 0, supporter: 0, superfan: 0 };
    audience.tiers.forEach(tier => {
      if (tier) tierCount[tier] = (tierCount[tier] || 0) + 1;
    });
    
    // Calculate age ranges
    const ageRanges = { '18-24': 0, '25-34': 0, '35-44': 0, '45+': 0 };
    audience.ages.forEach(age => {
      if (age >= 18 && age <= 24) ageRanges['18-24']++;
      else if (age >= 25 && age <= 34) ageRanges['25-34']++;
      else if (age >= 35 && age <= 44) ageRanges['35-44']++;
      else if (age >= 45) ageRanges['45+']++;
    });
    
    return {
      topCountries: Object.entries(countryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([country, count]) => ({ country, count })),
      tierDistribution: tierCount,
      ageDistribution: ageRanges,
      totalReach: audience.countries.length
    };
  }
  
  async getContentMetrics(artistId, startDate, endDate) {
    // Get top performing content
    const topContent = await Analytics.aggregate([
      {
        $match: {
          artistId: mongoose.Types.ObjectId(artistId),
          timestamp: { $gte: startDate, $lte: endDate },
          eventType: 'track_play',
          'metadata.trackId': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$metadata.trackId',
          plays: { $sum: 1 },
          uniqueListeners: { $addToSet: '$userId' }
        }
      },
      { $sort: { plays: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'tracks',
          localField: '_id',
          foreignField: '_id',
          as: 'track'
        }
      },
      { $unwind: '$track' }
    ]);
    
    return {
      topTracks: topContent.map(item => ({
        track: {
          _id: item.track._id,
          title: item.track.title,
          duration: item.track.duration
        },
        plays: item.plays,
        uniqueListeners: item.uniqueListeners.length
      })),
      totalTracksPlayed: topContent.length
    };
  }
  
  async getTrendMetrics(artistId, startDate, endDate) {
    // Calculate daily metrics for trend analysis
    const dailyMetrics = await Analytics.aggregate([
      {
        $match: {
          artistId: mongoose.Types.ObjectId(artistId),
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            type: '$eventType'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          metrics: {
            $push: {
              type: '$_id.type',
              count: '$count'
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    return {
      daily: dailyMetrics,
      growth: await this.calculateGrowthRate(artistId, startDate, endDate)
    };
  }
  
  calculatePercentChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100).toFixed(2);
  }
  
  async calculateGrowthRate(artistId, startDate, endDate) {
    // Calculate follower growth rate
    const artist = await User.findById(artistId);
    const currentFollowers = artist.analytics?.followerCount || 0;
    
    // This would need historical data to calculate properly
    // For now, return a placeholder
    return {
      followers: 0,
      revenue: 0,
      engagement: 0
    };
  }
  
  async generateReport(reportConfig) {
    const { artistId, period, type } = reportConfig;
    
    // Generate comprehensive report based on type
    const report = {
      generatedAt: new Date(),
      period,
      type,
      data: await this.getArtistAnalytics(artistId, period)
    };
    
    // Store report for later access
    await redisClient.setex(
      `report:${artistId}:${type}:${Date.now()}`,
      86400 * 30, // Keep for 30 days
      JSON.stringify(report)
    );
    
    return report;
  }
  
  async aggregateDailyStats(date) {
    // Aggregate all daily statistics for long-term storage
    // This would run as a scheduled job
    console.log(`Aggregating stats for ${date}`);
  }
  
  // Public tracking methods
  async trackPageView(userId, page, metadata = {}) {
    return this.trackEvent('page_view', {
      userId,
      metadata: { page, ...metadata }
    });
  }
  
  async trackPlay(userId, trackId, artistId, duration) {
    return this.trackEvent('track_play', {
      userId,
      artistId,
      metadata: { trackId, duration }
    });
  }
  
  async trackEngagement(userId, artistId, action, metadata = {}) {
    return this.trackEvent(action, {
      userId,
      artistId,
      metadata
    });
  }
  
  async trackRevenue(artistId, source, amount, fee, metadata = {}) {
    return this.trackEvent('revenue', {
      artistId,
      metadata: {
        source,
        amount,
        fee,
        netAmount: amount - fee,
        ...metadata
      }
    });
  }
}

module.exports = new AnalyticsService();