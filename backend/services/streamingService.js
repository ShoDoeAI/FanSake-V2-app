const s3Service = require('../config/aws');
const cloudFrontService = require('./cloudFrontService');
const redisClient = require('../config/redis');
const ArtistEnhanced = require('../models/ArtistEnhanced');

class StreamingService {
  constructor() {
    this.bitrateMap = {
      free: { quality: 'low', bitrate: '128k', format: 'aac' },
      supporter: { quality: 'medium', bitrate: '256k', format: 'aac' },
      superfan: { quality: 'high', bitrate: '320k', format: 'aac' }
    };
  }

  // Get streaming URL based on user's subscription tier
  async getStreamingUrl(trackId, userId, userTier = 'free') {
    try {
      // Check cache first
      const cacheKey = `stream:${trackId}:${userId}`;
      const cached = await redisClient.cacheGet(cacheKey);
      if (cached) {
        return cached;
      }

      // Get track information
      const track = await this.getTrackInfo(trackId);
      if (!track) {
        throw new Error('Track not found');
      }

      // Check if user has access to this track
      const hasAccess = await this.checkTrackAccess(track, userId, userTier);
      if (!hasAccess) {
        throw new Error('Access denied for this track');
      }

      // Get HLS master playlist URL
      const hlsData = await redisClient.cacheGet(`track:hls:${trackId}`);
      if (!hlsData || !hlsData.masterUrl) {
        throw new Error('Track not processed for streaming yet');
      }

      // Determine quality based on tier
      const tierConfig = this.bitrateMap[userTier] || this.bitrateMap.free;
      
      // Create streaming response
      const streamingData = {
        trackId,
        title: track.title,
        artist: track.artistName,
        duration: track.duration,
        masterPlaylistUrl: hlsData.masterUrl,
        currentQuality: tierConfig.quality,
        availableQualities: this.getAvailableQualities(userTier),
        adaptiveBitrate: userTier !== 'free', // Enable ABR for paid tiers
        downloadEnabled: userTier === 'superfan',
        metadata: {
          albumArt: track.albumArt,
          genre: track.genre,
          releaseDate: track.releaseDate
        }
      };

      // If superfan, add download URL
      if (userTier === 'superfan' && track.s3Key) {
        streamingData.downloadUrl = await s3Service.getSignedDownloadUrl(
          track.s3Key,
          3600 * 24 // 24 hour expiry
        );
      }

      // Cache for 1 hour
      await redisClient.cacheSet(cacheKey, streamingData, 3600);

      // Track streaming analytics
      await this.trackStreamingAnalytics(trackId, userId, userTier);

      return streamingData;
    } catch (error) {
      console.error('Error getting streaming URL:', error);
      throw error;
    }
  }

  // Get available qualities based on user tier
  getAvailableQualities(userTier) {
    const qualities = {
      free: [{ quality: 'low', bitrate: '128k', label: 'Standard' }],
      supporter: [
        { quality: 'low', bitrate: '128k', label: 'Standard' },
        { quality: 'medium', bitrate: '256k', label: 'High' }
      ],
      superfan: [
        { quality: 'low', bitrate: '128k', label: 'Standard' },
        { quality: 'medium', bitrate: '256k', label: 'High' },
        { quality: 'high', bitrate: '320k', label: 'Ultra' },
        { quality: 'lossless', bitrate: 'FLAC', label: 'Lossless', premium: true }
      ]
    };

    return qualities[userTier] || qualities.free;
  }

  // Check if user has access to track
  async checkTrackAccess(track, userId, userTier) {
    // Free tracks are accessible to everyone
    if (track.tier === 'free') {
      return true;
    }

    // Check if track is in early access period
    if (track.isEarlyAccess) {
      const hoursEarly = this.getEarlyAccessHours(userTier);
      const releaseTime = new Date(track.releaseDate).getTime();
      const now = Date.now();
      const hoursUntilPublic = (releaseTime - now) / (1000 * 60 * 60);

      if (hoursUntilPublic > 0 && hoursUntilPublic <= hoursEarly) {
        return true;
      }
    }

    // Check tier access
    const tierHierarchy = { free: 0, supporter: 1, superfan: 2 };
    const trackTierLevel = tierHierarchy[track.tier] || 0;
    const userTierLevel = tierHierarchy[userTier] || 0;

    return userTierLevel >= trackTierLevel;
  }

  // Get early access hours for tier
  getEarlyAccessHours(tier) {
    const earlyAccess = {
      free: 0,
      supporter: 24,
      superfan: 48
    };
    return earlyAccess[tier] || 0;
  }

  // Get track information
  async getTrackInfo(trackId) {
    try {
      // In a real implementation, this would query the database
      // For now, we'll create a mock implementation
      const mockTrack = {
        id: trackId,
        title: 'Track Title',
        artistName: 'Artist Name',
        artistId: 'artist-123',
        duration: 180,
        tier: 'free',
        isEarlyAccess: false,
        releaseDate: new Date(),
        genre: 'Electronic',
        s3Key: `tracks/artist-123/2024/06/${trackId}.mp3`,
        albumArt: 'https://example.com/album-art.jpg'
      };

      return mockTrack;
    } catch (error) {
      console.error('Error getting track info:', error);
      return null;
    }
  }

  // Track streaming analytics
  async trackStreamingAnalytics(trackId, userId, tier) {
    try {
      // Increment play count
      await redisClient.incrementPlayCount(trackId);
      
      // Track user activity
      await redisClient.trackFanActivity(userId, {
        action: 'stream_start',
        trackId,
        tier,
        timestamp: Date.now()
      });

      // Update real-time metrics
      await redisClient.incrementMetric('streams_total');
      await redisClient.incrementMetric(`streams_${tier}`);

      // Update artist analytics (async, don't wait)
      this.updateArtistAnalytics(trackId).catch(console.error);

    } catch (error) {
      console.error('Error tracking streaming analytics:', error);
    }
  }

  // Update artist analytics
  async updateArtistAnalytics(trackId) {
    try {
      const track = await this.getTrackInfo(trackId);
      if (!track) return;

      const today = new Date().toISOString().split('T')[0];
      
      // Update plays_30d map
      await ArtistEnhanced.findOneAndUpdate(
        { userId: track.artistId },
        {
          $inc: {
            [`analytics.plays_30d.${today}`]: 1,
            'stats.totalPlays': 1
          }
        }
      );

    } catch (error) {
      console.error('Error updating artist analytics:', error);
    }
  }

  // Generate manifest for offline download (superfans only)
  async generateOfflineManifest(trackIds, userId) {
    const tracks = [];
    
    for (const trackId of trackIds) {
      try {
        const track = await this.getTrackInfo(trackId);
        if (!track) continue;

        // Get download URL
        const downloadUrl = await s3Service.getSignedDownloadUrl(
          track.s3Key,
          86400 // 24 hours
        );

        tracks.push({
          id: trackId,
          title: track.title,
          artist: track.artistName,
          duration: track.duration,
          downloadUrl,
          fileSize: track.fileSize || 0,
          format: 'mp3'
        });
      } catch (error) {
        console.error(`Error processing track ${trackId}:`, error);
      }
    }

    const manifest = {
      version: '1.0',
      generated: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), // 24 hours
      userId,
      tracks
    };

    // Store manifest in Redis
    const manifestId = `manifest:${userId}:${Date.now()}`;
    await redisClient.cacheSet(manifestId, manifest, 86400);

    return {
      manifestId,
      trackCount: tracks.length,
      totalSize: tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0),
      expiresAt: manifest.expiresAt
    };
  }

  // Handle adaptive bitrate switching
  async switchQuality(sessionId, newQuality) {
    try {
      // Get session data
      const session = await redisClient.getSession(sessionId);
      if (!session) {
        throw new Error('Invalid session');
      }

      // Validate quality is available for user's tier
      const availableQualities = this.getAvailableQualities(session.userTier);
      const qualityValid = availableQualities.some(q => q.quality === newQuality);
      
      if (!qualityValid) {
        throw new Error('Quality not available for your subscription tier');
      }

      // Update session with new quality
      session.currentQuality = newQuality;
      await redisClient.setSession(sessionId, session);

      // Log quality switch for analytics
      await redisClient.incrementMetric(`quality_switch_${newQuality}`);

      return {
        success: true,
        newQuality,
        message: `Switched to ${newQuality} quality`
      };
    } catch (error) {
      console.error('Error switching quality:', error);
      throw error;
    }
  }

  // Get streaming statistics
  async getStreamingStats(artistId, period = '30d') {
    try {
      const artist = await ArtistEnhanced.findOne({ userId: artistId });
      if (!artist) {
        throw new Error('Artist not found');
      }

      const stats = {
        totalPlays: artist.stats.totalPlays || 0,
        uniqueListeners: artist.stats.monthlyListeners || 0,
        playsLast30Days: 0,
        topTracks: [],
        listenerGrowth: [],
        qualityDistribution: {
          low: 0,
          medium: 0,
          high: 0
        }
      };

      // Calculate plays from last 30 days
      if (artist.analytics.plays_30d) {
        artist.analytics.plays_30d.forEach((value) => {
          stats.playsLast30Days += value;
        });
      }

      // Get quality distribution from Redis metrics
      const [lowPlays, mediumPlays, highPlays] = await Promise.all([
        redisClient.client.get('metrics:streams_free:' + new Date().toISOString().split('T')[0]),
        redisClient.client.get('metrics:streams_supporter:' + new Date().toISOString().split('T')[0]),
        redisClient.client.get('metrics:streams_superfan:' + new Date().toISOString().split('T')[0])
      ]);

      stats.qualityDistribution = {
        low: parseInt(lowPlays) || 0,
        medium: parseInt(mediumPlays) || 0,
        high: parseInt(highPlays) || 0
      };

      return stats;
    } catch (error) {
      console.error('Error getting streaming stats:', error);
      throw error;
    }
  }

  // Handle live streaming session (future feature)
  async startLiveStream(artistId, streamConfig) {
    // Placeholder for live streaming functionality
    return {
      sessionId: `live-${artistId}-${Date.now()}`,
      streamKey: `stream-key-${Date.now()}`,
      ingestUrl: 'rtmp://live.musicconnect.com/live',
      playbackUrl: `https://${process.env.CLOUDFRONT_DOMAIN}/live/${artistId}/playlist.m3u8`,
      status: 'ready'
    };
  }
}

// Create singleton instance
const streamingService = new StreamingService();

module.exports = streamingService;