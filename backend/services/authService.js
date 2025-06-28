const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { OAuth2Client } = require('google-auth-library');
const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');

class AuthenticationService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
    this.accessTokenExpiry = '15m';
    this.refreshTokenExpiry = '7d';
    this.mfaTokenExpiry = '5m';
    
    // OAuth2 clients
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    // Token blacklist (should be Redis in production)
    this.tokenBlacklist = new Set();
    
    // Initialize passport strategies
    this.initializePassportStrategies();
  }

  // JWT token generation with enhanced security
  generateTokens(user, deviceInfo = {}) {
    const tokenId = crypto.randomBytes(16).toString('hex');
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Access token payload
    const accessPayload = {
      userId: user._id,
      email: user.email,
      role: user.role,
      subscription: user.subscription?.tier || 'free',
      tokenId,
      sessionId,
      type: 'access'
    };
    
    // Refresh token payload
    const refreshPayload = {
      userId: user._id,
      tokenId,
      sessionId,
      deviceInfo,
      type: 'refresh'
    };
    
    // Sign tokens
    const accessToken = jwt.sign(accessPayload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'musicconnect',
      audience: 'musicconnect-api',
      subject: user._id.toString()
    });
    
    const refreshToken = jwt.sign(refreshPayload, this.jwtRefreshSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: 'musicconnect',
      audience: 'musicconnect-api',
      subject: user._id.toString()
    });
    
    // Store session info
    this.storeSession(sessionId, {
      userId: user._id,
      tokenId,
      deviceInfo,
      createdAt: new Date()
    });
    
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900, // 15 minutes in seconds
      sessionId
    };
  }

  // Verify and decode JWT token
  async verifyToken(token, type = 'access') {
    try {
      // Check if token is blacklisted
      if (this.tokenBlacklist.has(token)) {
        throw new Error('Token has been revoked');
      }
      
      const secret = type === 'refresh' ? this.jwtRefreshSecret : this.jwtSecret;
      
      const decoded = jwt.verify(token, secret, {
        issuer: 'musicconnect',
        audience: 'musicconnect-api',
        algorithms: ['HS256']
      });
      
      // Verify token type
      if (decoded.type !== type) {
        throw new Error('Invalid token type');
      }
      
      // Check session validity
      const session = await this.getSession(decoded.sessionId);
      if (!session || session.revoked) {
        throw new Error('Session has been revoked');
      }
      
      return decoded;
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    const decoded = await this.verifyToken(refreshToken, 'refresh');
    
    // Get user data
    const User = require('../models/User');
    const user = await User.findById(decoded.userId).select('+subscription');
    
    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }
    
    // Generate new access token only
    const accessPayload = {
      userId: user._id,
      email: user.email,
      role: user.role,
      subscription: user.subscription?.tier || 'free',
      tokenId: decoded.tokenId,
      sessionId: decoded.sessionId,
      type: 'access'
    };
    
    const accessToken = jwt.sign(accessPayload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'musicconnect',
      audience: 'musicconnect-api',
      subject: user._id.toString()
    });
    
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900
    };
  }

  // Revoke tokens
  async revokeToken(token) {
    this.tokenBlacklist.add(token);
    
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.sessionId) {
        await this.revokeSession(decoded.sessionId);
      }
    } catch (error) {
      console.error('Error revoking token:', error);
    }
  }

  // Multi-factor authentication setup
  async setupMFA(userId) {
    const secret = speakeasy.generateSecret({
      name: `MusicConnect (${userId})`,
      issuer: 'MusicConnect',
      length: 32
    });
    
    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
    
    // Store secret securely (encrypted in production)
    await this.storeMFASecret(userId, secret.base32);
    
    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes: this.generateBackupCodes()
    };
  }

  // Verify MFA token
  async verifyMFA(userId, token) {
    const secret = await this.getMFASecret(userId);
    
    if (!secret) {
      throw new Error('MFA not setup for this user');
    }
    
    // Check if it's a backup code
    const backupCodes = await this.getBackupCodes(userId);
    if (backupCodes.includes(token)) {
      await this.useBackupCode(userId, token);
      return true;
    }
    
    // Verify TOTP
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2 // Allow 2 time steps for clock drift
    });
    
    if (!verified) {
      // Log failed attempt
      await this.logMFAAttempt(userId, false);
      throw new Error('Invalid MFA token');
    }
    
    await this.logMFAAttempt(userId, true);
    return true;
  }

  // Generate MFA challenge token
  generateMFAToken(userId) {
    const token = jwt.sign(
      { 
        userId, 
        type: 'mfa_challenge',
        nonce: crypto.randomBytes(16).toString('hex')
      },
      this.jwtSecret,
      { 
        expiresIn: this.mfaTokenExpiry,
        issuer: 'musicconnect'
      }
    );
    
    return token;
  }

  // OAuth2 authentication
  async authenticateOAuth(provider, token, profile) {
    let email, providerId, name, picture;
    
    switch (provider) {
      case 'google':
        const ticket = await this.googleClient.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        email = payload.email;
        providerId = payload.sub;
        name = payload.name;
        picture = payload.picture;
        break;
        
      case 'spotify':
        // Implement Spotify OAuth
        break;
        
      case 'apple':
        // Implement Apple OAuth
        break;
        
      default:
        throw new Error('Unsupported OAuth provider');
    }
    
    // Find or create user
    const User = require('../models/User');
    let user = await User.findOne({
      $or: [
        { email },
        { [`oauth.${provider}.id`]: providerId }
      ]
    });
    
    if (!user) {
      // Create new user
      user = await User.create({
        email,
        name,
        profileImage: picture,
        isVerified: true,
        oauth: {
          [provider]: {
            id: providerId,
            email,
            profile
          }
        }
      });
    } else {
      // Update OAuth info
      user.oauth = user.oauth || {};
      user.oauth[provider] = {
        id: providerId,
        email,
        profile,
        lastLogin: new Date()
      };
      await user.save();
    }
    
    return user;
  }

  // Session management
  async createSession(userId, deviceInfo = {}) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
      sessionId,
      userId,
      deviceInfo,
      createdAt: new Date(),
      lastActivity: new Date(),
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent
    };
    
    await this.storeSession(sessionId, session);
    return sessionId;
  }

  async validateSession(sessionId) {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return false;
    }
    
    // Check session expiry (30 days)
    const expiryTime = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(session.createdAt).getTime() > expiryTime) {
      await this.revokeSession(sessionId);
      return false;
    }
    
    // Update last activity
    session.lastActivity = new Date();
    await this.updateSession(sessionId, session);
    
    return true;
  }

  // Device fingerprinting
  generateDeviceFingerprint(req) {
    const components = [
      req.headers['user-agent'],
      req.headers['accept-language'],
      req.headers['accept-encoding'],
      req.ip,
      req.headers['sec-ch-ua'],
      req.headers['sec-ch-ua-platform']
    ].filter(Boolean);
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  // Initialize Passport strategies
  initializePassportStrategies() {
    // JWT Strategy
    passport.use(new JwtStrategy({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: this.jwtSecret,
      issuer: 'musicconnect',
      audience: 'musicconnect-api'
    }, async (payload, done) => {
      try {
        if (payload.type !== 'access') {
          return done(null, false);
        }
        
        const User = require('../models/User');
        const user = await User.findById(payload.userId);
        
        if (!user || !user.isActive) {
          return done(null, false);
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }));
  }

  // Helper methods
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  async storeSession(sessionId, session) {
    // Store in Redis or database
    // This is a placeholder
  }

  async getSession(sessionId) {
    // Retrieve from Redis or database
    // This is a placeholder
    return null;
  }

  async updateSession(sessionId, session) {
    // Update in Redis or database
    // This is a placeholder
  }

  async revokeSession(sessionId) {
    // Revoke in Redis or database
    // This is a placeholder
  }

  async storeMFASecret(userId, secret) {
    // Store encrypted in database
    // This is a placeholder
  }

  async getMFASecret(userId) {
    // Retrieve from database
    // This is a placeholder
    return null;
  }

  async getBackupCodes(userId) {
    // Retrieve from database
    // This is a placeholder
    return [];
  }

  async useBackupCode(userId, code) {
    // Mark backup code as used
    // This is a placeholder
  }

  async logMFAAttempt(userId, success) {
    // Log MFA attempt
    // This is a placeholder
  }

  // Password security
  async hashPassword(password) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  // Account lockout mechanism
  async checkAccountLockout(userId) {
    const attempts = await this.getFailedLoginAttempts(userId);
    const maxAttempts = 5;
    const lockoutDuration = 30 * 60 * 1000; // 30 minutes
    
    if (attempts >= maxAttempts) {
      const lastAttempt = await this.getLastFailedAttempt(userId);
      const timeSinceLastAttempt = Date.now() - lastAttempt;
      
      if (timeSinceLastAttempt < lockoutDuration) {
        const remainingTime = Math.ceil((lockoutDuration - timeSinceLastAttempt) / 60000);
        throw new Error(`Account locked. Try again in ${remainingTime} minutes.`);
      } else {
        // Reset attempts after lockout period
        await this.resetFailedLoginAttempts(userId);
      }
    }
  }

  async recordFailedLogin(userId, ipAddress) {
    // Record failed login attempt
    // This is a placeholder
  }

  async recordSuccessfulLogin(userId, ipAddress) {
    // Record successful login and reset failed attempts
    // This is a placeholder
  }

  async getFailedLoginAttempts(userId) {
    // Get failed login attempts from database
    // This is a placeholder
    return 0;
  }

  async getLastFailedAttempt(userId) {
    // Get timestamp of last failed attempt
    // This is a placeholder
    return Date.now();
  }

  async resetFailedLoginAttempts(userId) {
    // Reset failed login attempts
    // This is a placeholder
  }
}

module.exports = new AuthenticationService();