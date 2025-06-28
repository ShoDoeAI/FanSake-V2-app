const ffmpeg = require('fluent-ffmpeg');
const Bull = require('bull');
const path = require('path');
const fs = require('fs').promises;
const s3Service = require('../config/aws');
const redisClient = require('../config/redis');

// Create job queue for media processing
const mediaQueue = new Bull('media-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

class MediaProcessor {
  constructor() {
    this.setupWorkers();
    this.tempDir = '/tmp/musicconnect-processing';
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  setupWorkers() {
    // Process HLS conversion jobs
    mediaQueue.process('convert-hls', 5, async (job) => {
      const { s3Key, artistId, trackId, title } = job.data;
      return this.convertToHLS(s3Key, artistId, trackId, title, job);
    });

    // Process thumbnail generation
    mediaQueue.process('generate-thumbnail', 10, async (job) => {
      const { s3Key, artistId, type } = job.data;
      return this.generateThumbnail(s3Key, artistId, type, job);
    });

    // Process waveform generation
    mediaQueue.process('generate-waveform', 5, async (job) => {
      const { s3Key, trackId } = job.data;
      return this.generateWaveform(s3Key, trackId, job);
    });

    // Process audio metadata extraction
    mediaQueue.process('extract-metadata', 10, async (job) => {
      const { s3Key, trackId } = job.data;
      return this.extractMetadata(s3Key, trackId, job);
    });

    // Log job events
    mediaQueue.on('completed', (job, result) => {
      console.log(`Job ${job.id} completed:`, result);
    });

    mediaQueue.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed:`, err);
    });
  }

  // Queue a new audio upload for processing
  async processAudioUpload(s3Key, artistId, trackId, title) {
    const jobs = [];

    // 1. Convert to HLS
    jobs.push(await mediaQueue.add('convert-hls', {
      s3Key,
      artistId,
      trackId,
      title
    }, {
      priority: 1
    }));

    // 2. Extract metadata
    jobs.push(await mediaQueue.add('extract-metadata', {
      s3Key,
      trackId
    }, {
      priority: 2
    }));

    // 3. Generate waveform
    jobs.push(await mediaQueue.add('generate-waveform', {
      s3Key,
      trackId
    }, {
      priority: 3
    }));

    return jobs.map(job => job.id);
  }

  // Convert audio to HLS with multiple bitrates
  async convertToHLS(s3Key, artistId, trackId, title, job) {
    const localFile = path.join(this.tempDir, `${trackId}-original.mp3`);
    const outputDir = path.join(this.tempDir, `${trackId}-hls`);

    try {
      // Update job progress
      await job.progress(10);

      // Download original file from S3
      console.log(`Downloading ${s3Key} from S3...`);
      const fileBuffer = await s3Service.downloadFile(s3Key);
      await fs.writeFile(localFile, fileBuffer);

      await job.progress(20);

      // Create output directory
      await fs.mkdir(outputDir, { recursive: true });

      // Define bitrate variants based on tier access
      const variants = [
        { bitrate: '128k', name: 'low', tier: 'free' },
        { bitrate: '256k', name: 'medium', tier: 'supporter' },
        { bitrate: '320k', name: 'high', tier: 'superfan' }
      ];

      // Process each variant
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        const variantDir = path.join(outputDir, variant.name);
        await fs.mkdir(variantDir, { recursive: true });

        await job.progress(30 + (i * 20));

        await this.createHLSVariant(
          localFile,
          variantDir,
          variant.bitrate,
          variant.name
        );

        // Upload variant to S3
        const hlsFiles = await fs.readdir(variantDir);
        for (const file of hlsFiles) {
          const filePath = path.join(variantDir, file);
          const fileBuffer = await fs.readFile(filePath);
          
          const s3HlsKey = `hls/${artistId}/${trackId}/${variant.name}/${file}`;
          await s3Service.uploadFile(
            { buffer: fileBuffer, originalname: file, mimetype: 'application/x-mpegURL' },
            artistId,
            'hls'
          );
        }
      }

      await job.progress(90);

      // Create master playlist
      const masterPlaylist = this.createMasterPlaylist(variants, trackId);
      const masterPath = path.join(outputDir, 'master.m3u8');
      await fs.writeFile(masterPath, masterPlaylist);

      // Upload master playlist
      const masterBuffer = await fs.readFile(masterPath);
      const masterS3Key = `hls/${artistId}/${trackId}/master.m3u8`;
      const result = await s3Service.uploadFile(
        { buffer: masterBuffer, originalname: 'master.m3u8', mimetype: 'application/x-mpegURL' },
        artistId,
        'hls'
      );

      await job.progress(100);

      // Clean up temp files
      await this.cleanup(localFile, outputDir);

      // Cache the HLS URL
      await redisClient.cacheSet(
        `track:hls:${trackId}`,
        {
          masterUrl: result.cloudFrontUrl,
          variants: variants.map(v => ({
            quality: v.name,
            bitrate: v.bitrate,
            tier: v.tier,
            url: `${result.cloudFrontUrl.replace('master.m3u8', `${v.name}/playlist.m3u8`)}`
          }))
        },
        86400 // 24 hours
      );

      return {
        success: true,
        masterUrl: result.cloudFrontUrl,
        trackId,
        variants: variants.length
      };

    } catch (error) {
      console.error('HLS conversion error:', error);
      await this.cleanup(localFile, outputDir);
      throw error;
    }
  }

  // Create HLS variant with specific bitrate
  async createHLSVariant(inputFile, outputDir, bitrate, quality) {
    return new Promise((resolve, reject) => {
      const playlistPath = path.join(outputDir, 'playlist.m3u8');
      const segmentPath = path.join(outputDir, 'segment_%03d.ts');

      ffmpeg(inputFile)
        .audioCodec('aac')
        .audioBitrate(bitrate)
        .outputOptions([
          '-hls_time', '10',              // 10 second segments
          '-hls_playlist_type', 'vod',    // Video on demand
          '-hls_segment_filename', segmentPath,
          '-hls_segment_type', 'mpegts',
          '-start_number', '0'
        ])
        .output(playlistPath)
        .on('start', (cmd) => {
          console.log(`Starting FFmpeg for ${quality}: ${cmd}`);
        })
        .on('progress', (progress) => {
          console.log(`Processing ${quality}: ${progress.percent}% done`);
        })
        .on('end', () => {
          console.log(`Finished ${quality} variant`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`Error creating ${quality} variant:`, err);
          reject(err);
        })
        .run();
    });
  }

  // Create master playlist
  createMasterPlaylist(variants, trackId) {
    let playlist = '#EXTM3U\n';
    playlist += '#EXT-X-VERSION:3\n\n';

    variants.forEach(variant => {
      const bandwidth = parseInt(variant.bitrate) * 1000; // Convert to bps
      playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},CODECS="mp4a.40.2",NAME="${variant.name}"\n`;
      playlist += `${variant.name}/playlist.m3u8\n\n`;
    });

    return playlist;
  }

  // Extract audio metadata
  async extractMetadata(s3Key, trackId, job) {
    const localFile = path.join(this.tempDir, `${trackId}-metadata.mp3`);

    try {
      await job.progress(10);

      // Download file
      const fileBuffer = await s3Service.downloadFile(s3Key);
      await fs.writeFile(localFile, fileBuffer);

      await job.progress(30);

      // Extract metadata using ffprobe
      const metadata = await this.getAudioMetadata(localFile);

      await job.progress(70);

      // Store metadata in Redis
      await redisClient.cacheSet(
        `track:metadata:${trackId}`,
        metadata,
        86400 * 7 // 7 days
      );

      await job.progress(100);

      // Cleanup
      await fs.unlink(localFile);

      return {
        success: true,
        trackId,
        metadata
      };

    } catch (error) {
      console.error('Metadata extraction error:', error);
      await this.cleanup(localFile);
      throw error;
    }
  }

  // Get audio metadata using ffprobe
  async getAudioMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        const format = metadata.format;

        resolve({
          duration: Math.round(format.duration),
          bitrate: format.bit_rate,
          sampleRate: audioStream?.sample_rate,
          channels: audioStream?.channels,
          codec: audioStream?.codec_name,
          size: format.size,
          tags: format.tags || {}
        });
      });
    });
  }

  // Generate waveform data
  async generateWaveform(s3Key, trackId, job) {
    const localFile = path.join(this.tempDir, `${trackId}-waveform.mp3`);
    const waveformFile = path.join(this.tempDir, `${trackId}-waveform.json`);

    try {
      await job.progress(10);

      // Download file
      const fileBuffer = await s3Service.downloadFile(s3Key);
      await fs.writeFile(localFile, fileBuffer);

      await job.progress(30);

      // Generate waveform data using ffmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(localFile)
          .audioFilters('aformat=channel_layouts=mono')
          .outputOptions([
            '-f', 'null',
            '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=' + waveformFile
          ])
          .on('end', resolve)
          .on('error', reject)
          .save('/dev/null');
      });

      await job.progress(70);

      // Process waveform data
      const waveformData = await this.processWaveformData(waveformFile);

      // Upload to S3
      const waveformBuffer = Buffer.from(JSON.stringify(waveformData));
      const waveformS3Key = `waveforms/${trackId}.json`;
      
      await s3Service.uploadFile(
        { buffer: waveformBuffer, originalname: 'waveform.json', mimetype: 'application/json' },
        trackId.split('-')[0], // Extract artistId from trackId
        'waveforms'
      );

      await job.progress(100);

      // Cleanup
      await this.cleanup(localFile, waveformFile);

      return {
        success: true,
        trackId,
        waveformUrl: s3Service.getCloudFrontUrl(waveformS3Key)
      };

    } catch (error) {
      console.error('Waveform generation error:', error);
      await this.cleanup(localFile, waveformFile);
      throw error;
    }
  }

  // Process waveform data into peaks
  async processWaveformData(waveformFile) {
    try {
      const data = await fs.readFile(waveformFile, 'utf8');
      const lines = data.split('\n').filter(line => line.includes('Peak_level'));
      
      const peaks = lines.map(line => {
        const match = line.match(/Peak_level=([-\d.]+)/);
        return match ? parseFloat(match[1]) : 0;
      });

      // Normalize peaks to 0-1 range
      const maxPeak = Math.max(...peaks.map(Math.abs));
      const normalizedPeaks = peaks.map(peak => Math.abs(peak) / maxPeak);

      // Downsample to reasonable number of points
      const targetPoints = 200;
      const downsampledPeaks = this.downsample(normalizedPeaks, targetPoints);

      return {
        peaks: downsampledPeaks,
        duration: peaks.length,
        sampleRate: 1
      };
    } catch (error) {
      console.error('Error processing waveform data:', error);
      return {
        peaks: [],
        duration: 0,
        sampleRate: 1
      };
    }
  }

  // Downsample array to target length
  downsample(array, targetLength) {
    if (array.length <= targetLength) return array;

    const result = [];
    const bucketSize = array.length / targetLength;

    for (let i = 0; i < targetLength; i++) {
      const start = Math.floor(i * bucketSize);
      const end = Math.floor((i + 1) * bucketSize);
      
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += array[j];
      }
      
      result.push(sum / (end - start));
    }

    return result;
  }

  // Generate thumbnail for video
  async generateThumbnail(s3Key, artistId, type, job) {
    // Implementation for video thumbnail generation
    // This would use ffmpeg to extract a frame from video
    return {
      success: true,
      message: 'Thumbnail generation not implemented yet'
    };
  }

  // Cleanup temporary files
  async cleanup(...paths) {
    for (const filePath of paths) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          await fs.rm(filePath, { recursive: true, force: true });
        } else {
          await fs.unlink(filePath);
        }
      } catch (error) {
        // Ignore errors, file might not exist
      }
    }
  }

  // Get job status
  async getJobStatus(jobId) {
    const job = await mediaQueue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress(),
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason
    };
  }

  // Get queue statistics
  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      mediaQueue.getWaitingCount(),
      mediaQueue.getActiveCount(),
      mediaQueue.getCompletedCount(),
      mediaQueue.getFailedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed
    };
  }
}

// Create singleton instance
const mediaProcessor = new MediaProcessor();

module.exports = mediaProcessor;