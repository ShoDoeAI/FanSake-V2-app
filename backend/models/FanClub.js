const mongoose = require('mongoose');

const exclusiveContentSchema = new mongoose.Schema({
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'contentType'
  },
  contentType: {
    type: String,
    required: true,
    enum: ['Track', 'Video', 'Post', 'LiveStream']
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  tier: {
    type: String,
    enum: ['supporter', 'superfan'],
    required: true
  },
  releaseDate: {
    type: Date,
    required: true
  },
  expiresAt: Date,
  engagement: {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 }
  }
}, { _id: false });

const milestoneSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['follower_count', 'streaming_minutes', 'support_duration', 'engagement_score'],
    required: true
  },
  value: {
    type: Number,
    required: true
  },
  achievedAt: {
    type: Date,
    default: Date.now
  },
  reward: {
    type: {
      type: String,
      enum: ['badge', 'exclusive_content', 'discount', 'merchandise', 'meet_greet']
    },
    details: mongoose.Schema.Types.Mixed
  }
}, { _id: false });

const fanClubSchema = new mongoose.Schema({
  artist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    maxLength: 1000
  },
  coverImage: String,
  
  // Membership tiers configuration
  tiers: {
    supporter: {
      perks: [{
        type: String,
        enum: [
          'early_access',
          'exclusive_tracks',
          'behind_scenes',
          'monthly_qa',
          'discord_access',
          'badge'
        ]
      }],
      earlyAccessHours: { type: Number, default: 24 },
      monthlyContentQuota: { type: Number, default: 5 },
      customPerks: [String]
    },
    superfan: {
      perks: [{
        type: String,
        enum: [
          'early_access',
          'exclusive_tracks',
          'behind_scenes',
          'monthly_qa',
          'discord_access',
          'badge',
          'direct_messages',
          'virtual_backstage',
          'live_sessions',
          'merchandise_discount',
          'meet_greets'
        ]
      }],
      earlyAccessHours: { type: Number, default: 48 },
      monthlyContentQuota: { type: Number, default: -1 }, // Unlimited
      directMessagesPerMonth: { type: Number, default: 5 },
      customPerks: [String]
    }
  },
  
  // Exclusive content management
  exclusiveContent: [exclusiveContentSchema],
  
  // Member statistics
  stats: {
    totalMembers: { type: Number, default: 0, index: true },
    supporterCount: { type: Number, default: 0 },
    superfanCount: { type: Number, default: 0 },
    monthlyRevenue: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
    retentionRate: { type: Number, default: 0 }
  },
  
  // Community features
  community: {
    discordServerId: String,
    discordInviteLink: String,
    forumEnabled: { type: Boolean, default: false },
    chatEnabled: { type: Boolean, default: true },
    eventsEnabled: { type: Boolean, default: true }
  },
  
  // Milestone rewards
  milestones: {
    achieved: [milestoneSchema],
    upcoming: [{
      type: { type: String },
      targetValue: Number,
      currentValue: Number,
      reward: mongoose.Schema.Types.Mixed
    }]
  },
  
  // Settings
  settings: {
    autoApproveContent: { type: Boolean, default: false },
    moderationEnabled: { type: Boolean, default: true },
    allowGuestPreviews: { type: Boolean, default: true },
    customBranding: {
      primaryColor: String,
      secondaryColor: String,
      font: String
    }
  }
}, {
  timestamps: true
});

// Indexes
fanClubSchema.index({ artist: 1, 'stats.totalMembers': -1 });
fanClubSchema.index({ 'exclusiveContent.releaseDate': -1 });
fanClubSchema.index({ 'exclusiveContent.tier': 1, 'exclusiveContent.releaseDate': -1 });

// Virtual for active exclusive content
fanClubSchema.virtual('activeExclusiveContent').get(function() {
  const now = new Date();
  return this.exclusiveContent.filter(content => {
    return content.releaseDate <= now && 
           (!content.expiresAt || content.expiresAt > now);
  });
});

// Methods
fanClubSchema.methods.addExclusiveContent = async function(contentData) {
  this.exclusiveContent.push(contentData);
  
  // Sort by release date (newest first)
  this.exclusiveContent.sort((a, b) => b.releaseDate - a.releaseDate);
  
  // Keep only last 100 items to prevent document size issues
  if (this.exclusiveContent.length > 100) {
    this.exclusiveContent = this.exclusiveContent.slice(0, 100);
  }
  
  return this.save();
};

fanClubSchema.methods.canAccessContent = function(contentId, userTier) {
  const content = this.exclusiveContent.find(
    c => c.contentId.toString() === contentId.toString()
  );
  
  if (!content) return false;
  
  const now = new Date();
  
  // Check if content is released
  if (content.releaseDate > now) {
    // Check early access
    const earlyAccessHours = this.tiers[userTier]?.earlyAccessHours || 0;
    const hoursUntilRelease = (content.releaseDate - now) / (1000 * 60 * 60);
    
    if (hoursUntilRelease > earlyAccessHours) {
      return false;
    }
  }
  
  // Check if content is expired
  if (content.expiresAt && content.expiresAt < now) {
    return false;
  }
  
  // Check tier access
  const tierHierarchy = { supporter: 1, superfan: 2 };
  return tierHierarchy[userTier] >= tierHierarchy[content.tier];
};

fanClubSchema.methods.updateStats = async function() {
  // This would be called periodically to update engagement metrics
  const totalEngagement = this.exclusiveContent.reduce((sum, content) => {
    return sum + content.engagement.views + 
           content.engagement.likes + 
           content.engagement.comments;
  }, 0);
  
  if (this.stats.totalMembers > 0) {
    this.stats.engagementRate = (totalEngagement / this.stats.totalMembers / 30).toFixed(2);
  }
  
  return this.save();
};

fanClubSchema.methods.checkMilestones = async function(memberId, metricType, newValue) {
  const upcomingMilestone = this.milestones.upcoming.find(
    m => m.type === metricType && newValue >= m.targetValue
  );
  
  if (upcomingMilestone) {
    // Move to achieved
    this.milestones.achieved.push({
      type: metricType,
      value: upcomingMilestone.targetValue,
      achievedAt: new Date(),
      reward: upcomingMilestone.reward
    });
    
    // Remove from upcoming
    this.milestones.upcoming = this.milestones.upcoming.filter(
      m => m !== upcomingMilestone
    );
    
    await this.save();
    
    // Return milestone for notification
    return {
      memberId,
      milestone: upcomingMilestone,
      achieved: true
    };
  }
  
  return null;
};

// Statics
fanClubSchema.statics.getTopClubs = async function(limit = 10) {
  return this.find({ 'stats.totalMembers': { $gt: 0 } })
    .sort({ 'stats.totalMembers': -1 })
    .limit(limit)
    .populate('artist', 'username profile.stageName');
};

fanClubSchema.statics.getTrendingContent = async function(limit = 20) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const clubs = await this.find({
    'exclusiveContent.releaseDate': { $gte: dayAgo }
  }).select('exclusiveContent artist');
  
  // Flatten and sort by engagement
  const allContent = [];
  clubs.forEach(club => {
    club.exclusiveContent.forEach(content => {
      if (content.releaseDate >= dayAgo) {
        allContent.push({
          ...content.toObject(),
          artistId: club.artist,
          clubId: club._id,
          engagementScore: content.engagement.views + 
                          (content.engagement.likes * 2) + 
                          (content.engagement.comments * 3)
        });
      }
    });
  });
  
  return allContent
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, limit);
};

module.exports = mongoose.model('FanClub', fanClubSchema);