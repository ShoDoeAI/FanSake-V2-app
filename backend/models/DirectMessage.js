const mongoose = require('mongoose');

const directMessageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MessageConversation',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxLength: 1000
  },
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'audio', 'video'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    thumbnail: String,
    duration: Number, // For audio/video
    size: Number, // File size in bytes
    mimeType: String
  }],
  metadata: {
    isArtistMessage: { type: Boolean, default: false },
    fanTier: {
      type: String,
      enum: ['superfan'],
      required: true
    },
    quotaUsed: { type: Boolean, default: false },
    readAt: Date,
    deliveredAt: Date,
    editedAt: Date,
    deletedAt: Date
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DirectMessage'
  }
}, {
  timestamps: true
});

// Indexes for performance
directMessageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
directMessageSchema.index({ conversation: 1, createdAt: -1 });
directMessageSchema.index({ 'metadata.readAt': 1 });
directMessageSchema.index({ 'metadata.deletedAt': 1 });

// Virtual for message status
directMessageSchema.virtual('status').get(function() {
  if (this.metadata.deletedAt) return 'deleted';
  if (this.metadata.readAt) return 'read';
  if (this.metadata.deliveredAt) return 'delivered';
  return 'sent';
});

// Methods
directMessageSchema.methods.markAsRead = async function() {
  if (!this.metadata.readAt) {
    this.metadata.readAt = new Date();
    return this.save();
  }
  return this;
};

directMessageSchema.methods.markAsDelivered = async function() {
  if (!this.metadata.deliveredAt) {
    this.metadata.deliveredAt = new Date();
    return this.save();
  }
  return this;
};

directMessageSchema.methods.softDelete = async function() {
  this.metadata.deletedAt = new Date();
  this.content = '[Message deleted]';
  this.attachments = [];
  return this.save();
};

directMessageSchema.methods.addReaction = async function(userId, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    r => r.user.toString() !== userId.toString()
  );
  
  // Add new reaction
  if (emoji) {
    this.reactions.push({ user: userId, emoji });
  }
  
  return this.save();
};

// Statics
directMessageSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({
    recipient: userId,
    'metadata.readAt': null,
    'metadata.deletedAt': null
  });
};

// Message conversation schema
const messageConversationSchema = new mongoose.Schema({
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['artist', 'fan'],
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastReadAt: Date,
    notificationsEnabled: {
      type: Boolean,
      default: true
    }
  }],
  metadata: {
    artistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    fanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    fanTier: {
      type: String,
      enum: ['superfan'],
      required: true
    },
    monthlyQuota: {
      used: { type: Number, default: 0 },
      limit: { type: Number, default: 5 },
      resetDate: {
        type: Date,
        default: () => {
          const date = new Date();
          date.setMonth(date.getMonth() + 1);
          date.setDate(1);
          date.setHours(0, 0, 0, 0);
          return date;
        }
      }
    },
    isActive: { type: Boolean, default: true },
    isPinned: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    blockedAt: Date,
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  lastMessage: {
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date,
    type: {
      type: String,
      enum: ['text', 'image', 'audio', 'video']
    }
  },
  stats: {
    messageCount: { type: Number, default: 0 },
    artistResponseTime: { type: Number, default: 0 }, // Average in minutes
    lastArtistResponse: Date,
    unreadCount: {
      artist: { type: Number, default: 0 },
      fan: { type: Number, default: 0 }
    }
  }
}, {
  timestamps: true
});

// Indexes
messageConversationSchema.index({ 'metadata.artistId': 1, 'metadata.fanId': 1 }, { unique: true });
messageConversationSchema.index({ 'participants.user': 1, 'metadata.isActive': 1 });
messageConversationSchema.index({ 'lastMessage.timestamp': -1 });

// Methods
messageConversationSchema.methods.canSendMessage = function(userId) {
  // Check if conversation is active
  if (!this.metadata.isActive || this.metadata.blockedAt) {
    return { allowed: false, reason: 'conversation_blocked' };
  }
  
  const participant = this.participants.find(
    p => p.user.toString() === userId.toString()
  );
  
  if (!participant) {
    return { allowed: false, reason: 'not_participant' };
  }
  
  // Artists can always send messages
  if (participant.role === 'artist') {
    return { allowed: true };
  }
  
  // Check fan quota
  const quota = this.metadata.monthlyQuota;
  const now = new Date();
  
  // Reset quota if needed
  if (now >= quota.resetDate) {
    quota.used = 0;
    quota.resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  
  if (quota.used >= quota.limit) {
    return { allowed: false, reason: 'quota_exceeded', quotaInfo: quota };
  }
  
  return { allowed: true };
};

messageConversationSchema.methods.incrementQuota = async function() {
  this.metadata.monthlyQuota.used += 1;
  return this.save();
};

messageConversationSchema.methods.updateLastMessage = async function(message) {
  this.lastMessage = {
    content: message.content.substring(0, 100), // Preview only
    sender: message.sender,
    timestamp: message.createdAt,
    type: message.attachments.length > 0 ? message.attachments[0].type : 'text'
  };
  
  this.stats.messageCount += 1;
  
  // Update unread count
  if (message.metadata.isArtistMessage) {
    this.stats.unreadCount.fan += 1;
  } else {
    this.stats.unreadCount.artist += 1;
  }
  
  return this.save();
};

messageConversationSchema.methods.markAsRead = async function(userId) {
  const participant = this.participants.find(
    p => p.user.toString() === userId.toString()
  );
  
  if (participant) {
    participant.lastReadAt = new Date();
    
    // Reset unread count
    if (participant.role === 'artist') {
      this.stats.unreadCount.artist = 0;
    } else {
      this.stats.unreadCount.fan = 0;
    }
    
    return this.save();
  }
  
  return this;
};

messageConversationSchema.methods.updateResponseTime = async function(responseTime) {
  const count = this.stats.messageCount || 1;
  const currentAvg = this.stats.artistResponseTime || 0;
  
  // Calculate new average response time
  this.stats.artistResponseTime = Math.round(
    (currentAvg * (count - 1) + responseTime) / count
  );
  
  this.stats.lastArtistResponse = new Date();
  return this.save();
};

// Statics
messageConversationSchema.statics.getActiveConversations = async function(userId, role) {
  const query = {
    'participants.user': userId,
    'metadata.isActive': true,
    'metadata.blockedAt': null
  };
  
  return this.find(query)
    .sort({ 'lastMessage.timestamp': -1 })
    .populate('participants.user', 'username profile.avatar profile.stageName')
    .populate('lastMessage.sender', 'username profile.stageName');
};

messageConversationSchema.statics.getConversationStats = async function(artistId) {
  const conversations = await this.find({ 'metadata.artistId': artistId });
  
  const stats = {
    totalConversations: conversations.length,
    activeConversations: conversations.filter(c => c.metadata.isActive).length,
    averageResponseTime: 0,
    totalMessages: 0,
    unreadMessages: 0
  };
  
  conversations.forEach(conv => {
    stats.totalMessages += conv.stats.messageCount;
    stats.unreadMessages += conv.stats.unreadCount.artist;
  });
  
  if (conversations.length > 0) {
    const totalResponseTime = conversations.reduce(
      (sum, conv) => sum + conv.stats.artistResponseTime, 0
    );
    stats.averageResponseTime = Math.round(totalResponseTime / conversations.length);
  }
  
  return stats;
};

const DirectMessage = mongoose.model('DirectMessage', directMessageSchema);
const MessageConversation = mongoose.model('MessageConversation', messageConversationSchema);

module.exports = { DirectMessage, MessageConversation };