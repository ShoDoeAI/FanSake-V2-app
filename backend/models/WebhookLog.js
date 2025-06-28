const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['received', 'processing', 'processed', 'failed', 'retrying'],
    default: 'received',
    index: true
  },
  receivedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  processedAt: Date,
  failedAt: Date,
  retryCount: {
    type: Number,
    default: 0
  },
  nextRetryAt: Date,
  error: String,
  payload: {
    type: mongoose.Schema.Types.Mixed,
    select: false // Don't return by default for security
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
webhookLogSchema.index({ receivedAt: -1 });
webhookLogSchema.index({ status: 1, nextRetryAt: 1 }); // For retry processing

// Auto-delete old logs after 90 days
webhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

module.exports = mongoose.model('WebhookLog', webhookLogSchema);