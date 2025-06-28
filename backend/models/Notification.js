const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'new_message',
      'new_follower',
      'new_content',
      'listening_party',
      'party_join_request',
      'party_join_approved',
      'milestone',
      'subscription',
      'subscription_expired',
      'payment_success',
      'payment_failed',
      'early_access',
      'exclusive_content',
      'live_stream',
      'comment',
      'like',
      'mention',
      'system'
    ],
    index: true
  },
  title: {
    type: String,
    required: true,
    maxLength: 100
  },
  body: {
    type: String,
    required: true,
    maxLength: 500
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: Date,
  scheduled: {
    type: Boolean,
    default: false
  },
  scheduledFor: Date,
  sentAt: Date,
  
  // Action buttons
  actions: [{
    label: String,
    url: String,
    type: {
      type: String,
      enum: ['primary', 'secondary', 'danger']
    }
  }],
  
  // Related entities
  relatedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  relatedContent: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedContentType'
  },
  relatedContentType: {
    type: String,
    enum: ['Track', 'Album', 'Post', 'Video', 'LiveStream', 'ListeningParty']
  },
  
  // Delivery status
  delivery: {
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      error: String
    },
    push: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      error: String
    },
    sms: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      error: String
    }
  },
  
  // Grouping
  groupId: String, // For grouping similar notifications
  groupCount: {
    type: Number,
    default: 1
  },
  
  expiresAt: Date
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ scheduled: 1, scheduledFor: 1 });

// Virtual for age
notificationSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt;
});

// Virtual for is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Methods
notificationSchema.methods.markAsRead = async function() {
  if (!this.read) {
    this.read = true;
    this.readAt = new Date();
    return this.save();
  }
  return this;
};

notificationSchema.methods.markAsDelivered = async function(channel) {
  if (this.delivery[channel] && !this.delivery[channel].sent) {
    this.delivery[channel].sent = true;
    this.delivery[channel].sentAt = new Date();
    return this.save();
  }
  return this;
};

notificationSchema.methods.markDeliveryError = async function(channel, error) {
  if (this.delivery[channel]) {
    this.delivery[channel].error = error;
    return this.save();
  }
  return this;
};

// Statics
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({
    user: userId,
    read: false,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

notificationSchema.statics.getGroupedNotifications = async function(userId, limit = 50) {
  const notifications = await this.find({
    user: userId,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('relatedUser', 'username profile.avatar profile.stageName')
    .populate('relatedContent');
  
  // Group similar notifications
  const grouped = {};
  const standalone = [];
  
  notifications.forEach(notification => {
    if (notification.groupId) {
      if (!grouped[notification.groupId]) {
        grouped[notification.groupId] = {
          ...notification.toObject(),
          notifications: [notification]
        };
      } else {
        grouped[notification.groupId].notifications.push(notification);
        grouped[notification.groupId].groupCount = grouped[notification.groupId].notifications.length;
      }
    } else {
      standalone.push(notification);
    }
  });
  
  // Combine grouped and standalone
  const result = [
    ...Object.values(grouped),
    ...standalone
  ].sort((a, b) => {
    const aDate = a.createdAt || a.notifications[0].createdAt;
    const bDate = b.createdAt || b.notifications[0].createdAt;
    return bDate - aDate;
  });
  
  return result;
};

notificationSchema.statics.cleanupOldNotifications = async function(daysToKeep = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const result = await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    read: true
  });
  
  return result.deletedCount;
};

notificationSchema.statics.createBulkNotifications = async function(notificationsData) {
  // Group by type for efficiency
  const grouped = {};
  
  notificationsData.forEach(data => {
    const key = `${data.type}_${data.title}`;
    if (!grouped[key]) {
      grouped[key] = {
        ...data,
        users: [data.user],
        groupId: `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
    } else {
      grouped[key].users.push(data.user);
    }
  });
  
  // Create notifications
  const notifications = [];
  
  for (const group of Object.values(grouped)) {
    const { users, ...notificationData } = group;
    
    for (const userId of users) {
      notifications.push({
        ...notificationData,
        user: userId
      });
    }
  }
  
  return this.insertMany(notifications);
};

// Middleware
notificationSchema.pre('save', function(next) {
  // Set sentAt if not scheduled
  if (!this.scheduled && !this.sentAt) {
    this.sentAt = new Date();
  }
  
  // Set expiration for certain types
  if (!this.expiresAt) {
    const expirationDays = {
      'system': 7,
      'like': 30,
      'comment': 30,
      'new_follower': 60
    };
    
    if (expirationDays[this.type]) {
      this.expiresAt = new Date();
      this.expiresAt.setDate(this.expiresAt.getDate() + expirationDays[this.type]);
    }
  }
  
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);