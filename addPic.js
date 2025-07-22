const mongoose = require('mongoose');
const dotenv = require('dotenv');
const PlatformWallet = require('./models/PlatformWallet'); // Adjust path if needed

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/salmart'; // Update if needed

async function resetWallets() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const result = await PlatformWallet.updateMany(
      { type: { $in: ['commission', 'promotion'] } },
      {
        $set: {
          balance: 0,
          lastUpdated: new Date()
        },
        $unset: {
          transactions: "" // Optionally clear all transactions
        }
      }
    );

    console.log('Reset Result:', result);
  } catch (err) {
    console.error('[RESET ERROR]', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

resetWallets();