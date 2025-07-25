const express = require('express')
const mongoose = require('mongoose');
const router = express.Router();
const axios = require('axios')
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const User = require('../models/userSchema.js');
const PlatformWallet = require('../models/platformWallet.js')
const Transaction = require('../models/transactionSchema');
const Post = require('../models/postSchema');
const Admin = require('../models/adminSchema.js')
const RefundRequests = require('../models/refundSchema.js')
const Report = require('../models/reportSchema.js')
 const Payout = require('../models/payoutSchema.js')
 const Payment = require('../models/paymentSchema.js')
const verifyToken = require('../middleware/auths.js')
const Notification = require('../models/notificationSchema.js')
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js')
const winston = require('winston');

const paystack = require('paystack-api')
(process.env.PAYSTACK_SECRET_KEY)

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/postRoutes.log' }),
    new winston.transports.Console(),
  ],
});
module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    next();
  });


  async function markProductAsSold(txn, reference, io) {
  if (!txn || !txn.postId) return;

  try {
    await Post.findByIdAndUpdate(txn.postId._id || txn.postId, {
      status: 'sold',
      soldAt: new Date()
    });

    // Optionally emit real-time update
    if (io) {
      io.emit('product-sold', {
        postId: txn.postId._id || txn.postId,
        status: 'sold'
      });
    }

  } catch (err) {
    console.error('[markProductAsSold ERROR]', err.message);
  }
}


const JWT_SECRET = process.env.JWT_SECRET 


// Set up storage dynamically
const uploadDir = path.join(__dirname, 'Uploads');
let storage;
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'Uploads',
      allowed_formats: ['jpg', 'png', 'jpeg'],
    },
  });
} else {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const fileExt = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${fileExt}`);
    },
  });
}
const upload = multer({ storage });

// Upload Route
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = isProduction ? req.file.path : `/Uploads/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});


const SECRET_ADMIN_CODE = process.env.SECRET_ADMIN_CODE

// === Admin Registration ===
router.post('/admin/register', upload.single('profilePicture'), async (req, res) => {
  const { firstName, lastName, email, password, adminCode } = req.body;
console.log("Expected ADMIN CODE:", SECRET_ADMIN_CODE);
  try {
    // Verify admin code
    if (adminCode !== SECRET_ADMIN_CODE) {
      return res.status(403).json({ success: false, message: 'Invalid admin code' });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const profilePicUrl = isProduction
      ? req.file?.path || null
      : req.file
      ? `/Uploads/${req.file.filename}`
      : null;

    const newAdmin = new Admin({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      profilePicture: profilePicUrl,
      adminCode
    });

    await newAdmin.save();

    res.json({ success: true, message: 'Admin registered successfully' });
  } catch (err) {
    console.error('[ADMIN REGISTER ERROR]', err.message);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// === Admin Login ===
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    const token = jwt.sign(
      { adminId: admin._id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '2d' }
    );

    res.json({ success: true, token, message: 'Login successful' });
  } catch (err) {
    console.error('[ADMIN LOGIN ERROR]', err.message);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});


router.get('/admin/me', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin?.adminId || req.user?.userId).select('-password');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    res.status(200).json({ success: true, admin });
  } catch (error) {
    console.error('Get admin details error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Get all refunds request
router.get('/api/admin/refunds', verifyToken, async (req, res) => {
  try {
    const refunds = await RefundRequests.find()
      .populate('buyerId', 'firstName lastName')
      .populate('sellerId', 'firstName lastName')
      .populate('transactionId', 'amount description date')
      .sort({ createdAt: -1 });

    res.status(200).json(refunds);
  } catch (error) {
    console.error('Fetch refunds error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



//Get all users
router.get('/api/admin/users', verifyToken, async (req, res) => {
  try {
    const users = await User.find().select('firstName lastName email profilePicture createdAt isBanned').sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    console.error('Fetch users error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

//To ban a user from tge platform
router.post('/api/admin/users/:id/ban', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.isBanned) {
      return res.status(400).json({ success: false, message: 'User already banned' });
    }
    user.isBanned = true;
    await user.save();
    res.status(200).json({ success: true, message: 'User banned successfully' });
  } catch (error) {
    console.error('Ban user error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// To get all banned users
router.get('/api/admin/users/banned', verifyToken, async (req, res) => {
  try {
    const bannedUsers = await User.find({ isBanned: true }).select('firstName lastName email profilePicture createdAt').sort({ createdAt: -1 });
    res.status(200).json(bannedUsers);
  } catch (error) {
    console.error('Fetch banned users error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// To unban a users
router.post('/api/admin/users/:id/unban', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (!user.isBanned) {
      return res.status(400).json({ success: false, message: 'User not banned' });
    }
    user.isBanned = false;
    await user.save();
    res.status(200).json({ success: true, message: 'User unbanned successfully' });
  } catch (error) {
    console.error('Unban user error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all transactions with tiered commission logic
router.get('/api/admin/transactions', verifyToken, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('buyerId', 'firstName lastName email')
      .populate('sellerId', 'firstName lastName email')
      .populate('postId', 'title')
      .select('buyerId sellerId postId amount status createdAt refundRequested paymentReference')
      .sort({ createdAt: -1 });

    const transactionsWithCommission = transactions.map(tx => {
      const amount = tx.amount || 0;
      let commission = 0;

      if (amount <= 10000) commission = 0.065 * amount;
      else if (amount <= 20000) commission = 0.055 * amount;
      else if (amount <= 50000) commission = 0.045 * amount;
      else if (amount <= 100000) commission = 0.04 * amount;
      else commission = 0.025 * amount;

      commission = parseFloat(commission.toFixed(2));
      const sellerAmount = parseFloat((amount - commission).toFixed(2));

      return {
        ...tx.toObject(),
        platformCommission: commission,
        sellerAmount
      };
    });

    res.status(200).json(transactionsWithCommission);
  } catch (error) {
    console.error('Fetch transactions error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


//Get reported users
router.get('/api/reported-users', verifyToken, async (req, res) => {
  try {
    const reports = await Report.find({ status: 'pending' })
      .populate('reportedUser', 'firstName lastName email profilePicture createdAt')
      .populate('reportedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, reports });
  } catch (error) {
    console.error('Fetch reported users error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/admin/resolve-report',  verifyToken, async (req, res) => {
  try {
    const { reportId, action, adminNotes } = req.body;
    const adminId = req.user.userId;

    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Admin access required' });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    report.status = 'resolved';
    report.resolvedBy = adminId;
    report.resolution = action;
    report.adminNotes = adminNotes;
    report.resolvedAt = new Date();

    if (action === 'ban') {
      await User.findByIdAndUpdate(report.reportedUser, { isBanned: true });
    } else if (action === 'post_removed') {
      await Post.findByIdAndUpdate(report.relatedPost, { status: 'removed' });
    } else if (action === 'warn') {
      const notification = new Notification({
        userId: report.reportedUser,
        type: 'warning',
        message: 'You have received a warning for violating community guidelines',
        createdAt: new Date(),
      });
      await notification.save();
    }

    await report.save();
    res.status(200).json({ success: true, message: `Report resolved with action: ${action}`, report });
  } catch (error) {
    console.error('Resolve report error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

//Get pending reports
router.get('/admin/reports/pending', verifyToken, async (req, res) => {
  try {
    const reports = await Report.find({ status: 'pending' })
      .populate('reportedUser', 'firstName lastName email profilePicture')
      .populate('reportedBy', 'firstName lastName email')
      .populate('postId', 'title photo')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, reports });
  } catch (error) {
    console.error('Fetch pending reports error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/transactions/pending
router.get('/admin/transactions/pending', verifyToken, async (req, res) => {
  try {
    const pendingTxns = await Transaction.find({
  status: { $in: ['confirmed_pending_payout', 'in_escrow'] }
})
.populate('postId', 'title', )
.populate('buyerId', 'firstName lastName email')
.sort({ createdAt: -1 });

res.json({ success: true, data: pendingTxns });
  } catch (err) {
    logger.error('[ADMIN TXNS] Error fetching pending txns:', err);
    res.status(500).json({ success: false, message: 'Error loading transactions' });
  }
});

// POST /api/admin/approve-payment
router.post('/admin/approve-payment', verifyToken, async (req, res) => {
  const { reference } = req.body;

  try {
    const txn = await Transaction.findOne({
      paymentReference: new RegExp(`^${reference}$`, 'i')
    }).populate('postId buyerId sellerId');

    if (!txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }



    if (!['confirmed_pending_payout', 'pending', 'in_escrow'].includes(txn.status)) {
      return res.status(400).json({ success: false, message: 'Transaction not in payout-ready state' });
    }

    const systemUser = await User.findOne({ isSystemUser: true });
if (!systemUser) {
  logger.error('[SYSTEM USER NOT FOUND]');
  return res.status(500).json({ error: 'System user not found' });
}

    const seller = txn.sellerId;

    // ✅ Validate bank details
    if (
      !seller.bankDetails ||
      !seller.bankDetails.accountNumber ||
      !seller.bankDetails.bankCode ||
      !seller.bankDetails.accountName
    ) {
      return res.status(400).json({
        success: false,
        message: 'Seller bank details missing. Cannot create recipient.'
      });
    }

    // ✅ Create recipient if missing
    let recipientCode = seller?.paystack?.recipientCode;
    if (!recipientCode) {
      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: seller.bankDetails.accountName,
          account_number: seller.bankDetails.accountNumber,
          bank_code: seller.bankDetails.bankCode,
          currency: 'NGN'
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
          }
        }
      );

      recipientCode = recipientResponse.data.data.recipient_code;

      // ✅ Save it in user schema
      seller.paystack = seller.paystack || {};
      seller.paystack.recipientCode = recipientCode;
      await seller.save();
    }

    // ✅ Initiate payout
    const amountKobo = Math.round(txn.amountDue * 100);
    const transferReason = `Manual payout for: ${txn.postId?.title || 'Product'}`;

    const transferPayload = {
      source: 'balance',
      amount: amountKobo,
      recipient: recipientCode,
      reason: transferReason
    };

    const transferResponse = await axios.post(
      'https://api.paystack.co/transfer',
      transferPayload,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    const paystackRef = transferResponse.data.data.reference;

    txn.status = 'released';
    txn.transferReference = paystackRef;
    txn.amountTransferred = txn.amountDue;
    txn.transferStatus = transferResponse.data.data.status;
    txn.paidAt = new Date();
    txn.approvedByAdmin = true;
    txn.transferRecipient = recipientCode;
    await txn.save();

    // ✅ Mark product as sold
    await markProductAsSold(txn, reference, req.io);

    // ✅ FCM + in-app notification
    const title = 'Payment Released by Admin';
    const productTitle = txn.postId?.title || 'product';
    const message = `₦${txn.amountDue.toLocaleString('en-NG')} for "${productTitle}" has been released to your account.`;

    await Notification.create({
      userId: txn.sellerId._id,
      senderId: systemUser._id,
      postId: txn.postId?._id,
      title,
      message,
      type: 'payment_released',
      metadata: {
        transactionId: txn._id,
        reference: paystackRef
      }
    });

    await sendFCMNotification(
      txn.sellerId._id,
      title,
      message,
      {
        type: 'payment_released',
        transactionId: txn._id.toString(),
        reference: paystackRef
      }
    );

    return res.json({
      success: true,
      message: 'Payment released and product marked as sold',
      data: txn
    });

  } catch (err) {
    console.error('[ADMIN PAYOUT ERROR]', err.message, err.stack);
    return res.status(500).json({ success: false, message: 'Error approving payment', error: err.message });
  }
});

router.get('/admin/platform-wallet', verifyToken, async (req, res) => {
  try {
    const { type } = req.query;

    const validTypes = ['commission', 'promotion'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid wallet type specified.' });
    }

    let walletInfo = null;

    // --- Unified Logic to Fetch Wallet from PlatformWallet Collection ---
    // Instead of separate `if/else if` blocks that recalculate commission,
    // we now fetch directly from the PlatformWallet model for both types.
    const platformWalletDoc = await PlatformWallet.findOne({ type });

    if (!platformWalletDoc) {
      // If no wallet document exists for this type yet, return an initial state.
      // This is crucial, as the document might not be created until the first credit.
      walletInfo = {
        type: type,
        balance: 0, // Default to 0 kobo if the document doesn't exist
        lastUpdated: new Date() // Use current time as it's an initial state
      };
    } else {
      // Wallet document exists, return its stored balance (which should be in kobo)
      walletInfo = {
        type: platformWalletDoc.type,
        balance: platformWalletDoc.balance, // Return balance as is (in kobo)
        lastUpdated: platformWalletDoc.lastUpdated,
        // You could also include a subset of transactions if needed:
        // transactions: platformWalletDoc.transactions.slice(-10) // e.g., last 10 transactions
      };
    }

    res.status(200).json({
      success: true,
      wallet: walletInfo
    });

  } catch (err) {
    console.error('[WALLET FETCH ERROR]', err.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve platform wallet info' });
  }
});



router.post('/admin/platform-wallet/withdraw', verifyToken, async (req, res) => {
  const { amount: rawAmount, type } = req.body;
  const amountToWithdrawKobo = parseInt(rawAmount, 10);

  // --- Validate input ---
  if (isNaN(amountToWithdrawKobo) || amountToWithdrawKobo <= 0) {
    console.error(`[WITHDRAWAL VALIDATION FAIL] rawAmount: ${rawAmount}, parsed amountToWithdrawKobo: ${amountToWithdrawKobo}`);
    return res.status(400).json({ error: 'Invalid withdrawal amount: Must be a positive number.' });
  }

  if (!['commission', 'promotion'].includes(type)) {
    return res.status(400).json({ error: 'Invalid wallet type specified.' });
  }

  try {
    const platformWallet = await PlatformWallet.findOne({ type });

    if (!platformWallet || platformWallet.balance < amountToWithdrawKobo) {
      console.error(`[WITHDRAWAL BALANCE FAIL] Wallet balance: ${platformWallet ? platformWallet.balance : 'N/A'}, Attempted withdrawal: ${amountToWithdrawKobo}`);
      return res.status(400).json({ error: `Insufficient ${type} balance.` });
    }

    // --- Ensure recipientCode exists ---
    let recipientCode = process.env.PLATFORM_RECIPIENT_CODE || platformWallet.recipientCode;

    if (!recipientCode) {
      const { PLATFORM_ACCOUNT_NUMBER, PLATFORM_BANK_CODE, PLATFORM_ACCOUNT_NAME, PAYSTACK_SECRET_KEY } = process.env;
      if (!PLATFORM_ACCOUNT_NUMBER || !PLATFORM_BANK_CODE) {
        return res.status(500).json({ error: 'Platform bank details are not configured.' });
      }

      const recipientRes = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: PLATFORM_ACCOUNT_NAME || 'Salmart Technologies',
          account_number: PLATFORM_ACCOUNT_NUMBER,
          bank_code: PLATFORM_BANK_CODE,
          currency: 'NGN'
        },
        {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
        }
      );

      recipientCode = recipientRes.data?.data?.recipient_code;

      if (!recipientCode) {
        return res.status(500).json({ error: 'Paystack did not return a valid recipient_code.' });
      }

      platformWallet.recipientCode = recipientCode;
      await platformWallet.save();
    }

    // --- Initiate Paystack Transfer ---
    const transfer = await axios.post(
      'https://api.paystack.co/transfer',
      {
        source: 'balance',
        amount: amountToWithdrawKobo,
        recipient: recipientCode,
        reason: `Withdrawal of platform ${type}`
      },
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    const reference = transfer?.data?.data?.reference;
    if (!reference) {
      return res.status(500).json({ error: 'Paystack transfer did not return a valid reference.' });
    }

    // --- Update wallet state ---
    platformWallet.balance -= amountToWithdrawKobo;
    platformWallet.lastUpdated = new Date();

    // ✅ Ensure all required transaction fields are included
    const newTransaction = {
      amount: amountToWithdrawKobo,
      reference,
      type: 'debit',
      purpose: `withdraw_${type}`,
      timestamp: new Date()
    };

    console.log('✅ Adding transaction to wallet:', newTransaction);
    platformWallet.transactions.push(newTransaction);
    platformWallet.markModified('transactions');
    await platformWallet.save();

    return res.status(200).json({
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} withdrawal successful`,
      transferReference: reference
    });

  } catch (err) {
    if (err.name === 'ValidationError') {
      console.error(`[WITHDRAW ${type.toUpperCase()} VALIDATION ERROR]`, err.message);
      for (let field in err.errors) {
        console.error(`  - Field: ${field}, Message: ${err.errors[field].message}`);
      }
      return res.status(400).json({
        error: 'Validation failed',
        details: err.message
      });
    } else {
      console.error(`[WITHDRAW ${type.toUpperCase()} ERROR]`, err.response?.data || err.message);
      return res.status(500).json({
        error: 'Paystack transfer failed or unexpected error',
        details: err.response?.data?.message || err.message
      });
    }
  }
});




router.get('/admin/platform-wallet/transactions', verifyToken, async (req, res) => {
  const { type } = req.query;
  if (!type || !['commission', 'promotion'].includes(type)) {
    return res.status(400).json({ error: 'Invalid wallet type.' });
  }

  const wallet = await PlatformWallet.findOne({ type }).populate('userId productId');
  if (!wallet) {
    return res.json({ transactions: [] });
  }

  res.json({ transactions: wallet.transactions });
});


router.post('/api/admin/refunds/:id/:action', verifyToken, async (req, res) => {
  try {
    const { id, action } = req.params;

    const refund = await RefundRequests.findOne({ transactionId: id }).populate('transactionId buyerId sellerId description');
    if (!refund) {
      return res.status(404).json({ success: false, message: 'Refund request not found' });
    }

    const transaction = await Transaction.findById(refund.transactionId);
    if (!transaction || !transaction.paymentReference) {
      return res.status(404).json({ success: false, message: 'Related transaction not found or missing payment reference' });
    }

    const buyerId = refund.buyerId?._id || transaction.buyerId;
    const postId = refund.description?._id || transaction.postId;
    const amount = transaction.amount || 0;
    const productTitle = refund.description?.title || 'product';

    const systemUser = await User.findOne({ isSystemUser: true });
    if (!systemUser) {
      console.error('[SYSTEM USER NOT FOUND]');
      return res.status(500).json({ error: 'System user not found' });
    }

    if (action === 'approve') {
      // Calculate Paystack fees
      let paystackFee = (1.5 / 100) * amount;
      if (amount > 2500) paystackFee += 100;
      if (paystackFee > 2000) paystackFee = 2000;

      const refundAmount = Math.round((amount - paystackFee) * 100); // In Kobo

      try {
        const refundResponse = await axios.post(
          'https://api.paystack.co/refund',
          {
            transaction: transaction.paymentReference,
            amount: refundAmount
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const refundData = refundResponse.data.data;

        // Update DB
        refund.status = 'refunded';
        refund.adminComment = 'Refund approved and processed';
        await refund.save();

        transaction.status = 'refunded';
        transaction.refundedAt = new Date();
        transaction.refundReference = refundData?.refund_reference || 'manual';
        transaction.refundStatus = refundData?.status || 'initiated';
        await transaction.save();

        // Notify Buyer
        await Notification.create({
          userId: buyerId,
          senderId: systemUser._id,
          postId,
          title: 'Refund Approved',
          message: `₦${(amount - paystackFee).toLocaleString('en-NG')} has been refunded for your purchase of "${productTitle}".`,
          type: 'refund_processed',
          metadata: {
            refundId: refund._id,
            transactionId: transaction._id,
            amount: amount - paystackFee,
            reference: transaction.refundReference
          }
        });

        await sendFCMNotification(
          buyerId,
          'Refund Approved',
          `₦${(amount - paystackFee).toLocaleString('en-NG')} refunded for "${productTitle}".`,
          {
            type: 'refund_processed',
            refundId: refund._id.toString(),
            transactionId: transaction._id.toString(),
            amount: amount - paystackFee,
            reference: transaction.refundReference
          }
        );

        return res.status(200).json({
          success: true,
          message: 'Refund approved and processed via Paystack',
          data: refundData
        });

      } catch (paystackErr) {
        console.error('[PAYSTACK REFUND ERROR]', paystackErr.response?.data || paystackErr.message);
        return res.status(500).json({
          success: false,
          message: 'Refund failed on Paystack',
          error: paystackErr.response?.data?.message || paystackErr.message
        });
      }

    } else if (action === 'deny') {
      refund.status = 'rejected';
      refund.adminComment = 'Refund denied by admin';
      await refund.save();

      await Notification.create({
        userId: buyerId,
        senderId: systemUser._id,
        postId,
        title: 'Refund Denied',
        message: `Your refund request for "${productTitle}" was denied by admin.`,
        type: 'refund_rejected',
        metadata: {
          refundId: refund._id,
          transactionId: transaction._id
        }
      });

      await sendFCMNotification(
        buyerId,
        'Refund Denied',
        `Your refund request for "${productTitle}" was rejected.`,
        {
          type: 'refund_rejected',
          refundId: refund._id.toString(),
          transactionId: transaction._id.toString(),
        }
      );

      return res.status(200).json({ success: true, message: 'Refund request denied' });
    }

    return res.status(400).json({ success: false, message: 'Invalid action' });

  } catch (err) {
    console.error('[ADMIN REFUND ERROR]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


  return router;
};