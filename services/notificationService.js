//notificationService.js

const Notification = require('../models/notificationSchema.js');
const Message = require('../models/messageSchema.js'); 

const mongoose = require('mongoose');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/notificationService.log' }),
    new winston.transports.Console() // Log to terminal
  ]
});

const getNotificationCounts = async (userId) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid user ID in getNotificationCounts: ${JSON.stringify(userId)}`);
      throw new Error('Invalid user ID');
    }
    if (mongoose.connection.readyState !== 1) {
      logger.error(`MongoDB not connected: readyState=${mongoose.connection.readyState}`);
      throw new Error('Database connection lost');
    }
    
    // Count general unread alerts (all notifications except 'deal' and 'message')
    const notificationCount = await Notification.countDocuments({
      userId,
      isRead: false,
      type: { $nin: ['deal', 'message'] } // Exclude deals and messages from general alerts
    }).catch(err => {
      logger.error(`MongoDB query error for general notifications: ${err.message}`);
      return 0;
    });

    // Count unread messages
    const messagesCount = await Message.countDocuments({ 
  receiverId: userId, 
  status: { $in: ['sent', 'delivered'] } // Check both statuses
});


    // Count unread deal notifications
    const dealsCount = await Notification.countDocuments({
      userId,
      isRead: false,
      type: 'deal'
    }).catch(err => {
      logger.error(`MongoDB query error for deals: ${err.message}`);
      return 0;
    });

    // Calculate total badge count for React Native
    const totalCount = notificationCount + messagesCount + dealsCount;
    
    const counts = { notificationCount, messagesCount, dealsCount, totalCount };
    logger.info(`Fetched counts for user ${userId}: ${JSON.stringify(counts)}`, { userId, ...counts });
    return counts;
  } catch (error) {
    logger.error(`Error fetching notification counts for user ${userId}: ${error.message}`);
    return { notificationCount: 0, messagesCount: 0, dealsCount: 0, totalCount: 0 };
  }
};

// Enhanced function for React Native with badge updates
const sendCountsToUser = async (io, userId, counts) => {
  try {
    const countsWithTotal = {
      ...counts,
      totalCount: counts.totalCount || (counts.notificationCount + counts.messagesCount + counts.dealsCount)
    };

    // Single comprehensive emission
    io.to(`user_${userId}`).emit('badge-update', {
      userId,
      ...countsWithTotal,
      timestamp: new Date().toISOString()
    });

    logger.info(`Emitted badge update to user ${userId}: ${JSON.stringify(countsWithTotal)}`);
  } catch (error) {
    logger.error(`Error sending counts to user ${userId}: ${error.message}`);
  }
};

const triggerCountUpdate = async (io, userId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid user ID in triggerCountUpdate: ${JSON.stringify(userId)}`);
      throw new Error('Invalid user ID');
    }
    logger.info(`Triggering count update for user ${userId}`);
    const counts = await getNotificationCounts(userId);
    await sendCountsToUser(io, userId, counts);
    logger.info(`Triggered count update for user ${userId}: ${JSON.stringify(counts)}`, { userId, ...counts });
  } catch (error) {
    logger.error(`Error triggering count update for user ${userId}: ${error.message}`);
  }
};

// New function to get counts by type for React Native tab navigation
const getCountsByType = async (userId) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid user ID in getCountsByType: ${JSON.stringify(userId)}`);
      throw new Error('Invalid user ID');
    }

    const counts = await getNotificationCounts(userId);
    
    // Return structured data for React Native tab badges
    return {
      tabs: {
        notifications: counts.notificationCount,
        messages: counts.messagesCount,
        deals: counts.dealsCount
      },
      total: counts.totalCount,
      userId
    };
  } catch (error) {
    logger.error(`Error getting counts by type for user ${userId}: ${error.message}`);
    return {
      tabs: { notifications: 0, messages: 0, deals: 0 },
      total: 0,
      userId
    };
  }
};

// Function to update specific count type
const updateSpecificCount = async (io, userId, type) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid user ID in updateSpecificCount: ${userId}`);
      return;
    }

    let count = 0;
    
    switch (type) {
      case 'notifications':
        count = await Notification.countDocuments({
          userId,
          isRead: false,
          type: { $nin: ['deal', 'message'] }
        });
        break;
      case 'messages':
  count = await Message.countDocuments({ 
    receiverId: userId, 
    status: { $in: ['sent', 'delivered'] }
  });
  break;
      case 'deals':
        count = await Notification.countDocuments({
          userId,
          isRead: false,
          type: 'deal'
        });
        break;
      default:
        logger.warn(`Unknown count type: ${type}`);
        return;
    }

    // Emit specific count update
    io.to(`user_${userId}`).emit('count-update', {
      userId,
      type,
      count,
      timestamp: new Date().toISOString()
    });

    // Also trigger full count update to keep everything in sync
    await triggerCountUpdate(io, userId);
    
    logger.info(`Updated ${type} count for user ${userId}: ${count}`);
  } catch (error) {
    logger.error(`Error updating specific count for user ${userId}, type ${type}: ${error.message}`);
  }
};

// Function to reset counts (when user views notifications)
const resetCounts = async (io, userId, type = 'all') => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid user ID in resetCounts: ${userId}`);
      return;
    }

    switch (type) {
      case 'notifications':
        await Notification.updateMany(
          { userId, isRead: false, type: { $nin: ['deal', 'message'] } },
          { isRead: true }
        );
        break;
      case 'messages':
        await Message.updateMany(
  { receiverId: userId, status: { $in: ['sent', 'delivered'] } },
  { status: 'seen' } 
);
        break;
      case 'deals':
        await Notification.updateMany(
          { userId, isRead: false, type: 'deal' },
          { isRead: true }
        );
        break;
      case 'all':
        await Promise.all([
          Notification.updateMany(
            { userId, isRead: false },
            { isRead: true }
          ),
          Message.updateMany(
            { receiverId: userId, status: 'sent' },
            { status: 'read' }
          )
        ]);
        break;
    }

    // Trigger count update after reset
    await triggerCountUpdate(io, userId);
    
    logger.info(`Reset ${type} counts for user ${userId}`);
  } catch (error) {
    logger.error(`Error resetting counts for user ${userId}, type ${type}: ${error.message}`);
  }
};

// Function to emit real-time notification for React Native
const emitRealTimeNotification = async (io, userId, notification) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid user ID in emitRealTimeNotification: ${userId}`);
      return;
    }

    // Emit real-time notification
    io.to(`user_${userId}`).emit('newNotification', {
      ...notification,
      userId,
      timestamp: new Date().toISOString()
    });

    // Update counts after new notification
    await triggerCountUpdate(io, userId);
    
    logger.info(`Emitted real-time notification to user ${userId}: ${notification.type}`);
  } catch (error) {
    logger.error(`Error emitting real-time notification for user ${userId}: ${error.message}`);
  }
};

module.exports = {
  getNotificationCounts,
  sendCountsToUser,
  triggerCountUpdate,
  getCountsByType,
  updateSpecificCount,
  resetCounts,
  emitRealTimeNotification
};