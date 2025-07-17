// backend/routes/messageRoutes.js

const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/userSchema.js');
const Message = require('../models/messageSchema.js'); // Ensure Message model is imported
const Transaction = require('../models/transactionSchema.js');
const router = express.Router();
const verifyToken = require('../middleware/auths');
const winston = require('winston');
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/messageRoutes.log' }),
    new winston.transports.Console()
  ]
});

module.exports = (io) => {
  // Get messages between two users
  router.get('/messages', verifyToken, async (req, res) => {
    const senderId = req.query.user1;
    const receiverId = req.query.user2;

    if (!senderId || !receiverId) {
      logger.warn('Missing senderId or receiverId in /messages');
      return res.status(400).json({ error: 'Missing senderId or receiverId' });
    }

    // It's good practice to ensure the user requesting messages is one of the participants
    // For now, we trust verifyToken to ensure a valid user, but more granular check can be added.
    if (req.user.userId !== senderId && req.user.userId !== receiverId) {
        logger.warn(`Unauthorized access attempt to messages between ${senderId} and ${receiverId} by user ${req.user.userId}`);
        return res.status(403).json({ error: 'Unauthorized to view these messages' });
    }


    if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
      logger.warn(`Invalid senderId ${senderId} or receiverId ${receiverId} format`);
      return res.status(400).json({ error: 'Invalid senderId or receiverId format' });
    }

    try {
      const userId1 = new mongoose.Types.ObjectId(senderId);
      const userId2 = new mongoose.Types.ObjectId(receiverId);

      const messages = await Message.find({
        $or: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 },
        ],
      }).sort({ createdAt: 1 });
      logger.info(`Fetched ${messages.length} messages between ${senderId} and ${receiverId}`);
      res.json(messages);
    } catch (error) {
      logger.error(`Error fetching messages between ${senderId} and ${receiverId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get latest messages for a user
  router.get('/api/messages', verifyToken, async (req, res) => {
    const { userId } = req.query;

    // Ensure the userId in query matches the authenticated user
    if (req.user.userId !== userId) {
        logger.warn(`Unauthorized access attempt to /api/messages by user ${req.user.userId} for userId ${userId}`);
        return res.status(403).json({ error: 'Unauthorized access' });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid or missing userId in /api/messages: ${userId}`);
      return res.status(400).json({ error: 'Invalid or missing user ID' });
    }

    const userIdObjectId = new mongoose.Types.ObjectId(userId);

    try {
      const latestMessages = await Message.aggregate([
        {
          $match: {
            $or: [{ senderId: userIdObjectId }, { receiverId: userIdObjectId }],
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: {
              $cond: [
                { $lt: ['$senderId', '$receiverId'] },
                { senderId: '$senderId', receiverId: '$receiverId' },
                { senderId: '$receiverId', receiverId: '$senderId' },
              ],
            },
            latestMessage: { $first: '$$ROOT' },
          },
        },
        { $replaceRoot: { newRoot: '$latestMessage' } },
      ]);

      const systemMessageTypes = [
        'bargainStart',
        'end-bargain',
        'buyerAccept',
        'sellerAccept',
        'sellerDecline',
        'buyerDeclineResponse',
        'offer',
        'counter-offer',
        'accept-offer', // Added for consistency if 'accept-offer' is a system-like message
        'reject-offer', // Added
        'payment-completed' // Added
      ];

      const populatedMessages = await Promise.all(
        latestMessages.map(async (msg) => {
          const sender = await User.findById(msg.senderId);
          const receiver = await User.findById(msg.receiverId);

          const chatPartner = msg.senderId.toString() === userId ? receiver : sender;
          const isSystem = systemMessageTypes.includes(msg.messageType);

          let messageText = msg.text || '';
          // Improved system message text generation
          if (isSystem) {
            // Attempt to parse text if it's JSON, which might contain details
            let parsedTextContent = {};
            if (typeof messageText === 'string' && messageText.startsWith('{')) {
                try {
                    parsedTextContent = JSON.parse(messageText);
                } catch (e) {
                    logger.warn(`Failed to parse JSON for system message text: ${messageText}`);
                }
            }

            switch (msg.messageType) {
              case 'bargainStart':
                messageText = 'Bargain started';
                break;
              case 'end-bargain':
                messageText = msg.offerDetails?.status === 'accepted' ? 'Bargain ended (Accepted)' : 'Bargain ended';
                if (msg.offerDetails?.productName) {
                    messageText += ` for ${msg.offerDetails.productName}`;
                }
                break;
              case 'buyerAccept':
                messageText = `Offer for ${msg.offerDetails?.productName || 'product'} accepted by buyer`;
                break;
              case 'sellerAccept':
                messageText = `Offer for ${msg.offerDetails?.productName || 'product'} accepted by seller`;
                break;
              case 'sellerDecline':
                messageText = `Offer for ${msg.offerDetails?.productName || 'product'} declined by seller`;
                break;
              case 'buyerDeclineResponse':
                messageText = `Offer for ${msg.offerDetails?.productName || 'product'} declined by buyer`;
                break;
              case 'offer':
                messageText = `New offer for ${msg.offerDetails?.productName || 'product'} at ₦${(msg.offerDetails?.proposedPrice || 0).toLocaleString('en-NG')}`;
                break;
              case 'counter-offer':
                messageText = `Counter-offer for ${msg.offerDetails?.productName || 'product'} at ₦${(msg.offerDetails?.proposedPrice || 0).toLocaleString('en-NG')}`;
                break;
              case 'accept-offer':
                messageText = `Offer for ${msg.offerDetails?.productName || 'product'} accepted. Price: ₦${(msg.offerDetails?.proposedPrice || 0).toLocaleString('en-NG')}`;
                break;
              case 'reject-offer':
                messageText = `Offer for ${msg.offerDetails?.productName || 'product'} rejected.`;
                break;
              case 'payment-completed':
                messageText = `Payment completed for ${msg.offerDetails?.productName || 'product'}.`;
                break;
              default:
                messageText = parsedTextContent.text || parsedTextContent.message || msg.text || 'System notification';
            }
          } else if (messageText.startsWith('{')) {
            try {
              const parsed = JSON.parse(messageText);
              messageText = parsed.text || parsed.content || parsed.message || 'No message';
            } catch (e) {
              // If it's not a system message and JSON parsing fails, treat it as plain text
              messageText = messageText || 'No message';
            }
          }

          // Ensure object IDs are stringified
          return {
            _id: msg._id.toString(),
            senderId: msg.senderId.toString(),
            receiverId: msg.receiverId.toString(),
            chatPartnerId: chatPartner?._id?.toString() || null,
            chatPartnerName: chatPartner
              ? `${chatPartner.firstName} ${chatPartner.lastName}`
              : isSystem
              ? 'System'
              : 'Unknown',
            chatPartnerProfilePicture: chatPartner?.profilePicture || 'default.jpg',
            text: messageText,
            status: msg.status,
            isSystem,
            messageType: msg.messageType,
            offerDetails: msg.offerDetails || null, // Include offerDetails
            attachment: msg.attachment || null,     // Include attachment
            createdAt: msg.createdAt.toISOString(),
          };
        })
      );

      logger.info(`Fetched ${populatedMessages.length} latest messages for user ${userId}`);
      res.status(200).json(populatedMessages);
    } catch (error) {
      logger.error(`Error fetching messages for user ${userId}: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
    }
  });



  return router;
};

