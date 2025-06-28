const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const subscriptionRoutes = require('../../routes/subscriptions');
const stripeService = require('../../services/stripeService');
const Subscription = require('../../models/Subscription');
const ArtistEnhanced = require('../../models/ArtistEnhanced');

// Mock dependencies
jest.mock('../../services/stripeService');
jest.mock('../../models/Subscription');
jest.mock('../../models/ArtistEnhanced');

// Create test app
const app = express();
app.use(express.json());

// Mock auth middleware
const mockAuth = (req, res, next) => {
  req.user = {
    id: 'user123',
    email: 'test@example.com',
    userType: 'fan'
  };
  next();
};

// Apply mock auth to all routes
app.use('/api/subscriptions', (req, res, next) => {
  mockAuth(req, res, next);
}, subscriptionRoutes);

describe('Subscription Routes Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/subscriptions/subscribe', () => {
    test('should create subscription successfully', async () => {
      const mockSubscription = {
        _id: 'sub123',
        fan: 'user123',
        artist: 'artist123',
        tier: 'supporter'
      };

      stripeService.createSubscription.mockResolvedValue({
        subscription: mockSubscription,
        clientSecret: 'pi_test_secret'
      });

      const response = await request(app)
        .post('/api/subscriptions/subscribe')
        .send({
          artistId: 'artist123',
          tier: 'supporter',
          paymentMethodId: 'pm_test123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        subscription: mockSubscription,
        clientSecret: 'pi_test_secret'
      });
    });

    test('should return 400 for invalid tier', async () => {
      const response = await request(app)
        .post('/api/subscriptions/subscribe')
        .send({
          artistId: 'artist123',
          tier: 'invalid_tier',
          paymentMethodId: 'pm_test123'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should prevent self-subscription', async () => {
      const response = await request(app)
        .post('/api/subscriptions/subscribe')
        .send({
          artistId: 'user123', // Same as authenticated user
          tier: 'supporter',
          paymentMethodId: 'pm_test123'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('You cannot subscribe to yourself');
    });
  });

  describe('PATCH /api/subscriptions/upgrade', () => {
    test('should upgrade subscription successfully', async () => {
      const mockSubscription = {
        _id: 'sub123',
        fan: 'user123',
        tier: 'supporter'
      };

      Subscription.findOne.mockResolvedValue(mockSubscription);
      stripeService.updateSubscription.mockResolvedValue({
        ...mockSubscription,
        tier: 'superfan'
      });

      const response = await request(app)
        .patch('/api/subscriptions/upgrade')
        .send({
          subscriptionId: 'sub123',
          newTier: 'superfan'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent subscription', async () => {
      Subscription.findOne.mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/subscriptions/upgrade')
        .send({
          subscriptionId: 'nonexistent',
          newTier: 'superfan'
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Subscription not found');
    });
  });

  describe('POST /api/subscriptions/cancel', () => {
    test('should cancel subscription at period end', async () => {
      const mockSubscription = {
        _id: 'sub123',
        fan: 'user123',
        cancelAtPeriodEnd: false
      };

      Subscription.findOne.mockResolvedValue(mockSubscription);
      stripeService.cancelSubscription.mockResolvedValue({
        ...mockSubscription,
        cancelAtPeriodEnd: true
      });

      const response = await request(app)
        .post('/api/subscriptions/cancel')
        .send({
          subscriptionId: 'sub123',
          immediately: false
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Subscription will be canceled at period end');
    });
  });

  describe('GET /api/subscriptions/my-subscriptions', () => {
    test('should return user subscriptions', async () => {
      const mockSubscriptions = [
        { _id: 'sub1', tier: 'supporter' },
        { _id: 'sub2', tier: 'superfan' }
      ];

      Subscription.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockResolvedValue(mockSubscriptions)
      });

      Subscription.countDocuments.mockResolvedValue(2);

      const response = await request(app)
        .get('/api/subscriptions/my-subscriptions')
        .query({ status: 'active', page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.subscriptions).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });
  });

  describe('GET /api/subscriptions/check-access/:artistId', () => {
    test('should return access info for subscribed user', async () => {
      const mockSubscription = {
        _id: 'sub123',
        tier: 'supporter',
        features: {
          earlyAccess: 24,
          exclusiveTracks: true
        }
      };

      Subscription.findOne.mockResolvedValue(mockSubscription);

      const response = await request(app)
        .get('/api/subscriptions/check-access/artist123');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        hasAccess: true,
        tier: 'supporter',
        features: mockSubscription.features
      });
    });

    test('should return free tier for non-subscriber', async () => {
      Subscription.findOne.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/subscriptions/check-access/artist123');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        hasAccess: false,
        tier: 'free',
        features: {}
      });
    });
  });

  describe('GET /api/subscriptions/pricing/:artistId', () => {
    test('should return artist pricing tiers', async () => {
      const mockArtist = {
        profile: { stageName: 'Test Artist' },
        subscription_tiers: {
          free: {
            price: 0,
            features: ['Stream all music']
          },
          supporter: {
            price: 5,
            features: ['Early access', 'Exclusive tracks']
          },
          superfan: {
            price: 10,
            features: ['Everything', 'Direct messages']
          }
        }
      };

      ArtistEnhanced.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockArtist)
      });

      const response = await request(app)
        .get('/api/subscriptions/pricing/artist123');

      expect(response.status).toBe(200);
      expect(response.body.pricing.tiers).toBeDefined();
      expect(response.body.pricing.tiers.supporter.price).toBe(5);
      expect(response.body.pricing.currency).toBe('USD');
    });
  });

  describe('GET /api/subscriptions/artist/analytics', () => {
    test('should return analytics for artist', async () => {
      // Change user type to artist for this test
      app.use('/api/subscriptions/artist', (req, res, next) => {
        req.user = { id: 'artist123', userType: 'artist' };
        next();
      });

      const mockAnalytics = {
        period: '30d',
        subscribers: {
          current: 150,
          supporter: 100,
          superfan: 50
        },
        revenue: {
          mrr: 100000, // $1000
          arr: 1200000 // $12000
        }
      };

      stripeService.getArtistSubscriptionAnalytics.mockResolvedValue(mockAnalytics);

      const response = await request(app)
        .get('/api/subscriptions/artist/analytics')
        .query({ period: '30d' });

      expect(response.status).toBe(200);
      expect(response.body.analytics).toMatchObject(mockAnalytics);
    });

    test('should return 403 for non-artist users', async () => {
      const response = await request(app)
        .get('/api/subscriptions/artist/analytics');

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Only artists can access this endpoint');
    });
  });

  describe('POST /api/subscriptions/customer-portal', () => {
    test('should create portal session', async () => {
      app.use('/api/subscriptions', (req, res, next) => {
        req.user = {
          id: 'user123',
          stripeCustomerId: 'cus_test123'
        };
        next();
      });

      stripeService.createCustomerPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/session/test'
      });

      const response = await request(app)
        .post('/api/subscriptions/customer-portal')
        .send({ returnUrl: 'https://example.com/return' });

      expect(response.status).toBe(200);
      expect(response.body.url).toBe('https://billing.stripe.com/session/test');
    });
  });
});