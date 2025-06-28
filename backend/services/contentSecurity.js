const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const AWS = require('aws-sdk');

// Initialize AWS services
const s3 = new AWS.S3();
const cloudfront = new AWS.CloudFront();

class ContentSecurityService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.saltLength = 64;
  }

  // Generate unique content ID for tracking
  generateContentId(userId, contentType, timestamp = Date.now()) {
    const data = `${userId}-${contentType}-${timestamp}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Content fingerprinting using perceptual hashing
  async generateAudioFingerprint(audioPath) {
    return new Promise((resolve, reject) => {
      const fingerprint = [];
      
      ffmpeg(audioPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(8000)
        .audioChannels(1)
        .format('wav')
        .on('error', reject)
        .pipe()
        .on('data', (chunk) => {
          // Simple spectral analysis for fingerprinting
          const samples = new Int16Array(chunk.buffer);
          const hash = crypto.createHash('sha256');
          
          for (let i = 0; i < samples.length; i += 1000) {
            const segment = samples.slice(i, i + 1000);
            hash.update(Buffer.from(segment));
          }
          
          fingerprint.push(hash.digest('hex').substr(0, 8));
        })
        .on('end', () => {
          resolve(fingerprint.join('-'));
        });
    });
  }

  // Image fingerprinting using perceptual hashing
  async generateImageFingerprint(imagePath) {
    try {
      const image = await sharp(imagePath)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();
      
      // Calculate average pixel value
      const pixels = [...image];
      const avg = pixels.reduce((a, b) => a + b) / pixels.length;
      
      // Generate hash based on pixel comparison to average
      let hash = '';
      pixels.forEach(pixel => {
        hash += pixel > avg ? '1' : '0';
      });
      
      // Convert binary string to hex
      return parseInt(hash, 2).toString(16).padStart(16, '0');
    } catch (error) {
      throw new Error(`Image fingerprinting failed: ${error.message}`);
    }
  }

  // Audio watermarking - embeds inaudible tracking data
  async addAudioWatermark(inputPath, outputPath, watermarkData) {
    const watermarkFreq = 18000; // High frequency, barely audible
    const watermarkPattern = this.encodeWatermarkData(watermarkData);
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .complexFilter([
          `aevalsrc=sin(${watermarkFreq}*2*PI*t)*${watermarkPattern}:d=0.1[wm]`,
          '[0:a][wm]amix=inputs=2:duration=longest'
        ])
        .outputOptions('-codec:a', 'libmp3lame')
        .outputOptions('-b:a', '320k')
        .on('error', reject)
        .on('end', () => resolve(outputPath))
        .save(outputPath);
    });
  }

  // Image watermarking - embeds invisible tracking data
  async addImageWatermark(inputPath, outputPath, watermarkData) {
    try {
      const watermarkText = JSON.stringify(watermarkData);
      const watermarkBuffer = Buffer.from(watermarkText);
      
      // Create semi-transparent watermark
      const watermark = await sharp({
        create: {
          width: 200,
          height: 50,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 0.01 }
        }
      })
      .composite([{
        input: Buffer.from(watermarkText),
        top: 10,
        left: 10
      }])
      .png()
      .toBuffer();
      
      // Apply watermark to image
      await sharp(inputPath)
        .composite([
          {
            input: watermark,
            tile: true,
            blend: 'over'
          }
        ])
        .toFile(outputPath);
      
      return outputPath;
    } catch (error) {
      throw new Error(`Image watermarking failed: ${error.message}`);
    }
  }

  // DRM encryption for content
  async encryptContent(contentPath, userId, contentId) {
    const key = await this.generateContentKey(userId, contentId);
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    const input = await fs.readFile(contentPath);
    const encrypted = Buffer.concat([
      cipher.update(input),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    // Store encrypted content with metadata
    const encryptedData = {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      content: encrypted.toString('base64'),
      contentId,
      userId,
      timestamp: Date.now()
    };
    
    return encryptedData;
  }

  // DRM decryption for authorized access
  async decryptContent(encryptedData, userId) {
    if (encryptedData.userId !== userId && !this.isAuthorized(userId, encryptedData.contentId)) {
      throw new Error('Unauthorized access to encrypted content');
    }
    
    const key = await this.generateContentKey(encryptedData.userId, encryptedData.contentId);
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');
    const encrypted = Buffer.from(encryptedData.content, 'base64');
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted;
  }

  // Generate content-specific encryption key
  async generateContentKey(userId, contentId) {
    const masterKey = process.env.DRM_MASTER_KEY || crypto.randomBytes(32).toString('hex');
    const salt = `${userId}-${contentId}`;
    
    return crypto.pbkdf2Sync(masterKey, salt, 100000, this.keyLength, 'sha256');
  }

  // Secure streaming with token validation
  async generateSecureStreamUrl(contentId, userId, expiryMinutes = 60) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + (expiryMinutes * 60 * 1000);
    
    // Store token in Redis with expiry
    const tokenData = {
      contentId,
      userId,
      expiry,
      accessCount: 0,
      maxAccess: 1 // Single-use token
    };
    
    await this.storeStreamToken(token, tokenData);
    
    // Generate signed URL
    const baseUrl = process.env.CDN_URL || 'https://cdn.musicconnect.com';
    const signedUrl = `${baseUrl}/secure/${contentId}?token=${token}&user=${userId}&expires=${expiry}`;
    
    return this.signUrl(signedUrl);
  }

  // URL signing for CDN
  signUrl(url) {
    const secret = process.env.CDN_SECRET || 'default-secret';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(url)
      .digest('hex');
    
    return `${url}&signature=${signature}`;
  }

  // Verify content integrity
  async verifyContentIntegrity(contentPath, expectedHash) {
    const content = await fs.readFile(contentPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    
    return hash === expectedHash;
  }

  // Track content access
  async trackContentAccess(contentId, userId, accessType = 'view') {
    const accessLog = {
      contentId,
      userId,
      accessType,
      timestamp: Date.now(),
      ip: this.getClientIp(),
      userAgent: this.getUserAgent(),
      referrer: this.getReferrer()
    };
    
    // Store in database for analytics and abuse detection
    await this.logContentAccess(accessLog);
    
    // Check for suspicious patterns
    await this.detectAbusePatterns(userId, contentId);
  }

  // Detect content abuse patterns
  async detectAbusePatterns(userId, contentId) {
    const recentAccess = await this.getRecentAccess(userId, contentId);
    
    // Check for rapid repeated access
    if (recentAccess.length > 100) {
      await this.flagSuspiciousActivity(userId, 'excessive_access', {
        contentId,
        accessCount: recentAccess.length
      });
    }
    
    // Check for distributed access from same user
    const uniqueIPs = new Set(recentAccess.map(a => a.ip));
    if (uniqueIPs.size > 10) {
      await this.flagSuspiciousActivity(userId, 'distributed_access', {
        contentId,
        ipCount: uniqueIPs.size
      });
    }
  }

  // Content leak detection
  async scanForLeakedContent(fingerprint) {
    // This would integrate with external services to scan for leaked content
    // For now, we'll implement a basic internal check
    
    const leakedContent = await this.checkLeakDatabase(fingerprint);
    if (leakedContent) {
      await this.handleLeakedContent(leakedContent);
      return true;
    }
    
    return false;
  }

  // Encode watermark data
  encodeWatermarkData(data) {
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
    // Convert to frequency pattern (simplified)
    return encoded.split('').map(c => c.charCodeAt(0) / 1000).join('*');
  }

  // Helper methods (would be implemented with actual services)
  async storeStreamToken(token, data) {
    // Store in Redis or database
  }

  async logContentAccess(accessLog) {
    // Store in database
  }

  async getRecentAccess(userId, contentId) {
    // Query from database
    return [];
  }

  async flagSuspiciousActivity(userId, type, details) {
    // Log and potentially take action
  }

  async checkLeakDatabase(fingerprint) {
    // Check against known leaked content
    return null;
  }

  async handleLeakedContent(content) {
    // Take action on leaked content
  }

  isAuthorized(userId, contentId) {
    // Check user authorization for content
    return true; // Simplified
  }

  getClientIp() {
    // Get from request context
    return '0.0.0.0';
  }

  getUserAgent() {
    // Get from request headers
    return 'Unknown';
  }

  getReferrer() {
    // Get from request headers
    return 'Direct';
  }
}

module.exports = new ContentSecurityService();