const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { MessageConversation } = require('../models/DirectMessage');
const redisClient = require('../config/redis');

let io;

const initializeWebSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId)
        .select('_id username role tier profile');
      
      if (!user) {
        return next(new Error('User not found'));
      }
      
      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });
  
  // Connection handler
  io.on('connection', async (socket) => {
    console.log(`User ${socket.userId} connected`);
    
    // Join user's personal room
    socket.join(`user:${socket.userId}`);
    
    // Store socket ID in Redis for cross-server communication
    await redisClient.setex(
      `socket:${socket.userId}`,
      300, // 5 minutes TTL
      socket.id
    );
    
    // Update user's online status
    await updateUserStatus(socket.userId, 'online');
    
    // Join existing conversations
    await joinUserConversations(socket);
    
    // Handle joining rooms
    socket.on('join_room', async (roomId) => {
      try {
        // Validate user can join this room
        const canJoin = await validateRoomAccess(socket.userId, roomId);
        
        if (canJoin) {
          socket.join(roomId);
          socket.emit('joined_room', { roomId, success: true });
          
          // Notify others in room
          socket.to(roomId).emit('user_joined', {
            userId: socket.userId,
            username: socket.user.username,
            roomId
          });
        } else {
          socket.emit('join_error', { 
            roomId, 
            error: 'Access denied' 
          });
        }
      } catch (error) {
        socket.emit('join_error', { 
          roomId, 
          error: error.message 
        });
      }
    });
    
    // Handle leaving rooms
    socket.on('leave_room', (roomId) => {
      socket.leave(roomId);
      socket.to(roomId).emit('user_left', {
        userId: socket.userId,
        username: socket.user.username,
        roomId
      });
    });
    
    // Handle typing indicators
    socket.on('typing_start', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        userId: socket.userId,
        username: socket.user.username,
        conversationId
      });
    });
    
    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
        userId: socket.userId,
        conversationId
      });
    });
    
    // Handle presence updates
    socket.on('presence_update', async ({ status }) => {
      await updateUserStatus(socket.userId, status);
      
      // Notify friends/contacts
      socket.broadcast.emit('user_presence', {
        userId: socket.userId,
        status
      });
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`User ${socket.userId} disconnected`);
      
      // Remove from Redis
      await redisClient.del(`socket:${socket.userId}`);
      
      // Update user's offline status with timestamp
      await updateUserStatus(socket.userId, 'offline');
      
      // Notify all rooms user was in
      const rooms = Array.from(socket.rooms);
      rooms.forEach(room => {
        if (room !== socket.id && room !== `user:${socket.userId}`) {
          socket.to(room).emit('user_left', {
            userId: socket.userId,
            username: socket.user.username
          });
        }
      });
    });
    
    // Custom events for specific features
    
    // Live listening party events
    socket.on('party:create', async (partyData) => {
      try {
        const party = await createListeningParty(socket.userId, partyData);
        socket.emit('party:created', party);
      } catch (error) {
        socket.emit('party:error', { error: error.message });
      }
    });
    
    socket.on('party:join', async ({ partyId }) => {
      try {
        const party = await joinListeningParty(socket.userId, partyId);
        socket.join(`party:${partyId}`);
        
        // Notify all party members
        io.to(`party:${partyId}`).emit('party:user_joined', {
          userId: socket.userId,
          username: socket.user.username,
          party
        });
      } catch (error) {
        socket.emit('party:error', { error: error.message });
      }
    });
    
    socket.on('party:sync', ({ partyId, timestamp, isPlaying }) => {
      // Broadcast playback sync to all party members
      socket.to(`party:${partyId}`).emit('party:sync_update', {
        timestamp,
        isPlaying,
        syncedBy: socket.userId
      });
    });
    
    socket.on('party:chat', ({ partyId, message }) => {
      // Broadcast chat message to party
      io.to(`party:${partyId}`).emit('party:new_message', {
        userId: socket.userId,
        username: socket.user.username,
        message,
        timestamp: new Date()
      });
    });
    
    // Virtual backstage events
    socket.on('backstage:enter', async ({ artistId }) => {
      try {
        const canEnter = await validateBackstageAccess(socket.userId, artistId);
        
        if (canEnter) {
          socket.join(`backstage:${artistId}`);
          
          // Notify artist and other fans
          io.to(`backstage:${artistId}`).emit('backstage:fan_entered', {
            userId: socket.userId,
            username: socket.user.username,
            tier: socket.user.tier
          });
        } else {
          socket.emit('backstage:access_denied');
        }
      } catch (error) {
        socket.emit('backstage:error', { error: error.message });
      }
    });
    
    // Live stream events
    socket.on('stream:start', async (streamData) => {
      try {
        if (socket.user.role !== 'artist') {
          throw new Error('Only artists can start streams');
        }
        
        const stream = await createLiveStream(socket.userId, streamData);
        socket.emit('stream:started', stream);
        
        // Notify fans
        await notifyFansOfLiveStream(socket.userId, stream);
      } catch (error) {
        socket.emit('stream:error', { error: error.message });
      }
    });
    
    socket.on('stream:join', async ({ streamId }) => {
      try {
        const stream = await joinLiveStream(socket.userId, streamId);
        socket.join(`stream:${streamId}`);
        
        // Update viewer count
        io.to(`stream:${streamId}`).emit('stream:viewer_update', {
          viewerCount: stream.viewerCount,
          newViewer: {
            userId: socket.userId,
            username: socket.user.username
          }
        });
      } catch (error) {
        socket.emit('stream:error', { error: error.message });
      }
    });
    
    socket.on('stream:reaction', ({ streamId, reaction }) => {
      // Broadcast reaction to all viewers
      io.to(`stream:${streamId}`).emit('stream:new_reaction', {
        userId: socket.userId,
        username: socket.user.username,
        reaction,
        timestamp: new Date()
      });
    });
  });
  
  return io;
};

// Helper functions
async function updateUserStatus(userId, status) {
  try {
    await User.findByIdAndUpdate(userId, {
      'presence.status': status,
      'presence.lastSeen': new Date()
    });
    
    // Store in Redis for quick access
    await redisClient.setex(
      `presence:${userId}`,
      300, // 5 minutes
      JSON.stringify({ status, lastSeen: new Date() })
    );
  } catch (error) {
    console.error('Error updating user status:', error);
  }
}

async function joinUserConversations(socket) {
  try {
    const conversations = await MessageConversation.find({
      'participants.user': socket.userId,
      'metadata.isActive': true
    }).select('_id');
    
    conversations.forEach(conv => {
      socket.join(`conversation:${conv._id}`);
    });
  } catch (error) {
    console.error('Error joining conversations:', error);
  }
}

async function validateRoomAccess(userId, roomId) {
  // Implement room access validation logic
  // For now, return true for all valid room formats
  if (roomId.startsWith('conversation:') || 
      roomId.startsWith('party:') || 
      roomId.startsWith('stream:') ||
      roomId.startsWith('backstage:')) {
    return true;
  }
  
  return false;
}

async function validateBackstageAccess(userId, artistId) {
  try {
    const user = await User.findById(userId);
    
    // Check if user is a superfan of this artist
    if (user.tier !== 'superfan') {
      return false;
    }
    
    // Additional checks for artist subscription status
    // Would check if user is subscribed to this specific artist
    
    return true;
  } catch (error) {
    return false;
  }
}

async function createListeningParty(userId, partyData) {
  // Implementation for creating listening party
  // Would create party in database and return party object
  return {
    id: `party_${Date.now()}`,
    host: userId,
    ...partyData,
    participants: [userId],
    createdAt: new Date()
  };
}

async function joinListeningParty(userId, partyId) {
  // Implementation for joining listening party
  // Would update party in database and return updated party
  return {
    id: partyId,
    participants: [], // Would be fetched from DB
    currentTrack: null,
    playbackState: {}
  };
}

async function createLiveStream(artistId, streamData) {
  // Implementation for creating live stream
  return {
    id: `stream_${Date.now()}`,
    artistId,
    ...streamData,
    viewerCount: 0,
    startedAt: new Date()
  };
}

async function joinLiveStream(userId, streamId) {
  // Implementation for joining live stream
  // Would update stream viewer count and return stream data
  return {
    id: streamId,
    viewerCount: 1, // Would be incremented in DB
    isLive: true
  };
}

async function notifyFansOfLiveStream(artistId, stream) {
  // Implementation to notify fans when artist goes live
  // Would send notifications to all subscribed fans
}

// Export functions
const getIO = () => {
  if (!io) {
    throw new Error('WebSocket not initialized');
  }
  return io;
};

const emitToUser = async (userId, event, data) => {
  const io = getIO();
  io.to(`user:${userId}`).emit(event, data);
};

const emitToRoom = async (roomId, event, data) => {
  const io = getIO();
  io.to(roomId).emit(event, data);
};

const getUserSocketId = async (userId) => {
  const socketId = await redisClient.get(`socket:${userId}`);
  return socketId;
};

module.exports = {
  initializeWebSocket,
  getIO,
  emitToUser,
  emitToRoom,
  getUserSocketId,
  io
};