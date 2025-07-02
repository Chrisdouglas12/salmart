const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  viewed: { type: Boolean, default: false },
  amount: Number,
  status: { type: String, enum: ['pending', 'released'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  refundRequested: { type: Boolean, default: false },
  refundReason: { type: String },
  paymentReference: { type: String, required: true, unique: true },
  otpRequired: {
  type: Boolean,
  default: false,
},
transferReference: {
  type: String,
  default: null,
}
});

module.exports = mongoose.model('Transaction', transactionSchema);