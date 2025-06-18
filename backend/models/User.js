const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { USER_TYPES, FAN_TIERS, MUSIC_GENRES } = require('../../shared/types');

const userSchema = new mongoose.Schema({
  // Basic Information
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  
  // User Type
  userType: {
    type: String,
    enum: Object.values(USER_TYPES),
    required: true
  },
  
  // Profile Information
  bio: {
    type: String,
    maxlength: 500
  },
  profileImage: {
    type: String, // URL or file path
    default: null
  },
  location: {
    city: String,
    country: String
  },
  
  // Music Preferences (for both artists and fans)
  genres: [{
    type: String,
    enum: MUSIC_GENRES
  }],
  
  // Artist-specific fields
  artistInfo: {
    stageName: String,
    formed: Date,
    description: String,
    socialLinks: {
      website: String,
      spotify: String,
      soundcloud: String,
      bandcamp: String,
      instagram: String,
      twitter: String,
      youtube: String
    },
    verified: {
      type: Boolean,
      default: false
    }
  },
  
  // Fan-specific fields
  fanInfo: {
    tier: {
      type: String,
      enum: Object.values(FAN_TIERS),
      default: FAN_TIERS.CASUAL
    },
    followedArtists: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    fanSince: {
      type: Date,
      default: Date.now
    },
    totalSpent: {
      type: Number,
      default: 0
    }
  },
  
  // Community Stats
  stats: {
    followers: {
      type: Number,
      default: 0
    },
    following: {
      type: Number,
      default: 0
    },
    posts: {
      type: Number,
      default: 0
    },
    discoveries: {
      type: Number,
      default: 0
    }
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ genres: 1 });
userSchema.index({ 'fanInfo.followedArtists': 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to get public profile (excluding sensitive data)
userSchema.methods.toPublicProfile = function() {
  const user = this.toObject();
  delete user.password;
  delete user.email;
  return user;
};

// Virtual for artist name
userSchema.virtual('name').get(function() {
  if (this.userType === USER_TYPES.ARTIST && this.artistInfo?.stageName) {
    return this.artistInfo.stageName;
  }
  return this.displayName;
});

// Static method to find artists by genre
userSchema.statics.findArtistsByGenre = function(genres) {
  return this.find({
    userType: USER_TYPES.ARTIST,
    genres: { $in: genres },
    isActive: true
  });
};

// Static method to get fan crossover recommendations
userSchema.statics.getFanCrossoverRecommendations = async function(userId) {
  const user = await this.findById(userId).populate('fanInfo.followedArtists');
  if (!user || user.userType !== USER_TYPES.FAN) {
    return [];
  }
  
  // Find other fans who follow similar artists
  const followedArtistIds = user.fanInfo.followedArtists.map(artist => artist._id);
  
  const similarFans = await this.find({
    _id: { $ne: userId },
    userType: USER_TYPES.FAN,
    'fanInfo.followedArtists': { $in: followedArtistIds }
  }).populate('fanInfo.followedArtists');
  
  // Get artists followed by similar fans but not by current user
  const recommendedArtists = new Set();
  similarFans.forEach(fan => {
    fan.fanInfo.followedArtists.forEach(artist => {
      if (!followedArtistIds.includes(artist._id.toString())) {
        recommendedArtists.add(artist._id.toString());
      }
    });
  });
  
  return Array.from(recommendedArtists);
};

module.exports = mongoose.model('User', userSchema);

