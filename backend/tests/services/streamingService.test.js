const streamingService = require('../../services/streamingService');
const redisClient = require('../../config/redis');
const s3Service = require('../../config/aws');
const ArtistEnhanced = require('../../models/ArtistEnhanced');

// Mock dependencies
jest.mock('../../config/redis');
jest.mock('../../config/aws');
jest.mock('../../models/ArtistEnhanced');

describe('StreamingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAvailableQualities', () => {
    test('should return correct qualities for free tier', () => {
      const qualities = streamingService.getAvailableQualities('free');
      
      expect(qualities).toHaveLength(1);
      expect(qualities[0]).toEqual({
        quality: 'low',
        bitrate: '128k',
        label: 'Standard'
      });
    });

    test('should return correct qualities for supporter tier', () => {
      const qualities = streamingService.getAvailableQualities('supporter');
      
      expect(qualities).toHaveLength(2);
      expect(qualities[0].bitrate).toBe('128k');
      expect(qualities[1].bitrate).toBe('256k');
    });

    test('should return correct qualities for superfan tier', () => {
      const qualities = streamingService.getAvailableQualities('superfan');
      
      expect(qualities).toHaveLength(4);
      expect(qualities[3]).toEqual({
        quality: 'lossless',
        bitrate: 'FLAC',
        label: 'Lossless',
        premium: true
      });
    });
  });

  describe('checkTrackAccess', () => {
    test('should allow access to free tracks for all users', async () => {
      const track = { tier: 'free' };
      const access = await streamingService.checkTrackAccess(track, 'user123', 'free');
      
      expect(access).toBe(true);
    });

    test('should allow supporter access to supporter tracks', async () => {
      const track = { tier: 'supporter' };
      const access = await streamingService.checkTrackAccess(track, 'user123', 'supporter');
      
      expect(access).toBe(true);
    });

    test('should allow superfan access to all tracks', async () => {
      const track = { tier: 'supporter' };
      const access = await streamingService.checkTrackAccess(track, 'user123', 'superfan');
      
      expect(access).toBe(true);
    });

    test('should deny free user access to supporter tracks', async () => {
      const track = { tier: 'supporter' };
      const access = await streamingService.checkTrackAccess(track, 'user123', 'free');
      
      expect(access).toBe(false);
    });

    test('should handle early access correctly', async () => {
      const releaseDate = new Date();
      releaseDate.setHours(releaseDate.getHours() + 20); // 20 hours in future
      
      const track = {
        tier: 'free',
        isEarlyAccess: true,
        releaseDate: releaseDate
      };
      
      // Supporter gets 24hr early access
      const supporterAccess = await streamingService.checkTrackAccess(track, 'user123', 'supporter');
      expect(supporterAccess).toBe(true);
      
      // Free user doesn't get early access
      const freeAccess = await streamingService.checkTrackAccess(track, 'user123', 'free');
      expect(freeAccess).toBe(false);
    });
  });

  describe('getStreamingUrl', () => {
    test('should return streaming URL with correct quality', async () => {
      const mockTrack = {
        id: 'track123',
        title: 'Test Track',
        artistName: 'Test Artist',
        duration: 180,
        tier: 'free',
        s3Key: 'tracks/artist/track.mp3'
      };

      const mockHlsData = {
        masterUrl: 'https://cdn.example.com/hls/track123/master.m3u8'
      };

      redisClient.cacheGet.mockResolvedValue(null);
      redisClient.cacheSet.mockResolvedValue(true);
      redisClient.cacheGet.mockResolvedValueOnce(null).mockResolvedValueOnce(mockHlsData);
      
      jest.spyOn(streamingService, 'getTrackInfo').mockResolvedValue(mockTrack);
      jest.spyOn(streamingService, 'trackStreamingAnalytics').mockResolvedValue();

      const result = await streamingService.getStreamingUrl('track123', 'user123', 'supporter');

      expect(result).toMatchObject({
        trackId: 'track123',
        title: 'Test Track',
        artist: 'Test Artist',
        duration: 180,
        masterPlaylistUrl: mockHlsData.masterUrl,
        currentQuality: 'medium',
        adaptiveBitrate: true,
        downloadEnabled: false
      });

      expect(result.availableQualities).toHaveLength(2);
    });

    test('should include download URL for superfans', async () => {
      const mockTrack = {
        id: 'track123',
        title: 'Test Track',
        tier: 'free',
        s3Key: 'tracks/artist/track.mp3'
      };

      redisClient.cacheGet.mockResolvedValue(null);
      redisClient.cacheSet.mockResolvedValue(true);
      redisClient.cacheGet.mockResolvedValueOnce(null).mockResolvedValueOnce({
        masterUrl: 'https://cdn.example.com/hls/track123/master.m3u8'
      });
      
      s3Service.getSignedDownloadUrl.mockResolvedValue('https://download.url');
      
      jest.spyOn(streamingService, 'getTrackInfo').mockResolvedValue(mockTrack);
      jest.spyOn(streamingService, 'trackStreamingAnalytics').mockResolvedValue();

      const result = await streamingService.getStreamingUrl('track123', 'user123', 'superfan');

      expect(result.downloadEnabled).toBe(true);
      expect(result.downloadUrl).toBe('https://download.url');
      expect(s3Service.getSignedDownloadUrl).toHaveBeenCalledWith(
        'tracks/artist/track.mp3',
        86400
      );
    });

    test('should use cache when available', async () => {
      const cachedData = {
        trackId: 'track123',
        masterPlaylistUrl: 'https://cached.url'
      };

      redisClient.cacheGet.mockResolvedValue(cachedData);

      const result = await streamingService.getStreamingUrl('track123', 'user123', 'free');

      expect(result).toEqual(cachedData);
      expect(redisClient.cacheSet).not.toHaveBeenCalled();
    });
  });

  describe('trackStreamingAnalytics', () => {
    test('should track all analytics correctly', async () => {
      redisClient.incrementPlayCount.mockResolvedValue();
      redisClient.trackFanActivity.mockResolvedValue();
      redisClient.incrementMetric.mockResolvedValue();
      
      jest.spyOn(streamingService, 'updateArtistAnalytics').mockResolvedValue();

      await streamingService.trackStreamingAnalytics('track123', 'user123', 'supporter');

      expect(redisClient.incrementPlayCount).toHaveBeenCalledWith('track123');
      expect(redisClient.trackFanActivity).toHaveBeenCalledWith('user123', {
        action: 'stream_start',
        trackId: 'track123',
        tier: 'supporter',
        timestamp: expect.any(Number)
      });
      expect(redisClient.incrementMetric).toHaveBeenCalledWith('streams_total');
      expect(redisClient.incrementMetric).toHaveBeenCalledWith('streams_supporter');
    });
  });

  describe('generateOfflineManifest', () => {
    test('should generate manifest for multiple tracks', async () => {
      const mockTrack = {
        id: 'track123',
        title: 'Test Track',
        artistName: 'Test Artist',
        duration: 180,
        s3Key: 'tracks/artist/track.mp3',
        fileSize: 5242880 // 5MB
      };

      jest.spyOn(streamingService, 'getTrackInfo').mockResolvedValue(mockTrack);
      s3Service.getSignedDownloadUrl.mockResolvedValue('https://download.url');
      redisClient.cacheSet.mockResolvedValue(true);

      const result = await streamingService.generateOfflineManifest(['track123', 'track456'], 'user123');

      expect(result).toMatchObject({
        manifestId: expect.stringContaining('manifest:user123:'),
        trackCount: 2,
        totalSize: 10485760, // 10MB total
        expiresAt: expect.any(String)
      });

      expect(redisClient.cacheSet).toHaveBeenCalled();
    });
  });

  describe('switchQuality', () => {
    test('should switch quality successfully', async () => {
      const mockSession = {
        userTier: 'superfan',
        currentQuality: 'medium'
      };

      redisClient.getSession.mockResolvedValue(mockSession);
      redisClient.setSession.mockResolvedValue(true);
      redisClient.incrementMetric.mockResolvedValue();

      const result = await streamingService.switchQuality('session123', 'high');

      expect(result).toEqual({
        success: true,
        newQuality: 'high',
        message: 'Switched to high quality'
      });

      expect(redisClient.setSession).toHaveBeenCalledWith('session123', {
        ...mockSession,
        currentQuality: 'high'
      });
    });

    test('should reject invalid quality for tier', async () => {
      const mockSession = {
        userTier: 'free',
        currentQuality: 'low'
      };

      redisClient.getSession.mockResolvedValue(mockSession);

      await expect(
        streamingService.switchQuality('session123', 'high')
      ).rejects.toThrow('Quality not available for your subscription tier');
    });
  });

  describe('getEarlyAccessHours', () => {
    test('should return correct early access hours for each tier', () => {
      expect(streamingService.getEarlyAccessHours('free')).toBe(0);
      expect(streamingService.getEarlyAccessHours('supporter')).toBe(24);
      expect(streamingService.getEarlyAccessHours('superfan')).toBe(48);
    });
  });
});