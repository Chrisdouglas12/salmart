const http = require('http');
const socketIo = require('socket.io');
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

const initializeSocket = (app) => {
  const server = http.createServer(app);
  const io = socketIo(server, {
    cors: {
      origin: ['http://localhost:8158', 'https://salmart.vercel.app'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    cookie: true,
  });

  io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id}`);

    socket.on('joinRoom', async (userId) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          logger.warn(`Invalid userId in joinRoom: ${userId}`);
          return;
        }
        await User.findByIdAndUpdate(userId, { socketId: socket.id }, { new: true });
        socket.join(`user_${userId}`);
        logger.info(`User ${userId} joined room user_${userId}`);
        await NotificationService.sendCountsToUser(userId, io);
      } catch (err) {
        logger.error(`Error in joinRoom for user ${userId}: ${err.message}`);
      }
    });

    socket.on('badge-update', async ({ type, count, userId }) => {
      try {
        io.to(`user_${userId}`).emit('badge-update', { type, count, userId });
        logger.info(`Broadcasted badge-update for ${type} to user ${userId}`);
        await NotificationService.sendCountsToUser(userId, io);
      } catch (error) {
        logger.error(`Error broadcasting badge-update for user ${userId}: ${error.message}`);
      }
    });

    socket.on('followUser', async ({ followerId, followedId }) => {
      try {
        const follower = await User.findById(followerId).select('firstName lastName profilePicture');
        if (!follower) {
          logger.error(`Follower ${followerId} not found`);
          return;
        }
        const notification = new Notification({
          userId: followedId,
          type: 'follow',
          senderId: followerId,
          message: `${follower.firstName} ${follower.lastName} followed you`,
          createdAt: new Date(),
        });
        await notification.save();
        io.to(`user_${followedId}`).emit('notification', {
          type: 'follow',
          userId: followerId,
          sender: { firstName: follower.firstName, lastName: follower.lastName, profilePicture: follower.profilePicture },
          createdAt: new Date(),
        });
        await sendFCMNotification(
          followedId.toString(),
          'New Follower',
          `${follower.firstName} ${follower.lastName} followed you`,
          { type: 'follow', userId: followerId.toString() },
          io,
          null,
          follower.profilePicture
        );
        await NotificationService.triggerCountUpdate(followedId, io);
        logger.info(`Follow notification sent from ${followerId} to ${followedId}`);
      } catch (error) {
        logger.error(`Error handling followUser event for ${followerId} to ${followedId}: ${error.message}`);
      }
    });

    socket.on('likePost', async ({ postId, userId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
          logger.warn(`Invalid userId ${userId} or postId ${postId}`);
          return;
        }
        const post = await Post.findById(postId).select('createdBy');
        if (!post) {
          logger.error(`Post ${postId} not found`);
          return;
        }
        const sender = await User.findById(userId).select('firstName lastName profilePicture');
        if (!sender) {
          logger.error(`User ${userId} not found`);
          return;
        }
        if (post.createdBy.userId.toString() !== userId.toString()) {
          const notification = new Notification({
            userId: post.createdBy.userId,
            type: 'like',
            senderId: userId,
            postId,
            message: `${sender.firstName} ${sender.lastName} liked your post`,
            createdAt: new Date(),
          });
          await notification.save();
          io.to(`user_${post.createdBy.userId}`).emit('notification', {
            type: 'like',
            postId,
            userId,
            sender: { firstName: sender.firstName, lastName: sender.lastName, profilePicture: sender.profilePicture },
            createdAt: new Date(),
          });
          await sendFCMNotification(
            post.createdBy.userId.toString(),
            'New Like',
            `${sender.firstName} ${sender.lastName} liked your post`,
            { type: 'like', postId: postId.toString() },
            io,
            null,
            sender.profilePicture
          );
          await NotificationService.triggerCountUpdate(post.createdBy.userId, io);
        }
        logger.info(`Like notification sent for post ${postId} by user ${userId}`);
      } catch (error) {
        logger.error(`Error handling likePost event for post ${postId} by user ${userId}: ${error.message}`);
      }
    });

    socket.on('commentPost', async ({ postId, userId, comment }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
          logger.warn(`Invalid userId ${userId} or postId ${postId}`);
          return;
        }
        const post = await Post.findById(postId).select('createdBy');
        if (!post) {
          logger.error(`Post ${postId} not found`);
          return;
        }
        const sender = await User.findById(userId).select('firstName lastName profilePicture');
        if (!sender) {
          logger.error(`User ${userId} not found`);
          return;
        }
        if (post.createdBy.userId.toString() !== userId.toString()) {
          const notification = new Notification({
            userId: post.createdBy.userId,
            type: 'comment',
            senderId: userId,
            postId,
            message: `${sender.firstName} ${sender.lastName} commented on your post`,
            createdAt: new Date(),
          });
          await notification.save();
          io.to(`user_${post.createdBy.userId}`).emit('notification', {
            type: 'comment',
            postId,
            userId,
            comment,
            sender: { firstName: sender.firstName, lastName: sender.lastName, profilePicture: sender.profilePicture },
            createdAt: new Date(),
          });
          await sendFCMNotification(
            post.createdBy.userId.toString(),
            'New Comment',
            `${sender.firstName} ${sender.lastName}: ${comment}`,
            { type: 'comment', postId: postId.toString() },
            io,
            null,
            sender.profilePicture
          );
          await NotificationService.triggerCountUpdate(post.createdBy.userId, io);
        }
        logger.info(`Comment notification sent for post ${postId} by user ${userId}`);
      } catch (error) {
        logger.error(`Error handling commentPost event for post ${postId} by user ${userId}: ${error.message}`);
      }
    });

    socket.on('sendMessage', async (message) => {
      try {
        const { senderId, receiverId, text, messageType, offerDetails, attachment } = message;
        if (!senderId || !receiverId) {
          throw new Error('Missing senderId or receiverId');
        }
        if (messageType === 'text' && !text) {
          throw new Error('Text messages require content');
        }
        if (['offer', 'counter-offer'].includes(messageType) && (!offerDetails || !offerDetails.proposedPrice)) {
          throw new Error('Offer messages require price details');
        }
        const sender = await User.findById(senderId).select('firstName lastName profilePicture role');
        const receiver = await User.findById(receiverId).select('firstName lastName profilePicture');
        if (!sender || !receiver) {
          throw new Error('Sender or receiver not found');
        }
        let notificationText = text || 'Sent you a message';
        let productImageUrl = null;
        let senderProfilePictureUrl = sender.profilePicture || null;
        if (text && text.startsWith('{')) {
          try {
            const parsedMessage = JSON.parse(text);
            notificationText = parsedMessage.text || text;
            productImageUrl = parsedMessage.image || null;
          } catch (e) {
            logger.warn(`Failed to parse message text as JSON for sender ${senderId}: ${text}`);
            notificationText = text;
          }
        } else if (offerDetails && offerDetails.image) {
          productImageUrl = offerDetails.image;
        }
        if (offerDetails && !text.startsWith('{')) {
          if (offerDetails.productName) {
            notificationText += ` Product: ${offerDetails.productName}`;
          }
          if (offerDetails.proposedPrice) {
            notificationText += ` Offer: ₦${Number(offerDetails.proposedPrice).toLocaleString('en-NG')}`;
          }
        }
        const maxLength = 80;
        if (notificationText.length > maxLength) {
          notificationText = notificationText.substring(0, maxLength - 3) + '...';
        }
        const newMessage = new Message({
          senderId,
          receiverId,
          text,
          messageType: messageType || 'text',
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          ...(offerDetails && { offerDetails }),
          ...(attachment && { attachment }),
          metadata: {
            isSystemMessage: false,
            actionRequired: ['offer', 'counter-offer'].includes(messageType),
          },
        });
        const savedMessage = await newMessage.save();
        const messageForSender = {
          ...savedMessage.toObject(),
          chatPartnerName: `${receiver.firstName} ${receiver.lastName}`,
          chatPartnerProfilePicture: receiver.profilePicture || 'Default.png',
        };
        const messageForReceiver = {
          ...savedMessage.toObject(),
          chatPartnerName: `${sender.firstName} ${sender.lastName}`,
          chatPartnerProfilePicture: senderProfilePictureUrl || 'Default.png',
        };
        io.to(`user_${senderId}`).emit('newMessage', messageForSender);
        io.to(`user_${receiverId}`).emit('newMessage', messageForReceiver);
        if (!newMessage.metadata?.isSystemMessage) {
          await sendFCMNotification(
            receiverId.toString(),
            'New Message',
            `${sender.firstName} ${sender.lastName}: ${notificationText}`,
            {
              type: 'message',
              senderId: senderId.toString(),
              messageType: savedMessage.messageType,
            },
            io,
            productImageUrl,
            senderProfilePictureUrl
          );
        }
        await NotificationService.triggerCountUpdate(receiverId, io);
        logger.info(`Message sent from ${senderId} to ${receiverId}`);
      } catch (error) {
        logger.error(`Error sending message from ${message.senderId} to ${message.receiverId}: ${error.message}`);
        socket.emit('messageError', { error: error.message });
      }
    });

    socket.on('markAsSeen', async ({ messageIds, senderId, receiverId }) => {
      try {
        if (!messageIds || !senderId || !receiverId) {
          throw new Error('Missing required fields');
        }
        const messageObjectIds = messageIds.map(id => new mongoose.Types.ObjectId(id));
        await Message.updateMany(
          {
            _id: { $in: messageObjectIds },
            receiverId: new mongoose.Types.ObjectId(receiverId),
            senderId: new mongoose.Types.ObjectId(senderId),
          },
          { $set: { status: 'seen', isRead: true } }
        );
        io.to(`user_${senderId}`).emit('messagesSeen', {
          messageIds,
          seenAt: new Date(),
        });
        await NotificationService.triggerCountUpdate(senderId, io);
        await NotificationService.triggerCountUpdate(receiverId, io);
        logger.info(`Messages marked as seen for sender ${senderId} and receiver ${receiverId}`);
      } catch (error) {
        logger.error(`Error updating message status for sender ${senderId} and receiver ${receiverId}: ${error.message}`);
        socket.emit('markSeenError', { error: error.message });
      }
    });

    socket.on('acceptOffer', async ({ offerId, acceptorId }) => {
      try {
        const originalOffer = await Message.findById(offerId);
        if (!originalOffer) {
          throw new Error('Offer not found');
        }
        if (originalOffer.receiverId.toString() !== acceptorId) {
          throw new Error('Not authorized to accept this offer');
        }
        const buyerMessage = new Message({
          senderId: acceptorId,
          receiverId: originalOffer.senderId,
          messageType: 'accept-offer',
          offerDetails: {
            ...originalOffer.offerDetails,
            status: 'accepted',
          },
          metadata: {
            isSystemMessage: false,
            actionRequired: true,
          },
        });
        await buyerMessage.save();
        const sellerMessage = new Message({
          senderId: originalOffer.senderId,
          receiverId: acceptorId,
          messageType: 'system',
          text: `Your offer for ${originalOffer.offerDetails.productName} was accepted`,
          metadata: {
            isSystemMessage: true,
          },
        });
        await sellerMessage.save();
        io.to(`user_${originalOffer.senderId}`).emit('receiveMessage', buyerMessage);
        io.to(`user_${acceptorId}`).emit('receiveMessage', sellerMessage);
        await Post.findByIdAndUpdate(
          originalOffer.offerDetails.productId,
          { price: originalOffer.offerDetails.proposedPrice }
        );
        await sendFCMNotification(
          originalOffer.senderId.toString(),
          'Offer Accepted',
          `Your offer for ${originalOffer.offerDetails.productName} was accepted`,
          { type: 'accept-offer', offerId: offerId.toString() },
          io,
          originalOffer.offerDetails.image || null
        );
        await NotificationService.triggerCountUpdate(originalOffer.senderId, io);
        await NotificationService.triggerCountUpdate(acceptorId, io);
        logger.info(`Offer ${offerId} accepted by ${acceptorId}`);
      } catch (error) {
        logger.error(`Error accepting offer ${offerId} by ${acceptorId}: ${error.message}`);
        socket.emit('offerError', { error: error.message });
      }
    });

    socket.on('disconnect', async () => {
      try {
        logger.info(`Client disconnected: ${socket.id}`);
        await User.updateOne({ socketId: socket.id }, { socketId: null });
        logger.info(`Cleared socketId ${socket.id}`);
      } catch (err) {
        logger.error(`Error handling disconnect for socket ${socket.id}: ${err.message}`);
      }
    });
  });

  return { io, server };
};

module.exports = initializeSocket;