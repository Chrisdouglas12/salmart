const PlatformWallet = require('./models/platformWallet.js')
const mongoose = require('mongoose')
require('dotenv').config();


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

async function resetAllWallets() {
  try {
    const result = await PlatformWallet.updateMany(
      { type: { $in: ['commission', 'promotion'] } },
      {
        $set: {
          balance: 0,
          transactions: [],
          lastUpdated: new Date()
        }
      }
    );

    console.log('All wallets reset result:', result);
  } catch (err) {
    console.error('Error resetting wallets:', err.message);
  }
}

resetAllWallets();