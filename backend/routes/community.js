const express = require('express');
const Content = require('../models/Content');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/community/feed
// @desc    Get community feed (trending and recent content)
// @access  Public
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get public content sorted by engagement and recency
    const feedContent = await Content.find({
      'access.isPublic': true,
      isActive: true
    })
    .sort({
      'metrics.views': -1,
      'metrics.likes': -1,
      publishedAt: -1
    })
    .skip(skip)
    .limit(limit)
    .populate('creator', 'username displayName artistInfo.stageName profileImage');

    const totalContent = await Content.countDocuments({
      'access.isPublic': true,
      isActive: true
    });

    res.json({
      message: 'Community feed retrieved successfully',
      data: feedContent,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalContent / limit),
        totalContent,
        hasNext: page < Math.ceil(totalContent / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get community feed error:', error);
    res.status(500).json({
      error: 'Failed to get community feed',
      message: 'An error occurred while fetching the community feed'
    });
  }
});

// @route   POST /api/community/content/:contentId/like
// @desc    Like a piece of content
// @access  Private
router.post('/content/:contentId/like', authenticateToken, async (req, res) => {
  try {
    const contentId = req.params.contentId;

    const content = await Content.findById(contentId);
    if (!content) {
      return res.status(404).json({
        error: 'Content not found',
        message: 'The specified content does not exist'
      });
    }

    // Check if user can access this content
    if (!content.canUserAccess(req.user)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this content'
      });
    }

    // Update like count (in a real app, you'd track individual likes to prevent duplicates)
    await Content.findByIdAndUpdate(contentId, {
      $inc: { 'metrics.likes': 1 }
    });

    res.json({
      message: 'Content liked successfully',
      data: {
        contentId,
        likedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Like content error:', error);
    res.status(500).json({
      error: 'Failed to like content',
      message: 'An error occurred while liking the content'
    });
  }
});

// @route   POST /api/community/content/:contentId/share
// @desc    Share a piece of content
// @access  Private
router.post('/content/:contentId/share', authenticateToken, async (req, res) => {
  try {
    const contentId = req.params.contentId;

    const content = await Content.findById(contentId);
    if (!content) {
      return res.status(404).json({
        error: 'Content not found',
        message: 'The specified content does not exist'
      });
    }

    // Check if user can access this content
    if (!content.canUserAccess(req.user)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this content'
      });
    }

    // Update share count
    await Content.findByIdAndUpdate(contentId, {
      $inc: { 'metrics.shares': 1 }
    });

    res.json({
      message: 'Content shared successfully',
      data: {
        contentId,
        sharedAt: new Date(),
        shareUrl: `${process.env.FRONTEND_URL}/content/${contentId}`
      }
    });

  } catch (error) {
    console.error('Share content error:', error);
    res.status(500).json({
      error: 'Failed to share content',
      message: 'An error occurred while sharing the content'
    });
  }
});

// @route   POST /api/community/content/:contentId/view
// @desc    Record a view on content
// @access  Public
router.post('/content/:contentId/view', optionalAuth, async (req, res) => {
  try {
    const contentId = req.params.contentId;

    const content = await Content.findById(contentId);
    if (!content) {
      return res.status(404).json({
        error: 'Content not found',
        message: 'The specified content does not exist'
      });
    }

    // Check if user can access this content
    if (!content.canUserAccess(req.user)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this content'
      });
    }

    // Update view count
    await Content.findByIdAndUpdate(contentId, {
      $inc: { 'metrics.views': 1 }
    });

    res.json({
      message: 'View recorded successfully',
      data: {
        contentId,
        viewedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Record view error:', error);
    res.status(500).json({
      error: 'Failed to record view',
      message: 'An error occurred while recording the view'
    });
  }
});

// @route   GET /api/community/content/:contentId
// @desc    Get content details
// @access  Public (with access control)
router.get('/content/:contentId', optionalAuth, async (req, res) => {
  try {
    const contentId = req.params.contentId;

    const content = await Content.findById(contentId)
      .populate('creator', 'username displayName artistInfo.stageName profileImage');

    if (!content || !content.isActive) {
      return res.status(404).json({
        error: 'Content not found',
        message: 'The specified content does not exist'
      });
    }

    // Check if user can access this content
    if (!content.canUserAccess(req.user)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this content',
        requiredTier: content.access.requiredTier,
        userTier: req.user?.fanInfo?.tier || 'none'
      });
    }

    res.json({
      message: 'Content retrieved successfully',
      data: content
    });

  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({
      error: 'Failed to get content',
      message: 'An error occurred while fetching the content'
    });
  }
});

// @route   GET /api/community/stats
// @desc    Get community statistics
// @access  Public
router.get('/stats', async (req, res) => {
  try {
    // Get total counts
    const totalArtists = await require('../models/User').countDocuments({
      userType: 'artist',
      isActive: true
    });

    const totalFans = await require('../models/User').countDocuments({
      userType: 'fan',
      isActive: true
    });

    const totalContent = await Content.countDocuments({
      isActive: true
    });

    // Get content by type
    const contentByType = await Content.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$contentType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get total engagement metrics
    const engagementStats = await Content.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$metrics.views' },
          totalLikes: { $sum: '$metrics.likes' },
          totalShares: { $sum: '$metrics.shares' },
          totalComments: { $sum: '$metrics.comments' }
        }
      }
    ]);

    const stats = engagementStats[0] || {
      totalViews: 0,
      totalLikes: 0,
      totalShares: 0,
      totalComments: 0
    };

    res.json({
      message: 'Community statistics retrieved successfully',
      data: {
        community: {
          totalArtists,
          totalFans,
          totalUsers: totalArtists + totalFans
        },
        content: {
          totalContent,
          byType: contentByType
        },
        engagement: stats
      }
    });

  } catch (error) {
    console.error('Get community stats error:', error);
    res.status(500).json({
      error: 'Failed to get community statistics',
      message: 'An error occurred while fetching community statistics'
    });
  }
});

// @route   GET /api/community/genres
// @desc    Get popular genres with stats
// @access  Public
router.get('/genres', async (req, res) => {
  try {
    // Get genre popularity from artists
    const artistGenres = await require('../models/User').aggregate([
      { $match: { userType: 'artist', isActive: true } },
      { $unwind: '$genres' },
      {
        $group: {
          _id: '$genres',
          artistCount: { $sum: 1 }
        }
      },
      { $sort: { artistCount: -1 } }
    ]);

    // Get genre popularity from content
    const contentGenres = await Content.aggregate([
      { $match: { isActive: true, 'musicInfo.genre': { $exists: true } } },
      {
        $group: {
          _id: '$musicInfo.genre',
          contentCount: { $sum: 1 },
          totalViews: { $sum: '$metrics.views' }
        }
      },
      { $sort: { contentCount: -1 } }
    ]);

    // Combine and format the data
    const genreStats = {};
    
    artistGenres.forEach(genre => {
      genreStats[genre._id] = {
        genre: genre._id,
        artists: genre.artistCount,
        content: 0,
        views: 0
      };
    });

    contentGenres.forEach(genre => {
      if (genreStats[genre._id]) {
        genreStats[genre._id].content = genre.contentCount;
        genreStats[genre._id].views = genre.totalViews;
      } else {
        genreStats[genre._id] = {
          genre: genre._id,
          artists: 0,
          content: genre.contentCount,
          views: genre.totalViews
        };
      }
    });

    const sortedGenres = Object.values(genreStats)
      .sort((a, b) => (b.artists + b.content) - (a.artists + a.content));

    res.json({
      message: 'Genre statistics retrieved successfully',
      data: sortedGenres
    });

  } catch (error) {
    console.error('Get genre stats error:', error);
    res.status(500).json({
      error: 'Failed to get genre statistics',
      message: 'An error occurred while fetching genre statistics'
    });
  }
});

module.exports = router;

