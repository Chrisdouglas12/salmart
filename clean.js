// scripts/fixTokens.js
const mongoose = require('mongoose');
const User = require('./models/userSchema.js'); // adjust path
  require('dotenv').config()
async function fixTokens() {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({ "fcmTokens.platform": "unknown" });

  for (const user of users) {
    let changed = false;
    user.fcmTokens.forEach(t => {
      if (!['web', 'ios', 'android'].includes(t.platform)) {
        // fallback to web if invalid
        t.platform = 'web';
        changed = true;
      }
    });
    if (changed) {
      await user.save();
      console.log(`Fixed user ${user._id}`);
    }
  }

  console.log('Done');
  process.exit(0);
}

fixTokens().catch(err => {
  console.error(err);
  process.exit(1);
});