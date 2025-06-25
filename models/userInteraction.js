// models/UserInteraction.js
const mongoose = require('mongoose');

const userInteractionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  category: { type: String },
  action: { type: String, enum: ['like', 'comment', 'view', 'purchase'] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('UserInteraction', userInteractionSchema);