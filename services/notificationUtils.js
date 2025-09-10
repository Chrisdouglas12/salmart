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

// 📢 UPDATED: Enhanced FCM notification function to handle token arrays and rich content
async function sendFCMNotification(tokens, title, body, data = {}, io, imageUrl = null, profilePictureUrl = null, groupId = null) {
  try {
    // Handle both legacy userId parameter and new tokens array parameter
    let fcmTokens = [];
    let userId = null;

    if (typeof tokens === 'string' && mongoose.Types.ObjectId.isValid(tokens)) {
      // Legacy: first parameter is userId
      userId = tokens;
      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User ${userId} not found for FCM notification`);
        return;
      }
      
      const allTokens = user.fcmTokens || [];
      fcmTokens = allTokens.filter(tokenData => {
        if (typeof tokenData === 'string') return true;
        return tokenData.deviceType === 'fcm' || !tokenData.deviceType;
      }).map(tokenData => typeof tokenData === 'string' ? tokenData : tokenData.token);
      
    } else if (Array.isArray(tokens)) {
      // New: tokens array parameter
      fcmTokens = tokens.filter(tokenData => {
        if (typeof tokenData === 'string') return true;
        return (tokenData.deviceType === 'fcm' || !tokenData.deviceType) && tokenData.token;
      }).map(tokenData => typeof tokenData === 'string' ? tokenData : tokenData.token);
      
      // Extract userId from data if available
      userId = data.receiverId || data.userId;
    } else {
      logger.error('Invalid tokens parameter in sendFCMNotification');
      return;
    }

    if (fcmTokens.length === 0) {
      logger.warn(`No FCM tokens available`);
      return;
    }

    // Check notification preferences if userId is available
    if (userId) {
      const user = await User.findById(userId);
      const notificationType = data.type || 'general';
      if (user && user.notificationPreferences && user.notificationPreferences[notificationType] === false) {
        logger.info(`User ${userId} has disabled ${notificationType} notifications`);
        return;
      }
    }

    // 📢 NEW: Enhanced message payload with rich content support
    const baseMessage = {
      notification: { 
        title, 
        body,
        // 📢 NEW: Add image to notification for supported platforms
        ...(imageUrl && { image: imageUrl })
      },
      data: { 
        ...data, 
        ...(userId && { userId: userId.toString() }),
        // 📢 NEW: Add rich content data
        ...(imageUrl && { imageUrl }),
        ...(profilePictureUrl && { profilePictureUrl }),
        ...(groupId && { groupId })
      }
    };

    // 📢 NEW: Platform-specific configurations
    const androidConfig = {
      priority: 'high',
      notification: {
        title,
        body,
        icon: 'ic_notification',
        color: '#00A86B',
        sound: 'default',
        // 📢 NEW: Enhanced Android notification features
        channelId: data.type === 'message' ? 'chat_messages' : 'default',
        ...(groupId && { 
          tag: groupId,
          group: 'chat_messages' 
        }),
        ...(profilePictureUrl && { largeIcon: profilePictureUrl }),
        ...(imageUrl && { 
          bigPicture: imageUrl,
          style: 'bigPicture'
        })
      }
    };

    const iosConfig = {
      headers: { 
        'apns-priority': '10',
        'apns-push-type': 'alert'
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          badge: 1,
          // 📢 NEW: iOS-specific features
          ...(data.chatId && { 'thread-id': data.chatId }),
          category: 'CHAT_MESSAGE',
          'mutable-content': 1
        },
        // 📢 NEW: Custom data for rich notifications
        ...(imageUrl && { imageUrl }),
        ...(profilePictureUrl && { profilePictureUrl })
      }
    };

    const webConfig = {
      headers: { Urgency: 'high' },
      notification: {
        icon: profilePictureUrl || 'https://salmartonline.com.ng/salmart-192x192.png',
        image: imageUrl || null,
        requireInteraction: true,
        // 📢 NEW: Web notification enhancements
        badge: 'https://salmartonline.com.ng/salmart-96x96.png',
        ...(data.chatId && { tag: data.chatId }) // Group notifications by chat
      }
    };

    const message = {
      ...baseMessage,
      android: androidConfig,
      apns: iosConfig,
      webpush: webConfig
    };

    logger.info(`Preparing enhanced FCM message with ${fcmTokens.length} FCM tokens.`);

    // 📢 NEW: Send with enhanced error handling
    const response = await admin.messaging().sendEachForMulticast({ 
      ...message, 
      tokens: fcmTokens 
    });

    logger.info(`FCM notification sent: ${title}. Success: ${response.successCount}, Failure: ${response.failureCount}`);

    // Handle invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens = [];
      const expiredTokens = [];
      
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          logger.error(`Failed to send FCM to token ${fcmTokens[idx].substring(0, 20)}...: ${resp.error.code}`);
          
          switch (resp.error.code) {
            case 'messaging/registration-token-not-registered':
            case 'messaging/invalid-argument':
            case 'messaging/invalid-registration-token':
              invalidTokens.push(fcmTokens[idx]);
              break;
            case 'messaging/message-rate-exceeded':
            case 'messaging/device-message-rate-exceeded':
              logger.warn(`Rate limit exceeded for token ${fcmTokens[idx].substring(0, 20)}...`);
              break;
            default:
              logger.error(`Unexpected FCM error: ${resp.error.code}`);
          }
        }
      });

      // 📢 NEW: Clean up invalid tokens
      if (invalidTokens.length > 0 && userId) {
        await cleanupInvalidTokens(userId, invalidTokens);
      }
    }

    // Update notification counts and emit badge-update if userId is available
    if (userId && io) {
      try {
        const counts = await NotificationService.getNotificationCounts(userId);
        io.to(`user_${userId}`).emit('badge-update', {
          type: data.type || 'general',
          count: counts.notificationCount,
          userId
        });
        logger.info(`Emitted badge-update for user ${userId}: count=${counts.notificationCount}`);
      } catch (error) {
        logger.error(`Error updating badge for user ${userId}: ${error.message}`);
      }
    }

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens: invalidTokens || []
    };

  } catch (err) {
    logger.error(`Error in sendFCMNotification: ${err.message}`, { stack: err.stack });
    return { success: false, error: err.message };
  }
}

// 📢 ENHANCED: Expo notification with rich content support
async function sendExpoNotification(tokens, title, body, data = {}, imageUrl = null, profilePictureUrl = null) {
  try {
    // Handle single token or token array
    const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
    const expoTokens = tokenArray.filter(tokenData => {
      const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
      return Expo.isExpoPushToken(token);
    });

    if (expoTokens.length === 0) {
      logger.warn('No valid Expo tokens provided');
      return { success: false, error: 'No valid tokens' };
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
          // 📢 NEW: Rich content data for Expo
          ...(imageUrl && { imageUrl }),
          ...(profilePictureUrl && { profilePictureUrl }),
          // 📢 NEW: WhatsApp-like data structure
          messageType: data.messageType || 'text',
          chatId: data.chatId || data.chatRoomId,
          senderId: data.senderId,
          timestamp: data.timestamp || new Date().toISOString()
        },
        badge: 1,
        priority: 'high',
        // 📢 NEW: Use appropriate channel based on message type
        channelId: data.type === 'message' ? 'chat_messages' : 'default',
        // 📢 NEW: Grouping support
        ...(data.chatId && { 
          categoryId: 'chat',
          groupId: data.chatId 
        })
      };
    });

    logger.info(`Sending ${messages.length} Expo notifications: ${title}`);

    const chunks = expo.chunkPushNotifications(messages);
    const allTickets = [];
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        allTickets.push(...ticketChunk);
        
        // 📢 NEW: Count successes and failures
        ticketChunk.forEach((ticket, index) => {
          if (ticket.status === 'error') {
            failureCount++;
            logger.error(`Expo notification error: ${ticket.message}`);
            
            // 📢 NEW: Track invalid tokens
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
        logger.error(`Error sending Expo notification chunk: ${error.message}`);
        failureCount += chunk.length;
      }
    }

    logger.info(`Expo notifications sent. Success: ${successCount}, Failure: ${failureCount}`);

    return { 
      success: successCount > 0, 
      tickets: allTickets,
      successCount,
      failureCount,
      invalidTokens
    };

  } catch (err) {
    logger.error(`Error in sendExpoNotification: ${err.message}`, { stack: err.stack });
    return { success: false, error: err.message };
  }
}

// 📢 ENHANCED: Main notification function with better token handling
async function sendNotificationToUser(userId, title, body, data = {}, io, imageUrl = null, profilePictureUrl = null, groupId = null) {
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

    // 📢 NEW: Separate tokens by type for batch processing
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

      // 📢 NEW: Clean up invalid Expo tokens
      if (expoResult.invalidTokens && expoResult.invalidTokens.length > 0) {
        await cleanupInvalidTokens(userId, expoResult.invalidTokens);
      }
    }

    // Update notification counts for socket.io
    if (io) {
      try {
        const counts = await NotificationService.getNotificationCounts(userId);
        io.to(`user_${userId}`).emit('badge-update', {
          type: notificationType,
          count: counts.notificationCount,
          userId
        });
      } catch (error) {
        logger.error(`Error updating badge for user ${userId}: ${error.message}`);
      }
    }

    return results;

  } catch (err) {
    logger.error(`Error in sendNotificationToUser for user ${userId}: ${err.message}`, { stack: err.stack });
    return [{ success: false, error: err.message }];
  }
}

// 📢 ENHANCED: Token cleanup function
async function cleanupInvalidTokens(userId, invalidTokens) {
  try {
    if (!invalidTokens || invalidTokens.length === 0) return;

    const result = await User.findByIdAndUpdate(userId, {
      $pull: { 
        fcmTokens: { 
          $or: [
            { $in: invalidTokens }, // For legacy string tokens
            { token: { $in: invalidTokens } } // For object tokens
          ]
        }
      }
    });

    if (result) {
      logger.info(`Cleaned up ${invalidTokens.length} invalid tokens for user ${userId}`);
    }
  } catch (error) {
    logger.error(`Error cleaning up tokens for user ${userId}: ${error.message}`);
  }
}

// 📢 ENHANCED: Expo receipt handling with better error management
async function handleExpoReceipts(tickets) {
  try {
    const receiptIds = tickets
      .filter(ticket => ticket.status === 'ok' && ticket.id)
      .map(ticket => ticket.id);
    
    if (receiptIds.length === 0) {
      logger.info('No receipt IDs to check');
      return;
    }

    logger.info(`Checking ${receiptIds.length} Expo receipts`);

    const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    
    for (const chunk of receiptIdChunks) {
      try {
        const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
        
        for (const receiptId in receipts) {
          const { status, details } = receipts[receiptId];
          
          if (status === 'error') {
            logger.error(`Expo notification error for receipt ${receiptId}:`, {
              error: details?.error,
              message: details?.message
            });
            
            // 📢 NEW: Handle different error types
            if (details && details.error) {
              switch (details.error) {
                case 'DeviceNotRegistered':
                  logger.info(`Device not registered for receipt ${receiptId} - token should be cleaned up`);
                  break;
                case 'MessageTooBig':
                  logger.warn(`Message too big for receipt ${receiptId}`);
                  break;
                case 'MessageRateExceeded':
                  logger.warn(`Message rate exceeded for receipt ${receiptId}`);
                  break;
                default:
                  logger.error(`Unknown Expo error: ${details.error}`);
              }
            }
          } else if (status === 'ok') {
            logger.debug(`Expo notification delivered successfully: ${receiptId}`);
          }
        }
      } catch (error) {
        logger.error(`Error fetching Expo receipts for chunk: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error in handleExpoReceipts: ${error.message}`);
  }
}

// 📢 NEW: Batch notification function for multiple users
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
  handleExpoReceipts,
  sendBatchNotifications // 📢 NEW: Export batch function
};