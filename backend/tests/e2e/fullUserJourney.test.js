const request = require('supertest');
const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = require('../../server');

describe('FanSake Full User Journey E2E Tests', () => {
  let db;
  let artistToken, fanToken;
  let artistId, fanId;
  let contentId, subscriptionId;
  
  beforeAll(async () => {
    const client = await MongoClient.connect(process.env.MONGODB_URI_TEST);
    db = client.db();
  });

  afterAll(async () => {
    await db.dropDatabase();
    await db.client.close();
  });

  describe('Artist Journey', () => {
    test('Artist registration and onboarding', async () => {
      const artistData = {
        email: 'artist@fansake.com',
        password: 'SecurePass123!',
        name: 'Test Artist',
        artistName: 'DJ Test',
        genre: 'Electronic'
      };

      // Register artist
      const regResponse = await request(app)
        .post('/api/auth/register')
        .send({ ...artistData, userType: 'artist' });
      
      expect(regResponse.status).toBe(201);
      expect(regResponse.body.token).toBeDefined();
      artistToken = regResponse.body.token;
      artistId = regResponse.body.user._id;

      // Complete profile
      const profileResponse = await request(app)
        .put('/api/artists/profile')
        .set('Authorization', `Bearer ${artistToken}`)
        .send({
          bio: 'Electronic music producer',
          socialLinks: {
            instagram: '@djtest',
            spotify: 'spotify:artist:test'
          }
        });

      expect(profileResponse.status).toBe(200);
    });

    test('Artist creates fan tiers', async () => {
      const tiers = [
        {
          name: 'Basic Fan',
          price: 4.99,
          benefits: ['Early access to tracks', 'Monthly Q&A']
        },
        {
          name: 'Super Fan',
          price: 9.99,
          benefits: ['All Basic benefits', 'Exclusive content', 'Direct messaging']
        },
        {
          name: 'VIP',
          price: 19.99,
          benefits: ['All benefits', 'Virtual meet & greet', 'Signed merch']
        }
      ];

      for (const tier of tiers) {
        const response = await request(app)
          .post('/api/artists/tiers')
          .set('Authorization', `Bearer ${artistToken}`)
          .send(tier);
        
        expect(response.status).toBe(201);
        expect(response.body.tier.name).toBe(tier.name);
      }
    });

    test('Artist uploads content', async () => {
      // Upload music
      const musicResponse = await request(app)
        .post('/api/uploads/music')
        .set('Authorization', `Bearer ${artistToken}`)
        .field('title', 'New Track')
        .field('description', 'Latest electronic banger')
        .field('accessTier', 'Super Fan')
        .attach('file', Buffer.from('fake-audio-data'), 'track.mp3');

      expect(musicResponse.status).toBe(201);
      contentId = musicResponse.body.content._id;

      // Upload exclusive photo
      const photoResponse = await request(app)
        .post('/api/uploads/image')
        .set('Authorization', `Bearer ${artistToken}`)
        .field('title', 'Studio Session')
        .field('accessTier', 'VIP')
        .attach('file', Buffer.from('fake-image-data'), 'studio.jpg');

      expect(photoResponse.status).toBe(201);
    });

    test('Artist schedules listening party', async () => {
      const partyData = {
        title: 'Album Release Party',
        description: 'Join me for the premiere of my new album!',
        scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        accessTier: 'Super Fan',
        maxParticipants: 100
      };

      const response = await request(app)
        .post('/api/community/listening-parties')
        .set('Authorization', `Bearer ${artistToken}`)
        .send(partyData);

      expect(response.status).toBe(201);
      expect(response.body.party.title).toBe(partyData.title);
    });
  });

  describe('Fan Journey', () => {
    test('Fan registration and discovery', async () => {
      const fanData = {
        email: 'fan@fansake.com',
        password: 'FanPass123!',
        name: 'Music Lover',
        username: 'musicfan99'
      };

      // Register fan
      const regResponse = await request(app)
        .post('/api/auth/register')
        .send({ ...fanData, userType: 'fan' });
      
      expect(regResponse.status).toBe(201);
      fanToken = regResponse.body.token;
      fanId = regResponse.body.user._id;

      // Discover artists
      const discoverResponse = await request(app)
        .get('/api/discovery/artists')
        .set('Authorization', `Bearer ${fanToken}`)
        .query({ genre: 'Electronic' });

      expect(discoverResponse.status).toBe(200);
      expect(discoverResponse.body.artists).toContainEqual(
        expect.objectContaining({ _id: artistId })
      );
    });

    test('Fan subscribes to artist', async () => {
      // Get artist tiers
      const tiersResponse = await request(app)
        .get(`/api/artists/${artistId}/tiers`)
        .set('Authorization', `Bearer ${fanToken}`);

      expect(tiersResponse.status).toBe(200);
      const superFanTier = tiersResponse.body.tiers.find(t => t.name === 'Super Fan');

      // Create subscription
      const subResponse = await request(app)
        .post('/api/subscriptions/create')
        .set('Authorization', `Bearer ${fanToken}`)
        .send({
          artistId: artistId,
          tierId: superFanTier._id,
          paymentMethodId: 'pm_card_visa' // Test payment method
        });

      expect(subResponse.status).toBe(201);
      subscriptionId = subResponse.body.subscription._id;
      
      // Verify Stripe subscription created
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subResponse.body.subscription.stripeSubscriptionId
      );
      expect(stripeSubscription.status).toBe('active');
    });

    test('Fan accesses exclusive content', async () => {
      // Access subscribed content
      const contentResponse = await request(app)
        .get(`/api/content/${contentId}`)
        .set('Authorization', `Bearer ${fanToken}`);

      expect(contentResponse.status).toBe(200);
      expect(contentResponse.body.content.title).toBe('New Track');

      // Try to access VIP content (should fail)
      const vipResponse = await request(app)
        .get('/api/content/vip-only')
        .set('Authorization', `Bearer ${fanToken}`);

      expect(vipResponse.status).toBe(403);
    });

    test('Fan engages with artist', async () => {
      // Send direct message
      const messageResponse = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${fanToken}`)
        .send({
          recipientId: artistId,
          content: 'Love your new track!'
        });

      expect(messageResponse.status).toBe(201);

      // Join listening party
      const joinResponse = await request(app)
        .post('/api/community/listening-parties/join')
        .set('Authorization', `Bearer ${fanToken}`)
        .send({ partyId: 'party-id-here' });

      expect(joinResponse.status).toBe(200);
    });
  });

  describe('Payment and Revenue Flow', () => {
    test('Monthly subscription billing', async () => {
      // Simulate webhook from Stripe
      const webhookPayload = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            subscription: subscriptionId,
            amount_paid: 999, // $9.99
            customer: fanId
          }
        }
      };

      const webhookResponse = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookPayload);

      expect(webhookResponse.status).toBe(200);

      // Check artist balance updated
      const balanceResponse = await request(app)
        .get('/api/artists/balance')
        .set('Authorization', `Bearer ${artistToken}`);

      expect(balanceResponse.body.balance).toBeGreaterThan(0);
    });

    test('Artist requests payout', async () => {
      const payoutResponse = await request(app)
        .post('/api/artists/payout')
        .set('Authorization', `Bearer ${artistToken}`)
        .send({
          amount: 50.00,
          currency: 'usd'
        });

      expect(payoutResponse.status).toBe(201);
      expect(payoutResponse.body.payout.status).toBe('pending');
    });
  });

  describe('Multi-region Functionality', () => {
    test('Content replication across regions', async () => {
      const regions = ['us-east-1', 'eu-west-1', 'ap-southeast-1'];
      
      for (const region of regions) {
        const response = await request(app)
          .get(`/api/content/${contentId}/availability`)
          .set('Authorization', `Bearer ${fanToken}`)
          .set('X-Region', region);

        expect(response.status).toBe(200);
        expect(response.body.available).toBe(true);
        expect(response.body.cdnUrl).toContain(region);
      }
    });

    test('Failover handling', async () => {
      // Simulate primary region failure
      const response = await request(app)
        .get('/api/health')
        .set('X-Force-Failover', 'true');

      expect(response.status).toBe(200);
      expect(response.body.region).not.toBe('us-east-1');
      expect(response.body.status).toBe('healthy');
    });
  });

  describe('Performance Benchmarks', () => {
    test('API response times within SLA', async () => {
      const endpoints = [
        { method: 'GET', path: '/api/discovery/artists', maxTime: 200 },
        { method: 'GET', path: '/api/content/feed', maxTime: 300 },
        { method: 'POST', path: '/api/auth/login', maxTime: 500 }
      ];

      for (const endpoint of endpoints) {
        const start = Date.now();
        const response = await request(app)[endpoint.method.toLowerCase()](endpoint.path)
          .set('Authorization', `Bearer ${fanToken}`);
        const duration = Date.now() - start;

        expect(response.status).toBeLessThan(500);
        expect(duration).toBeLessThan(endpoint.maxTime);
      }
    });

    test('Concurrent user handling', async () => {
      const concurrentRequests = 100;
      const requests = [];

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          request(app)
            .get('/api/discovery/artists')
            .set('Authorization', `Bearer ${fanToken}`)
        );
      }

      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.status === 200).length;
      
      expect(successCount).toBeGreaterThan(concurrentRequests * 0.99); // 99% success rate
    });
  });
});