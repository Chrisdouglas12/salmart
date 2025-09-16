const mongoose = require('mongoose');
const User = require('./models/userSchema.js'); // adjust path if needed
require('dotenv').config();

async function fixUnknownPlatformTokens() {
  try {
    console.log('🔍 Starting migration to fix ALL unknown platform tokens...');

    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('✅ Connected to MongoDB');
    }

    // Find users that have at least one token with unknown platform
    const usersWithUnknown = await User.find({
      'fcmTokens.platform': { $exists: true }
    });

    console.log(`📊 Scanning ${usersWithUnknown.length} users for bad platform tokens`);

    let updatedUsers = 0;
    let updatedTokens = 0;

    for (const user of usersWithUnknown) {
      let userModified = false;

      for (let tokenObj of user.fcmTokens) {
        if (
          tokenObj.platform &&
          typeof tokenObj.platform === 'string' &&
          tokenObj.platform.trim().toLowerCase() === 'unknown'
        ) {
          console.log(`🔄 User ${user._id}: Changing token platform "${tokenObj.platform}" → "web"`);
          tokenObj.platform = 'web';
          tokenObj.lastUpdated = new Date();
          userModified = true;
          updatedTokens++;
        }
      }

      if (userModified) {
        await user.save({ validateBeforeSave: false });
        updatedUsers++;
        console.log(`✅ Updated user ${user._id}`);
      }
    }

    console.log('🎉 Migration completed!');
    console.log(`📈 Updated ${updatedTokens} tokens across ${updatedUsers} users`);

    // Verify no "unknown" left
    const remaining = await User.countDocuments({
      'fcmTokens.platform': /^unknown$/i // matches unknown in any case
    });

    if (remaining === 0) {
      console.log('✅ All unknown platform tokens have been fixed!');
    } else {
      console.log(`⚠️ Warning: ${remaining} tokens still marked as unknown`);
    }

    return {
      usersUpdated: updatedUsers,
      tokensUpdated: updatedTokens,
      remainingIssues: remaining,
    };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run directly
if (require.main === module) {
  fixUnknownPlatformTokens()
    .then((result) => {
      console.log('Migration result:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

module.exports = { fixUnknownPlatformTokens };