const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  role: {
    type: String,
    enum: ['host', 'co-host', 'participant'],
    default: 'participant'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastSync: {
    timestamp: Number, // Track position in milliseconds
    syncedAt: Date
  }
}, { _id: false });

const chatMessageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true,
    maxLength: 500
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  reactions: [{
    user: mongoose.Schema.Types.ObjectId,
    emoji: String
  }]
}, { _id: false });

const listeningPartySchema = new mongoose.Schema({
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    maxLength: 100
  },
  description: {
    type: String,
    maxLength: 500
  },
  coverImage: String,
  
  // Party settings
  settings: {
    maxParticipants: {
      type: Number,
      default: 50,
      min: 2,
      max: 500
    },
    isPublic: {
      type: Boolean,
      default: true
    },
    requiresApproval: {
      type: Boolean,
      default: false
    },
    allowChat: {
      type: Boolean,
      default: true
    },
    allowReactions: {
      type: Boolean,
      default: true
    },
    tierRequired: {
      type: String,
      enum: ['free', 'supporter', 'superfan', null],
      default: null
    },
    scheduledStart: Date,
    duration: Number // in minutes
  },
  
  // Playlist
  playlist: [{
    track: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Track',
      required: true
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Current playback state
  playback: {
    currentTrack: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Track'
    },
    currentIndex: {
      type: Number,
      default: 0
    },
    position: {
      type: Number,
      default: 0
    },
    isPlaying: {
      type: Boolean,
      default: false
    },
    lastSync: {
      type: Date,
      default: Date.now
    },
    syncedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Participants
  participants: [participantSchema],
  pendingApprovals: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Chat history
  chatHistory: [chatMessageSchema],
  
  // Activity tracking
  activity: {
    reactions: [{
      user: mongoose.Schema.Types.ObjectId,
      emoji: String,
      timestamp: Date,
      trackId: mongoose.Schema.Types.ObjectId
    }],
    skips: [{
      user: mongoose.Schema.Types.ObjectId,
      trackId: mongoose.Schema.Types.ObjectId,
      timestamp: Date
    }],
    joins: [{
      user: mongoose.Schema.Types.ObjectId,
      timestamp: Date
    }],
    leaves: [{
      user: mongoose.Schema.Types.ObjectId,
      timestamp: Date
    }]
  },
  
  // Stats
  stats: {
    peakParticipants: {
      type: Number,
      default: 0
    },
    totalParticipants: {
      type: Number,
      default: 0
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    totalReactions: {
      type: Number,
      default: 0
    },
    averageListeningTime: {
      type: Number,
      default: 0
    }
  },
  
  // Status
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended', 'cancelled'],
    default: 'scheduled',
    index: true
  },
  startedAt: Date,
  endedAt: Date,
  
  // Integration
  integration: {
    discordChannelId: String,
    twitterSpaceId: String,
    youtubeStreamId: String
  }
}, {
  timestamps: true
});

// Indexes
listeningPartySchema.index({ status: 1, 'settings.isPublic': 1 });
listeningPartySchema.index({ host: 1, status: 1 });
listeningPartySchema.index({ 'participants.user': 1 });
listeningPartySchema.index({ 'settings.scheduledStart': 1 });

// Virtual for active participant count
listeningPartySchema.virtual('activeParticipantCount').get(function() {
  return this.participants.filter(p => p.isActive).length;
});

// Virtual for is live
listeningPartySchema.virtual('isLive').get(function() {
  return this.status === 'live';
});

// Virtual for can join
listeningPartySchema.virtual('canJoin').get(function() {
  return this.status === 'scheduled' || this.status === 'live';
});

// Methods
listeningPartySchema.methods.addParticipant = async function(userId, role = 'participant') {
  // Check if already participant
  const existing = this.participants.find(
    p => p.user.toString() === userId.toString()
  );
  
  if (existing) {
    existing.isActive = true;
    existing.joinedAt = new Date();
  } else {
    // Check max participants
    if (this.activeParticipantCount >= this.settings.maxParticipants) {
      throw new Error('Party is full');
    }
    
    this.participants.push({
      user: userId,
      role,
      isActive: true
    });
    
    this.stats.totalParticipants += 1;
    
    // Update peak participants
    const activeCount = this.activeParticipantCount;
    if (activeCount > this.stats.peakParticipants) {
      this.stats.peakParticipants = activeCount;
    }
  }
  
  // Track join activity
  this.activity.joins.push({
    user: userId,
    timestamp: new Date()
  });
  
  return this.save();
};

listeningPartySchema.methods.removeParticipant = async function(userId) {
  const participant = this.participants.find(
    p => p.user.toString() === userId.toString()
  );
  
  if (participant) {
    participant.isActive = false;
    
    // Track leave activity
    this.activity.leaves.push({
      user: userId,
      timestamp: new Date()
    });
    
    return this.save();
  }
  
  return this;
};

listeningPartySchema.methods.updatePlayback = async function(position, isPlaying, syncedBy) {
  this.playback.position = position;
  this.playback.isPlaying = isPlaying;
  this.playback.lastSync = new Date();
  this.playback.syncedBy = syncedBy;
  
  return this.save();
};

listeningPartySchema.methods.nextTrack = async function() {
  if (this.playback.currentIndex < this.playlist.length - 1) {
    this.playback.currentIndex += 1;
    this.playback.currentTrack = this.playlist[this.playback.currentIndex].track;
    this.playback.position = 0;
    this.playback.lastSync = new Date();
    
    return this.save();
  }
  
  // End party if no more tracks
  return this.endParty();
};

listeningPartySchema.methods.previousTrack = async function() {
  if (this.playback.currentIndex > 0) {
    this.playback.currentIndex -= 1;
    this.playback.currentTrack = this.playlist[this.playback.currentIndex].track;
    this.playback.position = 0;
    this.playback.lastSync = new Date();
    
    return this.save();
  }
  
  return this;
};

listeningPartySchema.methods.addChatMessage = async function(userId, message) {
  this.chatHistory.push({
    user: userId,
    message
  });
  
  this.stats.totalMessages += 1;
  
  // Keep only last 1000 messages
  if (this.chatHistory.length > 1000) {
    this.chatHistory = this.chatHistory.slice(-1000);
  }
  
  return this.save();
};

listeningPartySchema.methods.addReaction = async function(userId, emoji, trackId = null) {
  this.activity.reactions.push({
    user: userId,
    emoji,
    timestamp: new Date(),
    trackId: trackId || this.playback.currentTrack
  });
  
  this.stats.totalReactions += 1;
  
  return this.save();
};

listeningPartySchema.methods.startParty = async function() {
  if (this.status !== 'scheduled') {
    throw new Error('Party has already started or ended');
  }
  
  this.status = 'live';
  this.startedAt = new Date();
  
  // Set first track
  if (this.playlist.length > 0) {
    this.playback.currentTrack = this.playlist[0].track;
    this.playback.currentIndex = 0;
  }
  
  return this.save();
};

listeningPartySchema.methods.endParty = async function() {
  this.status = 'ended';
  this.endedAt = new Date();
  this.playback.isPlaying = false;
  
  // Calculate average listening time
  if (this.stats.totalParticipants > 0) {
    let totalTime = 0;
    this.activity.joins.forEach((join, index) => {
      const leave = this.activity.leaves.find(
        l => l.user.toString() === join.user.toString() && l.timestamp > join.timestamp
      );
      
      if (leave) {
        totalTime += (leave.timestamp - join.timestamp);
      } else if (this.endedAt) {
        totalTime += (this.endedAt - join.timestamp);
      }
    });
    
    this.stats.averageListeningTime = Math.round(totalTime / this.stats.totalParticipants / 1000 / 60); // in minutes
  }
  
  return this.save();
};

listeningPartySchema.methods.canUserJoin = async function(user) {
  // Check if party is joinable
  if (!this.canJoin) {
    return { allowed: false, reason: 'Party is not accepting participants' };
  }
  
  // Check tier requirement
  if (this.settings.tierRequired) {
    const tierHierarchy = { free: 0, supporter: 1, superfan: 2 };
    const requiredLevel = tierHierarchy[this.settings.tierRequired];
    const userLevel = tierHierarchy[user.tier || 'free'];
    
    if (userLevel < requiredLevel) {
      return { 
        allowed: false, 
        reason: `This party requires ${this.settings.tierRequired} tier or higher` 
      };
    }
  }
  
  // Check if full
  if (this.activeParticipantCount >= this.settings.maxParticipants) {
    return { allowed: false, reason: 'Party is full' };
  }
  
  // Check if requires approval
  if (this.settings.requiresApproval && user._id.toString() !== this.host.toString()) {
    const isPending = this.pendingApprovals.some(
      p => p.user.toString() === user._id.toString()
    );
    
    if (!isPending) {
      return { allowed: false, reason: 'Requires host approval', requiresApproval: true };
    }
  }
  
  return { allowed: true };
};

// Statics
listeningPartySchema.statics.getActiveParties = async function(limit = 20) {
  return this.find({
    status: 'live',
    'settings.isPublic': true
  })
    .sort({ 'stats.peakParticipants': -1 })
    .limit(limit)
    .populate('host', 'username profile.stageName profile.avatar')
    .populate('playback.currentTrack', 'title artist duration');
};

listeningPartySchema.statics.getUpcomingParties = async function(limit = 20) {
  const now = new Date();
  
  return this.find({
    status: 'scheduled',
    'settings.scheduledStart': { $gt: now },
    'settings.isPublic': true
  })
    .sort({ 'settings.scheduledStart': 1 })
    .limit(limit)
    .populate('host', 'username profile.stageName profile.avatar');
};

listeningPartySchema.statics.getUserParties = async function(userId, status = null) {
  const query = {
    $or: [
      { host: userId },
      { 'participants.user': userId }
    ]
  };
  
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .populate('host', 'username profile.stageName profile.avatar')
    .populate('playlist.track', 'title artist duration');
};

module.exports = mongoose.model('ListeningParty', listeningPartySchema);