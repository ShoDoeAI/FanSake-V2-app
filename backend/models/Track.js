const mongoose = require('mongoose');

const TrackSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  artist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artist',
    required: true
  },
  album: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Album'
  },
  duration: {
    type: Number, // Duration in seconds
    required: true
  },
  genre: {
    type: String,
    required: true
  },
  releaseDate: {
    type: Date,
    default: Date.now
  },
  playCount: {
    type: Number,
    default: 0
  },
  likeCount: {
    type: Number,
    default: 0
  },
  fileUrl: {
    type: String,
    required: true
  },
  coverArt: {
    type: String
  },
  isExplicit: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    bpm: Number,
    key: String,
    mood: [String],
    tags: [String]
  }
}, {
  timestamps: true
});

// Indexes for performance
TrackSchema.index({ artist: 1, releaseDate: -1 });
TrackSchema.index({ genre: 1, playCount: -1 });
TrackSchema.index({ title: 'text' });

// Virtual for formatted duration
TrackSchema.virtual('formattedDuration').get(function() {
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Instance methods
TrackSchema.methods.incrementPlayCount = async function() {
  this.playCount += 1;
  return this.save();
};

TrackSchema.methods.incrementLikeCount = async function() {
  this.likeCount += 1;
  return this.save();
};

// Static methods for mock data
TrackSchema.statics.findByArtist = async function(artistId) {
  return this.find({ artist: artistId, isActive: true }).sort('-releaseDate');
};

TrackSchema.statics.findPopular = async function(limit = 10) {
  return this.find({ isActive: true }).sort('-playCount').limit(limit);
};

module.exports = mongoose.model('Track', TrackSchema);