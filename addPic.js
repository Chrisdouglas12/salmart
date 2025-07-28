const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/userSchema.js'); // Make sure the path is correct

async function createSystemUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected successfully');

    const userData = {
      firstName: 'Salmart',
      lastName: 'Admin',
      email: 'salmarttechnologies@gmail.com',
      password: 'SalmartTech1', 
      profilePicture: '',
      phoneNumber: '09011195990',
      isAdmin: true,
      isSystemUser: true,
      notificationEnabled: true,
    };

    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      console.log(`⚠️ User with email ${userData.email} already exists.`);
      await mongoose.connection.close();
      return;
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    userData.password = hashedPassword;

    const systemUser = new User(userData);
    await systemUser.save();

    console.log(`✅ System user "${userData.firstName} ${userData.lastName}" created successfully.`);
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  } catch (error) {
    console.error('❌ Error creating system user:', error.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

createSystemUser();