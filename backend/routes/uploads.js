const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { 
  uploadMusic, 
  uploadImage, 
  uploadVideo, 
  handleMulterError,
  uploadDirs 
} = require('../middleware/upload');
const { authenticateToken, requireArtist } = require('../middleware/auth');
// const Artist = require('../models/Artist'); // Uncomment when using real DB

// For now, we'll store uploads in memory for the demo
const uploadedContent = {
  music: [],
  images: [],
  videos: []
};

// Helper function to get file metadata
const getFileMetadata = (file, type) => {
  const baseMetadata = {
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
    uploadDate: new Date(),
    url: `/api/uploads/${type}/${file.filename}`
  };

  // Add type-specific metadata
  switch(type) {
    case 'music':
      return {
        ...baseMetadata,
        type: 'music',
        // Duration will be calculated on frontend
      };
    case 'images':
      return {
        ...baseMetadata,
        type: 'image',
      };
    case 'videos':
      return {
        ...baseMetadata,
        type: 'video',
      };
    default:
      return baseMetadata;
  }
};

// Upload music file
router.post('/music', authenticateToken, requireArtist, uploadMusic.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    const metadata = getFileMetadata(req.file, 'music');
    
    // Add additional metadata from request
    metadata.title = req.body.title || req.file.originalname;
    metadata.description = req.body.description || '';
    metadata.tier = req.body.tier || 'free';
    metadata.genre = req.body.genre || 'Other';

    // Store in memory for demo
    uploadedContent.music.push({
      ...metadata,
      artistId: req.user.id || req.user._id,
      artistName: req.user.username
    });

    res.json({
      success: true,
      message: 'Music uploaded successfully',
      file: metadata
    });
  } catch (error) {
    console.error('Music upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload music' 
    });
  }
});

// Upload image file
router.post('/image', authenticateToken, requireArtist, uploadImage.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    const metadata = getFileMetadata(req.file, 'images');
    
    // Add additional metadata
    metadata.title = req.body.title || req.file.originalname;
    metadata.description = req.body.description || '';
    metadata.type = req.body.imageType || 'general'; // profile, cover, gallery

    // Store in memory for demo
    uploadedContent.images.push({
      ...metadata,
      artistId: req.user.id || req.user._id,
      artistName: req.user.username
    });

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      file: metadata
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload image' 
    });
  }
});

// Upload video file
router.post('/video', authenticateToken, requireArtist, uploadVideo.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    const metadata = getFileMetadata(req.file, 'videos');
    
    // Add additional metadata
    metadata.title = req.body.title || req.file.originalname;
    metadata.description = req.body.description || '';
    metadata.tier = req.body.tier || 'supporter';

    // Store in memory for demo
    uploadedContent.videos.push({
      ...metadata,
      artistId: req.user.id || req.user._id,
      artistName: req.user.username
    });

    res.json({
      success: true,
      message: 'Video uploaded successfully',
      file: metadata
    });
  } catch (error) {
    console.error('Video upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload video' 
    });
  }
});

// Serve uploaded files
router.get('/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  
  // Validate type
  if (!['music', 'images', 'videos'].includes(type)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid file type' 
    });
  }

  const filePath = path.join(uploadDirs[type], filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ 
      success: false, 
      message: 'File not found' 
    });
  }

  // Send file
  res.sendFile(filePath);
});

// Get all uploads for current artist
router.get('/my-uploads', authenticateToken, async (req, res) => {
  try {
    const artistId = req.user.id || req.user._id;
    
    // Filter uploads for current artist
    const myUploads = {
      music: uploadedContent.music.filter(item => item.artistId === artistId),
      images: uploadedContent.images.filter(item => item.artistId === artistId),
      videos: uploadedContent.videos.filter(item => item.artistId === artistId)
    };

    res.json({
      success: true,
      uploads: myUploads
    });
  } catch (error) {
    console.error('Error fetching uploads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch uploads' 
    });
  }
});

// Delete uploaded file
router.delete('/:type/:filename', authenticateToken, requireArtist, async (req, res) => {
  try {
    const { type, filename } = req.params;
    
    // Validate type
    if (!['music', 'images', 'videos'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid file type' 
      });
    }

    // Remove from in-memory storage
    const artistId = req.user.id || req.user._id;
    if (type === 'music') {
      uploadedContent.music = uploadedContent.music.filter(
        item => !(item.filename === filename && item.artistId === artistId)
      );
    } else if (type === 'images') {
      uploadedContent.images = uploadedContent.images.filter(
        item => !(item.filename === filename && item.artistId === artistId)
      );
    } else if (type === 'videos') {
      uploadedContent.videos = uploadedContent.videos.filter(
        item => !(item.filename === filename && item.artistId === artistId)
      );
    }

    // Delete physical file
    const filePath = path.join(uploadDirs[type], filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete file' 
    });
  }
});

module.exports = router;