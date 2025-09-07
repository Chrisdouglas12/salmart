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
    required: false,
    trim: true,
    validate: {
      validator: function (v) {
        return /^(\+234|0)[789][01]\d{8}$/.test(v);
      },
      message: props => `${props.value} is not a valid Nigerian phone number!`
    }
  },

  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },

  state: { type: String, trim: true, required: false, maxlength: 50 },
  city: { type: String, trim: true, required: false, maxlength: 50 },

  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  interests: [{ type: String, trim: true }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  viewCount: { type: Number, default: 0 },
  reportCount: { type: Number, default: 0 },
  isReported: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isSystemUser: { type: Boolean, default: false },
  verificationReminderSent: { type: Boolean, default: false },
verificationReminderCount: { type: Number, default: 0 },
lastVerificationReminderSent: { type: Date },

  resetPasswordToken: { type: String, default: undefined },
  resetPasswordExpiry: { type: Date, default: undefined },

  notificationPreferences: {
    likes: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    reply: { type: Boolean, default: true },
    new_post: { type: Boolean, default: true },
    'notify-followers': { type: Boolean, default: true },
    payment: { type: Boolean, default: true },
    payment_released: { type: Boolean, default: true },
    payout_queued: { type: Boolean, default: true },
    payout_queued_balance_error: { type: Boolean, default: true },
    delivery: { type: Boolean, default: true },
    refund_rejected: { type: Boolean, default: true },
    refund_processed: { type: Boolean, default: true },
    warning: { type: Boolean, default: true },
    message: { type: Boolean, default: true },
    deal: { type: Boolean, default: true },
    promotion: { type: Boolean, default: true },
  },

  fcmTokens: [{
  token: { type: String, required: true },
  platform: { type: String, enum: ['web', 'ios', 'android'], default: 'web' },
  deviceType: { type: String, enum: ['fcm', 'expo'], default: 'fcm' },
  lastUpdated: { type: Date, default: Date.now }
}],
  socketId: { type: String, default: null },
  notificationEnabled: { type: Boolean, default: true },

  userRelevanceScores: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: Number,
  }],

  paystack: {
    customerId: { type: String, unique: true, sparse: true },
    dedicatedAccount: {
      accountName: String,
      accountNumber: String,
      bankName: String,
      bankSlug: String,
      id: String
    },
    recipientCode: { type: String, unique: true, sparse: true }
  },

  bankDetails: {
    accountName: String,
    accountNumber: String,
    bankName: String,
    bankCode: String
  }
});

// 🧼 Pre-save hook to deduplicate all relevant arrays
userSchema.pre('save', function (next) {
  const toObjectIdStr = id => id.toString();

  if (Array.isArray(this.following)) {
    this.following = [...new Set(this.following.map(toObjectIdStr))];
  }
  if (Array.isArray(this.followers)) {
    this.followers = [...new Set(this.followers.map(toObjectIdStr))];
  }
  if (Array.isArray(this.blockedUsers)) {
    this.blockedUsers = [...new Set(this.blockedUsers.map(toObjectIdStr))];
  }
  if (Array.isArray(this.fcmTokens)) {
    this.fcmTokens = [...new Set(this.fcmTokens)];
  }
  if (Array.isArray(this.interests)) {
    this.interests = [...new Set(this.interests.map(i => i.trim().toLowerCase()))];
  }
  if (Array.isArray(this.userRelevanceScores)) {
    const uniqueMap = new Map();
    this.userRelevanceScores.forEach(score => {
      const key = score.userId.toString();
      if (!uniqueMap.has(key)) uniqueMap.set(key, score);
    });
    this.userRelevanceScores = Array.from(uniqueMap.values());
  }

  next();
});

// Helpful indexes
userSchema.index({ socketId: 1 });
userSchema.index({ interests: 1 });

module.exports = mongoose.models.user || mongoose.model('User', userSchema);