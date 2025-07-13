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
    default: 0
  },
  transactions: [
    {
      amount: Number,
      reference: String,
      type: { type: String, enum: ['credit', 'debit'], default: 'credit' },
      purpose: String,
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      timestamp: { type: Date, default: Date.now }
    }
  ],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// ✅ Prevent OverwriteModelError
module.exports = mongoose.models.PlatformWallet || mongoose.model('PlatformWallet', platformWalletSchema);