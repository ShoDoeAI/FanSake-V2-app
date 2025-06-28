const request = require('supertest');
const app = require('../../server');
const redis = require('../../config/redis');
const AWS = require('aws-sdk');
const { MongoClient } = require('mongodb');

describe('FanSake Integration Tests', () => {
  let db;

  beforeAll(async () => {
    const client = await MongoClient.connect(process.env.MONGODB_URI_TEST);
    db = client.db();
  });

  afterAll(async () => {
    await redis.quit();
    await db.client.close();
  });

  describe('Cache Integration', () => {
    test('Redis caching for frequently accessed data', async () => {
      const artistId = 'test-artist-123';
      
      // First request - should hit database
      const start1 = Date.now();
      const response1 = await request(app)
        .get(`/api/artists/${artistId}/profile`);
      const time1 = Date.now() - start1;

      expect(response1.status).toBe(200);

      // Second request - should hit cache
      const start2 = Date.now();
      const response2 = await request(app)
        .get(`/api/artists/${artistId}/profile`);
      const time2 = Date.now() - start2;

      expect(response2.status).toBe(200);
      expect(time2).toBeLessThan(time1 * 0.5); // Cache should be at least 50% faster
    });

    test('Cache invalidation on updates', async () => {
      const artistToken = 'valid-token';
      
      // Update profile
      await request(app)
        .put('/api/artists/profile')
        .set('Authorization', `Bearer ${artistToken}`)
        .send({ bio: 'Updated bio' });

      // Get updated profile
      const response = await request(app)
        .get('/api/artists/profile')
        .set('Authorization', `Bearer ${artistToken}`);

      expect(response.body.artist.bio).toBe('Updated bio');
    });
  });

  describe('AWS Services Integration', () => {
    test('S3 file upload and CDN distribution', async () => {
      const s3 = new AWS.S3();
      const cloudfront = new AWS.CloudFront();

      // Upload file
      const uploadResponse = await request(app)
        .post('/api/uploads/music')
        .set('Authorization', 'Bearer artist-token')
        .attach('file', Buffer.from('test-audio'), 'test.mp3');

      expect(uploadResponse.status).toBe(201);
      const fileKey = uploadResponse.body.content.fileKey;

      // Verify S3 upload
      const s3Object = await s3.headObject({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileKey
      }).promise();

      expect(s3Object.ContentType).toBe('audio/mpeg');

      // Verify CloudFront distribution
      const cdnUrl = uploadResponse.body.content.cdnUrl;
      expect(cdnUrl).toContain('cloudfront.net');
    });

    test('SES email notifications', async () => {
      const ses = new AWS.SES();
      const mockSendEmail = jest.spyOn(ses, 'sendEmail');

      // Trigger notification
      await request(app)
        .post('/api/notifications/test')
        .send({
          userId: 'test-user',
          type: 'new-content',
          message: 'New content available'
        });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          Destination: expect.any(Object),
          Message: expect.objectContaining({
            Subject: expect.objectContaining({ Data: expect.stringContaining('FanSake') })
          })
        })
      );
    });
  });

  describe('WebSocket Real-time Features', () => {
    test('Real-time messaging', async (done) => {
      const io = require('socket.io-client');
      const socket1 = io('http://localhost:3000', {
        auth: { token: 'user1-token' }
      });
      const socket2 = io('http://localhost:3000', {
        auth: { token: 'user2-token' }
      });

      socket2.on('new-message', (message) => {
        expect(message.content).toBe('Hello!');
        expect(message.from).toBe('user1');
        socket1.disconnect();
        socket2.disconnect();
        done();
      });

      socket1.emit('send-message', {
        to: 'user2',
        content: 'Hello!'
      });
    });

    test('Listening party synchronization', async (done) => {
      const io = require('socket.io-client');
      const hostSocket = io('http://localhost:3000', {
        auth: { token: 'host-token' }
      });
      const participantSocket = io('http://localhost:3000', {
        auth: { token: 'participant-token' }
      });

      participantSocket.on('party-update', (update) => {
        expect(update.action).toBe('play');
        expect(update.timestamp).toBeDefined();
        expect(update.position).toBe(30);
        hostSocket.disconnect();
        participantSocket.disconnect();
        done();
      });

      // Join party
      participantSocket.emit('join-party', { partyId: 'test-party' });
      
      // Host controls playback
      hostSocket.emit('party-control', {
        partyId: 'test-party',
        action: 'play',
        position: 30
      });
    });
  });

  describe('Payment Processing Integration', () => {
    test('Stripe webhook processing', async () => {
      const webhookPayload = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            items: {
              data: [{
                price: {
                  id: 'price_test123',
                  unit_amount: 999
                }
              }]
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', process.env.STRIPE_WEBHOOK_SECRET)
        .send(webhookPayload);

      expect(response.status).toBe(200);

      // Verify subscription created in database
      const subscription = await db.collection('subscriptions').findOne({
        stripeSubscriptionId: 'sub_test123'
      });
      expect(subscription).toBeDefined();
    });

    test('Revenue sharing calculation', async () => {
      const payment = {
        amount: 10000, // $100.00
        artistId: 'artist123',
        fanId: 'fan123'
      };

      const response = await request(app)
        .post('/api/internal/process-revenue')
        .send(payment);

      expect(response.body.artistShare).toBe(7000); // 70%
      expect(response.body.platformShare).toBe(3000); // 30%
    });
  });

  describe('Analytics and Monitoring', () => {
    test('Event tracking to analytics service', async () => {
      const events = [
        { type: 'page_view', page: '/artist/123' },
        { type: 'content_play', contentId: 'content123' },
        { type: 'subscription_created', tierId: 'tier123' }
      ];

      for (const event of events) {
        const response = await request(app)
          .post('/api/analytics/track')
          .send(event);
        
        expect(response.status).toBe(201);
      }

      // Verify events in analytics database
      const trackedEvents = await db.collection('analytics_events')
        .find({ sessionId: expect.any(String) })
        .toArray();
      
      expect(trackedEvents.length).toBe(events.length);
    });

    test('Performance metrics collection', async () => {
      const response = await request(app)
        .get('/api/metrics/performance');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        apiLatency: expect.any(Object),
        databaseQueries: expect.any(Object),
        cacheHitRate: expect.any(Number),
        activeConnections: expect.any(Number)
      });
    });
  });

  describe('Security Features', () => {
    test('Rate limiting enforcement', async () => {
      const requests = [];
      
      // Make 100 requests rapidly
      for (let i = 0; i < 100; i++) {
        requests.push(
          request(app).get('/api/discovery/artists')
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    test('CSRF protection', async () => {
      // Request without CSRF token should fail
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('CSRF');
    });

    test('Input sanitization', async () => {
      const maliciousInput = {
        name: '<script>alert("XSS")</script>',
        bio: 'Normal text with <img src=x onerror=alert("XSS")>'
      };

      const response = await request(app)
        .put('/api/artists/profile')
        .set('Authorization', 'Bearer artist-token')
        .send(maliciousInput);

      expect(response.status).toBe(200);
      expect(response.body.artist.name).not.toContain('<script>');
      expect(response.body.artist.bio).not.toContain('onerror');
    });
  });
});