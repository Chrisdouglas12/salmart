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

module.exports = mongoose.model('PayoutLog', payoutLogSchema

const numberOfLoginAttempts = 5
if(password && numberOfLoginAttempts < 5) {
  return res.status(400).json({message: 'Invalid password'})
}