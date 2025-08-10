// models/PayoutLog.js
const mongoose = require('mongoose');

const payoutLogSchema = new mongoose.Schema({
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  reason: { type: String },
  response: { type: Object },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PayoutLog', payoutLogSchema)
