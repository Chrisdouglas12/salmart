const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  reason: String,
  evidence: [String], // URLs of images/screenshots
  description: {type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'refunded', 'Refund Requested'], default: 'Refund Requested' },
  adminComment: String
}, { timestamps: true });

module.exports = mongoose.model('RefundRequests', refundSchema);