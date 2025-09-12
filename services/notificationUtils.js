// services/notificationUtils.js
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

// 🔧 SIMPLIFIED: Much more permissive FCM token validation
function validateFCMToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Minimum reasonable length check (Firebase tokens are usually 140+ chars)
  if (token.length < 100) {
    return false;
  }
  
  // Only exclude obvious non-FCM tokens - much more permissive
  const excludePatterns = [
    /^ExponentPushToken/,  // Expo tokens
    /^test_?token/i,       // Test tokens
    /^fake_?token/i,       // Fake tokens
    /^dummy/i,             // Dummy tokens
    /^\s*$/                // Empty/whitespace tokens
  ];
  
  for (const pattern of excludePatterns) {
    if (pattern.test(token)) {
      return false;
    }
  }
  
  return true;
}

// 🔧 SIMPLIFIED: FCM notification function with minimal validation
async function sendFCMNotification(tokens, title, body, data = {}, io, imageUrl = null, profilePictureUrl = null, groupId = null) {
  try {
    let fcmTokens = [];
    let userId = null;

    // Handle both legacy userId parameter and new tokens array parameter
    if (typeof tokens === 'string' && mongoose.Types.ObjectId.isValid(tokens)) {
      // Legacy: first parameter is userId
      userId = tokens;
      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User ${userId} not found for FCM notification`);
        return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: 'User not found' };
      }
      
      // Much more lenient token filtering
      const allTokens = user.fcmTokens || [];
      fcmTokens = allTokens.filter(tokenData => {
        const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
        return validateFCMToken(token);
      }).map(tokenData => typeof tokenData === 'string' ? tokenData : tokenData.token);
      
    } else if (Array.isArray(tokens)) {
      // New: tokens array parameter
      fcmTokens = tokens.filter(tokenData => {
        const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
        // Only validate if it's intended to be an FCM token
        return (tokenData.deviceType === 'fcm' || !tokenData.deviceType) && validateFCMToken(token);
      }).map(tokenData => typeof tokenData === 'string' ? tokenData : tokenData.token);
      
      userId = data.receiverId || data.userId;
    } else {
      logger.error('Invalid tokens parameter in sendFCMNotification');
      return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: 'Invalid tokens parameter' };
    }

    if (fcmTokens.length === 0) {
      logger.warn(`No valid FCM tokens available for sending notification`);
      return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: 'No valid tokens' };
    }

    // Check notification preferences
    if (userId) {
      const user = await User.findById(userId);
      const notificationType = data.type || 'general';
      if (user && user.notificationPreferences && user.notificationPreferences[notificationType] === false) {
        logger.info(`User ${userId} has disabled ${notificationType} notifications`);
        return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: 'Notifications disabled' };
      }
    }

    // Simplified message payload
    const message = {
      notification: { 
        title, 
        body,
        ...(imageUrl && { image: imageUrl })
      },
      data: { 
        ...data, 
        ...(userId && { userId: userId.toString() }),
        ...(imageUrl && { imageUrl }),
        ...(profilePictureUrl && { profilePictureUrl }),
        ...(groupId && { groupId })
      },
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          icon: 'ic_notification',
          color: '#00A86B',
          sound: 'default',
          channelId: data.type === 'message' ? 'chat_messages' : 'default'
        }
      },
      apns: {
        headers: { 
          'apns-priority': '10'
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    logger.info(`Sending FCM notification to ${fcmTokens.length} tokens: ${title}`);

    // Send notification
    const response = await admin.messaging().sendEachForMulticast({ 
      ...message, 
      tokens: fcmTokens 
    });

    logger.info(`FCM notification result - Success: ${response.successCount}, Failure: ${response.failureCount}`);

    // Handle failures with less aggressive token cleanup
    const invalidTokens = [];
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          logger.error(`FCM error for token ${idx}: ${resp.error.code}`);
          
          // Only mark as invalid for specific error codes that definitely indicate bad tokens
          if (resp.error.code === 'messaging/registration-token-not-registered' ||
              resp.error.code === 'messaging/invalid-registration-token') {
            invalidTokens.push(fcmTokens[idx]);
          }
        }
      });

      // Clean up only definitely invalid tokens
      if (invalidTokens.length > 0 && userId) {
        await cleanupInvalidTokens(userId, invalidTokens);
      }
    }

    // Update badge count
    if (userId && io) {
      try {
        const counts = await NotificationService.getNotificationCounts(userId);
        io.to(`user_${userId}`).emit('badge-update', {
          type: data.type || 'general',
          count: counts.notificationCount,
          userId
        });
      } catch (error) {
        logger.error(`Error updating badge for user ${userId}: ${error.message}`);
      }
    }

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens: invalidTokens
    };

  } catch (err) {
    logger.error(`Error in sendFCMNotification: ${err.message}`);
    return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: err.message };
  }
}

// Simplified Expo notification
async function sendExpoNotification(tokens, title, body, data = {}, imageUrl = null, profilePictureUrl = null) {
  try {
    const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
    const expoTokens = tokenArray.filter(tokenData => {
      const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
      return Expo.isExpoPushToken(token);
    });

    if (expoTokens.length === 0) {
      return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: 'No valid tokens' };
    }

    const messages = expoTokens.map(tokenData => {
      const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
      
      return {
        to: token,
        sound: 'default',
        title,
        body,
        data: {
          ...data,
          ...(imageUrl && { imageUrl }),
          ...(profilePictureUrl && { profilePictureUrl })
        },
        badge: 1,
        priority: 'high'
      };
    });

    const chunks = expo.chunkPushNotifications(messages);
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        
        ticketChunk.forEach((ticket, index) => {
          if (ticket.status === 'error') {
            failureCount++;
            if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
              const tokenData = chunk[index];
              const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
              invalidTokens.push(token);
            }
          } else {
            successCount++;
          }
        });
        
      } catch (error) {
        logger.error(`Error sending Expo chunk: ${error.message}`);
        failureCount += chunk.length;
      }
    }

    return { 
      success: successCount > 0, 
      successCount,
      failureCount,
      invalidTokens
    };

  } catch (err) {
    logger.error(`Error in sendExpoNotification: ${err.message}`);
    return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: err.message };
  }
}

// Simplified main notification function
async function sendNotificationToUser(userId, title, body, data = {}, io, imageUrl = null, profilePictureUrl = null, groupId = null) {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return [{ success: false, error: 'Invalid user ID' }];
    }

    const user = await User.findById(userId);
    if (!user) {
      return [{ success: false, error: 'User not found' }];
    }

    const tokens = user.fcmTokens || [];
    if (tokens.length === 0) {
      return [{ success: false, error: 'No tokens found' }];
    }

    // Check notification preferences
    const notificationType = data.type || 'general';
    if (user.notificationPreferences && user.notificationPreferences[notificationType] === false) {
      return [{ success: false, error: 'Notifications disabled' }];
    }

    // Separate tokens by type
    const fcmTokens = tokens.filter(tokenData => {
      if (typeof tokenData === 'string') return true;
      return tokenData.deviceType === 'fcm' || !tokenData.deviceType;
    });

    const expoTokens = tokens.filter(tokenData => {
      return typeof tokenData === 'object' && tokenData.deviceType === 'expo';
    });

    const results = [];

    // Send FCM notifications
    if (fcmTokens.length > 0) {
      const fcmResult = await sendFCMNotification(
        fcmTokens, 
        title, 
        body, 
        { ...data, userId: userId.toString() }, 
        io, 
        imageUrl, 
        profilePictureUrl, 
        groupId
      );
      results.push({ type: 'fcm', ...fcmResult });
    }

    // Send Expo notifications
    if (expoTokens.length > 0) {
      const expoResult = await sendExpoNotification(
        expoTokens, 
        title, 
        body, 
        { ...data, userId: userId.toString() }, 
        imageUrl, 
        profilePictureUrl
      );
      results.push({ type: 'expo', ...expoResult });

      if (expoResult.invalidTokens && expoResult.invalidTokens.length > 0) {
        await cleanupInvalidTokens(userId, expoResult.invalidTokens);
      }
    }

    return results;

  } catch (err) {
    logger.error(`Error in sendNotificationToUser: ${err.message}`);
    return [{ success: false, error: err.message }];
  }
}

// Simplified token cleanup - less aggressive
async function cleanupInvalidTokens(userId, invalidTokens) {
  try {
    if (!invalidTokens || invalidTokens.length === 0) {
      return;
    }

    logger.info(`Cleaning up ${invalidTokens.length} invalid tokens for user ${userId}`);

    const user = await User.findById(userId);
    if (!user || !user.fcmTokens) {
      return;
    }

    const originalCount = user.fcmTokens.length;
    
    user.fcmTokens = user.fcmTokens.filter(tokenData => {
      const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
      return !invalidTokens.includes(token);
    });
    
    const removedCount = originalCount - user.fcmTokens.length;
    
    if (removedCount > 0) {
      await user.save();
      logger.info(`Removed ${removedCount} invalid tokens for user ${userId}`);
    }

  } catch (error) {
    logger.error(`Error cleaning up tokens for user ${userId}: ${error.message}`);
  }
}

// Batch notification function
async function sendBatchNotifications(userIds, title, body, data = {}, io, imageUrl = null, profilePictureUrl = null) {
  try {
    logger.info(`Sending batch notifications to ${userIds.length} users: ${title}`);
    
    const results = await Promise.allSettled(
      userIds.map(userId => 
        sendNotificationToUser(userId, title, body, data, io, imageUrl, profilePictureUrl)
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info(`Batch notification results: ${successful} successful, ${failed} failed`);
    
    return { successful, failed, results };
  } catch (error) {
    logger.error(`Error in sendBatchNotifications: ${error.message}`);
    return { successful: 0, failed: userIds.length, error: error.message };
  }
}

module.exports = { 
  sendFCMNotification, 
  sendExpoNotification, 
  sendNotificationToUser,
  cleanupInvalidTokens,
  sendBatchNotifications,
  validateFCMToken
};