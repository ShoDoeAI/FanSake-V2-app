const AWS = require('aws-sdk');

// CDN Configuration for CloudFront
const cloudfront = new AWS.CloudFront({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

class CDNManager {
  constructor() {
    this.distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
    this.s3Bucket = process.env.S3_BUCKET_NAME;
    this.cdnDomain = process.env.CDN_DOMAIN || 'cdn.musicconnect.com';
  }

  // Generate CDN URL for assets
  getCDNUrl(path, options = {}) {
    const {
      secure = true,
      version = null,
      transform = null,
    } = options;

    const protocol = secure ? 'https' : 'http';
    let url = `${protocol}://${this.cdnDomain}/${path}`;

    // Add version for cache busting
    if (version) {
      url += `?v=${version}`;
    }

    // Add transformation parameters for images
    if (transform) {
      const params = new URLSearchParams(transform);
      url += (version ? '&' : '?') + params.toString();
    }

    return url;
  }

  // Invalidate CDN cache
  async invalidateCache(paths) {
    if (!this.distributionId) {
      console.warn('CloudFront distribution ID not configured');
      return null;
    }

    const params = {
      DistributionId: this.distributionId,
      InvalidationBatch: {
        CallerReference: Date.now().toString(),
        Paths: {
          Quantity: paths.length,
          Items: paths.map(path => path.startsWith('/') ? path : `/${path}`),
        },
      },
    };

    try {
      const result = await cloudfront.createInvalidation(params).promise();
      console.log('CDN cache invalidated:', result.Invalidation.Id);
      return result.Invalidation;
    } catch (error) {
      console.error('CDN invalidation error:', error);
      throw error;
    }
  }

  // Get CDN distribution metrics
  async getMetrics(startTime, endTime) {
    const params = {
      DistributionId: this.distributionId,
      StartTime: startTime,
      EndTime: endTime,
      Granularity: 'DAILY',
      Statistics: ['Average', 'Sum'],
      Metrics: ['BytesDownloaded', 'BytesUploaded', 'Requests', 'ErrorRate'],
    };

    try {
      const result = await cloudfront.getMetricStatistics(params).promise();
      return result.MetricStatistics;
    } catch (error) {
      console.error('CDN metrics error:', error);
      return null;
    }
  }

  // Configure CDN behaviors
  async updateBehaviors(behaviors) {
    // Get current distribution config
    const getParams = {
      Id: this.distributionId,
    };

    try {
      const { Distribution, ETag } = await cloudfront.getDistribution(getParams).promise();
      const config = Distribution.DistributionConfig;

      // Update behaviors
      behaviors.forEach(behavior => {
        const existingBehavior = config.CacheBehaviors.Items.find(
          b => b.PathPattern === behavior.PathPattern
        );

        if (existingBehavior) {
          Object.assign(existingBehavior, behavior);
        } else {
          config.CacheBehaviors.Items.push(behavior);
          config.CacheBehaviors.Quantity++;
        }
      });

      // Update distribution
      const updateParams = {
        Id: this.distributionId,
        IfMatch: ETag,
        DistributionConfig: config,
      };

      const result = await cloudfront.updateDistribution(updateParams).promise();
      console.log('CDN behaviors updated');
      return result;
    } catch (error) {
      console.error('CDN behavior update error:', error);
      throw error;
    }
  }

  // Generate optimized cache behaviors
  generateCacheBehaviors() {
    return [
      {
        PathPattern: '/api/*',
        TargetOriginId: 'api-origin',
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
          Quantity: 7,
          Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
          CachedMethods: {
            Quantity: 3,
            Items: ['GET', 'HEAD', 'OPTIONS'],
          },
        },
        Compress: true,
        DefaultTTL: 0,
        MaxTTL: 31536000,
        MinTTL: 0,
        ForwardedValues: {
          QueryString: true,
          Headers: {
            Quantity: 4,
            Items: ['Authorization', 'Accept', 'Content-Type', 'Origin'],
          },
          Cookies: {
            Forward: 'all',
          },
        },
      },
      {
        PathPattern: '/images/*',
        TargetOriginId: 's3-origin',
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
          Quantity: 2,
          Items: ['GET', 'HEAD'],
        },
        Compress: true,
        DefaultTTL: 86400,
        MaxTTL: 31536000,
        MinTTL: 0,
        ForwardedValues: {
          QueryString: true,
          Headers: {
            Quantity: 0,
          },
          Cookies: {
            Forward: 'none',
          },
        },
        LambdaFunctionAssociations: {
          Quantity: 1,
          Items: [{
            LambdaFunctionARN: process.env.IMAGE_OPTIMIZER_LAMBDA_ARN,
            EventType: 'origin-response',
          }],
        },
      },
      {
        PathPattern: '/static/*',
        TargetOriginId: 's3-origin',
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
          Quantity: 2,
          Items: ['GET', 'HEAD'],
        },
        Compress: true,
        DefaultTTL: 31536000,
        MaxTTL: 31536000,
        MinTTL: 31536000,
        ForwardedValues: {
          QueryString: false,
          Headers: {
            Quantity: 0,
          },
          Cookies: {
            Forward: 'none',
          },
        },
      },
    ];
  }

  // Configure origin headers
  generateOriginHeaders() {
    return {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };
  }

  // Generate signed URL for private content
  generateSignedUrl(path, expiresIn = 3600) {
    const signer = new AWS.CloudFront.Signer(
      process.env.CLOUDFRONT_KEY_PAIR_ID,
      process.env.CLOUDFRONT_PRIVATE_KEY
    );

    const url = `https://${this.cdnDomain}/${path}`;
    const expires = Math.floor(Date.now() / 1000) + expiresIn;

    return signer.getSignedUrl({
      url: url,
      expires: expires,
    });
  }

  // Optimize images on the fly
  getOptimizedImageUrl(path, options = {}) {
    const {
      width,
      height,
      quality = 85,
      format = 'auto',
      fit = 'cover',
    } = options;

    const params = new URLSearchParams();
    if (width) params.append('w', width);
    if (height) params.append('h', height);
    if (quality !== 85) params.append('q', quality);
    if (format !== 'auto') params.append('f', format);
    if (fit !== 'cover') params.append('fit', fit);

    return this.getCDNUrl(path, { transform: params });
  }

  // Preload critical assets
  generatePreloadHeaders(assets) {
    return assets.map(asset => {
      const parts = [`<${this.getCDNUrl(asset.path)}>`, `rel=preload`];
      
      if (asset.as) parts.push(`as=${asset.as}`);
      if (asset.type) parts.push(`type=${asset.type}`);
      if (asset.crossorigin) parts.push('crossorigin');
      
      return parts.join('; ');
    }).join(', ');
  }
}

// Edge function configurations
const edgeFunctions = {
  // Image optimization edge function
  imageOptimizer: `
    exports.handler = async (event) => {
      const request = event.Records[0].cf.request;
      const response = event.Records[0].cf.response;
      
      // Parse query parameters
      const params = new URLSearchParams(request.querystring);
      const width = params.get('w');
      const height = params.get('h');
      const quality = params.get('q') || '85';
      const format = params.get('f') || 'auto';
      
      // Set appropriate headers
      response.headers['cache-control'] = [{
        key: 'Cache-Control',
        value: 'public, max-age=31536000, immutable'
      }];
      
      // Add image processing headers
      if (width || height) {
        response.headers['x-image-dimensions'] = [{
          key: 'X-Image-Dimensions',
          value: \`\${width || 'auto'}x\${height || 'auto'}\`
        }];
      }
      
      return response;
    };
  `,

  // Security headers edge function
  securityHeaders: `
    exports.handler = async (event) => {
      const response = event.Records[0].cf.response;
      const headers = response.headers;
      
      // Add security headers
      headers['strict-transport-security'] = [{
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
      }];
      
      headers['x-content-type-options'] = [{
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      }];
      
      headers['x-frame-options'] = [{
        key: 'X-Frame-Options',
        value: 'DENY'
      }];
      
      headers['x-xss-protection'] = [{
        key: 'X-XSS-Protection',
        value: '1; mode=block'
      }];
      
      headers['referrer-policy'] = [{
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin'
      }];
      
      headers['content-security-policy'] = [{
        key: 'Content-Security-Policy',
        value: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
      }];
      
      return response;
    };
  `,

  // A/B testing edge function
  abTesting: `
    exports.handler = async (event) => {
      const request = event.Records[0].cf.request;
      const headers = request.headers;
      
      // Check for existing variant cookie
      const cookies = headers.cookie || [];
      let variant = null;
      
      cookies.forEach(cookie => {
        if (cookie.value.includes('variant=')) {
          variant = cookie.value.match(/variant=([A-B])/)[1];
        }
      });
      
      // Assign variant if not exists
      if (!variant) {
        variant = Math.random() < 0.5 ? 'A' : 'B';
        headers.cookie = headers.cookie || [];
        headers.cookie.push({
          key: 'Cookie',
          value: \`variant=\${variant}\`
        });
      }
      
      // Route to appropriate origin
      if (variant === 'B') {
        request.origin.custom.domainName = 'beta.musicconnect.com';
      }
      
      return request;
    };
  `,
};

module.exports = {
  CDNManager: new CDNManager(),
  edgeFunctions,
};