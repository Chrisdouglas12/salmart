
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  status: {type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent'},
  
  attachment: {
    type: String,
    url: String,
  },
  proposedPrice: Number,
  messageType: {
    type: 'String',
    default: 'text'
  },
  bargainStatus: {
    type: 'String',
    enum: ['pending', 'accpeted', 'declined'], default: null
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', messageSchema);
 