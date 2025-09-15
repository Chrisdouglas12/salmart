const mongoose = require('mongoose');
const User = require('./models/userSchema.js'); // Adjust path if needed
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ MongoDB connected');
  cleanupExistingTokens();
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Validate FCM/Expo token format
const validateToken = (token) => {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  return cleanToken.length >= 10 && cleanToken.length <= 500;
};

// Normalize platform based on user agent or use safe default
const normalizePlatform = (platform, userAgent) => {
  const validPlatforms = ['web', 'ios', 'android'];
  
  if (platform && validPlatforms.includes(platform)) {
    return platform;
  }
  
  // Try to detect from user agent
  if (userAgent) {
    const ua = userAgent.toLowerCase();
    if (ua.includes('iphone') || ua.includes('ios') || ua.includes('safari')) {
      return 'ios';
    } else if (ua.includes('android') || ua.includes('chrome mobile')) {
      return 'android';
    }
  }
  
  return 'web'; // Safe default
};

// Detect device type from token format
const detectDeviceType = (token, currentDeviceType) => {
  const validDeviceTypes = ['fcm', 'expo'];
  
  if (currentDeviceType && validDeviceTypes.includes(currentDeviceType)) {
    return currentDeviceType;
  }
  
  // Auto-detect from token format
  if (token.startsWith('ExponentPushToken[') || token.startsWith('expo-')) {
    return 'expo';
  }
  
  return 'fcm';
};

// One-time migration to clean up existing tokens
const cleanupExistingTokens = async () => {
  try {
    console.log('🔍 Finding users with FCM tokens...');
    
    const users = await User.find({ 
      fcmTokens: { $exists: true, $ne: [] } 
    });
    
    console.log(`📊 Found ${users.length} users with tokens`);
    
    let updatedCount = 0;
    let totalTokensProcessed = 0;
    let invalidTokensRemoved = 0;

    for (const user of users) {
      let hasChanges = false;
      const cleanTokens = new Map();
      const originalTokenCount = user.fcmTokens.length;

      user.fcmTokens.forEach((tokenObj) => {
        totalTokensProcessed++;
        
        // Handle both string tokens and token objects
        const token = typeof tokenObj === 'string' ? tokenObj : tokenObj.token;
        
        if (!validateToken(token)) {
          invalidTokensRemoved++;
          hasChanges = true;
          return; // Skip invalid tokens
        }

        const cleanToken = token.trim();
        
        // Normalize platform - this is the key fix!
        const normalizedPlatform = normalizePlatform(
          tokenObj.platform, 
          tokenObj.userAgent
        );
        
        // Detect proper device type
        const deviceType = detectDeviceType(
          cleanToken, 
          tokenObj.deviceType
        );
        
        // Check if this token needs updates
        const needsUpdate = (
          !tokenObj.platform || 
          tokenObj.platform !== normalizedPlatform ||
          !tokenObj.deviceType ||
          tokenObj.deviceType !== deviceType
        );
        
        if (needsUpdate) {
          hasChanges = true;
        }

        // Store cleaned token (Map automatically deduplicates)
        cleanTokens.set(cleanToken, {
          token: cleanToken,
          platform: normalizedPlatform,
          deviceType: deviceType,
          deviceId: tokenObj.deviceId || null,
          userAgent: tokenObj.userAgent || null,
          lastUpdated: new Date(),
          isActive: tokenObj.isActive !== false
        });
      });

      // Update user if there were changes
      if (hasChanges) {
        const newTokens = Array.from(cleanTokens.values());
        
        console.log(`🔧 User ${user.email}: ${originalTokenCount} → ${newTokens.length} tokens`);
        
        // Update tokens directly to avoid triggering pre-save hook recursion
        await User.updateOne(
          { _id: user._id },
          { $set: { fcmTokens: newTokens } }
        );
        
        updatedCount++;
      }
    }

    console.log('\n📈 Cleanup Summary:');
    console.log(`✨ Users updated: ${updatedCount}`);
    console.log(`📱 Total tokens processed: ${totalTokensProcessed}`);
    console.log(`🗑️  Invalid tokens removed: ${invalidTokensRemoved}`);
    console.log('✅ Cleanup completed successfully');
    
    mongoose.disconnect();
    
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
    mongoose.disconnect();
    process.exit(1);
  }
};