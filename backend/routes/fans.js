const express = require('express');
const User = require('../models/User');
const { authenticateToken, requireFan } = require('../middleware/auth');
const { USER_TYPES, FAN_TIERS } = require('../../shared/types');

const router = express.Router();

// @route   POST /api/fans/follow/:artistId
// @desc    Follow an artist
// @access  Private (Fan only)
router.post('/follow/:artistId', authenticateToken, requireFan, async (req, res) => {
  try {
    const artistId = req.params.artistId;
    const fanId = req.user._id;

    // Check if artist exists
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

    // Check if already following
    if (req.user.fanInfo.followedArtists.includes(artistId)) {
      return res.status(400).json({
        error: 'Already following',
        message: 'You are already following this artist'
      });
    }

    // Update fan's followed artists
    await User.findByIdAndUpdate(fanId, {
      $push: { 'fanInfo.followedArtists': artistId },
      $inc: { 'stats.following': 1 }
    });

    // Update artist's follower count
    await User.findByIdAndUpdate(artistId, {
      $inc: { 'stats.followers': 1 }
    });

    res.json({
      message: 'Successfully followed artist',
      data: {
        artistId,
        artistName: artist.name,
        followedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Follow artist error:', error);
    res.status(500).json({
      error: 'Failed to follow artist',
      message: 'An error occurred while following the artist'
    });
  }
});

// @route   DELETE /api/fans/unfollow/:artistId
// @desc    Unfollow an artist
// @access  Private (Fan only)
router.delete('/unfollow/:artistId', authenticateToken, requireFan, async (req, res) => {
  try {
    const artistId = req.params.artistId;
    const fanId = req.user._id;

    // Check if currently following
    if (!req.user.fanInfo.followedArtists.includes(artistId)) {
      return res.status(400).json({
        error: 'Not following',
        message: 'You are not currently following this artist'
      });
    }

    // Update fan's followed artists
    await User.findByIdAndUpdate(fanId, {
      $pull: { 'fanInfo.followedArtists': artistId },
      $inc: { 'stats.following': -1 }
    });

    // Update artist's follower count
    await User.findByIdAndUpdate(artistId, {
      $inc: { 'stats.followers': -1 }
    });

    res.json({
      message: 'Successfully unfollowed artist',
      data: {
        artistId,
        unfollowedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Unfollow artist error:', error);
    res.status(500).json({
      error: 'Failed to unfollow artist',
      message: 'An error occurred while unfollowing the artist'
    });
  }
});

// @route   GET /api/fans/following
// @desc    Get list of followed artists
// @access  Private (Fan only)
router.get('/following', authenticateToken, requireFan, async (req, res) => {
  try {
    const fan = await User.findById(req.user._id)
      .populate({
        path: 'fanInfo.followedArtists',
        select: 'username displayName artistInfo bio profileImage stats genres location',
        match: { isActive: true }
      });

    if (!fan) {
      return res.status(404).json({
        error: 'Fan not found',
        message: 'Fan profile not found'
      });
    }

    const followedArtists = fan.fanInfo.followedArtists || [];

    res.json({
      message: 'Followed artists retrieved successfully',
      data: {
        artists: followedArtists,
        count: followedArtists.length,
        tier: fan.fanInfo.tier
      }
    });

  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({
      error: 'Failed to get followed artists',
      message: 'An error occurred while fetching followed artists'
    });
  }
});

// @route   PUT /api/fans/tier
// @desc    Upgrade fan tier
// @access  Private (Fan only)
router.put('/tier', authenticateToken, requireFan, async (req, res) => {
  try {
    const { newTier, artistId } = req.body;

    // Validate new tier
    if (!Object.values(FAN_TIERS).includes(newTier)) {
      return res.status(400).json({
        error: 'Invalid tier',
        message: `Tier must be one of: ${Object.values(FAN_TIERS).join(', ')}`
      });
    }

    // Check if upgrading (can't downgrade)
    const currentTierLevel = Object.values(FAN_TIERS).indexOf(req.user.fanInfo.tier);
    const newTierLevel = Object.values(FAN_TIERS).indexOf(newTier);

    if (newTierLevel <= currentTierLevel) {
      return res.status(400).json({
        error: 'Invalid tier upgrade',
        message: 'You can only upgrade your tier, not downgrade'
      });
    }

    // If upgrading to supporter or super_fan, must specify an artist
    if ((newTier === FAN_TIERS.SUPPORTER || newTier === FAN_TIERS.SUPER_FAN) && !artistId) {
      return res.status(400).json({
        error: 'Artist required',
        message: 'You must specify an artist when upgrading to paid tiers'
      });
    }

    // Verify artist exists and user follows them
    if (artistId) {
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

      if (!req.user.fanInfo.followedArtists.includes(artistId)) {
        return res.status(400).json({
          error: 'Not following artist',
          message: 'You must follow an artist before upgrading your tier for them'
        });
      }
    }

    // In a real app, this would handle payment processing
    // For MVP, we'll just update the tier directly

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        'fanInfo.tier': newTier,
        $inc: {
          'fanInfo.totalSpent': getTierPrice(newTier) - getTierPrice(req.user.fanInfo.tier)
        }
      },
      { new: true }
    ).select('-password -email');

    res.json({
      message: 'Tier upgraded successfully',
      data: {
        previousTier: req.user.fanInfo.tier,
        newTier,
        artistId,
        upgradedAt: new Date(),
        totalSpent: updatedUser.fanInfo.totalSpent
      }
    });

  } catch (error) {
    console.error('Tier upgrade error:', error);
    res.status(500).json({
      error: 'Failed to upgrade tier',
      message: 'An error occurred while upgrading the tier'
    });
  }
});

// @route   GET /api/fans/profile
// @desc    Get fan profile
// @access  Private (Fan only)
router.get('/profile', authenticateToken, requireFan, async (req, res) => {
  try {
    const fan = await User.findById(req.user._id)
      .populate({
        path: 'fanInfo.followedArtists',
        select: 'username displayName artistInfo.stageName profileImage'
      })
      .select('-password -email');

    if (!fan) {
      return res.status(404).json({
        error: 'Fan not found',
        message: 'Fan profile not found'
      });
    }

    res.json({
      message: 'Fan profile retrieved successfully',
      data: fan.toPublicProfile()
    });

  } catch (error) {
    console.error('Get fan profile error:', error);
    res.status(500).json({
      error: 'Failed to get fan profile',
      message: 'An error occurred while fetching the fan profile'
    });
  }
});

// @route   PUT /api/fans/profile
// @desc    Update fan profile
// @access  Private (Fan only)
router.put('/profile', authenticateToken, requireFan, async (req, res) => {
  try {
    const allowedUpdates = ['displayName', 'bio', 'location', 'genres'];

    const updates = {};
    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const updatedFan = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -email');

    res.json({
      message: 'Profile updated successfully',
      data: updatedFan.toPublicProfile()
    });

  } catch (error) {
    console.error('Update fan profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: 'An error occurred while updating the profile'
    });
  }
});

// @route   GET /api/fans/dashboard
// @desc    Get fan dashboard data
// @access  Private (Fan only)
router.get('/dashboard', authenticateToken, requireFan, async (req, res) => {
  try {
    const fan = await User.findById(req.user._id)
      .populate({
        path: 'fanInfo.followedArtists',
        select: 'username displayName artistInfo profileImage stats'
      });

    // Get recent activity from followed artists (this would be from an activity feed in a real app)
    const recentActivity = []; // Placeholder for recent posts, releases, etc.

    // Get tier benefits
    const tierBenefits = getTierBenefits(fan.fanInfo.tier);

    res.json({
      message: 'Fan dashboard retrieved successfully',
      data: {
        profile: {
          tier: fan.fanInfo.tier,
          followedArtists: fan.fanInfo.followedArtists.length,
          discoveries: fan.stats.discoveries,
          fanSince: fan.fanInfo.fanSince,
          totalSpent: fan.fanInfo.totalSpent
        },
        followedArtists: fan.fanInfo.followedArtists,
        recentActivity,
        tierBenefits,
        recommendations: [] // This would come from the discovery service
      }
    });

  } catch (error) {
    console.error('Get fan dashboard error:', error);
    res.status(500).json({
      error: 'Failed to get dashboard',
      message: 'An error occurred while fetching the dashboard'
    });
  }
});

// Helper function to get tier pricing (in cents)
function getTierPrice(tier) {
  switch (tier) {
    case FAN_TIERS.CASUAL:
      return 0;
    case FAN_TIERS.SUPPORTER:
      return 500; // $5.00
    case FAN_TIERS.SUPER_FAN:
      return 1500; // $15.00
    default:
      return 0;
  }
}

// Helper function to get tier benefits
function getTierBenefits(tier) {
  const benefits = {
    [FAN_TIERS.CASUAL]: [
      'Follow artists',
      'Basic discovery features',
      'Public content access'
    ],
    [FAN_TIERS.SUPPORTER]: [
      'All Casual tier benefits',
      'Supporter-only content',
      'Direct messaging with artists',
      'Early access to releases'
    ],
    [FAN_TIERS.SUPER_FAN]: [
      'All Supporter tier benefits',
      'Exclusive content access',
      'Virtual meet & greets',
      'Limited edition merchandise',
      'Behind-the-scenes content'
    ]
  };

  return benefits[tier] || benefits[FAN_TIERS.CASUAL];
}

module.exports = router;

