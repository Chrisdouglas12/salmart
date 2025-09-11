// socketRoutes.js
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/userSchema.js');
const Notification = require('../models/notificationSchema.js');
const Post = require('../models/postSchema.js');
const Message = require('../models/messageSchema.js');
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/socket.log' }),
    new winston.transports.Console()
  ]
});

const userSocketMap = new Map();

// 📢 Helper function to validate FCM token format
const isValidFCMToken = (token) => {
  if (!token || typeof token !== 'string') return false;
  // FCM tokens are typically 152+ characters long and contain specific patterns
  return token.length > 100 && /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(token);
};

// 📢 Helper function to format message for notifications
const formatNotificationMessage = (messageType, text, offerDetails, attachment) => {
  let notificationText = '';
  let messageTypeFormatted = messageType || 'text';

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
      if (offerDetails && offerDetails.proposedPrice) {
        notificationText = `💰 Offer: ₦${Number(offerDetails.proposedPrice).toLocaleString('en-NG')}`;
      } else {
        notificationText = '💰 New Offer';
      }
      break;
    case 'counter-offer':
      if (offerDetails && offerDetails.proposedPrice) {
        notificationText = `🔄 Counter-offer: ₦${Number(offerDetails.proposedPrice).toLocaleString('en-NG')}`;
      } else {
        notificationText = '🔄 Counter Offer';
      }
      break;
    default:
      // For text messages or other types
      if (text) {
        try {
          // Handle JSON messages
          if (text.startsWith('{') && text.endsWith('}')) {
            const parsedMessage = JSON.parse(text);
            notificationText = parsedMessage.text || text;
          } else {
            notificationText = text;
          }
        } catch (e) {
          notificationText = text;
        }
      } else {
        notificationText = 'New message';
      }
  }

  // Truncate if too long
  const maxLength = 100;
  if (notificationText.length > maxLength) {
    notificationText = notificationText.substring(0, maxLength - 3) + '...';
  }

  return notificationText;
};

None r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
    
    // 📢 FIXED: Collect invalid tokens properly
    const invalidTokens = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled' && !result.value.success && result.value.isInvalid) {
        invalidTokens.push(result.value.token);
      } else if (result.status === 'rejected') {
        // Handle rejected promises
        logger.error(`Promise rejected in FCM sending: ${result.reason}`);
      }
    });

    logger.info(`FCM notification results: ${successful} successful, ${failed} failed, ${invalidTokens.length} invalid tokens`);

    // 📢 FIXED: Clean up invalid tokens with proper MongoDB query
    if (invalidTokens.length > 0) {
      try {
        logger.info(`Removing ${invalidTokens.length} invalid FCM tokens from user ${messageData.receiverId}`);
        
        const updateResult = await User.updateOne(
          { _id: new mongoose.Types.ObjectId(messageData.receiverId) },
          { 
            $pull: { 
              fcmTokens: { 
                token: { $in: invalidTokens } 
              } 
            } 
          }
        );
        
        logger.info(`Successfully removed invalid tokens. Modified: ${updateResult.modifiedCount}`);
      } catch (cleanupError) {
        logger.error(`Error cleaning up invalid tokens for user ${messageData.receiverId}: ${cleanupError.message}`);
      }
    }

    return { 
      success: successful, 
      failed: failed, 
      invalidTokens: invalidTokens,
      totalProcessed: validTokens.length
    };

  } catch (error) {
    logger.error(`Error in sendEnhancedFCMNotification: ${error.message}`, error.stack);
    return { success: 0, failed: 0, invalidTokens: [], error: error.message };
  }
};

const initializeSocket = (io) => {
  logger.info('Initializing Socket.IO event handlers');

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      logger.warn(`Socket ${socket.id} connection attempt: No token provided.`);
      return next(new Error('Authentication error: No token provided.'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { id: decoded.userId || decoded._id };
      logger.info(`Socket ${socket.id} authenticated for user: ${socket.user.id}`);
      next();
    } catch (error) {
      logger.error(`Socket ${socket.id} authentication failed: ${error.message}`);
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Token expired.'));
      }
      return next(new Error('Authentication error: Invalid token.'));
    }
  });

  io.on('connection', (socket) => {
    const authenticatedUserId = socket.user.id;
    logger.info(`New client connected: ${socket.id} (Authenticated User: ${authenticatedUserId})`);

    userSocketMap.set(authenticatedUserId, socket.id);
    socket.join(`user_${authenticatedUserId}`);
    logger.info(`Socket ${socket.id} (User: ${authenticatedUserId}) connected and joined user_${authenticatedUserId}`);

    NotificationService.triggerCountUpdate(io, authenticatedUserId).catch(err => logger.error(`Error sending initial counts to ${authenticatedUserId}: ${err.message}`));

    socket.on('joinRoom', async (userId) => {
      if (authenticatedUserId !== userId) {
        logger.warn(`User ${authenticatedUserId} attempted to join room for different user ${userId}.`);
        return;
      }
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        logger.warn(`Invalid userId in joinRoom: ${userId}`);
        return;
      }

      if (!socket.rooms.has(`user_${userId}`)) {
        socket.join(`user_${userId}`);
        logger.info(`User ${userId} (socket ${socket.id}) explicitly joined to user_${userId} room.`);
      } else {
        logger.info(`User ${userId} (socket ${socket.id}) already in user_${userId} room.`);
      }

      if (userSocketMap.get(userId) !== socket.id) {
        userSocketMap.set(userId, socket.id);
      }

      await NotificationService.triggerCountUpdate(io, userId);
      logger.info(`Notification counts sent to user ${userId} after joinRoom event.`);
    });

    socket.on('joinChatRoom', (chatRoomId) => {
      try {
        logger.info(`JoinChatRoom event received from ${authenticatedUserId} for chatRoomId: ${chatRoomId}`);
        const [id1, id2] = chatRoomId.split('_').sort();
        if (authenticatedUserId !== id1 && authenticatedUserId !== id2) {
          logger.warn(`User ${authenticatedUserId} attempted to join unauthorized chatRoomId: ${chatRoomId}`);
          return;
        }

        if (!socket.rooms.has(`chat_${chatRoomId}`)) {
          socket.join(`chat_${chatRoomId}`);
          logger.info(`Socket ${socket.id} (User: ${authenticatedUserId}) joined chat room chat_${chatRoomId}`);
        } else {
          logger.info(`Socket ${socket.id} (User: ${authenticatedUserId}) already in chat room chat_${chatRoomId}`);
        }
      } catch (err) {
        logger.error(`Error in joinChatRoom for chatRoomId ${chatRoomId}: ${err.message}`);
      }
    });

    socket.on('disconnect', async () => {
      try {
        logger.info(`Client disconnected: ${socket.id} (User: ${authenticatedUserId})`);
        if (authenticatedUserId) {
          if (userSocketMap.get(authenticatedUserId) === socket.id) {
            userSocketMap.delete(authenticatedUserId);
            logger.info(`Removed user ${authenticatedUserId} from userSocketMap on disconnect.`);
          }
        }
      } catch (err) {
        logger.error(`Error handling disconnect for socket ${socket.id}: ${err.message}`);
      }
    });

    // 📢 ENHANCED: sendMessage event with improved push notifications
    socket.on('sendMessage', async (messageData) => {
      try {
        logger.info(`Received sendMessage event: ${JSON.stringify(messageData)}`);
        const senderId = authenticatedUserId;
        const { receiverId, text, messageType, offerDetails, attachment, tempId } = messageData;

        // 📢 FIXED: Input validation
        if (!senderId || !receiverId) {
          logger.warn(`Missing senderId (${senderId}) or receiverId (${receiverId}) from messageData.`);
          socket.emit('messageError', { tempId, error: 'Missing senderId or receiverId' });
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
          logger.warn(`Invalid ObjectId format: senderId=${senderId}, receiverId=${receiverId}`);
          socket.emit('messageError', { tempId, error: 'Invalid user IDs' });
          return;
        }

        if (messageType === 'text' && (!text || text.trim() === '')) {
          logger.warn(`Text message missing content.`);
          socket.emit('messageError', { tempId, error: 'Text messages require content' });
          return;
        }

        // 📢 ENHANCED: Get more user data including FCM tokens with better error handling
        const [sender, receiver] = await Promise.all([
          User.findById(senderId).select('firstName lastName profilePicture role fcmTokens').lean(),
          User.findById(receiverId).select('firstName lastName profilePicture fcmTokens').lean()
        ]);

        if (!sender || !receiver) {
          logger.error(`Sender or receiver not found: sender=${!!sender}, receiver=${!!receiver}`);
          socket.emit('messageError', { tempId, error: 'Sender or receiver not found' });
          return;
        }

        // 📢 NEW: Format notification message using helper function
        const notificationText = formatNotificationMessage(messageType, text, offerDetails, attachment);
        
        let productImageUrl = null;
        const senderProfilePictureUrl = sender.profilePicture || null;
        const senderName = `${sender.firstName} ${sender.lastName}`.trim();

        // Extract product image URL with better error handling
        try {
          if (text && typeof text === 'string' && text.startsWith('{') && text.endsWith('}')) {
            const parsedMessage = JSON.parse(text);
            if (parsedMessage.image) productImageUrl = parsedMessage.image;
          } else if (attachment && attachment.url && attachment.fileType?.startsWith('image')) {
            productImageUrl = attachment.url;
          } else if (offerDetails && offerDetails.image) {
            productImageUrl = offerDetails.image;
          }
        } catch (e) {
          logger.warn(`Error extracting product image for sender ${senderId}: ${e.message}`);
        }

        const newMessage = new Message({
          senderId: new mongoose.Types.ObjectId(senderId),
          receiverId: new mongoose.Types.ObjectId(receiverId),
          text: text,
          messageType: messageType || 'text',
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
          },
        });

        let savedMessage;
        try {
          savedMessage = await newMessage.save();
          logger.info(`Successfully saved message from ${senderId} to ${receiverId}: ${savedMessage._id}`);
        } catch (saveError) {
          logger.error(`Failed to save message from ${senderId} to ${receiverId}: ${saveError.message}`);
          socket.emit('messageError', { tempId, error: `Failed to save message: ${saveError.message}` });
          return;
        }

        const messagePayload = {
          ...savedMessage.toObject(),
          _id: savedMessage._id.toString(),
          tempId: tempId,
          status: 'delivered'
        };

        const chatRoomId = [senderId, receiverId].sort().join('_');
        
        // Emit status update to sender
        socket.emit('messageStatusUpdate', {
          _id: messagePayload._id,
          tempId: messagePayload.tempId,
          status: 'delivered',
          createdAt: messagePayload.createdAt,
        });
        logger.info(`Emitted messageStatusUpdate to sender's socket ${socket.id} for tempId ${tempId}`);

        // Broadcast to chat room
        io.to(`chat_${chatRoomId}`).emit('newMessage', messagePayload);
        logger.info(`Broadcasted newMessage to chat room chat_${chatRoomId} for message ${savedMessage._id}`);

        // Send notification to receiver
        io.to(`user_${receiverId}`).emit('newMessageNotification', {
          senderId: senderId.toString(),
          senderName: senderName,
          senderProfilePicture: senderProfilePictureUrl,
          text: notificationText,
          createdAt: new Date(),
          productImageUrl,
          chatRoomId: chatRoomId,
          messageType: messageType,
        });
        logger.info(`Emitted newMessageNotification to user_${receiverId}`);

        // 📢 ENHANCED: Check if receiver needs push notification
        const receiverIsOnline = io.sockets.adapter.rooms.get(`user_${receiverId}`)?.size > 0;
        let receiverIsInChatRoom = false;
        const socketsInChatRoom = io.sockets.adapter.rooms.get(`chat_${chatRoomId}`);
        
        if (socketsInChatRoom) {
          for (const sockId of socketsInChatRoom) {
            const connectedSocket = io.sockets.sockets.get(sockId);
            if (connectedSocket && connectedSocket.user && connectedSocket.user.id === receiverId) {
              receiverIsInChatRoom = true;
              break;
            }
          }
        }

        // 📢 ENHANCED: Send push notification with rich content using fixed service
        if ((!receiverIsOnline || !receiverIsInChatRoom) && !newMessage.metadata?.isSystemMessage) {
          logger.info(`Receiver ${receiverId} not actively online or in chat. Sending enhanced FCM notification.`);
          
          // Use the fixed FCM service directly
          const fcmResult = await sendFCMNotification(
            receiver.fcmTokens || [],
            senderName,
            notificationText,
            {
              type: 'message',
              senderId: senderId.toString(),
              receiverId: receiverId.toString(),
              messageId: savedMessage._id.toString(),
              chatId: chatRoomId,
              chatRoomId: chatRoomId,
              messageType: messageType,
              timestamp: new Date().toISOString()
            },
            io,
            productImageUrl,
            senderProfilePictureUrl,
            `message_${senderId}_${receiverId}`
          );
          
          logger.info(`Enhanced FCM notification completed for user ${receiverId}. Success: ${fcmResult.successCount}, Failed: ${fcmResult.failureCount}, Invalid: ${fcmResult.invalidTokens.length}`);
        } else {
          logger.info(`Receiver ${receiverId} is online and actively in chat room, skipping FCM.`);
        }

        // Update notification counts
        await NotificationService.triggerCountUpdate(io, receiverId);
        logger.info(`Message sent and processed from ${senderId} to ${receiverId}`);

      } catch (error) {
        logger.error(`Error sending message from ${authenticatedUserId}: ${error.message}`, error.stack);
        socket.emit('messageError', { tempId: messageData.tempId, error: error.message });
      }
    });

    // 📢 NEW: Handle quick reply from notifications
    socket.on('quickReply', async (replyData) => {
      try {
        const { chatId, message, originalMessageId } = replyData;
        const senderId = authenticatedUserId;
        
        if (!chatId || !message || typeof message !== 'string' || message.trim() === '') {
          logger.warn(`Invalid quick reply data from ${senderId}`);
          return;
        }
        
        // Extract receiver ID from chatId
        const [id1, id2] = chatId.split('_');
        const receiverId = id1 === senderId ? id2 : id1;
        
        logger.info(`Quick reply from ${senderId} to ${receiverId}: ${message.substring(0, 50)}...`);
        
        // Create and process the message like a regular sendMessage
        const messageData = {
          receiverId,
          text: message.trim(),
          messageType: 'text',
          tempId: `quick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        // Trigger the regular sendMessage flow
        socket.emit('sendMessage', messageData);
        
      } catch (error) {
        logger.error(`Error handling quick reply: ${error.message}`);
      }
    });

    socket.on('markAsSeen', async ({ messageIds, senderId, receiverId }) => {
      try {
        logger.info(`markAsSeen event received from ${authenticatedUserId}: messageIds=${messageIds}, senderId=${senderId}, receiverId=${receiverId}`);
        
        if (authenticatedUserId !== receiverId) {
          logger.warn(`Unauthorized markAsSeen attempt by ${authenticatedUserId} for receiver ${receiverId}.`);
          socket.emit('markSeenError', { error: 'Unauthorized action' });
          return;
        }

        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0 || !senderId || !receiverId) {
          logger.warn(`Missing required fields or empty messageIds in markAsSeen`);
          socket.emit('markSeenError', { error: 'Missing required fields' });
          return;
        }

        // Validate ObjectIds
        const validMessageIds = messageIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validMessageIds.length === 0) {
          logger.warn(`No valid message IDs provided`);
          socket.emit('markSeenError', { error: 'No valid message IDs' });
          return;
        }

        const messageObjectIds = validMessageIds.map(id => new mongoose.Types.ObjectId(id));

        const result = await Message.updateMany(
          {
            _id: { $in: messageObjectIds },
            receiverId: new mongoose.Types.ObjectId(receiverId),
            senderId: new mongoose.Types.ObjectId(senderId),
            status: { $ne: 'seen' }
          },
          { $set: { status: 'seen', isRead: true, seenAt: new Date() } }
        );
        logger.info(`Marked ${result.modifiedCount} messages as seen for sender ${senderId} by receiver ${receiverId}`);

        if (result.modifiedCount > 0) {
          io.to(`user_${senderId}`).emit('messagesSeen', {
            messageIds: validMessageIds,
            seenBy: receiverId,
            seenAt: new Date(),
          });
          logger.info(`Emitted messagesSeen to user_${senderId} for ${validMessageIds.length} message IDs`);

          await NotificationService.triggerCountUpdate(io, senderId);
        }

        await NotificationService.triggerCountUpdate(io, receiverId);
        logger.info(`Mark as seen processed for sender ${senderId} and receiver ${receiverId}`);

      } catch (error) {
        logger.error(`Error updating message status: ${error.message}`, error.stack);
        socket.emit('markSeenError', { error: error.message });
      }
    });

    socket.on('typing', (data) => {
      try {
        if (authenticatedUserId !== data.senderId) {
          logger.warn(`Unauthorized typing signal from ${authenticatedUserId} for sender ${data.senderId}`);
          return;
        }
        
        if (!data.receiverId) {
          logger.warn(`Missing receiverId in typing event from ${data.senderId}`);
          return;
        }
        
        io.to(`user_${data.receiverId}`).emit('typing', { 
          senderId: data.senderId, 
          receiverId: data.receiverId 
        });
        logger.info(`Typing signal from ${data.senderId} to ${data.receiverId}`);
      } catch (error) {
        logger.error(`Error handling typing event: ${error.message}`);
      }
    });

    socket.on('imageViewed', async ({ messageId, viewerId }) => {
      try {
        logger.info(`imageViewed event received: messageId=${messageId}, viewerId=${viewerId}`);

        if (authenticatedUserId !== viewerId) {
          logger.warn(`Unauthorized imageViewed attempt by ${authenticatedUserId} for viewer ${viewerId}`);
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
          logger.warn(`Invalid messageId in imageViewed: ${messageId}`);
          return;
        }

        const message = await Message.findById(messageId);
        if (!message || message.messageType !== 'image' || !message.viewOnce) {
          logger.warn(`Invalid view-once image message: ${messageId}`);
          return;
        }

        // Check if already viewed
        if (message.viewOnce.viewed) {
          logger.info(`Image ${messageId} already viewed by ${viewerId}`);
          return;
        }

        const viewedAt = new Date();
        const deleteAt = new Date(viewedAt.getTime() + 24 * 60 * 60 * 1000);

        await Message.findByIdAndUpdate(messageId, {
          $set: {
            'viewOnce.viewed': true,
            'viewOnce.viewedAt': viewedAt,
            'viewOnce.deleteAt': deleteAt,
            'viewOnce.viewedBy': viewerId
          }
        });

        const chatRoomId = [message.senderId.toString(), message.receiverId.toString()].sort().join('_');
        io.to(`chat_${chatRoomId}`).emit('imageViewedConfirmation', {
          messageId,
          viewerId,
          viewedAt
        });

        logger.info(`View-once image ${messageId} marked as viewed by ${viewerId}`);

      } catch (error) {
        logger.error(`Error handling imageViewed: ${error.message}`);
      }
    });
  });

  return io;
};

module.exports = initializeSocket;