const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

class DataProtectionService {
  constructor() {
    this.encryptionKey = process.env.DATA_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    this.algorithm = 'aes-256-gcm';
    this.keyDerivationIterations = 100000;
  }

  // Field-level encryption for PII
  encryptField(data) {
    if (!data) return null;
    
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(64);
    const key = crypto.pbkdf2Sync(this.encryptionKey, salt, this.keyDerivationIterations, 32, 'sha256');
    
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted.toString('base64'),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    };
  }

  // Decrypt encrypted field
  decryptField(encryptedData) {
    if (!encryptedData || !encryptedData.encrypted) return null;
    
    try {
      const salt = Buffer.from(encryptedData.salt, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const tag = Buffer.from(encryptedData.tag, 'base64');
      const encrypted = Buffer.from(encryptedData.encrypted, 'base64');
      
      const key = crypto.pbkdf2Sync(this.encryptionKey, salt, this.keyDerivationIterations, 32, 'sha256');
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);
      
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption error:', error);
      return null;
    }
  }

  // Hash sensitive data for searching (email, phone)
  hashSearchableField(data) {
    if (!data) return null;
    const normalized = data.toLowerCase().trim();
    return crypto.createHash('sha256').update(normalized + process.env.SEARCH_SALT).digest('hex');
  }

  // Anonymize user data
  anonymizeUserData(userData) {
    const anonymized = { ...userData };
    
    // Replace PII with anonymized versions
    if (anonymized.email) {
      const [local, domain] = anonymized.email.split('@');
      anonymized.email = `${local.substring(0, 2)}****@${domain}`;
    }
    
    if (anonymized.phone) {
      anonymized.phone = anonymized.phone.replace(/\d(?=\d{4})/g, '*');
    }
    
    if (anonymized.name) {
      const names = anonymized.name.split(' ');
      anonymized.name = names.map(n => n.charAt(0) + '***').join(' ');
    }
    
    if (anonymized.dateOfBirth) {
      const dob = new Date(anonymized.dateOfBirth);
      anonymized.dateOfBirth = `${dob.getFullYear()}-01-01`;
    }
    
    delete anonymized.creditCard;
    delete anonymized.ssn;
    delete anonymized.bankAccount;
    
    return anonymized;
  }

  // GDPR data export
  async exportUserData(userId) {
    const collections = [
      'users',
      'subscriptions',
      'directmessages',
      'notifications',
      'content',
      'artistanalytics',
      'webhooklogs'
    ];
    
    const exportData = {
      exportDate: new Date().toISOString(),
      userId,
      data: {}
    };
    
    for (const collection of collections) {
      try {
        const Model = mongoose.model(collection);
        const data = await Model.find({
          $or: [
            { user: userId },
            { userId: userId },
            { artist: userId },
            { sender: userId },
            { recipient: userId }
          ]
        }).lean();
        
        // Decrypt any encrypted fields
        exportData.data[collection] = await this.decryptCollection(data);
      } catch (error) {
        console.error(`Error exporting ${collection}:`, error);
      }
    }
    
    return exportData;
  }

  // GDPR data deletion
  async deleteUserData(userId, options = {}) {
    const { 
      keepAnonymized = true, 
      collections = ['all'] 
    } = options;
    
    const deletionLog = {
      userId,
      timestamp: new Date(),
      collections: [],
      anonymized: keepAnonymized
    };
    
    const targetCollections = collections[0] === 'all' ? 
      ['users', 'directmessages', 'notifications', 'content'] : 
      collections;
    
    for (const collection of targetCollections) {
      try {
        const Model = mongoose.model(collection);
        
        if (keepAnonymized && collection === 'users') {
          // Anonymize instead of delete
          const user = await Model.findById(userId);
          if (user) {
            user.email = `deleted_${userId}@anonymized.com`;
            user.name = 'Deleted User';
            user.phone = null;
            user.dateOfBirth = null;
            user.profileImage = null;
            user.bio = 'This account has been deleted';
            user.isDeleted = true;
            user.deletedAt = new Date();
            await user.save();
          }
        } else {
          // Hard delete
          await Model.deleteMany({
            $or: [
              { user: userId },
              { userId: userId },
              { sender: userId },
              { recipient: userId }
            ]
          });
        }
        
        deletionLog.collections.push(collection);
      } catch (error) {
        console.error(`Error deleting from ${collection}:`, error);
      }
    }
    
    // Log the deletion for compliance
    await this.logDataDeletion(deletionLog);
    
    return deletionLog;
  }

  // Data retention policies
  async enforceRetentionPolicies() {
    const policies = {
      messages: 365, // days
      logs: 90,
      analytics: 730,
      inactiveUsers: 1095 // 3 years
    };
    
    const results = {
      processed: 0,
      deleted: 0,
      errors: []
    };
    
    // Delete old messages
    try {
      const messagesCutoff = new Date();
      messagesCutoff.setDate(messagesCutoff.getDate() - policies.messages);
      
      const DirectMessage = mongoose.model('DirectMessage');
      const deletedMessages = await DirectMessage.deleteMany({
        createdAt: { $lt: messagesCutoff },
        isArchived: true
      });
      
      results.deleted += deletedMessages.deletedCount;
    } catch (error) {
      results.errors.push({ type: 'messages', error: error.message });
    }
    
    // Delete old logs
    try {
      const logsCutoff = new Date();
      logsCutoff.setDate(logsCutoff.getDate() - policies.logs);
      
      const WebhookLog = mongoose.model('WebhookLog');
      const deletedLogs = await WebhookLog.deleteMany({
        createdAt: { $lt: logsCutoff }
      });
      
      results.deleted += deletedLogs.deletedCount;
    } catch (error) {
      results.errors.push({ type: 'logs', error: error.message });
    }
    
    // Anonymize inactive users
    try {
      const inactiveCutoff = new Date();
      inactiveCutoff.setDate(inactiveCutoff.getDate() - policies.inactiveUsers);
      
      const User = mongoose.model('User');
      const inactiveUsers = await User.find({
        lastLogin: { $lt: inactiveCutoff },
        isDeleted: { $ne: true }
      });
      
      for (const user of inactiveUsers) {
        await this.deleteUserData(user._id, { keepAnonymized: true });
        results.processed++;
      }
    } catch (error) {
      results.errors.push({ type: 'inactive_users', error: error.message });
    }
    
    return results;
  }

  // End-to-end encryption for messages
  generateE2EKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: process.env.E2E_KEY_PASSPHRASE
      }
    });
    
    return { publicKey, privateKey };
  }

  // Encrypt message for recipient
  encryptE2EMessage(message, recipientPublicKey) {
    const buffer = Buffer.from(message, 'utf8');
    const encrypted = crypto.publicEncrypt(recipientPublicKey, buffer);
    return encrypted.toString('base64');
  }

  // Decrypt message with private key
  decryptE2EMessage(encryptedMessage, privateKey) {
    const buffer = Buffer.from(encryptedMessage, 'base64');
    const decrypted = crypto.privateDecrypt({
      key: privateKey,
      passphrase: process.env.E2E_KEY_PASSPHRASE
    }, buffer);
    return decrypted.toString('utf8');
  }

  // Consent management
  async recordConsent(userId, consentType, granted = true) {
    const consent = {
      userId,
      type: consentType,
      granted,
      timestamp: new Date(),
      ip: this.getClientIp(),
      userAgent: this.getUserAgent()
    };
    
    // Store consent record
    await this.storeConsentRecord(consent);
    
    return consent;
  }

  // Check user consent
  async hasConsent(userId, consentType) {
    const latestConsent = await this.getLatestConsent(userId, consentType);
    return latestConsent && latestConsent.granted;
  }

  // Data breach notification
  async notifyDataBreach(affectedUsers, breachDetails) {
    const notification = {
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: new Date(),
      affectedCount: affectedUsers.length,
      details: breachDetails,
      notificationsSent: 0
    };
    
    // Notify affected users
    for (const userId of affectedUsers) {
      try {
        await this.sendBreachNotification(userId, breachDetails);
        notification.notificationsSent++;
      } catch (error) {
        console.error(`Failed to notify user ${userId}:`, error);
      }
    }
    
    // Log breach for compliance
    await this.logDataBreach(notification);
    
    // Notify authorities if required
    if (affectedUsers.length > 100 || breachDetails.severity === 'high') {
      await this.notifyAuthorities(notification);
    }
    
    return notification;
  }

  // Helper methods
  async decryptCollection(data) {
    // Decrypt encrypted fields in collection data
    return data.map(doc => {
      const decrypted = { ...doc };
      // Decrypt specific fields based on collection schema
      return decrypted;
    });
  }

  async logDataDeletion(deletionLog) {
    // Store deletion log for compliance
  }

  async storeConsentRecord(consent) {
    // Store consent in database
  }

  async getLatestConsent(userId, consentType) {
    // Retrieve latest consent record
    return null;
  }

  async sendBreachNotification(userId, details) {
    // Send notification to user
  }

  async logDataBreach(notification) {
    // Log breach details
  }

  async notifyAuthorities(notification) {
    // Notify relevant data protection authorities
  }

  getClientIp() {
    // Get from request context
    return '0.0.0.0';
  }

  getUserAgent() {
    // Get from request headers
    return 'Unknown';
  }
}

// Mongoose plugin for automatic encryption
const encryptionPlugin = function(schema, options) {
  const dataProtection = new DataProtectionService();
  const encryptedFields = options.fields || [];
  
  // Pre-save hook to encrypt fields
  schema.pre('save', function(next) {
    const doc = this;
    
    encryptedFields.forEach(field => {
      if (doc.isModified(field) && doc[field]) {
        doc[field] = dataProtection.encryptField(doc[field]);
      }
    });
    
    next();
  });
  
  // Post-find hooks to decrypt fields
  schema.post('find', async function(docs) {
    for (const doc of docs) {
      encryptedFields.forEach(field => {
        if (doc[field]) {
          doc[field] = dataProtection.decryptField(doc[field]);
        }
      });
    }
  });
  
  schema.post('findOne', async function(doc) {
    if (doc) {
      encryptedFields.forEach(field => {
        if (doc[field]) {
          doc[field] = dataProtection.decryptField(doc[field]);
        }
      });
    }
  });
};

module.exports = {
  DataProtectionService: new DataProtectionService(),
  encryptionPlugin
};