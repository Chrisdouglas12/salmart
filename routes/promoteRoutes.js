const express = require('express');
const router = express.Router();
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const User = require('../models/userSchema.js');
const Notification = require('../models/notificationSchema')
const PlatformWallet = require('../models/platformWallet.js')
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
const Post = require('../models/postSchema.js');
const Payment = require('../models/paymentSchema.js');
const verifyToken = require('../middleware/auths.js'); 
const crypto = require('crypto');
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

// Paystack configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Initialize Paystack
const paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);


// Validation helper function
const validatePromotionRequest = (body, userEmail, bodyEmail) => {
    const errors = [];
    
    if (!body.postId || body.postId.trim().length === 0) {
        errors.push('Post ID is required');
    }
    
    if (!body.amount || body.amount < 100) {
        errors.push('Amount must be at least 100 kobo');
    }
    
    if (!body.duration || body.duration < 1) {
        errors.push('Duration must be at least 1 day');
    }
    
    if (!body.dailyRate || body.dailyRate < 1) {
        errors.push('Daily rate must be specified');
    }
    
    // Use userEmail (from token) if available, otherwise fall back to bodyEmail
    const emailToValidate = userEmail || bodyEmail;
    if (!emailToValidate || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToValidate)) {
        errors.push('Valid email address is required');
    }
    
    return { errors, validatedEmail: emailToValidate };
};

module.exports = (io) => {
router.post('/initiate', verifyToken, async (req, res) => {
    const requestId = `PROMO_${Date.now()}`;
    logger.info('Promotion payment initiation started', { 
        requestId, 
        body: req.body, 
        user: req.user,
        bodyEmail: req.body.email,
        userEmail: req.user.email
    });

    try {
        // Validate request using both userEmail and bodyEmail
        const { errors, validatedEmail } = validatePromotionRequest(req.body, req.user.email, req.body.email);
        if (errors.length > 0) {
            logger.warn('Validation errors', { requestId, errors, bodyEmail: req.body.email, userEmail: req.user.email });
            return res.status(400).json({ 
                success: false, 
                message: errors.join(', '),
                type: 'validation_error',
                code: 'missing_params',
                meta: { nextStep: 'Provide all required params' }
            });
        }

        const { postId, amount, duration, dailyRate } = req.body;
        const trimmedPostId = postId.trim();
        const userId = req.user.userId;
        const userEmail = validatedEmail; // Use validated email
        
        // Find the post
        const post = await Post.findById(trimmedPostId);
        if (!post) {
            logger.warn('Post not found', { requestId, postId: trimmedPostId });
            return res.status(404).json({ 
                success: false, 
                message: 'Post not found' 
            });
        }

        // Check if post is already promoted and still active
        if (post.isPromoted && post.promotionDetails?.endDate > new Date()) {
            logger.warn('Post already promoted', { requestId, postId: trimmedPostId });
            return res.status(400).json({ 
                success: false, 
                message: 'Post is already actively promoted' 
            });
        }

        // Validate amount calculation (amount should be in kobo)
        const expectedAmount = duration * dailyRate * 100;
        if (amount !== expectedAmount) {
            logger.warn('Amount mismatch', { requestId, amount, expectedAmount });
            return res.status(400).json({ 
                success: false, 
                message: 'Amount calculation mismatch' 
            });
        }

        // Get user details
        const user = await User.findById(userId);
        if (!user) {
            logger.warn('User not found', { requestId, userId });
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Generate unique reference
        const reference = `PROMO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create payment record
        const payment = new Payment({
            userId,
            postId: trimmedPostId,
            amount,
            reference,
            durationDays: duration,
            dailyRate,
            type: 'promotion',
            status: 'pending',
            createdAt: new Date()
        });
        await payment.save();

// Get base URL for callback
const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
const host = req.get('host');
const API_BASE_URL = process.env.BASE_URL || `${protocol}://${host}`;

// Initialize Paystack payment
const response = await paystack.transaction.initialize({
    email: userEmail,
    amount: amount,
    reference,
    callback_url: `${API_BASE_URL}/promotion-success?postId=${trimmedPostId}&userId=${userId}`,
    metadata: {
        postId: trimmedPostId,
        email: userEmail,
        userId,
        duration,
        dailyRate,
        type: 'promotion'
    }
});
        logger.info('Promotion payment initialized successfully', { 
            requestId, 
            reference: response.data.reference,
            postId: trimmedPostId,
            duration,
            amount: amount / 100,
            userEmail
        });

        res.json({ 
            success: true, 
            authorization_url: response.data.authorization_url,
            reference: response.data.reference,
            userEmail
        });

    } catch (error) {
        logger.error('Promotion payment initiation failed', { 
            requestId, 
            error: error.message,
            stack: error.stack 
        });
        res.status(500).json({ 
            success: false, 
            message: 'Payment initialization failed' 
        });
    }
});

  // Verify promotion payment
  router.post('/verify', verifyToken, async (req, res) => {
    const requestId = `PROMO_VERIFY_${Date.now()}`;
    logger.info('Promotion payment verification started', { requestId, body: req.body });

    try {
      const { reference, postId } = req.body;
      const userId = req.user.userId;

      if (!reference || !postId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Reference and Post ID are required' 
        });
      }

      // Find payment record
      const payment = await Payment.findOne({ 
        reference, 
        postId: postId.trim(),
        userId 
      });

      if (!payment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Payment record not found' 
        });
      }

      if (payment.status === 'success') {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already verified and post promoted' 
        });
      }

      // Verify with Paystack
      const paystackResponse = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const transactionData = paystackResponse.data.data;
      const { status, amount, paid_at } = transactionData;

      if (status !== 'success') {
        payment.status = 'failed';
        payment.failureReason = 'Payment not successful';
        await payment.save();
        
        return res.status(400).json({ 
          success: false, 
          message: 'Payment verification failed' 
        });
      }

      if (amount !== payment.amount) {
        payment.status = 'failed';
        payment.failureReason = 'Amount mismatch';
        await payment.save();
        
        return res.status(400).json({ 
          success: false, 
          message: 'Payment amount verification failed' 
        });
      }

      // Update payment status
      payment.status = 'success';
      payment.paidAt = new Date(paid_at);
      payment.paystackData = transactionData;
      await payment.save();
      
      await PlatformWallet.findOneAndUpdate(
  { type: 'promotion' },
  {
    $inc: { balance: amount },
    $push: {
      transactions: {
        amount,
        reference,
        purpose: 'ad_promotion',
        userId,
        type: 'credit',
        timestamp: new Date()
      }
    },
    $set: { lastUpdated: new Date() }
  },
  { upsert: true }
);

      // Update post promotion status
      const post = await Post.findById(payment.postId);
      if (!post) {
        return res.status(404).json({ 
          success: false, 
          message: 'Post not found' 
        });
      }

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + payment.durationDays);

      // Update post with promotion details
      post.isPromoted = true;
      post.promotionDetails = {
        startDate,
        endDate,
        durationDays: payment.durationDays,
        amountPaid: payment.amount,
        dailyRate: payment.dailyRate,
        paymentReference: reference,
        promotedAt: new Date()
      };
      await post.save();

      // Emit socket event for real-time updates (if needed)
      if (io) {
        io.to(userId).emit('promotion_success', {
          postId: post._id,
          title: post.title,
          promotionDetails: post.promotionDetails
        });
      }

      logger.info('Promotion payment verified successfully', { 
        requestId, 
        reference,
        postId: post._id,
        userId,
        duration: payment.durationDays,
        amount: payment.amount / 100
      });

      res.status(200).json({ 
        success: true, 
        message: 'Post promoted successfully',
        promotionDetails: post.promotionDetails
      });

    } catch (error) {
      logger.error('Promotion payment verification failed', { 
        requestId, 
        error: error.message,
        stack: error.stack 
      });
      res.status(500).json({ 
        success: false, 
        message: 'Payment verification failed' 
      });
    }
  });

  // Get promotion status
  router.get('/status/:postId', verifyToken, async (req, res) => {
    try {
      const { postId } = req.params;
      const userId = req.user.userId;

      const post = await Post.findById(postId);
      if (!post || post.createdBy.toString() !== userId) {
        return res.status(404).json({ 
          success: false, 
          message: 'Post not found or unauthorized' 
        });
      }

      const promotionStatus = {
        isPromoted: post.isPromoted,
        promotionDetails: post.promotionDetails,
        isActive: post.isPromoted && post.promotionDetails?.endDate > new Date()
      };

      res.json({ success: true, data: promotionStatus });
    } catch (error) {
      logger.error('Error fetching promotion status:', error.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // Paystack webhook for promotion payments
  router.post('/webhook', async (req, res) => {
    try {
      // Verify webhook signature
      const hash = crypto
        .createHmac('sha512', PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');
      
      if (hash !== req.headers['x-paystack-signature']) {
        logger.warn('Invalid webhook signature received');
        return res.status(400).send('Invalid signature');
      }

      const event = req.body;
      logger.info('Webhook received', { event: event.event, reference: event.data?.reference });

      if (event.event === 'charge.success') {
        const { reference, amount, status } = event.data;
        
        const payment = await Payment.findOne({ reference });
        if (payment && payment.status === 'pending') {
          payment.status = 'success';
          payment.paidAt = new Date();
          payment.paystackData = event.data;
          await payment.save();

          // Update post promotion
          const post = await Post.findById(payment.postId);
          if (post) {
            const startDate = new Date();
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + payment.durationDays);

            post.isPromoted = true;
            post.promotionDetails = {
              startDate,
              endDate,
              durationDays: payment.durationDays,
              amountPaid: amount,
              dailyRate: payment.dailyRate,
              paymentReference: reference,
              promotedAt: new Date()
            };
            await post.save();

            // Emit socket event
            if (io) {
              io.to(payment.userId).emit('promotion_success', {
                postId: post._id,
                title: post.title,
                promotionDetails: post.promotionDetails
              });
            }

            logger.info('Promotion activated via webhook', { 
              reference, 
              postId: post._id,
              duration: payment.durationDays 
            });
          }
        }
      }
      
      res.status(200).send('Webhook processed');
    } catch (error) {
      logger.error('Webhook processing error:', error.message);
      res.status(500).send('Webhook processing failed');
    }
  });

// Success page route for promotion payments
router.get('/promotion-success', async (req, res) => {
  const requestId = `PROMO_SUCCESS_${Date.now()}`;
  const { postId, userId, reference } = req.query;

  logger.info('Promotion payment verification started', { requestId, reference, postId, userId });

  try {
    // Validate query parameters
    if (!postId || !userId || !reference) {
      throw new Error('Missing required parameters: postId, userId, or reference');
    }

    // Verify payment with Paystack
    const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await paystackResponse.json();
    if (!data.status || data.data.status !== 'success') {
      throw new Error(data.message || 'Payment verification failed');
    }

    // Fetch required data
    const [post, user, payment] = await Promise.all([
      Post.findById(postId),
      User.findById(userId),
      Payment.findOne({ reference, postId, userId })
    ]);

    if (!post) {
      throw new Error('Post not found');
    }
    if (!user) {
      throw new Error('User not found');
    }
    if (!payment || payment.status === 'success') {
      throw new Error(payment ? 'Payment already verified' : 'Payment record not found');
    }

    // Validate payment amount
    const amountPaid = data.data.amount; // Amount in kobo
    if (amountPaid !== payment.amount) {
      throw new Error('Payment amount mismatch');
    }

    // Update payment status
    payment.status = 'success';
    payment.paidAt = new Date(data.data.paid_at);
    payment.paystackData = data.data;
    await payment.save();

    // Update post promotion status
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + payment.durationDays);

    post.isPromoted = true;
    post.promotionDetails = {
      startDate,
      endDate,
      durationDays: payment.durationDays,
      amountPaid: payment.amount,
      dailyRate: payment.dailyRate,
      paymentReference: reference,
      promotedAt: new Date()
    };
    await post.save();

    // Prepare notification data
    const notificationData = {
      reference,
      amountPaid: amountPaid / 100, // Convert to naira
      transactionDate: data.data.paid_at,
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
      email: user.email,
      productTitle: `Promotion for Post: ${post.title || post.description || 'Untitled Post'}`,
      durationDays: payment.durationDays
    };
    
    await PlatformWallet.findOneAndUpdate(
  { type: 'promotion' },
  {
    $inc: { balance: amountPaid },
    $push: {
      transactions: {
        amountPaid,
        reference,
        purpose: 'ad_promotion',
        userId,
        type: 'credit',
        timestamp: new Date()
      }
    },
    $set: { lastUpdated: new Date() }
  },
  { upsert: true }
);

    // Create notification
    const notification = new Notification({
      userId,
      senderId: userId,
      type: 'promotion',
      postId,
      payment: notificationData.productTitle,
      message: `Your post "${post.title || post.description}" has been successfully promoted for ${payment.durationDays} days!`,
      createdAt: new Date()
    });
    await notification.save();

    // Send FCM notification
    await sendFCMNotification(
      userId,
      'Promotion Activated',
      `Your post "${notificationData.productTitle}" is now promoted for ${payment.durationDays} days!`,
      { type: 'promotion', postId: postId.toString() },
      io,
      post.photo,
      user.profilePicture
    );

    // Emit real-time notification
    io.to(userId).emit('notification', notification.toObject());
    await NotificationService.triggerCountUpdate(userId, io);

    // Send success response with modern HTML
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Promotion Successful - Salmart</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          
          .container {
            background: white;
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            overflow: hidden;
            max-width: 480px;
            width: 100%;
            position: relative;
          }
          
          .header {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            color: white;
            padding: 40px 30px 30px;
            text-align: center;
            position: relative;
          }
          
          .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="1" fill="white" opacity="0.1"/><circle cx="80" cy="40" r="1" fill="white" opacity="0.1"/><circle cx="40" cy="80" r="1" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
            opacity: 0.3;
          }
          
          .logo {
            width: 80px;
            height: 80px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 32px;
            font-weight: 700;
            backdrop-filter: blur(10px);
            position: relative;
            z-index: 1;
          }
          
          .title {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
            position: relative;
            z-index: 1;
          }
          
          .subtitle {
            font-size: 16px;
            opacity: 0.9;
            font-weight: 400;
            position: relative;
            z-index: 1;
          }
          
          .status-badge {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 16px 24px;
            margin: 30px;
            border-radius: 16px;
            text-align: center;
            font-weight: 600;
            font-size: 18px;
            box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
          }
          
          .promotion-section {
            padding: 30px;
          }
          
          .section-title {
            font-size: 20px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          
          .detail-card {
            background: #f8fafc;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid #e2e8f0;
          }
          
          .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
          }
          
          .detail-row:last-child {
            margin-bottom: 0;
          }
          
          .detail-label {
            font-size: 14px;
            color: #64748b;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .detail-value {
            font-size: 16px;
            color: #1e293b;
            font-weight: 600;
            text-align: right;
            max-width: 60%;
            word-break: break-word;
          }
          
          .amount-highlight {
            background: linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%);
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
          }
          
          .amount-label {
            font-size: 14px;
            color: #92400e;
            font-weight: 500;
            margin-bottom: 8px;
          }
VARCHAR

System: .amount-value {
            font-size: 32px;
            color: #92400e;
            font-weight: 700;
          }
          
          .footer {
            background: #f8fafc;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
          }
          
          .footer-text {
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
          }
          
          @media (max-width: 480px) {
            .container {
              margin: 10px;
              border-radius: 16px;
            }
            
            .header {
              padding: 30px 20px 20px;
            }
            
            .promotion-section {
              padding: 20px;
            }
            
            .detail-row {
              flex-direction: column;
              gap: 4px;
            }
            
            .detail-value {
              text-align: left;
              max-width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">S</div>
            <h1 class="title">Promotion Successful</h1>
            <p class="subtitle">Your post promotion has been activated</p>
          </div>
          
          <div class="status-badge">
            ✓ Promotion Verified
          </div>
          
          <div class="promotion-section">
            <h2 class="section-title">
              <span>📄</span>
              Promotion Details
            </h2>
            
            <div class="detail-card">
              <div class="detail-row">
                <span class="detail-label">Reference</span>
                <span class="detail-value">${reference}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Date</span>
                <span class="detail-value">${new Date(notificationData.transactionDate).toLocaleString('en-NG')}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">User</span>
                <span class="detail-value">${notificationData.userName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Email</span>
                <span class="detail-value">${notificationData.email}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Promotion</span>
                <span class="detail-value">${notificationData.productTitle}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Duration</span>
                <span class="detail-value">${notificationData.durationDays} days</span>
              </div>
            </div>
            
            <div class="amount-highlight">
              <div class="amount-label">Amount Paid</div>
              <div class="amount-value">₦${Number(notificationData.amountPaid).toLocaleString('en-NG')}</div>
            </div>
          </div>
          
          <div class="footer">
            <p class="footer-text">
              © 2025 Salmart Technologies<br>
              Secure Digital Commerce Platform
            </p>
          </div>
        </div>
      </body>
      </html>
    `);

    logger.info('Promotion verification completed successfully', { requestId, reference });

  } catch (error) {
    logger.error('Promotion verification failed', { requestId, error: error.message });
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Promotion Error - Salmart</title>
        <style>
          body {
            font-family: 'Inter', sans-serif;
            background: #fee2e2;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
          }
          .error-container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            max-width: 400px;
          }
          .error-icon {
            font-size: 48px;
            color: #dc2626;
            margin-bottom: 20px;
          }
          .error-title {
            font-size: 24px;
            color: #1f2937;
            margin-bottom: 16px;
            font-weight: 600;
          }
          .error-message {
            color: #6b7280;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="error-icon">⚠️</div>
          <h1 class="error-title">Promotion Verification Failed</h1>
          <p class="error-message">${error.message}</p>
        </div>
      </body>
      </html>
    `);
  }
});
  return router;
};