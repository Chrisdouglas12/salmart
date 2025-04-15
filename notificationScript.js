const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Post owner
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // User who liked/commented
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    type: { type: String, enum: ['like', 'comment', 'payment', 'delivery', 'warning', 'message', 'deal', 'reply'], required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    payment:{
      type: String,
    },
    productName: {
      type: String,
    },
    
});

module.exports = mongoose.model('Notification', notificationSchema);