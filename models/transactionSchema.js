const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true }, 

  buyerEmail: { type: String },

  amount: { type: Number, required: true }, // in Naira

  paymentReference: { type: String, required: true, unique: true },
  paystackTransactionId: { type: String },

  status: {
    type: String,
    enum: [
      'awaiting_payment',
      'pending',
      'in_escrow',
      'transfer_initiated',
      'confirmed_pending_payout',
      'released',
      'refund_requested',
      'refunded',
      'transfer_failed',
      'reversed',
      'cancelled'
    ],
    default: 'awaiting_payment',
    required: true
  },

  processing: { type: Boolean, default: false },
  paymentChannel: { type: String }, // card, bank_transfer, etc.
  narrationKey: { type: String },
  currency: { type: String, default: 'NGN' },

  viewed: { type: Boolean, default: false },

  productMetadata: {
    productTitle: String,
    productDescription: String,
    productCategory: String,
    productImages: [String],
    productLocation: String,
    productCondition: String,
    createdAt: Date
  },

  // Payout-related fields
  platformCommission: { type: Number, default: 0 }, // ₦ taken by platform
  sellerAmount: { type: Number, default: 0 },       // ₦ to seller
  amountDue: { type: Number },                      // fallback if not set
  amountTransferred: { type: Number },              // confirmed payout amount
  transferReference: { type: String },
  transferStatus: { type: String },
  transferStatusMessage: { type: String },
  dateReleased: { type: Date },

  // Refund tracking
  refundReference: { type: String },
  refundStatus: { type: String }, // Paystack refund status (e.g., success, failed)
  refundedAt: { type: Date },

  // Receipt + file references
  receiptImageUrl: { type: String },

  // Delivery protection
  otpRequired: { type: Boolean, default: false },

  // Manual approval flag (for admins)
  approvedByAdmin: { type: Boolean, default: false },

}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);