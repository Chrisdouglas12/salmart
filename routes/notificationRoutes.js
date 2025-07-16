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
const { sendFCMNotification } = require('../services/notificationUtils.js');
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

  // Save FCM Token
  router.post('/api/save-fcm-token', verifyToken, async (req, res) => {
    try {
      const { token } = req.body;
      const userId = req.user.userId;

      if (!token) {
        logger.warn(`Token missing in save-fcm-token request for user ${userId}`);
        return res.status(400).json({ error: 'Token is required' });
      }

      await User.findByIdAndUpdate(userId, {
        fcmToken: token,
        notificationEnabled: true
      });
      logger.info(`FCM token saved for user ${userId}: ${token}`);
      res.json({ success: true });
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error saving FCM token for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Failed to save token' });
    }
  });

  // Debug Endpoint to Check FCM Token
  router.get('/check-fcm-token', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      logger.info(`Checked FCM token for user ${userId}: ${user?.fcmToken || 'none'}, notificationEnabled: ${user?.notificationEnabled}`);
      res.json({ fcmToken: user?.fcmToken, notificationEnabled: user?.notificationEnabled });
    } catch (error) {
      const userId = req.user?.userId || 'unknown';
      logger.error(`Error checking FCM token for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Manual Notification Test Endpoint
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

      if (!user.fcmToken) {
        logger.error(`User with ID ${userId} does not have an FCM token`);
        return res.status(404).send('User token not found');
      }

      logger.info(`Sending FCM notification to user ${userId}`);
      await sendFCMNotification(userId, title, body, { type }, req.io);
      logger.info(`Notification successfully sent to user ${userId}`);
      res.status(200).send('Notification sent');
    } catch (error) {
      logger.error(`Error sending notification to user ${userId || 'unknown'}: ${error.message}`);
      res.status(500).send('Error sending notification');
    }
  });

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

  // Mark Deals as Viewed
  router.post('/deals/mark-as-viewed', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const result = await Transaction.updateMany(
        {
          $or: [{ buyerId: userId }, { sellerId: userId }],
          status: 'pending',
          viewed: false
        },
        { $set: { viewed: true } }
      );
      logger.info(`Marked ${result.modifiedCount} deals as viewed for user ${userId}`);
      if (result.modifiedCount > 0) {
        const count = await Transaction.countDocuments({
          $or: [{ buyerId: userId }, { sellerId: userId }],
          status: 'pending',
          viewed: false
        });
        req.io.to(`user_${userId}`).emit('badge-update', { type: 'deals', count, userId });
        await NotificationService.triggerCountUpdate(req.io, userId);
        res.json({ success: true, message: 'Deals marked as viewed', updated: result.modifiedCount });
      } else {
        res.json({ success: true, message: 'No unviewed pending deals to mark' });
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