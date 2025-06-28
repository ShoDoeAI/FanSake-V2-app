// Mock authentication service for demo
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

export const mockLogin = async (email, password) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const account = DEMO_ACCOUNTS[email];
  
  if (!account) {
    throw new Error('Invalid email or password');
  }
  
  if (account.password !== password) {
    throw new Error('Invalid email or password');
  }
  
  // Generate mock token
  const token = btoa(JSON.stringify({ email, timestamp: Date.now() }));
  
  return {
    data: {
      message: 'Login successful',
      user: account.user,
      token
    }
  };
};

export const mockRegister = async (userData) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Check if email already exists
  if (DEMO_ACCOUNTS[userData.email]) {
    throw new Error('User already exists');
  }
  
  // Create new user
  const newUser = {
    _id: Date.now().toString(),
    email: userData.email,
    username: userData.username,
    displayName: userData.displayName,
    userType: userData.userType,
    bio: userData.bio || '',
    ...(userData.userType === 'artist' ? {
      artistInfo: {
        stageName: userData.artistInfo?.stageName || userData.displayName,
        description: userData.artistInfo?.description || ''
      }
    } : {
      fanInfo: {
        tier: 'casual',
        followedArtists: [],
        fanSince: new Date().toISOString()
      }
    })
  };
  
  // Generate mock token
  const token = btoa(JSON.stringify({ email: userData.email, timestamp: Date.now() }));
  
  return {
    data: {
      message: 'Registration successful',
      user: newUser,
      token
    }
  };
};

export const mockVerify = async () => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  
  if (!token || !userStr) {
    throw new Error('No token found');
  }
  
  const user = JSON.parse(userStr);
  
  return {
    data: {
      message: 'Token valid',
      user
    }
  };
};