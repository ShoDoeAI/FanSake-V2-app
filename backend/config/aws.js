const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  signatureVersion: 'v4'
});

const cloudfront = new AWS.CloudFront({
  apiVersion: '2020-05-31'
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'musicconnect-media';
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || '';

class S3Service {
  constructor() {
    this.bucket = BUCKET_NAME;
    this.cloudfrontDomain = CLOUDFRONT_DOMAIN;
  }

  // Generate unique S3 key for media files
  generateS3Key(artistId, fileType, fileName) {
    const timestamp = Date.now();
    const ext = path.extname(fileName);
    const nameWithoutExt = path.basename(fileName, ext);
    
    // Structure: media-type/artist-id/year/month/timestamp-filename
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    return `${fileType}/${artistId}/${year}/${month}/${timestamp}-${nameWithoutExt}${ext}`;
  }

  // Upload file to S3
  async uploadFile(file, artistId, fileType = 'tracks') {
    try {
      const s3Key = this.generateS3Key(artistId, fileType, file.originalname);
      
      const params = {
        Bucket: this.bucket,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          artistId: artistId,
          originalName: file.originalname,
          uploadDate: new Date().toISOString()
        }
      };

      // Add specific settings based on file type
      if (fileType === 'tracks') {
        params.Metadata.duration = file.duration || '0';
        params.CacheControl = 'max-age=31536000'; // 1 year
      } else if (fileType === 'images') {
        params.CacheControl = 'max-age=31536000'; // 1 year
        params.ContentDisposition = 'inline';
      }

      const result = await s3.upload(params).promise();
      
      return {
        s3Key: s3Key,
        s3Url: result.Location,
        cloudFrontUrl: this.getCloudFrontUrl(s3Key),
        bucket: result.Bucket,
        etag: result.ETag
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw error;
    }
  }

  // Upload multiple files (batch upload)
  async uploadMultipleFiles(files, artistId, fileType = 'tracks') {
    const uploadPromises = files.map(file => 
      this.uploadFile(file, artistId, fileType)
    );
    
    return Promise.all(uploadPromises);
  }

  // Download file from S3
  async downloadFile(s3Key) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: s3Key
      };

      const data = await s3.getObject(params).promise();
      return data.Body;
    } catch (error) {
      console.error('S3 download error:', error);
      throw error;
    }
  }

  // Delete file from S3
  async deleteFile(s3Key) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: s3Key
      };

      await s3.deleteObject(params).promise();
      return true;
    } catch (error) {
      console.error('S3 delete error:', error);
      throw error;
    }
  }

  // Delete multiple files
  async deleteMultipleFiles(s3Keys) {
    try {
      const objects = s3Keys.map(key => ({ Key: key }));
      
      const params = {
        Bucket: this.bucket,
        Delete: {
          Objects: objects,
          Quiet: false
        }
      };

      const result = await s3.deleteObjects(params).promise();
      return result;
    } catch (error) {
      console.error('S3 batch delete error:', error);
      throw error;
    }
  }

  // Generate pre-signed URL for direct upload
  async getSignedUploadUrl(artistId, fileName, fileType = 'tracks', expiresIn = 3600) {
    try {
      const s3Key = this.generateS3Key(artistId, fileType, fileName);
      
      const params = {
        Bucket: this.bucket,
        Key: s3Key,
        Expires: expiresIn,
        ContentType: this.getContentType(fileName)
      };

      const url = await s3.getSignedUrlPromise('putObject', params);
      
      return {
        uploadUrl: url,
        s3Key: s3Key,
        cloudFrontUrl: this.getCloudFrontUrl(s3Key)
      };
    } catch (error) {
      console.error('S3 signed URL error:', error);
      throw error;
    }
  }

  // Generate pre-signed URL for download (with expiry)
  async getSignedDownloadUrl(s3Key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: s3Key,
        Expires: expiresIn
      };

      const url = await s3.getSignedUrlPromise('getObject', params);
      return url;
    } catch (error) {
      console.error('S3 signed download URL error:', error);
      throw error;
    }
  }

  // Get CloudFront URL for a file
  getCloudFrontUrl(s3Key) {
    if (!this.cloudfrontDomain) {
      return `https://${this.bucket}.s3.amazonaws.com/${s3Key}`;
    }
    return `https://${this.cloudfrontDomain}/${s3Key}`;
  }

  // Get content type based on file extension
  getContentType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }

  // List files for an artist
  async listArtistFiles(artistId, fileType = 'tracks') {
    try {
      const params = {
        Bucket: this.bucket,
        Prefix: `${fileType}/${artistId}/`,
        MaxKeys: 1000
      };

      const data = await s3.listObjectsV2(params).promise();
      
      return data.Contents.map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        cloudFrontUrl: this.getCloudFrontUrl(item.Key)
      }));
    } catch (error) {
      console.error('S3 list error:', error);
      throw error;
    }
  }

  // Get file metadata
  async getFileMetadata(s3Key) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: s3Key
      };

      const data = await s3.headObject(params).promise();
      
      return {
        contentType: data.ContentType,
        contentLength: data.ContentLength,
        lastModified: data.LastModified,
        metadata: data.Metadata,
        etag: data.ETag
      };
    } catch (error) {
      console.error('S3 metadata error:', error);
      throw error;
    }
  }

  // Copy file within S3
  async copyFile(sourceKey, destinationKey) {
    try {
      const params = {
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey
      };

      const result = await s3.copyObject(params).promise();
      return result;
    } catch (error) {
      console.error('S3 copy error:', error);
      throw error;
    }
  }

  // Create bucket if it doesn't exist (for initial setup)
  async createBucketIfNotExists() {
    try {
      // Check if bucket exists
      await s3.headBucket({ Bucket: this.bucket }).promise();
      console.log(`Bucket ${this.bucket} already exists`);
    } catch (error) {
      if (error.code === 'NotFound') {
        // Create bucket
        const params = {
          Bucket: this.bucket,
          ACL: 'private'
        };

        await s3.createBucket(params).promise();
        console.log(`Bucket ${this.bucket} created successfully`);
        
        // Enable versioning
        await s3.putBucketVersioning({
          Bucket: this.bucket,
          VersioningConfiguration: {
            Status: 'Enabled'
          }
        }).promise();
        
        // Set CORS configuration
        await this.configureCORS();
      } else {
        throw error;
      }
    }
  }

  // Configure CORS for bucket
  async configureCORS() {
    const corsParams = {
      Bucket: this.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedOrigins: ['*'], // Update with your domain in production
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3000
          }
        ]
      }
    };

    await s3.putBucketCors(corsParams).promise();
  }
}

// Create singleton instance
const s3Service = new S3Service();

module.exports = s3Service;