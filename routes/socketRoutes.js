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

const initializeSocket = (io) => {
  logger.info('Initializing Socket.IO event handlers');

  io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id}`);

    // Handle joinRoom for user-specific notifications
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
        userSocketMap.set(userId, socket.id);
        logger.info(`User ${userId} joined room user_${userId}, socketId: ${socket.id}`);
        await NotificationService.sendCountsToUser(io, userId);
        logger.info(`Notification counts sent to user ${userId}`);
      } catch (err) {
        logger.error(`Error in joinRoom for user ${userId}: ${err.message}`);
      }
    });

    // New: Handle joinChatRoom for specific chat
    socket.on('joinChatRoom', (chatRoomId) => {
      try {
        logger.info(`JoinChatRoom event received for chatRoomId: ${chatRoomId}`);
        socket.join(`chat_${chatRoomId}`);
        logger.info(`Socket ${socket.id} joined chat room chat_${chatRoomId}`);
      } catch (err) {
        logger.error(`Error in joinChatRoom for chatRoomId ${chatRoomId}: ${err.message}`);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      try {
        logger.info(`Client disconnected: ${socket.id}`);
        for (let [userId, socketId] of userSocketMap.entries()) {
          if (socketId === socket.id) {
            userSocketMap.delete(userId);
            logger.info(`Removed user ${userId} from userSocketMap on disconnect`);
            break;
          }
        }
        await User.updateOne({ socketId: socket.id }, { socketId: null });
        logger.info(`Cleared socketId ${socket.id} from user DB`);
      } catch (err) {
        logger.error(`Error handling disconnect for socket ${socket.id}: ${err.message}`);
      }
    });

    // Handle sending a message
    socket.on('sendMessage', async (message) => {
      try {
        logger.info(`Received sendMessage event: ${JSON.stringify(message)}`);
        const { senderId, receiverId, text, messageType, offerDetails, attachment, tempId } = message;
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
          savedMessage = await newMessage.save();
          logger.info(`Successfully saved message from ${senderId} to ${receiverId}: ${savedMessage._id}`);
        } catch (saveError) {
          logger.error(`Failed to save message from ${senderId} to ${receiverId}: ${saveError.message}`);
          socket.emit('messageError', { error: `Failed to save message: ${saveError.message}` });
          return;
        }

        // Create chat room ID (consistent with client-side)
        const chatRoomId = [senderId, receiverId].sort().join('_');

        // Prepare message objects
        const messageForSender = {
          ...savedMessage.toObject(),
          _id: savedMessage._id.toString(),
          senderId: savedMessage.senderId.toString(),
          receiverId: savedMessage.receiverId.toString(),
          chatPartnerName: `${receiver.firstName} ${receiver.lastName}`,
          chatPartnerProfilePicture: receiver.profilePicture || 'Default.png',
          tempId, // Include tempId for sender's optimistic UI
        };

        const messageForReceiver = {
          ...savedMessage.toObject(),
          _id: savedMessage._id.toString(),
          senderId: savedMessage.senderId.toString(),
          receiverId: savedMessage.receiverId.toString(),
          chatPartnerName: `${sender.firstName} ${sender.lastName}`,
          chatPartnerProfilePicture: senderProfilePictureUrl || 'Default.png',
        };

        // Emit to the shared chat room
        io.to(`chat_${chatRoomId}`).emit('newMessage', messageForReceiver); // Emit to both users in the chat room
        logger.info(`Emitted newMessage to chat room chat_${chatRoomId}`);

        // Emit notification to receiver's user room (for other tabs/devices)
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
      } catch (error) {
        logger.error(`Error sending message from ${message.senderId} to ${message.receiverId}: ${error.message}`);
        socket.emit('messageError', { error: error.message });
      }
    });

    // Handle marking messages as seen
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
        // Emit to the shared chat room
        const chatRoomId = [senderId, receiverId].sort().join('_');
        io.to(`chat_${chatRoomId}`).emit('messagesSeen', {
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

    // Keep your existing handlers (acceptOffer, declineOffer, endBargain, etc.)
    socket.on('acceptOffer', async ({ offerId, acceptorId, productId, proposedPrice, productName, productImage }) => {
      try {
        logger.info(`acceptOffer event received: offerId=${offerId}, acceptorId=${acceptorId}, productId=${productId}, proposedPrice=${proposedPrice}, productName=${productName}`);
        const originalOffer = await Message.findById(offerId);
        if (!originalOffer) {
          logger.error(`Offer ${offerId} not found`);
          throw new Error('Offer not found');
        }
        if (originalOffer.receiverId.toString() !== acceptorId) {
          logger.warn(`Unauthorized accept attempt for offer ${offerId} by ${acceptorId}`);
          throw new Error('Not authorized to accept this offer');
        }
        const buyerAcceptMessageToSeller = new Message({
          senderId: acceptorId,
          receiverId: originalOffer.senderId,
          messageType: 'buyerAccept',
          text: JSON.stringify({
            text: `Your offer for ${productName} at ₦${proposedPrice.toLocaleString('en-NG')} was accepted.`,
            image: productImage
          }),
          offerDetails: {
            productId,
            productName,
            proposedPrice,
            image: productImage,
            status: 'accepted'
          },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: {
            isSystemMessage: true,
            actionRequired: false
          }
        });
        await buyerAcceptMessageToSeller.save();
        logger.info(`Created buyerAccept message to seller ${originalOffer.senderId}: ${buyerAcceptMessageToSeller._id}`);
        const sellerAcceptMessageToBuyer = new Message({
          senderId: originalOffer.senderId,
          receiverId: acceptorId,
          messageType: 'sellerAccept',
          text: JSON.stringify({
            text: `Accepted the offer of ₦${proposedPrice.toLocaleString('en-NG')} for "${productName}".`,
            image: productImage
          }),
          offerDetails: {
            productId,
            productName,
            proposedPrice,
            image: productImage,
            status: 'accepted'
          },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: {
            isSystemMessage: true,
            actionRequired: true
          }
        });
        await sellerAcceptMessageToBuyer.save();
        logger.info(`Created sellerAccept message to buyer ${acceptorId}: ${sellerAcceptMessageToBuyer._id}`);
        await Message.findByIdAndUpdate(originalOffer._id, {
          'offerDetails.status': 'accepted',
          status: 'seen'
        });
        logger.info(`Original offer ${offerId} updated to accepted status`);
        const chatRoomId = [acceptorId, originalOffer.senderId].sort().join('_');
        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...buyerAcceptMessageToSeller.toObject(), _id: buyerAcceptMessageToSeller._id.toString() });
        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...sellerAcceptMessageToBuyer.toObject(), _id: sellerAcceptMessageToBuyer._id.toString() });
        await Post.findByIdAndUpdate(productId, { price: proposedPrice });
        logger.info(`Post ${productId Imitate
        await sendFCMNotification(
          originalOffer.senderId.toString(),
          'Offer Accepted',
          `${originalOffer.offerDetails.productName} offer of ₦${proposedPrice.toLocaleString('en-NG')} accepted by ${await User.findById(acceptorId).then(u => u.firstName) || 'buyer'}`,
          { type: 'offer-accepted', productId: productId.toString() },
          io,
          productImage || null,
          null,
          `offer_accepted_${productId.toString()}`
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

    socket.on('declineOffer', async ({ offerId, declinerId, productId, productName, productImage }) => {
      try {
        logger.info(`declineOffer event received: offerId=${offerId}, declinerId=${declinerId}`);
        const originalOffer = await Message.findById(offerId);
        if (!originalOffer) {
          logger.error(`Offer ${offerId} not found`);
          throw new Error('Offer not found');
        }
        if (originalOffer.receiverId.toString() !== declinerId) {
          logger.warn(`Unauthorized decline attempt for offer ${offerId} by ${declinerId}`);
          throw new Error('Not authorized to decline this offer');
        }
        await Message.findByIdAndUpdate(originalOffer._id, {
          'offerDetails.status': 'rejected',
          status: 'seen'
        });
        logger.info(`Original offer ${offerId} updated to rejected status`);
        const declineMessageToSeller = new Message({
          senderId: declinerId,
          receiverId: originalOffer.senderId,
          messageType: 'reject-offer',
          text: JSON.stringify({
            text: `Your offer for ${productName || 'Product'} was rejected.`,
            image: productImage
          }),
          offerDetails: {
            productId,
            productName,
            image: productImage,
            status: 'rejected'
          },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: {
            isSystemMessage: true,
            actionRequired: false
          }
        });
        await declineMessageToSellered
        logger.info(`Created decline message for seller ${originalOffer.senderId}: ${declineMessageToSeller._id}`);
        const declineMessageToBuyer = new Message({
          senderId: originalOffer.senderId,
          receiverId: declinerId,
          messageType: 'reject-offer',
          text: JSON.stringify({
            text: `You rejected the offer for ${productName || 'Product'}.`,
            image: productImage
          }),
          offerDetails: {
            productId,
            productName,
            image: productImage,
            status: 'rejected'
          },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: {
            isSystemMessage: true,
            actionRequired: false
          }
        });
        await declineMessageToBuyer.save();
        logger.info(`Created decline message for buyer ${declinerId}: ${declineMessageToBuyer._id}`);
        const chatRoomId = [declinerId, originalOffer.senderId].sort().join('_');
        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...declineMessageToSeller.toObject(), _id: declineMessageToSeller._id.toString() });
        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...declineMessageToBuyer.toObject(), _id: declineMessageToBuyer._id.toString() });
        await sendFCMNotification(
          originalOffer.senderId.toString(),
          'Offer Declined',
          `Your offer for ${productName || 'Product'} was declined by ${await User.findById(declinerId).then(u => u.firstName) || 'buyer'}.`,
          { type: 'offer-declined', productId: productId.toString() },
          io,
          productImage || null,
          null,
          `offer_declined_${productId.toString()}`
        );
        logger.info(`FCM notification sent for offer ${offerId} declined by ${declinerId}`);
        await NotificationService.triggerCountUpdate(originalOffer.senderId, io);
        await NotificationService.triggerCountUpdate(declinerId, io);
        logger.info(`Offer ${offerId} declined and processed by ${declinerId}`);
      } catch (error) {
        logger.error(`Error declining offer ${offerId} by ${declinerId}: ${error.message}`);
        socket.emit('offerError', { error: error.message });
      }
    });

    socket.on('endBargain', async ({ offerId, enderId, productId, productName }) => {
      try {
        logger.info(`endBargain event received: offerId=${offerId}, enderId=${enderId}, productId=${productId}`);
        const originalOffer = await Message.findById(offerId);
        if (!originalOffer) {
          logger.error(`Offer ${offerId} not found`);
          throw new Error('Offer not found');
        }
        if (originalOffer.senderId.toString() !== enderId && originalOffer.receiverId.toString() !== enderId) {
          logger.warn(`Unauthorized endBargain attempt for offer ${offerId} by ${enderId}`);
          throw new Error('Not authorized to end this bargain');
        }
        const otherParticipantId = originalOffer.senderId.toString() === enderId ? originalOffer.receiverId : originalOffer.senderId;
        const enderUser = await User.findById(enderId);
        const otherParticipantUser = await User.findById(otherParticipantId);
        const systemMessageText = `${enderUser?.firstName || 'A user'} ended the bargain for ${productName || 'Product'}.`;
        const endBargainMessage = new Message({
          senderId: enderId,
          receiverId: otherParticipantId,
          messageType: 'end-bargain',
          text: JSON.stringify({
            text: systemMessageText,
            productId,
            productName
          }),
          offerDetails: {
            productId,
            productName,
            status: 'ended'
          },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: {
            isSystemMessage: true,
            actionRequired: false
          }
        });
        await endBargainMessage.save();
        logger.info(`Created end-bargain message ${endBargainMessage._id} for product ${productId}`);
        const endBargainMessageForEnder = new Message({
          senderId: otherParticipantId,
          receiverId: enderId,
          messageType: 'end-bargain',
          text: JSON.stringify({
            text: `You ended the bargain for ${productName || 'Product'}.`,
            productId,
            productName
          }),
          offerDetails: {
            productId,
            productName,
            status: 'ended'
          },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: {
            isSystemMessage: true,
            actionRequired: false
          }
        });
        await endBargainMessageForEnder.save();
        logger.info(`Created end-bargain message for ender ${enderId}: ${endBargainMessageForEnder._id}`);
        const chatRoomId = [enderId, otherParticipantId].sort().join('_');
        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...endBargainMessageForEnder.toObject(), _id: endBargainMessageForEnder._id.toString() });
        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...endBargainMessage.toObject(), _id: endBargainMessage._id.toString() });
        await sendFCMNotification(
          otherParticipantId.toString(),
          'Bargain Ended',
          systemMessageText,
          { type: 'bargain-ended', productId: productId.toString() },
          io,
          null,
          null,
          `bargain_ended_${productId.toString()}`
        );
        logger.info(`FCM notification sent for bargain ended on product ${productId} by ${enderId}`);
        await NotificationService.triggerCountUpdate(enderId, io);
        await NotificationService.triggerCountUpdate(otherParticipantId, io);
        logger.info(`Bargain for product ${productId} ended and processed by ${enderId}`);
      } catch (error) {
        logger.error(`Error ending bargain for offer ${offerId} by ${enderId}: ${error.message}`);
        socket.emit('offerError', { error: error.message });
      }
    });

    socket.on('badge-update', async ({ type, count, userId }) => { /* ... */ });
    socket.on('followUser', async ({ followerId, followedId }) => { /* ... */ });
    socket.on('likePost', async ({ postId, userId }) => { /* ... */ });
    socket.on('commentPost', async ({ postId, userId, comment }) => { /* ... */ });
  });

  return io;
};

module.exports = initializeSocket;