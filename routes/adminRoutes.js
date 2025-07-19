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

// handle refunds requests
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

    const systemUser = await User.findOne({ isSystemUser: true });
    if (!systemUser) {
      logger.error('[SYSTEM USER NOT FOUND]');
      return res.status(500).json({ error: 'System user not found' });
    }

    const buyerId = refund.buyerId?._id || transaction.buyerId;
    const postId = refund.description?._id || transaction.postId;
    const amount = transaction.amount || 0;
    const productTitle = refund.description?.title || 'product';

    if (action === 'approve') {
      try {
        // ➕ Calculate Paystack fees (1.5% + ₦100 if amount > ₦2500)
        const paystackPercentage = 0.015;
        const flatFee = amount > 2500 ? 100 : 0;
        const percentageFee = Math.min(amount * paystackPercentage, 2000);
        const paystackFee = percentageFee + flatFee;

        // ➖ Refund only what you truly received
        const refundAmount = amount - paystackFee;

        // 🔄 Call Paystack API for refund with adjusted amount
        const refundResponse = await axios.post(
          'https://api.paystack.co/refund',
          {
            reference: transaction.paymentReference,
            amount: Math.round(refundAmount * 100) // convert to kobo
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const refundData = refundResponse.data.data;

        // Update refund & transaction records
        refund.status = 'refunded';
        refund.adminComment = 'Refund approved and processed (minus gateway fees)';
        await refund.save();

        transaction.status = 'refunded';
        transaction.refundedAt = new Date();
        transaction.refundReference = refundData?.refund_reference || 'manual';
        transaction.refundStatus = refundData?.status || 'initiated';
        await transaction.save();

        // Notify buyer
        const title = 'Refund Approved';
        const message = `We’ve refunded ₦${refundAmount.toLocaleString('en-NG')} for your purchase of "${productTitle}", after deducting gateway processing fees.`;

        await Notification.create({
          userId: buyerId,
          senderId: systemUser._id,
          postId,
          title,
          message,
          type: 'refund_processed',
          metadata: {
            refundId: refund._id,
            transactionId: transaction._id,
            amount: refundAmount,
            reference: transaction.refundReference
          }
        });

        await sendFCMNotification(
          buyerId,
          title,
          message,
          {
            type: 'refund_processed',
            refundId: refund._id.toString(),
            transactionId: transaction._id.toString(),
            amount: refundAmount,
            reference: transaction.refundReference,
            senderId: null
          }
        );

        return res.status(200).json({
          success: true,
          message: 'Refund approved and processed via Paystack (minus fees)',
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

      const title = 'Refund Denied';
      const message = `Your refund request for "${productTitle}" was denied after our review. If you have any concerns or wish to appeal, please contact us via email.`;

      await Notification.create({
        userId: buyerId,
        senderId: systemUser._id,
        postId,
        title,
        message,
        type: 'refund_rejected',
        metadata: {
          refundId: refund._id,
          transactionId: transaction._id
        }
      });

      await sendFCMNotification(
        buyerId,
        title,
        message,
        {
          type: 'refund_rejected',
          refundId: refund._id.toString(),
          transactionId: transaction._id.toString(),
          senderId: null
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
.populate('postId', 'title', 'photo')
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

    if (!type || (type !== 'commission' && type !== 'promotion')) {
      return res.status(400).json({ error: 'Invalid wallet type specified.' });
    }

    let totalAmount = 0;

    // Match frontend commission tiers
    function getCommissionRate(amount) {
      if (amount < 10000) return 3.5;
      if (amount < 50000) return 3;
      if (amount < 200000) return 2.5;
      return 1;
    }

    if (type === 'commission') {
      const transactions = await Transaction.find({ status: 'released' });

      transactions.forEach(tx => {
        const amount = tx.amount || 0;

        // Paystack fee: 1.5% + ₦100 (capped at ₦2000)
        let paystackFee = (1.5 / 100) * amount + 100;
        if (paystackFee > 2000) paystackFee = 2000;

        const amountAfterPaystack = amount - paystackFee;

        const commissionPercent = getCommissionRate(amount);
        const commissionNaira = (commissionPercent / 100) * amountAfterPaystack;

        totalAmount += commissionNaira;
      });

    } else if (type === 'promotion') {
      const promos = await Payment.find({ status: 'success' });

      promos.forEach(promo => {
        const amount = promo.amount || 0;

        // Paystack fee: 1.5% + ₦100 (capped at ₦2000)
        let paystackFee = (1.5 / 100) * amount + 100;
        if (paystackFee > 2000) paystackFee = 2000;

        const netAmount = amount - paystackFee;
        totalAmount += netAmount;
      });
    }

    res.json({
      balance: parseFloat((totalAmount / 100).toFixed(2)), // Kobo to Naira
      lastUpdated: new Date()
    });

  } catch (err) {
    console.error('[WALLET FETCH ERROR]', err.message);
    res.status(500).json({ error: 'Failed to retrieve platform wallet info' });
  }
});


router.post('/admin/platform-wallet/withdraw', verifyToken, async (req, res) => {
  const { amount, type } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid withdrawal amount' });
  }

  if (!['commission', 'promotion'].includes(type)) {
    return res.status(400).json({ error: 'Invalid wallet type specified' });
  }

  const amountKobo = Math.round(amount * 100); // 💡 Work strictly in Kobo
  const platformWallet = await PlatformWallet.findOne({ type });

  if (!platformWallet || platformWallet.balance < amountKobo) {
    return res.status(400).json({ error: `Insufficient ${type} balance` });
  }

  try {
    // Check for existing or create new recipient code
    let recipientCode = process.env.PLATFORM_RECIPIENT_CODE || platformWallet.recipientCode;

    if (!recipientCode) {
      const platformAccountNumber = process.env.PLATFORM_ACCOUNT_NUMBER;
      const platformBankCode = process.env.PLATFORM_BANK_CODE;
      const platformAccountName = process.env.PLATFORM_ACCOUNT_NAME || 'Salmart Technologies';

      if (!platformAccountNumber || !platformBankCode) {
        return res.status(500).json({ error: 'Platform account details are not set' });
      }

      const recipientRes = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: platformAccountName,
          account_number: platformAccountNumber,
          bank_code: platformBankCode,
          currency: 'NGN'
        },
        {
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
        }
      );

      recipientCode = recipientRes.data.data.recipient_code;

      if (!recipientCode) {
        return res.status(500).json({ error: 'Paystack did not return a recipient_code' });
      }

      platformWallet.recipientCode = recipientCode;
      await platformWallet.save();
    }

    // Paystack Transfer
    const transfer = await axios.post(
      'https://api.paystack.co/transfer',
      {
        source: 'balance',
        amount: amountKobo,
        recipient: recipientCode,
        reason: `Withdrawal of platform ${type}`
      },
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    // Update wallet balance (deduct Kobo)
    platformWallet.balance -= amountKobo;
    platformWallet.lastUpdated = new Date();
    platformWallet.transactions.push({
      amount: amountKobo,
      reference: transfer.data.data.reference,
      type: 'debit',
      purpose: `withdraw_${type}`,
      timestamp: new Date()
    });

    await platformWallet.save();

    res.status(200).json({
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} withdrawal successful`,
      transferReference: transfer.data.data.reference
    });

  } catch (err) {
    console.error(`[WITHDRAW ${type.toUpperCase()} ERROR]`, err.response?.data || err.message);
    res.status(500).json({
      error: 'Paystack transfer failed',
      details: err.response?.data?.message || err.message
    });
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

module.exports = router;


  return router;
};