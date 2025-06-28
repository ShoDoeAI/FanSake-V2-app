const mongoose = require('mongoose');

const subscriptionTierSchema = new mongoose.Schema({
  price: { type: Number, required: true },
  features: [String]
}, { _id: false });

const fanEngagementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: String,
  tier: { type: String, enum: ['free', 'supporter', 'superfan'] },
  totalPlays: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  joinedDate: { type: Date, default: Date.now },
  lastActiveDate: { type: Date, default: Date.now },
  engagement: {
    plays: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    comments: { type: Number, default: 0 }
  }
}, { _id: false });

const artistEnhancedSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  stageName: {
    type: String,
    required: true,
    index: true
  },
  bio: {
    type: String,
    maxLength: 500
  },
  genres: [String],
  profileImage: String,
  headerImage: String,
  
  subscription_tiers: {
    free: {
      type: subscriptionTierSchema,
      default: {
        price: 0,
        features: [
          'Stream all music',
          'Follow artist',
          'Like tracks',
          'Share content'
        ]
      }
    },
    supporter: {
      type: subscriptionTierSchema,
      default: {
        price: 5,
        features: [
          'Everything in Free',
          'Early access 24 hours',
          'Exclusive tracks',
          'Monthly Q&A sessions',
          'Badge on profile',
          'Download 10 tracks/month'
        ]
      }
    },
    superfan: {
      type: subscriptionTierSchema,
      default: {
        price: 10,
        features: [
          'Everything in Supporter',
          'Direct messages (5/month)',
          'Virtual backstage access',
          'Live session invites',
          'Unlimited downloads',
          'Merch discounts (20%)',
          'Your name in credits'
        ]
      }
    }
  },
  
  analytics: {
    plays_30d: {
      type: Map,
      of: Number,
      default: new Map()
    },
    revenue_30d: {
      type: Map,
      of: Number,
      default: new Map()
    },
    top_fans: [fanEngagementSchema],
    conversion_funnel: {
      visitors: { type: Number, default: 0 },
      followers: { type: Number, default: 0 },
      supporters: { type: Number, default: 0 },
      superfans: { type: Number, default: 0 }
    }
  },
  
  stats: {
    totalFollowers: { type: Number, default: 0 },
    totalPlays: { type: Number, default: 0 },
    monthlyRevenue: { type: Number, default: 0 },
    totalUploads: { type: Number, default: 0 },
    monthlyListeners: { type: Number, default: 0 }
  },
  
  media: {
    tracks: [{
      filename: String,
      originalName: String,
      title: { type: String, required: true },
      description: String,
      size: Number,
      duration: Number,
      mimeType: String,
      url: String,
      s3Key: String,
      cloudFrontUrl: String,
      tier: {
        type: String,
        enum: ['free', 'supporter', 'superfan'],
        default: 'free'
      },
      genre: String,
      plays: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      uploadDate: { type: Date, default: Date.now },
      releaseDate: Date,
      isExclusive: { type: Boolean, default: false }
    }],
    images: [{
      filename: String,
      originalName: String,
      s3Key: String,
      cloudFrontUrl: String,
      type: {
        type: String,
        enum: ['profile', 'header', 'gallery', 'album'],
        required: true
      },
      uploadDate: { type: Date, default: Date.now }
    }],
    videos: [{
      filename: String,
      title: String,
      s3Key: String,
      cloudFrontUrl: String,
      duration: Number,
      tier: {
        type: String,
        enum: ['free', 'supporter', 'superfan'],
        default: 'free'
      },
      uploadDate: { type: Date, default: Date.now }
    }]
  },
  
  financial: {
    stripeAccountId: String,
    stripeCustomerId: String,
    isVerified: { type: Boolean, default: false },
    payoutEnabled: { type: Boolean, default: false },
    balance: {
      pending: { type: Number, default: 0 },
      available: { type: Number, default: 0 }
    }
  },
  
  socialLinks: {
    spotify: String,
    soundcloud: String,
    instagram: String,
    twitter: String,
    tiktok: String,
    youtube: String
  },
  
  settings: {
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    publicProfile: { type: Boolean, default: true },
    autoPublish: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

artistEnhancedSchema.index({ 'stats.totalFollowers': -1 });
artistEnhancedSchema.index({ 'analytics.conversion_funnel.superfans': -1 });
artistEnhancedSchema.index({ genres: 1 });
artistEnhancedSchema.index({ 'media.tracks.genre': 1 });

artistEnhancedSchema.methods.calculateMonthlyRevenue = function() {
  let total = 0;
  this.analytics.revenue_30d.forEach(value => total += value);
  return total;
};

artistEnhancedSchema.methods.getFanTierCounts = function() {
  const funnel = this.analytics.conversion_funnel;
  return {
    free: funnel.followers - funnel.supporters,
    supporter: funnel.supporters - funnel.superfans,
    superfan: funnel.superfans
  };
};

artistEnhancedSchema.methods.getConversionRates = function() {
  const funnel = this.analytics.conversion_funnel;
  return {
    visitorToFollower: funnel.visitors ? (funnel.followers / funnel.visitors * 100).toFixed(2) : 0,
    followerToSupporter: funnel.followers ? (funnel.supporters / funnel.followers * 100).toFixed(2) : 0,
    supporterToSuperfan: funnel.supporters ? (funnel.superfans / funnel.supporters * 100).toFixed(2) : 0
  };
};

artistEnhancedSchema.pre('save', function(next) {
  this.stats.totalUploads = 
    (this.media.tracks?.length || 0) + 
    (this.media.images?.length || 0) + 
    (this.media.videos?.length || 0);
  
  this.stats.monthlyRevenue = this.calculateMonthlyRevenue();
  
  next();
});

module.exports = mongoose.model('ArtistEnhanced', artistEnhancedSchema);