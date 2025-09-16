const mongoose = require('mongoose');

// Define valid enum values as constants for reuse
const VALID_PLATFORMS = ['web', 'ios', 'android'];
const VALID_DEVICE_TYPES = ['fcm', 'expo'];

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

  // 🔧 ENHANCED: FCM tokens with better validation and platform detection
  fcmTokens: [{
    token: { 
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function(v) {
          // Basic validation - must be non-empty string with reasonable length
          return v && typeof v === 'string' && v.length >= 10 && v.length <= 500;
        },
        message: 'Token must be a valid string between 10-500 characters'
      }
    }, 
    platform: { 
      type: String, 
      enum: {
        values: VALID_PLATFORMS,
        message: 'Platform must be one of: web, ios, android'
      },
      default: 'web',
      // 🔧 NEW: Custom setter to handle unknown values gracefully
      set: function(value) {
        // If the value is not valid, try to normalize it
        if (!value || !VALID_PLATFORMS.includes(value.toLowerCase())) {
          // Try to detect from the token or default to web
          const token = this.token;
          if (token && typeof token === 'string') {
            if (token.startsWith('ExponentPushToken[')) {
              return 'android'; // Expo tokens are typically mobile
            }
          }
          return 'web'; // Safe default
        }
        return value.toLowerCase();
      }
    },
    deviceType: { 
      type: String, 
      enum: {
        values: VALID_DEVICE_TYPES,
        message: 'Device type must be one of: fcm, expo'
      },
      default: 'fcm',
      // 🔧 NEW: Custom setter to auto-detect device type
      set: function(value) {
        // Auto-detect if not provided or invalid
        if (!value || !VALID_DEVICE_TYPES.includes(value)) {
          const token = this.token;
          if (token && typeof token === 'string') {
            if (token.startsWith('ExponentPushToken[') || token.startsWith('expo-')) {
              return 'expo';
            }
          }
          return 'fcm'; // Default
        }
        return value;
      }
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

// 🔧 ENHANCED: Pre-save hook with comprehensive platform normalization
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

  // 🔧 ENHANCED: Token validation with platform normalization and cleanup
  if (Array.isArray(this.fcmTokens)) {
    const validTokens = new Map();
    
    this.fcmTokens.forEach(tokenObj => {
      // Skip invalid token objects
      if (!tokenObj || !tokenObj.token || typeof tokenObj.token !== 'string') {
        return;
      }

      const cleanToken = tokenObj.token.trim();
      
      // Skip empty or very short tokens
      if (cleanToken.length < 10) {
        return;
      }

      // 🔧 NEW: Comprehensive platform detection and normalization
      let platform = tokenObj.platform;
      
      // Handle unknown or invalid platforms
      if (!platform || !VALID_PLATFORMS.includes(platform)) {
        // Try to detect from user agent first
        if (tokenObj.userAgent) {
          const ua = tokenObj.userAgent.toLowerCase();
          if (ua.includes('iphone') || ua.includes('ios') || ua.includes('safari')) {
            platform = 'ios';
          } else if (ua.includes('android') || ua.includes('chrome mobile')) {
            platform = 'android';
          } else if (ua.includes('chrome') || ua.includes('firefox') || ua.includes('edge')) {
            platform = 'web';
          } else {
            platform = 'web'; // Default for unknown user agents
          }
        } else {
          // Try to detect from token format
          if (cleanToken.startsWith('ExponentPushToken[')) {
            platform = 'android'; // Expo tokens are typically mobile
          } else {
            platform = 'web'; // Safe default
          }
        }
      }

      // 🔧 NEW: Auto-detect device type
      let deviceType = tokenObj.deviceType;
      if (!deviceType || !VALID_DEVICE_TYPES.includes(deviceType)) {
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

// 🔧 ENHANCED: Helper methods with better validation and platform handling
userSchema.methods.addToken = function(tokenData) {
  if (typeof tokenData === 'string') {
    tokenData = { token: tokenData };
  }
  
  if (!tokenData.token || typeof tokenData.token !== 'string' || tokenData.token.trim().length < 10) {
    throw new Error('Invalid token format - token must be at least 10 characters');
  }

  const cleanToken = tokenData.token.trim();

  // Remove existing token if it exists
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== cleanToken);
  
  // 🔧 ENHANCED: Smart platform detection
  let platform = tokenData.platform;
  if (!platform || !VALID_PLATFORMS.includes(platform)) {
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
      // Try to detect from token format
      if (cleanToken.startsWith('ExponentPushToken[')) {
        platform = 'android'; // Expo tokens are typically mobile
      } else {
        platform = 'web'; // Safe default
      }
    }
  }

  // Auto-detect device type if not provided
  let deviceType = tokenData.deviceType;
  if (!deviceType || !VALID_DEVICE_TYPES.includes(deviceType)) {
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

userSchema.methods.getActiveTokens = function(deviceType = null, platform = null) {
  let tokens = this.fcmTokens.filter(t => t.isActive && t.token);
  
  if (deviceType) {
    tokens = tokens.filter(t => t.deviceType === deviceType);
  }
  
  if (platform) {
    tokens = tokens.filter(t => t.platform === platform);
  }
  
  return tokens;
};

userSchema.methods.getActiveFCMTokens = function(platform = null) {
  return this.getActiveTokens('fcm', platform).map(t => t.token);
};

userSchema.methods.getActiveExpoTokens = function(platform = null) {
  return this.getActiveTokens('expo', platform).map(t => t.token);
};

// 🔧 NEW: Method to fix existing tokens with unknown platforms
userSchema.methods.fixUnknownPlatforms = function() {
  let fixed = false;
  
  this.fcmTokens.forEach(tokenObj => {
    if (!VALID_PLATFORMS.includes(tokenObj.platform)) {
      const oldPlatform = tokenObj.platform;
      
      // Try to detect from user agent
      if (tokenObj.userAgent) {
        const ua = tokenObj.userAgent.toLowerCase();
        if (ua.includes('iphone') || ua.includes('ios') || ua.includes('safari')) {
          tokenObj.platform = 'ios';
        } else if (ua.includes('android') || ua.includes('chrome mobile')) {
          tokenObj.platform = 'android';
        } else {
          tokenObj.platform = 'web';
        }
      } else {
        // Try to detect from token format
        if (tokenObj.token && tokenObj.token.startsWith('ExponentPushToken[')) {
          tokenObj.platform = 'android';
        } else {
          tokenObj.platform = 'web';
        }
      }
      
      tokenObj.lastUpdated = new Date();
      fixed = true;
      
      console.log(`Fixed platform from "${oldPlatform}" to "${tokenObj.platform}" for user ${this._id}`);
    }
  });
  
  return fixed ? this.save() : Promise.resolve(this);
};

// 🔧 ENHANCED: Comprehensive token cleanup method
userSchema.methods.cleanupTokens = function() {
  const originalCount = this.fcmTokens.length;
  
  this.fcmTokens = this.fcmTokens.filter(tokenObj => {
    // Remove tokens with invalid basic structure
    if (!tokenObj || !tokenObj.token || typeof tokenObj.token !== 'string') {
      return false;
    }
    
    // Remove very short tokens
    if (tokenObj.token.trim().length < 10) {
      return false;
    }
    
    // Fix platform if invalid
    if (!VALID_PLATFORMS.includes(tokenObj.platform)) {
      // Try to detect and fix
      if (tokenObj.userAgent) {
        const ua = tokenObj.userAgent.toLowerCase();
        if (ua.includes('iphone') || ua.includes('ios') || ua.includes('safari')) {
          tokenObj.platform = 'ios';
        } else if (ua.includes('android') || ua.includes('chrome mobile')) {
          tokenObj.platform = 'android';
        } else {
          tokenObj.platform = 'web';
        }
      } else {
        tokenObj.platform = 'web';
      }
    }
    
    // Fix device type if invalid
    if (!VALID_DEVICE_TYPES.includes(tokenObj.deviceType)) {
      if (tokenObj.token.startsWith('ExponentPushToken[') || tokenObj.token.startsWith('expo-')) {
        tokenObj.deviceType = 'expo';
      } else {
        tokenObj.deviceType = 'fcm';
      }
    }
    
    return true;
  });
  
  const cleanedCount = originalCount - this.fcmTokens.length;
  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} invalid tokens for user ${this._id}`);
  }
  
  return this.save();
};

// Indexes for better performance
userSchema.index({ socketId: 1 });
userSchema.index({ interests: 1 });
userSchema.index({ 'fcmTokens.token': 1 });
userSchema.index({ 'fcmTokens.lastUpdated': 1 });
userSchema.index({ 'fcmTokens.deviceType': 1 });
userSchema.index({ 'fcmTokens.platform': 1 });
userSchema.index({ firstName: 1, lastName: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);