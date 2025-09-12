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

// 🔧 NEW: Token type detection and validation
function detectTokenType(token) {
  if (!token || typeof token !== 'string') {
    return 'invalid';
  }
  
  // Check for Expo token pattern
  if (token.startsWith('ExponentPushToken[') && token.endsWith(']')) {
    return 'expo';
  }
  
  // Check if it's a valid Expo token using Expo SDK
  if (Expo.isExpoPushToken(token)) {
    return 'expo';
  }
  
  // Check for FCM token characteristics
  if (token.length > 100 && !token.includes('[') && !token.includes(']')) {
    return 'fcm';
  }
  
  return 'invalid';
}

function validateFCMToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Must be reasonably long (FCM tokens are usually 140+ chars)
  if (token.length < 100) {
    return false;
  }
  
  // Should not contain brackets (Expo tokens do)
  if (token.includes('[') || token.includes(']')) {
    return false;
  }
  
  // Exclude obvious non-FCM tokens
  const excludePatterns = [
    /^ExponentPushToken/,
    /^test_?token/i,
    /^fake_?token/i,
    /^dummy/i,
    /^\s*$/
  ];
  
  for (const pattern of excludePatterns) {
    if (pattern.test(token)) {
      return false;
    }
  }
  
  return true;
}

function validateExpoToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  return Expo.isExpoPushToken(token);
}

// 🔧 UPDATED: FCM notification function
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
      
      // Filter for FCM tokens only
      const allTokens = user.fcmTokens || [];
      fcmTokens = allTokens.filter(tokenData => {
        const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
        const tokenType = detectTokenType(token);
        return tokenType === 'fcm' && validateFCMToken(token);
      }).map(tokenData => typeof tokenData === 'string' ? tokenData : tokenData.token);
      
    } else if (Array.isArray(tokens)) {
      // New: tokens array parameter - only get FCM tokens
      fcmTokens = tokens.filter(tokenData => {
        const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
        const tokenType = detectTokenType(token);
        return tokenType === 'fcm' && validateFCMToken(token);
      }).map(tokenData => typeof tokenData === 'string' ? tokenData : tokenData.token);
      
      userId = data.receiverId || data.userId;
    } else {
      logger.error('Invalid tokens parameter in sendFCMNotification');
      return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: 'Invalid tokens parameter' };
    }

    if (fcmTokens.length === 0) {
      logger.info(`No valid FCM tokens available for sending notification`);
      return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: 'No valid FCM tokens' };
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

    // FCM message payload
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

    // Handle failures
    const invalidTokens = [];
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          logger.error(`FCM error for token ${idx}: ${resp.error.code}`);
          
          // Mark as invalid for specific error codes
          if (resp.error.code === 'messaging/registration-token-not-registered' ||
              resp.error.code === 'messaging/invalid-registration-token') {
            invalidTokens.push(fcmTokens[idx]);
          }
        }
      });

      // Clean up invalid tokens
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

// 🔧 UPDATED: Expo notification function
async function sendExpoNotification(tokens, title, body, data = {}, imageUrl = null, profilePictureUrl = null) {
  try {
    let expoTokens = [];

    if (Array.isArray(tokens)) {
      // Filter for Expo tokens only
      expoTokens = tokens.filter(tokenData => {
        const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
        const tokenType = detectTokenType(token);
        return tokenType === 'expo' && validateExpoToken(token);
      }).map(tokenData => typeof tokenData === 'string' ? tokenData : tokenData.token);
    } else if (typeof tokens === 'string') {
      if (validateExpoToken(tokens)) {
        expoTokens = [tokens];
      }
    }

    if (expoTokens.length === 0) {
      logger.info(`No valid Expo tokens available for sending notification`);
      return { success: false, successCount: 0, failureCount: 0, invalidTokens: [], error: 'No valid Expo tokens' };
    }

    logger.info(`Sending Expo notification to ${expoTokens.length} tokens: ${title}`);

    const messages = expoTokens.map(token => ({
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
    }));

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
            logger.error(`Expo error for token ${index}: ${ticket.details?.error || 'Unknown error'}`);
            if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
              invalidTokens.push(expoTokens[index]);
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

    logger.info(`Expo notification result - Success: ${successCount}, Failure: ${failureCount}`);

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

// 🔧 UPDATED: Main notification function with proper token separation
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

    // 🔧 NEW: Separate tokens by detected type
    const fcmTokens = [];
    const expoTokens = [];

    tokens.forEach(tokenData => {
      const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
      const tokenType = detectTokenType(token);
      
      if (tokenType === 'fcm') {
        fcmTokens.push(tokenData);
      } else if (tokenType === 'expo') {
        expoTokens.push(tokenData);
      } else {
        logger.warn(`Unknown token type for token: ${token.substring(0, 20)}...`);
      }
    });

    const results = [];

    // Send FCM notifications
    if (fcmTokens.length > 0) {
      logger.info(`Sending FCM notifications to ${fcmTokens.length} tokens`);
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
      logger.info(`Sending Expo notifications to ${expoTokens.length} tokens`);
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

// 🔧 UPDATED: Token cleanup function
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
  validateFCMToken,
  validateExpoToken,
  detectTokenType
};