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
    messages: { type: Boolean, default: true },
    deal: { type: Boolean, default: true },
    promotion: { type: Boolean, default: true },
  },

  // 🔧 FIXED: Updated FCM tokens with proper validation and enum handling
  fcmTokens: [{
    token: { 
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function(v) {
          // Basic validation only - must be non-empty string with reasonable length
          return v && typeof v === 'string' && v.length >= 10 && v.length <= 500;
        },
        message: 'Token must be a valid string between 10-500 characters'
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
    deviceId: { type: String }, 
    userAgent: { type: String }, 
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

// 🔧 FIXED: Enhanced pre-save hook with proper platform validation
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

  // 🔧 FIXED: Enhanced token validation with platform normalization
  if (Array.isArray(this.fcmTokens)) {
    const validTokens = new Map();
    const validPlatforms = ['web', 'ios', 'android'];
    const validDeviceTypes = ['fcm', 'expo'];
    
    this.fcmTokens.forEach(tokenObj => {
      // Basic checks only - let schema validation handle format
      if (tokenObj && tokenObj.token && typeof tokenObj.token === 'string' && tokenObj.token.trim()) {
        const cleanToken = tokenObj.token.trim();
        
        // Normalize platform - fix invalid values
        let platform = tokenObj.platform;
        if (!platform || !validPlatforms.includes(platform)) {
          // Try to detect platform from user agent or token format
          if (tokenObj.userAgent) {
            const ua = tokenObj.userAgent.toLowerCase();
            if (ua.includes('iphone') || ua.includes('ios') || ua.includes('safari')) {
              platform = 'ios';
            } else if (ua.includes('android') || ua.includes('chrome mobile')) {
              platform = 'android';
            } else {
              platform = 'web';
            }
          } else {
            platform = 'web'; // Default fallback
          }
        }

        // Normalize device type
        let deviceType = tokenObj.deviceType;
        if (!deviceType || !validDeviceTypes.includes(deviceType)) {
          // Auto-detect device type from token format
          if (cleanToken.startsWith('ExponentPushToken[') || cleanToken.startsWith('expo-')) {
            deviceType = 'expo';
          } else {
            deviceType = 'fcm';
          }
        }
        
        // Use token as key to automatically deduplicate
        validTokens.set(cleanToken, {
          token: cleanToken,
          platform: platform,
          deviceType: deviceType,
          deviceId: tokenObj.deviceId || null,
          userAgent: tokenObj.userAgent || null,
          lastUpdated: new Date(),
          isActive: tokenObj.isActive !== false
        });
      }
    });
    
    this.fcmTokens = Array.from(validTokens.values());
    
    // Limit to reasonable number of tokens per user
    if (this.fcmTokens.length > 15) {
      // Keep only the most recently updated tokens
      this.fcmTokens.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
      this.fcmTokens = this.fcmTokens.slice(0, 15);
    }
  }

  next();
});

// 🔧 ENHANCED: Improved helper methods with better validation
userSchema.methods.addToken = function(tokenData) {
  if (typeof tokenData === 'string') {
    tokenData = { token: tokenData };
  }
  
  if (!tokenData.token || typeof tokenData.token !== 'string' || tokenData.token.trim().length < 10) {
    throw new Error('Invalid token format - token must be at least 10 characters');
  }

  const cleanToken = tokenData.token.trim();
  const validPlatforms = ['web', 'ios', 'android'];

  // Remove existing token if it exists
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== cleanToken);
  
  // Normalize platform
  let platform = tokenData.platform;
  if (!platform || !validPlatforms.includes(platform)) {
    // Try to detect from user agent
    if (tokenData.userAgent) {
      const ua = tokenData.userAgent.toLowerCase();
      if (ua.includes('iphone') || ua.includes('ios') || ua.includes('safari')) {
        platform = 'ios';
      } else if (ua.includes('android') || ua.includes('chrome mobile')) {
        platform = 'android';
      } else {
        platform = 'web';
      }
    } else {
      platform = 'web'; // Safe default
    }
  }

  // Detect device type if not provided
  let deviceType = tokenData.deviceType;
  if (!deviceType) {
    if (cleanToken.startsWith('ExponentPushToken[') || cleanToken.startsWith('expo-')) {
      deviceType = 'expo';
    } else {
      deviceType = 'fcm';
    }
  }
  
  // Add new token
  this.fcmTokens.push({
    token: cleanToken,
    platform: platform,
    deviceType: deviceType,
    deviceId: tokenData.deviceId || null,
    userAgent: tokenData.userAgent || null,
    lastUpdated: new Date(),
    isActive: true
  });
  
  return this.save();
};

userSchema.methods.removeToken = function(token) {
  if (typeof token === 'string') {
    token = token.trim();
  }
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
  return this.save();
};

userSchema.methods.getActiveTokens = function(deviceType = null) {
  let tokens = this.fcmTokens.filter(t => t.isActive && t.token);
  
  if (deviceType) {
    tokens = tokens.filter(t => t.deviceType === deviceType);
  }
  
  return tokens;
};

userSchema.methods.getActiveFCMTokens = function() {
  return this.getActiveTokens('fcm').map(t => t.token);
};

userSchema.methods.getActiveExpoTokens = function() {
  return this.getActiveTokens('expo').map(t => t.token);
};

// 🔧 ADDED: Method to clean up invalid tokens for existing users
userSchema.methods.cleanupTokens = function() {
  const validPlatforms = ['web', 'ios', 'android'];
  const validDeviceTypes = ['fcm', 'expo'];
  
  this.fcmTokens = this.fcmTokens.filter(tokenObj => {
    // Remove tokens with invalid basic structure
    if (!tokenObj || !tokenObj.token || typeof tokenObj.token !== 'string') {
      return false;
    }
    
    // Fix platform if invalid
    if (!validPlatforms.includes(tokenObj.platform)) {
      tokenObj.platform = 'web';
    }
    
    // Fix device type if invalid
    if (!validDeviceTypes.includes(tokenObj.deviceType)) {
      if (tokenObj.token.startsWith('ExponentPushToken[') || tokenObj.token.startsWith('expo-')) {
        tokenObj.deviceType = 'expo';
      } else {
        tokenObj.deviceType = 'fcm';
      }
    }
    
    return true;
  });
  
  return this.save();
};

// Indexes for better performance
userSchema.index({ socketId: 1 });
userSchema.index({ interests: 1 });
userSchema.index({ 'fcmTokens.token': 1 });
userSchema.index({ 'fcmTokens.lastUpdated': 1 });
userSchema.index({ 'fcmTokens.deviceType': 1 });
// Email index is automatically created by unique: true, so we don't need to add it here
userSchema.index({ firstName: 1, lastName: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);