const mongoose = require('mongoose');
// !!! IMPORTANT: Change this to reference your Transaction model
const Transaction = require('./models/transactionSchema.js'); // Assuming your schema is in transactionSchema.js
require('dotenv').config();

async function fetchPaymentReferencesWithDates() {
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
        process.exit(1);
      });

    console.log('Fetching payment references and their dates...');

    // We'll use 'createdAt' as the transaction date based on your schema
    // If you need the refund date, use 'refundedAt'
    // If you need the fund release date, use 'dateReleased'
    const dateFieldToFetch = 'createdAt'; // <-- The most common field for transaction initiation date

    const transactions = await Transaction.find(
      {}, // Empty query object to fetch all documents
      { paymentReference: 1, [dateFieldToFetch]: 1, _id: 0 } // Project paymentReference and the chosen date field
    ).lean(); // .lean() for plain JavaScript objects, better performance for reads

    if (transactions.length > 0) {
      console.log('--- Fetched Payment References and Dates ---');
      transactions.forEach(tx => {
        // Access the fields using the variable for the date field
        console.log(`Reference: ${tx.paymentReference}, Date: ${tx[dateFieldToFetch]}`);
      });
      console.log(`\nTotal transactions fetched: ${transactions.length}`);
    } else {
      console.log('No transaction records found.');
    }

    mongoose.connection.close();
    console.log('MongoDB connection closed.');

  } catch (error) {
    console.error('Error fetching transaction data:', error);
    if (mongoose.connection.readyState === 1) { // If connection is still open
      mongoose.connection.close();
    }
  }
}

// Execute the function
fetchPaymentReferencesWithDates();
