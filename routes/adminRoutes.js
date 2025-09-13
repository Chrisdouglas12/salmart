const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const User = require('../models/userSchema.js');
const PlatformWallet = require('../models/platformWallet.js');
const Transaction = require('../models/transactionSchema');
const Post = require('../models/postSchema');
const Visit = require('../models/visitSchema.js')
const Admin = require('../models/adminSchema.js');
const RefundRequests = require('../models/refundSchema.js');
const Report = require('../models/reportSchema.js');
const Payout = require('../models/payoutSchema.js');
const Payment = require('../models/paymentSchema.js');
const verifyAdmin = require('../middleware/verifyAdmin.js');
const Notification = require('../models/notificationSchema.js');
const NotificationService = require('../services/notificationService.js');
const { sendNotificationToUser } = require('../services/notificationUtils.js');
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

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'Zoho', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
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


// Admin Login - Fixed
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
      { id: admin._id }, // ✅ Use "id" to match middleware expectation
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '2d' }
    );

    res.json({ 
      success: true, 
      token, 
      message: 'Login successful',
      admin: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        profilePicture: admin.profilePicture
      }
    });
  } catch (err) {
    console.error('[ADMIN LOGIN ERROR]', err.message);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});


// Fixed Admin Routes

// ✅ Fixed: Get current admin details
router.get('/admin/me', verifyAdmin, async (req, res) => {
  try {
    // req.user is already the full admin object from middleware
    const admin = req.user;
    res.status(200).json({ 
      success: true, 
      admin: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        profilePicture: admin.profilePicture,
        adminCode: admin.adminCode,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('Get admin details error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ Fixed: Resolve a report
router.post('/admin/resolve-report', verifyAdmin, async (req, res) => {
  try {
    const { reportId, action, adminNotes } = req.body;
    const adminId = req.user._id; // ✅ Correct admin ID

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
    res.status(200).json({ 
      success: true, 
      message: `Report resolved with action: ${action}`, 
      report 
    });
  } catch (error) {
    console.error('Resolve report error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


  // --- User Management Routes ---
  
// Get all users
router.get('/api/admin/users', async (req, res) => {
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
  router.post('/api/admin/users/:id/ban', verifyAdmin, async (req, res) => {
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
  router.get('/api/admin/users/banned', verifyAdmin, async (req, res) => {
    try {
      const bannedUsers = await User.find({ isBanned: true }).select('firstName lastName email profilePicture createdAt').sort({ createdAt: -1 });
      res.status(200).json(bannedUsers);
    } catch (error) {
      console.error('Fetch banned users error:', error.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });


  // Unban a user
  router.post('/api/admin/users/:id/unban', verifyAdmin, async (req, res) => {
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
  router.get('/api/reported-users', verifyAdmin, async (req, res) => {
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





  // Get all pending reports
  router.get('/admin/reports/pending', verifyAdmin, async (req, res) => {
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
  
// Updated Promote Post Endpoint for Admin
router.post('/admin/promote-post', verifyAdmin, async (req, res) => {
  try {
    console.log('🚀 Starting post promotion...');
    console.log('📝 Request body:', req.body);

    const { postId, durationDays } = req.body;
    const adminId = req.user._id;

    if (!postId || !durationDays || durationDays < 1) {
      return res.status(400).json({
        success: false,
        message: 'Post ID and a valid duration (in days) are required.'
      });
    }

    const post = await Post.findById(postId).populate('createdBy.userId');
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    // Get the post owner ID
    let postOwnerId;
    if (post.createdBy?.userId) {
      postOwnerId = post.createdBy.userId._id || post.createdBy.userId;
    } else if (post.createdBy?._id) {
      postOwnerId = post.createdBy._id;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid post owner information.' });
    }

    // Admin promotions skip payment record creation
    console.log('ℹ️ Admin promotion - skipping payment record');
    const paymentId = null;

    // Promotion dates
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + parseInt(durationDays));

    // Update post with promotion details
    post.isPromoted = true;
    post.promotionDetails = {
      startDate,
      endDate,
      durationDays: parseInt(durationDays),
      amountPaid: 0, // Free for admin
      paymentReference: `ADMIN_${Date.now()}`,
      promotedAt: new Date(),
      promotedByAdmin: true
    };
    
    await post.save();

    // Create notification and send push notification - following the exact pattern
    const systemUser = await User.findOne({ isSystemUser: true });
    if (systemUser) {
      const notification = new Notification({
        userId: postOwnerId,
        senderId: systemUser._id,
        postId: post._id,
        title: 'Your post has been promoted!',
        message: `Cheers! you have recieved free promotion for your post "${post.title}" for ${durationDays} day(s).`,
        type: 'admin_promotion',
        metadata: {
          paymentId: paymentId,
          promotedByAdminId: adminId
        }
      });

      await notification.save();
      logger.info(`Created promotion notification for user ${postOwnerId} for post ${post._id}`);

      // Send push notification - exact same pattern as like notification
      await sendNotificationToUser(
        postOwnerId.toString(),
        'Post Promoted!',
        `Cheers! you have recieved free promotion for your post "${post.title}" for ${durationDays} day(s).`,
        { type: 'admin_promotion', postId: post._id.toString() },
        req.io
      );

      // Update notification count - exact same pattern as like notification
      await NotificationService.triggerCountUpdate(req.io, postOwnerId.toString());
    }

    logger.info(`Post manually promoted by admin`, {
      postId: post._id.toString(),
      adminId: adminId.toString(),
      durationDays: parseInt(durationDays),
      postOwnerId: postOwnerId.toString()
    });

    res.status(200).json({
      success: true,
      message: `Post "${post.title}" successfully promoted for ${durationDays} days.`,
      promotionDetails: post.promotionDetails
    });

  } catch (error) {
    console.log('💥 Error in post promotion:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during promotion.'
    });
  }
});

// Fixed Delete Post Endpoint
router.delete('/admin/posts/:postId', verifyAdmin, async (req, res) => {
  try {
    const { postId } = req.params;
    const adminId = req.user._id; // ✅ MongoDB ObjectId
    


    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found.' 
      });
    }

    await Post.findByIdAndDelete(postId);

    logger.info(`Post deleted by admin`, {
      postId: postId,
      adminId: adminId.toString() // ✅ Now properly defined
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
    res.status(500).json({ 
      success: false, 
      message: 'Server error occurred during post deletion.' 
    });
  }
});

// Fixed Frontend - Update token consistency
async function resolveAction(endpoint, btn, elementId, formatter, actionType = 'default', reportId = null, additionalData = {}) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<div class="loading"></div><span>Processing...</span>';
  const token = localStorage.getItem('authToken'); // ✅ Consistent token key

  try {
    let options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(additionalData)
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.message || 'Action failed');
    }

    showAlert(data.message || 'Action successful!', 'success');

    // Rest of the function remains the same...
    
  } catch (error) {
    console.error('Action error:', error);
    showAlert(`Action failed: ${error.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = `<span>${originalText}</span>`;
  }
}


// GET /api/admin/posts - Get all posts with pagination and filtering
router.get('/api/admin/posts', verifyAdmin, async (req, res) => {
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
router.get('/api/admin/posts/:id', verifyAdmin, async (req, res) => {
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

//manual route to trigger verification reminders (for testing)
router.post('/admin/send-verification-reminders', async (req, res) => {
  try {
    console.log('🔧 Manual verification reminder job triggered');
    await sendVerificationReminders();
    res.json({ 
      success: true, 
      message: 'Verification reminder job completed successfully' 
    });
  } catch (error) {
    console.error('Manual verification reminder error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send verification reminders',
      error: error.message 
    });
  }
});

// 6. Add route to get unverified users stats (for monitoring)
router.get('/admin/unverified-stats', async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $match: { isVerified: false }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          needingReminders: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$createdAt', new Date(Date.now() - 6 * 60 * 60 * 1000)] },
                    { $lt: [{ $ifNull: ['$verificationReminderCount', 0] }, 5] }
                  ]
                },
                1,
                0
              ]
            }
          },
          maxRemindersReached: {
            $sum: {
              $cond: [
                { $gte: [{ $ifNull: ['$verificationReminderCount', 0] }, 5] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const result = stats[0] || { total: 0, needingReminders: 0, maxRemindersReached: 0 };
    
    res.json({
      success: true,
      stats: {
        totalUnverified: result.total,
        needingReminders: result.needingReminders,
        maxRemindersReached: result.maxRemindersReached,
        lastJobRun: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Unverified stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get stats' 
    });
  }
});

// Rate limiting for visit tracking (add after your existing imports)
const visitLimiter = {
  visits: new Map(),
  
  isAllowed(ip) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxVisits = 5;
    
    if (!this.visits.has(ip)) {
      this.visits.set(ip, []);
    }
    
    const visits = this.visits.get(ip);
    const recentVisits = visits.filter(time => now - time < windowMs);
    
    if (recentVisits.length >= maxVisits) {
      return false;
    }
    
    recentVisits.push(now);
    this.visits.set(ip, recentVisits);
    return true;
  }
};

// Helper function to detect device type
function getDeviceType(userAgent) {
  if (!userAgent) return 'Unknown';
  
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'Mobile';
  if (ua.includes('tablet') || ua.includes('ipad')) return 'Tablet';
  if (ua.includes('windows') || ua.includes('mac') || ua.includes('linux')) return 'Desktop';
  
  return 'Other';
}

// Helper function to detect bots
function isBot(userAgent) {
  if (!userAgent) return false;
  
  const botPatterns = [
    'bot', 'crawler', 'spider', 'scraper', 'facebook', 'twitter',
    'google', 'bing', 'yahoo', 'baidu', 'yandex', 'duckduckbot'
  ];
  
  return botPatterns.some(pattern => userAgent.toLowerCase().includes(pattern));
}

// Helper function to send admin notification email
async function sendVisitNotificationEmail(visitData) {
  const emailHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { 
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                color: white; 
                padding: 25px; 
                border-radius: 10px 10px 0 0; 
                text-align: center;
            }
            .header h2 { margin: 0; font-size: 24px; }
            .header .emoji { font-size: 30px; margin-bottom: 10px; }
            .content { 
                background: #f8f9fa; 
                padding: 25px; 
                border-radius: 0 0 10px 10px; 
                border: 1px solid #e9ecef;
            }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            .info-box { 
                background: white; 
                padding: 15px; 
                border-radius: 8px; 
                border-left: 4px solid #28a745; 
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            .info-box.full-width { grid-column: 1 / -1; }
            .label { font-weight: 600; color: #28a745; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
            .value { margin-top: 5px; font-size: 14px; word-break: break-all; }
            .stats-row { display: flex; justify-content: space-between; margin: 20px 0; }
            .stat { text-align: center; }
            .stat-number { font-size: 24px; font-weight: bold; color: #28a745; }
            .stat-label { font-size: 12px; color: #666; }
            .footer { 
                text-align: center; 
                margin-top: 20px; 
                padding-top: 20px; 
                border-top: 1px solid #ddd; 
                color: #666; 
                font-size: 12px; 
            }
            .cta-button {
                display: inline-block;
                background: #28a745;
                color: white;
                padding: 12px 25px;
                border-radius: 25px;
                text-decoration: none;
                font-weight: 600;
                margin: 15px 0;
                text-align: center;
            }
            @media (max-width: 600px) {
                .info-grid { grid-template-columns: 1fr; }
                .stats-row { flex-direction: column; gap: 15px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="emoji">🛒📈</div>
                <h2>New Salmart Page Visit</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Someone just discovered your platform!</p>
            </div>
            
            <div class="content">
                <div class="info-grid">
                    <div class="info-box">
                        <div class="label">⏰ Visit Time</div>
                        <div class="value">${new Date(visitData.timestamp).toLocaleString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZoneName: 'short'
                        })}</div>
                    </div>
                    
                    <div class="info-box">
                        <div class="label">🌐 IP Address</div>
                        <div class="value">${visitData.ip || 'Hidden'}</div>
                    </div>
                    
                    <div class="info-box">
                        <div class="label">📱 Device Type</div>
                        <div class="value">${visitData.deviceType}</div>
                    </div>
                    
                    <div class="info-box">
                        <div class="label">🔗 Traffic Source</div>
                        <div class="value">${visitData.referrer || 'Direct Visit'}</div>
                    </div>
                    
                    <div class="info-box full-width">
                        <div class="label">📍 Page URL</div>
                        <div class="value">${visitData.url}</div>
                    </div>
                    
                    <div class="info-box full-width">
                        <div class="label">🆔 Session ID</div>
                        <div class="value">${visitData.sessionId}</div>
                    </div>
                </div>
                
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/dashboard" class="cta-button">
                        View Admin Dashboard
                    </a>
                </div>
            </div>
            
            <div class="footer">
                <p><strong>Salmart Visit Tracking System</strong></p>
                <p>This notification was generated automatically when someone visited your landing page.</p>
                <p>Generated at ${new Date().toLocaleString()}</p>
            </div>
        </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Salmart System" <${process.env.EMAIL_USER}>`,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `🔔 New Salmart Page Visit - ${new Date().toLocaleDateString()}`,
    html: emailHTML
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Visit notification email sent successfully');
  } catch (error) {
    logger.error('Error sending visit notification email:', error.message);
  }
}

// Main visit tracking route
router.post('/api/track-visit', async (req, res) => {
  try {
    const clientIP = req.ip || 
                    req.connection?.remoteAddress || 
                    req.socket?.remoteAddress || 
                    req.headers['x-forwarded-for']?.split(',')[0] || 
                    'Unknown';

    // Rate limiting check
    if (!visitLimiter.isAllowed(clientIP)) {
      return res.status(429).json({ 
        success: false, 
        message: 'Too many visits from this IP' 
      });
    }

    const visitData = {
      timestamp: new Date(),
      ip: clientIP,
      userAgent: req.get('User-Agent') || '',
      referrer: req.body.referrer || req.get('Referer') || 'Direct visit',
      url: req.body.url || req.get('Host') || '',
      sessionId: req.body.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deviceType: getDeviceType(req.get('User-Agent')),
      isBot: isBot(req.get('User-Agent')),
      location: {
        country: req.get('CF-IPCountry') || 'Unknown', // Cloudflare header
        city: req.get('CF-IPCity') || 'Unknown'
      }
    };

    // Skip bot visits for email notifications
    if (!visitData.isBot) {
      // Save to database
      const visit = new Visit(visitData);
      await visit.save();

      // Send email notification to admin (async, don't wait)
      sendVisitNotificationEmail(visitData).catch(error => {
        logger.error('Failed to send visit notification:', error.message);
      });

      logger.info('Page visit tracked and notification sent', {
        ip: visitData.ip,
        deviceType: visitData.deviceType,
        referrer: visitData.referrer,
        sessionId: visitData.sessionId
      });
    } else {
      logger.info('Bot visit detected and ignored', {
        ip: visitData.ip,
        userAgent: visitData.userAgent
      });
    }

    res.json({ 
      success: true, 
      message: 'Visit tracked successfully',
      timestamp: visitData.timestamp
    });

  } catch (error) {
    logger.error('Error tracking visit:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to track visit' 
    });
  }
});

// Optional: Get visit analytics for admin dashboard
router.get('/api/admin/visit-analytics', verifyAdmin, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const analytics = await Visit.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
          isBot: { $ne: true }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            deviceType: "$deviceType"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          totalVisits: { $sum: "$count" },
          devices: {
            $push: {
              type: "$_id.deviceType",
              count: "$count"
            }
          }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    const totalVisits = await Visit.countDocuments({
      timestamp: { $gte: startDate },
      isBot: { $ne: true }
    });

    const uniqueIPs = await Visit.distinct('ip', {
      timestamp: { $gte: startDate },
      isBot: { $ne: true }
    });

    res.json({
      success: true,
      analytics: {
        totalVisits,
        uniqueVisitors: uniqueIPs.length,
        dailyData: analytics,
        period: `${days} days`
      }
    });

  } catch (error) {
    logger.error('Error fetching visit analytics:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch analytics' 
    });
  }
});
  return router;
};
