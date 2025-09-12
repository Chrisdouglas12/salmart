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
});

// One-time migration to clean up existing tokens
const cleanupExistingTokens = async () => {
  try {
    const users = await User.find({ fcmTokens: { $exists: true, $ne: [] } });
    let updatedCount = 0;

    for (const user of users) {
      let hasChanges = false;
      const cleanTokens = new Map();

      user.fcmTokens.forEach((tokenObj) => {
        const token = typeof tokenObj === 'string' ? tokenObj : tokenObj.token;
      //  if (validateFCMToken(token)) {
        //  cleanTokens.set(token, {
      //      token,
      //      platform: tokenObj.platform || 'web',
     //       deviceType: tokenObj.deviceType || 'fcm',
    //        lastUpdated: new Date(),
    //        isActive: true,
     //     });
      //    hasChanges = true;
    //    }
   //   });

      if (hasChanges) {
        user.fcmTokens = Array.from(cleanTokens.values());
        await user.save();
        updatedCount++;
      }
    }

    console.log(`✨ Done. ${updatedCount} user(s) cleaned.`);
    mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
    mongoose.disconnect();
  }
};

// Assuming validateFCMToken is defined elsewhere
// If not, you'll need to implement this function to validate FCM tokens