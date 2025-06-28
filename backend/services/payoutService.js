const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ArtistEnhanced = require('../models/ArtistEnhanced');
const PayoutLog = require('../models/PayoutLog');
const redisClient = require('../config/redis');

class PayoutService {
  constructor() {
    this.stripe = stripe;
    this.minimumPayoutAmount = parseInt(process.env.MINIMUM_PAYOUT_AMOUNT) || 1000; // $10 minimum
  }

  // Process monthly payouts for all artists
  async processMonthlyPayouts() {
    try {
      console.log('🏦 Starting monthly payout processing...');
      
      // Get all artists with pending payouts above minimum
      const artists = await ArtistEnhanced.find({
        'revenue.available': { $gte: this.minimumPayoutAmount },
        'financial.payoutEnabled': true,
        'financial.stripeAccountId': { $exists: true }
      });

      console.log(`Found ${artists.length} artists eligible for payout`);

      const results = {
        successful: 0,
        failed: 0,
        total: 0,
        errors: []
      };

      for (const artist of artists) {
        try {
          const payout = await this.createArtistPayout(artist);
          if (payout) {
            results.successful++;
            results.total += payout.amount;
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            artistId: artist.userId,
            error: error.message
          });
        }
      }

      console.log(`✅ Payout processing complete:`, results);
      return results;

    } catch (error) {
      console.error('Monthly payout processing error:', error);
      throw error;
    }
  }

  // Create payout for individual artist
  async createArtistPayout(artist) {
    try {
      const payoutAmount = artist.revenue.available;
      
      if (payoutAmount < this.minimumPayoutAmount) {
        console.log(`Artist ${artist.userId} balance ${payoutAmount} below minimum`);
        return null;
      }

      // Create Stripe payout
      const payout = await this.stripe.payouts.create({
        amount: payoutAmount,
        currency: artist.revenue.currency || 'usd',
        destination: artist.financial.stripeAccountId,
        description: `MusicConnect payout for ${new Date().toISOString().slice(0, 7)}`,
        metadata: {
          artistId: artist.userId.toString(),
          period: new Date().toISOString().slice(0, 7)
        }
      }, {
        stripeAccount: artist.financial.stripeAccountId
      });

      // Update artist balance
      await ArtistEnhanced.findByIdAndUpdate(artist._id, {
        $inc: {
          'revenue.available': -payoutAmount,
          'revenue.lifetime': payoutAmount
        },
        'revenue.lastPayout': {
          amount: payoutAmount,
          date: new Date(),
          stripePayoutId: payout.id
        }
      });

      // Create payout log
      await PayoutLog.create({
        artistId: artist.userId,
        stripePayoutId: payout.id,
        amount: payoutAmount,
        currency: payout.currency,
        status: 'pending',
        method: payout.method,
        arrivalDate: new Date(payout.arrival_date * 1000),
        created: new Date(payout.created * 1000)
      });

      // Track in analytics
      await redisClient.incrementMetric('payouts_total', payoutAmount);
      await redisClient.incrementMetric('payouts_count');

      console.log(`✅ Payout created for artist ${artist.userId}: $${payoutAmount / 100}`);
      return payout;

    } catch (error) {
      console.error(`Error creating payout for artist ${artist.userId}:`, error);
      throw error;
    }
  }

  // Handle payout webhook events
  async handlePayoutEvent(event) {
    const payout = event.data.object;
    
    try {
      const payoutLog = await PayoutLog.findOne({ 
        stripePayoutId: payout.id 
      });
      
      if (!payoutLog) {
        console.warn(`Payout log not found for ${payout.id}`);
        return;
      }

      // Update payout status
      payoutLog.status = payout.status;
      payoutLog.failureCode = payout.failure_code;
      payoutLog.failureMessage = payout.failure_message;
      
      if (payout.status === 'paid') {
        payoutLog.paidAt = new Date();
      } else if (payout.status === 'failed') {
        payoutLog.failedAt = new Date();
        
        // Refund the amount back to artist's available balance
        await ArtistEnhanced.findOneAndUpdate(
          { userId: payoutLog.artistId },
          {
            $inc: {
              'revenue.available': payout.amount
            }
          }
        );
      }
      
      await payoutLog.save();

      // Send notification based on status
      if (payout.status === 'paid') {
        await this.sendPayoutNotification(payoutLog.artistId, 'success', {
          amount: payout.amount / 100,
          arrivalDate: payout.arrival_date
        });
      } else if (payout.status === 'failed') {
        await this.sendPayoutNotification(payoutLog.artistId, 'failed', {
          amount: payout.amount / 100,
          reason: payout.failure_message
        });
      }

    } catch (error) {
      console.error('Error handling payout event:', error);
      throw error;
    }
  }

  // Create connected account for artist
  async createConnectedAccount(artistId, accountData) {
    try {
      const artist = await ArtistEnhanced.findOne({ userId: artistId });
      if (!artist) {
        throw new Error('Artist not found');
      }

      // Create Stripe connected account
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: accountData.country || 'US',
        email: accountData.email,
        capabilities: {
          transfers: { requested: true }
        },
        business_type: 'individual',
        business_profile: {
          name: artist.profile.stageName,
          product_description: 'Music and content creation on MusicConnect',
          mcc: '5735', // Record stores
          url: `${process.env.FRONTEND_URL}/artist/${artistId}`
        },
        metadata: {
          artistId: artistId.toString()
        }
      });

      // Update artist with Stripe account ID
      artist.financial.stripeAccountId = account.id;
      await artist.save();

      // Create account link for onboarding
      const accountLink = await this.stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.FRONTEND_URL}/artist/settings/payouts`,
        return_url: `${process.env.FRONTEND_URL}/artist/settings/payouts?success=true`,
        type: 'account_onboarding'
      });

      return {
        accountId: account.id,
        onboardingUrl: accountLink.url
      };

    } catch (error) {
      console.error('Error creating connected account:', error);
      throw error;
    }
  }

  // Get payout history for artist
  async getPayoutHistory(artistId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status = null
      } = options;

      const query = { artistId };
      if (status) query.status = status;

      const payouts = await PayoutLog.find(query)
        .sort({ created: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

      const total = await PayoutLog.countDocuments(query);

      return {
        payouts,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      console.error('Error getting payout history:', error);
      throw error;
    }
  }

  // Get payout analytics
  async getPayoutAnalytics(artistId, period = '12m') {
    try {
      const endDate = new Date();
      const startDate = new Date();
      
      if (period === '12m') {
        startDate.setMonth(startDate.getMonth() - 12);
      } else if (period === '6m') {
        startDate.setMonth(startDate.getMonth() - 6);
      } else if (period === '3m') {
        startDate.setMonth(startDate.getMonth() - 3);
      }

      const pipeline = [
        {
          $match: {
            artistId: mongoose.Types.ObjectId(artistId),
            created: { $gte: startDate, $lte: endDate },
            status: 'paid'
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$created' },
              month: { $month: '$created' }
            },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
            avgAmount: { $avg: '$amount' }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        }
      ];

      const monthlyPayouts = await PayoutLog.aggregate(pipeline);

      const totalPaid = await PayoutLog.aggregate([
        {
          $match: {
            artistId: mongoose.Types.ObjectId(artistId),
            status: 'paid'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      return {
        period,
        monthly: monthlyPayouts.map(p => ({
          month: `${p._id.year}-${String(p._id.month).padStart(2, '0')}`,
          amount: p.totalAmount,
          count: p.count,
          average: Math.round(p.avgAmount)
        })),
        lifetime: {
          total: totalPaid[0]?.total || 0,
          count: totalPaid[0]?.count || 0,
          average: totalPaid[0] ? Math.round(totalPaid[0].total / totalPaid[0].count) : 0
        }
      };

    } catch (error) {
      console.error('Error getting payout analytics:', error);
      throw error;
    }
  }

  // Update payout settings
  async updatePayoutSettings(artistId, settings) {
    try {
      const artist = await ArtistEnhanced.findOne({ userId: artistId });
      if (!artist) {
        throw new Error('Artist not found');
      }

      // Update payout schedule
      if (settings.payoutSchedule) {
        artist.financial.payoutSchedule = settings.payoutSchedule;
      }

      // Update minimum payout amount
      if (settings.minimumPayout) {
        artist.financial.minimumPayout = settings.minimumPayout;
      }

      // Update tax form status
      if (settings.taxForm) {
        artist.financial.taxForm = {
          submitted: true,
          type: settings.taxForm.type,
          submittedAt: new Date()
        };
      }

      await artist.save();

      return artist.financial;

    } catch (error) {
      console.error('Error updating payout settings:', error);
      throw error;
    }
  }

  // Send payout notification
  async sendPayoutNotification(artistId, type, data) {
    // This would integrate with your notification service
    console.log(`Sending ${type} payout notification to artist ${artistId}`, data);
  }

  // Calculate estimated payout date
  getEstimatedPayoutDate(schedule = 'weekly') {
    const now = new Date();
    const estimatedDate = new Date(now);

    switch (schedule) {
      case 'daily':
        estimatedDate.setDate(estimatedDate.getDate() + 2); // T+2
        break;
      case 'weekly':
        const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
        estimatedDate.setDate(estimatedDate.getDate() + daysUntilFriday + 2);
        break;
      case 'monthly':
        estimatedDate.setMonth(estimatedDate.getMonth() + 1);
        estimatedDate.setDate(1);
        estimatedDate.setDate(estimatedDate.getDate() + 2);
        break;
    }

    return estimatedDate;
  }

  // Verify artist's bank account
  async verifyBankAccount(artistId) {
    try {
      const artist = await ArtistEnhanced.findOne({ userId: artistId });
      if (!artist || !artist.financial.stripeAccountId) {
        throw new Error('Artist account not found');
      }

      // Get Stripe account
      const account = await this.stripe.accounts.retrieve(
        artist.financial.stripeAccountId
      );

      // Check if fully onboarded
      const isVerified = account.charges_enabled && account.payouts_enabled;

      // Update artist verification status
      artist.financial.isVerified = isVerified;
      artist.financial.payoutEnabled = isVerified;
      await artist.save();

      return {
        verified: isVerified,
        requiresAction: !isVerified,
        requirements: account.requirements
      };

    } catch (error) {
      console.error('Error verifying bank account:', error);
      throw error;
    }
  }
}

// Create singleton instance
const payoutService = new PayoutService();

module.exports = payoutService;