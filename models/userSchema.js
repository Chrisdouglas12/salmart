
// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
firstName: { type: String, required: true },
lastName: { type: String, required: true },
email: { type: String, required: true, unique: true },
password: { type: String, required: true },
profilePicture: { type: String },

followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],  
following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],  
  
createdAt: { type: Date, default: Date.now },  
updatedAt: { type: Date },  
paystackRecipientCode: { type: String },

bankDetails: {
accountName: String,
accountNumber: String,
bankName: String,
bankCode: String
},
blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  reportCount: { type: Number, default: 0 },
  isReported: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  fcmToken: { type: String, default: null },
  viewCount: {
    type: Number,
    default: 0,
  },
  //store precomputed relevance scores for users
  userRelevanceScores: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: Number,
  }],
  notificationPreferences: {
    likes: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    follows: { type: Boolean, default: true },
    payments: { type: Boolean, default: true },
    delivery: { type: Boolean, default: true },
  },
  socketId: { type: String, default: null },
  notificationEnabled: Boolean,
 

});
userSchema.index({ socketId: 1 });

module.exports = mongoose.model('User', userSchema);


 
