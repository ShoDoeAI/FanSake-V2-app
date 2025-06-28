const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

let app;
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  
  const server = require('../../server');
  app = server.app;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Complete User Journey Tests', () => {
  describe('Fan Registration to Subscription Flow', () => {
    let fanToken;
    let artistToken;
    let artistId;
    let subscriptionId;
    
    test('1. Fan registers successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testfan',
          email: 'fan@test.com',
          password: 'TestPass123!',
          role: 'fan'
        });
      
      expect(response.status).toBe(201);
      expect(response.body.token).toBeDefined();
      fanToken = response.body.token;
    });
    
    test('2. Artist registers and sets up profile', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testartist',
          email: 'artist@test.com',
          password: 'TestPass123!',
          role: 'artist',
          artistName: 'Test Artist',
          genre: 'Rock'
        });
      
      expect(response.status).toBe(201);
      artistToken = response.body.token;
      artistId = response.body.user.id;
    });
    
    test('3. Fan discovers artist', async () => {
      const response = await request(app)
        .get('/api/discovery')
        .set('Authorization', `Bearer ${fanToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.artists).toContainEqual(
        expect.objectContaining({ username: 'testartist' })
      );
    });
    
    test('4. Fan views artist profile', async () => {
      const response = await request(app)
        .get(`/api/artists/${artistId}`)
        .set('Authorization', `Bearer ${fanToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.artist.artistName).toBe('Test Artist');
    });
    
    test('5. Fan subscribes to artist', async () => {
      const response = await request(app)
        .post('/api/subscriptions/create')
        .set('Authorization', `Bearer ${fanToken}`)
        .send({
          artistId,
          tier: 'gold',
          paymentMethodId: 'pm_card_visa' // Test payment method
        });
      
      expect(response.status).toBe(200);
      expect(response.body.subscription).toBeDefined();
      subscriptionId = response.body.subscription.id;
    });
    
    test('6. Fan accesses exclusive content', async () => {
      const response = await request(app)
        .get(`/api/artists/${artistId}/content`)
        .set('Authorization', `Bearer ${fanToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.content).toBeDefined();
    });
  });
  
  describe('Artist Content Management Flow', () => {
    let artistToken;
    let contentId;
    
    beforeAll(async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'artist@test.com',
          password: 'TestPass123!'
        });
      artistToken = response.body.token;
    });
    
    test('1. Artist uploads content', async () => {
      const response = await request(app)
        .post('/api/uploads/content')
        .set('Authorization', `Bearer ${artistToken}`)
        .field('title', 'Test Song')
        .field('description', 'Test Description')
        .field('tier', 'gold')
        .attach('file', Buffer.from('test audio data'), 'test.mp3');
      
      expect(response.status).toBe(201);
      expect(response.body.content).toBeDefined();
      contentId = response.body.content.id;
    });
    
    test('2. Artist updates content metadata', async () => {
      const response = await request(app)
        .put(`/api/uploads/content/${contentId}`)
        .set('Authorization', `Bearer ${artistToken}`)
        .send({
          title: 'Updated Test Song',
          description: 'Updated Description'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.content.title).toBe('Updated Test Song');
    });
    
    test('3. Artist views analytics', async () => {
      const response = await request(app)
        .get('/api/artists/analytics')
        .set('Authorization', `Bearer ${artistToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.analytics).toBeDefined();
    });
  });
  
  describe('Messaging and Community Flow', () => {
    let fanToken;
    let artistToken;
    let messageId;
    
    beforeAll(async () => {
      const fanResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'fan@test.com', password: 'TestPass123!' });
      fanToken = fanResponse.body.token;
      
      const artistResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'artist@test.com', password: 'TestPass123!' });
      artistToken = artistResponse.body.token;
    });
    
    test('1. Fan sends message to artist', async () => {
      const response = await request(app)
        .post('/api/messaging/send')
        .set('Authorization', `Bearer ${fanToken}`)
        .send({
          recipientId: artistId,
          content: 'Love your music!'
        });
      
      expect(response.status).toBe(201);
      expect(response.body.message).toBeDefined();
      messageId = response.body.message.id;
    });
    
    test('2. Artist receives and replies to message', async () => {
      const messagesResponse = await request(app)
        .get('/api/messaging/inbox')
        .set('Authorization', `Bearer ${artistToken}`);
      
      expect(messagesResponse.status).toBe(200);
      expect(messagesResponse.body.messages).toHaveLength(1);
      
      const replyResponse = await request(app)
        .post('/api/messaging/reply')
        .set('Authorization', `Bearer ${artistToken}`)
        .send({
          messageId,
          content: 'Thank you for your support!'
        });
      
      expect(replyResponse.status).toBe(201);
    });
    
    test('3. Create and join listening party', async () => {
      const createResponse = await request(app)
        .post('/api/community/listening-party')
        .set('Authorization', `Bearer ${artistToken}`)
        .send({
          title: 'Album Release Party',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          playlist: ['song1', 'song2']
        });
      
      expect(createResponse.status).toBe(201);
      const partyId = createResponse.body.party.id;
      
      const joinResponse = await request(app)
        .post(`/api/community/listening-party/${partyId}/join`)
        .set('Authorization', `Bearer ${fanToken}`);
      
      expect(joinResponse.status).toBe(200);
    });
  });
});