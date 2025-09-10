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

// 📢 NEW: Helper function to format message for notifications
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

// 📢 NEW: Enhanced FCM notification function
const sendEnhancedFCMNotification = async (
  receiverFcmTokens,
  senderName,
  senderProfilePicture,
  notificationText,
  messageType,
  messageData,
  productImageUrl = null
) => {
  try {
    if (!receiverFcmTokens || receiverFcmTokens.length === 0) {
      logger.warn('No FCM tokens available for receiver');
      return;
    }

    // 📢 NEW: Create rich notification payload
    const notificationPayload = {
      title: senderName,
      body: notificationText,
      data: {
        // Core message data
        type: 'message',
        senderId: messageData.senderId.toString(),
        receiverId: messageData.receiverId.toString(),
        messageId: messageData.messageId.toString(),
        chatId: messageData.chatRoomId,
        senderName: senderName,
        messageType: messageType,
        timestamp: new Date().toISOString(),
        
        // 📢 NEW: Additional data for WhatsApp-like experience
        avatar: senderProfilePicture || '',
        productImage: productImageUrl || '',
        
        // 📢 NEW: Grouping and threading
        tag: `chat_${messageData.chatRoomId}`, // For Android grouping
        threadId: messageData.chatRoomId, // For iOS threading
        
        // 📢 NEW: Action data for quick reply
        actions: JSON.stringify([
          { id: 'reply', title: 'Reply' },
          { id: 'mark_read', title: 'Mark as Read' }
        ])
      }
    };

    // 📢 NEW: Platform-specific configurations
    const androidConfig = {
      priority: 'high',
      notification: {
        title: senderName,
        body: notificationText,
        icon: 'ic_notification',
        color: '#00A86B',
        sound: 'default',
        channelId: messageType === 'offer' || messageType === 'counter-offer' 
          ? 'system_notifications' 
          : 'chat_messages',
        tag: `chat_${messageData.chatRoomId}`, // Group notifications by chat
        group: 'chat_messages',
        groupSummary: false,
        // 📢 NEW: Large icon for sender avatar
        ...(senderProfilePicture && {
          largeIcon: senderProfilePicture
        }),
        // 📢 NEW: Big picture for product images
        ...(productImageUrl && {
          bigPicture: productImageUrl,
          style: 'bigPicture'
        })
      },
      data: notificationPayload.data
    };

    const iosConfig = {
      aps: {
        alert: {
          title: senderName,
          body: notificationText
        },
        sound: 'default',
        badge: 1, // Will be updated with actual count
        'thread-id': messageData.chatRoomId,
        category: 'CHAT_MESSAGE',
        'mutable-content': 1 // For rich notifications
      },
      data: notificationPayload.data
    };

    // 📢 NEW: Send to multiple tokens
    const results = await Promise.allSettled(
      receiverFcmTokens.map(async (tokenObj) => {
        if (!tokenObj.token) return;

        const payload = {
          to: tokenObj.token,
          ...notificationPayload,
          // Platform-specific config
          ...(tokenObj.platform === 'android' ? { android: androidConfig } : { apns: iosConfig })
        };

        logger.info(`Sending FCM notification to token: ${tokenObj.token.substring(0, 20)}...`);
        
        // Call your existing FCM service
        return await sendFCMNotification(
          [tokenObj], // Pass as array
          senderName,
          notificationText,
          notificationPayload.data,
          null, // io parameter
          productImageUrl,
          senderProfilePicture,
          `message_${messageData.senderId}_${messageData.receiverId}`
        );
      })
    );

    // 📢 NEW: Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    logger.info(`FCM notification results: ${successful} successful, ${failed} failed`);
    
    // 📢 NEW: Clean up invalid tokens
    const invalidTokens = [];
    results.forEach((result, index) => {
      if (result.status === 'rejected' && result.reason?.code === 'messaging/invalid-registration-token') {
        invalidTokens.push(receiverFcmTokens[index].token);
      }
    });

    if (invalidTokens.length > 0) {
      logger.info(`Removing ${invalidTokens.length} invalid FCM tokens`);
      // Remove invalid tokens from user document
      await User.updateOne(
        { _id: messageData.receiverId },
        { $pull: { fcmTokens: { token: { $in: invalidTokens } } } }
      );
    }

  } catch (error) {
    logger.error(`Error sending enhanced FCM notification: ${error.message}`);
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

        if (!senderId || !receiverId) {
          logger.warn(`Missing senderId (${senderId}) or receiverId (${receiverId}) from messageData.`);
          socket.emit('messageError', { tempId, error: 'Missing senderId or receiverId' });
          return;
        }

        if (messageType === 'text' && !text) {
          logger.warn(`Text message missing content.`);
          socket.emit('messageError', { tempId, error: 'Text messages require content' });
          return;
        }

        // 📢 ENHANCED: Get more user data including FCM tokens
        const sender = await User.findById(senderId).select('firstName lastName profilePicture role fcmTokens');
        const receiver = await User.findById(receiverId).select('firstName lastName profilePicture fcmTokens');

        if (!sender || !receiver) {
          logger.error(`Sender or receiver not found: sender=${senderId}, receiver=${receiverId}`);
          socket.emit('messageError', { tempId, error: 'Sender or receiver not found' });
          return;
        }

        // 📢 NEW: Format notification message using helper function
        const notificationText = formatNotificationMessage(messageType, text, offerDetails, attachment);
        
        let productImageUrl = null;
        const senderProfilePictureUrl = sender.profilePicture || null;
        const senderName = `${sender.firstName} ${sender.lastName}`;

        // Extract product image URL
        try {
          if (text && text.startsWith('{') && text.endsWith('}')) {
            const parsedMessage = JSON.parse(text);
            if (parsedMessage.image) productImageUrl = parsedMessage.image;
          } else if (attachment && attachment.url && attachment.fileType?.startsWith('image')) {
            productImageUrl = attachment.url;
          } else if (offerDetails && offerDetails.image) {
            productImageUrl = offerDetails.image;
          }
        } catch (e) {
          logger.error(`Error extracting product image for sender ${senderId}: ${e.message}`);
        }

        const newMessage = new Message({
          senderId,
          receiverId,
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
        
        socket.emit('messageStatusUpdate', {
          _id: messagePayload._id,
          tempId: messagePayload.tempId,
          status: 'delivered',
          createdAt: messagePayload.createdAt,
        });
        logger.info(`Emitted messageStatusUpdate to sender's socket ${socket.id} for tempId ${tempId}`);

        io.to(`chat_${chatRoomId}`).emit('newMessage', messagePayload);
        logger.info(`Broadcasted newMessage to chat room chat_${chatRoomId} for message ${savedMessage._id}`);

        io.to(`user_${receiverId}`).emit('newMessageNotification', {
          senderId: senderId.toString(),
          senderName: senderName,
          senderProfilePicture: senderProfilePictureUrl,
          text: notificationText,
          createdAt: new Date(),
          productImageUrl,
          chatRoomId: chatRoomId,
          messageType: messageType, // 📢 NEW: Include message type
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

        // 📢 ENHANCED: Send push notification with rich content
        if ((!receiverIsOnline || !receiverIsInChatRoom) && !newMessage.metadata?.isSystemMessage) {
          logger.info(`Receiver ${receiverId} not actively online or in chat. Sending enhanced FCM notification.`);
          
          await sendEnhancedFCMNotification(
            receiver.fcmTokens,
            senderName,
            senderProfilePictureUrl,
            notificationText,
            messageType,
            {
              senderId: senderId.toString(),
              receiverId: receiverId.toString(),
              messageId: savedMessage._id.toString(),
              chatRoomId: chatRoomId
            },
            productImageUrl
          );
          
          logger.info(`Enhanced FCM notification sent for user ${receiverId}`);
        } else {
          logger.info(`Receiver ${receiverId} is online and actively in chat room, skipping FCM.`);
        }

        await NotificationService.triggerCountUpdate(io, receiverId);
        logger.info(`Message sent and processed from ${senderId} to ${receiverId}`);

      } catch (error) {
        logger.error(`Error sending message from ${authenticatedUserId} to ${messageData.receiverId}: ${error.message}`, error.stack);
        socket.emit('messageError', { tempId: messageData.tempId, error: error.message });
      }
    });

    // 📢 NEW: Handle quick reply from notifications
    socket.on('quickReply', async (replyData) => {
      try {
        const { chatId, message, originalMessageId } = replyData;
        const senderId = authenticatedUserId;
        
        // Extract receiver ID from chatId
        const [id1, id2] = chatId.split('_');
        const receiverId = id1 === senderId ? id2 : id1;
        
        logger.info(`Quick reply from ${senderId} to ${receiverId}: ${message}`);
        
        // Create and process the message like a regular sendMessage
        const messageData = {
          receiverId,
          text: message,
          messageType: 'text',
          tempId: `quick_${Date.now()}`
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
          throw new Error('Unauthorized action');
        }

        if (!messageIds || messageIds.length === 0 || !senderId || !receiverId) {
          logger.warn(`Missing required fields or empty messageIds in markAsSeen: messageIds=${messageIds}, senderId=${senderId}, receiverId=${receiverId}`);
          throw new Error('Missing required fields');
        }

        const messageObjectIds = messageIds.map(id => new mongoose.Types.ObjectId(id));

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
            messageIds: messageIds,
            seenBy: receiverId,
            seenAt: new Date(),
          });
          logger.info(`Emitted messagesSeen to user_${senderId} for message IDs: ${messageIds}`);

          await NotificationService.triggerCountUpdate(io, senderId);
        }

        await NotificationService.triggerCountUpdate(io, receiverId);
        logger.info(`Mark as seen processed for sender ${senderId} and receiver ${receiverId}`);

      } catch (error) {
        logger.error(`Error updating message status for sender ${senderId} and receiver ${receiverId}: ${error.message}`, error.stack);
        socket.emit('markSeenError', { error: error.message });
      }
    });

    socket.on('typing', (data) => {
      if (authenticatedUserId !== data.senderId) {
        logger.warn(`Unauthorized typing signal from ${authenticatedUserId} for sender ${data.senderId}`);
        return;
      }
      io.to(`user_${data.receiverId}`).emit('typing', { senderId: data.senderId, receiverId: data.receiverId });
      logger.info(`Typing signal from ${data.senderId} to ${data.receiverId}`);
    });

    socket.on('imageViewed', async ({ messageId, viewerId }) => {
      try {
        logger.info(`imageViewed event received: messageId=${messageId}, viewerId=${viewerId}`);

        if (authenticatedUserId !== viewerId) {
          logger.warn(`Unauthorized imageViewed attempt by ${authenticatedUserId} for viewer ${viewerId}`);
          return;
        }

        const message = await Message.findById(messageId);
        if (!message || message.messageType !== 'image' || !message.viewOnce) {
          logger.warn(`Invalid view-once image message: ${messageId}`);
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