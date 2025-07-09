const express = require('express')
const mongoose = require('mongoose');
const router = express.Router();
const axios = require('axios')
const User = require('../models/userSchema.js');
const Transaction = require('../models/transactionSchema');
const Post = require('../models/postSchema');
const Admin = require('../models/adminSchema.js')
const RefundRequests = require('../models/refundSchema.js')
const Report = require('../models/reportSchema.js')
 const Payout = require('../models/payoutSchema.js')
const verifyToken = require('../middleware/auths.js')
const Notification = require('../models/notificationSchema.js')
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js')
const winston = require('winston');

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
  
//Endpoint to register admin
router.post('/admin/register', async (req, res) => {
  try {
    const { name, email, password, adminCode } = req.body;
    if (adminCode !== process.env.SECRET_ADMIN_CODE) {
      return res.status(403).json({ success: false, message: 'Invalid admin code' });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ name, email, password: hashedPassword });
    await admin.save();
    res.status(201).json({ success: true, message: 'Admin registered successfully' });
  } catch (error) {
    console.error('Admin register error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign({ adminId: admin._id }, process.env.JWT_SECRET || 'ghgh6rrjrfhteldwb', { expiresIn: '1w' });
    res.status(200).json({ success: true, token, message: 'Login successful' });
  } catch (error) {
    console.error('Admin login error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
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


// Admin Routes
router.get('/api/admin/refunds', async (req, res) => {
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

router.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find().select('firstName lastName email profilePicture createdAt isBanned').sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    console.error('Fetch users error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/api/admin/users/:id/ban', async (req, res) => {
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

router.get('/api/admin/users/banned', async (req, res) => {
  try {
    const bannedUsers = await User.find({ isBanned: true }).select('firstName lastName email profilePicture createdAt').sort({ createdAt: -1 });
    res.status(200).json(bannedUsers);
  } catch (error) {
    console.error('Fetch banned users error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/api/admin/users/:id/unban', async (req, res) => {
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

router.get('/api/admin/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('buyerId', 'firstName lastName email')
      .populate('sellerId', 'firstName lastName email')
      .populate('postId', 'title')
      .select('buyerId sellerId postId amount status createdAt refundRequested paymentReference')
      .sort({ createdAt: -1 });
    res.status(200).json(transactions);
  } catch (error) {
    console.error('Fetch transactions error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



router.post('/api/admin/refunds/:id/:action', async (req, res) => {
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

    if (action === 'approve') {
      // Call Paystack refund
      try {
        const refundResponse = await axios.post(
          'https://api.paystack.co/refund',
          {
            transaction: transaction.paymentReference,
            amount: Math.round(amount * 100) // In kobo
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

        // Save in-app notification
        await Notification.create({
          userId: buyerId,
          senderId: null,
          postId,
          title: 'Refund Approved',
          message: `₦${amount.toLocaleString('en-NG')} has been refunded for your purchase of "${productTitle}".`,
          type: 'refund_processed',
          metadata: {
            refundId: refund._id,
            transactionId: transaction._id,
            amount,
            reference: transaction.refundReference
          }
        });

        // Send FCM notification
        await sendFCMNotification(
          buyerId,
          'Refund Approved',
          `₦${amount.toLocaleString('en-NG')} refunded for "${productTitle}".`,
          {
            type: 'refund_processed',
            refundId: refund._id.toString(),
            transactionId: transaction._id.toString(),
            amount,
            reference: transaction.refundReference,
            senderId: null,
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
          transactionId: transaction._id.toString()
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
//Get reported users
router.get('/api/reported-users', async (req, res) => {
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

router.post('/admin/resolve-report', async (req, res) => {
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
router.get('/admin/reports/pending', async (req, res) => {
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
router.get('/admin/transactions/pending', async (req, res) => {
  try {
    const pendingTxns = await Transaction.find({
  status: { $in: ['confirmed_pending_payout', 'in_escrow'] }
})
.populate('postId', 'title photo')
.populate('buyerId', 'firstName lastName email')
.sort({ createdAt: -1 });

res.json({ success: true, data: pendingTxns });
  } catch (err) {
    logger.error('[ADMIN TXNS] Error fetching pending txns:', err);
    res.status(500).json({ success: false, message: 'Error loading transactions' });
  }
});

// POST /api/admin/approve-payment
router.post('/admin/approve-payment', async (req, res) => {
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

    // Fallbacks
    if (!txn.transferRecipient && txn.sellerId?.transferRecipientCode) {
      txn.transferRecipient = txn.sellerId.transferRecipientCode;
    }

    if (typeof txn.amountDue !== 'number' || txn.amountDue <= 0) {
      txn.amountDue = txn.amount - (txn.platformCommission || 0);
      await txn.save();
    }

    // Final safety checks
    if (!txn.sellerId || !txn.transferRecipient || typeof txn.amountDue !== 'number') {
      return res.status(400).json({ success: false, message: 'Missing seller or transfer details' });
    }

    const amountKobo = Math.round(txn.amountDue * 100);
    const transferReason = `Manual payout for: ${txn.postId?.title || 'Product'}`;

    const transferPayload = {
      source: 'balance',
      amount: amountKobo,
      recipient: txn.transferRecipient,
      reason: transferReason
    };

    const transferResponse = await axios.post(
      'https://api.paystack.co/transfer',
      transferPayload,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    const paystackData = transferResponse.data.data;
    const paystackRef = paystackData.reference || paystackData.transfer_code;

    txn.status = 'released';
    txn.transferReference = paystackRef;
    txn.amountTransferred = txn.amountDue;
    txn.transferStatus = paystackData.status;
    txn.transferStatusMessage = paystackData.message || '';
    txn.dateReleased = new Date();
    txn.paidAt = new Date();
    txn.approvedByAdmin = true;
    await txn.save();

    // Mark product as sold (emit socket event)
    await markProductAsSold(txn, reference, req.io);

    // === Notification + FCM ===
    const title = 'Payment Released by Admin';
    const productTitle = txn.postId?.title || 'product';
    const message = `₦${txn.amountDue.toLocaleString('en-NG')} for "${productTitle}" has been released to your account.`;

    await Notification.create({
      userId: txn.sellerId._id,
      senderId: txn.buyerId?._id || 'salmart',
      postId: txn.postId?._id,
      title,
      message,
      type: 'payment_released',
      metadata: {
        transactionId: txn._id,
        amountTransferred: txn.amountDue,
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
        amountTransferred: txn.amountDue,
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
    return res.status(500).json({
      success: false,
      message: 'Error approving payment',
      error: err.message
    });
  }
});


  return router;
};