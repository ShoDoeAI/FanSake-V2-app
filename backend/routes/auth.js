const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
// Use mock User for testing
const User = require('../models/MockUser');
// const User = require('../models/User'); // Uncomment when MongoDB is available
const { USER_TYPES, MUSIC_GENRES } = require('../../shared/types');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  displayName: Joi.string().min(1).max(50).required(),
  userType: Joi.string().valid(...Object.values(USER_TYPES)).required(),
  bio: Joi.string().max(500).optional(),
  location: Joi.object({
    city: Joi.string().max(100).optional(),
    country: Joi.string().max(100).optional()
  }).optional(),
  genres: Joi.array().items(Joi.string().valid(...MUSIC_GENRES)).optional(),
  
  // Artist-specific fields
  artistInfo: Joi.when('userType', {
    is: USER_TYPES.ARTIST,
    then: Joi.object({
      stageName: Joi.string().max(100).optional(),
      description: Joi.string().max(1000).optional(),
      socialLinks: Joi.object({
        website: Joi.string().uri().optional(),
        spotify: Joi.string().uri().optional(),
        soundcloud: Joi.string().uri().optional(),
        bandcamp: Joi.string().uri().optional(),
        instagram: Joi.string().optional(),
        twitter: Joi.string().optional(),
        youtube: Joi.string().uri().optional()
      }).optional()
    }).optional(),
    otherwise: Joi.forbidden()
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId }, 
    process.env.JWT_SECRET || 'fallback_secret', 
    { expiresIn: '7d' }
  );
};

// @route   POST /api/auth/register
// @desc    Register a new user (artist or fan)
// @access  Public
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const { email, password, username, userType } = value;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'User already exists',
        message: 'A user with this email or username already exists'
      });
    }

    // Create new user
    const userData = {
      ...value,
      stats: {
        followers: 0,
        following: 0,
        posts: 0,
        discoveries: 0
      }
    };

    // Initialize fan-specific data if user is a fan
    if (userType === USER_TYPES.FAN) {
      userData.fanInfo = {
        tier: 'casual',
        followedArtists: [],
        fanSince: new Date(),
        totalSpent: 0
      };
    }

    const user = new User(userData);
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Return user data (excluding password)
    const userResponse = user.toPublicProfile();

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const { email, password } = value;

    // Find user by email
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Return user data (excluding password)
    const userResponse = user.toPublicProfile();

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

// @route   GET /api/auth/verify
// @desc    Verify JWT token and return user data
// @access  Private
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const user = await User.findById(decoded.userId).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User not found or inactive'
      });
    }

    res.json({
      message: 'Token valid',
      user: user.toPublicProfile()
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      error: 'Invalid token',
      message: 'Token verification failed'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh JWT token
// @access  Private
router.post('/refresh', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    // Verify token (even if expired)
    const decoded = jwt.decode(token);
    if (!decoded) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token is malformed'
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User not found or inactive'
      });
    }

    // Generate new token
    const newToken = generateToken(user._id);

    res.json({
      message: 'Token refreshed successfully',
      token: newToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: 'Unable to refresh token'
    });
  }
});

// @route   POST /api/auth/create-demo-accounts
// @desc    Create demo accounts for testing
// @access  Public (only in development)
router.post('/create-demo-accounts', async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Demo accounts can only be created in development mode'
      });
    }

    // Create artist demo account
    const artistData = {
      email: 'artist@demo.com',
      password: 'password123',
      username: 'demo_artist',
      displayName: 'Demo Artist',
      userType: 'artist',
      bio: 'I am a demo artist for testing purposes',
      location: { city: 'Demo City', country: 'Demo Country' },
      genres: ['Rock', 'Indie'],
      artistInfo: {
        stageName: 'The Demo Band',
        description: 'A demo artist account for testing the platform'
      }
    };

    // Create fan demo account
    const fanData = {
      email: 'fan@demo.com',
      password: 'password123',
      username: 'demo_fan',
      displayName: 'Demo Fan',
      userType: 'fan',
      bio: 'I am a demo fan for testing purposes',
      location: { city: 'Demo City', country: 'Demo Country' },
      genres: ['Rock', 'Pop', 'Electronic'],
      fanInfo: {
        tier: 'casual',
        followedArtists: [],
        fanSince: new Date(),
        totalSpent: 0
      }
    };

    // Check if accounts already exist
    const existingArtist = await User.findOne({ email: 'artist@demo.com' });
    const existingFan = await User.findOne({ email: 'fan@demo.com' });

    let created = [];

    if (!existingArtist) {
      const artist = new User(artistData);
      await artist.save();
      created.push('artist@demo.com');
    }

    if (!existingFan) {
      const fan = new User(fanData);
      await fan.save();
      created.push('fan@demo.com');
    }

    res.json({
      message: 'Demo accounts processed',
      created,
      existing: [
        ...(existingArtist ? ['artist@demo.com'] : []),
        ...(existingFan ? ['fan@demo.com'] : [])
      ]
    });

  } catch (error) {
    console.error('Demo accounts creation error:', error);
    res.status(500).json({
      error: 'Failed to create demo accounts',
      message: error.message
    });
  }
});

module.exports = router;

