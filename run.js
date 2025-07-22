// updatePromotionBalance.js
require('dotenv').config(); // Load environment variables from .env file
const mongoose = require('mongoose');
const PlatformWallet = require('./models/platformWallet.js'); // Adjust path if necessary

// --- Configuration ---
// Make sure your MongoDB URI is correctly set in your .env file (e.g., MONGODB_URI=mongodb://localhost:27017/yourdbname)
const MONGODB_URI = process.env.MONGO_URI;

// Set the target promotion balance you expect IN NAIRA.
// For example, if you want it to be ₦7200, set this to 7200.
const TARGET_NAIRA_BALANCE_PROMOTION = 7200; // <<<--- IMPORTANT: SET THIS TO YOUR DESIRED NAIRA VALUE

// Set the target commission balance if you also want to update it.
// For example, if you want it to be ₦522.35, set this to 522.35.
const TARGET_NAIRA_BALANCE_COMMISSION = 522.35; // <<<--- IMPORTANT: SET THIS TO YOUR DESIRED NAIRA VALUE (if applicable)

// --- Script Logic ---
async function updatePlatformWalletBalances() {
    if (!MONGODB_URI) {
        console.error('Error: MONGODB_URI is not set in your .env file.');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB successfully.');

        // --- Update Promotion Wallet ---
        const targetPromotionKobo = Math.round(TARGET_NAIRA_BALANCE_PROMOTION * 100);

        const promoWallet = await PlatformWallet.findOne({ type: 'promotion' });

        if (promoWallet) {
            console.log(`\n--- Promotion Wallet ---`);
            console.log(`Current raw balance in DB: ${promoWallet.balance} kobo (₦${(promoWallet.balance / 100).toFixed(2)})`);
            console.log(`Desired balance: ₦${TARGET_NAIRA_BALANCE_PROMOTION.toFixed(2)} (${targetPromotionKobo} kobo)`);

            if (promoWallet.balance === targetPromotionKobo) {
                console.log('Promotion wallet balance is already correct. No update needed.');
            } else {
                const result = await PlatformWallet.updateOne(
                    { type: 'promotion' },
                    { $set: { balance: targetPromotionKobo, lastUpdated: new Date() } }
                );
                if (result.matchedCount > 0) {
                    console.log(`Successfully updated promotion wallet. New balance: ${targetPromotionKobo} kobo (₦${(targetPromotionKobo / 100).toFixed(2)})`);
                } else {
                    console.warn('Promotion wallet document not found for update.');
                }
            }
        } else {
            console.warn('Promotion wallet document not found. Please ensure it exists.');
            // Optionally, create it if it doesn't exist (though usually it's created on first transaction)
            // await PlatformWallet.create({ type: 'promotion', balance: targetPromotionKobo, lastUpdated: new Date(), transactions: [] });
            // console.log('Created new promotion wallet.');
        }

        // --- Update Commission Wallet (if applicable) ---
        if (TARGET_NAIRA_BALANCE_COMMISSION !== null && TARGET_NAIRA_BALANCE_COMMISSION !== undefined) {
            const targetCommissionKobo = Math.round(TARGET_NAIRA_BALANCE_COMMISSION * 100);
            const commissionWallet = await PlatformWallet.findOne({ type: 'commission' });

            if (commissionWallet) {
                console.log(`\n--- Commission Wallet ---`);
                console.log(`Current raw balance in DB: ${commissionWallet.balance} kobo (₦${(commissionWallet.balance / 100).toFixed(2)})`);
                console.log(`Desired balance: ₦${TARGET_NAIRA_BALANCE_COMMISSION.toFixed(2)} (${targetCommissionKobo} kobo)`);

                if (commissionWallet.balance === targetCommissionKobo) {
                    console.log('Commission wallet balance is already correct. No update needed.');
                } else {
                    const result = await PlatformWallet.updateOne(
                        { type: 'commission' },
                        { $set: { balance: targetCommissionKobo, lastUpdated: new Date() } }
                    );
                    if (result.matchedCount > 0) {
                        console.log(`Successfully updated commission wallet. New balance: ${targetCommissionKobo} kobo (₦${(targetCommissionKobo / 100).toFixed(2)})`);
                    } else {
                        console.warn('Commission wallet document not found for update.');
                    }
                }
            } else {
                console.warn('Commission wallet document not found. Please ensure it exists.');
                // Optionally, create it
            }
        } else {
            console.log('\nSkipping commission wallet update as TARGET_NAIRA_BALANCE_COMMISSION is not set.');
        }

    } catch (error) {
        console.error('Error updating platform wallet balances:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
        process.exit(0);
    }
}

// Run the script
updatePlatformWalletBalances();
