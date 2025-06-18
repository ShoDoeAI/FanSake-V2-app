const express = require('express');
// Use mock User for testing
const User = require('../models/MockUser');
// const User = require('../models/User'); // Uncomment when MongoDB is available
const Content = require('../models/Content');
const { authenticateToken, requireArtist, optionalAuth } = require('../middleware/auth');
const { USER_TYPES } = require('../../shared/types');

const router = express.Router();

// @route   GET /api/artists
// @desc    Get all artists with pagination
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'followers'; // followers, discoveries, newest

    let sortOptions = {};
    switch (sortBy) {
      case 'followers':
        sortOptions = { 'stats.followers': -1 };
        break;
      case 'discoveries':
        sortOptions = { 'stats.discoveries': -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      default:
        sortOptions = { 'stats.followers': -1 };
    }

    const artists = await User.find({
      userType: USER_TYPES.ARTIST,
      isActive: true
    })
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .select('username displayName artistInfo bio profileImage stats genres location createdAt');

    const totalArtists = await User.countDocuments({
      userType: USER_TYPES.ARTIST,
      isActive: true
    });

    res.json({
      message: 'Artists retrieved successfully',
      data: artists,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalArtists / limit),
        totalArtists,
        hasNext: page < Math.ceil(totalArtists / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get artists error:', error);
    res.status(500).json({
      error: 'Failed to get artists',
      message: 'An error occurred while fetching artists'
    });
  }
});

// @route   GET /api/artists/:id
// @desc    Get artist profile by ID
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const artist = await User.findOne({
      _id: req.params.id,
      userType: USER_TYPES.ARTIST,
      isActive: true
    }).select('-password -email');

    if (!artist) {
      return res.status(404).json({
        error: 'Artist not found',
        message: 'The specified artist does not exist'
      });
    }

    // Get artist's content
    const content = await Content.find({
      creator: artist._id,
      isActive: true
    })
    .sort({ publishedAt: -1 })
    .limit(10)
    .select('title description contentType media publishedAt metrics access');

    // Check if current user follows this artist
    let isFollowing = false;
    if (req.user && req.user.userType === USER_TYPES.FAN) {
      isFollowing = req.user.fanInfo.followedArtists.includes(artist._id);
    }

    res.json({
      message: 'Artist profile retrieved successfully',
      data: {
        artist: artist.toPublicProfile(),
        content,
        isFollowing,
        contentCount: content.length
      }
    });

  } catch (error) {
    console.error('Get artist profile error:', error);
    res.status(500).json({
      error: 'Failed to get artist profile',
      message: 'An error occurred while fetching the artist profile'
    });
  }
});

// @route   PUT /api/artists/profile
// @desc    Update artist profile
// @access  Private (Artist only)
router.put('/profile', authenticateToken, requireArtist, async (req, res) => {
  try {
    const allowedUpdates = [
      'displayName', 'bio', 'location', 'genres',
      'artistInfo.stageName', 'artistInfo.description', 'artistInfo.socialLinks'
    ];

    const updates = {};
    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          if (!updates[parent]) updates[parent] = {};
          updates[parent][child] = req.body[field];
        } else {
          updates[field] = req.body[field];
        }
      }
    }

    // Handle nested updates for artistInfo
    if (updates.artistInfo) {
      const currentArtistInfo = req.user.artistInfo || {};
      updates.artistInfo = { ...currentArtistInfo, ...updates.artistInfo };
    }

    const updatedArtist = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -email');

    res.json({
      message: 'Profile updated successfully',
      data: updatedArtist.toPublicProfile()
    });

  } catch (error) {
    console.error('Update artist profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: 'An error occurred while updating the profile'
    });
  }
});

// @route   GET /api/artists/:id/content
// @desc    Get all content from an artist
// @access  Public (with tier restrictions)
router.get('/:id/content', optionalAuth, async (req, res) => {
  try {
    const artistId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const contentType = req.query.type; // music, video, blog_post, etc.

    // Verify artist exists
    const artist = await User.findOne({
      _id: artistId,
      userType: USER_TYPES.ARTIST,
      isActive: true
    });

    if (!artist) {
      return res.status(404).json({
        error: 'Artist not found',
        message: 'The specified artist does not exist'
      });
    }

    // Build content query
    const query = {
      creator: artistId,
      isActive: true
    };

    if (contentType) {
      query.contentType = contentType;
    }

    // Get content
    const content = await Content.find(query)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('creator', 'username displayName artistInfo.stageName profileImage');

    // Filter content based on user access
    const accessibleContent = content.filter(item => 
      item.canUserAccess(req.user)
    );

    const totalContent = await Content.countDocuments(query);

    res.json({
      message: 'Artist content retrieved successfully',
      data: accessibleContent,
      artist: {
        id: artist._id,
        name: artist.name,
        username: artist.username
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalContent / limit),
        totalContent,
        hasNext: page < Math.ceil(totalContent / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get artist content error:', error);
    res.status(500).json({
      error: 'Failed to get artist content',
      message: 'An error occurred while fetching the artist content'
    });
  }
});

// @route   GET /api/artists/:id/exclusive
// @desc    Get exclusive content from an artist (Super Fan tier)
// @access  Private (Fan with appropriate tier)
router.get('/:id/exclusive', authenticateToken, async (req, res) => {
  try {
    const artistId = req.params.id;

    // Verify artist exists
    const artist = await User.findOne({
      _id: artistId,
      userType: USER_TYPES.ARTIST,
      isActive: true
    });

    if (!artist) {
      return res.status(404).json({
        error: 'Artist not found',
        message: 'The specified artist does not exist'
      });
    }

    // Check if user is a fan following this artist
    if (req.user.userType !== USER_TYPES.FAN) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only fans can access exclusive content'
      });
    }

    const isFollowing = req.user.fanInfo.followedArtists.includes(artistId);
    if (!isFollowing) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You must follow this artist to access exclusive content'
      });
    }

    // Get exclusive content
    const exclusiveContent = await Content.getExclusiveContent(artistId);

    // Filter based on user's tier
    const accessibleContent = exclusiveContent.filter(item => 
      item.canUserAccess(req.user)
    );

    res.json({
      message: 'Exclusive content retrieved successfully',
      data: accessibleContent,
      artist: {
        id: artist._id,
        name: artist.name,
        username: artist.username
      },
      userTier: req.user.fanInfo.tier
    });

  } catch (error) {
    console.error('Get exclusive content error:', error);
    res.status(500).json({
      error: 'Failed to get exclusive content',
      message: 'An error occurred while fetching exclusive content'
    });
  }
});

// @route   GET /api/artists/dashboard/stats
// @desc    Get dashboard stats for artist
// @access  Private (Artist only)
router.get('/dashboard/stats', authenticateToken, requireArtist, async (req, res) => {
  try {
    const artistId = req.user._id;

    // Get content stats
    const contentStats = await Content.aggregate([
      { $match: { creator: artistId, isActive: true } },
      {
        $group: {
          _id: null,
          totalContent: { $sum: 1 },
          totalViews: { $sum: '$metrics.views' },
          totalLikes: { $sum: '$metrics.likes' },
          totalShares: { $sum: '$metrics.shares' },
          totalComments: { $sum: '$metrics.comments' }
        }
      }
    ]);

    // Get content by type
    const contentByType = await Content.aggregate([
      { $match: { creator: artistId, isActive: true } },
      {
        $group: {
          _id: '$contentType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get recent followers (fans who follow this artist)
    const recentFollowers = await User.find({
      userType: USER_TYPES.FAN,
      'fanInfo.followedArtists': artistId,
      isActive: true
    })
    .sort({ 'fanInfo.fanSince': -1 })
    .limit(10)
    .select('username displayName profileImage fanInfo.tier fanInfo.fanSince');

    const stats = contentStats[0] || {
      totalContent: 0,
      totalViews: 0,
      totalLikes: 0,
      totalShares: 0,
      totalComments: 0
    };

    res.json({
      message: 'Dashboard stats retrieved successfully',
      data: {
        overview: {
          ...stats,
          followers: req.user.stats.followers,
          discoveries: req.user.stats.discoveries
        },
        contentByType,
        recentFollowers,
        engagementRate: stats.totalContent > 0 ? 
          (stats.totalLikes + stats.totalComments + stats.totalShares) / stats.totalViews * 100 : 0
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      error: 'Failed to get dashboard stats',
      message: 'An error occurred while fetching dashboard statistics'
    });
  }
});

module.exports = router;

