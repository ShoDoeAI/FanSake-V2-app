const express = require('express');
const User = require('../models/User');
const Content = require('../models/Content');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { USER_TYPES, DISCOVERY_SOURCES, MUSIC_GENRES } = require('../../shared/types');

const router = express.Router();

// @route   GET /api/discovery/trending
// @desc    Get trending artists and content
// @access  Public
router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Get trending content from the last 7 days
    const trendingContent = await Content.getTrending(limit);

    // Get trending artists (those with most new followers/engagement)
    const trendingArtists = await User.find({
      userType: USER_TYPES.ARTIST,
      isActive: true,
      'stats.followers': { $gte: 1 }
    })
    .sort({ 'stats.followers': -1, 'stats.discoveries': -1 })
    .limit(limit)
    .select('username displayName artistInfo bio profileImage stats genres location');

    res.json({
      message: 'Trending content retrieved successfully',
      data: {
        content: trendingContent,
        artists: trendingArtists
      },
      source: DISCOVERY_SOURCES.TRENDING
    });

  } catch (error) {
    console.error('Trending discovery error:', error);
    res.status(500).json({
      error: 'Failed to get trending content',
      message: 'An error occurred while fetching trending content'
    });
  }
});

// @route   GET /api/discovery/recommendations
// @desc    Get personalized recommendations for a fan
// @access  Private
router.get('/recommendations', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== USER_TYPES.FAN) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Recommendations are only available for fans'
      });
    }

    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;
    const recommendations = [];

    // 1. Fan crossover recommendations
    try {
      const crossoverArtists = await User.getFanCrossoverRecommendations(userId);
      if (crossoverArtists.length > 0) {
        const crossoverDetails = await User.find({
          _id: { $in: crossoverArtists.slice(0, 5) }
        }).select('username displayName artistInfo bio profileImage stats genres');

        recommendations.push({
          source: DISCOVERY_SOURCES.FAN_CROSSOVER,
          title: 'Fans of your artists also love',
          description: 'Artists loved by fans with similar taste',
          artists: crossoverDetails
        });
      }
    } catch (error) {
      console.error('Crossover recommendations error:', error);
    }

    // 2. Genre-based recommendations
    try {
      if (req.user.genres && req.user.genres.length > 0) {
        const followedArtistIds = req.user.fanInfo?.followedArtists || [];
        
        const genreArtists = await User.find({
          userType: USER_TYPES.ARTIST,
          genres: { $in: req.user.genres },
          _id: { $nin: followedArtistIds },
          isActive: true
        })
        .sort({ 'stats.followers': -1 })
        .limit(5)
        .select('username displayName artistInfo bio profileImage stats genres');

        if (genreArtists.length > 0) {
          recommendations.push({
            source: DISCOVERY_SOURCES.SIMILAR_GENRES,
            title: `More ${req.user.genres.join(', ')} artists`,
            description: 'Artists in your favorite genres',
            artists: genreArtists
          });
        }
      }
    } catch (error) {
      console.error('Genre recommendations error:', error);
    }

    // 3. Location-based recommendations
    try {
      if (req.user.location?.city || req.user.location?.country) {
        const followedArtistIds = req.user.fanInfo?.followedArtists || [];
        
        const locationQuery = {};
        if (req.user.location.city) {
          locationQuery['location.city'] = req.user.location.city;
        } else if (req.user.location.country) {
          locationQuery['location.country'] = req.user.location.country;
        }

        const localArtists = await User.find({
          userType: USER_TYPES.ARTIST,
          ...locationQuery,
          _id: { $nin: followedArtistIds },
          isActive: true
        })
        .sort({ 'stats.followers': -1 })
        .limit(3)
        .select('username displayName artistInfo bio profileImage stats genres location');

        if (localArtists.length > 0) {
          recommendations.push({
            source: 'local_artists',
            title: `Local artists from ${req.user.location.city || req.user.location.country}`,
            description: 'Discover artists from your area',
            artists: localArtists
          });
        }
      }
    } catch (error) {
      console.error('Location recommendations error:', error);
    }

    // 4. Curated picks (featured artists)
    try {
      const followedArtistIds = req.user.fanInfo?.followedArtists || [];
      
      const curatedArtists = await User.find({
        userType: USER_TYPES.ARTIST,
        'artistInfo.verified': true,
        _id: { $nin: followedArtistIds },
        isActive: true
      })
      .sort({ 'stats.discoveries': -1 })
      .limit(3)
      .select('username displayName artistInfo bio profileImage stats genres');

      if (curatedArtists.length > 0) {
        recommendations.push({
          source: DISCOVERY_SOURCES.CURATOR_PICKS,
          title: 'Featured verified artists',
          description: 'Hand-picked artists worth discovering',
          artists: curatedArtists
        });
      }
    } catch (error) {
      console.error('Curated recommendations error:', error);
    }

    res.json({
      message: 'Personalized recommendations retrieved successfully',
      data: recommendations,
      user: {
        genres: req.user.genres,
        location: req.user.location,
        followedArtists: req.user.fanInfo?.followedArtists?.length || 0
      }
    });

  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      error: 'Failed to get recommendations',
      message: 'An error occurred while generating recommendations'
    });
  }
});

// @route   GET /api/discovery/genres/:genre
// @desc    Discover artists by specific genre
// @access  Public
router.get('/genres/:genre', optionalAuth, async (req, res) => {
  try {
    const { genre } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    // Validate genre
    if (!MUSIC_GENRES.includes(genre)) {
      return res.status(400).json({
        error: 'Invalid genre',
        message: `Genre must be one of: ${MUSIC_GENRES.join(', ')}`
      });
    }

    // Get artists in this genre
    const artists = await User.findArtistsByGenre([genre])
      .sort({ 'stats.followers': -1, 'stats.discoveries': -1 })
      .limit(limit)
      .select('username displayName artistInfo bio profileImage stats genres location');

    // Get content in this genre
    const content = await Content.getByGenre(genre, limit);

    res.json({
      message: `${genre} artists and content retrieved successfully`,
      data: {
        genre,
        artists,
        content
      },
      source: DISCOVERY_SOURCES.SIMILAR_GENRES
    });

  } catch (error) {
    console.error('Genre discovery error:', error);
    res.status(500).json({
      error: 'Failed to get genre content',
      message: 'An error occurred while fetching genre content'
    });
  }
});

// @route   POST /api/discovery/record
// @desc    Record a discovery interaction (when a fan finds a new artist)
// @access  Private
router.post('/record', authenticateToken, async (req, res) => {
  try {
    const { artistId, source } = req.body;

    if (!artistId || !source) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'artistId and source are required'
      });
    }

    // Find the artist
    const artist = await User.findById(artistId);
    if (!artist || artist.userType !== USER_TYPES.ARTIST) {
      return res.status(404).json({
        error: 'Artist not found',
        message: 'The specified artist does not exist'
      });
    }

    // Check if user is already following this artist
    if (req.user.userType === USER_TYPES.FAN) {
      const alreadyFollowing = req.user.fanInfo.followedArtists.includes(artistId);
      
      if (!alreadyFollowing) {
        // Update user's discovery count
        await User.findByIdAndUpdate(req.user._id, {
          $inc: { 'stats.discoveries': 1 }
        });

        // Update artist's discovery count
        await User.findByIdAndUpdate(artistId, {
          $inc: { 'stats.discoveries': 1 }
        });
      }
    }

    res.json({
      message: 'Discovery recorded successfully',
      data: {
        artistId,
        source,
        discoveredBy: req.user._id
      }
    });

  } catch (error) {
    console.error('Record discovery error:', error);
    res.status(500).json({
      error: 'Failed to record discovery',
      message: 'An error occurred while recording the discovery'
    });
  }
});

// @route   GET /api/discovery/search
// @desc    Search for artists and content
// @access  Public
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const { q, type, genre, limit = 10 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing search query',
        message: 'A search query is required'
      });
    }

    const searchTerm = q.trim();
    const searchLimit = parseInt(limit);
    const results = {};

    // Search artists
    if (!type || type === 'artists') {
      const artistQuery = {
        userType: USER_TYPES.ARTIST,
        isActive: true,
        $or: [
          { username: { $regex: searchTerm, $options: 'i' } },
          { displayName: { $regex: searchTerm, $options: 'i' } },
          { 'artistInfo.stageName': { $regex: searchTerm, $options: 'i' } },
          { bio: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      if (genre) {
        artistQuery.genres = genre;
      }

      const artists = await User.find(artistQuery)
        .sort({ 'stats.followers': -1 })
        .limit(searchLimit)
        .select('username displayName artistInfo bio profileImage stats genres location');

      results.artists = artists;
    }

    // Search content
    if (!type || type === 'content') {
      const contentQuery = {
        isActive: true,
        $or: [
          { title: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } },
          { tags: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      if (genre) {
        contentQuery['musicInfo.genre'] = genre;
      }

      const content = await Content.find(contentQuery)
        .sort({ 'metrics.views': -1, publishedAt: -1 })
        .limit(searchLimit)
        .populate('creator', 'username displayName artistInfo.stageName profileImage');

      results.content = content;
    }

    res.json({
      message: 'Search completed successfully',
      query: searchTerm,
      data: results
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'An error occurred during search'
    });
  }
});

module.exports = router;

