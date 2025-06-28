const User = require('../models/User');
const FanClub = require('../models/FanClub');
const Track = require('../models/Track');
const notificationService = require('./notificationService');
const analyticsService = require('./analyticsService');
const redisClient = require('../config/redis');
const Bull = require('bull');

// Create job queue for background processing
const engagementQueue = new Bull('engagement', {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

class EngagementEngine {
  constructor() {
    this.milestoneDefinitions = {
      follower_count: [
        { value: 100, reward: 'badge', details: { name: 'Rising Star', icon: '⭐' } },
        { value: 1000, reward: 'badge', details: { name: 'Popular Artist', icon: '🌟' } },
        { value: 10000, reward: 'badge', details: { name: 'Viral Sensation', icon: '💫' } },
        { value: 100000, reward: 'badge', details: { name: 'Superstar', icon: '🌠' } }
      ],
      streaming_minutes: [
        { value: 1000, reward: 'badge', details: { name: 'Dedicated Listener', icon: '🎧' } },
        { value: 10000, reward: 'exclusive_content', details: { type: 'track' } },
        { value: 100000, reward: 'merchandise', details: { item: 'limited_edition_vinyl' } }
      ],
      support_duration: [
        { value: 30, reward: 'badge', details: { name: '1 Month Supporter', icon: '🥉' } },
        { value: 180, reward: 'badge', details: { name: '6 Month Supporter', icon: '🥈' } },
        { value: 365, reward: 'badge', details: { name: '1 Year Supporter', icon: '🥇' } }
      ],
      engagement_score: [
        { value: 100, reward: 'discount', details: { percentage: 10 } },
        { value: 500, reward: 'discount', details: { percentage: 20 } },
        { value: 1000, reward: 'meet_greet', details: { type: 'virtual' } }
      ]
    };
    
    this.setupQueueProcessors();
  }
  
  setupQueueProcessors() {
    // Process engagement tracking jobs
    engagementQueue.process('track_engagement', async (job) => {
      const { userId, artistId, action, metadata } = job.data;
      await this.trackEngagement(userId, artistId, action, metadata);
    });
    
    // Process milestone checks
    engagementQueue.process('check_milestones', async (job) => {
      const { userId, metricType, newValue } = job.data;
      await this.checkAndAwardMilestones(userId, metricType, newValue);
    });
    
    // Process engagement campaigns
    engagementQueue.process('run_campaign', async (job) => {
      const { campaignId } = job.data;
      await this.runEngagementCampaign(campaignId);
    });
  }
  
  async trackEngagement(userId, artistId, action, metadata = {}) {
    try {
      const engagementKey = `engagement:${userId}:${artistId}`;
      const dailyKey = `${engagementKey}:${new Date().toISOString().split('T')[0]}`;
      
      // Track action in Redis for real-time analytics
      const score = this.getActionScore(action);
      await redisClient.zincrby(engagementKey, score, action);
      await redisClient.zincrby(dailyKey, score, action);
      await redisClient.expire(dailyKey, 86400 * 30); // Keep daily data for 30 days
      
      // Update user's engagement metrics
      const user = await User.findById(userId);
      if (!user) return;
      
      // Update engagement score
      user.analytics = user.analytics || {};
      user.analytics.engagementScore = (user.analytics.engagementScore || 0) + score;
      
      // Track specific actions
      switch (action) {
        case 'stream':
          user.analytics.totalStreamingMinutes = (user.analytics.totalStreamingMinutes || 0) + (metadata.duration || 0);
          await this.checkMilestone(userId, 'streaming_minutes', user.analytics.totalStreamingMinutes);
          break;
          
        case 'share':
          user.analytics.totalShares = (user.analytics.totalShares || 0) + 1;
          break;
          
        case 'playlist_add':
          user.analytics.playlistAdds = (user.analytics.playlistAdds || 0) + 1;
          break;
          
        case 'purchase':
          user.analytics.totalPurchases = (user.analytics.totalPurchases || 0) + 1;
          user.analytics.totalSpent = (user.analytics.totalSpent || 0) + (metadata.amount || 0);
          break;
      }
      
      await user.save();
      
      // Check engagement score milestones
      await this.checkMilestone(userId, 'engagement_score', user.analytics.engagementScore);
      
      // Track artist metrics
      await this.updateArtistEngagement(artistId, action, metadata);
      
      // Trigger real-time events for high-value actions
      if (this.isHighValueAction(action)) {
        await this.triggerRealTimeEngagement(userId, artistId, action);
      }
    } catch (error) {
      console.error('Error tracking engagement:', error);
    }
  }
  
  getActionScore(action) {
    const scores = {
      view: 1,
      like: 2,
      comment: 3,
      share: 5,
      stream: 2,
      playlist_add: 4,
      follow: 10,
      subscribe: 20,
      purchase: 25,
      attend_event: 15,
      message: 5
    };
    
    return scores[action] || 1;
  }
  
  isHighValueAction(action) {
    return ['subscribe', 'purchase', 'share', 'attend_event'].includes(action);
  }
  
  async checkMilestone(userId, metricType, currentValue) {
    try {
      // Get user's fan clubs
      const user = await User.findById(userId);
      const fanClubs = await FanClub.find({ 
        'members.user': userId 
      });
      
      for (const fanClub of fanClubs) {
        const milestone = await fanClub.checkMilestones(userId, metricType, currentValue);
        
        if (milestone) {
          // Award milestone
          await this.awardMilestone(userId, milestone, fanClub);
        }
      }
      
      // Check global milestones
      await this.checkGlobalMilestones(userId, metricType, currentValue);
    } catch (error) {
      console.error('Error checking milestones:', error);
    }
  }
  
  async checkGlobalMilestones(userId, metricType, currentValue) {
    const definitions = this.milestoneDefinitions[metricType];
    if (!definitions) return;
    
    // Get user's achieved milestones
    const user = await User.findById(userId);
    const achieved = user.achievements?.milestones || [];
    
    for (const definition of definitions) {
      const alreadyAchieved = achieved.some(
        m => m.type === metricType && m.value === definition.value
      );
      
      if (!alreadyAchieved && currentValue >= definition.value) {
        // Award global milestone
        await this.awardGlobalMilestone(userId, metricType, definition);
      }
    }
  }
  
  async awardMilestone(userId, milestone, fanClub) {
    try {
      // Send notification
      await notificationService.sendNotification(userId, {
        type: 'milestone',
        title: '🏆 Milestone Achieved!',
        body: `You've reached ${milestone.milestone.value} ${milestone.milestone.type.replace('_', ' ')} in ${fanClub.name}!`,
        data: {
          fanClubId: fanClub._id,
          milestone: milestone.milestone,
          reward: milestone.milestone.reward
        },
        priority: 'high'
      });
      
      // Process reward
      await this.processReward(userId, milestone.milestone.reward);
      
      // Track achievement
      await analyticsService.trackEvent('milestone_achieved', {
        userId,
        fanClubId: fanClub._id,
        milestoneType: milestone.milestone.type,
        milestoneValue: milestone.milestone.value
      });
    } catch (error) {
      console.error('Error awarding milestone:', error);
    }
  }
  
  async awardGlobalMilestone(userId, metricType, definition) {
    try {
      // Update user achievements
      await User.findByIdAndUpdate(userId, {
        $push: {
          'achievements.milestones': {
            type: metricType,
            value: definition.value,
            achievedAt: new Date(),
            reward: definition.reward,
            details: definition.details
          }
        }
      });
      
      // Send notification
      await notificationService.sendNotification(userId, {
        type: 'milestone',
        title: '🏆 Global Milestone Achieved!',
        body: `You've reached ${definition.value} ${metricType.replace('_', ' ')}!`,
        data: {
          milestoneType: metricType,
          milestoneValue: definition.value,
          reward: definition.reward,
          details: definition.details
        },
        priority: 'high'
      });
      
      // Process reward
      await this.processReward(userId, definition.reward, definition.details);
    } catch (error) {
      console.error('Error awarding global milestone:', error);
    }
  }
  
  async processReward(userId, rewardType, details = {}) {
    switch (rewardType) {
      case 'badge':
        await this.awardBadge(userId, details);
        break;
        
      case 'exclusive_content':
        await this.unlockExclusiveContent(userId, details);
        break;
        
      case 'discount':
        await this.createDiscountCode(userId, details);
        break;
        
      case 'merchandise':
        await this.awardMerchandise(userId, details);
        break;
        
      case 'meet_greet':
        await this.scheduleMeetGreet(userId, details);
        break;
    }
  }
  
  async awardBadge(userId, badgeDetails) {
    await User.findByIdAndUpdate(userId, {
      $push: {
        'achievements.badges': {
          name: badgeDetails.name,
          icon: badgeDetails.icon,
          awardedAt: new Date()
        }
      }
    });
  }
  
  async updateArtistEngagement(artistId, action, metadata) {
    try {
      const artist = await User.findById(artistId);
      if (!artist || artist.role !== 'artist') return;
      
      // Update artist analytics
      const today = new Date().toISOString().split('T')[0];
      const analyticsKey = `artist:analytics:${artistId}:${today}`;
      
      await redisClient.hincrby(analyticsKey, `actions:${action}`, 1);
      await redisClient.hincrby(analyticsKey, 'total_engagements', 1);
      await redisClient.expire(analyticsKey, 86400 * 90); // Keep for 90 days
      
      // Update artist profile
      artist.analytics.totalEngagements = (artist.analytics.totalEngagements || 0) + 1;
      artist.analytics.lastEngagementAt = new Date();
      
      await artist.save();
    } catch (error) {
      console.error('Error updating artist engagement:', error);
    }
  }
  
  async triggerRealTimeEngagement(userId, artistId, action) {
    // Get artist's active session if online
    const artistSocketId = await redisClient.get(`socket:${artistId}`);
    
    if (artistSocketId) {
      const io = require('../websocket').getIO();
      const user = await User.findById(userId).select('username profile.avatar');
      
      io.to(`user:${artistId}`).emit('high_value_engagement', {
        user: {
          _id: userId,
          username: user.username,
          avatar: user.profile?.avatar
        },
        action,
        timestamp: new Date()
      });
    }
  }
  
  async getEngagementScore(userId, artistId) {
    try {
      const engagementKey = `engagement:${userId}:${artistId}`;
      const scores = await redisClient.zrevrange(engagementKey, 0, -1, 'WITHSCORES');
      
      let totalScore = 0;
      const breakdown = {};
      
      for (let i = 0; i < scores.length; i += 2) {
        const action = scores[i];
        const score = parseInt(scores[i + 1]);
        breakdown[action] = score;
        totalScore += score;
      }
      
      return {
        totalScore,
        breakdown,
        level: this.calculateEngagementLevel(totalScore)
      };
    } catch (error) {
      console.error('Error getting engagement score:', error);
      return { totalScore: 0, breakdown: {}, level: 'new' };
    }
  }
  
  calculateEngagementLevel(score) {
    if (score >= 1000) return 'superfan';
    if (score >= 500) return 'dedicated';
    if (score >= 100) return 'active';
    if (score >= 10) return 'casual';
    return 'new';
  }
  
  async runEngagementCampaign(campaignId) {
    // Implementation for automated engagement campaigns
    // This would be used for re-engagement, special promotions, etc.
  }
  
  async getTopFans(artistId, limit = 10) {
    try {
      // Get all fan engagement scores
      const pattern = `engagement:*:${artistId}`;
      const keys = await redisClient.keys(pattern);
      
      const fans = [];
      for (const key of keys) {
        const userId = key.split(':')[1];
        const score = await redisClient.get(key);
        
        if (score) {
          fans.push({ userId, score: parseInt(score) });
        }
      }
      
      // Sort by score and get top fans
      fans.sort((a, b) => b.score - a.score);
      const topFans = fans.slice(0, limit);
      
      // Get user details
      const userIds = topFans.map(f => f.userId);
      const users = await User.find({ _id: { $in: userIds } })
        .select('username profile.avatar profile.stageName');
      
      return topFans.map(fan => {
        const user = users.find(u => u._id.toString() === fan.userId);
        return {
          user,
          engagementScore: fan.score,
          level: this.calculateEngagementLevel(fan.score)
        };
      });
    } catch (error) {
      console.error('Error getting top fans:', error);
      return [];
    }
  }
  
  async scheduleEngagementReminders() {
    // Schedule periodic engagement reminders
    engagementQueue.add('engagement_reminder', {}, {
      repeat: { cron: '0 10 * * *' } // Daily at 10 AM
    });
  }
  
  async processEngagementReminder() {
    // Find users who haven't engaged recently
    const inactiveThreshold = new Date();
    inactiveThreshold.setDate(inactiveThreshold.getDate() - 7); // 7 days
    
    const inactiveUsers = await User.find({
      'analytics.lastEngagementAt': { $lt: inactiveThreshold },
      'preferences.notifications.engagement': true
    }).limit(1000);
    
    // Send re-engagement notifications
    const notifications = inactiveUsers.map(user => ({
      userId: user._id,
      data: {
        type: 'engagement_reminder',
        title: '🎵 Your favorite artists miss you!',
        body: 'Check out what you\'ve been missing',
        priority: 'normal'
      }
    }));
    
    await notificationService.sendBulkNotifications(notifications);
  }
}

module.exports = new EngagementEngine();