const stripeService = require('../../services/stripeService');
const Subscription = require('../../models/Subscription');
const ArtistEnhanced = require('../../models/ArtistEnhanced');
const User = require('../../models/User');

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_test123',
        email: 'test@example.com'
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'cus_test123',
        deleted: false
      })
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_test_secret'
          }
        }
      }),
      update: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'active'
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        items: {
          data: [{ id: 'si_test123' }]
        }
      })
    },
    paymentMethods: {
      attach: jest.fn().mockResolvedValue({ id: 'pm_test123' })
    },
    products: {
      create: jest.fn().mockResolvedValue({ id: 'prod_test123' })
    },
    prices: {
      create: jest.fn().mockResolvedValue({ id: 'price_test123' })
    }
  }));
});

// Mock models
jest.mock('../../models/Subscription');
jest.mock('../../models/ArtistEnhanced');
jest.mock('../../models/User');

describe('StripeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateRevenueSplit', () => {
    test('should calculate correct revenue split for $10 subscription', () => {
      const split = stripeService.calculateRevenueSplit(1000); // $10 in cents
      
      expect(split.gross).toBe(1000);
      expect(split.stripeFee).toBe(59); // 2.9% + $0.30
      expect(split.platformFee).toBe(94); // 10% of (1000 - 59)
      expect(split.artistPayout).toBe(847); // 1000 - 59 - 94
      expect(split.artistPercent).toBe('84.70');
    });

    test('should calculate correct revenue split for $5 subscription', () => {
      const split = stripeService.calculateRevenueSplit(500); // $5 in cents
      
      expect(split.gross).toBe(500);
      expect(split.stripeFee).toBe(45); // 2.9% + $0.30
      expect(split.platformFee).toBe(46); // 10% of (500 - 45)
      expect(split.artistPayout).toBe(409); // 500 - 45 - 46
      expect(split.artistPercent).toBe('81.80');
    });
  });

  describe('createOrGetCustomer', () => {
    test('should return existing customer if stripeCustomerId exists', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        stripeCustomerId: 'cus_existing'
      };

      const customer = await stripeService.createOrGetCustomer(mockUser);
      
      expect(customer.id).toBe('cus_test123');
      expect(stripeService.stripe.customers.retrieve).toHaveBeenCalledWith('cus_existing');
    });

    test('should create new customer if none exists', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        userType: 'fan'
      };

      User.findByIdAndUpdate.mockResolvedValue();

      const customer = await stripeService.createOrGetCustomer(mockUser);
      
      expect(customer.id).toBe('cus_test123');
      expect(stripeService.stripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'testuser',
        metadata: {
          userId: 'user123',
          userType: 'fan'
        }
      });
    });
  });

  describe('createSubscription', () => {
    test('should create subscription successfully', async () => {
      const mockFan = {
        _id: 'fan123',
        email: 'fan@example.com',
        username: 'fanuser'
      };
      
      const mockArtist = {
        _id: 'artist123',
        userId: 'artistUser123',
        subscription_tiers: {
          supporter: {
            price: 5,
            benefits: { earlyAccess: 24 }
          }
        }
      };

      User.findById.mockResolvedValue(mockFan);
      ArtistEnhanced.findOne.mockResolvedValue(mockArtist);
      Subscription.findOne.mockResolvedValue(null);
      Subscription.create.mockResolvedValue({
        _id: 'sub123',
        fan: 'fan123',
        artist: 'artistUser123',
        tier: 'supporter'
      });

      const result = await stripeService.createSubscription(
        'fan123',
        'artistUser123',
        'supporter',
        'pm_test123'
      );

      expect(result.subscription).toBeDefined();
      expect(result.clientSecret).toBe('pi_test_secret');
      expect(Subscription.create).toHaveBeenCalled();
    });

    test('should throw error if subscription already exists', async () => {
      User.findById.mockResolvedValue({ _id: 'fan123' });
      ArtistEnhanced.findOne.mockResolvedValue({ _id: 'artist123' });
      Subscription.findOne.mockResolvedValue({ _id: 'existing_sub' });

      await expect(
        stripeService.createSubscription('fan123', 'artist123', 'supporter', 'pm_test')
      ).rejects.toThrow('Active subscription already exists');
    });
  });

  describe('handleWebhookEvent', () => {
    test('should handle invoice.payment_succeeded event', async () => {
      const mockSubscription = {
        _id: 'sub123',
        artist: 'artist123',
        tier: 'supporter',
        financials: {
          totalPaid: 0,
          lastPaymentAmount: 0
        },
        save: jest.fn()
      };

      Subscription.findOne.mockResolvedValue(mockSubscription);
      ArtistEnhanced.findOneAndUpdate.mockResolvedValue();

      const event = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            subscription: 'sub_test123',
            amount_paid: 500
          }
        }
      };

      await stripeService.handleWebhookEvent(event);

      expect(mockSubscription.financials.totalPaid).toBe(500);
      expect(mockSubscription.financials.lastPaymentAmount).toBe(500);
      expect(mockSubscription.save).toHaveBeenCalled();
    });

    test('should handle customer.subscription.deleted event', async () => {
      const event = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test123',
            metadata: {
              fanId: 'fan123',
              artistId: 'artist123',
              tier: 'supporter'
            }
          }
        }
      };

      Subscription.findOneAndUpdate.mockResolvedValue();

      await stripeService.handleWebhookEvent(event);

      expect(Subscription.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('getTierLevel', () => {
    test('should return correct tier levels', () => {
      expect(stripeService.getTierLevel('free')).toBe(0);
      expect(stripeService.getTierLevel('supporter')).toBe(1);
      expect(stripeService.getTierLevel('superfan')).toBe(2);
      expect(stripeService.getTierLevel('invalid')).toBe(0);
    });
  });
});