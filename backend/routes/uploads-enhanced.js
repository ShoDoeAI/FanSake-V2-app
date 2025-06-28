const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const s3Service = require('../config/aws');
const mediaProcessor = require('../services/mediaProcessor');
const streamingService = require('../services/streamingService');
const ArtistEnhanced = require('../models/ArtistEnhanced');

// Configure multer for memory storage (files will be uploaded to S3)
const storage = multer.memoryStorage();

// File filter for different media types
const fileFilter = (req, file, cb) => {
  const allowedAudioFormats = process.env.ALLOWED_AUDIO_FORMATS?.split(',') || 
    ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'];
  const allowedImageFormats = process.env.ALLOWED_IMAGE_FORMATS?.split(',') || 
    ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const allowedVideoFormats = process.env.ALLOWED_VIDEO_FORMATS?.split(',') || 
    ['mp4', 'mov', 'avi', 'mkv', 'webm'];

  const ext = file.originalname.split('.').pop().toLowerCase();
  
  if (file.fieldname === 'audio' && allowedAudioFormats.includes(ext)) {
    cb(null, true);
  } else if (file.fieldname === 'image' && allowedImageFormats.includes(ext)) {
    cb(null, true);
  } else if (file.fieldname === 'video' && allowedVideoFormats.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file format: ${ext}`), false);
  }
};

// Configure upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 104857600, // 100MB default
  }
});

// Upload audio track
router.post('/audio', auth, upload.single('audio'), async (req, res) => {
  try {
    const { title, description, genre, tier = 'free', releaseDate } = req.body;
    const file = req.file;
    const artistId = req.user.id;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!title) {
      return res.status(400).json({ message: 'Track title is required' });
    }

    // Generate unique track ID
    const trackId = `track-${crypto.randomBytes(16).toString('hex')}`;

    // Upload to S3
    const s3Result = await s3Service.uploadFile(file, artistId, 'tracks');

    // Create track metadata
    const trackData = {
      _id: trackId,
      filename: file.originalname,
      originalName: file.originalname,
      title,
      description,
      size: file.size,
      duration: 0, // Will be updated by media processor
      mimeType: file.mimetype,
      url: s3Result.s3Url,
      s3Key: s3Result.s3Key,
      cloudFrontUrl: s3Result.cloudFrontUrl,
      tier,
      genre,
      plays: 0,
      likes: 0,
      uploadDate: new Date(),
      releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
      isExclusive: tier !== 'free'
    };

    // Update artist with new track
    const artist = await ArtistEnhanced.findOneAndUpdate(
      { userId: artistId },
      {
        $push: { 'media.tracks': trackData },
        $inc: { 'stats.totalUploads': 1 }
      },
      { new: true, upsert: true }
    );

    // Queue for media processing (HLS conversion)
    const jobIds = await mediaProcessor.processAudioUpload(
      s3Result.s3Key,
      artistId,
      trackId,
      title
    );

    res.json({
      success: true,
      track: {
        id: trackId,
        title,
        cloudFrontUrl: s3Result.cloudFrontUrl,
        processingJobs: jobIds,
        tier,
        genre
      },
      message: 'Track uploaded successfully. Processing for streaming...'
    });

  } catch (error) {
    console.error('Audio upload error:', error);
    res.status(500).json({ 
      message: 'Failed to upload audio',
      error: error.message 
    });
  }
});

// Upload image (profile, header, gallery)
router.post('/image', auth, upload.single('image'), async (req, res) => {
  try {
    const { type = 'gallery' } = req.body;
    const file = req.file;
    const artistId = req.user.id;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const validTypes = ['profile', 'header', 'gallery', 'album'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid image type' });
    }

    // Upload to S3
    const s3Result = await s3Service.uploadFile(file, artistId, 'images');

    // Create image metadata
    const imageData = {
      filename: file.originalname,
      originalName: file.originalname,
      s3Key: s3Result.s3Key,
      cloudFrontUrl: s3Result.cloudFrontUrl,
      type,
      uploadDate: new Date()
    };

    // Update artist
    let updateQuery = {};
    if (type === 'profile') {
      updateQuery = { profileImage: s3Result.cloudFrontUrl };
    } else if (type === 'header') {
      updateQuery = { headerImage: s3Result.cloudFrontUrl };
    } else {
      updateQuery = { $push: { 'media.images': imageData } };
    }

    const artist = await ArtistEnhanced.findOneAndUpdate(
      { userId: artistId },
      updateQuery,
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      image: {
        url: s3Result.cloudFrontUrl,
        type
      },
      message: 'Image uploaded successfully'
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ 
      message: 'Failed to upload image',
      error: error.message 
    });
  }
});

// Upload video
router.post('/video', auth, upload.single('video'), async (req, res) => {
  try {
    const { title, description, tier = 'free' } = req.body;
    const file = req.file;
    const artistId = req.user.id;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!title) {
      return res.status(400).json({ message: 'Video title is required' });
    }

    // Generate unique video ID
    const videoId = `video-${crypto.randomBytes(16).toString('hex')}`;

    // Upload to S3
    const s3Result = await s3Service.uploadFile(file, artistId, 'videos');

    // Create video metadata
    const videoData = {
      _id: videoId,
      filename: file.originalname,
      title,
      description,
      s3Key: s3Result.s3Key,
      cloudFrontUrl: s3Result.cloudFrontUrl,
      duration: 0, // Will be updated by media processor
      tier,
      uploadDate: new Date()
    };

    // Update artist
    const artist = await ArtistEnhanced.findOneAndUpdate(
      { userId: artistId },
      {
        $push: { 'media.videos': videoData },
        $inc: { 'stats.totalUploads': 1 }
      },
      { new: true, upsert: true }
    );

    // Queue for video processing
    await mediaProcessor.processVideoUpload(
      s3Result.s3Key,
      artistId,
      videoId,
      title
    );

    res.json({
      success: true,
      video: {
        id: videoId,
        title,
        cloudFrontUrl: s3Result.cloudFrontUrl,
        tier
      },
      message: 'Video uploaded successfully. Processing...'
    });

  } catch (error) {
    console.error('Video upload error:', error);
    res.status(500).json({ 
      message: 'Failed to upload video',
      error: error.message 
    });
  }
});

// Get presigned upload URL for direct browser upload
router.post('/presigned-url', auth, async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    const artistId = req.user.id;

    if (!fileName || !fileType) {
      return res.status(400).json({ 
        message: 'fileName and fileType are required' 
      });
    }

    // Determine media type from file extension
    const ext = fileName.split('.').pop().toLowerCase();
    let mediaType = 'tracks';
    
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
      mediaType = 'images';
    } else if (['mp4', 'mov', 'avi'].includes(ext)) {
      mediaType = 'videos';
    }

    // Get presigned URL
    const presignedData = await s3Service.getSignedUploadUrl(
      artistId,
      fileName,
      mediaType,
      3600 // 1 hour expiry
    );

    res.json({
      success: true,
      uploadUrl: presignedData.uploadUrl,
      s3Key: presignedData.s3Key,
      cloudFrontUrl: presignedData.cloudFrontUrl,
      expiresIn: 3600
    });

  } catch (error) {
    console.error('Presigned URL error:', error);
    res.status(500).json({ 
      message: 'Failed to generate upload URL',
      error: error.message 
    });
  }
});

// Get processing status
router.get('/processing-status/:jobId', auth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await mediaProcessor.getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json({
      success: true,
      job: status
    });

  } catch (error) {
    console.error('Processing status error:', error);
    res.status(500).json({ 
      message: 'Failed to get processing status',
      error: error.message 
    });
  }
});

// Get streaming URL for a track
router.get('/stream/:trackId', auth, async (req, res) => {
  try {
    const { trackId } = req.params;
    const userId = req.user.id;
    const userTier = req.user.tier || 'free';

    const streamingData = await streamingService.getStreamingUrl(
      trackId,
      userId,
      userTier
    );

    res.json({
      success: true,
      streaming: streamingData
    });

  } catch (error) {
    console.error('Streaming URL error:', error);
    res.status(500).json({ 
      message: 'Failed to get streaming URL',
      error: error.message 
    });
  }
});

// Delete uploaded content
router.delete('/:type/:id', auth, async (req, res) => {
  try {
    const { type, id } = req.params;
    const artistId = req.user.id;

    const validTypes = ['tracks', 'images', 'videos'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid content type' });
    }

    // Find the content in artist's media
    const artist = await ArtistEnhanced.findOne({ userId: artistId });
    if (!artist) {
      return res.status(404).json({ message: 'Artist not found' });
    }

    const content = artist.media[type].find(item => item._id.toString() === id);
    if (!content) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Delete from S3
    if (content.s3Key) {
      await s3Service.deleteFile(content.s3Key);
    }

    // Remove from database
    await ArtistEnhanced.findOneAndUpdate(
      { userId: artistId },
      {
        $pull: { [`media.${type}`]: { _id: id } },
        $inc: { 'stats.totalUploads': -1 }
      }
    );

    res.json({
      success: true,
      message: 'Content deleted successfully'
    });

  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ 
      message: 'Failed to delete content',
      error: error.message 
    });
  }
});

// Get artist's uploaded content
router.get('/my-content', auth, async (req, res) => {
  try {
    const artistId = req.user.id;
    const { type, page = 1, limit = 20 } = req.query;

    const artist = await ArtistEnhanced.findOne({ userId: artistId });
    if (!artist) {
      return res.status(404).json({ message: 'Artist not found' });
    }

    let content = [];
    if (type && artist.media[type]) {
      content = artist.media[type];
    } else {
      // Combine all media types
      content = [
        ...artist.media.tracks.map(t => ({ ...t.toObject(), type: 'track' })),
        ...artist.media.images.map(i => ({ ...i.toObject(), type: 'image' })),
        ...artist.media.videos.map(v => ({ ...v.toObject(), type: 'video' }))
      ];
    }

    // Sort by upload date (newest first)
    content.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedContent = content.slice(startIndex, endIndex);

    res.json({
      success: true,
      content: paginatedContent,
      pagination: {
        total: content.length,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(content.length / limit)
      }
    });

  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ 
      message: 'Failed to get content',
      error: error.message 
    });
  }
});

module.exports = router;