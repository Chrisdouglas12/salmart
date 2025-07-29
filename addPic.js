const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/userSchema'); // Adjust path if needed

async function deleteUserByEmail(emailToDelete) {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected');

    const user = await User.findOne({ email: emailToDelete });

    if (!user) {
      console.log(`⚠️ No user found with email: ${emailToDelete}`);
    } else {
      console.log(`📋 Found user: ${user.firstName} ${user.lastName} (${user.email})`);
      console.log(`   Phone: ${user.phoneNumber || 'N/A'}`);
      console.log(`   Admin: ${user.isAdmin ? 'Yes' : 'No'}`);
      console.log(`   Verified: ${user.isVerified ? 'Yes' : 'No'}`);
      console.log(`   Created At: ${user.createdAt}`);

      const result = await User.deleteOne({ email: emailToDelete });
      if (result.deletedCount > 0) {
        console.log(`✅ User with email "${emailToDelete}" deleted.`);
      } else {
        console.log(`❌ Deletion failed for email: ${emailToDelete}`);
      }
    }

    await mongoose.connection.close();
    console.log('🔐 MongoDB connection closed.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// ✅ Call the function with your desired email
deleteUserByEmail('chrisdouglas1700@gmail.com');