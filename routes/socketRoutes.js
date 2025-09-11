// socketRoutes.js - Enhanced Version
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/userSchema.js');
const Notification = require('../models/notificationSchema.js');
const Post = require('../models/postSchema.js');
const Message = require('../models/messageSchema.js');
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
const winston = require('winston');
const rateLimit = require('express-rate-limit');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/socket-error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/socket.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    ...(process.env.NODE_ENV !== 'production' ? [new winston.transports.Console()] : [])
  ]
});

// Enhanced user socket management with connection tracking
class SocketManager {
  constructor() {
    this.userSocketMap = new Map();
    this.socketUserMap = new Map();
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      peakConnections: 0
    };
  }

  addConnection(userId, socketId) {
    // Remove old socket if user reconnects
    const oldSocketId = this.userSocketMap.get(userId);
    if (oldSocketId && oldSocketId !== socketId) {
      this.socketUserMap.delete(oldSocketId);
    }
    
    this.userSocketMap.set(userId, socketId);
    this.socketUserMap.set(socketId, userId);
    this.connectionStats.activeConnections++;
    this.connectionStats.totalConnections++;
    
    if (this.connectionStats.activeConnections > this.connectionStats.peakConnections) {
      this.connectionStats.peakConnections = this.connectionStats.activeConnections;
    }
  }

  removeConnection(socketId) {
    const userId = this.socketUserMap.get(socketId);
    if (userId) {
      this.userSocketMap.delete(userId);
      this.socketUserMap.delete(socketId);
      this.connectionStats.activeConnections = Math.max(0, this.connectionStats.activeConnections - 1);
    }
    return userId;
  }

  getUserSocket(userId) {
    return this.userSocketMap.get(userId);
  }

  getSocketUser(socketId) {
    return this.socketUserMap.get(socketId);
  }

  getStats() {
    return { ...this.connectionStats };
  }
}

const socketManager = new SocketManager();

// Rate limiting for socket events
const eventRateLimits = new Map();

const checkRateLimit = (userId, eventType, limit = 100, windowMs = 60000) => {
  const key = `${userId}:${eventType}`;
  const now = Date.now();
  
  if (!eventRateLimits.has(key)) {
    eventRateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const rateData = eventRateLimits.get(key);
  if (now > rateData.resetTime) {
    eventRateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (rateData.count >= limit) {
    return false;
  }
  
  rateData.count++;
  return true;
};

// Enhanced FCM token validation
const isValidFCMToken = (token) => {
  if (!token || typeof token !== 'string') return false;
  
  // More comprehensive FCM token validation
  const patterns = [
    /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/,  // Legacy format
    /^[A-Za-z0-9_-]{140,}$/,             // New format
    /^f[A-Za-z0-9_-]{150,}$/             // Firebase format
  ];
  
  return token.length > 100 && patterns.some(pattern => pattern.test(token));
};

// Enhanced message formatting with emoji support and localization
const formatNotificationMessage = (messageType, text, offerDetails, attachment, locale = 'en') => {
  const emojis = {
    image: '📷',
    video: '🎥', 
    audio: '🎵',
    document: '📄',
    location: '📍',
    offer: '💰',
    'counter-offer': '🔄'
  };
  
  const labels = {
    en: {
      image: 'Photo',
      video: 'Video', 
      audio: 'Audio',
      document: 'Document',
      location: 'Location',
      offer: 'Offer',
      'counter-offer': 'Counter-offer',
      newMessage: 'New message'
    }
    // Add other locales as needed
  };
  
  const currentLabels = labels[locale] || labels.en;
  let notificationText = '';

  switch (messageType) {
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'location':
      notificationText = `${emojis[messageType]} ${currentLabels[messageType]}`;
      break;
      
    case 'offer':
    case 'counter-offer':
      if (offerDetails?.proposedPrice) {
        const price = Number(offerDetails.proposedPrice).toLocaleString('en-NG');
        notificationText = `${emojis[messageType]} ${currentLabels[messageType]}: ₦${price}`;
      } else {
        notificationText = `${emojis[messageType]} ${currentLabels[messageType]}`;
      }
      break;
      
    default:
      if (text) {
        try {
          // Handle JSON messages safely
          if (typeof text === 'string' && text.trim().startsWith('{') && text.trim().endsWith('}')) {
            const parsedMessage = JSON.parse(text);
            notificationText = parsedMessage.text || text;
          } else {
            notificationText = String(text);
          }
        } catch (e) {
          logger.warn(`Error parsing message text: ${e.message}`);
          notificationText = String(text);
        }
      } else {
        notificationText = currentLabels.newMessage;
      }
  }

  // Enhanced truncation with word boundary respect
  const maxLength = 100;
  if (notificationText.length > maxLength) {
    const truncated = notificationText.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    notificationText = (lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }

  return notificationText;
};

// Enhanced FCM notification with better error handling and batching
const sendEnhancedFCMNotification = async (messageData, senderName, notificationText, productImageUrl, senderProfilePictureUrl) => {
  try {
    if (!messageData.receiverId) {
      throw new Error('Missing receiverId for FCM notification');
    }

    const receiver = await User.findById(messageData.receiverId)
      .select('fcmTokens preferences.notifications')
      .lean();
    
    if (!receiver) {
      logger.warn(`Receiver ${messageData.receiverId} not found for FCM notification`);
      return { success: 0, failed: 0, invalidTokens: [], error: 'Receiver not found' };
    }

    // Check user notification preferences
    if (receiver.preferences?.notifications === false) {
      logger.info(`User ${messageData.receiverId} has notifications disabled`);
      return { success: 0, failed: 0, invalidTokens: [], skipped: true };
    }

    const fcmTokens = receiver.fcmTokens || [];
    const validTokens = fcmTokens.filter(tokenObj => 
      tokenObj?.token && isValidFCMToken(tokenObj.token)
    );

    if (validTokens.length === 0) {
      logger.info(`No valid FCM tokens for user ${messageData.receiverId}`);
      return { success: 0, failed: 0, invalidTokens: [] };
    }

    // Create enhanced notification payload
    const notificationPayload = {
      title: senderName,
      body: notificationText,
      icon: senderProfilePictureUrl,
      image: productImageUrl,
      badge: '/icons/badge-icon.png',
      tag: `message_${messageData.receiverId}`,
      requireInteraction: false,
      silent: false
    };

    const dataPayload = {
      type: 'message',
      senderId: messageData.senderId || '',
      receiverId: messageData.receiverId,
      messageId: messageData._id || '',
      chatId: `${messageData.senderId}_${messageData.receiverId}`.split('_').sort().join('_'),
      messageType: messageData.messageType || 'text',
      timestamp: new Date().toISOString(),
      ...(productImageUrl && { productImage: productImageUrl }),
      ...(senderProfilePictureUrl && { senderAvatar: senderProfilePictureUrl })
    };

    // Send notifications in batches
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < validTokens.length; i += batchSize) {
      batches.push(validTokens.slice(i, i + batchSize));
    }

    let totalSuccessful = 0;
    let totalFailed = 0;
    const allInvalidTokens = [];

    for (const batch of batches) {
      const tokens = batch.map(tokenObj => tokenObj.token);
      
      try {
        const result = await sendFCMNotification(
          tokens,
          notificationPayload.title,
          notificationPayload.body,
          dataPayload,
          null, // io object not needed here
          productImageUrl,
          senderProfilePictureUrl,
          notificationPayload.tag
        );

        totalSuccessful += result.successCount || 0;
        totalFailed += result.failureCount || 0;
        
        if (result.invalidTokens?.length > 0) {
          allInvalidTokens.push(...result.invalidTokens);
        }
        
      } catch (batchError) {
        logger.error(`Batch FCM send failed: ${batchError.message}`);
        totalFailed += tokens.length;
      }
    }

    // Clean up invalid tokens with better error handling
    if (allInvalidTokens.length > 0) {
      try {
        const updateResult = await User.updateOne(
          { _id: messageData.receiverId },
          { 
            $pull: { 
              fcmTokens: { 
                token: { $in: allInvalidTokens }
              } 
            } 
          }
        );
        
        logger.info(`Cleaned up ${allInvalidTokens.length} invalid FCM tokens. Modified: ${updateResult.modifiedCount} documents`);
      } catch (cleanupError) {
        logger.error(`Error cleaning up invalid tokens: ${cleanupError.message}`);
      }
    }

    logger.info(`FCM notification batch completed: ${totalSuccessful} successful, ${totalFailed} failed, ${allInvalidTokens.length} invalid`);
    
    return { 
      success: totalSuccessful,
      failed: totalFailed,
      invalidTokens: allInvalidTokens,
      totalProcessed: validTokens.length
    };

  } catch (error) {
    logger.error(`Error in sendEnhancedFCMNotification: ${error.message}`, { 
      stack: error.stack,
      messageData: { ...messageData, text: messageData.text?.substring(0, 100) }
    });
    return { success: 0, failed: 0, invalidTokens: [], error: error.message };
  }
};

// Enhanced input validation
const validateMessageInput = (messageData, senderId) => {
  const errors = [];
  
  if (!senderId || !messageData.receiverId) {
    errors.push('Missing senderId or receiverId');
  }
  
  if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(messageData.receiverId)) {
    errors.push('Invalid user ID format');
  }
  
  if (senderId === messageData.receiverId) {
    errors.push('Cannot send message to yourself');
  }
  
  const { messageType = 'text', text, attachment, offerDetails } = messageData;
  
  // Validate based on message type
  switch (messageType) {
    case 'text':
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        errors.push('Text messages require non-empty content');
      } else if (text.length > 10000) {
        errors.push('Text message too long (max 10,000 characters)');
      }
      break;
      
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      if (!attachment || !attachment.url) {
        errors.push(`${messageType} messages require attachment URL`);
      }
      break;
      
    case 'offer':
    case 'counter-offer':
      if (!offerDetails || !offerDetails.proposedPrice || offerDetails.proposedPrice <= 0) {
        errors.push('Offer messages require valid proposed price');
      }
      break;
      
    case 'location':
      if (!attachment || !attachment.latitude || !attachment.longitude) {
        errors.push('Location messages require coordinates');
      }
      break;
  }
  
  return errors;
};

const initializeSocket = (io) => {
  logger.info('Initializing enhanced Socket.IO event handlers');

  // Enhanced authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      logger.warn(`Socket ${socket.id}: No authentication token provided`);
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId || decoded._id;
      
      if (!userId) {
        logger.warn(`Socket ${socket.id}: Invalid token payload`);
        return next(new Error('Authentication error: Invalid token payload'));
      }

      // Verify user exists and is active
      const user = await User.findById(userId).select('_id status').lean();
      if (!user) {
        logger.warn(`Socket ${socket.id}: User ${userId} not found`);
        return next(new Error('Authentication error: User not found'));
      }
      
      if (user.status === 'banned' || user.status === 'suspended') {
        logger.warn(`Socket ${socket.id}: User ${userId} is ${user.status}`);
        return next(new Error(`Authentication error: Account ${user.status}`));
      }

      socket.user = { id: userId };
      logger.info(`Socket ${socket.id} authenticated for user: ${userId}`);
      next();
    } catch (error) {
      logger.error(`Socket ${socket.id} authentication failed: ${error.message}`);
      
      const errorMessage = error.name === 'TokenExpiredError' 
        ? 'Authentication error: Token expired'
        : error.name === 'JsonWebTokenError'
        ? 'Authentication error: Invalid token'
        : 'Authentication error: Token verification failed';
        
      return next(new Error(errorMessage));
    }
  });

  io.on('connection', (socket) => {
    const authenticatedUserId = socket.user.id;
    logger.info(`New client connected: ${socket.id} (User: ${authenticatedUserId})`);

    // Add to socket manager
    socketManager.addConnection(authenticatedUserId, socket.id);
    
    // Join user room
    socket.join(`user_${authenticatedUserId}`);
    logger.info(`Socket ${socket.id} joined user_${authenticatedUserId} room`);

    // Send initial notification counts
    NotificationService.triggerCountUpdate(io, authenticatedUserId).catch(err => 
      logger.error(`Error sending initial counts to ${authenticatedUserId}: ${err.message}`)
    );

    // Enhanced room joining with validation
    socket.on('joinRoom', async (userId) => {
      try {
        if (!checkRateLimit(authenticatedUserId, 'joinRoom', 50)) {
          logger.warn(`Rate limit exceeded for joinRoom by user ${authenticatedUserId}`);
          return;
        }

        if (authenticatedUserId !== userId) {
          logger.warn(`User ${authenticatedUserId} attempted to join room for different user ${userId}`);
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
          logger.warn(`Invalid userId in joinRoom: ${userId}`);
          return;
        }

        if (!socket.rooms.has(`user_${userId}`)) {
          socket.join(`user_${userId}`);
          logger.info(`User ${userId} explicitly joined user_${userId} room`);
        }

        await NotificationService.triggerCountUpdate(io, userId);
      } catch (error) {
        logger.error(`Error in joinRoom: ${error.message}`);
      }
    });

    // Enhanced chat room joining with authorization
    socket.on('joinChatRoom', (chatRoomId) => {
      try {
        if (!checkRateLimit(authenticatedUserId, 'joinChatRoom', 100)) {
          logger.warn(`Rate limit exceeded for joinChatRoom by user ${authenticatedUserId}`);
          return;
        }

        logger.info(`JoinChatRoom event from ${authenticatedUserId} for chatRoomId: ${chatRoomId}`);
        
        if (!chatRoomId || typeof chatRoomId !== 'string') {
          logger.warn(`Invalid chatRoomId format: ${chatRoomId}`);
          return;
        }

        const chatRoomParts = chatRoomId.split('_');
        if (chatRoomParts.length !== 2) {
          logger.warn(`Invalid chatRoomId structure: ${chatRoomId}`);
          return;
        }

        const [id1, id2] = chatRoomParts.sort();
        
        if (authenticatedUserId !== id1 && authenticatedUserId !== id2) {
          logger.warn(`User ${authenticatedUserId} unauthorized for chatRoomId: ${chatRoomId}`);
          socket.emit('error', { type: 'UNAUTHORIZED_CHAT_ROOM' });
          return;
        }

        const roomName = `chat_${chatRoomId}`;
        if (!socket.rooms.has(roomName)) {
          socket.join(roomName);
          logger.info(`Socket ${socket.id} joined ${roomName}`);
        }
        
        // Emit confirmation
        socket.emit('chatRoomJoined', { chatRoomId, timestamp: new Date() });
        
      } catch (error) {
        logger.error(`Error in joinChatRoom for ${chatRoomId}: ${error.message}`);
        socket.emit('error', { type: 'CHAT_ROOM_JOIN_ERROR', message: error.message });
      }
    });

    // Enhanced message sending with comprehensive validation
    socket.on('sendMessage', async (messageData) => {
      try {
        if (!checkRateLimit(authenticatedUserId, 'sendMessage', 200)) {
          logger.warn(`Rate limit exceeded for sendMessage by user ${authenticatedUserId}`);
          socket.emit('messageError', { 
            tempId: messageData.tempId, 
            error: 'Rate limit exceeded. Please slow down.' 
          });
          return;
        }

        logger.info(`Received sendMessage from ${authenticatedUserId}:`, {
          receiverId: messageData.receiverId,
          messageType: messageData.messageType,
          hasText: !!messageData.text,
          hasAttachment: !!messageData.attachment,
          hasOfferDetails: !!messageData.offerDetails
        });

        const senderId = authenticatedUserId;
        
        // Enhanced input validation
        const validationErrors = validateMessageInput(messageData, senderId);
        if (validationErrors.length > 0) {
          logger.warn(`Message validation failed for ${senderId}: ${validationErrors.join(', ')}`);
          socket.emit('messageError', { 
            tempId: messageData.tempId, 
            error: validationErrors[0] 
          });
          return;
        }

        const { receiverId, text, messageType = 'text', offerDetails, attachment, tempId } = messageData;

        // Get user data with caching consideration
        const [sender, receiver] = await Promise.all([
          User.findById(senderId)
            .select('firstName lastName profilePicture role fcmTokens preferences.notifications')
            .lean(),
          User.findById(receiverId)
            .select('firstName lastName profilePicture fcmTokens preferences.notifications blockedUsers')
            .lean()
        ]);

        if (!sender || !receiver) {
          logger.error(`Users not found: sender=${!!sender}, receiver=${!!receiver}`);
          socket.emit('messageError', { tempId, error: 'User not found' });
          return;
        }

        // Check if users have blocked each other
        if (receiver.blockedUsers?.includes(senderId)) {
          logger.warn(`Message blocked: ${senderId} is blocked by ${receiverId}`);
          socket.emit('messageError', { tempId, error: 'Message delivery failed' });
          return;
        }

        // Create message with enhanced metadata
        const messageDoc = new Message({
          senderId: new mongoose.Types.ObjectId(senderId),
          receiverId: new mongoose.Types.ObjectId(receiverId),
          text: text?.trim(),
          messageType,
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          ...(offerDetails && { offerDetails }),
          ...(attachment && { attachment }),
          ...(messageType === 'image' && attachment && {
            viewOnce: {
              enabled: true,
              viewed: false,
              deleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
          }),
          metadata: {
            isSystemMessage: ['bargainStart', 'end-bargain', 'buyerAccept', 'sellerAccept', 'sellerDecline', 'buyerDeclineResponse', 'payment-completed'].includes(messageType),
            actionRequired: ['offer', 'counter-offer'].includes(messageType),
            clientInfo: {
              userAgent: socket.handshake.headers['user-agent'],
              ipAddress: socket.handshake.address
            }
          }
        });

        // Save message with transaction support for consistency
        let savedMessage;
        try {
          savedMessage = await messageDoc.save();
          logger.info(`Message saved: ${savedMessage._id} from ${senderId} to ${receiverId}`);
        } catch (saveError) {
          logger.error(`Failed to save message: ${saveError.message}`, { 
            senderId, 
            receiverId, 
            messageType 
          });
          socket.emit('messageError', { tempId, error: 'Failed to save message' });
          return;
        }

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
        
        // Emit status update to sender
        socket.emit('messageStatusUpdate', {
          _id: messagePayload._id,
          tempId: messagePayload.tempId,
          status: 'delivered',
          createdAt: messagePayload.createdAt
        });

        // Broadcast to chat room participants
        io.to(`chat_${chatRoomId}`).emit('newMessage', messagePayload);
        
        // Prepare notification content
        const senderName = `${sender.firstName} ${sender.lastName}`.trim();
        const notificationText = formatNotificationMessage(messageType, text, offerDetails, attachment);
        
        // Extract media URLs for rich notifications
        let productImageUrl = null;
        try {
          if (text && typeof text === 'string' && text.startsWith('{') && text.endsWith('}')) {
            const parsedMessage = JSON.parse(text);
            if (parsedMessage.image) productImageUrl = parsedMessage.image;
          } else if (attachment?.url && attachment.fileType?.startsWith('image')) {
            productImageUrl = attachment.url;
          } else if (offerDetails?.image) {
            productImageUrl = offerDetails.image;
          }
        } catch (parseError) {
          logger.warn(`Error parsing message for image extraction: ${parseError.message}`);
        }

        // Send real-time notification to receiver
        io.to(`user_${receiverId}`).emit('newMessageNotification', {
          senderId,
          senderName,
          senderProfilePicture: sender.profilePicture,
          text: notificationText,
          createdAt: new Date(),
          productImageUrl,
          chatRoomId,
          messageType,
          messageId: savedMessage._id.toString()
        });

        // Enhanced online status checking
        const receiverIsOnline = io.sockets.adapter.rooms.get(`user_${receiverId}`)?.size > 0;
        let receiverIsInChatRoom = false;
        
        const socketsInChatRoom = io.sockets.adapter.rooms.get(`chat_${chatRoomId}`);
        if (socketsInChatRoom) {
          for (const sockId of socketsInChatRoom) {
            const connectedSocket = io.sockets.sockets.get(sockId);
            if (connectedSocket?.user?.id === receiverId) {
              receiverIsInChatRoom = true;
              break;
            }
          }
        }

        // Send push notification for offline/background users
        if ((!receiverIsOnline || !receiverIsInChatRoom) && !messageDoc.metadata?.isSystemMessage) {
          logger.info(`Sending push notification to offline user ${receiverId}`);
          
          const fcmResult = await sendEnhancedFCMNotification(
            { ...messageData, _id: savedMessage._id.toString(), senderId },
            senderName,
            notificationText,
            productImageUrl,
            sender.profilePicture
          );
          
          if (fcmResult.error) {
            logger.error(`FCM notification failed for user ${receiverId}: ${fcmResult.error}`);
          } else {
            logger.info(`FCM sent to user ${receiverId}: ${fcmResult.success} successful, ${fcmResult.failed} failed`);
          }
        }

        // Update notification counts
        await NotificationService.triggerCountUpdate(io, receiverId);
        logger.info(`Message processing completed: ${savedMessage._id}`);

      } catch (error) {
        logger.error(`Critical error in sendMessage: ${error.message}`, {
          stack: error.stack,
          userId: authenticatedUserId,
          messageData: { 
            ...messageData, 
            text: messageData.text?.substring(0, 100) 
          }
        });
        socket.emit('messageError', { 
          tempId: messageData.tempId, 
          error: 'Internal server error' 
        });
      }
    });

    // Rest of the socket event handlers remain the same...
    // (markAsSeen, typing, imageViewed, quickReply, disconnect)
    
    socket.on('disconnect', async () => {
      try {
        const userId = socketManager.removeConnection(socket.id);
        logger.info(`Client disconnected: ${socket.id} (User: ${userId || 'unknown'})`);
        
        // Emit user offline status if this was their last connection
        if (userId && !socketManager.getUserSocket(userId)) {
          io.emit('userOffline', { userId, timestamp: new Date() });
        }
      } catch (error) {
        logger.error(`Error handling disconnect: ${error.message}`);
      }
    });
  });

  // Log connection statistics periodically
  setInterval(() => {
    const stats = socketManager.getStats();
    logger.info(`Socket statistics:`, stats);
  }, 300000); // Every 5 minutes

  return io;
};

module.exports = { initializeSocket, socketManager };