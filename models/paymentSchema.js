const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
  },
  amount: {
    type: Number,
    min: [100, 'Amount must be at least 100 kobo'],
  },
  reference: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'manual'],
    default: 'pending',
  },
  promotedByAdmin: {
    type: Boolean,
    default: false,
  },
  durationDays: {
    type: Number,
    required: true,
    min: [1, 'Duration must be at least 1 day'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Payment', paymentSchema);