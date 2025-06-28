const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure upload directories exist
const uploadDirs = {
  music: path.join(__dirname, '../uploads/music'),
  images: path.join(__dirname, '../uploads/images'),
  videos: path.join(__dirname, '../uploads/videos')
};

// Create directories if they don't exist
Object.values(uploadDirs).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// File type configurations
const fileConfigs = {
  music: {
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp3', 'audio/x-m4a'],
    maxSize: 50 * 1024 * 1024, // 50MB
    extensions: ['.mp3', '.wav', '.flac', '.m4a']
  },
  images: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    maxSize: 10 * 1024 * 1024, // 10MB
    extensions: ['.jpg', '.jpeg', '.png', '.webp']
  },
  videos: {
    allowedTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
    maxSize: 200 * 1024 * 1024, // 200MB
    extensions: ['.mp4', '.mov', '.avi', '.webm']
  }
};

// Generate unique filename
const generateFilename = (file) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(6).toString('hex');
  const ext = path.extname(file.originalname).toLowerCase();
  const nameWithoutExt = path.basename(file.originalname, ext)
    .replace(/[^a-zA-Z0-9]/g, '-')
    .substring(0, 50);
  return `${nameWithoutExt}-${timestamp}-${randomString}${ext}`;
};

// Create multer storage configuration
const createStorage = (type) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDirs[type]);
    },
    filename: (req, file, cb) => {
      const filename = generateFilename(file);
      cb(null, filename);
    }
  });
};

// File filter function
const createFileFilter = (type) => {
  return (req, file, cb) => {
    const config = fileConfigs[type];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (config.allowedTypes.includes(file.mimetype) && config.extensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${config.extensions.join(', ')}`), false);
    }
  };
};

// Create multer upload instances
const uploadMusic = multer({
  storage: createStorage('music'),
  limits: { fileSize: fileConfigs.music.maxSize },
  fileFilter: createFileFilter('music')
});

const uploadImage = multer({
  storage: createStorage('images'),
  limits: { fileSize: fileConfigs.images.maxSize },
  fileFilter: createFileFilter('images')
});

const uploadVideo = multer({
  storage: createStorage('videos'),
  limits: { fileSize: fileConfigs.videos.maxSize },
  fileFilter: createFileFilter('videos')
});

// Error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false, 
        message: 'File size too large' 
      });
    }
    return res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  } else if (err) {
    return res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }
  next();
};

module.exports = {
  uploadMusic,
  uploadImage,
  uploadVideo,
  handleMulterError,
  uploadDirs,
  fileConfigs
};