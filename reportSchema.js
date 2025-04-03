// Report Schema
const mongoose = require('mongoose')
const reportSchema = new mongoose.Schema({
  reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  resolution: { type: String, enum: ['warn', 'ban', 'dismiss'], default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});


  module.exports = mongoose.model('Report', reportSchema)