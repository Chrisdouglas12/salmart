const mongoose = require('mongoose');

const platformWalletSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['commission', 'promotion'],
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0 // Stored in kobo (₦1000 = 100000)
  },
  recipientCode: {
    type: String,
    default: null
  },
  transactions: [
    {
      amount: {
        type: Number,
        required: true // In kobo
      },
      reference: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['credit', 'debit'],
        default: 'credit'
      },
      purpose: {
        type: String,
        required: true
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        default: null // Optional: attach product post if it's commission
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }
  ],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.PlatformWallet || mongoose.model('PlatformWallet', platformWalletSchema);