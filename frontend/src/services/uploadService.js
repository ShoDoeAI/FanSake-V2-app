import axios from 'axios';
import api from './api';

class UploadService {
  constructor() {
    this.uploadEndpoints = {
      music: '/uploads/music',
      image: '/uploads/image',
      video: '/uploads/video'
    };
  }

  // Upload file with progress tracking
  async uploadFile(file, type, metadata = {}, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Add metadata fields
    Object.keys(metadata).forEach(key => {
      formData.append(key, metadata[key]);
    });

    try {
      const response = await api.post(this.uploadEndpoints[type], formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        }
      });

      return response.data;
    } catch (error) {
      console.error(`Error uploading ${type}:`, error);
      throw this.handleUploadError(error);
    }
  }

  // Upload multiple files
  async uploadMultipleFiles(files, type, metadata = {}, onProgress) {
    const results = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileMetadata = {
        ...metadata,
        title: metadata.title || file.name
      };

      try {
        const result = await this.uploadFile(
          file,
          type,
          fileMetadata,
          (progress) => {
            if (onProgress) {
              // Calculate overall progress
              const overallProgress = Math.round(
                ((i * 100) + progress) / files.length
              );
              onProgress(overallProgress, i, file.name);
            }
          }
        );
        results.push(result);
      } catch (error) {
        errors.push({ file: file.name, error: error.message });
      }
    }

    return { results, errors };
  }

  // Get all uploads for current artist
  async getMyUploads() {
    try {
      const response = await api.get('/uploads/my-uploads');
      return response.data.uploads;
    } catch (error) {
      console.error('Error fetching uploads:', error);
      throw error;
    }
  }

  // Delete uploaded file
  async deleteFile(type, filename) {
    try {
      const response = await api.delete(`/uploads/${type}/${filename}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  // Validate file before upload
  validateFile(file, type) {
    const validations = {
      music: {
        maxSize: 50 * 1024 * 1024, // 50MB
        allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp3', 'audio/x-m4a'],
        extensions: ['.mp3', '.wav', '.flac', '.m4a']
      },
      image: {
        maxSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        extensions: ['.jpg', '.jpeg', '.png', '.webp']
      },
      video: {
        maxSize: 200 * 1024 * 1024, // 200MB
        allowedTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
        extensions: ['.mp4', '.mov', '.avi', '.webm']
      }
    };

    const config = validations[type];
    if (!config) {
      return { valid: false, error: 'Invalid file type' };
    }

    // Check file size
    if (file.size > config.maxSize) {
      return { 
        valid: false, 
        error: `File size exceeds ${config.maxSize / (1024 * 1024)}MB limit` 
      };
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    if (!config.extensions.includes(fileExtension)) {
      return { 
        valid: false, 
        error: `Invalid file type. Allowed: ${config.extensions.join(', ')}` 
      };
    }

    return { valid: true };
  }

  // Handle upload errors
  handleUploadError(error) {
    if (error.response?.data?.message) {
      return new Error(error.response.data.message);
    }
    if (error.message.includes('Network Error')) {
      return new Error('Network error. Please check your connection.');
    }
    if (error.message.includes('413')) {
      return new Error('File too large');
    }
    return new Error('Upload failed. Please try again.');
  }

  // Get file URL
  getFileUrl(type, filename) {
    return `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/uploads/${type}/${filename}`;
  }

  // Format file size for display
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default new UploadService();