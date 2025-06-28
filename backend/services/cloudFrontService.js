const AWS = require('aws-sdk');
const crypto = require('crypto');

// Configure AWS CloudFront
const cloudfront = new AWS.CloudFront({
  apiVersion: '2020-05-31',
  region: process.env.AWS_REGION || 'us-east-1'
});

class CloudFrontService {
  constructor() {
    this.distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
    this.domainName = process.env.CLOUDFRONT_DOMAIN;
    this.keypairId = process.env.CLOUDFRONT_KEYPAIR_ID;
    this.privateKey = process.env.CLOUDFRONT_PRIVATE_KEY;
  }

  // Create CloudFront distribution for S3 bucket
  async createDistribution(s3BucketName) {
    const params = {
      DistributionConfig: {
        CallerReference: `musicconnect-${Date.now()}`,
        Comment: 'MusicConnect Media Distribution',
        DefaultRootObject: 'index.html',
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: `S3-${s3BucketName}`,
              DomainName: `${s3BucketName}.s3.amazonaws.com`,
              S3OriginConfig: {
                OriginAccessIdentity: ''
              },
              ConnectionAttempts: 3,
              ConnectionTimeout: 10
            }
          ]
        },
        DefaultCacheBehavior: {
          TargetOriginId: `S3-${s3BucketName}`,
          ViewerProtocolPolicy: 'redirect-to-https',
          AllowedMethods: {
            Quantity: 7,
            Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
            CachedMethods: {
              Quantity: 2,
              Items: ['GET', 'HEAD']
            }
          },
          ForwardedValues: {
            QueryString: true,
            Cookies: { Forward: 'none' },
            Headers: {
              Quantity: 4,
              Items: ['Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers', 'Range']
            }
          },
          TrustedSigners: {
            Enabled: false,
            Quantity: 0
          },
          MinTTL: 0,
          DefaultTTL: 86400,
          MaxTTL: 31536000,
          Compress: true,
          SmoothStreaming: false
        },
        CacheBehaviors: {
          Quantity: 3,
          Items: [
            // HLS streaming - short cache
            {
              PathPattern: '*.m3u8',
              TargetOriginId: `S3-${s3BucketName}`,
              ViewerProtocolPolicy: 'redirect-to-https',
              AllowedMethods: {
                Quantity: 2,
                Items: ['GET', 'HEAD'],
                CachedMethods: {
                  Quantity: 2,
                  Items: ['GET', 'HEAD']
                }
              },
              ForwardedValues: {
                QueryString: true,
                Cookies: { Forward: 'none' },
                Headers: {
                  Quantity: 2,
                  Items: ['Origin', 'Range']
                }
              },
              TrustedSigners: {
                Enabled: false,
                Quantity: 0
              },
              MinTTL: 0,
              DefaultTTL: 10,      // 10 seconds for playlists
              MaxTTL: 60,          // 1 minute max
              Compress: false,
              SmoothStreaming: false
            },
            // Audio/Video segments - medium cache
            {
              PathPattern: '*.ts',
              TargetOriginId: `S3-${s3BucketName}`,
              ViewerProtocolPolicy: 'redirect-to-https',
              AllowedMethods: {
                Quantity: 2,
                Items: ['GET', 'HEAD'],
                CachedMethods: {
                  Quantity: 2,
                  Items: ['GET', 'HEAD']
                }
              },
              ForwardedValues: {
                QueryString: false,
                Cookies: { Forward: 'none' },
                Headers: {
                  Quantity: 1,
                  Items: ['Range']
                }
              },
              TrustedSigners: {
                Enabled: false,
                Quantity: 0
              },
              MinTTL: 3600,
              DefaultTTL: 86400,    // 24 hours
              MaxTTL: 604800,      // 7 days
              Compress: false,
              SmoothStreaming: false
            },
            // Images - long cache
            {
              PathPattern: '/images/*',
              TargetOriginId: `S3-${s3BucketName}`,
              ViewerProtocolPolicy: 'redirect-to-https',
              AllowedMethods: {
                Quantity: 2,
                Items: ['GET', 'HEAD'],
                CachedMethods: {
                  Quantity: 2,
                  Items: ['GET', 'HEAD']
                }
              },
              ForwardedValues: {
                QueryString: false,
                Cookies: { Forward: 'none' },
                Headers: {
                  Quantity: 0
                }
              },
              TrustedSigners: {
                Enabled: false,
                Quantity: 0
              },
              MinTTL: 86400,
              DefaultTTL: 604800,   // 7 days
              MaxTTL: 31536000,    // 1 year
              Compress: true,
              SmoothStreaming: false
            }
          ]
        },
        Enabled: true,
        PriceClass: 'PriceClass_100', // Use only North America and Europe edge locations
        HttpVersion: 'http2',
        IsIPV6Enabled: true,
        WebACLId: ''
      }
    };

    try {
      const result = await cloudfront.createDistribution(params).promise();
      console.log('CloudFront distribution created:', result.Distribution.DomainName);
      return result.Distribution;
    } catch (error) {
      console.error('Error creating CloudFront distribution:', error);
      throw error;
    }
  }

  // Create signed URL for secure content
  createSignedUrl(url, expiresInSeconds = 3600) {
    if (!this.privateKey || !this.keypairId) {
      console.warn('CloudFront signing not configured, returning unsigned URL');
      return url;
    }

    const expires = Math.floor((Date.now() / 1000) + expiresInSeconds);
    
    const policy = {
      Statement: [{
        Resource: url,
        Condition: {
          DateLessThan: { 'AWS:EpochTime': expires }
        }
      }]
    };

    const policyString = JSON.stringify(policy);
    const signature = crypto
      .createSign('RSA-SHA1')
      .update(policyString)
      .sign(this.privateKey, 'base64');

    const signedUrl = `${url}?Expires=${expires}&Signature=${signature}&Key-Pair-Id=${this.keypairId}`;
    
    return signedUrl;
  }

  // Create signed cookies for multiple resources
  createSignedCookies(domain, path = '/*', expiresInSeconds = 86400) {
    if (!this.privateKey || !this.keypairId) {
      console.warn('CloudFront signing not configured');
      return null;
    }

    const expires = Math.floor((Date.now() / 1000) + expiresInSeconds);
    
    const policy = {
      Statement: [{
        Resource: `https://${domain}${path}`,
        Condition: {
          DateLessThan: { 'AWS:EpochTime': expires }
        }
      }]
    };

    const policyString = JSON.stringify(policy);
    const base64Policy = Buffer.from(policyString).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '~');

    const signature = crypto
      .createSign('RSA-SHA1')
      .update(policyString)
      .sign(this.privateKey, 'base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '~');

    return {
      'CloudFront-Policy': base64Policy,
      'CloudFront-Signature': signature,
      'CloudFront-Key-Pair-Id': this.keypairId
    };
  }

  // Invalidate cached content
  async createInvalidation(paths) {
    if (!this.distributionId) {
      console.warn('CloudFront distribution ID not configured');
      return null;
    }

    const params = {
      DistributionId: this.distributionId,
      InvalidationBatch: {
        CallerReference: `invalidation-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths
        }
      }
    };

    try {
      const result = await cloudfront.createInvalidation(params).promise();
      console.log('CloudFront invalidation created:', result.Invalidation.Id);
      return result.Invalidation;
    } catch (error) {
      console.error('Error creating CloudFront invalidation:', error);
      throw error;
    }
  }

  // Get distribution configuration
  async getDistribution() {
    if (!this.distributionId) {
      return null;
    }

    try {
      const result = await cloudfront.getDistribution({
        Id: this.distributionId
      }).promise();
      
      return result.Distribution;
    } catch (error) {
      console.error('Error getting CloudFront distribution:', error);
      throw error;
    }
  }

  // Update distribution configuration
  async updateDistribution(config) {
    if (!this.distributionId) {
      throw new Error('CloudFront distribution ID not configured');
    }

    try {
      // First get current distribution to get ETag
      const current = await cloudfront.getDistribution({
        Id: this.distributionId
      }).promise();

      const params = {
        Id: this.distributionId,
        DistributionConfig: {
          ...current.Distribution.DistributionConfig,
          ...config
        },
        IfMatch: current.ETag
      };

      const result = await cloudfront.updateDistribution(params).promise();
      console.log('CloudFront distribution updated');
      return result.Distribution;
    } catch (error) {
      console.error('Error updating CloudFront distribution:', error);
      throw error;
    }
  }

  // Create origin access identity for S3
  async createOriginAccessIdentity(comment) {
    const params = {
      CloudFrontOriginAccessIdentityConfig: {
        CallerReference: `oai-${Date.now()}`,
        Comment: comment || 'MusicConnect S3 Origin Access Identity'
      }
    };

    try {
      const result = await cloudfront.createCloudFrontOriginAccessIdentity(params).promise();
      console.log('Origin Access Identity created:', result.CloudFrontOriginAccessIdentity.Id);
      return result.CloudFrontOriginAccessIdentity;
    } catch (error) {
      console.error('Error creating Origin Access Identity:', error);
      throw error;
    }
  }

  // Get distribution statistics
  async getDistributionMetrics(startDate, endDate) {
    if (!this.distributionId) {
      return null;
    }

    const cloudwatch = new AWS.CloudWatch({
      region: 'us-east-1' // CloudFront metrics are in us-east-1
    });

    const params = {
      MetricName: 'BytesDownloaded',
      Namespace: 'AWS/CloudFront',
      Statistics: ['Sum'],
      Dimensions: [
        {
          Name: 'DistributionId',
          Value: this.distributionId
        }
      ],
      StartTime: startDate,
      EndTime: endDate,
      Period: 3600 // 1 hour
    };

    try {
      const result = await cloudwatch.getMetricStatistics(params).promise();
      return result.Datapoints;
    } catch (error) {
      console.error('Error getting CloudFront metrics:', error);
      throw error;
    }
  }

  // Generate streaming URL with quality selection
  generateStreamingUrl(baseUrl, quality = 'auto') {
    const url = new URL(baseUrl);
    
    if (quality !== 'auto') {
      // Modify URL to point to specific quality variant
      url.pathname = url.pathname.replace('master.m3u8', `${quality}/playlist.m3u8`);
    }
    
    // Add cache-busting parameter for live content
    if (url.pathname.includes('live')) {
      url.searchParams.set('_t', Date.now());
    }
    
    return url.toString();
  }

  // Configure CORS for distribution
  async configureCORS(allowedOrigins = ['*']) {
    const responseHeadersPolicy = {
      ResponseHeadersPolicyConfig: {
        Comment: 'MusicConnect CORS Policy',
        Name: `musicconnect-cors-${Date.now()}`,
        CorsConfig: {
          AccessControlAllowCredentials: false,
          AccessControlAllowHeaders: {
            Quantity: 4,
            Items: ['*', 'Authorization', 'Content-Type', 'Range']
          },
          AccessControlAllowMethods: {
            Quantity: 5,
            Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST']
          },
          AccessControlAllowOrigins: {
            Quantity: allowedOrigins.length,
            Items: allowedOrigins
          },
          AccessControlExposeHeaders: {
            Quantity: 2,
            Items: ['Content-Length', 'Content-Range']
          },
          AccessControlMaxAgeSec: 3600,
          OriginOverride: true
        }
      }
    };

    try {
      const result = await cloudfront.createResponseHeadersPolicy(responseHeadersPolicy).promise();
      console.log('CORS policy created:', result.ResponseHeadersPolicy.Id);
      return result.ResponseHeadersPolicy;
    } catch (error) {
      console.error('Error creating CORS policy:', error);
      throw error;
    }
  }
}

// Create singleton instance
const cloudFrontService = new CloudFrontService();

module.exports = cloudFrontService;