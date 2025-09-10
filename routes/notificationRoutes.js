const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const User = require('../models/userSchema.js');
const Notification = require('../models/notificationSchema.js');
const Post = require('../models/postSchema.js');
const Transaction = require('../models/transactionSchema.js');
const Message = require('../models/messageSchema.js');
const verifyToken = require('../middleware/auths.js');
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification, sendExpoNotification } = require('../services/notificationUtils.js');
const winston = require('winston');
const mongoose = require('mongoose');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/notifications.log' }),
    new winston.transports.Console()
  ]
});

module.exports = (io) => {
  // Middleware to attach io to req
  router.use((req, res, next) => {
    req.io = io;
    logger.info('Attached io to request object');
    next();
  });

  // Update Notification Preferences
  router.patch('/user/notification-preferences', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const preferences = req.body;
      await User.findByIdAndUpdate(userId, { notificationPreferences: preferences });
      logger.info(`Notification preferences updated for user ${userId}: ${JSON.stringify(preferences)}`);
      res.json({ success: true, message: 'Notification preferences updated' });
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error updating notification preferences for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

// A simple function to get the user ID from the request
function getUserIdFromRequest(req) {
  // Option 1: Get from JWT (from web)
  if (req.user && req.user.userId) {
    return req.user.userId;
  }
  // Option 2: Get from the request body (from native app)
  if (req.body.userId) {
    return req.body.userId;
  }
  return null; // Return null if user ID is not found in either place
}

// Updated save-fcm-token endpoint to handle both FCM and Expo tokens
// 🚨 Remove the verifyToken middleware for this endpoint
router.post('/api/save-fcm-token', async (req, res) => {
  try {
    const { token, platform, deviceType } = req.body;
    
    // 📢 NEW: Get userId from a helper function that checks both JWT and body
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      logger.warn(`User ID is missing in save-fcm-token request.`);
      return res.status(401).json({ error: 'User ID is required' });
    }

    if (!token) {
      logger.warn(`Token missing in save-fcm-token request for user ${userId}`);
      return res.status(400).json({ error: 'Token is required' });
    }

    // Create token object with metadata
    const tokenData = {
      token: token,
      platform: platform || 'web', // 'web', 'ios', 'android'
      deviceType: deviceType || 'fcm', // 'fcm', 'expo'
      lastUpdated: new Date()
    };

    // Remove any existing tokens with the same token value to avoid duplicates
    await User.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token: token } }
    });

    // Add the new token with metadata
    await User.findByIdAndUpdate(userId, {
      $addToSet: { fcmTokens: tokenData },
      notificationEnabled: true
    });

    logger.info(`${deviceType || 'FCM'} token added for user ${userId} on ${platform || 'web'}: ${token}`);
    res.json({ success: true });
  } catch (error) {
    const userId = req.body?.userId || req.user?.userId || 'unknown';
    logger.error(`Error saving FCM token for user ${userId}: ${error.message}`);
    res.status(500).json({ error: 'Failed to save token' });
  }
});


  // Updated debug endpoint to show token types
  router.get('/check-fcm-token', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      const tokens = user?.fcmTokens || [];
      
      // Group tokens by type for better debugging
      const tokensByType = tokens.reduce((acc, tokenData) => {
        const type = typeof tokenData === 'string' ? 'legacy' : tokenData.deviceType || 'fcm';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      logger.info(`Checked tokens for user ${userId}. Total: ${tokens.length}, Types: ${JSON.stringify(tokensByType)}, Enabled: ${user?.notificationEnabled}`);
      
      res.json({ 
        totalTokens: tokens.length,
        tokensByType: tokensByType,
        notificationEnabled: user?.notificationEnabled 
      });
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error checking FCM token for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Updated manual notification test endpoint to support both FCM and Expo
  router.post('/send-notification', verifyToken, async (req, res) => {
    const { userId, title, body, type } = req.body;

    logger.info(`Received request to send notification: userId=${userId}, title=${title}, type=${type}`);

    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        logger.warn(`Invalid user ID in send-notification request: ${userId}`);
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User with ID ${userId} not found in MongoDB`);
        return res.status(404).send('User not found');
      }

      if (!user.fcmTokens || user.fcmTokens.length === 0) {
        logger.error(`User with ID ${userId} does not have any notification tokens`);
        return res.status(404).send('User tokens not found');
      }

      logger.info(`Sending notifications to user ${userId} via ${user.fcmTokens.length} token(s)`);
      
      // Send to all token types
      await sendNotificationToAllTokens(userId, title, body, { type }, req.io);
      
      logger.info(`Notifications successfully sent to user ${userId}`);
      res.status(200).send('Notification sent');
    } catch (error) {
      logger.error(`Error sending notification to user ${userId || 'unknown'}: ${error.message}`);
      res.status(500).send('Error sending notification');
    }
  });

async function sendNotificationToAllTokens(userId, title, body, data, io) {
  const user = await User.findById(userId);
  const tokens = user?.fcmTokens || [];

  // Group tokens by type for batch processing
  const fcmTokens = tokens.filter(tokenData => {
    if (typeof tokenData === 'string') return true;
    return tokenData.deviceType !== 'expo';
  });
  
  const expoTokens = tokens.filter(tokenData => {
    return typeof tokenData === 'object' && tokenData.deviceType === 'expo';
  });

  try {
    // Send FCM notifications as batch
    if (fcmTokens.length > 0) {
      await sendFCMNotification(fcmTokens, title, body, data, io);
      logger.info(`Sent FCM notifications to ${fcmTokens.length} tokens for user ${userId}`);
    }

    // Send Expo notifications as batch
    if (expoTokens.length > 0) {
      await sendExpoNotification(expoTokens, title, body, data);
      logger.info(`Sent Expo notifications to ${expoTokens.length} tokens for user ${userId}`);
    }
  } catch (error) {
    logger.error(`Failed to send notifications to user ${userId}: ${error.message}`);
  }
}

  // Get Notification Counts
  router.get('/notification-counts', verifyToken, async (req, res) => {
    try {
      const userId = req.query.userId || req.user.userId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        logger.warn(`Invalid or missing user ID in notification-counts request: ${userId}`);
        return res.status(400).json({ error: 'Valid user ID is required' });
      }
      logger.info(`Fetching notification counts for user ${userId}`);
      const counts = await NotificationService.getNotificationCounts(userId);
      await NotificationService.sendCountsToUser(req.io, userId, counts);
      logger.info(`Notification counts sent to user ${userId}: ${JSON.stringify(counts)}`);
      res.json(counts);
    } catch (error) {
      const userId = req.query.userId || req.user?.userId || 'unknown';
      logger.error(`Error fetching notification counts for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Error fetching notification counts' });
    }
  });

  // Mark Alerts as Viewed
  router.post('/alerts/mark-as-viewed', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const result = await Notification.updateMany(
        { userId, isRead: false },
        { $set: { isRead: true } }
      );
      logger.info(`Marked ${result.modifiedCount} alerts as viewed for user ${userId}`);
      if (result.modifiedCount > 0) {
        req.io.to(`user_${userId}`).emit('badge-update', { type: 'alerts', count: 0, userId });
        await NotificationService.triggerCountUpdate(req.io, userId);
        res.json({ success: true, message: 'Alerts marked as viewed', updated: result.modifiedCount });
      } else {
        res.json({ success: true, message: 'No unread alerts to mark as viewed' });
      }
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error marking alerts as viewed for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  // To delete and dismiss notification
  router.post('/notifications/:id/dismiss', verifyToken, async (req, res) => {
    const notificationId = req.params.id;
    const userId = req.user.userId;

    try {
      const deleted = await Notification.findOneAndDelete({ _id: notificationId, userId });

      if (!deleted) {
        return res.status(404).json({ message: 'Notification not found or already dismissed' });
      }

      res.status(200).json({ message: 'Notification dismissed (deleted)' });
    } catch (error) {
      console.error('Dismiss error:', error);
      res.status(500).json({ message: 'Server error during dismiss' });
    }
  });

  // Mark Messages as Viewed
  router.post('/messages/mark-as-viewed', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const result = await Message.updateMany(
        { receiverId: userId, status: 'sent' },
        { $set: { status: 'seen' } }
      );
      logger.info(`Marked ${result.modifiedCount} messages as viewed for user ${userId}`);
      if (result.modifiedCount > 0) {
        req.io.to(`user_${userId}`).emit('badge-update', { type: 'messages', count: 0, userId });
        await NotificationService.triggerCountUpdate(req.io, userId);
        res.json({ success: true, message: 'Messages marked as viewed', updated: result.modifiedCount });
      } else {
        res.json({ success: true, message: 'No unread messages to mark as viewed' });
      }
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error marking messages as viewed for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Mark deals as viewed
  router.post('/deals/mark-as-viewed', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      
      // Update all unread notifications of type 'deal' to isRead: true
      const result = await Notification.updateMany(
        { userId, type: 'deal', isRead: false },
        { $set: { isRead: true } }
      );
      
      logger.info(`Marked ${result.modifiedCount} deal notifications as viewed for user ${userId}`);
      
      if (result.modifiedCount > 0) {
        // Recalculate the count after the update
        const dealsCount = await Notification.countDocuments({
          userId,
          isRead: false,
          type: 'deal'
        });
        
        // Emit an update to the client with the new count (which should be 0)
        req.io.to(`user_${userId}`).emit('badge-update', { type: 'deals', count: dealsCount, userId });
        await NotificationService.triggerCountUpdate(req.io, userId);
        
        res.json({ success: true, message: 'Deal notifications marked as viewed', updated: result.modifiedCount });
      } else {
        res.json({ success: true, message: 'No unread deal notifications to mark as viewed' });
      }
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error marking deals as viewed for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get Notifications
  router.get('/notifications', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      logger.info(`Fetching notifications for user ${userId}`);
      if (!userId) {
        logger.warn('Unauthorized access to notifications endpoint');
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const notifications = await Notification.find({ userId })
        .populate('senderId', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 });
      logger.info(`Retrieved ${notifications.length} notifications for user ${userId}`);
      res.json(notifications);
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error fetching notifications for user ${userId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};