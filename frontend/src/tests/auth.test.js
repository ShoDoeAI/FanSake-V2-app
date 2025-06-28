// Unit tests for MusicConnect authentication
import { mockLogin, mockRegister, mockVerify } from '../services/mockAuth';

// Test utilities
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`❌ Test failed: ${message}`);
  }
};

const runTest = async (testName, testFn) => {
  try {
    await testFn();
    console.log(`✅ ${testName}`);
    return { name: testName, passed: true };
  } catch (error) {
    console.error(`❌ ${testName}: ${error.message}`);
    return { name: testName, passed: false, error: error.message };
  }
};

// Test suite
const runAuthTests = async () => {
  console.log('🧪 Running MusicConnect Authentication Tests...\n');
  
  const results = [];
  
  // Test 1: Valid artist login
  results.push(await runTest('Valid artist login', async () => {
    const response = await mockLogin('artist@demo.com', 'password123');
    assert(response.data, 'Response should have data');
    assert(response.data.token, 'Response should include token');
    assert(response.data.user, 'Response should include user');
    assert(response.data.user.userType === 'artist', 'User type should be artist');
    assert(response.data.user.email === 'artist@demo.com', 'Email should match');
  }));
  
  // Test 2: Valid fan login
  results.push(await runTest('Valid fan login', async () => {
    const response = await mockLogin('fan@demo.com', 'password123');
    assert(response.data, 'Response should have data');
    assert(response.data.token, 'Response should include token');
    assert(response.data.user, 'Response should include user');
    assert(response.data.user.userType === 'fan', 'User type should be fan');
    assert(response.data.user.email === 'fan@demo.com', 'Email should match');
  }));
  
  // Test 3: Invalid email
  results.push(await runTest('Invalid email rejection', async () => {
    try {
      await mockLogin('invalid@demo.com', 'password123');
      assert(false, 'Should have thrown error for invalid email');
    } catch (error) {
      assert(error.message === 'Invalid email or password', 'Error message should match');
    }
  }));
  
  // Test 4: Invalid password
  results.push(await runTest('Invalid password rejection', async () => {
    try {
      await mockLogin('artist@demo.com', 'wrongpassword');
      assert(false, 'Should have thrown error for invalid password');
    } catch (error) {
      assert(error.message === 'Invalid email or password', 'Error message should match');
    }
  }));
  
  // Test 5: Registration with new user
  results.push(await runTest('New user registration', async () => {
    const newUser = {
      email: 'newartist@test.com',
      password: 'testpass123',
      username: 'newartist',
      displayName: 'New Artist',
      userType: 'artist',
      bio: 'Test bio'
    };
    
    const response = await mockRegister(newUser);
    assert(response.data, 'Response should have data');
    assert(response.data.token, 'Response should include token');
    assert(response.data.user, 'Response should include user');
    assert(response.data.user.email === newUser.email, 'Email should match');
    assert(response.data.user.userType === 'artist', 'User type should be artist');
  }));
  
  // Test 6: Registration with existing email
  results.push(await runTest('Duplicate email rejection', async () => {
    try {
      await mockRegister({
        email: 'artist@demo.com',
        password: 'password123',
        username: 'duplicate',
        displayName: 'Duplicate User',
        userType: 'artist'
      });
      assert(false, 'Should have thrown error for duplicate email');
    } catch (error) {
      assert(error.message === 'User already exists', 'Error message should match');
    }
  }));
  
  // Test 7: Token verification
  results.push(await runTest('Token verification', async () => {
    // Setup: Store mock token and user
    const mockUser = { email: 'artist@demo.com', userType: 'artist' };
    localStorage.setItem('token', 'mock-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    
    const response = await mockVerify();
    assert(response.data, 'Response should have data');
    assert(response.data.user, 'Response should include user');
    assert(response.data.user.email === mockUser.email, 'User email should match');
    
    // Cleanup
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }));
  
  // Test 8: Token verification failure
  results.push(await runTest('Token verification failure', async () => {
    // Ensure no token exists
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    try {
      await mockVerify();
      assert(false, 'Should have thrown error for missing token');
    } catch (error) {
      assert(error.message === 'No token found', 'Error message should match');
    }
  }));
  
  // Summary
  console.log('\n📊 Test Results Summary:');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`- ${r.name}: ${r.error}`);
    });
  }
  
  return {
    total: results.length,
    passed,
    failed,
    results
  };
};

// Export for use in other files
export { runAuthTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined') {
  window.runAuthTests = runAuthTests;
  console.log('Auth tests loaded. Run window.runAuthTests() in console to execute.');
}