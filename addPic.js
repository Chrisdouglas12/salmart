const mongoose = require('mongoose');
const Post = require('./models/postSchema.js');
require('dotenv').config()



async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
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
    await Post.updateMany({}, { $unset: { profilePicture: "" } });
    console.log('Migration completed: profilePicture field removed from Post documents');
    mongoose.connection.close();
  } catch (error) {
    console.error('Migration error:', error);
  }
}

migrate();