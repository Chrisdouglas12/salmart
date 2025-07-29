const mongoose = require('mongoose');
const Transaction = require('./models/transactionSchema.js'); // adjust the path as needed
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
    migrateTransactionCurrencyUnits(); // ✅ FIXED: Call the correct function name
  })
  .catch((err) => {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    process.exit(1);
  });

async function migrateTransactionCurrencyUnits() {
  try {
    console.log('Starting transaction currency unit migration...');
    
    // Get all transactions without currencyUnit field
    const transactionsToUpdate = await Transaction.find({ 
      currencyUnit: { $exists: false },
      amount: { $exists: true, $ne: null }
    });
    
    console.log(`Found ${transactionsToUpdate.length} transactions to migrate`);
    
    let updated = 0;
    let errors = 0;
    
    for (const transaction of transactionsToUpdate) {
      try {
        let currencyUnit;
        let reasoning;
        
        // Apply conservative detection logic for existing data
        if (transaction.amount >= 100000000) { // 100M+ likely kobo
          currencyUnit = 'kobo';
          reasoning = 'Amount >= 100M, likely kobo';
        } else if (transaction.amount <= 1000000) { // 1M or less likely naira
          currencyUnit = 'naira';
          reasoning = 'Amount <= 1M, likely naira';
        } else {
          // For amounts between 1M-100M, you need manual review
          console.warn(`MANUAL REVIEW NEEDED: Transaction ${transaction._id} has amount ${transaction.amount} - requires manual classification`);
          
          // For now, let's assume naira but flag for review
          currencyUnit = 'naira';
          reasoning = 'NEEDS_MANUAL_REVIEW - amount in gray area';
        }
        
        await Transaction.updateOne(
          { _id: transaction._id },
          { 
            $set: { 
              currencyUnit,
              migrationNote: `Auto-migrated: ${reasoning}` 
            }
          }
        );
        
        console.log(`Updated transaction ${transaction._id}: ${transaction.amount} -> ${currencyUnit} (${reasoning})`);
        updated++;
        
      } catch (error) {
        console.error(`Error updating transaction ${transaction._id}:`, error);
        errors++;
      }
    }
    
    console.log(`Migration completed: ${updated} updated, ${errors} errors`);
    
    // Show transactions that need manual review
    const needsReview = await Transaction.find({ 
      migrationNote: /NEEDS_MANUAL_REVIEW/ 
    }).select('_id amount createdAt');
    
    if (needsReview.length > 0) {
      console.log('\n=== TRANSACTIONS REQUIRING MANUAL REVIEW ===');
      needsReview.forEach(tx => {
        console.log(`ID: ${tx._id}, Amount: ${tx.amount}, Date: ${tx.createdAt}`);
      });
    }
    
    // ✅ ADDED: Close connection after migration
    console.log('\n✅ Migration completed. Closing database connection...');
    await mongoose.connection.close();
    process.exit(0);
    
  } catch (error) {
    console.error('Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}