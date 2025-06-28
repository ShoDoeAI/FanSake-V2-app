const request = require('supertest');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let app;
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  
  const server = require('../../server');
  app = server.app;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Payment Flow End-to-End Tests', () => {
  let fanToken;
  let artistToken;
  let artistId;
  let subscriptionId;
  let paymentIntentId;
  
  beforeAll(async () => {
    // Create test users
    const fanResponse = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'paymentfan',
        email: 'paymentfan@test.com',
        password: 'TestPass123!',
        role: 'fan'
      });
    fanToken = fanResponse.body.token;
    
    const artistResponse = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'paymentartist',
        email: 'paymentartist@test.com',
        password: 'TestPass123!',
        role: 'artist',
        artistName: 'Payment Test Artist',
        stripeAccountId: 'acct_test123'
      });
    artistToken = artistResponse.body.token;
    artistId = artistResponse.body.user.id;
  });
  
  describe('Subscription Payment Flow', () => {
    test('1. Create payment intent for subscription', async () => {
      const response = await request(app)
        .post('/api/subscriptions/create-payment-intent')
        .set('Authorization', `Bearer ${fanToken}`)
        .send({
          artistId,
          tier: 'platinum',
          currency: 'usd'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.clientSecret).toBeDefined();
      expect(response.body.amount).toBe(1999); // $19.99 in cents
      paymentIntentId = response.body.paymentIntentId;
    });
    
    test('2. Confirm payment and create subscription', async () => {
      const response = await request(app)
        .post('/api/subscriptions/confirm-payment')
        .set('Authorization', `Bearer ${fanToken}`)
        .send({
          paymentIntentId,
          paymentMethodId: 'pm_card_visa',
          artistId,
          tier: 'platinum'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.subscription).toBeDefined();
      expect(response.body.subscription.status).toBe('active');
      subscriptionId = response.body.subscription.id;
    });
    
    test('3. Process webhook for successful payment', async () => {
      const webhookPayload = {
        id: 'evt_test123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId,
            amount: 1999,
            currency: 'usd',
            metadata: {
              artistId,
              fanId: 'test_fan_id',
              tier: 'platinum'
            }
          }
        }
      };
      
      const signature = stripe.webhooks.generateTestHeaderString({
        payload: JSON.stringify(webhookPayload),
        secret: process.env.STRIPE_WEBHOOK_SECRET
      });
      
      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', signature)
        .send(webhookPayload);
      
      expect(response.status).toBe(200);
    });
    
    test('4. Verify subscription is active', async () => {
      const response = await request(app)
        .get('/api/subscriptions/active')
        .set('Authorization', `Bearer ${fanToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.subscriptions).toHaveLength(1);
      expect(response.body.subscriptions[0].tier).toBe('platinum');
    });
    
    test('5. Cancel subscription', async () => {
      const response = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/cancel`)
        .set('Authorization', `Bearer ${fanToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.subscription.status).toBe('canceled');
    });
  });
  
  describe('Payout Flow', () => {
    test('1. Artist requests payout', async () => {
      const response = await request(app)
        .post('/api/artists/payout/request')
        .set('Authorization', `Bearer ${artistToken}`)
        .send({
          amount: 5000, // $50.00
          currency: 'usd'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.payout).toBeDefined();
      expect(response.body.payout.status).toBe('pending');
    });
    
    test('2. View payout history', async () => {
      const response = await request(app)
        .get('/api/artists/payout/history')
        .set('Authorization', `Bearer ${artistToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.payouts).toHaveLength(1);
      expect(response.body.payouts[0].amount).toBe(5000);
    });
  });
  
  describe('Refund Flow', () => {
    test('1. Process refund for subscription', async () => {
      const response = await request(app)
        .post('/api/subscriptions/refund')
        .set('Authorization', `Bearer ${fanToken}`)
        .send({
          subscriptionId,
          reason: 'requested_by_customer'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.refund).toBeDefined();
      expect(response.body.refund.status).toBe('succeeded');
    });
  });
});