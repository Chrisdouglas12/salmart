const Notification = require('../models/notificationSchema.js');
const Message = require('../models/messageSchema.js'); // Ensure Message model exists
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
    const notificationCount = await Notification.countDocuments({ userId, isRead: false }).catch(err => {
      logger.error(`MongoDB query error for notifications: ${err.message}`);
      return 0;
    });
    const messagesCount = await Message.countDocuments({ receiverId: userId, status: 'sent' }).catch(err => {
      logger.error(`MongoDB query error for messages: ${err.message}`);
      return 0;
    });
    const counts = { notificationCount, messagesCount };
    logger.info(`Fetched counts for user ${userId}: ${JSON.stringify(counts)}`, { notificationCount, messagesCount });
    return counts;
  } catch (error) {
    logger.error(`Error fetching notification counts for user ${userId}: ${error.message}`);
    return { notificationCount: 0, messagesCount: 0 };
  }
};

const sendCountsToUser = async (io, userId, counts) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid user ID in sendCountsToUser: ${JSON.stringify(userId)}`);
      throw new Error('Invalid user ID');
    }
    logger.info(`Emitting countsUpdate to user ${userId}: ${JSON.stringify(counts)}`, { userId, ...counts });
    io.to(`user_${userId}`).emit('countsUpdate', { userId, ...counts });
    logger.info(`Emitted countsUpdate to user ${userId}`);
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

module.exports = {
  getNotificationCounts,
  sendCountsToUser,
  triggerCountUpdate,
};