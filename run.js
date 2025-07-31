const mongoose = require('mongoose');
const User = require('./models/userSchema'); // Path to your User model
require('dotenv').config();

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  addInterestsField();
})
.catch((err) => {
  console.error(`❌ MongoDB connection error: ${err.message}`);
  process.exit(1);
});

async function addInterestsField() {
  try {
    console.log('Starting migration to add interests field...');
    const result = await User.updateMany(
      { interests: { $exists: false } }, // Find users that don't have the interests field
      { $set: { interests: [] } } // Set it to an empty array
    );
    console.log(`Updated ${result.nModified} users.`);
    console.log('Migration completed. Closing database connection...');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}