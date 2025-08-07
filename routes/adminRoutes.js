const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const User = require('../models/userSchema.js');
const PlatformWallet = require('../models/platformWallet.js');
const Transaction = require('../models/transactionSchema');
const Post = require('../models/postSchema');
const Admin = require('../models/adminSchema.js');
const RefundRequests = require('../models/refundSchema.js');
const Report = require('../models/reportSchema.js');
const Payout = require('../models/payoutSchema.js');
const Payment = require('../models/paymentSchema.js');
const verifyToken = require('../middleware/auths.js');
const Notification = require('../models/notificationSchema.js');
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
const winston = require('winston');

const paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);

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


const JWT_SECRET = process.env.JWT_SECRET;
const SECRET_ADMIN_CODE = process.env.SECRET_ADMIN_CODE;

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


module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    next();
  });

  // --- Utility Functions ---
  async function markProductAsSold(txn, reference, io) {
    if (!txn || !txn.postId) return;
  
    try {
      await Post.findByIdAndUpdate(txn.postId._id || txn.postId, {
        status: 'sold',
        soldAt: new Date()
      });
  
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


  // --- Admin Authentication Routes ---
  
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


  // Admin Registration
  router.post('/admin/register', upload.single('profilePicture'), async (req, res) => {
    const { firstName, lastName, email, password, adminCode } = req.body;
    console.log("Expected ADMIN CODE:", SECRET_ADMIN_CODE);
    try {
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


  // Admin Login
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


  // Get current admin details
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


  // --- User Management Routes ---
  
// Get all users
router.get('/api/admin/users', verifyToken, async (req, res) => {
  try {
    const users = await User.find().select(
      'firstName lastName email profilePicture phoneNumber isVerified state city followers following blockedUsers interests createdAt updatedAt viewCount reportCount isReported isBanned isAdmin isSystemUser notificationPreferences fcmTokens notificationEnabled paystack bankDetails'
    ).sort({ createdAt: -1 });

    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error('Fetch users error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



  // Ban a user
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


  // Get all banned users
  router.get('/api/admin/users/banned', verifyToken, async (req, res) => {
    try {
      const bannedUsers = await User.find({ isBanned: true }).select('firstName lastName email profilePicture createdAt').sort({ createdAt: -1 });
      res.status(200).json(bannedUsers);
    } catch (error) {
      console.error('Fetch banned users error:', error.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });


  // Unban a user
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


  // Get reported users (all pending)
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


  // Resolve a report
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


  // Get all pending reports
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


  // --- Promotion Route ---
  
  // Promote a post
  router.post('/admin/promote-post', verifyToken, async (req, res) => {
    try {
      const { postId, durationDays } = req.body;
      
  
      if (!postId || !durationDays || durationDays < 1) {
        return res.status(400).json({ success: false, message: 'Post ID and a valid duration (in days) are required.' });
      }
  
      const post = await Post.findById(postId).populate('createdBy');
      if (!post) {
        return res.status(404).json({ success: false, message: 'Post not found.' });
      }
  
      const postOwnerId = post.createdBy._id;
  
      const payment = new Payment({
        userId: postOwnerId,
        postId: post._id,
        amount: 0,
        status: 'manual',
        promotedByAdmin: true,
        durationDays: durationDays,
        createdAt: new Date(),
      });
      await payment.save();
  
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + durationDays);
  
      post.isPromoted = true;
      post.promotionDetails = {
        startDate,
        endDate,
        durationDays,
        amountPaid: 0,
        paymentReference: 'ADMIN_PROMOTION',
        promotedAt: new Date(),
      };
      await post.save();
  
      const notificationTitle = 'Your post has been promoted!';
      const notificationMessage = `An admin has manually promoted your post "${post.title}" for ${durationDays} days.`;
  
      const systemUser = await User.findOne({ isSystemUser: true });
      if (systemUser) {
          await Notification.create({
              userId: postOwnerId,
              senderId: systemUser._id,
              postId: post._id,
              title: notificationTitle,
              message: notificationMessage,
              type: 'admin_promotion',
              metadata: {
                  paymentId: payment._id,
                  promotedByAdminId: adminId
              }
          });
      }
      
      logger.info(`Post manually promoted by admin`, {
        postId: post._id.toString(),
        adminId,
        durationDays,
        postOwnerId: postOwnerId.toString()
      });
  
      res.status(200).json({
        success: true,
        message: `Post "${post.title}" successfully promoted for ${durationDays} days.`,
        promotionDetails: post.promotionDetails
      });
  
    } catch (error) {
      logger.error('Error promoting post by admin:', error.message, {
        stack: error.stack,
        requestBody: req.body
      });
      res.status(500).json({ success: false, message: 'Server error occurred during promotion.' });
    }
  });

// Delete a post by Admin
router.delete('/admin/posts/:postId', verifyToken, async (req, res) => {
  try {
    
    const { postId } = req.params;

    

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    await Post.findByIdAndDelete(postId);

    logger.info(`Post deleted by admin`, {
      postId: postId,
      adminId
    });

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully.'
    });

  } catch (error) {
    logger.error('Error deleting post by admin:', error.message, {
      stack: error.stack,
      postId: req.params.postId
    });
    res.status(500).json({ success: false, message: 'Server error occurred during post deletion.' });
  }
});


// GET /api/admin/posts - Get all posts with pagination and filtering
router.get('/api/admin/posts', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, postType, category } = req.query;

    const query = {};
    if (status) query.status = status;
    if (postType) query.postType = postType;
    if (category) query.category = category;

    const posts = await Post.find(query)
      .populate('createdBy.userId', 'firstName lastName email profilePicture')
      .populate('reports.reportId', 'reason reportedBy')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalPosts = await Post.countDocuments(query);

    res.status(200).json({
      success: true,
      totalPosts,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalPosts / limit),
      posts,
    });
  } catch (error) {
    console.error('Fetch all posts for admin error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/posts/:id - Get a single post by ID
router.get('/api/admin/posts/:id', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('createdBy.userId', 'firstName lastName email profilePicture')
      .populate('reports.reportId', 'reason reportedBy');

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    res.status(200).json({ success: true, post });
  } catch (error) {
    console.error('Fetch single post for admin error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

  return router;
};
