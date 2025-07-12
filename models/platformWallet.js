const mongoose = require('mongoose');

const platformWalletSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['commission'],
    default: 'commission',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PlatformWallet', platformWalletSchema);