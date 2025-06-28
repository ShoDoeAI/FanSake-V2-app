const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Subscription = require('../models/Subscription');
const ArtistEnhanced = require('../models/ArtistEnhanced');
const User = require('../models/User');
const redisClient = require('../config/redis');

class StripeService {
  constructor() {
    this.stripe = stripe;
    this.platformFeePercent = parseInt(process.env.PLATFORM_FEE_PERCENT) || 10;
    this.stripeFeeFixed = 30; // 30 cents in cents
    this.stripeFeePercent = 2.9; // 2.9%
    
    // Price IDs for subscription tiers
    this.priceIds = {
      supporter: process.env.STRIPE_PRICE_SUPPORTER || 'price_supporter',
      superfan: process.env.STRIPE_PRICE_SUPERFAN || 'price_superfan'
    };
  }

  // Create or get Stripe customer
  async createOrGetCustomer(user) {
    try {
      // Check if user already has a Stripe customer ID
      if (user.stripeCustomerId) {
        const customer = await this.stripe.customers.retrieve(user.stripeCustomerId);
        if (!customer.deleted) {
          return customer;
        }
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.username,
        metadata: {
          userId: user._id.toString(),
          userType: user.userType
        }
      });

      // Update user with Stripe customer ID
      await User.findByIdAndUpdate(user._id, {
        stripeCustomerId: customer.id
      });

      return customer;
    } catch (error) {
      console.error('Error creating/getting Stripe customer:', error);
      throw error;
    }
  }

  // Create subscription for fan
  async createSubscription(fanId, artistId, tier, paymentMethodId) {
    try {
      // Get fan and artist
      const [fan, artist] = await Promise.all([
        User.findById(fanId),
        ArtistEnhanced.findOne({ userId: artistId })
      ]);

      if (!fan || !artist) {
        throw new Error('Fan or artist not found');
      }

      // Check if subscription already exists
      const existingSubscription = await Subscription.findOne({
        fan: fanId,
        artist: artistId,
        status: { $in: ['active', 'trialing'] }
      });

      if (existingSubscription) {
        throw new Error('Active subscription already exists');
      }

      // Create or get Stripe customer
      const customer = await this.createOrGetCustomer(fan);

      // Attach payment method to customer
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id
      });

      // Set as default payment method
      await this.stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Get price based on tier
      const priceId = this.priceIds[tier];
      const tierPricing = artist.subscription_tiers[tier];
      
      if (!tierPricing) {
        throw new Error('Invalid subscription tier');
      }

      // Create subscription with Stripe
      const stripeSubscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription'
        },
        metadata: {
          fanId: fanId.toString(),
          artistId: artistId.toString(),
          tier: tier,
          platformFeePercent: this.platformFeePercent.toString()
        },
        expand: ['latest_invoice.payment_intent']
      });

      // Create subscription record in database
      const subscription = await Subscription.create({
        fan: fanId,
        artist: artistId,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: customer.id,
        stripePriceId: priceId,
        stripePaymentMethodId: paymentMethodId,
        tier: tier,
        status: stripeSubscription.status,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        pricing: {
          amount: tierPricing.price * 100, // Convert to cents
          currency: 'usd',
          interval: 'month',
          intervalCount: 1
        },
        features: tierPricing.benefits || {}
      });

      // Update artist analytics
      await this.updateArtistSubscriptionAnalytics(artistId, 'new_subscription', {
        tier,
        amount: tierPricing.price
      });

      // Update fan tier
      await User.findByIdAndUpdate(fanId, {
        'fanInfo.tier': tier,
        'fanInfo.subscribedArtists': {
          $addToSet: artistId
        }
      });

      // Cache subscription data
      await redisClient.cacheSet(
        `subscription:${fanId}:${artistId}`,
        subscription,
        3600
      );

      return {
        subscription,
        clientSecret: stripeSubscription.latest_invoice.payment_intent.client_secret
      };

    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  // Update subscription (upgrade/downgrade)
  async updateSubscription(subscriptionId, newTier) {
    try {
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const artist = await ArtistEnhanced.findOne({ userId: subscription.artist });
      const newPriceId = this.priceIds[newTier];
      const newPricing = artist.subscription_tiers[newTier];

      // Update Stripe subscription
      const stripeSubscription = await this.stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId
      );

      const updatedSubscription = await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          items: [{
            id: stripeSubscription.items.data[0].id,
            price: newPriceId
          }],
          proration_behavior: 'create_prorations',
          metadata: {
            ...stripeSubscription.metadata,
            tier: newTier
          }
        }
      );

      // Track upgrade/downgrade
      const isUpgrade = this.getTierLevel(newTier) > this.getTierLevel(subscription.tier);
      
      subscription.metadata.upgradeHistory.push({
        from: subscription.tier,
        to: newTier,
        date: new Date(),
        amount: newPricing.price
      });

      // Update subscription in database
      subscription.tier = newTier;
      subscription.stripePriceId = newPriceId;
      subscription.pricing.amount = newPricing.price * 100;
      await subscription.save();

      // Update analytics
      await this.updateArtistSubscriptionAnalytics(
        subscription.artist,
        isUpgrade ? 'upgrade' : 'downgrade',
        { from: subscription.tier, to: newTier }
      );

      // Clear cache
      await redisClient.cacheDelete(
        `subscription:${subscription.fan}:${subscription.artist}`
      );

      return subscription;

    } catch (error) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId, immediately = false) {
    try {
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Cancel in Stripe
      const canceledSubscription = await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: !immediately,
          cancellation_details: {
            comment: 'Canceled by user'
          }
        }
      );

      if (immediately) {
        await this.stripe.subscriptions.del(subscription.stripeSubscriptionId);
        subscription.status = 'canceled';
        subscription.canceledAt = new Date();
      } else {
        subscription.cancelAtPeriodEnd = true;
      }

      await subscription.save();

      // Update analytics
      await this.updateArtistSubscriptionAnalytics(
        subscription.artist,
        'cancellation',
        { tier: subscription.tier, immediate: immediately }
      );

      // Clear cache
      await redisClient.cacheDelete(
        `subscription:${subscription.fan}:${subscription.artist}`
      );

      return subscription;

    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  }

  // Calculate revenue split
  calculateRevenueSplit(grossAmount) {
    // Stripe fees first (2.9% + $0.30)
    const stripeFee = Math.round((grossAmount * this.stripeFeePercent / 100) + this.stripeFeeFixed);
    const afterStripe = grossAmount - stripeFee;
    
    // Platform fee on remaining amount
    const platformFee = Math.round(afterStripe * this.platformFeePercent / 100);
    const artistPayout = afterStripe - platformFee;
    
    return {
      gross: grossAmount,
      stripeFee: stripeFee,
      platformFee: platformFee,
      artistPayout: artistPayout,
      artistPercent: ((artistPayout / grossAmount) * 100).toFixed(2),
      breakdown: {
        stripeFeePercent: this.stripeFeePercent,
        stripeFeeFixed: this.stripeFeeFixed,
        platformFeePercent: this.platformFeePercent
      }
    };
  }

  // Process webhook event
  async handleWebhookEvent(event) {
    try {
      switch (event.type) {
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object);
          break;
          
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;
          
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;
          
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;
          
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;
          
        case 'customer.subscription.trial_will_end':
          await this.handleTrialWillEnd(event.data.object);
          break;
          
        default:
          console.log(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      console.error(`Error handling webhook event ${event.type}:`, error);
      throw error;
    }
  }

  // Handle subscription created
  async handleSubscriptionCreated(stripeSubscription) {
    const { fanId, artistId, tier } = stripeSubscription.metadata;
    
    // Update subscription status
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: stripeSubscription.id },
      {
        status: stripeSubscription.status,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000)
      }
    );
    
    // Grant immediate access
    await this.grantTierAccess(fanId, artistId, tier);
    
    // Send notifications
    await this.sendSubscriptionNotification(fanId, artistId, 'welcome', { tier });
  }

  // Handle payment succeeded
  async handlePaymentSucceeded(invoice) {
    if (!invoice.subscription) return;
    
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: invoice.subscription
    });
    
    if (!subscription) return;
    
    // Calculate revenue split
    const revenueSplit = this.calculateRevenueSplit(invoice.amount_paid);
    
    // Update subscription financials
    subscription.financials.totalPaid += invoice.amount_paid;
    subscription.financials.lastPaymentAmount = invoice.amount_paid;
    subscription.financials.lastPaymentDate = new Date();
    await subscription.save();
    
    // Update artist revenue
    await this.updateArtistRevenue(subscription.artist, revenueSplit);
    
    // Track in analytics
    await redisClient.incrementMetric('revenue_total', invoice.amount_paid);
    await redisClient.incrementMetric(`revenue_${subscription.tier}`, invoice.amount_paid);
  }

  // Handle payment failed
  async handlePaymentFailed(invoice) {
    if (!invoice.subscription) return;
    
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: invoice.subscription
    });
    
    if (!subscription) return;
    
    // Update failed payment count
    subscription.financials.failedPayments += 1;
    subscription.status = 'past_due';
    await subscription.save();
    
    // Send payment failed notification
    await this.sendSubscriptionNotification(
      subscription.fan,
      subscription.artist,
      'payment_failed',
      { 
        amount: invoice.amount_due / 100,
        attemptCount: invoice.attempt_count 
      }
    );
    
    // Restrict access after 3 failed attempts
    if (invoice.attempt_count >= 3) {
      await this.restrictTierAccess(subscription.fan, subscription.artist);
    }
  }

  // Update artist revenue
  async updateArtistRevenue(artistId, revenueSplit) {
    const today = new Date().toISOString().split('T')[0];
    
    await ArtistEnhanced.findOneAndUpdate(
      { userId: artistId },
      {
        $inc: {
          'revenue.pending': revenueSplit.artistPayout,
          [`analytics.revenue_30d.${today}`]: revenueSplit.artistPayout
        }
      }
    );
  }

  // Update artist subscription analytics
  async updateArtistSubscriptionAnalytics(artistId, event, data) {
    const artist = await ArtistEnhanced.findOne({ userId: artistId });
    if (!artist) return;
    
    switch (event) {
      case 'new_subscription':
        if (data.tier === 'supporter') {
          artist.analytics.conversion_funnel.supporters += 1;
        } else if (data.tier === 'superfan') {
          artist.analytics.conversion_funnel.superfans += 1;
        }
        break;
        
      case 'upgrade':
        if (data.to === 'superfan' && data.from === 'supporter') {
          artist.analytics.conversion_funnel.superfans += 1;
          artist.analytics.conversion_funnel.supporters -= 1;
        }
        break;
        
      case 'downgrade':
        if (data.from === 'superfan' && data.to === 'supporter') {
          artist.analytics.conversion_funnel.superfans -= 1;
          artist.analytics.conversion_funnel.supporters += 1;
        }
        break;
        
      case 'cancellation':
        if (data.tier === 'supporter') {
          artist.analytics.conversion_funnel.supporters -= 1;
        } else if (data.tier === 'superfan') {
          artist.analytics.conversion_funnel.superfans -= 1;
        }
        break;
    }
    
    await artist.save();
  }

  // Grant tier access
  async grantTierAccess(fanId, artistId, tier) {
    // Update user's tier for this artist
    await User.findByIdAndUpdate(fanId, {
      [`fanInfo.artistTiers.${artistId}`]: tier
    });
    
    // Clear cache to reflect new access
    await redisClient.cacheDelete(`fan:${fanId}:access`);
  }

  // Restrict tier access
  async restrictTierAccess(fanId, artistId) {
    // Downgrade to free tier
    await User.findByIdAndUpdate(fanId, {
      [`fanInfo.artistTiers.${artistId}`]: 'free'
    });
    
    // Clear cache
    await redisClient.cacheDelete(`fan:${fanId}:access`);
  }

  // Get tier level for comparison
  getTierLevel(tier) {
    const levels = {
      free: 0,
      supporter: 1,
      superfan: 2
    };
    return levels[tier] || 0;
  }

  // Send subscription notification
  async sendSubscriptionNotification(fanId, artistId, type, data) {
    // This would integrate with your notification service
    console.log(`Sending ${type} notification to fan ${fanId} for artist ${artistId}`, data);
  }

  // Create Stripe products and prices (run once during setup)
  async setupStripeProducts() {
    try {
      // Create products for each tier
      const supporterProduct = await this.stripe.products.create({
        name: 'MusicConnect Supporter Tier',
        description: 'Support your favorite artists with exclusive perks'
      });

      const superfanProduct = await this.stripe.products.create({
        name: 'MusicConnect Superfan Tier',
        description: 'Ultimate fan experience with all features unlocked'
      });

      // Create prices
      const supporterPrice = await this.stripe.prices.create({
        product: supporterProduct.id,
        unit_amount: 500, // $5.00
        currency: 'usd',
        recurring: {
          interval: 'month'
        },
        metadata: {
          tier: 'supporter'
        }
      });

      const superfanPrice = await this.stripe.prices.create({
        product: superfanProduct.id,
        unit_amount: 1000, // $10.00
        currency: 'usd',
        recurring: {
          interval: 'month'
        },
        metadata: {
          tier: 'superfan'
        }
      });

      console.log('Stripe products created:');
      console.log('Supporter Price ID:', supporterPrice.id);
      console.log('Superfan Price ID:', superfanPrice.id);

      return {
        supporter: supporterPrice.id,
        superfan: superfanPrice.id
      };

    } catch (error) {
      console.error('Error setting up Stripe products:', error);
      throw error;
    }
  }

  // Get customer portal session
  async createCustomerPortalSession(customerId, returnUrl) {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      });

      return session;
    } catch (error) {
      console.error('Error creating customer portal session:', error);
      throw error;
    }
  }

  // Get subscription analytics for artist
  async getArtistSubscriptionAnalytics(artistId, period = '30d') {
    try {
      const endDate = new Date();
      const startDate = new Date();
      
      if (period === '30d') {
        startDate.setDate(startDate.getDate() - 30);
      } else if (period === '7d') {
        startDate.setDate(startDate.getDate() - 7);
      }

      const analytics = await Subscription.getRevenueAnalytics(
        artistId,
        startDate,
        endDate
      );

      const currentSubscribers = await Subscription.countDocuments({
        artist: artistId,
        status: 'active'
      });

      const mrr = await Subscription.aggregate([
        {
          $match: {
            artist: mongoose.Types.ObjectId(artistId),
            status: 'active'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$pricing.amount' }
          }
        }
      ]);

      return {
        period,
        subscribers: {
          current: currentSubscribers,
          supporter: await Subscription.countDocuments({
            artist: artistId,
            status: 'active',
            tier: 'supporter'
          }),
          superfan: await Subscription.countDocuments({
            artist: artistId,
            status: 'active',
            tier: 'superfan'
          })
        },
        revenue: {
          mrr: mrr[0]?.total || 0,
          arr: (mrr[0]?.total || 0) * 12,
          history: analytics
        },
        churn: {
          rate: await this.calculateChurnRate(artistId, startDate, endDate)
        }
      };

    } catch (error) {
      console.error('Error getting artist subscription analytics:', error);
      throw error;
    }
  }

  // Calculate churn rate
  async calculateChurnRate(artistId, startDate, endDate) {
    const churned = await Subscription.countDocuments({
      artist: artistId,
      status: 'canceled',
      canceledAt: { $gte: startDate, $lte: endDate }
    });

    const totalAtStart = await Subscription.countDocuments({
      artist: artistId,
      createdAt: { $lt: startDate },
      $or: [
        { status: 'active' },
        { canceledAt: { $gte: startDate } }
      ]
    });

    if (totalAtStart === 0) return 0;
    return ((churned / totalAtStart) * 100).toFixed(2);
  }
}

// Create singleton instance
const stripeService = new StripeService();

module.exports = stripeService;