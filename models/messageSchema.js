const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: false }, // Optional for system messages or image-only messages
  status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  isRead: { type: Boolean, default: false },
  attachment: {
    url: { type: String, required: false }, // URL for images or other media
    type: { type: String, enum: ['image', 'file', 'receipt'], required: false } // Added type for clarity
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
  metadata: {
    isSystemMessage: { type: Boolean, default: false } // Explicitly mark system messages
  },
  createdAt: { type: Date, default: Date.now }
});

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
  next();
});

module.exports = mongoose.model('Message', messageSchema);