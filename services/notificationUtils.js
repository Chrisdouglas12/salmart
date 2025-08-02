const admin = require('firebase-admin');
const User = require('../models/userSchema.js');
const winston = require('winston');
const NotificationService = require('./notificationService.js');
const mongoose = require('mongoose');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/notificationUtils.log' }),
    new winston.transports.Console()
  ]
});

async function sendFCMNotification(userId, title, body, data = {}, io, imageUrl = null, profilePictureUrl = null) {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid userId in sendFCMNotification: ${userId}`);
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User ${userId} not found for FCM notification`);
      return;
    }

    const tokens = user.fcmTokens || []; // Get all tokens
    if (tokens.length === 0) {
      logger.warn(`No FCM tokens for user ${userId}`);
      return;
    }
    
    // Check notification preferences for the specific type
    const notificationType = data.type || 'general';
    if (user.notificationPreferences && user.notificationPreferences[notificationType] === false) {
      logger.info(`User ${userId} has disabled ${notificationType} notifications`);
      return;
    }
    
    // Construct the message payload
    const message = {
      notification: { title, body },
      data: { ...data, userId: userId.toString() },
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          icon: profilePictureUrl || 'https://salmartonline.com.ng/salmart-192x192.png',
          image: imageUrl || null,
          requireInteraction: true,
        },
      },
    };
    
    logger.info(`Preparing FCM message for user ${userId} with ${tokens.length} tokens.`);

    // Use sendEachForMulticast to send to all tokens efficiently
    const response = await admin.messaging().sendEachForMulticast({ ...message, tokens });
    
    logger.info(`FCM notification sent to user ${userId}: ${title}. Success: ${response.successCount}, Failure: ${response.failureCount}`);

    // Handle invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          logger.error(`Failed to send to token ${tokens[idx]}: ${resp.error.code}`);
          if (resp.error.code === 'messaging/registration-token-not-registered' || resp.error.code === 'messaging/invalid-argument') {
            invalidTokens.push(tokens[idx]);
          }
        }
      });
      
      // Filter out and remove invalid tokens from the user's document
      if (invalidTokens.length > 0) {
        const updatedTokens = user.fcmTokens.filter(token => !invalidTokens.includes(token));
        await User.findByIdAndUpdate(userId, { fcmTokens: updatedTokens });
        logger.info(`Removed ${invalidTokens.length} invalid FCM tokens for user ${userId}`);
      }
    }

    // Update notification counts and emit badge-update
    const counts = await NotificationService.getNotificationCounts(userId);
    io.to(`user_${userId}`).emit('badge-update', {
      type: notificationType,
      count: counts.notificationCount,
      userId
    });
    logger.info(`Emitted badge-update for user ${userId}: type=${notificationType}, count=${counts.notificationCount}`);

  } catch (err) {
    logger.error(`Error in sendFCMNotification for user ${userId}: ${err.message}`, { stack: err.stack });
  }
}

module.exports = { sendFCMNotification };
