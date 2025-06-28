const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { contentGate } = require('../config/fanTierAccess');
const messagingService = require('../services/messagingService');
const { validateAttachment } = require('../utils/messageUtils');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
    files: 5 // Max 5 files per message
  },
  fileFilter: (req, file, cb) => {
    const validation = validateAttachment(file);
    if (validation.valid) {
      file.attachmentType = validation.type;
      cb(null, true);
    } else {
      cb(new Error(validation.error), false);
    }
  }
});

// Middleware to check superfan status
const superfanOnly = async (req, res, next) => {
  try {
    const userTier = req.user.tier || 'free';
    if (userTier !== 'superfan') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Direct messaging requires Superfan tier'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error checking access' });
  }
};

// Get conversations
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const { unreadOnly, pinnedOnly, limit } = req.query;
    
    const conversations = await messagingService.getConversations(
      req.user._id,
      { unreadOnly, pinnedOnly, limit: parseInt(limit) || 50 }
    );
    
    res.json({
      conversations,
      totalUnread: await messagingService.getUnreadCount(req.user._id)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start a new conversation (superfans only)
router.post('/conversations', authenticateToken, superfanOnly, async (req, res) => {
  try {
    const { artistId } = req.body;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID required' });
    }
    
    const conversation = await messagingService.createConversation(
      artistId,
      req.user._id,
      req.user.tier
    );
    
    res.status(201).json({ conversation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages in a conversation
router.get('/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { before, limit } = req.query;
    
    const messages = await messagingService.getMessages(
      conversationId,
      req.user._id,
      { 
        before: before ? new Date(before) : null,
        limit: parseInt(limit) || 50
      }
    );
    
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message
router.post(
  '/conversations/:conversationId/messages',
  authenticateToken,
  upload.array('attachments', 5),
  async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { content, replyTo } = req.body;
      
      if (!content && (!req.files || req.files.length === 0)) {
        return res.status(400).json({ error: 'Message content or attachment required' });
      }
      
      // Process attachments
      const attachments = req.files ? req.files.map(file => ({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        type: file.attachmentType
      })) : [];
      
      const message = await messagingService.sendMessage(
        conversationId,
        req.user._id,
        content,
        attachments
      );
      
      res.status(201).json({ message });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete a message
router.delete('/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    await messagingService.deleteMessage(messageId, req.user._id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add reaction to a message
router.post('/messages/:messageId/reactions', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji required' });
    }
    
    const message = await messagingService.addReaction(
      messageId,
      req.user._id,
      emoji
    );
    
    res.json({ reactions: message.reactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get quota status
router.get('/quota/:artistId', authenticateToken, superfanOnly, async (req, res) => {
  try {
    const { artistId } = req.params;
    
    const quota = await messagingService.getQuotaStatus(
      req.user._id,
      artistId
    );
    
    res.json({ quota });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark conversation as read
router.put('/conversations/:conversationId/read', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    await messagingService.markConversationAsRead(
      conversationId,
      req.user._id
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Block/unblock conversation
router.put('/conversations/:conversationId/block', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { block } = req.body;
    
    if (block) {
      await messagingService.blockConversation(conversationId, req.user._id);
    } else {
      await messagingService.unblockConversation(conversationId, req.user._id);
    }
    
    res.json({ success: true, blocked: block });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pin/unpin conversation
router.put('/conversations/:conversationId/pin', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { pin } = req.body;
    
    await messagingService.togglePinConversation(
      conversationId,
      req.user._id,
      pin
    );
    
    res.json({ success: true, pinned: pin });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversation stats (for artists)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Check if user is an artist
    if (req.user.role !== 'artist') {
      return res.status(403).json({ error: 'Artist access only' });
    }
    
    const stats = await messagingService.getConversationStats(req.user._id);
    
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search messages
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { query, conversationId, limit } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const results = await messagingService.searchMessages(
      req.user._id,
      query,
      { conversationId, limit: parseInt(limit) || 50 }
    );
    
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;