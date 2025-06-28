const { DirectMessage, MessageConversation } = require('../models/DirectMessage');
const User = require('../models/User');
const notificationService = require('./notificationService');
const { validateMessageContent, sanitizeMessage } = require('../utils/messageUtils');
const { uploadToS3 } = require('./s3Service');
const { io } = require('../websocket');

class MessagingService {
  async createConversation(artistId, fanId, fanTier) {
    try {
      // Check if conversation already exists
      let conversation = await MessageConversation.findOne({
        'metadata.artistId': artistId,
        'metadata.fanId': fanId
      });
      
      if (conversation) {
        // Reactivate if needed
        if (!conversation.metadata.isActive) {
          conversation.metadata.isActive = true;
          await conversation.save();
        }
        return conversation;
      }
      
      // Create new conversation
      conversation = await MessageConversation.create({
        participants: [
          { user: artistId, role: 'artist' },
          { user: fanId, role: 'fan' }
        ],
        metadata: {
          artistId,
          fanId,
          fanTier,
          monthlyQuota: {
            limit: fanTier === 'superfan' ? 5 : 0
          }
        }
      });
      
      return conversation;
    } catch (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
  }
  
  async sendMessage(conversationId, senderId, content, attachments = []) {
    try {
      // Get conversation
      const conversation = await MessageConversation.findById(conversationId)
        .populate('participants.user');
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      // Check if sender can send message
      const canSend = conversation.canSendMessage(senderId);
      if (!canSend.allowed) {
        throw new Error(canSend.reason);
      }
      
      // Validate and sanitize content
      const sanitizedContent = sanitizeMessage(content);
      if (!validateMessageContent(sanitizedContent)) {
        throw new Error('Invalid message content');
      }
      
      // Determine sender role
      const senderParticipant = conversation.participants.find(
        p => p.user._id.toString() === senderId.toString()
      );
      const isArtistMessage = senderParticipant.role === 'artist';
      
      // Get recipient
      const recipientParticipant = conversation.participants.find(
        p => p.user._id.toString() !== senderId.toString()
      );
      
      // Process attachments
      const processedAttachments = await this.processAttachments(attachments);
      
      // Create message
      const message = await DirectMessage.create({
        conversation: conversationId,
        sender: senderId,
        recipient: recipientParticipant.user._id,
        content: sanitizedContent,
        attachments: processedAttachments,
        metadata: {
          isArtistMessage,
          fanTier: conversation.metadata.fanTier,
          quotaUsed: !isArtistMessage
        }
      });
      
      // Update conversation
      await conversation.updateLastMessage(message);
      
      // Increment quota if fan message
      if (!isArtistMessage) {
        await conversation.incrementQuota();
      }
      
      // Update response time if artist is responding
      if (isArtistMessage && conversation.lastMessage.sender?.toString() !== senderId.toString()) {
        const lastFanMessage = await DirectMessage.findOne({
          conversation: conversationId,
          'metadata.isArtistMessage': false
        }).sort({ createdAt: -1 });
        
        if (lastFanMessage) {
          const responseTime = (Date.now() - lastFanMessage.createdAt) / (1000 * 60); // in minutes
          await conversation.updateResponseTime(responseTime);
        }
      }
      
      // Send real-time notification
      this.sendRealtimeMessage(message, conversation);
      
      // Send push notification
      await this.sendMessageNotification(message, conversation);
      
      return message;
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }
  
  async processAttachments(attachments) {
    const processed = [];
    
    for (const attachment of attachments) {
      try {
        // Upload to S3
        const uploadResult = await uploadToS3(
          attachment.buffer,
          `messages/${Date.now()}_${attachment.originalname}`,
          attachment.mimetype
        );
        
        // Generate thumbnail for images/videos
        let thumbnail;
        if (attachment.type === 'image' || attachment.type === 'video') {
          // Thumbnail generation would happen here
          thumbnail = uploadResult.url; // Placeholder
        }
        
        processed.push({
          type: attachment.type,
          url: uploadResult.url,
          thumbnail,
          size: attachment.size,
          mimeType: attachment.mimetype,
          duration: attachment.duration // For audio/video
        });
      } catch (error) {
        console.error('Failed to process attachment:', error);
      }
    }
    
    return processed;
  }
  
  sendRealtimeMessage(message, conversation) {
    // Emit to both participants
    conversation.participants.forEach(participant => {
      const userId = participant.user._id.toString();
      io.to(`user:${userId}`).emit('new_message', {
        message: {
          _id: message._id,
          content: message.content,
          sender: message.sender,
          createdAt: message.createdAt,
          attachments: message.attachments,
          status: message.status
        },
        conversation: {
          _id: conversation._id,
          lastMessage: conversation.lastMessage,
          unreadCount: participant.role === 'artist' 
            ? conversation.stats.unreadCount.artist 
            : conversation.stats.unreadCount.fan
        }
      });
    });
  }
  
  async sendMessageNotification(message, conversation) {
    const recipient = conversation.participants.find(
      p => p.user._id.toString() !== message.sender.toString()
    );
    
    if (recipient.notificationsEnabled) {
      await notificationService.sendNotification(recipient.user._id, {
        type: 'new_message',
        title: message.metadata.isArtistMessage 
          ? `New message from ${conversation.participants[0].user.profile?.stageName || 'Artist'}`
          : `New message from a Superfan`,
        body: message.content.substring(0, 100),
        data: {
          conversationId: conversation._id,
          messageId: message._id
        }
      });
    }
  }
  
  async getConversations(userId, filters = {}) {
    try {
      const query = {
        'participants.user': userId,
        'metadata.isActive': true
      };
      
      // Apply filters
      if (filters.unreadOnly) {
        query['$or'] = [
          { 'stats.unreadCount.artist': { $gt: 0 } },
          { 'stats.unreadCount.fan': { $gt: 0 } }
        ];
      }
      
      if (filters.pinnedOnly) {
        query['metadata.isPinned'] = true;
      }
      
      const conversations = await MessageConversation.find(query)
        .sort({ 
          'metadata.isPinned': -1,
          'lastMessage.timestamp': -1 
        })
        .limit(filters.limit || 50)
        .populate('participants.user', 'username profile.avatar profile.stageName')
        .populate('metadata.artistId', 'username profile.stageName profile.avatar')
        .populate('metadata.fanId', 'username profile.avatar');
      
      return conversations;
    } catch (error) {
      throw new Error(`Failed to get conversations: ${error.message}`);
    }
  }
  
  async getMessages(conversationId, userId, options = {}) {
    try {
      const conversation = await MessageConversation.findById(conversationId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      // Check if user is participant
      const isParticipant = conversation.participants.some(
        p => p.user.toString() === userId.toString()
      );
      
      if (!isParticipant) {
        throw new Error('Not authorized to view this conversation');
      }
      
      // Build query
      const query = {
        conversation: conversationId,
        'metadata.deletedAt': null
      };
      
      if (options.before) {
        query.createdAt = { $lt: options.before };
      }
      
      // Get messages
      const messages = await DirectMessage.find(query)
        .sort({ createdAt: -1 })
        .limit(options.limit || 50)
        .populate('sender', 'username profile.avatar profile.stageName')
        .populate('replyTo', 'content sender');
      
      // Mark conversation as read
      await conversation.markAsRead(userId);
      
      // Mark messages as delivered/read
      const unreadMessages = messages.filter(
        m => m.recipient.toString() === userId.toString() && !m.metadata.readAt
      );
      
      for (const message of unreadMessages) {
        await message.markAsRead();
      }
      
      return messages.reverse(); // Return in chronological order
    } catch (error) {
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  }
  
  async deleteMessage(messageId, userId) {
    try {
      const message = await DirectMessage.findById(messageId);
      
      if (!message) {
        throw new Error('Message not found');
      }
      
      // Only sender can delete their own message
      if (message.sender.toString() !== userId.toString()) {
        throw new Error('Not authorized to delete this message');
      }
      
      // Soft delete
      await message.softDelete();
      
      // Emit deletion event
      const conversation = await MessageConversation.findById(message.conversation);
      this.sendMessageDeletion(messageId, conversation);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  }
  
  sendMessageDeletion(messageId, conversation) {
    conversation.participants.forEach(participant => {
      const userId = participant.user.toString();
      io.to(`user:${userId}`).emit('message_deleted', {
        messageId,
        conversationId: conversation._id
      });
    });
  }
  
  async addReaction(messageId, userId, emoji) {
    try {
      const message = await DirectMessage.findById(messageId)
        .populate('conversation');
      
      if (!message) {
        throw new Error('Message not found');
      }
      
      // Check if user is participant
      const conversation = await MessageConversation.findById(message.conversation);
      const isParticipant = conversation.participants.some(
        p => p.user.toString() === userId.toString()
      );
      
      if (!isParticipant) {
        throw new Error('Not authorized to react to this message');
      }
      
      // Add reaction
      await message.addReaction(userId, emoji);
      
      // Emit reaction event
      this.sendReactionUpdate(message, conversation);
      
      return message;
    } catch (error) {
      throw new Error(`Failed to add reaction: ${error.message}`);
    }
  }
  
  sendReactionUpdate(message, conversation) {
    conversation.participants.forEach(participant => {
      const userId = participant.user.toString();
      io.to(`user:${userId}`).emit('reaction_update', {
        messageId: message._id,
        conversationId: conversation._id,
        reactions: message.reactions
      });
    });
  }
  
  async getQuotaStatus(userId, artistId) {
    try {
      const conversation = await MessageConversation.findOne({
        'metadata.fanId': userId,
        'metadata.artistId': artistId
      });
      
      if (!conversation) {
        return {
          used: 0,
          limit: 0,
          remaining: 0,
          resetDate: null
        };
      }
      
      const quota = conversation.metadata.monthlyQuota;
      const now = new Date();
      
      // Check if quota needs reset
      if (now >= quota.resetDate) {
        quota.used = 0;
        quota.resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await conversation.save();
      }
      
      return {
        used: quota.used,
        limit: quota.limit,
        remaining: Math.max(0, quota.limit - quota.used),
        resetDate: quota.resetDate
      };
    } catch (error) {
      throw new Error(`Failed to get quota status: ${error.message}`);
    }
  }
  
  async blockConversation(conversationId, userId) {
    try {
      const conversation = await MessageConversation.findById(conversationId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      // Check if user is participant
      const isParticipant = conversation.participants.some(
        p => p.user.toString() === userId.toString()
      );
      
      if (!isParticipant) {
        throw new Error('Not authorized to block this conversation');
      }
      
      conversation.metadata.blockedAt = new Date();
      conversation.metadata.blockedBy = userId;
      conversation.metadata.isActive = false;
      
      await conversation.save();
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to block conversation: ${error.message}`);
    }
  }
  
  async getUnreadCount(userId) {
    try {
      const conversations = await MessageConversation.find({
        'participants.user': userId,
        'metadata.isActive': true
      });
      
      let totalUnread = 0;
      conversations.forEach(conv => {
        const participant = conv.participants.find(
          p => p.user.toString() === userId.toString()
        );
        
        if (participant.role === 'artist') {
          totalUnread += conv.stats.unreadCount.artist;
        } else {
          totalUnread += conv.stats.unreadCount.fan;
        }
      });
      
      return totalUnread;
    } catch (error) {
      throw new Error(`Failed to get unread count: ${error.message}`);
    }
  }
}

module.exports = new MessagingService();