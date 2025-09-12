const mongoose = require('mongoose');

// Helper function to validate FCM tokens
const validateFCMToken = (token) => {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Basic length check
  if (token.length < 100) {
    return false;
  }
  
  // Exclude obvious non-FCM tokens
  const excludePatterns = [
    /^ExponentPushToken/,  // Expo tokens
    /^test_?token/i,       // Test tokens
    /^fake_?token/i,       // Fake tokens
    /^dummy/i,             // Dummy tokens
    /^\s*$/                // Empty/whitespace tokens
  ];
  
  return !excludePatterns.some(pattern => pattern.test(token));
};

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
    messages: { type: Boolean, default: true }, // Add this for consistency with your notification code
    deal: { type: Boolean, default: true },
    promotion: { type: Boolean, default: true },
  },

  // 🔧 IMPROVED: Better token storage with validation
  fcmTokens: [{
    token: { 
      type: String,
      required: true,
      validate: {
        validator: validateFCMToken,
        message: 'Invalid FCM token format'
      }
    }, 
    platform: { 
      type: String, 
      enum: ['web', 'ios', 'android'], 
      default: 'web' 
    },
    deviceType: { 
      type: String, 
      enum: ['fcm', 'expo'], 
      default: 'fcm' 
    },
    deviceId: { type: String }, // Optional device identifier
    userAgent: { type: String }, // Optional browser/app info
    lastUpdated: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
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

// 🔧 IMPROVED: Enhanced pre-save hook with better token deduplication
userSchema.pre('save', function (next) {
  const toObjectIdStr = id => id.toString();

  // Deduplicate arrays
  if (Array.isArray(this.following)) {
    this.following = [...new Set(this.following.map(toObjectIdStr))];
  }
  if (Array.isArray(this.followers)) {
    this.followers = [...new Set(this.followers.map(toObjectIdStr))];
  }
  if (Array.isArray(this.blockedUsers)) {
    this.blockedUsers = [...new Set(this.blockedUsers.map(toObjectIdStr))];
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

  // 🔧 IMPROVED: Better FCM token handling
  if (Array.isArray(this.fcmTokens)) {
    // Remove invalid tokens and deduplicate by token value
    const validTokens = new Map();
    
    this.fcmTokens.forEach(tokenObj => {
      if (tokenObj && tokenObj.token && validateFCMToken(tokenObj.token)) {
        // Use token as key to automatically deduplicate
        validTokens.set(tokenObj.token, {
          token: tokenObj.token,
          platform: tokenObj.platform || 'web',
          deviceType: tokenObj.deviceType || 'fcm',
          deviceId: tokenObj.deviceId,
          userAgent: tokenObj.userAgent,
          lastUpdated: new Date(),
          isActive: tokenObj.isActive !== false
        });
      }
    });
    
    this.fcmTokens = Array.from(validTokens.values());
    
    // Limit to reasonable number of tokens per user
    if (this.fcmTokens.length > 10) {
      // Keep only the most recently updated tokens
      this.fcmTokens.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
      this.fcmTokens = this.fcmTokens.slice(0, 10);
    }
  }

  next();
});

// 🔧 IMPROVED: Helper methods for token management
userSchema.methods.addFCMToken = function(tokenData) {
  if (typeof tokenData === 'string') {
    tokenData = { token: tokenData };
  }
  
  if (!validateFCMToken(tokenData.token)) {
    throw new Error('Invalid FCM token');
  }

  // Remove existing token if it exists
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== tokenData.token);
  
  // Add new token
  this.fcmTokens.push({
    token: tokenData.token,
    platform: tokenData.platform || 'web',
    deviceType: tokenData.deviceType || 'fcm',
    deviceId: tokenData.deviceId,
    userAgent: tokenData.userAgent,
    lastUpdated: new Date(),
    isActive: true
  });
  
  return this.save();
};

userSchema.methods.removeFCMToken = function(token) {
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
  return this.save();
};

userSchema.methods.getActiveFCMTokens = function() {
  return this.fcmTokens
    .filter(t => t.isActive && validateFCMToken(t.token))
    .map(t => t.token);
};

// Indexes for better performance
userSchema.index({ socketId: 1 });
userSchema.index({ interests: 1 });
userSchema.index({ 'fcmTokens.token': 1 });
userSchema.index({ 'fcmTokens.lastUpdated': 1 });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);