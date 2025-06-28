// Mock User model for testing without MongoDB
const bcrypt = require('bcryptjs');
const { USER_TYPES } = require('../../shared/types');

// In-memory storage for testing
let users = [];
let userIdCounter = 1;

// Initialize demo users
const initDemoUsers = async () => {
  // Wait for MockUser class to be defined
  setTimeout(async () => {
    const demoArtist = new MockUser({
    email: 'artist@demo.com',
    password: 'password123',
    username: 'demo_artist',
    displayName: 'Demo Artist',
    userType: 'artist',
    bio: 'I am a demo artist for testing purposes',
    location: { city: 'Demo City', country: 'Demo Country' },
    genres: ['Rock', 'Indie'],
    artistInfo: {
      stageName: 'The Demo Band',
      description: 'A demo artist account for testing the platform'
    }
  });
  
  const demoFan = new MockUser({
    email: 'fan@demo.com',
    password: 'password123',
    username: 'demo_fan',
    displayName: 'Demo Fan',
    userType: 'fan',
    bio: 'I am a demo fan for testing purposes',
    location: { city: 'Demo City', country: 'Demo Country' },
    genres: ['Rock', 'Pop', 'Electronic'],
    fanInfo: {
      tier: 'casual',
      followedArtists: [],
      fanSince: new Date(),
      totalSpent: 0
    }
  });
  
    await demoArtist.save();
    await demoFan.save();
  }, 100);
};

// Initialize demo users on module load
initDemoUsers();

class MockUser {
  constructor(userData) {
    this._id = userIdCounter++;
    this.email = userData.email;
    this.password = userData.password;
    this.username = userData.username;
    this.displayName = userData.displayName;
    this.userType = userData.userType;
    this.bio = userData.bio || '';
    this.location = userData.location || { city: '', country: '' };
    this.genres = userData.genres || [];
    this.artistInfo = userData.artistInfo || null;
    this.fanInfo = userData.fanInfo || null;
    this.stats = userData.stats || { followers: 0, following: 0, posts: 0, discoveries: 0 };
    this.isActive = true;
    this.emailVerified = false;
    this.lastLogin = new Date();
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  async save() {
    // Hash password if it's modified
    if (this.password && !this.password.startsWith('$2')) {
      const saltRounds = 12;
      this.password = await bcrypt.hash(this.password, saltRounds);
    }
    
    // Save to in-memory array
    const existingIndex = users.findIndex(u => u._id === this._id);
    if (existingIndex >= 0) {
      users[existingIndex] = this;
    } else {
      users.push(this);
    }
    return this;
  }

  async comparePassword(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  }

  toPublicProfile() {
    const user = { ...this };
    delete user.password;
    delete user.email;
    return user;
  }

  static async findOne(query) {
    const user = users.find(user => {
      if (query.$or) {
        return query.$or.some(condition => {
          return Object.keys(condition).every(key => user[key] === condition[key]);
        });
      }
      return Object.keys(query).every(key => user[key] === query[key]);
    });
    
    // Return a chainable object with select method
    if (user) {
      return {
        ...user,
        select: function(fields) {
          if (fields.startsWith('-password')) {
            const result = { ...this };
            delete result.password;
            delete result.select;
            return result;
          }
          return this;
        }
      };
    }
    return user;
  }

  static async findById(id) {
    return users.find(user => user._id == id);
  }
  
  static findById(id) {
    // Non-async version for auth middleware
    return users.find(user => user._id == id);
  }

  static async find(query = {}) {
    return users.filter(user => {
      return Object.keys(query).every(key => {
        if (key === '_id' && query[key].$ne) {
          return user._id !== query[key].$ne;
        }
        return user[key] === query[key];
      });
    });
  }
}

module.exports = MockUser;

