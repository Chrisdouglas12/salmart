const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // IMPORTANT: Changed from productId to postId to match the schema definition
  // and the variable name used in the route to fetch the Post.
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true }, 
  buyerEmail: { type: String }, // useful for webhook fallback matching

  amount: { type: Number, required: true }, // in Naira (not kobo)

  // Paystack transaction reference generated during `/pay`
  paymentReference: { type: String, required: true, unique: true },

  // Status flow
  status: {
    type: String,
    enum: [
      'awaiting_payment',
      'pending',           // Added 'pending' as it's used in your /payment-success route
      'in_escrow',           // paid and held
      'transfer_initiated',  // payout started
      'confirmed_pending_payout',
      
      'completed',           // payout successful
      'refund_requested',
      'refunded',
      'transfer_failed',
      'reversed',
      'cancelled'
    ],
    default: 'awaiting_payment',
    required: true
  },

  paymentChannel: { type: String }, // card, bank_transfer, ussd, etc. (from webhook)
  narrationKey: { type: String }, // optional, for bank transfers
  currency: { type: String, default: 'NGN' },

  viewed: { type: Boolean, default: false }, // used for UI status indicators
  productMetadata: {
    productTitle: String,
    productDescription: String,
    productCategory: String,
    productImages: [String],
    productLocation: String,
    productCondition: String,
    createdAt: Date
  },
  // Added Paystack's internal transaction ID
  paystackTransactionId: { type: String }, 
  paymentMethod: { type: String, default: 'pt_account_transfer' },
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
  dateReleased: { type: Date },

  // Commission and payout
  platformCommission: { type: Number, default: 0 },
  sellerAmount: { type: Number, default: 0 },
  transferReference: { type: String, default: null },
  transferStatusMessage: { type: String },

  // Optional: Digital receipt
  receiptImageUrl: { type: String },

  // If you ever want to OTP-guard delivery confirmation
  otpRequired: { type: Boolean, default: false },

}, { timestamps: true }); // adds updatedAt automatically

module.exports = mongoose.model('Transaction', transactionSchema);
