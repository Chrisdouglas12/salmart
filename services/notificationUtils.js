const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');
const User = require('../models/userSchema.js');
const winston = require('winston');
const NotificationService = require('./notificationService.js');
const mongoose = require('mongoose');

// Initialize Expo SDK
const expo = new Expo();

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

    // Get only FCM tokens (web and legacy tokens)
    const allTokens = user.fcmTokens || [];
    const fcmTokens = allTokens.filter(tokenData => {
      if (typeof tokenData === 'string') return true; // Legacy tokens
      return tokenData.deviceType === 'fcm' || !tokenData.deviceType; // FCM tokens
    }).map(tokenData => typeof tokenData === 'string' ? tokenData : tokenData.token);

    if (fcmTokens.length === 0) {
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
    
    logger.info(`Preparing FCM message for user ${userId} with ${fcmTokens.length} FCM tokens.`);

    // Use sendEachForMulticast to send to all FCM tokens efficiently
    const response = await admin.messaging().sendEachForMulticast({ ...message, tokens: fcmTokens });
    
    logger.info(`FCM notification sent to user ${userId}: ${title}. Success: ${response.successCount}, Failure: ${response.failureCount}`);

    // Handle invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          logger.error(`Failed to send FCM to token ${fcmTokens[idx]}: ${resp.error.code}`);
          if (resp.error.code === 'messaging/registration-token-not-registered' || 
              resp.error.code === 'messaging/invalid-argument') {
            invalidTokens.push(fcmTokens[idx]);
          }
        }
      });
      
      // Remove invalid tokens from the user's document
      if (invalidTokens.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $pull: { 
            fcmTokens: { 
              $or: [
                { $in: invalidTokens }, // For legacy string tokens
                { token: { $in: invalidTokens } } // For object tokens
              ]
            }
          }
        });
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

async function sendExpoNotification(token, title, body, data = {}) {
  try {
    if (!Expo.isExpoPushToken(token)) {
      logger.error(`Invalid Expo push token: ${token}`);
      return { success: false, error: 'Invalid token' };
    }

    const message = {
      to: token,
      sound: 'default',
      title,
      body,
      data,
      badge: 1,
      priority: 'high',
      channelId: 'default',
    };

    logger.info(`Sending Expo notification: ${title}`);
    
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];
    
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        logger.info(`Expo notification sent successfully`);
      } catch (error) {
        logger.error(`Error sending Expo notification chunk: ${error.message}`);
        return { success: false, error: error.message };
      }
    }

    return { success: true, tickets };
  } catch (err) {
    logger.error(`Error in sendExpoNotification: ${err.message}`, { stack: err.stack });
    return { success: false, error: err.message };
  }
}

async function sendNotificationToUser(userId, title, body, data = {}, io, imageUrl = null, profilePictureUrl = null) {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid userId in sendNotificationToUser: ${userId}`);
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User ${userId} not found for notification`);
      return;
    }

    const tokens = user.fcmTokens || [];
    if (tokens.length === 0) {
      logger.warn(`No tokens found for user ${userId}`);
      return;
    }

    // Check notification preferences
    const notificationType = data.type || 'general';
    if (user.notificationPreferences && user.notificationPreferences[notificationType] === false) {
      logger.info(`User ${userId} has disabled ${notificationType} notifications`);
      return;
    }

    logger.info(`Sending notifications to user ${userId} via ${tokens.length} token(s)`);

    // Send to all token types
    for (const tokenData of tokens) {
      try {
        if (typeof tokenData === 'string') {
          // Legacy FCM token
          await sendFCMNotification(userId, title, body, data, io, imageUrl, profilePictureUrl);
        } else if (tokenData.deviceType === 'expo') {
          // Expo push token
          const result = await sendExpoNotification(tokenData.token, title, body, data);
          if (!result.success) {
            logger.error(`Failed to send Expo notification to user ${userId}: ${result.error}`);
            
            // Remove invalid Expo tokens
            if (result.error === 'Invalid token') {
              await User.findByIdAndUpdate(userId, {
                $pull: { fcmTokens: { token: tokenData.token } }
              });
              logger.info(`Removed invalid Expo token for user ${userId}`);
            }
          }
        } else {
          // FCM token (web)
          await sendFCMNotification(userId, title, body, data, io, imageUrl, profilePictureUrl);
        }
      } catch (error) {
        logger.error(`Failed to send notification via ${tokenData.deviceType || 'fcm'} to user ${userId}: ${error.message}`);
      }
    }

    // Update notification counts for socket.io
    const counts = await NotificationService.getNotificationCounts(userId);
    io.to(`user_${userId}`).emit('badge-update', {
      type: notificationType,
      count: counts.notificationCount,
      userId
    });

  } catch (err) {
    logger.error(`Error in sendNotificationToUser for user ${userId}: ${err.message}`, { stack: err.stack });
  }
}

// Helper function to clean up invalid tokens
async function cleanupInvalidTokens(userId, invalidTokens) {
  try {
    await User.findByIdAndUpdate(userId, {
      $pull: { 
        fcmTokens: { 
          $or: [
            { $in: invalidTokens }, // For legacy string tokens
            { token: { $in: invalidTokens } } // For object tokens
          ]
        }
      }
    });
    logger.info(`Cleaned up ${invalidTokens.length} invalid tokens for user ${userId}`);
  } catch (error) {
    logger.error(`Error cleaning up tokens for user ${userId}: ${error.message}`);
  }
}

// Function to handle Expo receipt checking (optional - for production monitoring)
async function handleExpoReceipts(tickets) {
  try {
    const receiptIds = tickets.filter(ticket => ticket.id).map(ticket => ticket.id);
    
    if (receiptIds.length === 0) return;

    const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    
    for (const chunk of receiptIdChunks) {
      try {
        const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
        
        for (const receiptId in receipts) {
          const { status, details } = receipts[receiptId];
          
          if (status === 'error') {
            logger.error(`Expo notification error for receipt ${receiptId}:`, details);
            
            if (details && details.error === 'DeviceNotRegistered') {
              // Token is invalid, should be removed from database
              logger.info(`Device not registered for receipt ${receiptId}`);
            }
          }
        }
      } catch (error) {
        logger.error(`Error fetching Expo receipts: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error in handleExpoReceipts: ${error.message}`);
  }
}

module.exports = { 
  sendFCMNotification, 
  sendExpoNotification, 
  sendNotificationToUser,
  cleanupInvalidTokens,
  handleExpoReceipts
};