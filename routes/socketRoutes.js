// socketRoutes.js
const jwt = require('jsonwebtoken'); // Import jwt for token verification
const mongoose = require('mongoose');
const User = require('../models/userSchema.js');
const Notification = require('../models/notificationSchema.js'); // Assuming this is used for general notifications, not just messages
const Post = require('../models/postSchema.js'); // For offer-related updates
const Message = require('../models/messageSchema.js');
const NotificationService = require('../services/notificationService.js'); // Your custom service
const { sendFCMNotification } = require('../services/notificationUtils.js'); // Your FCM utility
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

// userSocketMap isn't strictly necessary for direct chat if using rooms effectively,
// but can be useful for individual user notifications or cross-device sync.
// For now, we'll primarily rely on Socket.IO rooms.
const userSocketMap = new Map(); // Keep if you use it elsewhere for direct socket targeting

const initializeSocket = (io) => {
  logger.info('Initializing Socket.IO event handlers');

  // --- Socket.IO Authentication Middleware (Before io.on('connection')) ---
  // This middleware runs for every new Socket.IO connection *before* the 'connection' event.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token; // Expect token from client's socket.io-client config

    if (!token) {
      logger.warn(`Socket ${socket.id} connection attempt: No token provided.`);
      return next(new Error('Authentication error: No token provided.'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Attach the decoded user information to the socket object
      // Use 'userId' or '_id' as per your JWT payload structure
      socket.user = { id: decoded.userId || decoded._id }; // Ensure you're getting the correct user ID from your token
      logger.info(`Socket ${socket.id} authenticated for user: ${socket.user.id}`);
      next(); // Allow the connection to proceed
    } catch (error) {
      logger.error(`Socket ${socket.id} authentication failed: ${error.message}`);
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Token expired.'));
      }
      return next(new Error('Authentication error: Invalid token.'));
    }
  });

  // --- Main Socket.IO Connection Handler ---
  io.on('connection', (socket) => {
    // At this point, socket.user.id is guaranteed to be available from the middleware
    const authenticatedUserId = socket.user.id;
    logger.info(`New client connected: ${socket.id} (Authenticated User: ${authenticatedUserId})`);

    // Map userId to current socketId and join user's personal room
    userSocketMap.set(authenticatedUserId, socket.id);
    socket.join(`user_${authenticatedUserId}`);
    logger.info(`Socket ${socket.id} (User: ${authenticatedUserId}) connected and joined user_${authenticatedUserId}`);

    // Send initial counts if user just connected
    NotificationService.sendCountsToUser(io, authenticatedUserId).catch(err => logger.error(`Error sending initial counts to ${authenticatedUserId}: ${err.message}`));


    // Handle joinRoom (mostly redundant now but can be used for explicit re-joining)
    socket.on('joinRoom', async (userId) => {
        // Ensure the userId joining matches the authenticated user ID of this socket.
        if (authenticatedUserId !== userId) {
            logger.warn(`User ${authenticatedUserId} attempted to join room for different user ${userId}.`);
            return; // Prevent unauthorized room joining
        }
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            logger.warn(`Invalid userId in joinRoom: ${userId}`);
            return;
        }

        if (userSocketMap.get(userId) !== socket.id) { // Only update if socketId changed or not mapped
             userSocketMap.set(userId, socket.id);
             // await User.findByIdAndUpdate(userId, { socketId: socket.id }, { new: true }); // Update DB if tracking active socketId
        }
        socket.join(`user_${userId}`);
        logger.info(`User ${userId} (socket ${socket.id}) confirmed join to user_${userId} room.`);
        await NotificationService.sendCountsToUser(io, userId); // Re-send counts on explicit join
        logger.info(`Notification counts sent to user ${userId} after joinRoom event.`);
    });

    // Handle joinChatRoom for specific chat
    socket.on('joinChatRoom', (chatRoomId) => {
      try {
        logger.info(`JoinChatRoom event received from ${authenticatedUserId} for chatRoomId: ${chatRoomId}`);
        // Basic validation: ensure the chatRoomId corresponds to a chat the authenticated user is part of.
        const [id1, id2] = chatRoomId.split('_').sort();
        if (authenticatedUserId !== id1 && authenticatedUserId !== id2) {
            logger.warn(`User ${authenticatedUserId} attempted to join unauthorized chatRoomId: ${chatRoomId}`);
            return; // Optionally, reject joining the room
        }

        socket.join(`chat_${chatRoomId}`);
        logger.info(`Socket ${socket.id} (User: ${authenticatedUserId}) joined chat room chat_${chatRoomId}`);
      } catch (err) {
        logger.error(`Error in joinChatRoom for chatRoomId ${chatRoomId}: ${err.message}`);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      try {
        logger.info(`Client disconnected: ${socket.id} (User: ${authenticatedUserId})`);
        if (authenticatedUserId) {
            // Remove mapping for this user's specific socket if it was the last active one
            if (userSocketMap.get(authenticatedUserId) === socket.id) {
                userSocketMap.delete(authenticatedUserId);
                logger.info(`Removed user ${authenticatedUserId} from userSocketMap on disconnect.`);
            }
            // Optionally, clear socketId from DB if you track online status this way
            // await User.updateOne({ _id: authenticatedUserId }, { socketId: null });
            // logger.info(`Cleared socketId for user ${authenticatedUserId} from user DB.`);
        }
      } catch (err) {
        logger.error(`Error handling disconnect for socket ${socket.id}: ${err.message}`);
      }
    });

    // --- Handle sending a message ---
    socket.on('sendMessage', async (messageData) => {
      try {
        logger.info(`Received sendMessage event: ${JSON.stringify(messageData)}`);
        // Validate senderId from authenticated socket, not client payload
        const senderId = authenticatedUserId; // Using authenticatedUserId directly
        const { receiverId, text, messageType, offerDetails, attachment, tempId } = messageData;

        if (!senderId || !receiverId) {
          logger.warn(`Missing senderId (${senderId}) or receiverId (${receiverId}) from messageData.`);
          socket.emit('messageError', { tempId, error: 'Missing senderId or receiverId' });
          return;
        }

        // Basic content validation based on message type
        if (messageType === 'text' && !text) {
          logger.warn(`Text message missing content.`);
          socket.emit('messageError', { tempId, error: 'Text messages require content' });
          return;
        }
        if (['offer', 'counter-offer'].includes(messageType) && (!offerDetails || !offerDetails.proposedPrice)) {
          logger.warn(`Offer message missing price details: ${JSON.stringify(offerDetails)}`);
          socket.emit('messageError', { tempId, error: 'Offer messages require price details' });
          return;
        }
        if (attachment && (!attachment.url || !attachment.fileType)) {
            logger.warn(`Attachment message missing URL or fileType: ${JSON.stringify(attachment)}`);
            socket.emit('messageError', { tempId, error: 'Attachment messages require URL and fileType' });
            return;
        }


        logger.info(`Fetching sender ${senderId} and receiver ${receiverId}`);
        const sender = await User.findById(senderId).select('firstName lastName profilePicture role fcmToken');
        const receiver = await User.findById(receiverId).select('firstName lastName profilePicture fcmToken');

        if (!sender || !receiver) {
          logger.error(`Sender or receiver not found: sender=${senderId}, receiver=${receiverId}`);
          socket.emit('messageError', { tempId, error: 'Sender or receiver not found' });
          return;
        }

        let notificationText = text || 'Sent you a message';
        let productImageUrl = null;
        let senderProfilePictureUrl = sender.profilePicture || null;

        try {
            if (text && text.startsWith('{')) { // Assuming product info is sent as JSON in text for offers
                const parsedMessage = JSON.parse(text);
                notificationText = parsedMessage.text || text;
                productImageUrl = parsedMessage.image || null;
            } else if (attachment && attachment.url && attachment.fileType?.startsWith('image')) {
                productImageUrl = attachment.url;
            } else if (offerDetails && offerDetails.image) {
                productImageUrl = offerDetails.image;
            }

            if (offerDetails && !text?.startsWith('{')) { // Append offer details if not already in JSON text
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

        // Create new Message document
        const newMessage = new Message({
          senderId,
          receiverId,
          text: text, // Store original text, even if it was JSON
          messageType: messageType || 'text',
          status: 'sent', // Initial status
          isRead: false,
          createdAt: new Date(),
          ...(offerDetails && { offerDetails }),
          ...(attachment && { attachment }),
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

        // --- Real-time communication using Socket.IO rooms ---
        // chatRoomId is used to potentially check if receiver is *in* the specific chat
        const chatRoomId = [senderId, receiverId].sort().join('_');

        // 1. Emit to Sender (for optimistic UI confirmation and status update)
        io.to(`user_${senderId}`).emit('newMessage', {
          ...savedMessage.toObject(),
          _id: savedMessage._id.toString(),
          tempId: tempId, // Pass back tempId for client-side matching
          status: 'delivered' // Mark as delivered to sender for checkmark
        });
        logger.info(`Emitted newMessage (sender confirmation) to user_${senderId} for message ${savedMessage._id}`);


        // 2. Emit to Receiver (for real-time display)
        io.to(`user_${receiverId}`).emit('newMessage', {
          ...savedMessage.toObject(),
          _id: savedMessage._id.toString(),
          status: 'delivered' // Mark as delivered for receiver
        });
        logger.info(`Emitted newMessage to user_${receiverId} for message ${savedMessage._id}`);


        // 3. Emit notification to receiver's user room (for general notifications outside of active chat view)
        io.to(`user_${receiverId}`).emit('newMessageNotification', {
          senderId: senderId.toString(),
          senderName: `${sender.firstName} ${sender.lastName}`,
          senderProfilePicture: senderProfilePictureUrl,
          text: notificationText,
          createdAt: new Date(),
          productImageUrl,
          chatRoomId: chatRoomId, // Add chatRoomId to notification for direct navigation
        });
        logger.info(`Emitted newMessageNotification to user_${receiverId}`);

        // 4. Send FCM notification if receiver is offline or not actively in chat with sender
        // Check if receiver is connected to *any* socket or specifically in this chat room
        const receiverIsOnline = io.sockets.adapter.rooms.get(`user_${receiverId}`)?.size > 0;
        const receiverIsInChatRoom = io.sockets.adapter.rooms.get(`chat_${chatRoomId}`)?.has(userSocketMap.get(receiverId)); // Check if any socket for receiver is in chat_room

        if (!receiverIsOnline || !receiverIsInChatRoom) { // Send FCM if not actively engaged in chat
          logger.info(`Receiver ${receiverId} not actively online or in chat, attempting FCM.`);
          if (!newMessage.metadata?.isSystemMessage) { // Don't send FCM for system messages unless specifically desired
              await sendFCMNotification(
                  receiver.fcmToken,
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
                  `message_${senderId.toString()}_${receiverId.toString()}` // Collapse key
              );
              logger.info(`FCM notification attempt completed for user ${receiverId}`);
          }
        } else {
            logger.info(`Receiver ${receiverId} is online and potentially in chat room, skipping FCM for real-time.`);
        }

        // Update notification counts for receiver (and sender, if needed, though usually receiver gets the new unread count)
        await NotificationService.triggerCountUpdate(receiverId, io);
        logger.info(`Message sent and processed from ${senderId} to ${receiverId}`);

      } catch (error) {
        logger.error(`Error sending message from ${authenticatedUserId} to ${messageData.receiverId}: ${error.message}`, error.stack);
        socket.emit('messageError', { tempId: messageData.tempId, error: error.message });
      }
    });

    // --- Handle marking messages as seen ---
    socket.on('markAsSeen', async ({ messageIds, senderId, receiverId }) => {
      try {
        logger.info(`markAsSeen event received from ${authenticatedUserId}: messageIds=${messageIds}, senderId=${senderId}, receiverId=${receiverId}`);
        // Ensure the receiverId matches the authenticated user of the socket making this request
        if (authenticatedUserId !== receiverId) {
            logger.warn(`Unauthorized markAsSeen attempt by ${authenticatedUserId} for receiver ${receiverId}.`);
            throw new Error('Unauthorized action');
        }

        if (!messageIds || !senderId || !receiverId) {
          logger.warn(`Missing required fields in markAsSeen: messageIds=${messageIds}, senderId=${senderId}, receiverId=${receiverId}`);
          throw new Error('Missing required fields');
        }

        const messageObjectIds = messageIds.map(id => new mongoose.Types.ObjectId(id));

        // Update messages in DB to status 'seen' for the messages the receiver marked as seen
        const result = await Message.updateMany(
          {
            _id: { $in: messageObjectIds },
            receiverId: new mongoose.Types.ObjectId(receiverId), // Ensure receiverId matches current user
            senderId: new mongoose.Types.ObjectId(senderId), // Only mark messages from this specific sender as seen by this receiver
            status: { $ne: 'seen' } // Only update if not already seen
          },
          { $set: { status: 'seen', isRead: true } }
        );
        logger.info(`Marked ${result.modifiedCount} messages as seen for sender ${senderId} by receiver ${receiverId}`);

        if (result.modifiedCount > 0) {
            // Emit 'messagesSeen' to the original sender of these messages
            io.to(`user_${senderId}`).emit('messagesSeen', {
                messageIds: messageIds,
                seenBy: receiverId,
                seenAt: new Date(),
            });
            logger.info(`Emitted messagesSeen to user_${senderId} for message IDs: ${messageIds}`);

            // Update notification counts for sender (as their unread count might change)
            await NotificationService.triggerCountUpdate(senderId, io);
        }
        // Update counts for receiver too, for consistency if any local counts are tied to this.
        await NotificationService.triggerCountUpdate(receiverId, io);

        logger.info(`Mark as seen processed for sender ${senderId} and receiver ${receiverId}`);

      } catch (error) {
        logger.error(`Error updating message status for sender ${senderId} and receiver ${receiverId}: ${error.message}`, error.stack);
        socket.emit('markSeenError', { error: error.message });
      }
    });

    // --- Typing indicator ---
    socket.on('typing', (data) => {
        // Ensure data.senderId matches socket.user.id for security
        if (authenticatedUserId !== data.senderId) {
            logger.warn(`Unauthorized typing signal from ${authenticatedUserId} for sender ${data.senderId}`);
            return;
        }
        // Emit 'typing' to the receiver's specific user room, excluding the sender themselves
        io.to(`user_${data.receiverId}`).emit('typing', { senderId: data.senderId, receiverId: data.receiverId });
        logger.info(`Typing signal from ${data.senderId} to ${data.receiverId}`);
    });

    // --- Offer/Bargain Events ---

    socket.on('acceptOffer', async ({ offerId, acceptorId, productId, proposedPrice, productName, productImage }) => {
        try {
            logger.info(`acceptOffer event received from ${authenticatedUserId}: offerId=${offerId}, acceptorId=${acceptorId}`);
            // Ensure acceptorId matches authenticated user ID
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

            // Update original offer status
            await Message.findByIdAndUpdate(originalOffer._id, {
                'offerDetails.status': 'accepted',
                status: 'seen' // Mark the original offer as seen by the acceptor
            });
            logger.info(`Original offer ${offerId} updated to accepted status`);

            // Create system messages for both sides
            const sellerId = originalOffer.senderId;
            const chatRoomId = [acceptorId, sellerId.toString()].sort().join('_'); // Consistent chat room ID

            const acceptorUser = await User.findById(acceptorId);
            const sellerUser = await User.findById(sellerId);

            // Message for seller: "Your offer was accepted"
            const buyerAcceptMessageToSeller = new Message({
                senderId: acceptorId, // Buyer is the sender of this acceptance message
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

            // Message for buyer: "You accepted the offer" (for their own record)
            const sellerAcceptMessageToBuyer = new Message({
                senderId: sellerId, // Seller is conceptually the "sender" of the acceptance notification to the buyer
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
                metadata: { isSystemMessage: true, actionRequired: true } // Buyer needs to proceed to payment
            });
            const savedSellerAcceptMsg = await sellerAcceptMessageToBuyer.save();
            logger.info(`Created sellerAccept message to buyer ${acceptorId}: ${savedSellerAcceptMsg._id}`);

            // Emit to both participants' user rooms for real-time display
            io.to(`user_${sellerId}`).emit('newMessage', { ...savedBuyerAcceptMsg.toObject(), _id: savedBuyerAcceptMsg._id.toString(), status: 'delivered' });
            io.to(`user_${acceptorId}`).emit('newMessage', { ...savedSellerAcceptMsg.toObject(), _id: savedSellerAcceptMsg._id.toString(), status: 'delivered' });
            logger.info(`Emitted acceptOffer messages to chatRoomId ${chatRoomId}`);


            // Update post price if the offer is accepted
            await Post.findByIdAndUpdate(productId, { price: proposedPrice, status: 'sold' }); // Assuming 'status: sold' for accepted offers
            logger.info(`Post ${productId} updated price to ${proposedPrice} and status to sold.`);

            // FCM Notification to the seller
            await sendFCMNotification(
                sellerUser.fcmToken, // Use seller's FCM token
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
                acceptorUser?.profilePicture || null, // Use the actual acceptor's profile picture
                `offer_accepted_${productId.toString()}`
            );
            logger.info(`FCM notification sent for offer ${offerId} accepted by ${acceptorId}`);

            // Update notification counts for both participants
            await NotificationService.triggerCountUpdate(sellerId, io);
            await NotificationService.triggerCountUpdate(acceptorId, io);
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

            // Update original offer status
            await Message.findByIdAndUpdate(originalOffer._id, {
                'offerDetails.status': 'rejected',
                status: 'seen'
            });
            logger.info(`Original offer ${offerId} updated to rejected status`);

            const sellerId = originalOffer.senderId;
            const chatRoomId = [declinerId, sellerId.toString()].sort().join('_');
            const declinerUser = await User.findById(declinerId);
            const sellerUser = await User.findById(sellerId);


            // Message for seller: "Your offer was rejected"
            const declineMessageToSeller = new Message({
                senderId: declinerId, // Decliner is the sender of this rejection message
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

            // Message for buyer: "You rejected the offer"
            const declineMessageToBuyer = new Message({
                senderId: sellerId, // Seller is conceptually the sender to the buyer about the decline
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


            // Emit to both participants in the chat room for real-time display
            io.to(`user_${sellerId}`).emit('newMessage', { ...savedDeclineToSeller.toObject(), _id: savedDeclineToSeller._id.toString(), status: 'delivered' });
            io.to(`user_${declinerId}`).emit('newMessage', { ...savedDeclineToBuyer.toObject(), _id: savedDeclineToBuyer._id.toString(), status: 'delivered' });
            logger.info(`Emitted declineOffer messages to chatRoomId ${chatRoomId}`);


            // FCM Notification to the seller
            await sendFCMNotification(
                sellerUser.fcmToken,
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

            // Update notification counts for both participants
            await NotificationService.triggerCountUpdate(sellerId, io);
            await NotificationService.triggerCountUpdate(declinerId, io);
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

            let actualOtherParticipantId = otherParticipantId; // Assume client provides it if offerId is null
            const originalOffer = offerId ? await Message.findById(offerId) : null;

            if (originalOffer) {
                if (originalOffer.senderId.toString() !== enderId && originalOffer.receiverId.toString() !== enderId) {
                    logger.warn(`Unauthorized endBargain attempt for offer ${offerId} by ${enderId}`);
                    throw new Error('Not authorized to end this bargain');
                }
                actualOtherParticipantId = originalOffer.senderId.toString() === enderId ? originalOffer.receiverId.toString() : originalOffer.senderId.toString();

                // Update status of the last offer message if it exists
                await Message.findByIdAndUpdate(originalOffer._id, {
                    'offerDetails.status': 'ended',
                    status: 'seen' // Mark the last offer as seen by the ender
                });
                logger.info(`Original offer ${offerId} updated to ended status`);
            } else {
                 // If no specific offerId is provided, `otherParticipantId` must be sent by the client.
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

            // Message for other participant: "[User] ended the bargain"
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

            // Message for ender: "You ended the bargain" (for their own record)
            const endBargainMessageForEnder = new Message({
                senderId: actualOtherParticipantId, // Other participant is conceptually the sender to the ender
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
            const savedEndBargainForEnder = await endBargainMessageForEnder.save(); // Corrected variable name
            logger.info(`Created end-bargain message for ender ${enderId}: ${savedEndBargainForEnder._id}`);


            // Emit to both participants in the chat room for real-time display
            io.to(`user_${enderId}`).emit('newMessage', { ...savedEndBargainForEnder.toObject(), _id: savedEndBargainForEnder._id.toString(), status: 'delivered' });
            io.to(`user_${actualOtherParticipantId}`).emit('newMessage', { ...savedEndBargainMsg.toObject(), _id: savedEndBargainMsg._id.toString(), status: 'delivered' });
            logger.info(`Emitted endBargain messages to chatRoomId ${chatRoomId}`);


            // FCM Notification to the other participant
            await sendFCMNotification(
                otherParticipantUser.fcmToken,
                'Bargain Ended',
                `${enderUser?.firstName || 'A user'} ended the bargain for ${productName || 'Product'}.`,
                {
                    type: 'bargain-ended',
                    productId: productId.toString(),
                    chatRoomId: chatRoomId,
                    messageId: savedEndBargainMsg._id.toString(),
                },
                io,
                null, // No product image for this system message usually
                null, // No sender profile picture for system messages
                `bargain_ended_${productId.toString()}`
            );
            logger.info(`FCM notification sent for bargain ended on product ${productId} by ${enderId}`);

            // Update notification counts for both participants
            await NotificationService.triggerCountUpdate(enderId, io);
            await NotificationService.triggerCountUpdate(actualOtherParticipantId, io);
            logger.info(`Bargain for product ${productId} ended and processed by ${enderId}`);

        } catch (error) {
            logger.error(`Error ending bargain for offer ${offerId || 'N/A'} by ${authenticatedUserId}: ${error.message}`, error.stack);
            socket.emit('offerError', { error: error.message });
        }
    });

    // You might have other handlers like 'counterOffer', 'paymentComplete', etc.
    // Ensure they follow the same pattern:
    // 1. Validate incoming data and senderId (always from socket.user.id).
    // 2. Save message to DB.
    // 3. Emit 'newMessage' to relevant user rooms (`user_${id}`).
    // 4. Emit FCM notification if the recipient is not online/in chat.
    // 5. Trigger NotificationService.triggerCountUpdate for relevant users.

    // Keep your existing handlers (badge-update, followUser, likePost, commentPost)
    socket.on('badge-update', async ({ type, count, userId }) => { /* ... */ });
    socket.on('followUser', async ({ followerId, followedId }) => { /* ... */ });
    socket.on('likePost', async ({ postId, userId }) => { /* ... */ });
    socket.on('commentPost', async ({ postId, userId, comment }) => { /* ... */ });
  });

  return io;
};

module.exports = initializeSocket;
