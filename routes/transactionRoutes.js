const express = require('express')
const mongoose = require('mongoose')
const Post = require('../models/postSchema.js')
const User = require('../models/userSchema.js')
const Report = require('../models/reportSchema.js')
const cron = require('node-cron')
const RefundRequests = require('../models/refundSchema.js')
const verifyToken = require('../middleware/auths.js')
const axios = require('axios')
const Transaction = require('../models/transactionSchema.js')
const router = express.Router()
const Notification = require('../models/notificationSchema.js')

module.exports = (io) => {


//Get Transaction
router.get('/get-transactions/:userId', verifyToken, async (req, res) => {
 console.log("fecting tx")
  try {
    const userId = req.params.userId;
    const transactions = await Transaction.find({ $or: [{ buyerId: userId }, { sellerId: userId }] })
      .populate('buyerId sellerId postId')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, transactions });
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

// Request Refund
router.post('/request-refund/:transactionId', verifyToken, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason, evidence } = req.body;
    const userId = req.user.userId;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.buyerId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Refund not applicable' });
    }

    const existingRefund = await RefundRequests.findOne({ transactionId });
    if (existingRefund) {
      return res.status(400).json({ success: false, message: 'Refund already requested' });
    }

    const refund = new RefundRequests({
      transactionId,
      buyerId: userId,
      reason,
      evidence,
      status: 'pending',
    });

    await Promise.all([refund.save(), transaction.updateOne({ refundRequested: true })]);
    res.status(200).json({ success: true, message: 'Refund requested successfully' });
  } catch (error) {
    console.error('Request refund error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/confirm-delivery/:transactionId', verifyToken, async (req, res) => {
  const transactionId = req.params.transactionId;
  console.log('\n[CONFIRM DELIVERY INITIATED] Transaction ID:', transactionId);

  try {
    const transaction = await Transaction.findById(transactionId).populate('buyerId sellerId postId');
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });

    const seller = transaction.sellerId;
    const buyer = transaction.buyerId;
    const product = transaction.productId;

    if (!seller.bankDetails || !seller.bankDetails.accountNumber || !seller.bankDetails.bankCode) {
      return res.status(400).json({
        error: "Seller has not added valid bank details."
      });
    }

    // === Ensure recipient exists ===
    let recipientCode = seller.paystackRecipientCode;
    if (!recipientCode) {
      const recipientPayload = {
        type: 'nuban',
        name: `${seller.firstName} ${seller.lastName}`,
        account_number: seller.bankDetails.accountNumber,
        bank_code: seller.bankDetails.bankCode,
        currency: 'NGN'
      };

      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        recipientPayload,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );

      recipientCode = recipientResponse.data.data.recipient_code;
      seller.paystackRecipientCode = recipientCode;
      await seller.save();
    }

    const productPrice = product?.price || 0;
    const commissionPercent = 2.5;
    const commission = Math.floor((commissionPercent / 100) * productPrice);
    const amountToTransfer = productPrice - commission;

    // === Check Paystack Balance ===
    const balanceResponse = await axios.get(
      'https://api.paystack.co/balance',
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const availableBalance = balanceResponse.data.data[0]?.balance || 0;
    const neededAmountKobo = amountToTransfer * 100;

    // ======================
    // === INSUFFICIENT BALANCE — Queue
    // ======================
    if (availableBalance < neededAmountKobo) {
      transaction.status = 'confirmed_pending_payout';
      transaction.amountDue = amountToTransfer;
      transaction.commission = commission;
      transaction.transferRecipient = recipientCode;
      await transaction.save();

      const title = 'Delivery Confirmed – Payment Processing Soon';
      const message = `The buyer confirmed delivery for "${product?.title}". You’ll receive ₦${amountToTransfer.toLocaleString()} once funds are available.`;

      // Save to Notification collection
      await Notification.create({
        userId: seller._id,
        title,
        message,
        type: 'payout_queued',
        metadata: {
          transactionId: transaction._id,
          productId: product?._id,
          amountDue: amountToTransfer
        }
      });

      // Send FCM
      await sendFCMNotification(
        seller._id,
        title,
        message,
        {
          type: 'payout_queued',
          transactionId: transaction._id.toString(),
          productId: product?._id.toString(),
          amountDue: amountToTransfer
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
    const transferPayload = {
      source: 'balance',
      amount: neededAmountKobo,
      recipient: recipientCode,
      reason: `Payment for product: ${product?.description}`
    };

    const transferResponse = await axios.post(
      'https://api.paystack.co/transfer',
      transferPayload,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const transferStatus = transferResponse.data.data.status;

    if (transferStatus === 'otp') {
      transaction.transferReference = transferResponse.data.data.transfer_code;
      transaction.otpRequired = true;
      await transaction.save();

      return res.status(200).json({
        message: "OTP is required to complete the transfer.",
        otpRequired: true,
        transferReference: transaction.transferReference
      });
    }

    // === Transfer succeeded
    transaction.status = 'released';
    transaction.transferReference = transferResponse.data.data.reference;
    await transaction.save();

    const title = 'Payment Released to Your Account';
    const message = `₦${amountToTransfer.toLocaleString()} for "${product?.title}" has been released to your bank account.`;

    // Save to Notification collection
    await Notification.create({
      userId: seller._id,
      title,
      message,
      type: 'payment_released',
      metadata: {
        transactionId: transaction._id,
        productId: product?._id,
        amountTransferred: amountToTransfer,
        reference: transaction.transferReference
      }
    });

    // Send FCM
    await sendFCMNotification(
      seller._id,
      title,
      message,
      {
        type: 'payment_released',
        transactionId: transaction._id.toString(),
        productId: product?._id.toString(),
        amountTransferred: amountToTransfer,
        reference: transaction.transferReference
      }
    );

    return res.status(200).json({
      message: "Delivery confirmed and payment released.",
      transferReference: transaction.transferReference,
      amountTransferred: amountToTransfer
    });

  } catch (err) {
    console.error('[CONFIRM DELIVERY SERVER ERROR]', err);
    return res.status(500).json({ error: "Something went wrong.", details: err.message });
  }
});



async function processQueuedPayouts() {
  try {
    const pendingTransactions = await Transaction.find({ status: 'confirmed_pending_payout' })
      .sort({ updatedAt: 1 })
      .populate('sellerId productId');

    if (!pendingTransactions.length) return;

    const balanceResponse = await axios.get(
      'https://api.paystack.co/balance',
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    let availableBalance = balanceResponse.data.data[0]?.balance || 0;

    for (const tx of pendingTransactions) {
      const amountKobo = tx.amountDue * 100;

      if (availableBalance >= amountKobo) {
        const transferPayload = {
          source: 'balance',
          amount: amountKobo,
          recipient: tx.transferRecipient,
          reason: `Queued payout for product: ${tx.productId?.description || ''}`
        };

        const transferResponse = await axios.post(
          'https://api.paystack.co/transfer',
          transferPayload,
          { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
        );

        tx.status = 'released';
        tx.transferReference = transferResponse.data.data.reference;
        await tx.save();

        availableBalance -= amountKobo;

        // === FCM + DB Notification
        const title = 'Payment Released to Your Account';
        const message = `₦${tx.amountDue.toLocaleString()} for "${tx.productId?.title}" has been released to your bank account.`;

        await Notification.create({
          userId: tx.sellerId._id,
          title,
          message,
          type: 'payment_released',
          metadata: {
            transactionId: tx._id,
            productId: tx.productId?._id,
            amountTransferred: tx.amountDue,
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
            productId: tx.productId?._id.toString(),
            amountTransferred: tx.amountDue,
            reference: tx.transferReference
          }
        );

        console.log(`[PAYOUT SUCCESS] Transaction ${tx._id} released`);
      } else {
        console.log(`[PAYOUT SKIPPED] Not enough balance for ${tx._id}`);
      }
    }

  } catch (err) {
    console.error('[PAYOUT JOB ERROR]', err.message);
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