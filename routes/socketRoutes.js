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

const recentInteractions = new Map();

async function getAggregatedMessage(postId, type, currentSenderId, ownerId) {
  const post = await Post.findById(postId).select('likes comments');
  if (!post) return null;

  let userIds = [];
  let actionVerb = '';
  let notificationType = '';

  if (type === 'like') {
    userIds = post.likes || [];
    actionVerb = 'liked';
    notificationType = 'like';
  } else if (type === 'comment') {
    const distinctCommenterIds = Array.from(new Set(post.comments.map(c => c.createdBy?.userId ? c.createdBy.userId.toString() : null))).filter(Boolean);
    userIds = distinctCommenterIds.map(id => new mongoose.Types.ObjectId(id));
    actionVerb = 'commented on';
    notificationType = 'comment';
  }

  const interactionUsers = userIds.filter(id => id.toString() !== ownerId.toString());

  if (interactionUsers.length === 0) {
    return null;
  }

  const currentSender = await User.findById(currentSenderId).select('firstName');
  const currentSenderName = currentSender ? currentSender.firstName : 'Someone';

  let message = '';
  let firstSenderName = currentSenderName;

  const otherInteractors = interactionUsers.filter(id => id.toString() !== currentSenderId.toString());

  if (otherInteractors.length > 0) {
    const firstOtherInteractor = await User.findById(otherInteractors[0]).select('firstName');
    firstSenderName = firstOtherInteractor ? firstOtherInteractor.firstName : 'Someone';
  }

  const totalInteractions = interactionUsers.length;

  if (totalInteractions === 1) {
    message = `${firstSenderName} ${actionVerb} your ad.`;
  } else {
    const displaySender = currentSenderName;
    const remainingCount = totalInteractions - 1;
    if (remainingCount > 0) {
      message = `${displaySender} and ${remainingCount} others ${actionVerb} your ad.`;
    } else {
      message = `${displaySender} ${actionVerb} your ad.`;
    }
  }

  return { message, notificationType };
}


const initializeSocket = (io) => {
  logger.info('Initializing Socket.IO event handlers');

  io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id}`);

    socket.on('joinRoom', async (userId) => {
      try {
        logger.info(`JoinRoom event received for userId: ${userId}`);
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          logger.warn(`Invalid userId in joinRoom: ${userId}`);
          return;
        }
        const user = await User.findByIdAndUpdate(userId, { socketId: socket.id }, { new: true });
        if (!user) {
          logger.error(`User ${userId} not found in joinRoom`);
          return;
        }
        socket.join(`user_${userId}`);
        logger.info(`User ${userId} joined room user_${userId}`);
        await NotificationService.sendCountsToUser(io, userId);
        logger.info(`Notification counts sent to user ${userId}`);
      } catch (err) {
        logger.error(`Error in joinRoom for user ${userId}: ${err.message}`);
      }
    });

    socket.on('badge-update', async ({ type, count, userId }) => {
      try {
        logger.info(`badge-update event received: type=${type}, count=${count}, userId=${userId}`);
        io.to(`user_${userId}`).emit('badge-update', { type, count, userId });
        logger.info(`Broadcasted badge-update for ${type} to user ${userId}`);
        await NotificationService.sendCountsToUser(io, userId);
        logger.info(`Notification counts updated for user ${userId}`);
      } catch (error) {
        logger.error(`Error broadcasting badge-update for user ${userId}: ${error.message}`);
      }
    });

    socket.on('followUser', async ({ followerId, followedId }) => {
      try {
        logger.info(`followUser event received: followerId=${followerId}, followedId=${followedId}`);
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
        logger.info(`Created follow notification for user ${followedId}`);
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
          follower.profilePicture,
          `follow_${followerId}_${followedId}`
        );
        logger.info(`FCM notification sent for follow event from ${followerId} to ${followedId}`);
        await NotificationService.triggerCountUpdate(followedId, io);
        logger.info(`Follow notification processed from ${followerId} to ${followedId}`);
      } catch (error) {
        logger.error(`Error handling followUser event for ${followerId} to ${followedId}: ${error.message}`);
      }
    });

    socket.on('likePost', async ({ postId, userId }) => {
      try {
        logger.info(`likePost event received: postId=${postId}, userId=${userId}`);
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
          logger.warn(`Invalid userId ${userId} or postId ${postId}`);
          return;
        }
        const post = await Post.findById(postId).select('createdBy');
        if (!post) {
          logger.error(`Post ${postId} not found`);
          return;
        }
        const postOwnerId = post.createdBy.userId;
        const sender = await User.findById(userId).select('firstName lastName profilePicture');
        if (!sender) {
          logger.error(`User ${userId} not found`);
          return;
        }

        if (postOwnerId.toString() !== userId.toString()) {
          const { message: aggregatedMessage, notificationType } = await getAggregatedMessage(postId, 'like', userId, postOwnerId);

          if (aggregatedMessage) {
            const notification = new Notification({
              userId: postOwnerId,
              type: 'like',
              senderId: userId,
              postId,
              message: aggregatedMessage,
              createdAt: new Date(),
            });
            await notification.save();
            logger.info(`Created (or updated) like notification for user ${postOwnerId} for post ${postId}`);

            io.to(`user_${postOwnerId}`).emit('notification', {
              type: notificationType,
              postId,
              userId,
              sender: { firstName: sender.firstName, lastName: sender.lastName, profilePicture: sender.profilePicture },
              message: aggregatedMessage,
              createdAt: new Date(),
            });

            await sendFCMNotification(
              postOwnerId.toString(),
              'New Like',
              aggregatedMessage,
              { type: 'like', postId: postId.toString() },
              io,
              null,
              sender.profilePicture,
              `post_like_${postId.toString()}`
            );
            logger.info(`FCM notification sent for like event on post ${postId} by user ${userId} (aggregated)`);
            await NotificationService.triggerCountUpdate(postOwnerId, io);
          }
        }
        logger.info(`Like notification processed for post ${postId} by user ${userId}`);
      } catch (error) {
        logger.error(`Error handling likePost event for post ${postId} by user ${userId}: ${error.message}`);
      }
    });

    socket.on('commentPost', async ({ postId, userId, comment }) => {
      try {
        logger.info(`commentPost event received: postId=${postId}, userId=${userId}, comment=${comment}`);
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
          logger.warn(`Invalid userId ${userId} or postId ${postId}`);
          return;
        }
        const post = await Post.findById(postId).select('createdBy');
        if (!post) {
          logger.error(`Post ${postId} not found`);
          return;
        }
        const postOwnerId = post.createdBy.userId;
        const sender = await User.findById(userId).select('firstName lastName profilePicture');
        if (!sender) {
          logger.error(`User ${userId} not found`);
          return;
        }

        if (postOwnerId.toString() !== userId.toString()) {
          const { message: aggregatedMessage, notificationType } = await getAggregatedMessage(postId, 'comment', userId, postOwnerId);

          if (aggregatedMessage) {
            const notification = new Notification({
              userId: postOwnerId,
              type: 'comment',
              senderId: userId,
              postId,
              message: aggregatedMessage,
              createdAt: new Date(),
            });
            await notification.save();
            logger.info(`Created (or updated) comment notification for user ${postOwnerId} for post ${postId}`);

            io.to(`user_${postOwnerId}`).emit('notification', {
              type: notificationType,
              postId,
              userId,
              comment,
              sender: { firstName: sender.firstName, lastName: sender.lastName, profilePicture: sender.profilePicture },
              message: aggregatedMessage,
              createdAt: new Date(),
            });

            await sendFCMNotification(
              postOwnerId.toString(),
              'New Comment',
              aggregatedMessage,
              { type: 'comment', postId: postId.toString() },
              io,
              null,
              sender.profilePicture,
              `post_comment_${postId.toString()}`
            );
            logger.info(`FCM notification sent for comment event on post ${postId} by user ${userId} (aggregated)`);
            await NotificationService.triggerCountUpdate(postOwnerId, io);
          }
        }
        logger.info(`Comment notification processed for post ${postId} by user ${userId}`);
      } catch (error) {
        logger.error(`Error handling commentPost event for post ${postId} by user ${userId}: ${error.message}`);
      }
    });

    // THIS IS THE PRIMARY MESSAGE SENDING AND BROADCASTING LOGIC
    socket.on('sendMessage', async (message) => {
      try {
        logger.info(`Received sendMessage event: ${JSON.stringify(message)}`);
        // Extract tempId here along with other message properties
        const { senderId, receiverId, text, messageType, offerDetails, attachment, tempId } = message; // <--- tempId is correctly extracted
        if (!senderId || !receiverId) {
          logger.warn(`Missing senderId or receiverId: senderId=${senderId}, receiverId=${receiverId}`);
          throw new Error('Missing senderId or receiverId');
        }
        if (messageType === 'text' && !text) {
          logger.warn(`Text message missing content: ${text}`);
          throw new Error('Text messages require content');
        }
        if (['offer', 'counter-offer'].includes(messageType) && (!offerDetails || !offerDetails.proposedPrice)) {
          logger.warn(`Offer message missing price details: ${JSON.stringify(offerDetails)}`);
          throw new Error('Offer messages require price details');
        }
        logger.info(`Fetching sender ${senderId} and receiver ${receiverId}`);
        const sender = await User.findById(senderId).select('firstName lastName profilePicture role fcmToken');
        const receiver = await User.findById(receiverId).select('firstName lastName profilePicture fcmToken');
        if (!sender || !receiver) {
          logger.error(`Sender or receiver not found: sender=${senderId}, receiver=${receiverId}`);
          throw new Error('Sender or receiver not found');
        }
        logger.info(`Sender ${senderId} FCM token: ${sender.fcmToken || 'Not found'}, Receiver ${receiverId} FCM token: ${receiver.fcmToken || 'Not found'}`);
        let notificationText = text || 'Sent you a message';
        let productImageUrl = null;
        let senderProfilePictureUrl = sender.profilePicture || null;
        logger.info(`Processing notification text for message from ${senderId}`);
        try {
          if (text && text.startsWith('{')) {
            const parsedMessage = JSON.parse(text);
            notificationText = parsedMessage.text || text;
            productImageUrl = parsedMessage.image || null;
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
        } catch (e) {
          logger.error(`Error processing notification text for sender ${senderId}: ${e.message}`);
          throw e;
        }
        const maxLength = 80;
        if (notificationText.length > maxLength) {
          notificationText = notificationText.substring(0, maxLength - 3) + '...';
        }
        logger.info(`Creating new message from ${senderId} to ${receiverId} with text: ${notificationText}`);
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
        let savedMessage;
        try {
          savedMessage = await newMessage.save(); // <--- Message is saved to DB here
          logger.info(`Successfully saved message from ${senderId} to ${receiverId}: ${savedMessage._id}`);
        } catch (saveError) {
          logger.error(`Failed to save message from ${senderId} to ${receiverId}: ${saveError.message}`);
          throw new Error(`Failed to save message: ${saveError.message}`);
        }

        // Prepare message object to emit to sender
        // This includes the tempId for the optimistic UI update
        const messageForSender = {
          ...savedMessage.toObject(),
          chatPartnerName: `${receiver.firstName} ${receiver.lastName}`,
          chatPartnerProfilePicture: receiver.profilePicture || 'Default.png',
          tempId: tempId, // <--- CRUCIAL: Pass the tempId back to the sender
        };

        // Prepare message object to emit to receiver
        // No tempId is needed for the receiver as they didn't optimistically send it
        const messageForReceiver = {
          ...savedMessage.toObject(),
          chatPartnerName: `${sender.firstName} ${sender.lastName}`,
          chatPartnerProfilePicture: senderProfilePictureUrl || 'Default.png',
        };

        // Emit to sender
        io.to(`user_${senderId}`).emit('newMessage', messageForSender); // <--- Emitting 'newMessage'
        logger.info(`Emitted newMessage to sender ${senderId} with tempId: ${tempId}`);

        // Emit to receiver
        io.to(`user_${receiverId}`).emit('newMessage', messageForReceiver); // <--- Emitting 'newMessage'
        logger.info(`Emitted newMessage to receiver ${receiverId}`);

        io.to(`user_${receiverId}`).emit('newMessageNotification', {
          senderId,
          senderName: `${sender.firstName} ${sender.lastName}`,
          senderProfilePicture: senderProfilePictureUrl,
          text: notificationText,
          createdAt: new Date(),
          productImageUrl,
        });
        logger.info(`Emitted newMessageNotification to user ${receiverId}`);

        if (!newMessage.metadata?.isSystemMessage) {
          logger.info(`Attempting to send FCM notification to user ${receiverId}`);
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
            senderProfilePictureUrl,
            `message_${senderId.toString()}_${receiverId.toString()}`
          );
          logger.info(`FCM notification attempt completed for user ${receiverId}`);
        }
        await NotificationService.triggerCountUpdate(receiverId, io);
        logger.info(`Message sent and processed from ${senderId} to ${receiverId}`);
        // Consider if 'messageSynced' is still needed, 'newMessage' typically confirms delivery
        // io.to(`user_${receiverId}`).emit('messageSynced', {
        //   ...messageForReceiver,
        //   syncedAt: new Date(),
        // });
      } catch (error) {
        logger.error(`Error sending message from ${message.senderId} to ${message.receiverId}: ${error.message}`);
        socket.emit('messageError', { error: error.message });
      }
    });

    socket.on('markAsSeen', async ({ messageIds, senderId, receiverId }) => {
      try {
        logger.info(`markAsSeen event received: messageIds=${messageIds}, senderId=${senderId}, receiverId=${receiverId}`);
        if (!messageIds || !senderId || !receiverId) {
          logger.warn(`Missing required fields in markAsSeen: messageIds=${messageIds}, senderId=${senderId}, receiverId=${receiverId}`);
          throw new Error('Missing required fields');
        }
        const messageObjectIds = messageIds.map(id => new mongoose.Types.ObjectId(id));
        const result = await Message.updateMany(
          {
            _id: { $in: messageObjectIds },
            receiverId: new mongoose.Types.ObjectId(receiverId),
            senderId: new mongoose.Types.ObjectId(senderId),
          },
          { $set: { status: 'seen', isRead: true } }
        );
        logger.info(`Marked ${result.modifiedCount} messages as seen for sender ${senderId} and receiver ${receiverId}`);
        io.to(`user_${senderId}`).emit('messagesSeen', {
          messageIds,
          seenAt: new Date(),
        });
        await NotificationService.triggerCountUpdate(senderId, io);
        await NotificationService.triggerCountUpdate(receiverId, io);
        logger.info(`Mark as seen processed for sender ${senderId} and receiver ${receiverId}`);
      } catch (error) {
        logger.error(`Error updating message status for sender ${senderId} and receiver ${receiverId}: ${error.message}`);
        socket.emit('markSeenError', { error: error.message });
      }
    });

    socket.on('acceptOffer', async ({ offerId, acceptorId }) => {
      try {
        logger.info(`acceptOffer event received: offerId=${offerId}, acceptorId=${acceptorId}`);
        const originalOffer = await Message.findById(offerId);
        if (!originalOffer) {
          logger.error(`Offer ${offerId} not found`);
          throw new Error('Offer not found');
        }
        if (originalOffer.receiverId.toString() !== acceptorId) {
          logger.warn(`Unauthorized accept attempt for offer ${offerId} by ${acceptorId}`);
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
        logger.info(`Created buyer accept-offer message ${buyerMessage._id} for offer ${offerId}`);
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
        logger.info(`Created seller system message ${sellerMessage._id} for offer ${offerId}`);
        // NOTE: Changed to 'newMessage' for consistency with client listener
        io.to(`user_${originalOffer.senderId}`).emit('newMessage', buyerMessage);
        io.to(`user_${acceptorId}`).emit('newMessage', sellerMessage);
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
          originalOffer.offerDetails.image || null,
          null,
          `offer_accepted_${originalOffer.offerDetails.productId.toString()}`
        );
        logger.info(`FCM notification sent for offer ${offerId} accepted by ${acceptorId}`);
        await NotificationService.triggerCountUpdate(originalOffer.senderId, io);
        await NotificationService.triggerCountUpdate(acceptorId, io);
        logger.info(`Offer ${offerId} accepted and processed by ${acceptorId}`);
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

  return io;
};

module.exports = initializeSocket;
