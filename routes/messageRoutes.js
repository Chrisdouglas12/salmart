const express = require('express')
const mongoose = require('mongoose')
const User = require('../models/userSchema.js')
const Message = require('../models/messageSchema.js')
const Transaction = require('../models/transactionSchema.js')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Post = require('../models/postSchema.js')
const Review = require('../models/reviewSchema.js')
const verifyToken = require('../middleware/auths')


module.exports = (io) => {
     
router.get('/messages', verifyToken, async (req, res) => {
  const senderId = req.query.user1; // Get senderId from query parameter
  const receiverId = req.query.user2; // Get receiverId from query parameter

  if (!senderId || !receiverId) {
    return res.status(400).json({ error: 'Missing senderId or receiverId' });
  }

  // Check if IDs are valid MongoDB ObjectIds
  if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
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
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


//get messages
router.get("/api/messages", verifyToken, async (req, res) => {
  const { userId } = req.query;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "Invalid or missing user ID" });
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
              { $lt: ["$senderId", "$receiverId"] },
              { senderId: "$senderId", receiverId: "$receiverId" },
              { senderId: "$receiverId", receiverId: "$senderId" },
            ],
          },
          latestMessage: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latestMessage" } },
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

        const chatPartner =
          msg.senderId.toString() === userId ? receiver : sender;

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
          // Parse JSON-formatted text to extract the actual message
          try {
            const parsed = JSON.parse(messageText);
            messageText = parsed.text || parsed.content || parsed.productId || 'No message';
          } catch (e) {
            // If parsing fails, use the raw text
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

    res.status(200).json(populatedMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages", details: error.message });
  }
})

// Export router as a function that accepts io

  return router;
};