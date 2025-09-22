// socketRoutes.js - Fixed Version with Clean Notifications
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/userSchema.js');
const Message = require('../models/messageSchema.js');
const NotificationService = require('../services/notificationService.js');
const { sendNotificationToUser } = require('../services/notificationUtils.js');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/socket-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/socket.log' }),
    ...(process.env.NODE_ENV !== 'production' ? [new winston.transports.Console()] : [])
  ]
});

// Simple user socket management
class SocketManager {
  constructor() {
    this.userSocketMap = new Map();
    this.socketUserMap = new Map();
  }

  addConnection(userId, socketId) {
    const oldSocketId = this.userSocketMap.get(userId);
    if (oldSocketId && oldSocketId !== socketId) {
      this.socketUserMap.delete(oldSocketId);
    }
    
    this.userSocketMap.set(userId, socketId);
    this.socketUserMap.set(socketId, userId);
  }

  removeConnection(socketId) {
    const userId = this.socketUserMap.get(socketId);
    if (userId) {
      this.userSocketMap.delete(userId);
      this.socketUserMap.delete(socketId);
    }
    return userId;
  }

  getUserSocket(userId) {
    return this.userSocketMap.get(userId);
  }

  isUserOnline(userId) {
    return this.userSocketMap.has(userId);
  }
}

const socketManager = new SocketManager();

// Simple rate limiting
const rateLimits = new Map();
const checkRateLimit = (userId, eventType, limit = 50) => {
  const key = `${userId}:${eventType}`;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  
  if (!rateLimits.has(key)) {
    rateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const rateData = rateLimits.get(key);
  if (now > rateData.resetTime) {
    rateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (rateData.count >= limit) {
    return false;
  }
  
  rateData.count++;
  return true;
};

// FIXED: Clean notification message formatting
const formatNotificationMessage = (messageType, text, offerDetails) => {
  const maxLength = 80; // Reduced to prevent truncation
  let notificationText = '';

  switch (messageType) {
    case 'image':
      notificationText = 'Photo';
      break;
    case 'video':
      notificationText = 'Video';
      break;
    case 'audio':
      notificationText = 'Audio message';
      break;
    case 'document':
      notificationText = 'Document';
      break;
    case 'location':
      notificationText = 'Location';
      break;
    case 'offer':
    case 'counter-offer':
      if (offerDetails?.proposedPrice) {
        const price = Number(offerDetails.proposedPrice).toLocaleString('en-NG');
        notificationText = `Offer: ₦${price}`;
      } else {
        notificationText = 'Made an offer';
      }
      break;
    default:
      if (text && typeof text === 'string') {
        // Clean the text - remove any JSON formatting or special characters
        notificationText = text.trim()
          .replace(/[{}"\[\]]/g, '') // Remove JSON characters
          .replace(/\\n/g, ' ') // Replace newlines with spaces
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim();
      } else {
        notificationText = 'New message';
      }
  }

  // Clean truncation with proper ellipsis
  if (notificationText.length > maxLength) {
    notificationText = notificationText.substring(0, maxLength - 1).trim() + '…';
  }

  return notificationText;
};

/**
 * FIXED: Clean unified notification function
 */
const sendMessageNotification = async (messageData, senderName, notificationText, io, imageUrl, senderProfilePicture) => {
  try {
    if (!messageData.receiverId) {
      return { success: false, error: 'Missing receiverId' };
    }

    // Check if user is online first
    const receiverIsOnline = socketManager.isUserOnline(messageData.receiverId);
    if (receiverIsOnline) {
      logger.info(`User ${messageData.receiverId} is online, skipping push notification`);
      return { success: true, reason: 'User online, notification skipped' };
    }

    const receiver = await User.findById(messageData.receiverId)
      .select('fcmTokens notificationPreferences')
      .lean();
    
    if (!receiver) {
      return { success: false, error: 'Receiver not found' };
    }

    // Check notification preferences
    if (receiver.notificationPreferences?.messages === false) {
      return { success: false, error: 'Notifications disabled' };
    }

    const tokens = receiver.fcmTokens || [];
    if (tokens.length === 0) {
      return { success: false, error: 'No notification tokens' };
    }

    // FIXED: Clean data payload structure
    const dataPayload = {
      type: 'message',
      senderId: messageData.senderId || '',
      receiverId: messageData.receiverId,
      messageId: messageData._id || '',
      chatId: [messageData.senderId, messageData.receiverId].sort().join('_'),
      messageType: messageData.messageType || 'text',
      timestamp: new Date().toISOString(),
      senderName: senderName,
      // Store clean message text separately
      messageText: messageData.text || '',
      ...(imageUrl && { imageUrl }),
      ...(senderProfilePicture && { profilePictureUrl: senderProfilePicture })
    };

    // FIXED: Send clean notification
    const results = await sendNotificationToUser(
      messageData.receiverId,
      senderName, // Clean sender name as title
      notificationText, // Clean formatted text as body
      dataPayload, // Clean structured data
      io,
      imageUrl,
      senderProfilePicture
    );

    // Check if any notifications were sent successfully
    const anySuccess = results.some(result => result.success);
    const successCount = results.reduce((sum, result) => sum + (result.successCount || 0), 0);
    const failureCount = results.reduce((sum, result) => sum + (result.failureCount || 0), 0);

    logger.info(`Message notification result for user ${messageData.receiverId}: Success: ${successCount}, Failure: ${failureCount}`);

    return {
      success: anySuccess,
      successCount,
      failureCount,
      results,
      ...(anySuccess ? {} : { error: 'All notifications failed' })
    };

  } catch (error) {
    logger.error(`Error in sendMessageNotification: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// Simple input validation
const validateMessage = (messageData, senderId) => {
  if (!senderId || !messageData.receiverId) {
    return 'Missing senderId or receiverId';
  }
  
  if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(messageData.receiverId)) {
    return 'Invalid user ID format';
  }
  
  if (senderId === messageData.receiverId) {
    return 'Cannot send message to yourself';
  }
  
  const { messageType = 'text', text, attachment, offerDetails } = messageData;
  
  switch (messageType) {
    case 'text':
      if (!text || text.trim().length === 0) {
        return 'Text message cannot be empty';
      }
      if (text.length > 5000) {
        return 'Message too long';
      }
      break;
      
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      if (!attachment?.url) {
        return 'Attachment URL required';
      }
      break;
      
    case 'offer':
    case 'counter-offer':
      if (!offerDetails?.proposedPrice || offerDetails.proposedPrice <= 0) {
        return 'Valid price required for offers';
      }
      break;
      
    case 'location':
      if (!attachment?.latitude || !attachment?.longitude) {
        return 'Location coordinates required';
      }
      break;
  }
  
  return null; // No errors
};

const initializeSocket = (io) => {
  logger.info('Initializing Socket.IO handlers');

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId || decoded._id;
      
      if (!userId) {
        return next(new Error('Invalid token'));
      }

      const user = await User.findById(userId).select('_id status').lean();
      if (!user) {
        return next(new Error('User not found'));
      }
      
      if (user.status === 'banned' || user.status === 'suspended') {
        return next(new Error('Account suspended'));
      }

      socket.user = { id: userId };
      next();
    } catch (error) {
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    logger.info(`Client connected: ${socket.id} (User: ${userId})`);

    socketManager.addConnection(userId, socket.id);
    socket.join(`user_${userId}`);

    // Send initial notification counts
    NotificationService.triggerCountUpdate(io, userId).catch(err => 
      logger.error(`Error sending initial counts: ${err.message}`)
    );

    // Join user room
    socket.on('joinRoom', async (roomUserId) => {
      try {
        if (!checkRateLimit(userId, 'joinRoom')) {
          return;
        }

        if (userId !== roomUserId || !mongoose.Types.ObjectId.isValid(roomUserId)) {
          return;
        }

        socket.join(`user_${roomUserId}`);
        await NotificationService.triggerCountUpdate(io, roomUserId);
      } catch (error) {
        logger.error(`Error in joinRoom: ${error.message}`);
      }
    });

    // Join chat room
    socket.on('joinChatRoom', (chatRoomId) => {
      try {
        if (!checkRateLimit(userId, 'joinChatRoom')) {
          return;
        }

        if (!chatRoomId || typeof chatRoomId !== 'string') {
          return;
        }

        const [id1, id2] = chatRoomId.split('_').sort();
        if (userId !== id1 && userId !== id2) {
          socket.emit('error', { type: 'UNAUTHORIZED' });
          return;
        }

        socket.join(`chat_${chatRoomId}`);
        socket.emit('chatRoomJoined', { chatRoomId });
        
      } catch (error) {
        logger.error(`Error in joinChatRoom: ${error.message}`);
      }
    });

    // Send message
    socket.on('sendMessage', async (messageData) => {
      try {
        if (!checkRateLimit(userId, 'sendMessage', 100)) {
          socket.emit('messageError', { 
            tempId: messageData.tempId, 
            error: 'Rate limit exceeded' 
          });
          return;
        }

        const senderId = userId;
        
        // Validate message
        const validationError = validateMessage(messageData, senderId);
        if (validationError) {
          socket.emit('messageError', { 
            tempId: messageData.tempId, 
            error: validationError 
          });
          return;
        }

        const { receiverId, text, messageType = 'text', offerDetails, attachment, tempId } = messageData;

        // Get users - ensure profilePicture is selected
        const [sender, receiver] = await Promise.all([
          User.findById(senderId).select('firstName lastName profilePicture').lean(),
          User.findById(receiverId).select('firstName lastName blockedUsers notificationPreferences').lean()
        ]);

        if (!sender || !receiver) {
          socket.emit('messageError', { tempId, error: 'User not found' });
          return;
        }

        // Check if blocked
        if (receiver.blockedUsers?.includes(senderId)) {
          socket.emit('messageError', { tempId, error: 'Message blocked' });
          return;
        }

        // Create message
        const message = new Message({
          senderId: new mongoose.Types.ObjectId(senderId),
          receiverId: new mongoose.Types.ObjectId(receiverId),
          text: text?.trim(),
          messageType,
          status: 'sent',
          isRead: false,
          ...(offerDetails && { offerDetails }),
          ...(attachment && { attachment })
        });

        const savedMessage = await message.save();

        // Prepare clean message payload for socket
        const messagePayload = {
          ...savedMessage.toObject(),
          _id: savedMessage._id.toString(),
          tempId,
          status: 'delivered',
          senderInfo: {
            _id: senderId,
            firstName: sender.firstName,
            lastName: sender.lastName,
            profilePicture: sender.profilePicture
          }
        };

        const chatRoomId = [senderId, receiverId].sort().join('_');
        
        // Emit to sender
        socket.emit('messageStatusUpdate', {
          _id: messagePayload._id,
          tempId,
          status: 'delivered',
          createdAt: messagePayload.createdAt
        });

        // Broadcast to chat room
        io.to(`chat_${chatRoomId}`).emit('newMessage', messagePayload);
        
        // Prepare clean notification data
        const senderName = `${sender.firstName} ${sender.lastName}`.trim();
        const senderProfilePicture = sender.profilePicture || null;
        
        // FIXED: Clean notification text formatting
        const notificationText = formatNotificationMessage(messageType, text, offerDetails);
        
        // Get image URL for notifications
        let imageUrl = null;
        if (attachment?.url && attachment.fileType?.startsWith('image')) {
          imageUrl = attachment.url;
        }

        // Send clean socket notification to receiver
        io.to(`user_${receiverId}`).emit('newMessageNotification', {
          senderId,
          senderName,
          senderProfilePicture: senderProfilePicture, 
          text: notificationText, // Clean text
          createdAt: new Date(),
          chatRoomId,
          messageType,
          messageId: savedMessage._id.toString()
        });

        // FIXED: Send clean push notification
        const notificationResult = await sendMessageNotification(
          { 
            ...messageData, 
            _id: savedMessage._id.toString(), 
            senderId, 
            receiverId,
            text: text // Pass original clean text
          },
          senderName, // Clean sender name
          notificationText, // Clean formatted text
          io,
          imageUrl,
          senderProfilePicture
        );

        if (!notificationResult.success && notificationResult.error && notificationResult.error !== 'User online, notification skipped') {
          logger.error(`Push notification failed for user ${receiverId}: ${notificationResult.error}`);
        }

        // Update notification counts
        await NotificationService.triggerCountUpdate(io, receiverId);

      } catch (error) {
        logger.error(`Error in sendMessage: ${error.message}`);
        socket.emit('messageError', { 
          tempId: messageData.tempId, 
          error: 'Server error' 
        });
      }
    });

    // Mark messages as seen
    socket.on('markAsSeen', async (data) => {
      try {
        if (!checkRateLimit(userId, 'markAsSeen')) {
          return;
        }

        const { senderId } = data;
        if (!mongoose.Types.ObjectId.isValid(senderId)) {
          return;
        }

        await Message.updateMany(
          { 
            senderId: new mongoose.Types.ObjectId(senderId),
            receiverId: new mongoose.Types.ObjectId(userId),
            isRead: false 
          },
          { isRead: true, readAt: new Date() }
        );

        const chatRoomId = [userId, senderId].sort().join('_');
        io.to(`chat_${chatRoomId}`).emit('messagesMarkedAsSeen', {
          readerId: userId,
          senderId
        });

        await NotificationService.triggerCountUpdate(io, userId);

      } catch (error) {
        logger.error(`Error in markAsSeen: ${error.message}`);
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      try {
        if (!checkRateLimit(userId, 'typing', 20)) {
          return;
        }

        const { receiverId, isTyping } = data;
        if (!mongoose.Types.ObjectId.isValid(receiverId)) {
          return;
        }

        const chatRoomId = [userId, receiverId].sort().join('_');
        socket.to(`chat_${chatRoomId}`).emit('userTyping', {
          senderId: userId,
          isTyping
        });

      } catch (error) {
        logger.error(`Error in typing: ${error.message}`);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      const disconnectedUserId = socketManager.removeConnection(socket.id);
      logger.info(`Client disconnected: ${socket.id} (User: ${disconnectedUserId || 'unknown'})`);
    });
  });

  return io;
};

module.exports = { initializeSocket, socketManager };