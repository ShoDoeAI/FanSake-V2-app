const Notification = require('../models/Notification');
const User = require('../models/User');
const { getIO } = require('../websocket');
const sgMail = require('@sendgrid/mail');
const redisClient = require('../config/redis');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

class NotificationService {
  async sendNotification(userId, notificationData) {
    try {
      // Create notification in database
      const notification = await Notification.create({
        user: userId,
        type: notificationData.type,
        title: notificationData.title,
        body: notificationData.body,
        data: notificationData.data,
        priority: notificationData.priority || 'normal'
      });
      
      // Get user preferences
      const user = await User.findById(userId)
        .select('email preferences.notifications presence.status');
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Send real-time notification if user is online
      if (user.presence?.status === 'online') {
        await this.sendRealtimeNotification(userId, notification);
      }
      
      // Send email notification if enabled
      if (this.shouldSendEmail(user, notificationData.type)) {
        await this.sendEmailNotification(user, notification);
      }
      
      // Send push notification if enabled
      if (this.shouldSendPush(user, notificationData.type)) {
        await this.sendPushNotification(user, notification);
      }
      
      // Cache notification count
      await this.updateNotificationCount(userId);
      
      return notification;
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw error;
    }
  }
  
  async sendRealtimeNotification(userId, notification) {
    const io = getIO();
    io.to(`user:${userId}`).emit('notification', {
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      createdAt: notification.createdAt,
      read: false
    });
  }
  
  shouldSendEmail(user, notificationType) {
    const emailPrefs = user.preferences?.notifications?.email;
    if (!emailPrefs?.enabled) return false;
    
    // Check specific notification type preferences
    const typeMap = {
      'new_message': emailPrefs.messages,
      'new_follower': emailPrefs.followers,
      'new_content': emailPrefs.newContent,
      'listening_party': emailPrefs.events,
      'milestone': emailPrefs.milestones,
      'subscription': emailPrefs.subscriptions
    };
    
    return typeMap[notificationType] !== false;
  }
  
  shouldSendPush(user, notificationType) {
    const pushPrefs = user.preferences?.notifications?.push;
    if (!pushPrefs?.enabled) return false;
    
    // Check if user has push tokens
    if (!user.pushTokens || user.pushTokens.length === 0) return false;
    
    // Check specific notification type preferences
    const typeMap = {
      'new_message': pushPrefs.messages,
      'new_follower': pushPrefs.followers,
      'new_content': pushPrefs.newContent,
      'listening_party': pushPrefs.events,
      'milestone': pushPrefs.milestones,
      'subscription': pushPrefs.subscriptions
    };
    
    return typeMap[notificationType] !== false;
  }
  
  async sendEmailNotification(user, notification) {
    try {
      // Throttle emails to prevent spam
      const throttleKey = `email_throttle:${user._id}:${notification.type}`;
      const throttled = await redisClient.get(throttleKey);
      
      if (throttled) {
        return; // Skip if recently sent similar email
      }
      
      const emailTemplate = this.getEmailTemplate(notification);
      
      const msg = {
        to: user.email,
        from: process.env.FROM_EMAIL || 'noreply@musicconnect.com',
        subject: emailTemplate.subject,
        html: emailTemplate.html,
        text: emailTemplate.text
      };
      
      await sgMail.send(msg);
      
      // Set throttle
      await redisClient.setex(throttleKey, 3600, '1'); // 1 hour throttle
    } catch (error) {
      console.error('Failed to send email notification:', error);
    }
  }
  
  async sendPushNotification(user, notification) {
    // Implementation would depend on push notification service
    // This is a placeholder for FCM/APNS integration
    console.log('Push notification would be sent here');
  }
  
  getEmailTemplate(notification) {
    const templates = {
      new_message: {
        subject: `New message: ${notification.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${notification.title}</h2>
            <p>${notification.body}</p>
            <a href="${process.env.CLIENT_URL}/messages" style="background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Message</a>
          </div>
        `,
        text: `${notification.title}\n\n${notification.body}\n\nView at: ${process.env.CLIENT_URL}/messages`
      },
      listening_party: {
        subject: notification.title,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>🎵 ${notification.title}</h2>
            <p>${notification.body}</p>
            <a href="${process.env.CLIENT_URL}/parties/${notification.data.partyId}" style="background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Join Party</a>
          </div>
        `,
        text: `${notification.title}\n\n${notification.body}\n\nJoin at: ${process.env.CLIENT_URL}/parties/${notification.data.partyId}`
      },
      new_content: {
        subject: `New content: ${notification.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>🎶 ${notification.title}</h2>
            <p>${notification.body}</p>
            <a href="${process.env.CLIENT_URL}/content/${notification.data.contentId}" style="background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Listen Now</a>
          </div>
        `,
        text: `${notification.title}\n\n${notification.body}\n\nListen at: ${process.env.CLIENT_URL}/content/${notification.data.contentId}`
      },
      milestone: {
        subject: `🏆 ${notification.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>🏆 Milestone Achieved!</h2>
            <h3>${notification.title}</h3>
            <p>${notification.body}</p>
            <a href="${process.env.CLIENT_URL}/achievements" style="background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Achievements</a>
          </div>
        `,
        text: `Milestone Achieved!\n\n${notification.title}\n\n${notification.body}\n\nView at: ${process.env.CLIENT_URL}/achievements`
      }
    };
    
    return templates[notification.type] || {
      subject: notification.title,
      html: `<div style="font-family: Arial, sans-serif;"><h2>${notification.title}</h2><p>${notification.body}</p></div>`,
      text: `${notification.title}\n\n${notification.body}`
    };
  }
  
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, user: userId },
        { read: true, readAt: new Date() },
        { new: true }
      );
      
      if (!notification) {
        throw new Error('Notification not found');
      }
      
      // Update cached count
      await this.updateNotificationCount(userId);
      
      return notification;
    } catch (error) {
      throw new Error(`Failed to mark notification as read: ${error.message}`);
    }
  }
  
  async markAllAsRead(userId) {
    try {
      await Notification.updateMany(
        { user: userId, read: false },
        { read: true, readAt: new Date() }
      );
      
      // Update cached count
      await this.updateNotificationCount(userId);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to mark all as read: ${error.message}`);
    }
  }
  
  async getNotifications(userId, options = {}) {
    try {
      const query = { user: userId };
      
      if (options.unreadOnly) {
        query.read = false;
      }
      
      if (options.type) {
        query.type = options.type;
      }
      
      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(options.limit || 50)
        .skip(options.skip || 0);
      
      const totalCount = await Notification.countDocuments(query);
      const unreadCount = await Notification.countDocuments({ 
        user: userId, 
        read: false 
      });
      
      return {
        notifications,
        totalCount,
        unreadCount
      };
    } catch (error) {
      throw new Error(`Failed to get notifications: ${error.message}`);
    }
  }
  
  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        user: userId
      });
      
      if (!notification) {
        throw new Error('Notification not found');
      }
      
      // Update cached count
      await this.updateNotificationCount(userId);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete notification: ${error.message}`);
    }
  }
  
  async updateNotificationCount(userId) {
    const count = await Notification.countDocuments({
      user: userId,
      read: false
    });
    
    // Cache for quick access
    await redisClient.setex(
      `notification_count:${userId}`,
      300, // 5 minutes
      count.toString()
    );
    
    // Send real-time update
    const io = getIO();
    io.to(`user:${userId}`).emit('notification_count', { count });
    
    return count;
  }
  
  async getUnreadCount(userId) {
    // Try cache first
    const cached = await redisClient.get(`notification_count:${userId}`);
    if (cached !== null) {
      return parseInt(cached);
    }
    
    // Get from database
    return await this.updateNotificationCount(userId);
  }
  
  async sendBulkNotifications(notifications) {
    try {
      const results = await Promise.allSettled(
        notifications.map(n => this.sendNotification(n.userId, n.data))
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      return { succeeded, failed, total: notifications.length };
    } catch (error) {
      throw new Error(`Failed to send bulk notifications: ${error.message}`);
    }
  }
  
  async scheduleNotification(userId, notificationData, scheduledFor) {
    // This would integrate with a job queue like Bull
    // For now, we'll create a scheduled notification record
    const notification = await Notification.create({
      user: userId,
      ...notificationData,
      scheduled: true,
      scheduledFor: new Date(scheduledFor)
    });
    
    return notification;
  }
}

module.exports = new NotificationService();