// utils/initWallets.js
require('dotenv').config(); // ✅ Load .env variables

const mongoose = require('mongoose');
const PlatformWallet = require('./models/PlatformWallet');

async function initWallets() {
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

  const existing = await PlatformWallet.findOne({ type: 'promotion' });
  if (existing) {
    console.log('✅ Promotion wallet already exists.');
  } else {
    await PlatformWallet.create({
      type: 'promotion',
      balance: 0,
      transactions: [],
    });
    console.log('✅ Promotion wallet created successfully.');
  }

  mongoose.connection.close();
}

initWallets();