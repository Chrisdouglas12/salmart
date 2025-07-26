const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: false }, // Optional for system messages or image-only messages
  status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  isRead: { type: Boolean, default: false },
  attachment: {
    url: { type: String, required: false }, // URL for images or other media
    type: { type: String, enum: ['image', 'file', 'receipt'], required: false }, // Added type for clarity
    cloudinaryPublicId: { type: String, required: false } // Add this for Cloudinary cleanup
  },
  messageType: {
    type: String,
    enum: [
      'text',
      'image',
      'file',
      'bargainStart',
      'end-bargain',
      'buyerAccept',
      'sellerAccept',
      'sellerDecline',
      'buyerDeclineResponse',
      'offer',
      'sellerNotification',
      'counter-offer',
      'payment-completed' // Added for payment completion
    ],
    default: 'text'
  },
  offerDetails: {
    productId: { type: String, required: false },
    productName: { type: String, required: false },
    proposedPrice: { type: Number, required: false },
    originalPrice: { type: Number, required: false },
    image: { type: String, required: false },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'completed', null], default: null },
    isCounterOffer: { type: Boolean, default: false }
  },
  // viewOnce functionality
  viewOnce: {
  enabled: { type: Boolean, default: false },
  viewed: { type: Boolean, default: false },
  allowDownload: { type: Boolean, default: false },
  deleteAt: { type: Date },
  viewedAt: { type: Date, default: null },
  viewedBy: { type: String, default: null }
},
  metadata: {
    isSystemMessage: { type: Boolean, default: false }, // Explicitly mark system messages
    actionRequired: { type: Boolean, default: false } // For messages requiring user action
  },
  createdAt: { type: Date, default: Date.now }
});

// Add index for efficient cleanup queries
messageSchema.index({ 'viewOnce.deleteAt': 1 });
messageSchema.index({ 'viewOnce.enabled': 1, 'viewOnce.deleteAt': 1 });

// Validation: Ensure at least one of text, attachment.url, or offerDetails is provided for system messages
messageSchema.pre('validate', function (next) {
  const systemMessageTypes = [
    'bargainStart',
    'end-bargain',
    'buyerAccept',
    'sellerAccept',
    'sellerDecline',
    'buyerDeclineResponse',
    'payment-completed'
  ];
  
  if (systemMessageTypes.includes(this.messageType)) {
    this.metadata.isSystemMessage = true; // Mark as system message
    if (!this.offerDetails || !this.offerDetails.productId) {
      return next(new Error('System messages must include offerDetails with productId'));
    }
  } else if (!this.text && (!this.attachment || !this.attachment.url)) {
    return next(new Error('Non-system messages must have either text or an attachment URL'));
  }
  
  // ViewOnce validation: only for image messages
  if (this.viewOnce && this.viewOnce.enabled && this.messageType !== 'image') {
    return next(new Error('ViewOnce can only be enabled for image messages'));
  }
  
  // Auto-set deleteAt for viewOnce images if not provided
  if (this.viewOnce && this.viewOnce.enabled && !this.viewOnce.deleteAt) {
    this.viewOnce.deleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from creation
  }
  
  next();
});

// Pre-save middleware to handle viewOnce logic
messageSchema.pre('save', function (next) {
  // If this is a new viewOnce image, set the default deleteAt to 24 hours
  if (this.isNew && this.viewOnce && this.viewOnce.enabled && !this.viewOnce.deleteAt) {
    this.viewOnce.deleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  
  // DON'T automatically update deleteAt when viewed - let it stay for 5 minutes
  // The cleanup job will handle deletion based on the deleteAt time set when viewed
  
  next();
});

module.exports = mongoose.model('Message', messageSchema);