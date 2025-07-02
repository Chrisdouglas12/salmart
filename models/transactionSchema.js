const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  viewed: { type: Boolean, default: false },
  amount: { type: Number, required: true }, // Added required: true, as amount is fundamental
  
  // --- Updated Status Enum ---
  status: { 
    type: String, 
    enum: [
      'awaiting_payment',   // New: Initial status for DVA payments
      'in_escrow',          // New: Payment received, funds are held
      'transfer_initiated', // New: Payout to seller has been started
      'completed',          // New: Funds successfully transferred to seller
      'refund_requested',   // New: Buyer requested refund (replaces refundRequested boolean)
      'refunded',           // New: Funds refunded to buyer
      'transfer_failed',    // New: Payout to seller failed
      'reversed',           // New: Paystack reversed a transfer (funds back to you)
      'cancelled'           // New: Transaction cancelled by user/system
      // Removed 'pending' and 'released' as they are replaced by more granular statuses
    ], 
    default: 'awaiting_payment', // Set default for new transactions via DVA
    required: true
  },
  
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date }, // New: To store the actual timestamp of payment success from webhook
  
  // --- Refund fields integrated into status and more direct tracking ---
  // refundRequested: { type: Boolean, default: false }, // No longer needed, use status: 'refund_requested'
  // refundReason: { type: String }, // Keep if you want to store a custom reason when status is 'refund_requested'

  paymentReference: { type: String, required: true, unique: true }, // This is the Paystack transaction reference
  
  // --- New DVA-specific fields ---
  dedicatedAccountDetails: { // Stores the DVA details used for this specific transaction
    accountName: String,
    accountNumber: String,
    bankName: String,
    bankSlug: String,
    customerCode: String
  },
  
  receiptImageUrl: { type: String }, // To store the URL of the generated receipt
  
  otpRequired: {
    type: Boolean,
    default: false,
  },
  transferReference: { // This is the Paystack transfer reference (for payouts to sellers)
    type: String,
    default: null,
  }
});

module.exports = mongoose.model('Transaction', transactionSchema);
