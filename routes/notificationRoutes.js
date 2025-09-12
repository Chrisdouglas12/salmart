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
// 🔧 FIXED: Import the main function instead of separate ones
const { sendNotificationToUser, detectTokenType, validateFCMToken, validateExpoToken } = require('../services/notificationUtils.js');
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

  // 🔧 UPDATED: Enhanced save-fcm-token endpoint with proper token validation
  router.post('/api/save-fcm-token', async (req, res) => {
    try {
      const { token, platform, deviceType } = req.body;
      
      // Get userId from a helper function that checks both JWT and body
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        logger.warn(`User ID is missing in save-fcm-token request.`);
        return res.status(401).json({ error: 'User ID is required' });
      }

      if (!token) {
        logger.warn(`Token missing in save-fcm-token request for user ${userId}`);
        return res.status(400).json({ error: 'Token is required' });
      }

      // 🔧 NEW: Detect and validate token type
      const detectedTokenType = detectTokenType(token);
      
      if (detectedTokenType === 'invalid') {
        logger.warn(`Invalid token format for user ${userId}: ${token.substring(0, 20)}...`);
        return res.status(400).json({ error: 'Invalid token format' });
      }

      // Validate based on detected type
      let isValid = false;
      if (detectedTokenType === 'fcm') {
        isValid = validateFCMToken(token);
      } else if (detectedTokenType === 'expo') {
        isValid = validateExpoToken(token);
      }

      if (!isValid) {
        logger.warn(`Token validation failed for user ${userId}: ${detectedTokenType} token invalid`);
        return res.status(400).json({ error: `Invalid ${detectedTokenType} token` });
      }

      // Create token object with detected metadata
      const tokenData = {
        token: token,
        platform: platform || 'unknown',
        deviceType: detectedTokenType, // Use detected type, not client-provided
        tokenType: detectedTokenType, // Also store as tokenType for compatibility
        lastUpdated: new Date(),
        createdAt: new Date()
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

      logger.info(`${detectedTokenType.toUpperCase()} token registered for user ${userId} on ${platform || 'unknown'}: ${token.substring(0, 20)}...`);
      res.json({ 
        success: true, 
        tokenType: detectedTokenType,
        message: `${detectedTokenType.toUpperCase()} token registered successfully`
      });
    } catch (error) {
      const userId = req.body?.userId || req.user?.userId || 'unknown';
      logger.error(`Error saving token for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Failed to save token' });
    }
  });

  // 🔧 ENHANCED: Debug endpoint with better token analysis
  router.get('/check-fcm-token', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      const tokens = user?.fcmTokens || [];
      
      // Analyze tokens by detected type
      const tokenAnalysis = tokens.map(tokenData => {
        const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
        const detectedType = detectTokenType(token);
        const storedType = typeof tokenData === 'object' ? tokenData.deviceType || tokenData.tokenType : 'legacy';
        
        return {
          detectedType,
          storedType,
          platform: typeof tokenData === 'object' ? tokenData.platform : 'unknown',
          tokenPreview: token.substring(0, 20) + '...',
          isValid: detectedType !== 'invalid'
        };
      });

      const tokensByType = tokens.reduce((acc, tokenData) => {
        const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
        const type = detectTokenType(token);
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      logger.info(`Token analysis for user ${userId}. Total: ${tokens.length}, Types: ${JSON.stringify(tokensByType)}`);
      
      res.json({ 
        totalTokens: tokens.length,
        tokensByType: tokensByType,
        tokenAnalysis: tokenAnalysis,
        notificationEnabled: user?.notificationEnabled 
      });
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error checking tokens for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // 🔧 SIMPLIFIED: Manual notification test endpoint
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
      
      // 🔧 FIXED: Use the main notification function
      const results = await sendNotificationToUser(
        userId, 
        title, 
        body, 
        { type }, 
        req.io
      );
      
      // Check if any notifications were sent successfully
      const anySuccess = results.some(result => result.success);
      
      if (anySuccess) {
        logger.info(`Notifications successfully sent to user ${userId}`);
        res.status(200).json({ 
          success: true, 
          message: 'Notification sent',
          results: results
        });
      } else {
        logger.warn(`Failed to send notifications to user ${userId}`);
        res.status(400).json({ 
          success: false, 
          message: 'Failed to send notifications',
          results: results
        });
      }
    } catch (error) {
      logger.error(`Error sending notification to user ${userId || 'unknown'}: ${error.message}`);
      res.status(500).send('Error sending notification');
    }
  });

  // 🔧 REMOVED: sendNotificationToAllTokens function - no longer needed
  // The sendNotificationToUser function now handles all token types automatically

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