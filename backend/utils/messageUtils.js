const DOMPurify = require('isomorphic-dompurify');
const validator = require('validator');

// Sanitize message content to prevent XSS and malicious content
const sanitizeMessage = (content) => {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  // Remove any HTML tags
  let sanitized = DOMPurify.sanitize(content, { ALLOWED_TAGS: [] });
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit consecutive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  // Remove zero-width characters
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  return sanitized;
};

// Validate message content
const validateMessageContent = (content) => {
  if (!content || typeof content !== 'string') {
    return false;
  }
  
  // Check length
  if (content.length === 0 || content.length > 1000) {
    return false;
  }
  
  // Check for spam patterns
  if (isSpam(content)) {
    return false;
  }
  
  return true;
};

// Basic spam detection
const isSpam = (content) => {
  const spamPatterns = [
    /\b(?:buy|sell|discount|offer|free|winner|prize|click here|visit)\b/gi,
    /\b(?:viagra|cialis|pills|drugs|pharma)\b/gi,
    /\b\d{10,}\b/g, // Long number sequences
    /(https?:\/\/[^\s]+){3,}/g, // Multiple URLs
    /(.)\1{10,}/g, // Repeated characters
    /[A-Z\s]{20,}/g, // All caps sentences
  ];
  
  for (const pattern of spamPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }
  
  return false;
};

// Validate attachment
const validateAttachment = (attachment) => {
  const allowedTypes = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
    video: ['video/mp4', 'video/webm', 'video/ogg']
  };
  
  const maxSizes = {
    image: 10 * 1024 * 1024, // 10MB
    audio: 50 * 1024 * 1024, // 50MB
    video: 100 * 1024 * 1024 // 100MB
  };
  
  // Determine attachment type
  let attachmentType;
  for (const [type, mimeTypes] of Object.entries(allowedTypes)) {
    if (mimeTypes.includes(attachment.mimetype)) {
      attachmentType = type;
      break;
    }
  }
  
  if (!attachmentType) {
    return { valid: false, error: 'Invalid file type' };
  }
  
  // Check file size
  if (attachment.size > maxSizes[attachmentType]) {
    return { 
      valid: false, 
      error: `File too large. Maximum size for ${attachmentType} is ${maxSizes[attachmentType] / (1024 * 1024)}MB`
    };
  }
  
  return { valid: true, type: attachmentType };
};

// Format message for display
const formatMessageForDisplay = (message) => {
  // Convert URLs to links
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let formatted = message.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Convert mentions to links (@username)
  const mentionRegex = /@(\w+)/g;
  formatted = formatted.replace(mentionRegex, '<span class="mention">@$1</span>');
  
  // Convert line breaks
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;
};

// Extract mentions from message
const extractMentions = (content) => {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  
  return [...new Set(mentions)]; // Remove duplicates
};

// Check if message contains sensitive content
const checkSensitiveContent = (content) => {
  const sensitivePatterns = [
    /\b(?:password|pwd|pass|token|key|secret|api)\s*[:=]\s*\S+/gi,
    /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, // Credit card pattern
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN pattern
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
    /\b\d{10,15}\b/g, // Phone numbers
  ];
  
  for (const pattern of sensitivePatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }
  
  return false;
};

// Generate message preview
const generateMessagePreview = (content, maxLength = 100) => {
  if (!content) return '';
  
  let preview = content.trim();
  
  if (preview.length > maxLength) {
    preview = preview.substring(0, maxLength).trim() + '...';
  }
  
  return preview;
};

// Calculate reading time
const calculateReadingTime = (content) => {
  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);
  
  return readingTime;
};

// Format timestamp for display
const formatMessageTimestamp = (timestamp) => {
  const now = new Date();
  const messageDate = new Date(timestamp);
  const diffInSeconds = Math.floor((now - messageDate) / 1000);
  
  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    return messageDate.toLocaleDateString();
  }
};

module.exports = {
  sanitizeMessage,
  validateMessageContent,
  isSpam,
  validateAttachment,
  formatMessageForDisplay,
  extractMentions,
  checkSensitiveContent,
  generateMessagePreview,
  calculateReadingTime,
  formatMessageTimestamp
};