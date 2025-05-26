const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/userSchema.js');
const Message = require('../models/messageSchema.js');
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
      ];

      const populatedMessages = await Promise.all(
        latestMessages.map(async (msg) => {
          const sender = await User.findById(msg.senderId);
          const receiver = await User.findById(msg.receiverId);

          const chatPartner = msg.senderId.toString() === userId ? receiver : sender;
          const isSystem = systemMessageTypes.includes(msg.messageType);

          let messageText = msg.text || '';
          if (isSystem && (!messageText || messageText.trim() === '')) {
            switch (msg.messageType) {
              case 'bargainStart':
                messageText = 'Bargain started';
                break;
              case 'end-bargain':
                messageText =
                  msg.bargainStatus === 'accepted'
                    ? 'Bargain ended - Accepted'
                    : msg.bargainStatus === 'declined'
                    ? 'Bargain ended - Declined'
                    : 'Bargain ended';
                break;
              case 'buyerAccept':
                messageText = 'Buyer accepted the offer';
                break;
              case 'sellerAccept':
                messageText = 'Seller accepted the offer';
                break;
              case 'sellerDecline':
                messageText = 'Seller declined the offer';
                break;
              case 'buyerDeclineResponse':
                messageText = 'Buyer declined the offer';
                break;
              case 'offer':
                messageText = 'New offer made';
                break;
              case 'counter-offer':
                messageText = 'Counter-offer made';
                break;
              default:
                messageText = 'System notification';
            }
          } else if (messageText.startsWith('{')) {
            try {
              const parsed = JSON.parse(messageText);
              messageText = parsed.text || parsed.content || parsed.message || 'No message';
            } catch (e) {
              messageText = messageText.substring(messageText.indexOf('}') + 1).trim() || 'No message';
            }
          }

          return {
            _id: msg._id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            chatPartnerId: chatPartner?._id || null,
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

  // Send a new message
  router.post('/send', verifyToken, async (req, res) => {
    try {
      const { receiverId, text, messageType = 'text', offerDetails, attachment } = req.body;
      const senderId = req.user.userId;

      if (!receiverId || !text) {
        logger.warn(`Missing receiverId or text for message from user ${senderId}`);
        return res.status(400).json({ error: 'Receiver ID and message text are required' });
      }

      if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        logger.warn(`Invalid receiverId ${receiverId} format`);
        return res.status(400).json({ error: 'Invalid receiverId format' });
      }

      const receiver = await User.findById(receiverId);
      if (!receiver) {
        logger.error(`Receiver ${receiverId} not found`);
        return res.status(404).json({ error: 'Receiver not found' });
      }

      const sender = await User.findById(senderId);
      if (!sender) {
        logger.error(`Sender ${senderId} not found`);
        return res.status(404).json({ error: 'Sender not found' });
      }

      const message = new Message({
        senderId,
        receiverId,
        text,
        messageType,
        offerDetails: offerDetails || null,
        attachment: attachment || null,
        status: 'sent',
        createdAt: new Date(),
      });
      await message.save();

      logger.info(`Message sent from ${senderId} to ${receiverId}: ${message._id}`);

      // Emit Socket.IO message events
      const messageData = {
        _id: message._id,
        senderId,
        receiverId,
        text,
        messageType,
        offerDetails: message.offerDetails,
        attachment: message.attachment,
        chatPartnerName: `${sender.firstName} ${sender.lastName}`,
        status: message.status,
        createdAt: message.createdAt,
      };

      io.to(`user_${receiverId}`).emit('receiveMessage', messageData);
      io.to(`user_${senderId}`).emit('newMessage', messageData);

      // Send FCM notification
      await sendFCMNotification(
        receiverId,
        'New Message',
        `${sender.firstName} ${sender.lastName} sent you a message`,
        { type: 'message', messageId: message._id.toString() },
        io
      );

      // Trigger badge update
      await NotificationService.triggerCountUpdate(io, receiverId);

      res.status(201).json({ message: 'Message sent successfully', data: message });
    } catch (error) {
      logger.error(`Error sending message from ${req.user.userId}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};