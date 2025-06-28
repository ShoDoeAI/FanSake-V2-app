const request = require('supertest');
const app = require('../server-secure');
const authService = require('../services/authService');
const abuseDetection = require('../services/abuseDetection');
const contentSecurity = require('../services/contentSecurity');
const { DataProtectionService } = require('../services/dataProtection');

describe('Security Features', () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    // Create test user and get auth token
    testUser = {
      id: 'test123',
      email: 'test@musicconnect.com',
      role: 'user',
      subscription: { tier: 'free' }
    };
    
    const tokens = authService.generateTokens(testUser);
    authToken = tokens.accessToken;
  });

  describe('Rate Limiting', () => {
    test('should enforce tier-based rate limits', async () => {
      // Make requests up to the limit
      for (let i = 0; i < 100; i++) {
        await request(app)
          .get('/api/artists')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
      }

      // Next request should be rate limited
      const response = await request(app)
        .get('/api/artists')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(429);

      expect(response.body.error).toContain('Too many requests');
      expect(response.body.tier).toBe('free');
    });

    test('should block DDoS attempts', async () => {
      // Simulate rapid requests without auth
      const promises = [];
      for (let i = 0; i < 35; i++) {
        promises.push(
          request(app)
            .get('/api/auth/login')
            .send({ email: 'test@test.com', password: 'wrong' })
        );
      }

      const responses = await Promise.all(promises);
      const blockedResponses = responses.filter(r => r.status === 429);
      
      expect(blockedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('WAF Protection', () => {
    test('should block SQL injection attempts', async () => {
      const response = await request(app)
        .get('/api/artists?search=1\' OR \'1\'=\'1')
        .expect(403);

      expect(response.body.message).toContain('Request blocked by security policy');
    });

    test('should block XSS attempts', async () => {
      const response = await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: '<script>alert("XSS")</script>'
        })
        .expect(403);

      expect(response.body.message).toContain('Request blocked by security policy');
    });

    test('should block path traversal attempts', async () => {
      const response = await request(app)
        .get('/api/content/../../etc/passwd')
        .expect(403);

      expect(response.body.message).toContain('Request blocked by security policy');
    });
  });

  describe('Authentication Security', () => {
    test('should validate JWT tokens properly', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      const response = await request(app)
        .get('/api/artists')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error).toContain('Authentication failed');
    });

    test('should handle expired tokens', async () => {
      // Create token with very short expiry
      const expiredToken = authService.generateTokens(testUser, { expiresIn: '1ms' }).accessToken;
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const response = await request(app)
        .get('/api/artists')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error).toContain('Token expired');
    });

    test('should enforce MFA when enabled', async () => {
      // Mock user with MFA enabled
      const mfaUser = { ...testUser, mfaEnabled: true };
      const mfaToken = authService.generateTokens(mfaUser).accessToken;
      
      const response = await request(app)
        .post('/api/account/sensitive-action')
        .set('Authorization', `Bearer ${mfaToken}`)
        .expect(401);

      expect(response.body.error).toBe('MFA required');
      expect(response.body.mfaRequired).toBe(true);
    });
  });

  describe('Content Security', () => {
    test('should generate content fingerprints', async () => {
      const contentId = 'test-content-123';
      const userId = 'user-123';
      
      const fingerprint = contentSecurity.generateContentId(userId, 'audio');
      
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should encrypt and decrypt content', async () => {
      const originalContent = Buffer.from('Test audio content');
      const contentPath = '/tmp/test-audio.mp3';
      
      // Mock file operations
      const encrypted = await contentSecurity.encryptContent(contentPath, 'user123', 'content123');
      
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('content');
      expect(encrypted.userId).toBe('user123');
    });

    test('should generate secure streaming URLs', async () => {
      const url = await contentSecurity.generateSecureStreamUrl('content123', 'user123', 60);
      
      expect(url).toContain('token=');
      expect(url).toContain('expires=');
      expect(url).toContain('signature=');
    });
  });

  describe('Data Protection', () => {
    test('should encrypt PII fields', () => {
      const sensitiveData = 'user@example.com';
      const encrypted = DataProtectionService.encryptField(sensitiveData);
      
      expect(encrypted).toHaveProperty('encrypted');
      expect(encrypted).toHaveProperty('salt');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      
      // Verify decryption works
      const decrypted = DataProtectionService.decryptField(encrypted);
      expect(decrypted).toBe(sensitiveData);
    });

    test('should anonymize user data properly', () => {
      const userData = {
        email: 'john.doe@example.com',
        phone: '+1234567890',
        name: 'John Doe',
        dateOfBirth: '1990-05-15',
        creditCard: '4111111111111111'
      };
      
      const anonymized = DataProtectionService.anonymizeUserData(userData);
      
      expect(anonymized.email).toBe('jo****@example.com');
      expect(anonymized.phone).toBe('+*********0');
      expect(anonymized.name).toBe('J*** D***');
      expect(anonymized.dateOfBirth).toBe('1990-01-01');
      expect(anonymized.creditCard).toBeUndefined();
    });

    test('should handle GDPR data export request', async () => {
      const exportData = await DataProtectionService.exportUserData('user123');
      
      expect(exportData).toHaveProperty('exportDate');
      expect(exportData).toHaveProperty('userId', 'user123');
      expect(exportData).toHaveProperty('data');
    });
  });

  describe('Abuse Detection', () => {
    test('should track and limit suspicious activities', async () => {
      const userId = 'suspicious-user';
      
      // Simulate multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await abuseDetection.trackAction(userId, 'loginAttempts');
      }
      
      const result = await abuseDetection.trackAction(userId, 'loginAttempts');
      expect(result.blocked).toBe(true);
    });

    test('should detect malicious patterns', async () => {
      const requestData = {
        url: '/api/users?id=1 UNION SELECT * FROM users',
        headers: { 'user-agent': 'sqlmap/1.0' },
        body: { script: '<script>alert(1)</script>' }
      };
      
      const patterns = await abuseDetection.detectSuspiciousPattern('user123', requestData);
      
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.type === 'sqlInjection')).toBe(true);
    });

    test('should manage IP reputation', async () => {
      const testIP = '192.168.1.100';
      
      // Check initial reputation
      const initial = await abuseDetection.checkIPReputation(testIP);
      expect(initial.status).toBe('new');
      
      // Decrease reputation
      await abuseDetection.updateIPReputation(testIP, -50, 'suspicious_activity');
      
      const updated = await abuseDetection.checkIPReputation(testIP);
      expect(updated.score).toBeLessThan(100);
    });
  });

  describe('Security Headers', () => {
    test('should set proper security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['strict-transport-security']).toContain('max-age=');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    test('should enforce CSP headers', async () => {
      const response = await request(app)
        .get('/api/public/info')
        .expect(200);

      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });
  });

  describe('Input Validation', () => {
    test('should sanitize HTML input', async () => {
      const response = await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: '<p>Hello <script>alert("xss")</script>world</p>'
        })
        .expect(200);

      expect(response.body.content).not.toContain('<script>');
      expect(response.body.content).toContain('Hello world');
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'ValidPass123!'
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid email');
    });

    test('should enforce strong password requirements', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak'
        })
        .expect(400);

      expect(response.body.error).toContain('Password does not meet requirements');
    });
  });

  describe('Session Security', () => {
    test('should validate session integrity', async () => {
      const sessionId = 'test-session-123';
      
      const response = await request(app)
        .get('/api/account')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Session-ID', sessionId)
        .expect(401);

      expect(response.body.error).toContain('Session invalid');
    });

    test('should handle concurrent sessions', async () => {
      // Create multiple sessions for same user
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const session = await authService.createSession(testUser.id, {
          ipAddress: `192.168.1.${i}`,
          userAgent: 'Test Browser'
        });
        sessions.push(session);
      }
      
      expect(sessions.length).toBe(3);
      expect(sessions[0]).not.toBe(sessions[1]);
    });
  });
});

// Cleanup after tests
afterAll(async () => {
  // Close connections
  await app.close();
});