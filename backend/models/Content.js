const mongoose = require('mongoose');
const { CONTENT_TYPES, FAN_TIERS } = require('../../shared/types');

const contentSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 2000
  },
  
  // Content Type
  contentType: {
    type: String,
    enum: Object.values(CONTENT_TYPES),
    required: true
  },
  
  // Creator
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Media Files
  media: {
    files: [{
      filename: String,
      originalName: String,
      mimeType: String,
      size: Number,
      url: String
    }],
    thumbnail: String,
    duration: Number // for audio/video content in seconds
  },
  
  // Access Control
  access: {
    isPublic: {
      type: Boolean,
      default: true
    },
    requiredTier: {
      type: String,
      enum: Object.values(FAN_TIERS),
      default: FAN_TIERS.CASUAL
    },
    price: {
      type: Number,
      default: 0 // For pay-per-view content
    }
  },
  
  // Music-specific fields
  musicInfo: {
    genre: String,
    tempo: Number,
    key: String,
    album: String,
    trackNumber: Number,
    releaseDate: Date,
    lyrics: String,
    credits: [{
      role: String, // producer, songwriter, etc.
      name: String
    }]
  },
  
  // Event-specific fields
  eventInfo: {
    startDate: Date,
    endDate: Date,
    venue: {
      name: String,
      address: String,
      city: String,
      country: String
    },
    ticketLink: String,
    maxAttendees: Number
  },
  
  // Merchandise-specific fields
  merchandiseInfo: {
    price: Number,
    currency: {
      type: String,
      default: 'USD'
    },
    inventory: Number,
    sizes: [String],
    colors: [String],
    shippingInfo: String
  },
  
  // Engagement Metrics
  metrics: {
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    comments: {
      type: Number,
      default: 0
    },
    downloads: {
      type: Number,
      default: 0
    }
  },
  
  // Tags and Discovery
  tags: [String],
  featured: {
    type: Boolean,
    default: false
  },
  trending: {
    type: Boolean,
    default: false
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  publishedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
contentSchema.index({ creator: 1 });
contentSchema.index({ contentType: 1 });
contentSchema.index({ 'access.requiredTier': 1 });
contentSchema.index({ tags: 1 });
contentSchema.index({ publishedAt: -1 });
contentSchema.index({ 'metrics.views': -1 });
contentSchema.index({ featured: 1 });
contentSchema.index({ trending: 1 });

// Virtual for engagement score
contentSchema.virtual('engagementScore').get(function() {
  const { views, likes, shares, comments } = this.metrics;
  return (views * 1) + (likes * 3) + (shares * 5) + (comments * 4);
});

// Method to check if user can access content
contentSchema.methods.canUserAccess = function(user) {
  // Public content is always accessible
  if (this.access.isPublic && this.access.requiredTier === FAN_TIERS.CASUAL) {
    return true;
  }
  
  // User must be logged in for non-public content
  if (!user) {
    return false;
  }
  
  // Artist can always access their own content
  if (this.creator.toString() === user._id.toString()) {
    return true;
  }
  
  // Check fan tier requirements
  if (user.userType === 'fan') {
    const userTierLevel = Object.values(FAN_TIERS).indexOf(user.fanInfo.tier);
    const requiredTierLevel = Object.values(FAN_TIERS).indexOf(this.access.requiredTier);
    
    return userTierLevel >= requiredTierLevel;
  }
  
  return false;
};

// Static method to get trending content
contentSchema.statics.getTrending = function(limit = 10) {
  return this.find({
    isActive: true,
    publishedAt: {
      $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    }
  })
  .sort({ 'metrics.views': -1, 'metrics.likes': -1 })
  .limit(limit)
  .populate('creator', 'username displayName artistInfo.stageName profileImage');
};

// Static method to get content by genre
contentSchema.statics.getByGenre = function(genre, limit = 20) {
  return this.find({
    isActive: true,
    'musicInfo.genre': genre,
    'access.isPublic': true
  })
  .sort({ publishedAt: -1 })
  .limit(limit)
  .populate('creator', 'username displayName artistInfo.stageName profileImage');
};

// Static method to get exclusive content for super fans
contentSchema.statics.getExclusiveContent = function(artistId) {
  return this.find({
    creator: artistId,
    'access.requiredTier': { $in: [FAN_TIERS.SUPPORTER, FAN_TIERS.SUPER_FAN] },
    isActive: true
  })
  .sort({ publishedAt: -1 })
  .populate('creator', 'username displayName artistInfo.stageName profileImage');
};

module.exports = mongoose.model('Content', contentSchema);

