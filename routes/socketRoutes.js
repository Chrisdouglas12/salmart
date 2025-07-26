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
    // User's personal room for general notifications and updates across all their devices/tabs
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

        // Re-join the user's personal room, primarily for ensuring consistency
        // This is less about *joining* a new room and more about ensuring the socket
        // is in its expected personal room.
        if (!socket.rooms.has(`user_${userId}`)) {
             socket.join(`user_${userId}`);
             logger.info(`User ${userId} (socket ${socket.id}) explicitly joined to user_${userId} room.`);
        } else {
             logger.info(`User ${userId} (socket ${socket.id}) already in user_${userId} room.`);
        }

        // Update map if needed (e.g., if a new connection for the user replaces an old one)
        if (userSocketMap.get(userId) !== socket.id) {
             userSocketMap.set(userId, socket.id);
             // await User.findByIdAndUpdate(userId, { socketId: socket.id }, { new: true }); // Update DB if tracking active socketId
        }

        await NotificationService.sendCountsToUser(io, userId); // Re-send counts on explicit join
        logger.info(`Notification counts sent to user ${userId} after joinRoom event.`);
    });

    // Handle joinChatRoom for specific chat conversation
    socket.on('joinChatRoom', (chatRoomId) => {
      try {
        logger.info(`JoinChatRoom event received from ${authenticatedUserId} for chatRoomId: ${chatRoomId}`);
        // Basic validation: ensure the chatRoomId corresponds to a chat the authenticated user is part of.
        // Assuming chatRoomId is like "user1Id_user2Id"
        const [id1, id2] = chatRoomId.split('_').sort();
        if (authenticatedUserId !== id1 && authenticatedUserId !== id2) {
            logger.warn(`User ${authenticatedUserId} attempted to join unauthorized chatRoomId: ${chatRoomId}`);
            return; // Prevent unauthorized room joining
        }

        // Check if already in the room to prevent redundant joins
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
            // Attempt to parse text if it looks like JSON (e.g., for system messages with product info)
            if (text && text.startsWith('{') && text.endsWith('}')) {
                try {
                    const parsedMessage = JSON.parse(text);
                    if (parsedMessage.text) notificationText = parsedMessage.text;
                    if (parsedMessage.image) productImageUrl = parsedMessage.image;
                } catch (jsonParseError) {
                    logger.warn(`Text is not valid JSON despite starting with '{': ${text.substring(0, 50)}...`);
                    // Fallback to plain text if not valid JSON
                }
            } else if (attachment && attachment.url && attachment.fileType?.startsWith('image')) {
                productImageUrl = attachment.url;
            } else if (offerDetails && offerDetails.image) {
                productImageUrl = offerDetails.image;
            }

            // Append offer details to notification text if not already part of structured text
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

        // Create new Message document
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
  // viewOnce handling for images
  ...(messageType === 'image' && attachment && {
    viewOnce: {
      enabled: true,
      viewed: false,
      deleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from creation if not viewed
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

        // Construct the full message object to send back to clients
        // Ensure _id is a string for client-side use
        const messagePayload = {
            ...savedMessage.toObject(), // Convert Mongoose document to plain JS object
            _id: savedMessage._id.toString(), // Convert ObjectId to string
            tempId: tempId, // Pass back original tempId for client-side matching
            // Ensure status is 'delivered' for initial display for both sender/receiver
            status: 'delivered'
        };

        // --- Real-time communication using Socket.IO rooms ---
        // chatRoomId is used for the specific chat conversation room
        const chatRoomId = [senderId, receiverId].sort().join('_');

        // 1. Emit to Sender's current socket (for optimistic UI confirmation)
        //    This uses `socket.emit` to send only to the sender's *current* connected socket.
        //    It's for their immediate UI feedback (changing tempId to _id, showing delivered check).
        socket.emit('messageStatusUpdate', {
            _id: messagePayload._id,
            tempId: messagePayload.tempId,
            status: 'delivered', // Confirmation to sender
            createdAt: messagePayload.createdAt, // To update timestamp if needed
        });
        logger.info(`Emitted messageStatusUpdate to sender's socket ${socket.id} for tempId ${tempId}`);


        // 2. Broadcast the message to the specific chat room (`chat_chatRoomId`)
        //    This is the CRUCIAL part for immediate real-time display in the chat window
        //    for both the sender (if they are still on that chat screen) and the receiver.
        //    It will deliver to all sockets joined to this specific chat room.
        io.to(`chat_${chatRoomId}`).emit('newMessage', messagePayload);
        logger.info(`Broadcasted newMessage to chat room chat_${chatRoomId} for message ${savedMessage._id}`);


        // 3. Emit a general notification to the receiver's personal user room (`user_receiverId`)
        //    This is for notifications outside of the active chat view (e.g., badge counts, toast notifications).
        //    It also catches other devices the receiver might be logged into.
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

        // 4. Send FCM notification if receiver is truly offline or not actively in the chat with the sender.
        //    Check if any socket for the receiver is online (joined their user room)
        const receiverIsOnline = io.sockets.adapter.rooms.get(`user_${receiverId}`)?.size > 0;
        // Check if any socket for the receiver is currently in the specific chat room
        // This requires iterating over sockets in the chat room to see if any belong to receiver.
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


        if (!receiverIsOnline || !receiverIsInChatRoom) { // Send FCM if not actively engaged in chat
          logger.info(`Receiver ${receiverId} not actively online or in chat. FCM condition met.`);
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
            logger.info(`Receiver ${receiverId} is online and actively in chat room, skipping FCM.`);
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

        if (!messageIds || messageIds.length === 0 || !senderId || !receiverId) {
          logger.warn(`Missing required fields or empty messageIds in markAsSeen: messageIds=${messageIds}, senderId=${senderId}, receiverId=${receiverId}`);
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
          { $set: { status: 'seen', isRead: true, seenAt: new Date() } } // Set seenAt timestamp
        );
        logger.info(`Marked ${result.modifiedCount} messages as seen for sender ${senderId} by receiver ${receiverId}`);

        if (result.modifiedCount > 0) {
            // Emit 'messagesSeen' to the original sender's personal room
            // This updates the checkmarks on the sender's side.
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
            // --- FIX: Broadcast to chat_room for immediate display ---
            io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedBuyerAcceptMsg.toObject(), _id: savedBuyerAcceptMsg._id.toString(), status: 'delivered' });
            io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedSellerAcceptMsg.toObject(), _id: savedSellerAcceptMsg._id.toString(), status: 'delivered' });
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
            // --- FIX: Broadcast to chat_room for immediate display ---
            io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedDeclineToSeller.toObject(), _id: savedDeclineToSeller._id.toString(), status: 'delivered' });
            io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedDeclineToBuyer.toObject(), _id: savedDeclineToBuyer._id.toString(), status: 'delivered' });
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
            // --- FIX: Broadcast to chat_room for immediate display ---
            io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedEndBargainForEnder.toObject(), _id: savedEndBargainForEnder._id.toString(), status: 'delivered' });
            io.to(`chat_${chatRoomId}`).emit('newMessage', { ...savedEndBargainMsg.toObject(), _id: savedEndBargainMsg._id.toString(), status: 'delivered' });
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
    
    //once viewed photos
    socket.on('imageViewed', async ({ messageId, viewerId }) => {
  try {
    logger.info(`imageViewed event received: messageId=${messageId}, viewerId=${viewerId}`);
    
    if (authenticatedUserId !== viewerId) {
      logger.warn(`Unauthorized imageViewed attempt by ${authenticatedUserId} for viewer ${viewerId}`);
      return;
    }

    // Find the message and mark as viewed
    const message = await Message.findById(messageId);
    if (!message || message.messageType !== 'image' || !message.viewOnce) {
      logger.warn(`Invalid view-once image message: ${messageId}`);
      return;
    }

    // Mark as viewed and set deletion timer (24 hours from now)
    const viewedAt = new Date();
    const deleteAt = new Date(viewedAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    await Message.findByIdAndUpdate(messageId, {
      $set: {
        'viewOnce.viewed': true,
        'viewOnce.viewedAt': viewedAt,
        'viewOnce.deleteAt': deleteAt,
        'viewOnce.viewedBy': viewerId
      }
    });

    // Emit confirmation to all devices of both participants
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

    socket.on('badge-update', async ({ type, count, userId }) => { /* ... */ });
    socket.on('followUser', async ({ followerId, followedId }) => { /* ... */ });
    socket.on('likePost', async ({ postId, userId }) => { /* ... */ });
    socket.on('commentPost', async ({ postId, userId, comment }) => { /* ... */ });
  });

  return io;
};

module.exports = initializeSocket;
