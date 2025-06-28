const AWS = require('aws-sdk');

// Configure AWS S3 (using mock for development)
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock-access-key',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock-secret-key',
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_S3_ENDPOINT || undefined,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'musicconnect-dev';

const uploadToS3 = async (file, key) => {
  // In development/demo mode, just return a mock URL
  if (process.env.NODE_ENV !== 'production') {
    return {
      Location: `https://mock-s3.example.com/${key}`,
      Key: key,
      Bucket: BUCKET_NAME
    };
  }

  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  };

  try {
    const result = await s3.upload(params).promise();
    return result;
  } catch (error) {
    console.error('S3 upload error:', error);
    throw error;
  }
};

const deleteFromS3 = async (key) => {
  // In development/demo mode, just return success
  if (process.env.NODE_ENV !== 'production') {
    return { success: true };
  }

  const params = {
    Bucket: BUCKET_NAME,
    Key: key
  };

  try {
    await s3.deleteObject(params).promise();
    return { success: true };
  } catch (error) {
    console.error('S3 delete error:', error);
    throw error;
  }
};

const getSignedUrl = async (key, expiresIn = 3600) => {
  // In development/demo mode, return mock URL
  if (process.env.NODE_ENV !== 'production') {
    return `https://mock-s3.example.com/${key}?expires=${Date.now() + expiresIn * 1000}`;
  }

  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: expiresIn
  };

  try {
    return await s3.getSignedUrlPromise('getObject', params);
  } catch (error) {
    console.error('S3 signed URL error:', error);
    throw error;
  }
};

module.exports = {
  uploadToS3,
  deleteFromS3,
  getSignedUrl,
  s3,
  BUCKET_NAME
};