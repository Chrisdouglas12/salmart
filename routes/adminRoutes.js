const express = require('express')
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/userSchema.js');
const Transaction = require('../models/transactionSchema');
const Post = require('../models/postSchema');
const Admin = require('../models/adminSchema.js')
const Refund = require('../models/refundSchema.js')
const Report = require('../models/reportSchema.js')
const Payout = require('../models/payoutSchema.js')
const verifyToken = require('../middleware/auths.js')
const Notification = require('../models/notificationSchema.js')
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js')

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

router.get('/api/admin/users', verifyToken, async (req, res) => {
  try {
    const users = await User.find().select('firstName lastName email profilePicture createdAt isBanned').sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    console.error('Fetch users error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

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

router.get('/api/admin/users/banned', verifyToken, async (req, res) => {
  try {
    const bannedUsers = await User.find({ isBanned: true }).select('firstName lastName email profilePicture createdAt').sort({ createdAt: -1 });
    res.status(200).json(bannedUsers);
  } catch (error) {
    console.error('Fetch banned users error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

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

router.get('/api/admin/transactions', verifyToken, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('buyerId', 'firstName lastName email')
      .populate('sellerId', 'firstName lastName email')
      .populate('productId', 'description')
      .select('buyerId sellerId productId amount status createdAt refundRequested paymentReference')
      .sort({ createdAt: -1 });
    res.status(200).json(transactions);
  } catch (error) {
    console.error('Fetch transactions error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/api/admin/refunds/:id/:action', verifyToken, async (req, res) => {
  try {
    const { id, action } = req.params;
    const transaction = await Transaction.findById(id);
    if (!transaction || !transaction.refundRequested) {
      return res.status(404).json({ success: false, message: 'Refund request not found' });
    }

    if (action === 'approve') {
      transaction.status = 'refunded';
      transaction.refundRequested = false;
    } else if (action === 'deny') {
      transaction.refundRequested = false;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    await transaction.save();
    res.status(200).json({ success: true, message: `Refund ${action}d successfully` });
  } catch (error) {
    console.error('Resolve refund error:', error.message);
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

router.post('/admin/resolve-report', verifyToken, async (req, res) => {
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
      .populate('relatedPost', 'description photo')
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
      status: 'awaiting_admin_review' 
    })
      .populate('postId', 'title images')
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
    }).populate('postId');

    if (!txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (txn.status !== 'awaiting_admin_review') {
      return res.status(400).json({ success: false, message: 'Transaction not in reviewable state' });
    }

    txn.status = 'in_escrow';
    txn.paidAt = new Date();
    txn.approvedByAdmin = true;
    await txn.save();

    // Mark product as sold
    await markProductAsSold(txn, reference, req.io);

    res.json({ success: true, message: 'Transaction approved and product marked as sold', data: txn });

  } catch (err) {
    logger.error('[ADMIN APPROVAL] Error approving txn:', err);
    res.status(500).json({ success: false, message: 'Error approving payment' });
  }
});


// Export router as a function that accepts io
module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    next();
  });
  return router;
};