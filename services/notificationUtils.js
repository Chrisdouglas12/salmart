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
    const token = user?.fcmToken;
    if (!token) {
      logger.warn(`No FCM token for user ${userId}`);
      return;
    }
    logger.info(`Notification preferences for user ${userId}: ${JSON.stringify(user.notificationPreferences)}`);

    // Check notification preferences
    if (data.type && user.notificationPreferences && user.notificationPreferences[data.type] === false) {
      logger.info(`User ${userId} has disabled ${data.type} notifications`);
      return;
    }

    const message = {
      token,
      notification: { title, body },
      data: { ...data, userId: userId.toString() },
      android: { priority: 'high' }, // Ensure high priority for Android
      apns: { headers: { 'apns-priority': '10' } }, // Ensure high priority for iOS
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          icon: profilePictureUrl || 'https://salmart.vercel.app/salmart-192x192.png',
          image: imageUrl || null,
          requireInteraction: true,
        },
      },
    };
    logger.info(`Preparing FCM message for user ${userId}: ${JSON.stringify(message)}`);
    const response = await admin.messaging().send(message);
    logger.info(`FCM notification sent to user ${userId}: ${title}, Response: ${response}`);

    // Update notification counts and emit badge-update
    const counts = await NotificationService.getNotificationCounts(userId);
    io.to(`user_${userId}`).emit('badge-update', {
      type: data.type || 'general',
      count: counts.notificationCount,
      userId
    });
    logger.info(`Emitted badge-update for user ${userId}: type=${data.type}, count=${counts.notificationCount}`);
  } catch (err) {
    logger.error(`Error sending FCM notification to user ${userId}: ${err.message}`);
    if (err.code === 'messaging/registration-token-not-registered') {
      await User.findByIdAndUpdate(userId, { fcmToken: null, notificationEnabled: false });
      logger.info(`Removed invalid FCM token for user ${userId}`);
    }
  }
}

module.exports = { sendFCMNotification };