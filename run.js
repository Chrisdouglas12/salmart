const mongoose = require('mongoose');
const User = require('./models/userSchema'); // Path to your User model
require('dotenv').config();

// ====== CONFIGURE THESE VARIABLES ======
const OLD_EMAIL = 'rubbykossyglobal042@email.com'; // The email to find
const NEW_EMAIL = 'rubbykossyglobal042@gmail.com'; // The email to update to
// =======================================

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  updateUserEmail();
})
.catch((err) => {
  console.error(`❌ MongoDB connection error: ${err.message}`);
  process.exit(1);
});

async function updateUserEmail() {
  try {
    console.log(`Starting email update: ${OLD_EMAIL} → ${NEW_EMAIL} ...`);

    const result = await User.updateOne(
      { email: OLD_EMAIL }, // Find user by old email
      { $set: { email: NEW_EMAIL } } // Update to new email
    );

    if (result.matchedCount === 0) {
      console.log(`⚠️ No user found with email: ${OLD_EMAIL}`);
    } else {
      console.log(`✅ Updated ${result.modifiedCount} user's email.`);
    }

    console.log('Update completed. Closing database connection...');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Email update failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}