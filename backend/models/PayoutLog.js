const mongoose = require('mongoose');

const payoutLogSchema = new mongoose.Schema({
  artistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  stripePayoutId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'usd',
    lowercase: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_transit', 'paid', 'failed', 'canceled'],
    default: 'pending',
    index: true
  },
  method: {
    type: String,
    enum: ['standard', 'instant'],
    default: 'standard'
  },
  type: {
    type: String,
    enum: ['bank_account', 'card'],
    default: 'bank_account'
  },
  arrivalDate: {
    type: Date,
    required: true
  },
  created: {
    type: Date,
    required: true
  },
  paidAt: Date,
  failedAt: Date,
  failureCode: String,
  failureMessage: String,
  description: String,
  statementDescriptor: String,
  metadata: {
    period: String,
    subscriptionCount: Number,
    totalRevenue: Number
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
payoutLogSchema.index({ created: -1 });
payoutLogSchema.index({ artistId: 1, created: -1 });
payoutLogSchema.index({ status: 1, arrivalDate: 1 });

// Virtual for formatted amount
payoutLogSchema.virtual('formattedAmount').get(function() {
  return `$${(this.amount / 100).toFixed(2)} ${this.currency.toUpperCase()}`;
});

// Methods
payoutLogSchema.methods.getDaysUntilArrival = function() {
  if (this.status === 'paid') return 0;
  const now = new Date();
  const arrival = new Date(this.arrivalDate);
  const days = Math.ceil((arrival - now) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
};

// Statics
payoutLogSchema.statics.getArtistPayoutSummary = async function(artistId) {
  const summary = await this.aggregate([
    {
      $match: {
        artistId: mongoose.Types.ObjectId(artistId)
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  const result = {
    total: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    failed: { count: 0, amount: 0 }
  };

  summary.forEach(item => {
    result[item._id] = {
      count: item.count,
      amount: item.totalAmount
    };
    result.total.count += item.count;
    result.total.amount += item.totalAmount;
  });

  return result;
};

module.exports = mongoose.model('PayoutLog', payoutLogSchema);