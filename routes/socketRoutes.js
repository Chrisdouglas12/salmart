// socketRoutes.js - Simplified Version
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/userSchema.js');
const Message = require('../models/messageSchema.js');
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
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

// Simplified message formatting
const formatNotificationMessage = (messageType, text, offerDetails) => {
  const maxLength = 100;
  let notificationText = '';

  switch (messageType) {
    case 'image':
      notificationText = '📷 Photo';
      break;
    case 'video':
      notificationText = '🎥 Video';
      break;
    case 'audio':
      notificationText = '🎵 Audio';
      break;
    case 'document':
      notificationText = '📄 Document';
      break;
    case 'location':
      notificationText = '📍 Location';
      break;
    case 'offer':
    case 'counter-offer':
      if (offerDetails?.proposedPrice) {
        const price = Number(offerDetails.proposedPrice).toLocaleString('en-NG');
        notificationText = `💰 Offer: ₦${price}`;
      } else {
        notificationText = '💰 Offer';
      }
      break;
    default:
      if (text) {
        notificationText = String(text).trim();
      } else {
        notificationText = 'New message';
      }
  }

  // Simple truncation
  if (notificationText.length > maxLength) {
    notificationText = notificationText.substring(0, maxLength - 3) + '...';
  }

  return notificationText;
};

// Simplified FCM notification
const sendMessageNotification = async (messageData, senderName, notificationText, imageUrl, senderProfilePicture) => {
  try {
    if (!messageData.receiverId) {
      return { success: false, error: 'Missing receiverId' };
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

    const fcmTokens = receiver.fcmTokens || [];
    if (fcmTokens.length === 0) {
      return { success: false, error: 'No FCM tokens' };
    }

    const dataPayload = {
      type: 'message',
      senderId: messageData.senderId || '',
      receiverId: messageData.receiverId,
      messageId: messageData._id || '',
      chatId: `${messageData.senderId}_${messageData.receiverId}`.split('_').sort().join('_'),
      messageType: messageData.messageType || 'text',
      timestamp: new Date().toISOString()
    };

    const result = await sendFCMNotification(
      fcmTokens,
      senderName,
      notificationText,
      dataPayload,
      null, // io object
      imageUrl,
      senderProfilePicture
    );

    return result;

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

        // Get users
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

        // Prepare message payload
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
        
        // Prepare notification
        const senderName = `${sender.firstName} ${sender.lastName}`.trim();
        const notificationText = formatNotificationMessage(messageType, text, offerDetails);
        
        // Get image URL
        let imageUrl = null;
        if (attachment?.url && attachment.fileType?.startsWith('image')) {
          imageUrl = attachment.url;
        }

        // Send notification to receiver
        io.to(`user_${receiverId}`).emit('newMessageNotification', {
          senderId,
          senderName,
          senderProfilePicture: sender.profilePicture,
          text: notificationText,
          createdAt: new Date(),
          chatRoomId,
          messageType,
          messageId: savedMessage._id.toString()
        });

        // Check if receiver is online
        const receiverIsOnline = io.sockets.adapter.rooms.get(`user_${receiverId}`)?.size > 0;
        
        // Send push notification if offline
        if (!receiverIsOnline) {
          const fcmResult = await sendMessageNotification(
            { ...messageData, _id: savedMessage._id.toString(), senderId },
            senderName,
            notificationText,
            imageUrl,
            sender.profilePicture
          );
          
          if (fcmResult.error) {
            logger.error(`FCM failed for user ${receiverId}: ${fcmResult.error}`);
          }
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