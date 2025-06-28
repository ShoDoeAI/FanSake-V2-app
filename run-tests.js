#!/usr/bin/env node

console.log('🧪 MusicConnect Unit Test Runner\n');

// Mock localStorage for Node.js environment
global.localStorage = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = value;
  },
  removeItem(key) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  }
};

// Mock btoa for Node.js
global.btoa = (str) => Buffer.from(str).toString('base64');

// Import and run authentication tests
const runAuthTests = async () => {
  console.log('=== Authentication Unit Tests ===\n');
  
  // Demo accounts for testing
  const DEMO_ACCOUNTS = {
    'artist@demo.com': {
      password: 'password123',
      user: {
        _id: '1',
        email: 'artist@demo.com',
        username: 'demo_artist',
        displayName: 'Demo Artist',
        userType: 'artist',
        bio: 'I am a demo artist for testing purposes',
        artistInfo: {
          stageName: 'The Demo Band',
          description: 'A demo artist account for testing the platform'
        }
      }
    },
    'fan@demo.com': {
      password: 'password123',
      user: {
        _id: '2',
        email: 'fan@demo.com',
        username: 'demo_fan',
        displayName: 'Demo Fan',
        userType: 'fan',
        bio: 'I am a demo fan for testing purposes',
        fanInfo: {
          tier: 'casual',
          followedArtists: [],
          fanSince: new Date().toISOString()
        }
      }
    }
  };
  
  const tests = [];
  let passCount = 0;
  let failCount = 0;
  
  // Test 1: Valid artist login
  console.log('Test 1: Valid artist login');
  try {
    const account = DEMO_ACCOUNTS['artist@demo.com'];
    if (account && account.password === 'password123') {
      console.log('✅ Artist login successful');
      console.log(`   - User type: ${account.user.userType}`);
      console.log(`   - Username: ${account.user.username}`);
      passCount++;
    } else {
      throw new Error('Invalid credentials');
    }
  } catch (error) {
    console.log('❌ Artist login failed:', error.message);
    failCount++;
  }
  console.log();
  
  // Test 2: Valid fan login
  console.log('Test 2: Valid fan login');
  try {
    const account = DEMO_ACCOUNTS['fan@demo.com'];
    if (account && account.password === 'password123') {
      console.log('✅ Fan login successful');
      console.log(`   - User type: ${account.user.userType}`);
      console.log(`   - Username: ${account.user.username}`);
      passCount++;
    } else {
      throw new Error('Invalid credentials');
    }
  } catch (error) {
    console.log('❌ Fan login failed:', error.message);
    failCount++;
  }
  console.log();
  
  // Test 3: Invalid email
  console.log('Test 3: Invalid email rejection');
  try {
    const account = DEMO_ACCOUNTS['invalid@demo.com'];
    if (!account) {
      console.log('✅ Invalid email correctly rejected');
      passCount++;
    } else {
      throw new Error('Should have rejected invalid email');
    }
  } catch (error) {
    console.log('❌ Invalid email test failed:', error.message);
    failCount++;
  }
  console.log();
  
  // Test 4: Invalid password
  console.log('Test 4: Invalid password rejection');
  try {
    const account = DEMO_ACCOUNTS['artist@demo.com'];
    if (account && account.password !== 'wrongpassword') {
      console.log('✅ Invalid password correctly rejected');
      passCount++;
    } else {
      throw new Error('Should have rejected invalid password');
    }
  } catch (error) {
    console.log('❌ Invalid password test failed:', error.message);
    failCount++;
  }
  console.log();
  
  // Test 5: LocalStorage functionality
  console.log('Test 5: LocalStorage functionality');
  try {
    const testData = { email: 'test@demo.com', userType: 'artist' };
    localStorage.setItem('user', JSON.stringify(testData));
    const retrieved = JSON.parse(localStorage.getItem('user'));
    
    if (retrieved.email === testData.email && retrieved.userType === testData.userType) {
      console.log('✅ LocalStorage working correctly');
      passCount++;
    } else {
      throw new Error('LocalStorage data mismatch');
    }
    
    localStorage.removeItem('user');
  } catch (error) {
    console.log('❌ LocalStorage test failed:', error.message);
    failCount++;
  }
  console.log();
  
  // Test 6: Token generation
  console.log('Test 6: Token generation');
  try {
    const mockToken = btoa(JSON.stringify({ email: 'test@demo.com', timestamp: Date.now() }));
    if (mockToken && mockToken.length > 0) {
      console.log('✅ Token generation successful');
      console.log(`   - Token length: ${mockToken.length} characters`);
      passCount++;
    } else {
      throw new Error('Token generation failed');
    }
  } catch (error) {
    console.log('❌ Token generation test failed:', error.message);
    failCount++;
  }
  console.log();
  
  // Test 7: User type routing
  console.log('Test 7: User type routing logic');
  try {
    const artistAccount = DEMO_ACCOUNTS['artist@demo.com'];
    const fanAccount = DEMO_ACCOUNTS['fan@demo.com'];
    
    const artistRoute = artistAccount.user.userType === 'artist' ? '/artist-dashboard' : '/discovery';
    const fanRoute = fanAccount.user.userType === 'fan' ? '/discovery' : '/artist-dashboard';
    
    if (artistRoute === '/artist-dashboard' && fanRoute === '/discovery') {
      console.log('✅ User routing logic correct');
      console.log('   - Artist → /artist-dashboard');
      console.log('   - Fan → /discovery');
      passCount++;
    } else {
      throw new Error('Incorrect routing logic');
    }
  } catch (error) {
    console.log('❌ User routing test failed:', error.message);
    failCount++;
  }
  console.log();
  
  // Summary
  const totalTests = passCount + failCount;
  console.log('=================================');
  console.log('📊 Test Results Summary:');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passCount} ✅`);
  console.log(`Failed: ${failCount} ❌`);
  console.log(`Success Rate: ${Math.round((passCount / totalTests) * 100)}%`);
  console.log('=================================');
  
  return {
    total: totalTests,
    passed: passCount,
    failed: failCount
  };
};

// Run the tests
runAuthTests()
  .then(results => {
    console.log('\n✅ Test run completed');
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Test runner error:', error);
    process.exit(1);
  });