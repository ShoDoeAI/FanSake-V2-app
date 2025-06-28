const mediaProcessor = require('../../services/mediaProcessor');
const s3Service = require('../../config/aws');
const redisClient = require('../../config/redis');
const Bull = require('bull');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');

// Mock dependencies
jest.mock('../../config/aws');
jest.mock('../../config/redis');
jest.mock('bull');
jest.mock('fs').promises;
jest.mock('fluent-ffmpeg');

// Mock Bull queue
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job123' }),
  process: jest.fn(),
  on: jest.fn(),
  getJob: jest.fn(),
  getWaitingCount: jest.fn().mockResolvedValue(5),
  getActiveCount: jest.fn().mockResolvedValue(2),
  getCompletedCount: jest.fn().mockResolvedValue(100),
  getFailedCount: jest.fn().mockResolvedValue(3)
};

Bull.mockReturnValue(mockQueue);

describe('MediaProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processAudioUpload', () => {
    test('should queue all necessary jobs for audio processing', async () => {
      const s3Key = 'tracks/artist123/2024/01/track.mp3';
      const artistId = 'artist123';
      const trackId = 'track456';
      const title = 'Test Track';

      const jobIds = await mediaProcessor.processAudioUpload(s3Key, artistId, trackId, title);

      expect(jobIds).toHaveLength(3);
      expect(mockQueue.add).toHaveBeenCalledTimes(3);
      
      // Check HLS conversion job
      expect(mockQueue.add).toHaveBeenCalledWith(
        'convert-hls',
        { s3Key, artistId, trackId, title },
        { priority: 1 }
      );
      
      // Check metadata extraction job
      expect(mockQueue.add).toHaveBeenCalledWith(
        'extract-metadata',
        { s3Key, trackId },
        { priority: 2 }
      );
      
      // Check waveform generation job
      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-waveform',
        { s3Key, trackId },
        { priority: 3 }
      );
    });
  });

  describe('convertToHLS', () => {
    test('should convert audio to HLS with multiple bitrates', async () => {
      const mockJob = {
        progress: jest.fn()
      };
      
      const mockFileBuffer = Buffer.from('mock audio data');
      s3Service.downloadFile.mockResolvedValue(mockFileBuffer);
      s3Service.uploadFile.mockResolvedValue({
        cloudFrontUrl: 'https://cdn.example.com/file'
      });
      
      fs.writeFile.mockResolvedValue();
      fs.mkdir.mockResolvedValue();
      fs.readdir.mockResolvedValue(['playlist.m3u8', 'segment_000.ts']);
      fs.readFile.mockResolvedValue(Buffer.from('mock hls data'));
      
      redisClient.cacheSet.mockResolvedValue(true);
      
      // Mock createHLSVariant method
      jest.spyOn(mediaProcessor, 'createHLSVariant').mockResolvedValue();
      jest.spyOn(mediaProcessor, 'cleanup').mockResolvedValue();

      const result = await mediaProcessor.convertToHLS(
        'tracks/artist123/track.mp3',
        'artist123',
        'track456',
        'Test Track',
        mockJob
      );

      expect(result).toMatchObject({
        success: true,
        trackId: 'track456',
        variants: 3
      });

      expect(mockJob.progress).toHaveBeenCalledWith(100);
      expect(s3Service.downloadFile).toHaveBeenCalled();
      expect(mediaProcessor.createHLSVariant).toHaveBeenCalledTimes(3);
      expect(redisClient.cacheSet).toHaveBeenCalled();
    });
  });

  describe('createMasterPlaylist', () => {
    test('should create valid HLS master playlist', () => {
      const variants = [
        { bitrate: '128k', name: 'low' },
        { bitrate: '256k', name: 'medium' },
        { bitrate: '320k', name: 'high' }
      ];

      const playlist = mediaProcessor.createMasterPlaylist(variants, 'track123');

      expect(playlist).toContain('#EXTM3U');
      expect(playlist).toContain('#EXT-X-VERSION:3');
      expect(playlist).toContain('BANDWIDTH=128000');
      expect(playlist).toContain('BANDWIDTH=256000');
      expect(playlist).toContain('BANDWIDTH=320000');
      expect(playlist).toContain('low/playlist.m3u8');
      expect(playlist).toContain('medium/playlist.m3u8');
      expect(playlist).toContain('high/playlist.m3u8');
    });
  });

  describe('extractMetadata', () => {
    test('should extract audio metadata using ffprobe', async () => {
      const mockJob = { progress: jest.fn() };
      const mockFileBuffer = Buffer.from('mock audio data');
      
      s3Service.downloadFile.mockResolvedValue(mockFileBuffer);
      fs.writeFile.mockResolvedValue();
      fs.unlink.mockResolvedValue();
      redisClient.cacheSet.mockResolvedValue(true);
      
      // Mock getAudioMetadata
      jest.spyOn(mediaProcessor, 'getAudioMetadata').mockResolvedValue({
        duration: 180,
        bitrate: 320000,
        sampleRate: 44100,
        channels: 2,
        codec: 'mp3',
        size: 7200000,
        tags: { artist: 'Test Artist', title: 'Test Track' }
      });

      const result = await mediaProcessor.extractMetadata(
        'tracks/artist123/track.mp3',
        'track456',
        mockJob
      );

      expect(result).toMatchObject({
        success: true,
        trackId: 'track456',
        metadata: {
          duration: 180,
          bitrate: 320000,
          codec: 'mp3'
        }
      });

      expect(redisClient.cacheSet).toHaveBeenCalledWith(
        'track:metadata:track456',
        expect.any(Object),
        604800 // 7 days
      );
    });
  });

  describe('getJobStatus', () => {
    test('should return job status when job exists', async () => {
      const mockJob = {
        id: 'job123',
        progress: jest.fn().mockReturnValue(50),
        data: { trackId: 'track456' },
        returnvalue: { success: true },
        failedReason: null,
        getState: jest.fn().mockResolvedValue('active')
      };

      mockQueue.getJob.mockResolvedValue(mockJob);

      const status = await mediaProcessor.getJobStatus('job123');

      expect(status).toEqual({
        id: 'job123',
        status: 'active',
        progress: 50,
        data: { trackId: 'track456' },
        result: { success: true },
        failedReason: null
      });
    });

    test('should return null when job does not exist', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const status = await mediaProcessor.getJobStatus('nonexistent');

      expect(status).toBeNull();
    });
  });

  describe('getQueueStats', () => {
    test('should return queue statistics', async () => {
      const stats = await mediaProcessor.getQueueStats();

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        total: 110
      });

      expect(mockQueue.getWaitingCount).toHaveBeenCalled();
      expect(mockQueue.getActiveCount).toHaveBeenCalled();
      expect(mockQueue.getCompletedCount).toHaveBeenCalled();
      expect(mockQueue.getFailedCount).toHaveBeenCalled();
    });
  });

  describe('downsample', () => {
    test('should downsample array to target length', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = mediaProcessor.downsample(input, 5);

      expect(result).toHaveLength(5);
      expect(result[0]).toBe(1.5); // average of 1,2
      expect(result[1]).toBe(3.5); // average of 3,4
      expect(result[2]).toBe(5.5); // average of 5,6
      expect(result[3]).toBe(7.5); // average of 7,8
      expect(result[4]).toBe(9.5); // average of 9,10
    });

    test('should return original array if already smaller than target', () => {
      const input = [1, 2, 3];
      const result = mediaProcessor.downsample(input, 5);

      expect(result).toEqual(input);
    });
  });

  describe('cleanup', () => {
    test('should cleanup files and directories', async () => {
      fs.stat.mockResolvedValue({ isDirectory: () => false });
      fs.unlink.mockResolvedValue();
      fs.rm.mockResolvedValue();

      await mediaProcessor.cleanup('/tmp/file1', '/tmp/dir1');

      expect(fs.stat).toHaveBeenCalledTimes(2);
      expect(fs.unlink).toHaveBeenCalledWith('/tmp/file1');
    });

    test('should not throw on cleanup errors', async () => {
      fs.stat.mockRejectedValue(new Error('File not found'));

      await expect(
        mediaProcessor.cleanup('/tmp/nonexistent')
      ).resolves.not.toThrow();
    });
  });
});