// socketRoutes.js
const jwt = require('jsonwebtoken'); // Import jwt for token verification
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

    // --- UPDATED: Call triggerCountUpdate on connection ---
    // This fetches the latest counts and sends them to the user's room.
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

      // --- UPDATED: Call triggerCountUpdate on joinRoom ---
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

        const sender = await User.findById(senderId).select('firstName lastName profilePicture role fcmTokens'); // Select fcmTokens
        const receiver = await User.findById(receiverId).select('firstName lastName profilePicture fcmTokens'); // Select fcmTokens

        if (!sender || !receiver) {
          logger.error(`Sender or receiver not found: sender=${senderId}, receiver=${receiverId}`);
          socket.emit('messageError', { tempId, error: 'Sender or receiver not found' });
          return;
        }

        let notificationText = text || 'Sent you a message';
        let productImageUrl = null;
        let senderProfilePictureUrl = sender.profilePicture || null;

        try {
          if (text && text.startsWith('{') && text.endsWith('}')) {
            try {
              const parsedMessage = JSON.parse(text);
              if (parsedMessage.text) notificationText = parsedMessage.text;
              if (parsedMessage.image) productImageUrl = parsedMessage.image;
            } catch (jsonParseError) {
              logger.warn(`Text is not valid JSON despite starting with '{': ${text.substring(0, 50)}...`);
            }
          } else if (attachment && attachment.url && attachment.fileType?.startsWith('image')) {
            productImageUrl = attachment.url;
          } else if (offerDetails && offerDetails.image) {
            productImageUrl = offerDetails.image;
          }

          if (offerDetails && !(['offer', 'counter-offer'].includes(messageType) && text && text.startsWith('{'))) {
            if (offerDetails.productName) {
              notificationText = `${notificationText} - Product: ${offerDetails.productName}`;
            }
            if (offerDetails.proposedPrice) {
              notificationText = `${notificationText} - Offer: ₦${Number(offerDetails.proposedPrice).toLocaleString('en-NG')}`;
            }
          }
        } catch (e) {
          logger.error(`Error processing notification text for sender ${senderId}: ${e.message}`);
        }

        const maxLength = 80;
        if (notificationText.length > maxLength) {
          notificationText = notificationText.substring(0, maxLength - 3) + '...';
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
          senderName: `${sender.firstName} ${sender.lastName}`,
          senderProfilePicture: senderProfilePictureUrl,
          text: notificationText,
          createdAt: new Date(),
          productImageUrl,
          chatRoomId: chatRoomId,
        });
        logger.info(`Emitted newMessageNotification to user_${receiverId}`);

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

        if (!receiverIsOnline || !receiverIsInChatRoom) {
          logger.info(`Receiver ${receiverId} not actively online or in chat. FCM condition met.`);
          if (!newMessage.metadata?.isSystemMessage) {
            // --- UPDATED: Pass the fcmTokens array ---
            await sendFCMNotification(
              receiver.fcmTokens,
              'New Message',
              `${sender.firstName} ${sender.lastName}: ${notificationText}`,
              {
                type: 'message',
                senderId: senderId.toString(),
                receiverId: receiverId.toString(),
                messageId: savedMessage._id.toString(),
                chatRoomId: chatRoomId,
                messageType: savedMessage.messageType,
              },
              io,
              productImageUrl,
              senderProfilePictureUrl,
              `message_${senderId.toString()}_${receiverId.toString()}`
            );
            logger.info(`FCM notification attempt completed for user ${receiverId}`);
          }
        } else {
          logger.info(`Receiver ${receiverId} is online and actively in chat room, skipping FCM.`);
        }

        // --- UPDATED: Correct parameter order for triggerCountUpdate ---
        await NotificationService.triggerCountUpdate(io, receiverId);
        logger.info(`Message sent and processed from ${senderId} to ${receiverId}`);

      } catch (error) {
        logger.error(`Error sending message from ${authenticatedUserId} to ${messageData.receiverId}: ${error.message}`, error.stack);
        socket.emit('messageError', { tempId: messageData.tempId, error: error.message });
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

          // --- UPDATED: Correct parameter order for triggerCountUpdate ---
          await NotificationService.triggerCountUpdate(io, senderId);
        }

        // --- UPDATED: Correct parameter order for triggerCountUpdate ---
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

    socket.on('acceptOffer', async ({ offerId, acceptorId, productId, proposedPrice, productName, productImage }) => {
      try {
        logger.info(`acceptOffer event received from ${authenticatedUserId}: offerId=${offerId}, acceptorId=${acceptorId}`);
        if (authenticatedUserId !== acceptorId) {
          logger.warn(`Unauthorized acceptOffer attempt by ${authenticatedUserId} for acceptor ${acceptorId}.`);
          throw new Error('Unauthorized action');
        }

        const originalOffer = await Message.findById(offerId);
        if (!originalOffer) {
          logger.error(`Offer ${offerId} not found`);
          throw new Error('Offer not found');
        }
        if (originalOffer.receiverId.toString() !== acceptorId) {
          logger.warn(`Unauthorized accept attempt for offer ${offerId} by ${acceptorId} (not receiver).`);
          throw new Error('Not authorized to accept this offer');
        }

        await Message.findByIdAndUpdate(originalOffer._id, {
          'offerDetails.status': 'accepted',
          status: 'seen'
        });
        logger.info(`Original offer ${offerId} updated to accepted status`);

        const sellerId = originalOffer.senderId;
        const chatRoomId = [acceptorId, sellerId.toString()].sort().join('_');
        const acceptorUser = await User.findById(acceptorId);
        const sellerUser = await User.findById(sellerId);

        const buyerAcceptMessageToSeller = new Message({
          senderId: acceptorId,
          receiverId: sellerId,
          messageType: 'buyerAccept',
          text: JSON.stringify({
            text: `Your offer for ${productName || 'Product'} at ₦${proposedPrice.toLocaleString('en-NG')} was accepted.`,
            image: productImage
          }),
          offerDetails: { productId, productName, proposedPrice, image: productImage, status: 'accepted' },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: { isSystemMessage: true, actionRequired: false }
        });
        const savedBuyerAcceptMsg = await buyerAcceptMessageToSeller.save();
        logger.info(`Created buyerAccept message to seller ${sellerId}: ${savedBuyerAcceptMsg._id}`);

        const sellerAcceptMessageToBuyer = new Message({
          senderId: sellerId,
          receiverId: acceptorId,
          messageType: 'sellerAccept',
          text: JSON.stringify({
            text: `You accepted the offer of ₦${proposedPrice.toLocaleString('en-NG')} for "${productName || 'Product'}".`,
            image: productImage
          }),
          offerDetails: { productId, productName, proposedPrice, image: productImage, status: 'accepted' },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: { isSystemMessage: true, actionRequired: true }
        });
        const savedSellerAcceptMsg = await sellerAcceptMessageToBuyer.save();
        logger.info(`Created sellerAccept message to buyer ${acceptorId}: ${savedSellerAcceptMsg._id}`);

        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedBuyerAcceptMsg.toObject(), _id: savedBuyerAcceptMsg._id.toString(), status: 'delivered' });
        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedSellerAcceptMsg.toObject(), _id: savedSellerAcceptMsg._id.toString(), status: 'delivered' });
        logger.info(`Emitted acceptOffer messages to chatRoomId ${chatRoomId}`);

        await Post.findByIdAndUpdate(productId, { price: proposedPrice, status: 'sold' });
        logger.info(`Post ${productId} updated price to ${proposedPrice} and status to sold.`);

        // --- UPDATED: Pass the fcmTokens array ---
        await sendFCMNotification(
          sellerUser.fcmTokens,
          'Offer Accepted',
          `${acceptorUser?.firstName || 'A user'} accepted your offer for ${productName || 'product'} at ₦${proposedPrice.toLocaleString('en-NG')}.`,
          {
            type: 'offer-accepted',
            productId: productId.toString(),
            chatRoomId: chatRoomId,
            messageId: savedBuyerAcceptMsg._id.toString(),
          },
          io,
          productImage || null,
          acceptorUser?.profilePicture || null,
          `offer_accepted_${productId.toString()}`
        );
        logger.info(`FCM notification sent for offer ${offerId} accepted by ${acceptorId}`);

        // --- UPDATED: Correct parameter order for triggerCountUpdate ---
        await NotificationService.triggerCountUpdate(io, sellerId);
        await NotificationService.triggerCountUpdate(io, acceptorId);
        logger.info(`Offer ${offerId} accepted and processed by ${acceptorId}`);

      } catch (error) {
        logger.error(`Error accepting offer ${offerId} by ${authenticatedUserId}: ${error.message}`, error.stack);
        socket.emit('offerError', { error: error.message });
      }
    });

    socket.on('declineOffer', async ({ offerId, declinerId, productId, productName, productImage }) => {
      try {
        logger.info(`declineOffer event received from ${authenticatedUserId}: offerId=${offerId}, declinerId=${declinerId}`);
        if (authenticatedUserId !== declinerId) {
          logger.warn(`Unauthorized declineOffer attempt by ${authenticatedUserId} for decliner ${declinerId}.`);
          throw new Error('Unauthorized action');
        }

        const originalOffer = await Message.findById(offerId);
        if (!originalOffer) {
          logger.error(`Offer ${offerId} not found`);
          throw new Error('Offer not found');
        }
        if (originalOffer.receiverId.toString() !== declinerId) {
          logger.warn(`Unauthorized decline attempt for offer ${offerId} by ${declinerId} (not receiver).`);
          throw new Error('Not authorized to decline this offer');
        }

        await Message.findByIdAndUpdate(originalOffer._id, {
          'offerDetails.status': 'rejected',
          status: 'seen'
        });
        logger.info(`Original offer ${offerId} updated to rejected status`);

        const sellerId = originalOffer.senderId;
        const chatRoomId = [declinerId, sellerId.toString()].sort().join('_');
        const declinerUser = await User.findById(declinerId);
        const sellerUser = await User.findById(sellerId);

        const declineMessageToSeller = new Message({
          senderId: declinerId,
          receiverId: sellerId,
          messageType: 'reject-offer',
          text: JSON.stringify({
            text: `Your offer for ${productName || 'Product'} was rejected.`,
            image: productImage
          }),
          offerDetails: { productId, productName, image: productImage, status: 'rejected' },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: { isSystemMessage: true, actionRequired: false }
        });
        const savedDeclineToSeller = await declineMessageToSeller.save();
        logger.info(`Created decline message for seller ${sellerId}: ${savedDeclineToSeller._id}`);

        const declineMessageToBuyer = new Message({
          senderId: sellerId,
          receiverId: declinerId,
          messageType: 'reject-offer',
          text: JSON.stringify({
            text: `You rejected the offer for ${productName || 'Product'}.`,
            image: productImage
          }),
          offerDetails: { productId, productName, image: productImage, status: 'rejected' },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: { isSystemMessage: true, actionRequired: false }
        });
        const savedDeclineToBuyer = await declineMessageToBuyer.save();
        logger.info(`Created decline message for buyer ${declinerId}: ${savedDeclineToBuyer._id}`);

        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedDeclineToSeller.toObject(), _id: savedDeclineToSeller._id.toString(), status: 'delivered' });
        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedDeclineToBuyer.toObject(), _id: savedDeclineToBuyer._id.toString(), status: 'delivered' });
        logger.info(`Emitted declineOffer messages to chatRoomId ${chatRoomId}`);

        // --- UPDATED: Pass the fcmTokens array ---
        await sendFCMNotification(
          sellerUser.fcmTokens,
          'Offer Declined',
          `${declinerUser?.firstName || 'A user'} declined your offer for ${productName || 'Product'}.`,
          {
            type: 'offer-declined',
            productId: productId.toString(),
            chatRoomId: chatRoomId,
            messageId: savedDeclineToSeller._id.toString(),
          },
          io,
          productImage || null,
          declinerUser?.profilePicture || null,
          `offer_declined_${productId.toString()}`
        );
        logger.info(`FCM notification sent for offer ${offerId} declined by ${declinerId}`);

        // --- UPDATED: Correct parameter order for triggerCountUpdate ---
        await NotificationService.triggerCountUpdate(io, sellerId);
        await NotificationService.triggerCountUpdate(io, declinerId);
        logger.info(`Offer ${offerId} declined and processed by ${declinerId}`);

      } catch (error) {
        logger.error(`Error declining offer ${offerId} by ${authenticatedUserId}: ${error.message}`, error.stack);
        socket.emit('offerError', { error: error.message });
      }
    });

    socket.on('endBargain', async ({ offerId, enderId, productId, productName, otherParticipantId }) => {
      try {
        logger.info(`endBargain event received from ${authenticatedUserId}: offerId=${offerId}, enderId=${enderId}, productId=${productId}, otherParticipantId=${otherParticipantId}`);
        if (authenticatedUserId !== enderId) {
          logger.warn(`Unauthorized endBargain attempt by ${authenticatedUserId} for ender ${enderId}.`);
          throw new Error('Unauthorized action');
        }

        let actualOtherParticipantId = otherParticipantId;
        const originalOffer = offerId ? await Message.findById(offerId) : null;

        if (originalOffer) {
          if (originalOffer.senderId.toString() !== enderId && originalOffer.receiverId.toString() !== enderId) {
            logger.warn(`Unauthorized endBargain attempt for offer ${offerId} by ${enderId}`);
            throw new Error('Not authorized to end this bargain');
          }
          actualOtherParticipantId = originalOffer.senderId.toString() === enderId ? originalOffer.receiverId.toString() : originalOffer.senderId.toString();

          await Message.findByIdAndUpdate(originalOffer._id, {
            'offerDetails.status': 'ended',
            status: 'seen'
          });
          logger.info(`Original offer ${offerId} updated to ended status`);
        } else {
          if (!actualOtherParticipantId) {
            logger.error(`Cannot end bargain: otherParticipantId not provided for ender ${enderId} when offerId is missing.`);
            socket.emit('offerError', { error: 'Cannot end bargain without specifying other participant.' });
            return;
          }
          logger.warn(`endBargain received without specific offerId from ${enderId}. Proceeding with provided otherParticipantId: ${actualOtherParticipantId}.`);
        }

        const enderUser = await User.findById(enderId);
        const otherParticipantUser = await User.findById(actualOtherParticipantId);
        const chatRoomId = [enderId, actualOtherParticipantId].sort().join('_');

        const endBargainMessage = new Message({
          senderId: enderId,
          receiverId: actualOtherParticipantId,
          messageType: 'end-bargain',
          text: JSON.stringify({
            text: `${enderUser?.firstName || 'A user'} ended the bargain for ${productName || 'Product'}.`,
            productId,
            productName
          }),
          offerDetails: { productId, productName, status: 'ended' },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: { isSystemMessage: true, actionRequired: false }
        });
        const savedEndBargainMsg = await endBargainMessage.save();
        logger.info(`Created end-bargain message ${savedEndBargainMsg._id} for product ${productId}`);

        const endBargainMessageForEnder = new Message({
          senderId: actualOtherParticipantId,
          receiverId: enderId,
          messageType: 'end-bargain',
          text: JSON.stringify({
            text: `You ended the bargain for ${productName || 'Product'}.`,
            productId,
            productName
          }),
          offerDetails: { productId, productName, status: 'ended' },
          status: 'sent',
          isRead: false,
          createdAt: new Date(),
          metadata: { isSystemMessage: true, actionRequired: false }
        });
        const savedEndBargainForEnder = await endBargainMessageForEnder.save();
        logger.info(`Created end-bargain message for ender ${enderId}: ${savedEndBargainForEnder._id}`);

        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedEndBargainForEnder.toObject(), _id: savedEndBargainForEnder._id.toString(), status: 'delivered' });
        io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedEndBargainMsg.toObject(), _id: savedEndBargainMsg._id.toString(), status: 'delivered' });
        logger.info(`Emitted endBargain messages to chatRoomId ${chatRoomId}`);

        // --- UPDATED: Pass the fcmTokens array ---
        await sendFCMNotification(
          otherParticipantUser.fcmTokens,
          'Bargain Ended',
          `${enderUser?.firstName || 'A user'} ended the bargain for ${productName || 'Product'}.`,
          {
            type: 'bargain-ended',
            productId: productId.toString(),
            chatRoomId: chatRoomId,
            messageId: savedEndBargainMsg._id.toString(),
          },
          io,
          null,
          null,
          `bargain_ended_${productId.toString()}`
        );
        logger.info(`FCM notification sent for bargain ended on product ${productId} by ${enderId}`);

        // --- UPDATED: Correct parameter order for triggerCountUpdate ---
        await NotificationService.triggerCountUpdate(io, enderId);
        await NotificationService.triggerCountUpdate(io, actualOtherParticipantId);
        logger.info(`Bargain for product ${productId} ended and processed by ${enderId}`);

      } catch (error) {
        logger.error(`Error ending bargain for offer ${offerId || 'N/A'} by ${authenticatedUserId}: ${error.message}`, error.stack);
        socket.emit('offerError', { error: error.message });
      }
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
