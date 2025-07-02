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
  phoneNumber: {
  type: String,
  trim: true,
  default: '+2348012345678', // Replace with a default number you want
  validate: {
    validator: function (v) {
      // Accepts +2348012345678 or 08012345678
      return /^(\+234|0)[789][01]\d{8}$/.test(v);
    },
    message: props => `${props.value} is not a valid Nigerian phone number!`
  }
},

  // --- Start Paystack Integration Fields ---
  paystack: {
    customerId: { // Paystack's customer_code (e.g., 'CUS_xxxxxx') - for buyers
      type: String,
      unique: true,
      sparse: true // Allows multiple documents to have null for this field
    },
    dedicatedAccount: { // Details of the assigned DVA for buyers
      accountName: String,
      accountNumber: String,
      bankName: String,
      bankSlug: String, // e.g., 'providus-bank'
      id: String // Paystack's ID for this dedicated account (e.g., 'PAC_xxxxxx')
    },
    recipientCode: { // Paystack recipient code (e.g., 'RCP_xxxxxx') - for sellers to receive payouts
      type: String,
      unique: true,
      sparse: true
    }
  },
  bankDetails: { // Seller's bank details for creating the Paystack recipient
    accountName: String,
    accountNumber: String,
    bankName: String,
    bankCode: String // This is crucial for Paystack transfer recipients (e.g., '044' for Access Bank)
  },
  // --- End Paystack Integration Fields ---

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
