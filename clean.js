const mongoose = require('mongoose');
const User = require('./models/userSchema.js'); // Adjust path if needed
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
}).then(() => {
  console.log('✅ MongoDB connected');
  cleanUsers();
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

async function cleanUsers() {
  try {
    const users = await User.find({});
    console.log(`🔍 Found ${users.length} users`);

    let updatedCount = 0;

    for (const user of users) {
      let modified = false;
      const toObjectIdStr = id => id.toString();

      // Followers
      if (Array.isArray(user.followers)) {
        const unique = [...new Set(user.followers.map(toObjectIdStr))];
        if (unique.length !== user.followers.length) {
          user.followers = unique;
          modified = true;
        }
      }

      // Following
      if (Array.isArray(user.following)) {
        const unique = [...new Set(user.following.map(toObjectIdStr))];
        if (unique.length !== user.following.length) {
          user.following = unique;
          modified = true;
        }
      }

      // Blocked Users
      if (Array.isArray(user.blockedUsers)) {
        const unique = [...new Set(user.blockedUsers.map(toObjectIdStr))];
        if (unique.length !== user.blockedUsers.length) {
          user.blockedUsers = unique;
          modified = true;
        }
      }

      // FCM Tokens
      if (Array.isArray(user.fcmTokens)) {
        const unique = [...new Set(user.fcmTokens)];
        if (unique.length !== user.fcmTokens.length) {
          user.fcmTokens = unique;
          modified = true;
        }
      }

      // Interests
      if (Array.isArray(user.interests)) {
        const unique = [...new Set(user.interests.map(i => i.trim().toLowerCase()))];
        if (unique.length !== user.interests.length) {
          user.interests = unique;
          modified = true;
        }
      }

      // userRelevanceScores
      if (Array.isArray(user.userRelevanceScores)) {
        const uniqueMap = new Map();
        user.userRelevanceScores.forEach(score => {
          if (score?.userId) {
            uniqueMap.set(score.userId.toString(), score);
          }
        });

        if (uniqueMap.size !== user.userRelevanceScores.length) {
          user.userRelevanceScores = Array.from(uniqueMap.values());
          modified = true;
        }
      }

      // Save if modified
      if (modified) {
        await user.save();
        updatedCount++;
        console.log(`✅ Cleaned user: ${user._id}`);
      }
    }

    console.log(`✨ Done. ${updatedCount} user(s) cleaned.`);
    mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
    mongoose.disconnect();
  }
}