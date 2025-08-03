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

 // Updated /api/messages endpoint with caching support
router.get('/api/messages', verifyToken, async (req, res) => {
  const { userId, since } = req.query;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    logger.warn(`Invalid or missing userId in /api/messages: ${userId}`);
    return res.status(400).json({ error: 'Invalid or missing user ID' });
  }

  const userIdObjectId = new mongoose.Types.ObjectId(userId);

  try {
    let matchCondition = {
      $or: [{ senderId: userIdObjectId }, { receiverId: userIdObjectId }],
    };

    // If 'since' parameter is provided, only fetch messages newer than that timestamp
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        matchCondition.createdAt = { $gt: sinceDate };
        logger.info(`Fetching messages since: ${since} for user ${userId}`);
      } else {
        logger.warn(`Invalid 'since' timestamp: ${since}`);
      }
    }

    let latestMessages;

    if (since) {
      // For background sync (since parameter), get ALL new messages, not just latest per conversation
      latestMessages = await Message.find(matchCondition)
        .sort({ createdAt: -1 })
        .limit(50); // Reasonable limit for background sync
    } else {
      // For initial load, get latest message per conversation (existing logic)
      latestMessages = await Message.aggregate([
        { $match: matchCondition },
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
    }

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
          isRead: msg.isRead || false, // Include isRead status
          isSystem,
          messageType: msg.messageType,
          createdAt: msg.createdAt.toISOString(),
          // Additional fields for better client-side rendering
          senderName: sender ? `${sender.firstName} ${sender.lastName}` : 'Unknown',
          senderProfilePicture: sender?.profilePicture || 'default.jpg',
          receiverName: receiver ? `${receiver.firstName} ${receiver.lastName}` : 'Unknown',
          receiverProfilePicture: receiver?.profilePicture || 'default.jpg',
          // Metadata for system messages
          metadata: {
            isSystemMessage: isSystem,
            bargainStatus: msg.bargainStatus,
            originalMessageType: msg.messageType
          }
        };
      })
    );

    // Sort by creation date (newest first)
    populatedMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const logMessage = since 
      ? `Background sync: Fetched ${populatedMessages.length} new messages for user ${userId}`
      : `Initial load: Fetched ${populatedMessages.length} latest messages for user ${userId}`;
    
    logger.info(logMessage);
    res.status(200).json(populatedMessages);
    
  } catch (error) {
    logger.error(`Error fetching messages for user ${userId}: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
  }
});

// Optional: Add a separate endpoint for marking messages as read
router.put('/api/messages/mark-as-read', verifyToken, async (req, res) => {
  const { messageIds, userId } = req.body;

  if (!messageIds || !Array.isArray(messageIds) || !userId) {
    return res.status(400).json({ error: 'messageIds array and userId are required' });
  }

  try {
    const result = await Message.updateMany(
      {
        _id: { $in: messageIds },
        receiverId: new mongoose.Types.ObjectId(userId), // Only mark as read if user is receiver
        isRead: false
      },
      { 
        $set: { 
          isRead: true,
          readAt: new Date()
        } 
      }
    );

    logger.info(`Marked ${result.modifiedCount} messages as read for user ${userId}`);
    res.status(200).json({ 
      success: true, 
      modifiedCount: result.modifiedCount 
    });
    
  } catch (error) {
    logger.error(`Error marking messages as read: ${error.message}`);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// Optional: Add endpoint to get unread message count
router.get('/api/messages/unread-count', verifyToken, async (req, res) => {
  const { userId } = req.query;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Valid userId is required' });
  }

  try {
    const unreadCount = await Message.countDocuments({
      receiverId: new mongoose.Types.ObjectId(userId),
      isRead: false
    });

    res.status(200).json({ unreadCount });
    
  } catch (error) {
    logger.error(`Error getting unread count for user ${userId}: ${error.message}`);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

  // Send a new message
  router.post('/send', verifyToken, async (req, res) => {
    let senderId; // Declared outside try-catch to ensure scope
    let receiverId; // Declared outside try-catch to ensure scope
    try {
      // Extract tempId from req.body
      const { receiverId: reqReceiverId, text, messageType = 'text', offerDetails, attachment, tempId } = req.body; // <-- ADDED tempId here, renamed receiverId to avoid conflict
      receiverId = reqReceiverId; // Assign to outer scope variable
      senderId = req.user.userId;

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
      // messageData for the sender needs the tempId to update the optimistic message
      const messageDataForSender = {
        _id: message._id,
        senderId,
        receiverId,
        text,
        messageType,
        offerDetails: message.offerDetails,
        attachment: message.attachment,
        chatPartnerName: `${receiver.firstName} ${receiver.lastName}`, // Partner for sender is receiver
        status: message.status,
        createdAt: message.createdAt,
        tempId: tempId, // <-- CRUCIAL: Pass the tempId back to the sender
      };

      // messageData for the receiver does NOT need the tempId
      const messageDataForReceiver = {
        _id: message._id,
        senderId,
        receiverId,
        text,
        messageType,
        offerDetails: message.offerDetails,
        attachment: message.attachment,
        chatPartnerName: `${sender.firstName} ${sender.lastName}`, // Partner for receiver is sender
        status: message.status,
        createdAt: message.createdAt,
      };

      // Emit to sender's socket
      logger.info(`Emitting newMessage to user ${senderId} (sender): ${JSON.stringify(messageDataForSender)}`);
      io.to(`user_${senderId}`).emit('newMessage', messageDataForSender);

      // Emit to receiver's socket
      logger.info(`Emitting newMessage to user ${receiverId} (receiver): ${JSON.stringify(messageDataForReceiver)}`);
      io.to(`user_${receiverId}`).emit('newMessage', messageDataForReceiver);

      // Send FCM notification
      logger.info(`Sending FCM notification to user ${receiverId} for message ${message._id}`);
      await sendFCMNotification(
        receiverId,
        'New Message',
        `${sender.firstName} ${sender.lastName} sent you a message`,
        { type: 'message', messageId: message._id.toString() },
        io
      );
      logger.info(`FCM notification sent to user ${receiverId}`);

      // Trigger badge update
      logger.info(`Triggering badge update for user ${receiverId}`);
      await NotificationService.triggerCountUpdate(io, receiverId);

      // Respond to the client (optional, as Socket.IO handles real-time update)
      res.status(201).json({ message: 'Message sent successfully', data: message });
    } catch (error) {
      logger.error(`Failed to send message from ${senderId || 'unknown'} to ${receiverId || 'unknown'}: ${error.message}`);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};
