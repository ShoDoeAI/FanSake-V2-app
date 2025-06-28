const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Subscription = require('../../models/Subscription');

let mongoServer;

describe('Subscription Model', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Subscription.deleteMany({});
  });

  describe('Schema Validation', () => {
    test('should create subscription with valid data', async () => {
      const subscriptionData = {
        fan: new mongoose.Types.ObjectId(),
        artist: new mongoose.Types.ObjectId(),
        stripeSubscriptionId: 'sub_test123',
        stripeCustomerId: 'cus_test123',
        stripePriceId: 'price_test123',
        tier: 'supporter',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pricing: {
          amount: 500,
          currency: 'usd',
          interval: 'month'
        }
      };

      const subscription = await Subscription.create(subscriptionData);

      expect(subscription._id).toBeDefined();
      expect(subscription.tier).toBe('supporter');
      expect(subscription.status).toBe('active');
      expect(subscription.pricing.amount).toBe(500);
    });

    test('should require required fields', async () => {
      const subscription = new Subscription({});

      await expect(subscription.save()).rejects.toThrow();
    });

    test('should enforce unique constraint on fan-artist combination', async () => {
      const fanId = new mongoose.Types.ObjectId();
      const artistId = new mongoose.Types.ObjectId();

      await Subscription.create({
        fan: fanId,
        artist: artistId,
        stripeSubscriptionId: 'sub_1',
        stripeCustomerId: 'cus_1',
        stripePriceId: 'price_1',
        tier: 'supporter',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        pricing: { amount: 500 }
      });

      await expect(
        Subscription.create({
          fan: fanId,
          artist: artistId,
          stripeSubscriptionId: 'sub_2',
          stripeCustomerId: 'cus_2',
          stripePriceId: 'price_2',
          tier: 'superfan',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          pricing: { amount: 1000 }
        })
      ).rejects.toThrow();
    });
  });

  describe('Virtual Properties', () => {
    test('daysUntilRenewal should calculate correctly', async () => {
      const subscription = await Subscription.create({
        fan: new mongoose.Types.ObjectId(),
        artist: new mongoose.Types.ObjectId(),
        stripeSubscriptionId: 'sub_test',
        stripeCustomerId: 'cus_test',
        stripePriceId: 'price_test',
        tier: 'supporter',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
        pricing: { amount: 500 }
      });

      expect(subscription.daysUntilRenewal).toBe(10);
    });

    test('daysUntilRenewal should return 0 for canceled subscriptions', async () => {
      const subscription = await Subscription.create({
        fan: new mongoose.Types.ObjectId(),
        artist: new mongoose.Types.ObjectId(),
        stripeSubscriptionId: 'sub_test',
        stripeCustomerId: 'cus_test',
        stripePriceId: 'price_test',
        tier: 'supporter',
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        pricing: { amount: 500 }
      });

      expect(subscription.daysUntilRenewal).toBe(0);
    });

    test('isActive should return true for active and trialing', () => {
      const activeSubscription = new Subscription({ status: 'active' });
      const trialingSubscription = new Subscription({ status: 'trialing' });
      const canceledSubscription = new Subscription({ status: 'canceled' });

      expect(activeSubscription.isActive).toBe(true);
      expect(trialingSubscription.isActive).toBe(true);
      expect(canceledSubscription.isActive).toBe(false);
    });
  });

  describe('Instance Methods', () => {
    test('calculateLifetimeValue should return correct value', async () => {
      const subscription = await Subscription.create({
        fan: new mongoose.Types.ObjectId(),
        artist: new mongoose.Types.ObjectId(),
        stripeSubscriptionId: 'sub_test',
        stripeCustomerId: 'cus_test',
        stripePriceId: 'price_test',
        tier: 'supporter',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        pricing: { amount: 500 },
        financials: {
          totalPaid: 1500 // $15.00
        }
      });

      const ltv = subscription.calculateLifetimeValue();
      expect(ltv).toBe(15);
    });

    test('getChurnRisk should calculate risk score', () => {
      const subscription = new Subscription({
        financials: { failedPayments: 2 },
        status: 'past_due',
        cancelAtPeriodEnd: false
      });

      const risk = subscription.getChurnRisk();
      expect(risk).toBe(80); // 2 * 20 + 40
    });

    test('canAccessTier should check tier hierarchy', () => {
      const supporterSub = new Subscription({
        tier: 'supporter',
        status: 'active'
      });

      const superfanSub = new Subscription({
        tier: 'superfan',
        status: 'active'
      });

      expect(supporterSub.canAccessTier('supporter')).toBe(true);
      expect(supporterSub.canAccessTier('superfan')).toBe(false);
      expect(superfanSub.canAccessTier('supporter')).toBe(true);
      expect(superfanSub.canAccessTier('superfan')).toBe(true);
    });
  });

  describe('Pre-save Middleware', () => {
    test('should update features when tier changes', async () => {
      const subscription = await Subscription.create({
        fan: new mongoose.Types.ObjectId(),
        artist: new mongoose.Types.ObjectId(),
        stripeSubscriptionId: 'sub_test',
        stripeCustomerId: 'cus_test',
        stripePriceId: 'price_test',
        tier: 'supporter',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        pricing: { amount: 500 }
      });

      expect(subscription.features.earlyAccess).toBe(24);
      expect(subscription.features.directMessages).toBe(0);

      subscription.tier = 'superfan';
      await subscription.save();

      expect(subscription.features.earlyAccess).toBe(48);
      expect(subscription.features.directMessages).toBe(5);
      expect(subscription.features.downloadEnabled).toBe(true);
    });
  });

  describe('Static Methods', () => {
    test('getArtistSubscribers should return paginated results', async () => {
      const artistId = new mongoose.Types.ObjectId();
      
      // Create test subscriptions
      for (let i = 0; i < 5; i++) {
        await Subscription.create({
          fan: new mongoose.Types.ObjectId(),
          artist: artistId,
          stripeSubscriptionId: `sub_${i}`,
          stripeCustomerId: `cus_${i}`,
          stripePriceId: 'price_test',
          tier: i % 2 === 0 ? 'supporter' : 'superfan',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          pricing: { amount: 500 }
        });
      }

      const result = await Subscription.getArtistSubscribers(artistId, {
        status: 'active',
        page: 1,
        limit: 3
      });

      expect(result.subscriptions).toHaveLength(3);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.pages).toBe(2);
    });
  });
});