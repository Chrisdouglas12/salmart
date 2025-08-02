const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    // The user who receives the notification
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true // Add an index for fast lookups
    }, 
    
    // The user who triggered the notification (optional for system notifications)
    senderId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: false // Made optional for system-generated notifications
    }, 
    
    // The post related to the notification (optional for non-post notifications)
    postId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Post', 
      required: false // Made optional for notifications like 'payment' or 'warning'
    },
    
    type: { 
      type: String, 
      enum: [
        'like', 'comment', 'reply', 'new_post', 'notify-followers',
        'payment', 'payment_released', 'payout_queued', 'payout_queued_balance_error',
        'delivery', 'refund_rejected', 'refund_processed', 
        'warning', 'message', 'deal', 'promotion'
      ], 
      required: true 
    },
    
    // A flexible field to store any additional, type-specific information
    // This replaces 'payment' and 'productName' and keeps the schema clean.
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // The message is now optional, as it can be generated on the frontend
    message: { 
      type: String, 
      required: false
    },
    
    isRead: { 
      type: Boolean, 
      default: false 
    },
    
    createdAt: { 
      type: Date, 
      default: Date.now,
      index: -1 // Index for sorting by newest first
    },
});

// A compound index to quickly fetch all unread notifications for a user
notificationSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
