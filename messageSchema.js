const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: false }, // Changed to optional for image messages
  status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  isRead: {
    type: Boolean,
    default: false,
  },
  attachment: {
    url: { type: String, required: false }, // URL for images or other media
  },
  proposedPrice: { type: Number, required: false },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'bargainStart', 'end-bargain', 'buyerAccept', 'sellerAccept', 'sellerDecline', 'buyerDeclineResponse', 'offer', 'counter-offer'],
    default: 'text',
},
  bargainStatus: {
    type: String,
    enum: ['pending', 'accepted', 'declined', null],
    default: null,
  },
  createdAt: { type: Date, default: Date.now },
});

// Add validation to ensure at least one of text or attachment.url is provided
messageSchema.pre('validate', function (next) {
  if (!this.text && (!this.attachment || !this.attachment.url)) {
    next(new Error('Message must have either text or an attachment URL'));
  }
  next();
});

module.exports = mongoose.model('Message', messageSchema);