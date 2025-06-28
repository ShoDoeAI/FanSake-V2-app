const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  fan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  artist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Stripe data
  stripeSubscriptionId: {
    type: String,
    unique: true,
    sparse: true,
    required: true
  },
  stripeCustomerId: {
    type: String,
    required: true
  },
  stripePriceId: {
    type: String,
    required: true
  },
  stripePaymentMethodId: String,
  
  // Subscription details
  tier: {
    type: String,
    enum: ['supporter', 'superfan'],
    required: true
  },
  status: {
    type: String,
    enum: ['trialing', 'active', 'canceled', 'past_due', 'unpaid', 'incomplete'],
    default: 'active',
    index: true
  },
  
  // Billing periods
  currentPeriodStart: {
    type: Date,
    required: true
  },
  currentPeriodEnd: {
    type: Date,
    required: true,
    index: true
  },
  trialStart: Date,
  trialEnd: Date,
  canceledAt: Date,
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  
  // Financial tracking
  pricing: {
    amount: { type: Number, required: true }, // In cents
    currency: { type: String, default: 'usd' },
    interval: { type: String, default: 'month' },
    intervalCount: { type: Number, default: 1 }
  },
  financials: {
    totalPaid: { type: Number, default: 0 }, // In cents
    lastPaymentAmount: { type: Number, default: 0 },
    lastPaymentDate: Date,
    nextPaymentAmount: { type: Number, default: 0 },
    nextPaymentDate: Date,
    failedPayments: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 }
  },
  
  // Features snapshot (denormalized for performance)
  features: {
    earlyAccess: { type: Number, default: 0 },
    exclusiveTracks: { type: Boolean, default: false },
    liveSessions: { type: Boolean, default: false },
    directMessages: { type: Number, default: 0 },
    virtualBackstage: { type: Boolean, default: false },
    downloadEnabled: { type: Boolean, default: false },
    merchandiseDiscount: { type: Number, default: 0 }
  },
  
  // Metadata
  metadata: {
    source: { type: String, default: 'web' }, // web, mobile, api
    campaign: String,
    referrer: String,
    initialTier: String,
    upgradeHistory: [{
      from: String,
      to: String,
      date: Date,
      amount: Number
    }]
  },
  
  // Communication preferences
  notifications: {
    renewalReminder: { type: Boolean, default: true },
    paymentFailed: { type: Boolean, default: true },
    newContent: { type: Boolean, default: true },
    artistUpdates: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
subscriptionSchema.index({ fan: 1, artist: 1 }, { unique: true });
subscriptionSchema.index({ artist: 1, status: 1, tier: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1, status: 1 });
subscriptionSchema.index({ 'metadata.campaign': 1, status: 1 });

// Virtual for days until renewal
subscriptionSchema.virtual('daysUntilRenewal').get(function() {
  if (this.status !== 'active' || this.cancelAtPeriodEnd) return 0;
  const now = new Date();
  const end = new Date(this.currentPeriodEnd);
  const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
});

// Virtual for is active
subscriptionSchema.virtual('isActive').get(function() {
  return ['active', 'trialing'].includes(this.status);
});

// Methods
subscriptionSchema.methods.calculateLifetimeValue = function() {
  const monthsActive = Math.ceil(
    (Date.now() - this.createdAt) / (1000 * 60 * 60 * 24 * 30)
  );
  return this.financials.totalPaid / 100; // Convert cents to dollars
};

subscriptionSchema.methods.getChurnRisk = function() {
  const factors = {
    failedPayments: this.financials.failedPayments * 20,
    daysUntilRenewal: this.daysUntilRenewal < 7 ? 30 : 0,
    cancelAtPeriodEnd: this.cancelAtPeriodEnd ? 50 : 0,
    status: this.status === 'past_due' ? 40 : 0
  };
  
  const totalRisk = Object.values(factors).reduce((sum, val) => sum + val, 0);
  return Math.min(totalRisk, 100); // Cap at 100%
};

subscriptionSchema.methods.canAccessTier = function(requiredTier) {
  if (!this.isActive) return false;
  
  const tierHierarchy = {
    supporter: 1,
    superfan: 2
  };
  
  return tierHierarchy[this.tier] >= tierHierarchy[requiredTier];
};

// Static methods
subscriptionSchema.statics.getArtistSubscribers = async function(artistId, options = {}) {
  const {
    status = 'active',
    tier = null,
    page = 1,
    limit = 50
  } = options;
  
  const query = { artist: artistId };
  if (status) query.status = status;
  if (tier) query.tier = tier;
  
  const subscriptions = await this.find(query)
    .populate('fan', 'username email profile')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
    
  const total = await this.countDocuments(query);
  
  return {
    subscriptions,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

subscriptionSchema.statics.getRevenueAnalytics = async function(artistId, startDate, endDate) {
  const pipeline = [
    {
      $match: {
        artist: mongoose.Types.ObjectId(artistId),
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['active', 'canceled'] }
      }
    },
    {
      $group: {
        _id: {
          tier: '$tier',
          month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
        },
        count: { $sum: 1 },
        revenue: { $sum: '$pricing.amount' },
        churnedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] }
        }
      }
    },
    {
      $group: {
        _id: '$_id.month',
        tiers: {
          $push: {
            tier: '$_id.tier',
            count: '$count',
            revenue: '$revenue',
            churnedCount: '$churnedCount'
          }
        },
        totalRevenue: { $sum: '$revenue' },
        totalSubscribers: { $sum: '$count' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Middleware
subscriptionSchema.pre('save', function(next) {
  // Update features based on tier when tier changes
  if (this.isModified('tier')) {
    const tierFeatures = {
      supporter: {
        earlyAccess: 24,
        exclusiveTracks: true,
        liveSessions: false,
        directMessages: 0,
        virtualBackstage: false,
        downloadEnabled: false,
        merchandiseDiscount: 10
      },
      superfan: {
        earlyAccess: 48,
        exclusiveTracks: true,
        liveSessions: true,
        directMessages: 5,
        virtualBackstage: true,
        downloadEnabled: true,
        merchandiseDiscount: 20
      }
    };
    
    this.features = tierFeatures[this.tier] || tierFeatures.supporter;
  }
  
  next();
});

module.exports = mongoose.model('Subscription', subscriptionSchema);