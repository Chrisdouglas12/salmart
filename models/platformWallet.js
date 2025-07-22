// models/PlatformWallet.js
const mongoose = require('mongoose');

const transactionSubSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true // In kobo
  },
  reference: {
    type: String,
    required: true // Not indexed uniquely anymore
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
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false }); // Prevents auto _id for embedded subdocs

// ❌ DO NOT add unique index here anymore
// transactionSubSchema.index({ reference: 1 }, { unique: true });

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
  recipientCode: {
    type: String,
    default: null
  },
  transactions: [transactionSubSchema],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.PlatformWallet || mongoose.model('PlatformWallet', platformWalletSchema);