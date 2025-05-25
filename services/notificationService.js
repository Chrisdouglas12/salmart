// NotificationService.js
const Notification = require('../models/notificationSchema.js');
const mongoose = require('mongoose')

const getNotificationCounts = async (userId) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }
    const counts = {
      notificationCount: await Notification.countDocuments({ userId, read: false }),
    };
    console.log('Fetched counts for user:', { userId, counts });
    return counts;
  } catch (error) {
    console.error('Error fetching notification counts:', error.message);
    throw error;
  }
};

const sendCountsToUser = async (io, userId, counts) => {
  try {
    console.log('Sending counts to user:', { userId, counts });
    io.to(`user_${userId}`).emit('countsUpdate', counts);
  } catch (error) {
    console.error('Error sending counts:', error.message);
    throw error;
  }
};

const triggerCountUpdate = async (io, userId) => {
  try {
    const counts = await getNotificationCounts(userId);
    await sendCountsToUser(io, userId, counts);
  } catch (error) {
    console.error('Error triggering count update:', error.message);
    throw error;
  }
};

module.exports = {
  getNotificationCounts,
  sendCountsToUser,
  triggerCountUpdate,
};