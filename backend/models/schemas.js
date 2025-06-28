import mongoose from 'mongoose';

// Enhanced Artist Schema for production
const ArtistSchema = new mongoose.Schema({
  // Basic Info
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  artistName: { type: String, required: true, index: true },
  bio: { type: String, maxLength: 1000 },
  genres: [{ type: String, index: true }],
  profileImage: String,
  bannerImage: String,
  verified: { type: Boolean, default: false },
  
  // Subscription Tiers
  subscriptionTiers: {
    free: {
      enabled: { type: Boolean, default: true },
      features: {
        type: [String],
        default: ['stream_music', 'follow_artist', 'basic_updates']
      }
    },
    supporter: {
      enabled: { type: Boolean, default: true },
      price: { type: Number, default: 5 },
      currency: { type: String, default: 'USD' },
      features: {
        type: [String],
        default: ['everything_in_free', 'exclusive_content', 'early_access', 'supporter_badge']
      }
    },
    superfan: {
      enabled: { type: Boolean, default: true },
      price: { type: Number, default: 10 },
      currency: { type: String, default: 'USD' },
      features: {
        type: [String],
        default: ['everything_in_supporter', 'direct_messages', 'virtual_backstage', 'download_music', 'superfan_badge']
      }
    }
  },
  
  // Analytics
  analytics: {
    totalPlays: { type: Number, default: 0 },
    totalFans: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    plays30d: { type: Map, of: Number }, // date -> play count
    revenue30d: { type: Map, of: Number }, // date -> revenue
    topFans: [{
      fanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fan' },
      totalSpent: Number,
      engagementScore: Number,
      lastActive: Date
    }],
    conversionFunnel: {
      visitors: { type: Number, default: 0 },
      freeSignups: { type: Number, default: 0 },
      supporters: { type: Number, default: 0 },
      superfans: { type: Number, default: 0 }
    }
  },
  
  // Content
  musicTracks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Track'
  }],
  
  // Stripe Integration
  stripe: {
    accountId: String,
    customerId: String,
    onboardingComplete: { type: Boolean, default: false }
  },
  
  // Settings
  settings: {
    emailNotifications: { type: Boolean, default: true },
    autoPublishToSocial: { type: Boolean, default: false },
    allowDirectMessages: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Track Schema for music
const TrackSchema = new mongoose.Schema({
  artistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
  title: { type: String, required: true },
  duration: Number, // in seconds
  
  // File Storage
  files: {
    original: String, // S3 URL
    hls: { // For streaming
      playlist: String, // .m3u8 file
      segments: [String] // .ts files
    },
    thumbnail: String
  },
  
  // Metadata
  genre: String,
  releaseDate: { type: Date, default: Date.now },
  exclusiveTier: { type: String, enum: ['free', 'supporter', 'superfan'], default: 'free' },
  earlyAccessHours: { type: Number, default: 0 }, // Hours before public release
  
  // Analytics
  analytics: {
    totalPlays: { type: Number, default: 0 },
    uniqueListeners: { type: Number, default: 0 },
    avgListenDuration: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    likes: { type: Number, default: 0 }
  },
  
  // Features
  downloadEnabled: { type: Boolean, default: false },
  lyrics: String,
  credits: String,
  tags: [String]
}, {
  timestamps: true
});

// Fan Schema
const FanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  displayName: { type: String, required: true },
  profileImage: String,
  
  // Subscriptions
  subscriptions: [{
    artistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist' },
    tier: { type: String, enum: ['free', 'supporter', 'superfan'] },
    startDate: Date,
    nextBillingDate: Date,
    status: { type: String, enum: ['active', 'cancelled', 'past_due'] },
    stripeSubscriptionId: String
  }],
  
  // Engagement
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artist' }],
  likedTracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
  playlists: [{
    name: String,
    tracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
    isPublic: { type: Boolean, default: false }
  }],
  
  // Analytics
  analytics: {
    totalSpent: { type: Number, default: 0 },
    artistsSupported: { type: Number, default: 0 },
    hoursListened: { type: Number, default: 0 },
    favoriteGenres: [String]
  },
  
  // Rewards & Achievements
  badges: [{
    type: { type: String },
    earnedDate: Date,
    artistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist' }
  }],
  
  // Stripe
  stripe: {
    customerId: String
  }
}, {
  timestamps: true
});

// Indexes for performance
ArtistSchema.index({ 'analytics.totalRevenue': -1 });
ArtistSchema.index({ 'analytics.totalFans': -1 });
TrackSchema.index({ artistId: 1, releaseDate: -1 });
TrackSchema.index({ 'analytics.totalPlays': -1 });
FanSchema.index({ userId: 1 });
FanSchema.index({ 'subscriptions.artistId': 1 });

export const Artist = mongoose.model('Artist', ArtistSchema);
export const Track = mongoose.model('Track', TrackSchema);
export const Fan = mongoose.model('Fan', FanSchema);