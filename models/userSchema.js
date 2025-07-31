// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Basic Info
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  profilePicture: { type: String },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function (v) {
        // Accepts +2348012345678 or 08012345678
        return /^(\+234|0)[789][01]\d{8}$/.test(v);
      },
      message: props => `${props.value} is not a valid Nigerian phone number!`
    }
  },
  //email verification
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },

  // Location fields
  state: {
    type: String,
    trim: true,
    required: true,
    maxlength: 50
  },
  city: {
    type: String,
    trim: true,
    required: true,
    maxlength: 50
  },

  // Social Graph
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // NEW FIELD: User interests (e.g., categories of products, hobbies, etc.)
  interests: [{ type: String, trim: true }], // Array of strings to store user interests

  // Activity & Admin
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  viewCount: { type: Number, default: 0 },
  reportCount: { type: Number, default: 0 },
  isReported: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isSystemUser: { type: Boolean, default: false },

  // Password Reset
  resetPasswordToken: { type: String, default: undefined },
  resetPasswordExpiry: { type: Date, default: undefined },

  // Notifications & Preferences
  notificationPreferences: {
    likes: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    follows: { type: Boolean, default: true },
    payments: { type: Boolean, default: true },
    delivery: { type: Boolean, default: true },
  },
  socketId: { type: String, default: null },
  notificationEnabled: { type: Boolean, default: true },

  // AI or Matching Systems
  userRelevanceScores: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: Number,
  }],

  // --- Paystack Integration ---
  paystack: {
    customerId: {
      type: String,
      unique: true,
      sparse: true
    },
    dedicatedAccount: {
      accountName: String,
      accountNumber: String,
      bankName: String,
      bankSlug: String,
      id: String
    },
    recipientCode: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  bankDetails: {
    accountName: String,
    accountNumber: String,
    bankName: String,
    bankCode: String
  }
});

// Indexes for performance and uniqueness
userSchema.index({ socketId: 1 });
userSchema.index({ interests: 1 }); // Consider if you'll query by interests often

module.exports = mongoose.model('User', userSchema);
