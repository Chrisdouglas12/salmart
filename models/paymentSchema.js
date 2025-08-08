const mongoose = require('mongoose')

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
    trim: true,
    index: true, // no uniqueness at schema level
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