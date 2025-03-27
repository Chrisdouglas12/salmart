const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  reason: String,
  evidence: [String], // URLs of images/screenshots
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'refunded'], default: 'pending' },
  adminComment: String
}, { timestamps: true });

module.exports = mongoose.model('RefundRequest', refundSchema);