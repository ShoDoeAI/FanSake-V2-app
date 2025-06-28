const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  title: String,
  description: String,
  size: Number,
  mimeType: String,
  url: String,
  uploadDate: {
    type: Date,
    default: Date.now
  },
  tier: {
    type: String,
    enum: ['free', 'supporter', 'superfan'],
    default: 'free'
  },
  plays: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  duration: Number, // For music/video in seconds
  genre: String, // For music
  imageType: String, // For images: profile, cover, gallery
  thumbnail: String // For videos
});

const ArtistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  stageName: {
    type: String,
    required: true
  },
  bio: String,
  genres: [String],
  musicTracks: [MediaSchema],
  images: [MediaSchema],
  videos: [MediaSchema],
  socialLinks: {
    spotify: String,
    soundcloud: String,
    instagram: String,
    twitter: String,
    youtube: String
  },
  stats: {
    totalFollowers: {
      type: Number,
      default: 0
    },
    totalPlays: {
      type: Number,
      default: 0
    },
    monthlyRevenue: {
      type: Number,
      default: 0
    },
    totalUploads: {
      type: Number,
      default: 0
    }
  },
  tierPricing: {
    supporter: {
      type: Number,
      default: 5
    },
    superfan: {
      type: Number,
      default: 15
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Update total uploads count when media is added/removed
ArtistSchema.pre('save', function(next) {
  this.stats.totalUploads = 
    (this.musicTracks?.length || 0) + 
    (this.images?.length || 0) + 
    (this.videos?.length || 0);
  next();
});

module.exports = mongoose.model('Artist', ArtistSchema);