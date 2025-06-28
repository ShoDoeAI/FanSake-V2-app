const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Test configuration
const API_BASE_URL = 'http://localhost:5000/api';
const TEST_CREDENTIALS = {
  email: 'artist@demo.com',
  password: 'password123'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

async function createTestFile(filename, content) {
  const filepath = path.join(__dirname, filename);
  fs.writeFileSync(filepath, content);
  return filepath;
}

async function loginAndGetToken() {
  try {
    console.log(`${colors.blue}Logging in as demo artist...${colors.reset}`);
    const response = await axios.post(`${API_BASE_URL}/auth/login`, TEST_CREDENTIALS);
    console.log(`${colors.green}✓ Login successful${colors.reset}`);
    return response.data.token;
  } catch (error) {
    console.error(`${colors.red}✗ Login failed:${colors.reset}`, error.response?.data || error.message);
    throw error;
  }
}

async function testFileUpload(token, type, filepath, metadata) {
  try {
    console.log(`${colors.blue}Testing ${type} upload...${colors.reset}`);
    
    const form = new FormData();
    form.append('file', fs.createReadStream(filepath));
    
    // Add metadata
    Object.entries(metadata).forEach(([key, value]) => {
      form.append(key, value);
    });

    const response = await axios.post(
      `${API_BASE_URL}/uploads/${type}`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log(`${colors.green}✓ ${type} upload successful:${colors.reset}`, response.data);
    return response.data;
  } catch (error) {
    console.error(`${colors.red}✗ ${type} upload failed:${colors.reset}`, error.response?.data || error.message);
    throw error;
  }
}

async function testGetUploads(token) {
  try {
    console.log(`${colors.blue}Fetching uploaded files...${colors.reset}`);
    const response = await axios.get(`${API_BASE_URL}/uploads/my-uploads`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log(`${colors.green}✓ Fetched uploads:${colors.reset}`);
    console.log(`  - Music: ${response.data.uploads.music.length} files`);
    console.log(`  - Images: ${response.data.uploads.images.length} files`);
    console.log(`  - Videos: ${response.data.uploads.videos.length} files`);
    return response.data.uploads;
  } catch (error) {
    console.error(`${colors.red}✗ Failed to fetch uploads:${colors.reset}`, error.response?.data || error.message);
    throw error;
  }
}

async function runTests() {
  console.log(`${colors.yellow}=== Music Connect File Upload Test ===${colors.reset}\n`);

  try {
    // Step 1: Login
    const token = await loginAndGetToken();
    console.log();

    // Step 2: Create test files
    console.log(`${colors.blue}Creating test files...${colors.reset}`);
    const testMusicPath = await createTestFile('test-song.txt', 'This is a test music file content');
    const testImagePath = await createTestFile('test-image.txt', 'This is a test image file content');
    const testVideoPath = await createTestFile('test-video.txt', 'This is a test video file content');
    console.log(`${colors.green}✓ Test files created${colors.reset}\n`);

    // Step 3: Test music upload
    await testFileUpload(token, 'music', testMusicPath, {
      title: 'Test Song',
      description: 'A test music upload',
      tier: 'free',
      genre: 'Electronic'
    });
    console.log();

    // Step 4: Test image upload
    await testFileUpload(token, 'image', testImagePath, {
      title: 'Test Album Cover',
      description: 'A test image upload',
      imageType: 'gallery'
    });
    console.log();

    // Step 5: Test video upload
    await testFileUpload(token, 'video', testVideoPath, {
      title: 'Test Music Video',
      description: 'A test video upload',
      tier: 'supporter'
    });
    console.log();

    // Step 6: Get all uploads
    const uploads = await testGetUploads(token);
    console.log();

    // Clean up test files
    fs.unlinkSync(testMusicPath);
    fs.unlinkSync(testImagePath);
    fs.unlinkSync(testVideoPath);

    console.log(`${colors.green}=== All tests passed! ===${colors.reset}`);
    console.log(`\n${colors.yellow}Summary:${colors.reset}`);
    console.log('The file upload system is working correctly.');
    console.log('Artists can upload music, images, and videos with metadata.');
    console.log('The uploads are stored and can be retrieved via the API.');

  } catch (error) {
    console.error(`${colors.red}Test failed:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Check if server is running
axios.get(`${API_BASE_URL}/health`)
  .then(() => {
    console.log(`${colors.green}✓ Server is running${colors.reset}\n`);
    runTests();
  })
  .catch(() => {
    console.error(`${colors.red}✗ Server is not running${colors.reset}`);
    console.log(`${colors.yellow}Please start the server first:${colors.reset}`);
    console.log('  cd backend && npm start\n');
    process.exit(1);
  });