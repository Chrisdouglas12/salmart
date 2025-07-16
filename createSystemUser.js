const mongoose = require('mongoose');
const User = require('./models/userSchema.js'); 
require('dotenv').config()

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})

  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    process.exit(1); // Exit if MongoDB fails to connect
  });
  
async function normalizeEmails() {
  try {
    const users = await User.find();
    for (const user of users) {
      const lowerEmail = user.email.toLowerCase();
      if (user.email !== lowerEmail) {
        user.email = lowerEmail;
        await user.save();
        console.log(`Updated email for user: ${user._id}`);
      }
    }
    console.log('✅ Email normalization complete.');
  } catch (error) {
    console.error('❌ Error normalizing emails:', error);
  } finally {
    mongoose.disconnect();
  }
}

normalizeEmails();