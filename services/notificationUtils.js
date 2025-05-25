// services/notificationUtils.js
const admin = require('firebase-admin');
const User = require('../models/userSchema.js');
const winston = require('winston');
const NotificationService = require('./NotificationService.js');
const mongoose = require('mongoose')
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
    const user = await User.findById(userId);
    const token = user?.fcmToken;
    if (!token) {
      logger.warn(`No FCM token for user ${userId}`);
      return;
    }
    logger.info(`Notification preferences for user ${userId}: ${JSON.stringify(user.notificationPreferences)}`);
    if (data.type && !user.notificationPreferences[data.type]) {
      logger.info(`User ${userId} has disabled ${data.type} notifications`);
      return;
    }
    const message = {
      token,
      notification: { title, body },
      data: { ...data, userId: userId.toString() },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          icon: profilePictureUrl || 'https://salmart.vercel.app/favicon.ico',
          image: imageUrl || null,
          requireInteraction: true,
        },
      },
    };
    await admin.messaging().send(message);
    logger.info(`FCM notification sent to user ${userId}: ${title}`);
    io.to(`user_${userId}`).emit('badge-update', {
      type: data.type || 'general',
      count: await NotificationService.getNotificationCounts(userId, io),
      userId
    });
  } catch (err) {
    logger.error(`Error sending FCM notification to user ${userId}: ${err.message}`);
    if (err.code === 'messaging/registration-token-not-registered') {
      await User.findByIdAndUpdate(userId, { fcmToken: null, notificationEnabled: false });
      logger.info(`Removed invalid FCM token for user ${userId}`);
    }
  }
}

module.exports = { sendFCMNotification };