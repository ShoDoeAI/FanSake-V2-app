const axios = require('axios');

async function testLogin() {
  console.log('Testing MusicConnect Login...\n');
  
  const credentials = {
    email: 'artist@demo.com',
    password: 'password123'
  };
  
  try {
    console.log('1. Testing login endpoint...');
    const response = await axios.post('http://localhost:5000/api/auth/login', credentials, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Login successful!');
    console.log('Response:', {
      message: response.data.message,
      user: {
        id: response.data.user._id,
        username: response.data.user.username,
        userType: response.data.user.userType,
        email: response.data.user.email
      },
      token: response.data.token ? '✓ Token received' : '✗ No token'
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Login failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Backend server is not running!');
      console.error('Please start the backend server first:');
      console.error('  cd /Users/sho/Code/Claude-Code/MusicConnect/backend');
      console.error('  npm start');
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run the test
testLogin();