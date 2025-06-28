const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const stripeService = require('../services/stripeService');
const Subscription = require('../models/Subscription');
const ArtistEnhanced = require('../models/ArtistEnhanced');
const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Create a new subscription
router.post('/subscribe',
  auth,
  [
    body('artistId').isMongoId().withMessage('Invalid artist ID'),
    body('tier').isIn(['supporter', 'superfan']).withMessage('Invalid tier'),
    body('paymentMethodId').notEmpty().withMessage('Payment method required')
  ],
  validate,
  async (req, res) => {
    try {
      const { artistId, tier, paymentMethodId } = req.body;
      const fanId = req.user.id;

      // Check if user is trying to subscribe to themselves
      if (fanId === artistId) {
        return res.status(400).json({ 
          message: 'You cannot subscribe to yourself' 
        });
      }

      const result = await stripeService.createSubscription(
        fanId,
        artistId,
        tier,
        paymentMethodId
      );

      res.json({
        success: true,
        subscription: result.subscription,
        clientSecret: result.clientSecret,
        message: 'Subscription created. Please complete payment.'
      });

    } catch (error) {
      console.error('Subscribe error:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to create subscription'
      });
    }
  }
);

// Update subscription tier
router.patch('/upgrade',
  auth,
  [
    body('subscriptionId').isMongoId().withMessage('Invalid subscription ID'),
    body('newTier').isIn(['supporter', 'superfan']).withMessage('Invalid tier')
  ],
  validate,
  async (req, res) => {
    try {
      const { subscriptionId, newTier } = req.body;
      const fanId = req.user.id;

      // Verify ownership
      const subscription = await Subscription.findOne({
        _id: subscriptionId,
        fan: fanId
      });

      if (!subscription) {
        return res.status(404).json({ 
          message: 'Subscription not found' 
        });
      }

      if (subscription.tier === newTier) {
        return res.status(400).json({ 
          message: 'Already on this tier' 
        });
      }

      const updated = await stripeService.updateSubscription(
        subscriptionId,
        newTier
      );

      res.json({
        success: true,
        subscription: updated,
        message: `Successfully ${this.getTierLevel(newTier) > this.getTierLevel(subscription.tier) ? 'upgraded' : 'downgraded'} to ${newTier}`
      });

    } catch (error) {
      console.error('Upgrade error:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to update subscription'
      });
    }
  }
);

// Cancel subscription
router.post('/cancel',
  auth,
  [
    body('subscriptionId').isMongoId().withMessage('Invalid subscription ID'),
    body('immediately').optional().isBoolean()
  ],
  validate,
  async (req, res) => {
    try {
      const { subscriptionId, immediately = false } = req.body;
      const fanId = req.user.id;

      // Verify ownership
      const subscription = await Subscription.findOne({
        _id: subscriptionId,
        fan: fanId
      });

      if (!subscription) {
        return res.status(404).json({ 
          message: 'Subscription not found' 
        });
      }

      const canceled = await stripeService.cancelSubscription(
        subscriptionId,
        immediately
      );

      res.json({
        success: true,
        subscription: canceled,
        message: immediately 
          ? 'Subscription canceled immediately' 
          : 'Subscription will be canceled at period end'
      });

    } catch (error) {
      console.error('Cancel error:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to cancel subscription'
      });
    }
  }
);

// Get user's subscriptions
router.get('/my-subscriptions',
  auth,
  [
    query('status').optional().isIn(['active', 'canceled', 'past_due']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  validate,
  async (req, res) => {
    try {
      const fanId = req.user.id;
      const { status = 'active', page = 1, limit = 20 } = req.query;

      const query = { fan: fanId };
      if (status) query.status = status;

      const subscriptions = await Subscription.find(query)
        .populate('artist', 'username profile')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

      const total = await Subscription.countDocuments(query);

      res.json({
        success: true,
        subscriptions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get subscriptions error:', error);
      res.status(500).json({ 
        message: 'Failed to get subscriptions'
      });
    }
  }
);

// Get subscription details
router.get('/subscription/:id',
  auth,
  [
    param('id').isMongoId().withMessage('Invalid subscription ID')
  ],
  validate,
  async (req, res) => {
    try {
      const { id } = req.params;
      const fanId = req.user.id;

      const subscription = await Subscription.findOne({
        _id: id,
        fan: fanId
      }).populate('artist', 'username profile subscription_tiers');

      if (!subscription) {
        return res.status(404).json({ 
          message: 'Subscription not found' 
        });
      }

      res.json({
        success: true,
        subscription
      });

    } catch (error) {
      console.error('Get subscription error:', error);
      res.status(500).json({ 
        message: 'Failed to get subscription'
      });
    }
  }
);

// Get artist's subscribers (artist only)
router.get('/artist/subscribers',
  auth,
  [
    query('status').optional().isIn(['active', 'canceled', 'past_due']),
    query('tier').optional().isIn(['supporter', 'superfan']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  validate,
  async (req, res) => {
    try {
      const artistId = req.user.id;
      
      // Verify user is an artist
      if (req.user.userType !== 'artist') {
        return res.status(403).json({ 
          message: 'Only artists can access this endpoint' 
        });
      }

      const options = {
        status: req.query.status,
        tier: req.query.tier,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50
      };

      const result = await Subscription.getArtistSubscribers(artistId, options);

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      console.error('Get subscribers error:', error);
      res.status(500).json({ 
        message: 'Failed to get subscribers'
      });
    }
  }
);

// Get subscription analytics (artist only)
router.get('/artist/analytics',
  auth,
  [
    query('period').optional().isIn(['7d', '30d', '90d', '1y'])
  ],
  validate,
  async (req, res) => {
    try {
      const artistId = req.user.id;
      const { period = '30d' } = req.query;
      
      // Verify user is an artist
      if (req.user.userType !== 'artist') {
        return res.status(403).json({ 
          message: 'Only artists can access this endpoint' 
        });
      }

      const analytics = await stripeService.getArtistSubscriptionAnalytics(
        artistId,
        period
      );

      res.json({
        success: true,
        analytics
      });

    } catch (error) {
      console.error('Get analytics error:', error);
      res.status(500).json({ 
        message: 'Failed to get analytics'
      });
    }
  }
);

// Create customer portal session
router.post('/customer-portal',
  auth,
  async (req, res) => {
    try {
      const { returnUrl = process.env.FRONTEND_URL } = req.body;
      const user = req.user;

      if (!user.stripeCustomerId) {
        return res.status(400).json({ 
          message: 'No billing account found' 
        });
      }

      const session = await stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        returnUrl
      );

      res.json({
        success: true,
        url: session.url
      });

    } catch (error) {
      console.error('Customer portal error:', error);
      res.status(500).json({ 
        message: 'Failed to create portal session'
      });
    }
  }
);

// Check subscription status for content access
router.get('/check-access/:artistId',
  auth,
  [
    param('artistId').isMongoId().withMessage('Invalid artist ID')
  ],
  validate,
  async (req, res) => {
    try {
      const { artistId } = req.params;
      const fanId = req.user.id;

      const subscription = await Subscription.findOne({
        fan: fanId,
        artist: artistId,
        status: { $in: ['active', 'trialing'] }
      });

      const hasAccess = !!subscription;
      const tier = subscription ? subscription.tier : 'free';

      res.json({
        success: true,
        hasAccess,
        tier,
        features: subscription ? subscription.features : {}
      });

    } catch (error) {
      console.error('Check access error:', error);
      res.status(500).json({ 
        message: 'Failed to check access'
      });
    }
  }
);

// Get pricing information
router.get('/pricing/:artistId',
  [
    param('artistId').isMongoId().withMessage('Invalid artist ID')
  ],
  validate,
  async (req, res) => {
    try {
      const { artistId } = req.params;

      const artist = await ArtistEnhanced.findOne({ userId: artistId })
        .select('subscription_tiers profile.stageName');

      if (!artist) {
        return res.status(404).json({ 
          message: 'Artist not found' 
        });
      }

      const pricing = {
        artist: {
          id: artistId,
          name: artist.profile.stageName
        },
        tiers: {
          free: {
            price: 0,
            features: artist.subscription_tiers.free.features,
            available: true
          },
          supporter: {
            price: artist.subscription_tiers.supporter.price,
            features: artist.subscription_tiers.supporter.features,
            available: true
          },
          superfan: {
            price: artist.subscription_tiers.superfan.price,
            features: artist.subscription_tiers.superfan.features,
            available: true
          }
        },
        currency: 'USD',
        billingInterval: 'monthly'
      };

      res.json({
        success: true,
        pricing
      });

    } catch (error) {
      console.error('Get pricing error:', error);
      res.status(500).json({ 
        message: 'Failed to get pricing'
      });
    }
  }
);

module.exports = router;