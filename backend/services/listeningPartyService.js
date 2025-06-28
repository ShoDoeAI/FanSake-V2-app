const ListeningParty = require('../models/ListeningParty');
const Track = require('../models/Track');
const User = require('../models/User');
const { getIO } = require('../websocket');
const notificationService = require('./notificationService');
const redisClient = require('../config/redis');

class ListeningPartyService {
  async createParty(hostId, partyData) {
    try {
      const host = await User.findById(hostId);
      
      // Validate playlist tracks exist
      if (partyData.playlist && partyData.playlist.length > 0) {
        const trackIds = partyData.playlist.map(item => item.trackId);
        const tracks = await Track.find({ _id: { $in: trackIds } });
        
        if (tracks.length !== trackIds.length) {
          throw new Error('One or more tracks not found');
        }
        
        partyData.playlist = trackIds.map(trackId => ({
          track: trackId,
          addedBy: hostId
        }));
      }
      
      // Create party
      const party = await ListeningParty.create({
        host: hostId,
        title: partyData.title,
        description: partyData.description,
        coverImage: partyData.coverImage,
        settings: {
          ...partyData.settings,
          tierRequired: partyData.tierRequired || null
        },
        playlist: partyData.playlist || [],
        participants: [{
          user: hostId,
          role: 'host',
          isActive: true
        }],
        status: partyData.scheduledStart ? 'scheduled' : 'live',
        startedAt: partyData.scheduledStart ? null : new Date()
      });
      
      // Set first track if starting immediately
      if (party.status === 'live' && party.playlist.length > 0) {
        party.playback.currentTrack = party.playlist[0].track;
      }
      
      await party.save();
      
      // Notify followers if public
      if (party.settings.isPublic) {
        await this.notifyFollowersOfParty(host, party);
      }
      
      // Cache party data for quick access
      await this.cachePartyData(party);
      
      return party.populate('playlist.track', 'title artist duration coverArt');
    } catch (error) {
      throw new Error(`Failed to create party: ${error.message}`);
    }
  }
  
  async joinParty(partyId, userId) {
    try {
      const party = await ListeningParty.findById(partyId)
        .populate('host', 'username profile.stageName')
        .populate('playlist.track', 'title artist duration');
      
      if (!party) {
        throw new Error('Party not found');
      }
      
      const user = await User.findById(userId);
      const canJoin = await party.canUserJoin(user);
      
      if (!canJoin.allowed) {
        if (canJoin.requiresApproval) {
          // Add to pending approvals
          party.pendingApprovals.push({ user: userId });
          await party.save();
          
          // Notify host
          await this.notifyHostOfJoinRequest(party.host._id, userId, party);
          
          throw new Error('Join request sent. Waiting for host approval.');
        }
        throw new Error(canJoin.reason);
      }
      
      // Add participant
      await party.addParticipant(userId);
      
      // Get current playback state
      const playbackState = await this.getPlaybackState(party);
      
      // Emit to all participants
      const io = getIO();
      io.to(`party:${partyId}`).emit('party:participant_joined', {
        participant: {
          userId,
          username: user.username,
          avatar: user.profile?.avatar
        },
        participantCount: party.activeParticipantCount
      });
      
      return {
        party,
        playbackState,
        participants: await this.getParticipantDetails(party)
      };
    } catch (error) {
      throw new Error(`Failed to join party: ${error.message}`);
    }
  }
  
  async leaveParty(partyId, userId) {
    try {
      const party = await ListeningParty.findById(partyId);
      
      if (!party) {
        throw new Error('Party not found');
      }
      
      await party.removeParticipant(userId);
      
      // If host leaves, transfer host role or end party
      if (party.host.toString() === userId.toString() && party.status === 'live') {
        const newHost = party.participants.find(
          p => p.isActive && p.user.toString() !== userId.toString()
        );
        
        if (newHost) {
          party.host = newHost.user;
          newHost.role = 'host';
          await party.save();
          
          // Notify new host
          const io = getIO();
          io.to(`party:${partyId}`).emit('party:host_changed', {
            newHostId: newHost.user
          });
        } else {
          // No other participants, end party
          await party.endParty();
        }
      }
      
      // Emit leave event
      const io = getIO();
      io.to(`party:${partyId}`).emit('party:participant_left', {
        userId,
        participantCount: party.activeParticipantCount
      });
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to leave party: ${error.message}`);
    }
  }
  
  async updatePlayback(partyId, userId, playbackData) {
    try {
      const party = await ListeningParty.findById(partyId);
      
      if (!party) {
        throw new Error('Party not found');
      }
      
      // Check if user is host or co-host
      const participant = party.participants.find(
        p => p.user.toString() === userId.toString()
      );
      
      if (!participant || (participant.role !== 'host' && participant.role !== 'co-host')) {
        throw new Error('Only hosts can control playback');
      }
      
      // Update playback state
      await party.updatePlayback(
        playbackData.position,
        playbackData.isPlaying,
        userId
      );
      
      // Broadcast to all participants
      const io = getIO();
      io.to(`party:${partyId}`).emit('party:playback_update', {
        position: playbackData.position,
        isPlaying: playbackData.isPlaying,
        syncedBy: userId,
        timestamp: Date.now()
      });
      
      // Update cache
      await this.cachePlaybackState(partyId, playbackData);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update playback: ${error.message}`);
    }
  }
  
  async skipTrack(partyId, userId, direction = 'next') {
    try {
      const party = await ListeningParty.findById(partyId)
        .populate('playlist.track', 'title artist duration');
      
      if (!party) {
        throw new Error('Party not found');
      }
      
      // Check permissions
      const participant = party.participants.find(
        p => p.user.toString() === userId.toString()
      );
      
      if (!participant || (participant.role !== 'host' && participant.role !== 'co-host')) {
        throw new Error('Only hosts can skip tracks');
      }
      
      // Skip track
      if (direction === 'next') {
        await party.nextTrack();
      } else {
        await party.previousTrack();
      }
      
      // Track skip activity
      party.activity.skips.push({
        user: userId,
        trackId: party.playback.currentTrack,
        timestamp: new Date()
      });
      await party.save();
      
      // Broadcast track change
      const io = getIO();
      io.to(`party:${partyId}`).emit('party:track_changed', {
        track: party.playlist[party.playback.currentIndex],
        index: party.playback.currentIndex,
        skippedBy: userId
      });
      
      return {
        currentTrack: party.playlist[party.playback.currentIndex],
        currentIndex: party.playback.currentIndex
      };
    } catch (error) {
      throw new Error(`Failed to skip track: ${error.message}`);
    }
  }
  
  async sendChatMessage(partyId, userId, message) {
    try {
      const party = await ListeningParty.findById(partyId);
      
      if (!party) {
        throw new Error('Party not found');
      }
      
      // Check if user is participant
      const isParticipant = party.participants.some(
        p => p.user.toString() === userId.toString() && p.isActive
      );
      
      if (!isParticipant) {
        throw new Error('Must be in party to send messages');
      }
      
      // Check chat settings
      if (!party.settings.allowChat) {
        throw new Error('Chat is disabled for this party');
      }
      
      // Add message
      await party.addChatMessage(userId, message);
      
      // Get user details
      const user = await User.findById(userId)
        .select('username profile.avatar profile.stageName');
      
      // Broadcast message
      const io = getIO();
      io.to(`party:${partyId}`).emit('party:chat_message', {
        user: {
          _id: userId,
          username: user.username,
          avatar: user.profile?.avatar,
          stageName: user.profile?.stageName
        },
        message,
        timestamp: new Date()
      });
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }
  
  async addReaction(partyId, userId, emoji) {
    try {
      const party = await ListeningParty.findById(partyId);
      
      if (!party) {
        throw new Error('Party not found');
      }
      
      // Check if user is participant
      const isParticipant = party.participants.some(
        p => p.user.toString() === userId.toString() && p.isActive
      );
      
      if (!isParticipant) {
        throw new Error('Must be in party to add reactions');
      }
      
      // Check reaction settings
      if (!party.settings.allowReactions) {
        throw new Error('Reactions are disabled for this party');
      }
      
      // Add reaction
      await party.addReaction(userId, emoji);
      
      // Broadcast reaction
      const io = getIO();
      io.to(`party:${partyId}`).emit('party:reaction', {
        userId,
        emoji,
        timestamp: new Date()
      });
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to add reaction: ${error.message}`);
    }
  }
  
  async getPlaybackState(party) {
    // Calculate actual playback position based on time elapsed
    if (party.playback.isPlaying && party.playback.lastSync) {
      const elapsed = Date.now() - party.playback.lastSync.getTime();
      const actualPosition = party.playback.position + elapsed;
      
      return {
        ...party.playback.toObject(),
        position: actualPosition,
        serverTime: Date.now()
      };
    }
    
    return {
      ...party.playback.toObject(),
      serverTime: Date.now()
    };
  }
  
  async getParticipantDetails(party) {
    const activeParticipants = party.participants.filter(p => p.isActive);
    
    const users = await User.find({
      _id: { $in: activeParticipants.map(p => p.user) }
    }).select('username profile.avatar profile.stageName tier');
    
    return activeParticipants.map(participant => {
      const user = users.find(u => u._id.toString() === participant.user.toString());
      return {
        ...participant.toObject(),
        user: user ? {
          _id: user._id,
          username: user.username,
          avatar: user.profile?.avatar,
          stageName: user.profile?.stageName,
          tier: user.tier
        } : null
      };
    });
  }
  
  async cachePartyData(party) {
    const cacheKey = `party:${party._id}`;
    const cacheData = {
      id: party._id,
      host: party.host,
      status: party.status,
      participantCount: party.activeParticipantCount,
      maxParticipants: party.settings.maxParticipants
    };
    
    await redisClient.setex(
      cacheKey,
      300, // 5 minutes
      JSON.stringify(cacheData)
    );
  }
  
  async cachePlaybackState(partyId, playbackData) {
    const cacheKey = `party:${partyId}:playback`;
    
    await redisClient.setex(
      cacheKey,
      60, // 1 minute
      JSON.stringify({
        ...playbackData,
        cachedAt: Date.now()
      })
    );
  }
  
  async notifyFollowersOfParty(host, party) {
    // Get host's followers who are online or have notifications enabled
    const followers = await User.find({
      following: host._id,
      $or: [
        { 'preferences.notifications.newContent': true },
        { 'presence.status': 'online' }
      ]
    }).select('_id');
    
    const notification = {
      type: 'listening_party',
      title: `${host.profile?.stageName || host.username} started a listening party`,
      body: party.title,
      data: {
        partyId: party._id,
        hostId: host._id
      }
    };
    
    // Send notifications in batches
    const batchSize = 100;
    for (let i = 0; i < followers.length; i += batchSize) {
      const batch = followers.slice(i, i + batchSize);
      await Promise.all(
        batch.map(follower => 
          notificationService.sendNotification(follower._id, notification)
        )
      );
    }
  }
  
  async notifyHostOfJoinRequest(hostId, userId, party) {
    const user = await User.findById(userId)
      .select('username profile.avatar');
    
    await notificationService.sendNotification(hostId, {
      type: 'party_join_request',
      title: 'New join request',
      body: `${user.username} wants to join your listening party`,
      data: {
        partyId: party._id,
        userId,
        username: user.username
      }
    });
  }
  
  async approveJoinRequest(partyId, hostId, userId) {
    try {
      const party = await ListeningParty.findById(partyId);
      
      if (!party) {
        throw new Error('Party not found');
      }
      
      if (party.host.toString() !== hostId.toString()) {
        throw new Error('Only host can approve requests');
      }
      
      // Remove from pending
      party.pendingApprovals = party.pendingApprovals.filter(
        p => p.user.toString() !== userId.toString()
      );
      
      // Add as participant
      await party.addParticipant(userId);
      
      // Notify user
      await notificationService.sendNotification(userId, {
        type: 'party_join_approved',
        title: 'Join request approved',
        body: `You can now join the listening party "${party.title}"`,
        data: { partyId }
      });
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to approve request: ${error.message}`);
    }
  }
  
  async getActiveParties(filters = {}) {
    try {
      const query = {
        status: 'live',
        'settings.isPublic': true
      };
      
      if (filters.tierRequired) {
        query['settings.tierRequired'] = filters.tierRequired;
      }
      
      if (filters.search) {
        query.$or = [
          { title: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      const parties = await ListeningParty.find(query)
        .sort({ 'stats.peakParticipants': -1 })
        .limit(filters.limit || 20)
        .populate('host', 'username profile.stageName profile.avatar')
        .populate('playback.currentTrack', 'title artist duration coverArt');
      
      return parties;
    } catch (error) {
      throw new Error(`Failed to get active parties: ${error.message}`);
    }
  }
  
  async endParty(partyId, userId) {
    try {
      const party = await ListeningParty.findById(partyId);
      
      if (!party) {
        throw new Error('Party not found');
      }
      
      if (party.host.toString() !== userId.toString()) {
        throw new Error('Only host can end the party');
      }
      
      await party.endParty();
      
      // Notify all participants
      const io = getIO();
      io.to(`party:${partyId}`).emit('party:ended', {
        endedBy: userId,
        stats: party.stats
      });
      
      // Clear cache
      await redisClient.del(`party:${partyId}`);
      await redisClient.del(`party:${partyId}:playback`);
      
      return { success: true, stats: party.stats };
    } catch (error) {
      throw new Error(`Failed to end party: ${error.message}`);
    }
  }
}

module.exports = new ListeningPartyService();