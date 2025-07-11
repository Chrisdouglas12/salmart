// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');
const Jimp = require('jimp');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const winston = require('winston');
const Post = require('../models/postSchema.js');
const Message = require('../models/messageSchema.js')
const User = require('../models/userSchema.js');
const Transaction = require('../models/transactionSchema.js');
const Escrow = require('../models/escrowSchema.js');
const Notification = require('../models/notificationSchema.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
const NotificationService = require('../services/notificationService.js');
const paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);

// Configure Winston logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.metadata()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/paymentRoutes.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Constants
const COMMISSION_PERCENT = 2;
const RECEIPT_TIMEOUT = 30000; // 30 seconds timeout for receipt generation

module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    logger.info('Attached io to request object in paymentRoutes');
    next();
  });

  // Helper function to validate required fields
  const validatePaymentRequest = (body) => {
    const { email, postId, buyerId } = body;
    const errors = [];
    
    if (!email) errors.push('Email is required');
    if (!buyerId) errors.push('Buyer ID is required');
    if (!postId) errors.push('Post ID is required');
    
    return errors;
  };

  // Helper function to generate modern receipt image
  const generateModernReceipt = async (receiptData) => {
    try {
      const {
        reference,
        amountPaid,
        transactionDate,
        buyerName,
        email,
        productTitle,
        sellerName
      } = receiptData;

      const receiptsDir = path.join(__dirname, 'receipts');
      await fs.mkdir(receiptsDir, { recursive: true });
      
      const imagePath = path.join(receiptsDir, `${reference}.png`);
      
      // Create modern receipt with professional design
      const image = new Jimp(650, 1000, 0xFFFFFFFF);
      
      // Load fonts
      const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK);
      const fontRegular = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
      const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
      const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

      // Header gradient background
      const headerHeight = 180;
      for (let y = 0; y < headerHeight; y++) {
        for (let x = 0; x < 650; x++) {
          const ratio = y / headerHeight;
          const r = Math.floor(24 + (76 - 24) * ratio);
          const g = Math.floor(119 + (175 - 119) * ratio);
          const b = Math.floor(242 + (80 - 242) * ratio);
          image.setPixelColor(Jimp.rgbaToInt(r, g, b, 255), x, y);
        }
      }

      // Company logo area (modern design)
      const logoArea = await Jimp.create(100, 100, 0x1E3A8AFF);
      logoArea.print(fontLarge, 25, 20, 'S', 50, 60);
      image.composite(logoArea, 50, 40);

      // Company name and title
      image.print(fontBold, 170, 50, 'SALMART', 400);
      image.print(fontRegular, 170, 85, 'Payment Receipt', 400);
      image.print(fontSmall, 170, 110, 'Digital Transaction Confirmation', 400);

      // Success indicator with modern styling
      const successBadge = await Jimp.create(200, 50, 0x10B981FF);
      successBadge.print(fontRegular, 40, 15, '✓ VERIFIED', 120);
      image.composite(successBadge, 450, 65);

      // Main content area with card-like design
      const cardY = 220;
      const cardHeight = 600;
      
      // Card background with subtle shadow effect
      const card = await Jimp.create(590, cardHeight, 0xF9FAFBFF);
      
      // Add subtle border
      for (let i = 0; i < 2; i++) {
        card.scan(i, 0, 1, cardHeight, function (x, y, idx) {
          this.bitmap.data[idx] = 229; // Light gray border
          this.bitmap.data[idx + 1] = 231;
          this.bitmap.data[idx + 2] = 235;
        });
        card.scan(590 - 1 - i, 0, 1, cardHeight, function (x, y, idx) {
          this.bitmap.data[idx] = 229;
          this.bitmap.data[idx + 1] = 231;
          this.bitmap.data[idx + 2] = 235;
        });
      }
      
      image.composite(card, 30, cardY);

      // Transaction details with modern layout
      let yPos = cardY + 40;
      const leftMargin = 60;
      const rightMargin = 450;
      const lineHeight = 45;

      // Transaction Reference
      image.print(fontSmall, leftMargin, yPos, 'TRANSACTION REFERENCE', 300);
      image.print(fontRegular, leftMargin, yPos + 18, reference.toUpperCase(), 500);
      yPos += lineHeight + 10;

      // Divider line
      for (let x = leftMargin; x < 590; x++) {
        image.setPixelColor(0xE5E7EBFF, x, yPos);
      }
      yPos += 25;

      // Amount section with emphasis
      const amountBg = await Jimp.create(530, 80, 0xF0F9FFFF);
      image.composite(amountBg, leftMargin, yPos);
      
      image.print(fontSmall, leftMargin + 20, yPos + 15, 'AMOUNT PAID', 300);
      image.print(fontBold, leftMargin + 20, yPos + 35, `₦${Number(amountPaid).toLocaleString('en-NG')}`, 400);
      yPos += 100;

      // Transaction details grid
      const details = [
        { label: 'PAYMENT DATE', value: new Date(transactionDate).toLocaleDateString('en-NG', { 
          year: 'numeric', month: 'long', day: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        })},
        { label: 'BUYER NAME', value: buyerName },
        { label: 'BUYER EMAIL', value: email },
        { label: 'PRODUCT', value: productTitle },
        { label: 'SELLER', value: sellerName },
        { label: 'STATUS', value: 'COMPLETED' }
      ];

      details.forEach(({ label, value }) => {
        image.print(fontSmall, leftMargin, yPos, label, 250);
        image.print(fontRegular, leftMargin, yPos + 18, value, 500);
        yPos += lineHeight;
      });

      // Footer section
      yPos = 900;
      
      // Footer divider
      for (let x = 50; x < 600; x++) {
        image.setPixelColor(0xD1D5DBFF, x, yPos - 20);
      }

      // Footer text
      image.print(fontSmall, 50, yPos, '© 2025 Salmart Technologies', 300);
      image.print(fontSmall, 50, yPos + 20, 'Secure Digital Commerce Platform', 300);
      image.print(fontSmall, 400, yPos, `Receipt ID: ${reference.slice(-8)}`, 200);
      image.print(fontSmall, 400, yPos + 20, new Date().toISOString().split('T')[0], 200);

      // Save image
      await image.writeAsync(imagePath);
      
      // Upload to Cloudinary
      const cloudinaryResponse = await cloudinary.uploader.upload(imagePath, {
        public_id: `receipts/${reference}`,
        folder: 'salmart_receipts',
        quality: 'auto:good',
        format: 'png'
      });

      // Clean up local file
      await fs.unlink(imagePath);
      
      return cloudinaryResponse.secure_url;
    } catch (error) {
      logger.error('Receipt generation failed:', error);
      throw error;
    }
  };

  // Helper function to send receipt to seller
  const sendReceiptToSeller = async (receiptData, receiptImageUrl, io) => {
    try {
      const { buyerId, sellerId, buyerName, productTitle, reference } = receiptData;

      const message = new Message({
        senderId: buyerId,
        receiverId: sellerId,
        messageType: 'image',
        attachment: { url: receiptImageUrl },
        text: `Payment Receipt - ${productTitle}`,
        status: 'sent',
        timestamp: new Date()
      });

      await message.save();
      
      // Emit to seller in real-time
      io.to(`user_${sellerId}`).emit('receiveMessage', message.toObject());
      
      // Send FCM notification
      await sendFCMNotification(
        sellerId,
        'Payment Receipt Received',
        `${buyerName} completed payment for ${productTitle}`,
        { 
          type: 'payment_receipt', 
          senderId: buyerId, 
          receiptImageUrl,
          reference 
        }
      );

      return { success: true };
    } catch (error) {
      logger.error('Failed to send receipt to seller:', error);
      return { success: false, error: error.message };
    }
  };

  // Process buy orders
  router.post('/pay', async (req, res) => {
    const requestId = `PAY_${Date.now()}`;
    logger.info('Payment initiation started', { requestId, body: req.body });

    try {
      const validationErrors = validatePaymentRequest(req.body);
      if (validationErrors.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: validationErrors.join(', ') 
        });
      }

      const { email, postId, buyerId } = req.body;
      const trimmedPostId = postId.trim();
      
      const post = await Post.findById(trimmedPostId);
      if (!post) {
        return res.status(404).json({ 
          success: false, 
          message: "Product not found" 
        });
      }

      if (post.isSold) {
        return res.status(400).json({ 
          success: false, 
          message: "Product is already sold" 
        });
      }

      const amount = parseFloat(post.price) * 100;
      const sellerId = post.createdBy;

      const protocol = req.secure ? 'https' : 'http';
      const host = req.get('host');
      const API_BASE_URL = `${protocol}://${host}`;

      const response = await paystack.transaction.initialize({
        email,
        amount: amount,
        callback_url: `${API_BASE_URL}/payment-success?postId=${trimmedPostId}&buyerId=${buyerId}`,
        metadata: {
          postId: trimmedPostId,
          email,
          buyerId,
          sellerId,
        },
      });

      logger.info('Payment initialized successfully', { requestId, reference: response.data.reference });
      res.json({ success: true, url: response.data.authorization_url });
    } catch (error) {
      logger.error('Payment initiation failed', { requestId, error: error.message });
      res.status(500).json({ success: false, message: "Payment initialization failed" });
    }
  });

  router.get('/payment-success', async (req, res) => {
    const requestId = `SUCCESS_${Date.now()}`;
    const { reference, postId, buyerId } = req.query;

    logger.info('Payment verification started', { requestId, reference });

    try {
      // Verify payment with Paystack
      const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const data = await paystackResponse.json();
      
      if (!data.status || data.data.status !== 'success') {
        throw new Error(data.message || "Payment verification failed");
      }

      // Fetch required data
      const [post, buyer] = await Promise.all([
        Post.findById(postId),
        User.findOne({ email: data.data.customer.email })
      ]);

      if (!post || !buyer) {
        throw new Error("Post or buyer not found");
      }

      const seller = await User.findById(post.createdBy.userId);
      if (!seller) {
        throw new Error("Seller not found");
      }

      // Calculate amounts
      const amountPaid = data.data.amount / 100;
      const commission = (COMMISSION_PERCENT / 100) * amountPaid;
      const sellerShare = amountPaid - commission;

      // Prepare receipt data
      const receiptData = {
        reference,
        amountPaid,
        transactionDate: data.data.paid_at,
        buyerName: `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim(),
        email: buyer.email,
        productTitle: post.title || post.description || "Product",
        sellerName: `${seller.firstName} ${seller.lastName}`,
        buyerId: buyer._id.toString(),
        sellerId: seller._id.toString()
      };

      // Create database records
      const [escrow, transaction, notification] = await Promise.all([
        new Escrow({
          product: postId,
          buyer: buyer._id,
          seller: seller._id,
          amount: amountPaid,
          commission,
          sellerShare,
          paymentReference: reference,
          status: 'In Escrow'
        }).save(),
        
        new Transaction({
          buyerId: buyer._id,
          sellerId: seller._id,
          postId: postId,
          amount: amountPaid,
          status: 'pending',
          viewed: false,
          paymentReference: reference,
          receiptImageUrl: '' // Will be updated after receipt generation
        }).save(),
        
        new Notification({
          userId: seller._id,
          senderId: buyer._id,
          type: 'payment',
          postId: postId,
          payment: post.title,
          message: `${receiptData.buyerName} just paid for your product: "${post.description}"`,
          createdAt: new Date()
        }).save()
      ]);

      // Mark post as sold
      post.isSold = true;
      await post.save();

      // Send initial notifications
      await Promise.all([
        sendFCMNotification(
          seller._id.toString(),
          'Payment Received',
          `${receiptData.buyerName} paid for your product: "${receiptData.productTitle}"`,
          { type: 'payment', postId: postId.toString() },
          req.io,
          post.photo,
          buyer.profilePicture
        ),
        NotificationService.triggerCountUpdate(seller._id.toString(), req.io)
      ]);

      req.io.to(seller._id.toString()).emit('notification', notification);

      // Generate receipt and send to seller (with timeout)
      let receiptStatus = { success: false, message: 'Receipt generation timed out' };
      
      try {
        const receiptPromise = Promise.race([
          (async () => {
            try {
              const receiptImageUrl = await generateModernReceipt(receiptData);
              
              // Update transaction with receipt URL
              transaction.receiptImageUrl = receiptImageUrl;
              await transaction.save();
              
              // Send receipt to seller
              return await sendReceiptToSeller({...receiptData, reference}, receiptImageUrl, req.io);
            } catch (error) {
              throw error;
            }
          })(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Receipt generation timeout')), RECEIPT_TIMEOUT)
          )
        ]);

        receiptStatus = await receiptPromise;
      } catch (error) {
        logger.error('Receipt generation/sending failed', { requestId, error: error.message });
        receiptStatus = { success: false, message: error.message };
      }

      // Send success response with modern HTML
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Successful - Salmart</title>
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
            
            .receipt-section {
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
            
            .amount-value {
              font-size: 32px;
              color: #92400e;
              font-weight: 700;
            }
            
            .receipt-status {
              padding: 20px 30px;
              background: ${receiptStatus.success ? '#f0fdf4' : '#fef2f2'};
              border-top: 1px solid ${receiptStatus.success ? '#bbf7d0' : '#fecaca'};
              text-align: center;
            }
            
            .status-icon {
              font-size: 24px;
              margin-bottom: 8px;
            }
            
            .status-text {
              font-size: 16px;
              font-weight: 600;
              color: ${receiptStatus.success ? '#166534' : '#dc2626'};
              margin-bottom: 4px;
            }
            
            .status-detail {
              font-size: 14px;
              color: ${receiptStatus.success ? '#15803d' : '#b91c1c'};
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
              
              .receipt-section {
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
              <h1 class="title">Payment Successful</h1>
              <p class="subtitle">Your transaction has been completed</p>
            </div>
            
            <div class="status-badge">
              ✓ Transaction Verified
            </div>
            
            <div class="receipt-section">
              <h2 class="section-title">
                <span>📄</span>
                Transaction Details
              </h2>
              
              <div class="detail-card">
                <div class="detail-row">
                  <span class="detail-label">Reference</span>
                  <span class="detail-value">${reference}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date</span>
                  <span class="detail-value">${new Date(receiptData.transactionDate).toLocaleString('en-NG')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Buyer</span>
                  <span class="detail-value">${receiptData.buyerName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Email</span>
                  <span class="detail-value">${receiptData.email}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Product</span>
                  <span class="detail-value">${receiptData.productTitle}</span>
                </div>
              </div>
              
              <div class="amount-highlight">
                <div class="amount-label">Amount Paid</div>
                <div class="amount-value">₦${Number(receiptData.amountPaid).toLocaleString('en-NG')}</div>
              </div>
            </div>
            
            <div class="receipt-status">
              <div class="status-icon">${receiptStatus.success ? '📧' : '⚠️'}</div>
              <div class="status-text">
                ${receiptStatus.success ? 'Receipt Sent Successfully' : 'Receipt Delivery Failed'}
              </div>
              <div class="status-detail">
                ${receiptStatus.success 
                  ? 'Digital receipt has been automatically sent to the seller' 
                  : `Failed to send receipt: ${receiptStatus.message}`
                }
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

      logger.info('Payment verification completed successfully', { 
        requestId, 
        reference, 
        receiptSent: receiptStatus.success 
      });

    } catch (error) {
      logger.error('Payment verification failed', { requestId, error: error.message });
      res.status(500).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Error - Salmart</title>
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
            <h1 class="error-title">Payment Verification Failed</h1>
            <p class="error-message">${error.message}</p>
          </div>
        </body>
        </html>
      `);
    }
  });

  return router;
};