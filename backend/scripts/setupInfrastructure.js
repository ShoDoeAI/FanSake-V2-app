require('dotenv').config();
const AWS = require('aws-sdk');
const s3Service = require('../config/aws');
const cloudFrontService = require('../services/cloudFrontService');

async function setupInfrastructure() {
  console.log('🚀 Setting up MusicConnect infrastructure...\n');

  try {
    // 1. Create S3 bucket
    console.log('1. Creating S3 bucket...');
    await s3Service.createBucketIfNotExists();
    console.log('✅ S3 bucket ready\n');

    // 2. Create CloudFront Origin Access Identity
    console.log('2. Creating CloudFront Origin Access Identity...');
    const oai = await cloudFrontService.createOriginAccessIdentity(
      'MusicConnect S3 Access'
    );
    console.log(`✅ OAI created: ${oai.Id}\n`);

    // 3. Update S3 bucket policy to allow CloudFront access
    console.log('3. Updating S3 bucket policy...');
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowCloudFrontAccess',
          Effect: 'Allow',
          Principal: {
            AWS: `arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${oai.Id}`
          },
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${process.env.AWS_S3_BUCKET}/*`
        }
      ]
    };

    const s3 = new AWS.S3();
    await s3.putBucketPolicy({
      Bucket: process.env.AWS_S3_BUCKET,
      Policy: JSON.stringify(bucketPolicy)
    }).promise();
    console.log('✅ Bucket policy updated\n');

    // 4. Create CloudFront distribution
    console.log('4. Creating CloudFront distribution...');
    console.log('⚠️  This may take 15-20 minutes to deploy globally...');
    
    const distribution = await cloudFrontService.createDistribution(
      process.env.AWS_S3_BUCKET
    );
    console.log(`✅ Distribution created: ${distribution.DomainName}`);
    console.log(`   Status: ${distribution.Status}`);
    console.log(`   ID: ${distribution.Id}\n`);

    // 5. Configure CORS for the distribution
    console.log('5. Configuring CORS policy...');
    const corsPolicy = await cloudFrontService.configureCORS([
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ]);
    console.log(`✅ CORS policy created: ${corsPolicy.Id}\n`);

    // 6. Create lifecycle rules for S3
    console.log('6. Setting up S3 lifecycle rules...');
    const lifecycleRules = {
      Rules: [
        {
          ID: 'ArchiveOldMedia',
          Status: 'Enabled',
          Transitions: [
            {
              Days: 30,
              StorageClass: 'STANDARD_IA'
            },
            {
              Days: 90,
              StorageClass: 'GLACIER'
            }
          ]
        },
        {
          ID: 'DeleteTempFiles',
          Status: 'Enabled',
          Prefix: 'temp/',
          Expiration: {
            Days: 1
          }
        }
      ]
    };

    await s3.putBucketLifecycleConfiguration({
      Bucket: process.env.AWS_S3_BUCKET,
      LifecycleConfiguration: lifecycleRules
    }).promise();
    console.log('✅ Lifecycle rules configured\n');

    // 7. Create S3 event notifications for processing
    console.log('7. Setting up S3 event notifications...');
    // This would typically trigger Lambda functions for processing
    console.log('⚠️  S3 event notifications require Lambda setup\n');

    // Print summary
    console.log('========================================');
    console.log('🎉 Infrastructure setup complete!');
    console.log('========================================\n');
    console.log('Next steps:');
    console.log('1. Update .env with:');
    console.log(`   CLOUDFRONT_DOMAIN=${distribution.DomainName}`);
    console.log(`   CLOUDFRONT_DISTRIBUTION_ID=${distribution.Id}`);
    console.log(`   CLOUDFRONT_OAI_ID=${oai.Id}`);
    console.log('\n2. Wait for CloudFront distribution to deploy (15-20 minutes)');
    console.log('3. Test upload functionality');
    console.log('4. Configure custom domain (optional)');
    console.log('\n⚠️  Important: Keep your AWS credentials secure!');

  } catch (error) {
    console.error('❌ Infrastructure setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupInfrastructure();
}

module.exports = setupInfrastructure;