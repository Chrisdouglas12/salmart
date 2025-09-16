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
const { 
  sendNotificationToUser, 
  detectTokenType, 
  validateFCMToken, 
  validateExpoToken 
} = require('../services/notificationUtils.js');
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

// ✅ Utility to detect safe platform (never unknown again)
function detectPlatform(req, providedPlatform) {
  let platform = (providedPlatform || '').toLowerCase();

  if (['web', 'android', 'ios'].includes(platform)) {
    return platform;
  }

  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) {
    return 'ios';
  }
  if (ua.includes('android')) {
    return 'android';
  }
  if (ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari')) {
    return 'web';
  }

  return 'web'; // fallback (never unknown)
}

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
    if (req.user && req.user.userId) return req.user.userId;
    if (req.body.userId) return req.body.userId;
    return null;
  }

  // ✅ Updated save-fcm-token endpoint with safe platform detection
  router.post('/api/save-fcm-token', async (req, res) => {
    try {
      const { token, platform } = req.body;
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        logger.warn(`User ID is missing in save-fcm-token request.`);
        return res.status(401).json({ error: 'User ID is required' });
      }
      if (!token) {
        logger.warn(`Token missing in save-fcm-token request for user ${userId}`);
        return res.status(400).json({ error: 'Token is required' });
      }

      const detectedTokenType = detectTokenType(token);
      if (detectedTokenType === 'invalid') {
        logger.warn(`Invalid token format for user ${userId}: ${token.substring(0, 20)}...`);
        return res.status(400).json({ error: 'Invalid token format' });
      }

      let isValid = false;
      if (detectedTokenType === 'fcm') isValid = validateFCMToken(token);
      if (detectedTokenType === 'expo') isValid = validateExpoToken(token);

      if (!isValid) {
        logger.warn(`Token validation failed for user ${userId}: ${detectedTokenType} token invalid`);
        return res.status(400).json({ error: `Invalid ${detectedTokenType} token` });
      }

      // ✅ Use safe platform detector (no unknown anymore)
      const safePlatform = detectPlatform(req, platform);

      const tokenData = {
        token,
        platform: safePlatform,
        deviceType: detectedTokenType,
        tokenType: detectedTokenType,
        lastUpdated: new Date(),
        createdAt: new Date()
      };

      await User.findByIdAndUpdate(userId, { $pull: { fcmTokens: { token } } });
      await User.findByIdAndUpdate(userId, { 
        $addToSet: { fcmTokens: tokenData },
        notificationEnabled: true 
      });

      logger.info(`${detectedTokenType.toUpperCase()} token registered for user ${userId} on ${safePlatform}: ${token.substring(0, 20)}...`);
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

  // Debug endpoint
  router.get('/check-fcm-token', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      const tokens = user?.fcmTokens || [];

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
        tokensByType,
        tokenAnalysis,
        notificationEnabled: user?.notificationEnabled 
      });
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error checking tokens for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // send-notification test
  router.post('/send-notification', verifyToken, async (req, res) => {
    const { userId, title, body, type } = req.body;
    logger.info(`Received request to send notification: userId=${userId}, title=${title}, type=${type}`);
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
      }
      const user = await User.findById(userId);
      if (!user) return res.status(404).send('User not found');
      if (!user.fcmTokens || user.fcmTokens.length === 0) {
        return res.status(404).send('User tokens not found');
      }

      const results = await sendNotificationToUser(userId, title, body, { type }, req.io);
      const anySuccess = results.some(r => r.success);
      if (anySuccess) {
        res.status(200).json({ success: true, message: 'Notification sent', results });
      } else {
        res.status(400).json({ success: false, message: 'Failed to send notifications', results });
      }
    } catch (error) {
      logger.error(`Error sending notification to user ${userId || 'unknown'}: ${error.message}`);
      res.status(500).send('Error sending notification');
    }
  });

  // notification-counts
  router.get('/notification-counts', verifyToken, async (req, res) => {
    try {
      const userId = req.query.userId || req.user.userId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ error: 'Valid user ID is required' });
      }
      const counts = await NotificationService.getNotificationCounts(userId);
      await NotificationService.sendCountsToUser(req.io, userId, counts);
      res.json(counts);
    } catch (error) {
      const userId = req.query.userId || req.user?.userId || 'unknown';
      logger.error(`Error fetching notification counts for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Error fetching notification counts' });
    }
  });

  // alerts mark-as-viewed
  router.post('/alerts/mark-as-viewed', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const result = await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
      if (result.modifiedCount > 0) {
        req.io.to(`user_${userId}`).emit('badge-update', { type: 'alerts', count: 0, userId });
        await NotificationService.triggerCountUpdate(req.io, userId);
      }
      res.json({ success: true, message: 'Alerts marked as viewed', updated: result.modifiedCount });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // dismiss notification
  router.post('/notifications/:id/dismiss', verifyToken, async (req, res) => {
    try {
      const notificationId = req.params.id;
      const userId = req.user.userId;
      const deleted = await Notification.findOneAndDelete({ _id: notificationId, userId });
      if (!deleted) {
        return res.status(404).json({ message: 'Notification not found or already dismissed' });
      }
      res.status(200).json({ message: 'Notification dismissed (deleted)' });
    } catch (error) {
      res.status(500).json({ message: 'Server error during dismiss' });
    }
  });

  // messages mark-as-viewed
  router.post('/messages/mark-as-viewed', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const result = await Message.updateMany({ receiverId: userId, status: 'sent' }, { $set: { status: 'seen' } });
      if (result.modifiedCount > 0) {
        req.io.to(`user_${userId}`).emit('badge-update', { type: 'messages', count: 0, userId });
        await NotificationService.triggerCountUpdate(req.io, userId);
      }
      res.json({ success: true, message: 'Messages marked as viewed', updated: result.modifiedCount });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // deals mark-as-viewed
  router.post('/deals/mark-as-viewed', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const result = await Notification.updateMany(
        { userId, type: 'deal', isRead: false }, 
        { $set: { isRead: true } }
      );
      if (result.modifiedCount > 0) {
        const dealsCount = await Notification.countDocuments({ userId, isRead: false, type: 'deal' });
        req.io.to(`user_${userId}`).emit('badge-update', { type: 'deals', count: dealsCount, userId });
        await NotificationService.triggerCountUpdate(req.io, userId);
      }
      res.json({ success: true, message: 'Deal notifications marked as viewed', updated: result.modifiedCount });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // get notifications
  router.get('/notifications', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });
      const notifications = await Notification.find({ userId })
        .populate('senderId', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 });
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};