const express = require('express')
const mongoose = require('mongoose')
const Post = require('../models/postSchema.js')
const User = require('../models/userSchema.js')
const Report = require('../models/reportSchema.js')
const PlatformWallet = require('../models/platformWallet'); 
const cron = require('node-cron')
const RefundRequests = require('../models/refundSchema.js')
const verifyToken = require('../middleware/auths.js')
const axios = require('axios')
const Transaction = require('../models/transactionSchema.js')
const router = express.Router()
const Notification = require('../models/notificationSchema.js')
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
const winston = require('winston');
// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/transactionRoutes.log' }),
    new winston.transports.Console(),
  ],
});

const COMMISSION_PERCENT = 3.5;

module.exports = (io) => {


//Get Transaction
router.get('/get-transactions/:userId', verifyToken, async (req, res) => {
  console.log("fetching tx")
  try {
    const userId = req.params.userId;
    const transactions = await Transaction.find({ $or: [{ buyerId: userId }, { sellerId: userId }] })
      .populate('buyerId sellerId postId')
      .sort({ createdAt: -1 });

    // Add refund status to each transaction
    const transactionsWithRefundStatus = await Promise.all(
      transactions.map(async (transaction) => {
        const refundRequest = await RefundRequests.findOne({ 
          transactionId: transaction._id 
        });
        
        return {
          ...transaction.toObject(),
          refundStatus: refundRequest ? refundRequest.status : null,
          refundRequestId: refundRequest ? refundRequest._id : null
        };
      })
    );

    res.status(200).json({ success: true, transactions: transactionsWithRefundStatus });
  } catch (error) {
    console.error('Fetch transactions error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

//Check payment status
router.get('/check-payment-status', async (req, res) => {
  try {
    const { productId, buyerId } = req.query;
    const [transaction, escrow] = await Promise.all([
      Transaction.findOne({ productId, buyerId, status: 'completed' }),
      Escrow.findOne({ product: productId, buyer: buyerId, status: 'Released' }),
    ]);
    res.status(200).json({ success: true, paymentCompleted: !!(transaction || escrow) });
  } catch (error) {
    console.error('Check payment status error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
//Check payment status
router.get('/check-payment-status', async (req, res) => {
  try {
    const { productId, buyerId } = req.query;
    const [transaction, escrow] = await Promise.all([
      Transaction.findOne({ productId, buyerId, status: 'completed' }),
      Escrow.findOne({ product: productId, buyer: buyerId, status: 'Released' }),
    ]);
    res.status(200).json({ success: true, paymentCompleted: !!(transaction || escrow) });
  } catch (error) {
    console.error('Check payment status error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



router.get('/banks', async (req, res) => {
  try {
    const response = await axios.get('https://api.paystack.co/bank?country=nigeria', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    if (!response.data.status) {
      return res.status(400).json({ success: false, message: response.data.message || 'Unable to fetch banks' });
    }

    res.status(200).json({ success: true, banks: response.data.data });
  } catch (error) {
    console.error('Fetch banks error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/resolve-account', async (req, res) => {
  try {
    const { account_number, bank_code } = req.body;

    const response = await axios.get(`https://api.paystack.co/bank/resolve`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
      params: {
        account_number,
        bank_code,
      },
    });

    if (response.data.status) {
      res.status(200).json({
        success: true,
        account_name: response.data.data.account_name,
      });
    } else {
      res.status(400).json({
        success: false,
        message: response.data.message || 'Unable to resolve account',
      });
    }
  } catch (error) {
    console.error('Resolve account error:', error.message);
    const message =
      error.response?.data?.message || 'Server error while resolving account';
    res.status(500).json({ success: false, message });
  }
});



// Get products for bargain
router.get('/products', verifyToken, async (req, res) => {
  try {
    const { sellerId } = req.query;
    console.log('Request received for /products', { sellerId, user: req.user });

    // Build the query
    const query = { 
      price: { $exists: true, $ne: '' }, 
      productCondition: { $exists: true, $ne: '' }, 
      location: { $exists: true, $ne: '' }, 
      isSold: false 
    };
    if (sellerId) query['createdBy.userId'] = sellerId;

    console.log('Query constructed:', query);

    // Fetch products
    const products = await Post.find(query)
      .sort({ createdAt: -1 })
      .populate('createdBy.userId', 'firstName lastName profilePicture');
    
    console.log('Products fetched:', { 
      productCount: products.length, 
      products: products.map(p => ({
        id: p._id,
        title: p.title, // Assuming a title field exists
        price: p.price,
        createdBy: p.createdBy?.userId?._id
      }))
    });

    // Check if products array is empty
    if (!products || products.length === 0) {
      console.log('No products found matching the query');
      return res.status(200).json({ success: true, products: [], message: 'No products found' });
    }

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error('Fetch products error:', { 
      message: error.message, 
      stack: error.stack 
    });
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});// Get products for bargain
router.get('/products', verifyToken, async (req, res) => {
  try {
    const { sellerId } = req.query;
    console.log('Request received for /products', { sellerId, user: req.user });

    const query = { 
      price: { $exists: true, $ne: '' }, 
      productCondition: { $exists: true, $ne: '' }, 
      location: { $exists: true, $ne: '' }, 
      isSold: false,
      // title is required in schema, so no need for $exists check
    };
    if (sellerId) query['createdBy.userId'] = sellerId;

    console.log('Query constructed:', query);

    const products = await Post.find(query)
      .select('title price productCondition location createdBy photo') // Include title
      .sort({ createdAt: -1 })
      .populate('createdBy.userId', 'firstName lastName profilePicture');
    
    console.log('Products fetched:', { 
      productCount: products.length, 
      products: products.map(p => ({
        id: p._id,
        title: p.title || 'No Title', // Fallback for logging
        price: p.price,
        createdBy: p.createdBy?.userId?._id,
      }))
    });

    if (!products || products.length === 0) {
      console.log('No products found matching the query');
      return res.status(200).json({ success: true, products: [], message: 'No products found' });
    }

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error('Fetch products error:', { 
      message: error.message, 
      stack: error.stack 
    });
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
//Update price after successful bargain
router.put('/posts/:postId/update-price', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { newPrice } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid Post ID' });
    }
    if (newPrice === undefined || isNaN(newPrice) || newPrice < 0) {
      return res.status(400).json({ success: false, message: 'Invalid price' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    post.price = newPrice;
    await post.save();
    res.status(200).json({ success: true, message: 'Price updated successfully', post });
  } catch (error) {
    console.error('Update price error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Refunds
router.post('/request-refund/:transactionId', verifyToken, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason, note } = req.body; // 'note' from frontend is 'description' in schema

    // If you're handling file uploads, process them here
    let evidenceUrls = [];
    if (req.files && req.files.evidence) {
      const evidenceFile = req.files.evidence;

      console.log('Evidence file received:', evidenceFile.name);
      // For now, let's just simulate:
      evidenceUrls.push(`/uploads/${evidenceFile.name}`); // Placeholder URL
    }

    const userId = req.user.userId;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Ensure the request is coming from the buyer of the transaction
    if (transaction.buyerId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized: You are not the buyer of this transaction.' });
    }

    // Crucial change: Check if a refund has *already* been requested for this transaction
    if (transaction.refundRequested) {
      return res.status(400).json({ success: false, message: 'Refund has already been requested for this transaction.' });
    }


    // Create the refund request document
    const refund = new RefundRequests({
      transactionId,
      buyerId: userId,
      sellerId: transaction.sellerId, // Link to seller as well
      reason,
      evidence: evidenceUrls, // Store uploaded evidence URLs
      description: note, 
      status: 'Refund Requested', // Initial status for the refund request document
    });

    // Update the original transaction to mark that a refund has been requested
    transaction.refundRequested = true;
    

    await Promise.all([refund.save(), transaction.save()]); // Save both documents

    res.status(200).json({ success: true, message: 'Refund requested successfully.' });
  } catch (error) {
    console.error('Request refund error:', error.message);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});




router.post('/confirm-delivery/:transactionId', verifyToken, async (req, res) => {
  const transactionId = req.params.transactionId;
  logger.info('[CONFIRM DELIVERY INITIATED]', { transactionId });
const systemUser = await User.findOne({ isSystemUser: true });
if (!systemUser) {
  logger.error('[SYSTEM USER NOT FOUND]');
  return res.status(500).json({ error: 'System user not found' });
}
  try {
    const transaction = await Transaction.findById(transactionId)
                                       .populate('buyerId sellerId postId');
    
    if (!transaction) {
      logger.warn('[CONFIRM DELIVERY] Transaction not found', { transactionId });
      return res.status(404).json({ error: "Transaction not found" });
    }

    const seller = transaction.sellerId;
    const buyer = transaction.buyerId;
    const product = transaction.postId;

    if (!product) {
      logger.error('[CONFIRM DELIVERY] Post object not found via transaction.postId population', { transactionId, postId: transaction.postId });
      return res.status(404).json({ error: "Product associated with transaction not found" });
    }
    if (!seller) {
      logger.error('[CONFIRM DELIVERY] Seller object not found via transaction.sellerId population', { transactionId, sellerId: transaction.sellerId });
      return res.status(404).json({ error: "Seller associated with transaction not found" });
    }
    if (!buyer) {
      logger.error('[CONFIRM DELIVERY] Buyer object not found via transaction.buyerId population', { transactionId, buyerId: transaction.buyerId });
      return res.status(404).json({ error: "Buyer associated with transaction not found" });
    }

    if (!seller.bankDetails || !seller.bankDetails.accountNumber || !seller.bankDetails.bankCode) {
      logger.warn('[CONFIRM DELIVERY] Seller missing bank details', { sellerId: seller._id });
      return res.status(400).json({
        error: "Seller has not added valid bank details. Please inform the seller to update bank details to recieve funds."
      });
    }

    let recipientCode = seller.paystackRecipientCode;
    if (!recipientCode) {
      logger.info('[CONFIRM DELIVERY] Creating new Paystack recipient for seller', { sellerId: seller._id });
      const recipientPayload = {
        type: 'nuban',
        name: `${seller.firstName} ${seller.lastName}`.trim() || seller.username,
        account_number: seller.bankDetails.accountNumber,
        bank_code: seller.bankDetails.bankCode,
        currency: 'NGN'
      };

      try {
        const recipientResponse = await axios.post(
          'https://api.paystack.co/transferrecipient',
          recipientPayload,
          { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
        );
        recipientCode = recipientResponse.data.data.recipient_code;
        seller.paystackRecipientCode = recipientCode;
        await seller.save();
        logger.info('[CONFIRM DELIVERY] Paystack recipient created and saved', { sellerId: seller._id, recipientCode });
      } catch (recipientError) {
        logger.error('[CONFIRM DELIVERY] Failed to create Paystack recipient', { sellerId: seller._id, error: recipientError.message, responseData: recipientError.response?.data });
        return res.status(500).json({
          error: "Failed to set up seller for payout. Please try again later or contact support.",
          details: recipientError.response?.data?.message || recipientError.message
        });
      }
    }

    const amountPaidByBuyerNaira = transaction.amount;
    
    if (typeof amountPaidByBuyerNaira !== 'number' || amountPaidByBuyerNaira <= 0) {
      logger.error('[CONFIRM DELIVERY] Invalid transaction amount for payout calculation', { transactionId, amount: amountPaidByBuyerNaira });
      return res.status(400).json({
        error: "Invalid transaction amount. Cannot process payout.",
        details: `Transaction amount is ${amountPaidByBuyerNaira}. Expected a positive number.`
      });
    }
// == Calculate platform's commission == //


// Paystack fee calculation
function calculatePaystackFee(amountNaira) {
  let fee = (1.5 / 100) * amountNaira;
  if (amountNaira > 2500) fee += 100;
  return fee > 2000 ? 2000 : fee;
}

// Platform commission rate
function getCommissionRate(amount) {
  if (amount < 10000) return 3.5;
  if (amount < 50000) return 3;
  if (amount < 200000) return 2.5;
  return 1;
}

// Step 1: Deduct Paystack fee from buyer's payment
const paystackFee = calculatePaystackFee(amountPaidByBuyerNaira);
const netAmount = amountPaidByBuyerNaira - paystackFee; // What Paystack settles to you

// Step 2: Calculate your platform commission on the settled amount
const commissionPercent = getCommissionRate(netAmount);
const commissionNaira = (commissionPercent / 100) * netAmount;

// Step 3: Final amount to transfer to seller
const amountToTransferNaira = netAmount - commissionNaira;
const neededAmountKobo = Math.round(amountToTransferNaira * 100);
    // === Record platform commission ===
try {
  await PlatformWallet.updateOne(
    { type: 'commission' },
    {
      $inc: { balance: Math.round(commissionNaira * 100) }, // Ensure balance is in kobo
      $set: { lastUpdated: new Date() },
      $push: {
        transactions: {
          amount: Math.round(commissionNaira * 100), // Save in kobo
          reference: `commission-${transaction._id}`,
          type: 'credit',
          purpose: `Commission from confirmed delivery of "${product.title || 'a product'}"`,
          userId: buyer._id,
          productId: product._id,
          timestamp: new Date()
        }
      }
    },
    { upsert: true }
  );

  logger.info('[PLATFORM COMMISSION RECORDED]', {
    transactionId,
    commission: commissionNaira
  });
} catch (walletErr) {
  logger.error('[FAILED TO RECORD PLATFORM COMMISSION]', {
    transactionId,
    commission: commissionNaira,
    error: walletErr.message
  });
}
    

    logger.debug('[CONFIRM DELIVERY] Payout Calculation', {
      transactionId,
      amountPaidByBuyerNaira,
      commissionPercent,
      commissionNaira,
      amountToTransferNaira,
      neededAmountKobo
    });

    if (neededAmountKobo <= 0) {
      logger.warn('[CONFIRM DELIVERY] Calculated amount to transfer is non-positive', {
        transactionId,
        amountToTransferNaira,
        neededAmountKobo
      });
      return res.status(400).json({
        error: "Calculated payout amount is zero or negative. Cannot proceed.",
        details: "This might occur if the product price is too low relative to commission."
      });
    }

    let availableBalance = 0;
    try {
      const balanceResponse = await axios.get(
        'https://api.paystack.co/balance',
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );
      availableBalance = balanceResponse.data.data[0]?.balance || 0;
      logger.info('[CONFIRM DELIVERY] Paystack Balance Check', { availableBalance });
    } catch (balanceError) {
      logger.error('[CONFIRM DELIVERY] Failed to fetch Paystack balance', { error: balanceError.message, responseData: balanceError.response?.data });
      
      transaction.status = 'confirmed_pending_payout';
      transaction.amountDue = amountToTransferNaira;
      transaction.commission = commissionNaira;
      transaction.transferRecipient = recipientCode;
      await transaction.save();

      const title = 'Delivery Confirmed – Payout Delayed (Balance Check Failed)';
      const message = `Your delivery of "${product.title}" has been confirmed. Payout of ₦${amountToTransferNaira.toLocaleString('en-NG')} shall be sent to you within 24 hours time.`;

      
      await Notification.create({ 
        userId: seller._id, 
        senderId: systemUser._id,
        postId: product._id,
        title, 
        message, 
        type: 'payment_queued', 
        metadata: { 
          transactionId: transaction._id, 
          productId: product._id, 
          amountDue: amountToTransferNaira 
        } 
      });
      

      await sendFCMNotification(seller._id, title, message, { type: 'payout_queued_balance_error', transactionId: transaction._id.toString(), productId: product._id.toString(), amountDue: amountToTransferNaira });

      return res.status(200).json({
        message: "Delivery confirmed. Payout is temporarily delayed as we could not verify our payment balance. It will be processed soon.",
        queued: true,
        balanceCheckFailed: true
      });
    }


    // ======================
    // === INSUFFICIENT BALANCE — Queue
    // ======================
    if (availableBalance < neededAmountKobo) {
      logger.info('[CONFIRM DELIVERY] Insufficient Paystack balance, queuing payout', {
        availableBalance, neededAmountKobo
      });
      transaction.status = 'confirmed_pending_payout';
      transaction.amountDue = amountToTransferNaira;
      transaction.commission = commissionNaira;
      transaction.transferRecipient = recipientCode;
      await transaction.save();

      const title = 'Delivery Confirmed – Payment Processing Soon';
      
      const message = `Good news! The buyer has confirmed delivery of "${product.title}". Expect your ₦${amountToTransferNaira.toLocaleString('en-NG')} within 24 hours.`;

      // --- FIX for Notification: Add postId and senderId ---
      await Notification.create({
        userId: seller._id,
        senderId: systemUser._id, // Add senderId
        postId: product._id, // Add postId
        title,
        message,
        type: 'payout_queued',
        metadata: {
          transactionId: transaction._id,
          productId: product._id, // Keep in metadata if schema allows, but also top-level if required
          amountDue: amountToTransferNaira
        }
      });
      // --- END FIX ---

      await sendFCMNotification(
        seller._id,
        title,
        message,
        {
          type: 'payout_queued',
          transactionId: transaction._id.toString(),
          productId: product._id.toString(),
          amountDue: amountToTransferNaira
        }
      );

      return res.status(200).json({
        message: "Delivery confirmed, but payment is delayed due to settlement policy. Seller will be paid as soon as funds are available.",
        queued: true
      });
    }

    // ======================
    // === SUFFICIENT BALANCE — Transfer
    // ======================
    logger.info('[CONFIRM DELIVERY] Attempting Paystack transfer', {
      transactionId, neededAmountKobo, recipientCode
    });
    const transferPayload = {
      source: 'balance',
      amount: neededAmountKobo,
      recipient: recipientCode,
      reason: `Payment for product: ${product.title}`
    };

    const transferResponse = await axios.post(
      'https://api.paystack.co/transfer',
      transferPayload,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const transferStatus = transferResponse.data.data.status;
    logger.info('[CONFIRM DELIVERY] Paystack transfer response', { transactionId, transferStatus, transferData: transferResponse.data.data });

    if (transferStatus === 'otp') {
      transaction.transferReference = transferResponse.data.data.transfer_code;
      transaction.otpRequired = true;
      await transaction.save();
      logger.info('[CONFIRM DELIVERY] OTP required for transfer', { transactionId, transferReference: transaction.transferReference });

      return res.status(200).json({
        message: "OTP is required to complete the transfer. Please provide the OTP from your Paystack dashboard.",
        otpRequired: true,
        transferReference: transaction.transferReference
      });
    }

    transaction.status = 'released';
transaction.amountDue = amountToTransferNaira;
transaction.commission = commissionNaira;
transaction.transferReference = transferResponse.data.data.reference || transferResponse.data.data.transfer_code;
transaction.amountTransferred = amountToTransferNaira;
transaction.transferStatus = transferStatus;
await transaction.save();
    logger.info('[CONFIRM DELIVERY] Payout successful and transaction updated', { transactionId, newStatus: transaction.status, transferReference: transaction.transferReference });

    const title = 'Payment Released to Your Account';
    const message = `Great news! ₦${amountToTransferNaira.toLocaleString('en-NG')} for "${product.title}" is now in your bank account. We appreciate you for using Salmart!`;

    // --- FIX for Notification: Add postId and senderId ---
    await Notification.create({
      userId: seller._id,
      senderId: systemUser._id, // Add senderId
      postId: product._id, // Add postId
      title,
      message,
      type: 'payment_released',
      metadata: {
        transactionId: transaction._id,
        productId: product._id, // Keep in metadata if schema allows, but also top-level if required
        amountTransferred: amountToTransferNaira,
        reference: transaction.transferReference
      }
    });
    // --- END FIX ---

    await sendFCMNotification(
      seller._id,
      title,
      message,
      {
        type: 'payment_released',
        transactionId: transaction._id.toString(),
        productId: product._id.toString(),
        amountTransferred: amountToTransferNaira,
        reference: transaction.transferReference
      }
    );

    return res.status(200).json({
      message: "Delivery confirmed and payment released.",
      transferReference: transaction.transferReference,
      amountTransferred: amountToTransferNaira
    });

  } catch (err) {
    logger.error('[CONFIRM DELIVERY SERVER ERROR]', { error: err.message, stack: err.stack, responseData: err.response?.data });
    let errorMessage = "Something went wrong.";
    let errorDetails = err.message;

    if (err.response && err.response.data && err.response.data.message) {
      errorMessage = `Paystack Error: ${err.response.data.message}`;
      errorDetails = err.response.data.message;
      if (err.response.data.errors) {
        errorDetails += ' ' + JSON.stringify(err.response.data.errors);
      }
    } else if (err.response && err.response.status) {
      errorMessage = `Paystack API responded with status: ${err.response.status} ${err.response.statusText}`;
      errorDetails = `No specific message from Paystack. Status: ${err.response.status}`;
    }

    return res.status(500).json({ error: errorMessage, details: errorDetails });
  }
});



async function processQueuedPayouts() {
  try {
    console.log('[CRON] Checking for queued payouts...');
    
    const systemUser = await User.findOne({ isSystemUser: true });
if (!systemUser) {
  logger.error('[SYSTEM USER NOT FOUND]');
  return res.status(500).json({ error: 'System user not found' });
}

    const pendingTransactions = await Transaction.find({
      status: 'confirmed_pending_payout',
      processing: false
    })
      .sort({ updatedAt: 1 })
      .populate('sellerId buyerId postId');

    if (!pendingTransactions.length) {
      console.log('[PAYOUT JOB] No pending transactions to process.');
      return;
    }

    // === Step 1: Get Paystack available balance
    let availableBalance = 0;
    try {
      const balanceResponse = await axios.get(
        'https://api.paystack.co/balance',
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
          }
        }
      );
      availableBalance = balanceResponse.data.data[0]?.balance || 0;
      console.log(`[PAYOUT JOB] Available Balance: ${availableBalance} kobo`);
    } catch (err) {
      console.error('[PAYOUT JOB ERROR] Failed to fetch balance:', err.message);
      return;
    }

    // === Step 2: Process transactions FIFO
    for (const tx of pendingTransactions) {
      if (!tx.sellerId || !tx.buyerId || !tx.postId) {
        console.warn(`[PAYOUT SKIPPED] Missing populated fields for tx ${tx._id}`);
        continue;
      }

if (!tx.transferRecipient) {
  if (tx.sellerId.paystackRecipientCode) {
    tx.transferRecipient = tx.sellerId.paystackRecipientCode;
    await tx.save();
    console.log(`[PAYOUT FIXED] Populated missing recipient for tx ${tx._id}`);
  } else {
    // Try creating the recipient using user.bankDetails
    try {
      const user = tx.sellerId;

      if (!user.bankDetails?.accountNumber || !user.bankDetails?.bankCode || !user.firstName) {
        console.warn(`[PAYOUT SKIPPED] Missing bank info for tx ${tx._id}`);
        tx.processing = false;
        await tx.save();
        continue;
      }

      const recipientRes = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: `${user.firstName} ${user.lastName || ''}`.trim(),
          account_number: user.bankDetails.accountNumber,
          bank_code: user.bankDetails.bankCode,
          currency: 'NGN'
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
          }
        }
      );

      const recipientCode = recipientRes.data.data.recipient_code;

      // Save to user and transaction
      user.paystackRecipientCode = recipientCode;
      await user.save();

      tx.transferRecipient = recipientCode;
      await tx.save();

      console.log(`[PAYOUT FIXED] Created and assigned recipient for tx ${tx._id}`);
    } catch (createErr) {
      console.error(`[PAYOUT SKIPPED] Failed to create recipient for tx ${tx._id}:`, createErr.response?.data || createErr.message);
      tx.processing = false;
      await tx.save();
      continue;
    }
  }
}

      tx.processing = true;
      await tx.save();

      try {
        if (typeof tx.amountDue !== 'number' || tx.amountDue <= 0) {
          if (typeof tx.amount === 'number' && typeof tx.commission === 'number') {
            tx.amountDue = tx.amount - tx.commission;
            await tx.save();
            console.log(`[PAYOUT PATCH] Recomputed amountDue for ${tx._id}`);
          } else {
            console.warn(`[PAYOUT SKIPPED] Invalid amountDue for ${tx._id}`);
            tx.processing = false;
            await tx.save();
            continue;
          }
        }

        const amountKobo = Math.round(tx.amountDue * 100);
        if (availableBalance < amountKobo) {
          console.log(`[PAYOUT HALTED] Insufficient balance for tx ${tx._id}`);
          tx.processing = false;
          await tx.save();
          break; // Stop and retry later when more funds are available
        }

        // === Proceed with transfer
        const transferPayload = {
          source: 'balance',
          amount: amountKobo,
          recipient: tx.transferRecipient,
          reason: `Queued payout for product: ${tx.postId?.title || 'Product'}`
        };

        const transferResponse = await axios.post(
          'https://api.paystack.co/transfer',
          transferPayload,
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            }
          }
        );

        tx.status = 'released';
        tx.transferReference = transferResponse.data.data.reference;
        tx.amountTransferred = tx.amountDue;
        tx.transferStatus = transferResponse.data.data.status;
        tx.processing = false;
        await tx.save();

        availableBalance -= amountKobo;

        const title = 'Payment Released to Your Account';
        const message = `Awesome! ₦${tx.amountDue.toLocaleString('en-NG')} for "${tx.postId?.title}" is now in your bank account. Thanks for being a valued seller on Salmart!`;

        await Notification.create({
  userId: tx.sellerId._id,
  senderId: systemUser._id,
  postId: tx.postId._id,
  title,
  message,
  type: 'payment_released',
  metadata: {
    transactionId: tx._id,
    reference: tx.transferReference
  }
});
        
       

        await sendFCMNotification(
          tx.sellerId._id,
          title,
          message,
          {
            type: 'payment_released',
            transactionId: tx._id.toString(),
            reference: tx.transferReference
          }
        );

        console.log(`[PAYOUT SUCCESS] Transaction ${tx._id} completed`);
      } catch (transferErr) {
        console.error(`[PAYOUT FAILED] Tx ${tx._id}:`, transferErr.message);
        console.error(transferErr.response?.data || {});
        tx.processing = false;
        await tx.save();
      }
    }
  } catch (err) {
    console.error('[PAYOUT ERROR] processQueuedPayouts crashed:', err.message);
  }
}


// Run every 15 minutes
cron.schedule('*/15 * * * *', () => {
  console.log('[CRON] Checking for queued payouts...');
  processQueuedPayouts();
});
// Update Bank Details using Paystack
router.post('/update-bank-details', verifyToken, async (req, res) => {
  const { accountNumber, bankCode, bankName } = req.body;
  const userId = req.user.userId;

  if (!accountNumber || !bankCode || !bankName) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    // Resolve account name using Paystack
    const response = await axios.get(`https://api.paystack.co/bank/resolve`, {
      params: {
        account_number: accountNumber,
        bank_code: bankCode
      },
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.status) {
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to verify account details'
      });
    }

    const accountName = response.data.data.account_name;

    // Update user record
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        bankDetails: {
          accountNumber,
          bankCode,
          bankName,
          accountName
        }
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Bank details updated successfully',
      bankDetails: updatedUser.bankDetails
    });
  } catch (error) {
    console.error('Update bank details error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update bank details'
    });
  }
});



// Get Bank Details
router.get('/get-bank-details', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('bankDetails');
    if (!user || !user.bankDetails) {
      return res.status(404).json({ success: false, message: 'Bank details not found' });
    }
    res.status(200).json({ success: true, bankDetails: user.bankDetails });
  } catch (error) {
    console.error('Get bank details error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch bank details' });
  }
});


  return router;
};