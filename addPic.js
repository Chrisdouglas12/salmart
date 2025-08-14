const mongoose = require('mongoose');
require('dotenv').config();

const Admin = require('./models/adminSchema'); 

async function deleteAdminByEmail(emailToDelete) {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected');

    const admin = await Admin.findOne({ email: emailToDelete });

    if (!admin) {
      console.log(`⚠️ No user found with email: ${emailToDelete}`);
    } else {
      console.log(`📋 Found user: ${admin.firstName} ${admin.lastName} (${admin.email})`);
      console.log(`   Phone: ${admin.phoneNumber || 'N/A'}`);
      console.log(`   Admin: ${admin.isAdmin ? 'Yes' : 'No'}`);
      console.log(`   Verified: ${admin.isVerified ? 'Yes' : 'No'}`);
      console.log(`   Created At: ${admin.createdAt}`);

      const result = await Admin.deleteOne({ email: emailToDelete });
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
deleteAdminByEmail('chrisdouglas1700@gmail.com');