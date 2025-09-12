// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios'); // Not used in provided code, but kept if you use it elsewhere
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
const { sendNotificationToUser } = require('../services/notificationUtils.js');
const NotificationService = require('../services/notificationService.js');

const paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);

// Configure Winston logger
const logger = winston.createLogger({
  level: 'debug', // Set to 'info' or 'warn' for less verbose production logs, but 'debug' is good for debugging this issue
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
    logger.debug('Starting receipt generation', { receiptDataRef: receiptData.reference });
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
      const image = new Jimp(650, 1000, 0xFFFFFFFF); // White background
      
      // Load fonts
      const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK);
      const fontRegular = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
      const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
      const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

      // Header gradient background (Green tones)
      const headerHeight = 180;
      const startColor = Jimp.cssColorToHex('#218838'); // Darker green
      const endColor = Jimp.cssColorToHex('#28a745'); // Your specified green
      
      for (let y = 0; y < headerHeight; y++) {
        for (let x = 0; x < 650; x++) {
          const ratio = y / headerHeight;
          const r = Math.floor(Jimp.intToRGBA(startColor).r + (Jimp.intToRGBA(endColor).r - Jimp.intToRGBA(startColor).r) * ratio);
          const g = Math.floor(Jimp.intToRGBA(startColor).g + (Jimp.intToRGBA(endColor).g - Jimp.intToRGBA(startColor).g) * ratio);
          const b = Math.floor(Jimp.intToRGBA(startColor).b + (Jimp.intToRGBA(endColor).b - Jimp.intToRGBA(startColor).b) * ratio);
          image.setPixelColor(Jimp.rgbaToInt(r, g, b, 255), x, y);
        }
      }

      // Company logo area (modern design - Darker Green)
      const logoArea = await Jimp.create(100, 100, Jimp.cssColorToHex('#1e7e34FF')); // Darker green for logo area
      logoArea.print(fontLarge, 25, 20, 'S', 50, 60);
      image.composite(logoArea, 50, 40);

      // Company name and title
      image.print(fontBold, 170, 50, 'SALMART', 400);
      image.print(fontRegular, 170, 85, 'Payment Receipt', 400);
      image.print(fontSmall, 170, 110, 'Digital Transaction Confirmation', 400);

      // Success indicator with modern styling (Your specified green)
      const successBadge = await Jimp.create(200, 50, Jimp.cssColorToHex('#28a745FF')); // Your specified green
      successBadge.print(fontRegular, 40, 15, 'VERIFIED', 120);
      image.composite(successBadge, 450, 65);

      // Main content area with card-like design
      const cardY = 220;
      const cardHeight = 600;
      
      // Card background (White - F9FAFBFF)
      const card = await Jimp.create(590, cardHeight, 0xF9FAFBFF); // Keeping light background for readability
      
      // Add subtle border (Light green-grey)
      const borderColor = Jimp.cssColorToHex('#D4EDDAFF'); // Light green-grey border
      for (let i = 0; i < 2; i++) {
        card.scan(i, 0, 1, cardHeight, function (x, y, idx) {
          this.bitmap.data[idx] = Jimp.intToRGBA(borderColor).r;
          this.bitmap.data[idx + 1] = Jimp.intToRGBA(borderColor).g;
          this.bitmap.data[idx + 2] = Jimp.intToRGBA(borderColor).b;
        });
        card.scan(590 - 1 - i, 0, 1, cardHeight, function (x, y, idx) {
          this.bitmap.data[idx] = Jimp.intToRGBA(borderColor).r;
          this.bitmap.data[idx + 1] = Jimp.intToRGBA(borderColor).g;
          this.bitmap.data[idx + 2] = Jimp.intToRGBA(borderColor).b;
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

      // Divider line (Light green-grey)
      for (let x = leftMargin; x < 590; x++) {
        image.setPixelColor(Jimp.cssColorToHex('#D4EDDAFF'), x, yPos);
      }
      yPos += 25;

      // Amount section with emphasis (Light green background, darker green text)
      const amountBg = await Jimp.create(530, 80, Jimp.cssColorToHex('#EAF7EDFF')); // Very light green
      image.composite(amountBg, leftMargin, yPos);
      
      const amountTextColor = Jimp.cssColorToHex('#1e7e34FF'); // Darker green for text
      image.print(fontSmall, leftMargin + 20, yPos + 15, 'AMOUNT PAID', 300);
      image.print(fontBold, leftMargin + 20, yPos + 35, `${Number(amountPaid).toLocaleString('en-NG')}`, 400, amountTextColor);
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
      
      // Footer divider (Light green-grey)
      for (let x = 50; x < 600; x++) {
        image.setPixelColor(Jimp.cssColorToHex('#D4EDDAFF'), x, yPos - 20);
      }

      // Footer text
      image.print(fontSmall, 50, yPos, ' 2025 Salmart Technologies', 300);
      image.print(fontSmall, 50, yPos + 20, 'Secure Digital Commerce Platform', 300);
      image.print(fontSmall, 400, yPos, `Receipt ID: ${reference.slice(-8)}`, 200);
      image.print(fontSmall, 400, yPos + 20, new Date().toISOString().split('T')[0], 200);

      // Save image
      await image.writeAsync(imagePath);
      logger.debug('Receipt image saved locally', { imagePath });
      
      // Upload to Cloudinary
      const cloudinaryResponse = await cloudinary.uploader.upload(imagePath, {
        public_id: `receipts/${reference}`,
        folder: 'salmart_receipts',
        quality: 'auto:good',
        format: 'png'
      });
      logger.debug('Receipt image uploaded to Cloudinary', { url: cloudinaryResponse.secure_url });

      // Clean up local file
      await fs.unlink(imagePath);
      logger.debug('Local receipt image deleted', { imagePath });
      
      return cloudinaryResponse.secure_url;
    } catch (error) {
      logger.error('Receipt generation failed:', { error: error.message, stack: error.stack, reference: receiptData.reference });
      throw error;
    }
  };

  // Helper function to send receipt to seller
  const sendReceiptToSeller = async (receiptData, receiptImageUrl, io) => {
    logger.debug('Starting send receipt to seller', { buyerId: receiptData.buyerId, sellerId: receiptData.sellerId, reference: receiptData.reference });
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
      logger.debug('Receipt message saved to DB', { messageId: message._id });
      
      // Emit to seller in real-time
      io.to(`user_${sellerId}`).emit('receiveMessage', message.toObject());
      logger.debug('Emitted receiveMessage to seller via socket', { sellerId });
      
      // Send FCM notification
      await sendNotificationToUser(
        sellerId,
        'New Sales Alert',
        `${buyerName} c
        just made a successful payment for ${productTitle}`,
        { 
          type: 'payment_receipt', 
          senderId: buyerId, 
          receiptImageUrl,
          reference 
        }
      );
      logger.debug('FCM notification sent for receipt', { sellerId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send receipt to seller:', { error: error.message, stack: error.stack, reference: receiptData.reference });
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
        logger.warn('Payment initiation validation failed', { requestId, errors: validationErrors });
        return res.status(400).json({ 
          success: false, 
          message: validationErrors.join(', ') 
        });
      }

      const { email, postId, buyerId } = req.body;
      const trimmedPostId = postId.trim();
      
      const post = await Post.findById(trimmedPostId);
      if (!post) {
        logger.warn('Payment initiation: Product not found', { requestId, postId: trimmedPostId });
        return res.status(404).json({ 
          success: false, 
          message: "Product not found" 
        });
      }

      if (post.isSold) {
        logger.warn('Payment initiation: Product already sold', { requestId, postId: trimmedPostId });
        return res.status(400).json({ 
          success: false, 
          message: "Product is already sold" 
        });
      }

      const amount = parseFloat(post.price) * 100;
      const sellerId = post.createdBy.userId.toString(); // Ensure you're getting the ID string


      const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
const host = req.get('host');
const API_BASE_URL = process.env.BASE_URL || `${protocol}://${host}`;

const paystackInitializeResponse = await paystack.transaction.initialize({
  email,
  amount: amount,
  callback_url: `${API_BASE_URL}/payment-success?postId=${trimmedPostId}&buyerId=${buyerId}`,
  metadata: {
    postId: trimmedPostId,
    email,
    buyerId,
    sellerId: sellerId.toString(), // Ensure sellerId is string for metadata
  },
});

      logger.info('Payment initialized successfully with Paystack', { requestId, reference: paystackInitializeResponse.data.reference });
      res.json({ success: true, url: paystackInitializeResponse.data.authorization_url });
    } catch (error) {
      logger.error('Payment initiation failed', { requestId, error: error.message, stack: error.stack, body: req.body });
      res.status(500).json({ success: false, message: "Payment initialization failed" });
    }
  });

  router.get('/payment-success', async (req, res) => {
    const requestId = `SUCCESS_${Date.now()}`;
    const { reference } = req.query; // Only reference is reliable from Paystack query

    logger.info('Payment verification started', { requestId, reference, queryParams: req.query });

    try {
      // --- IMPORTANT: Idempotency Check ---
      const existingTransaction = await Transaction.findOne({ paymentReference: reference });
      if (existingTransaction) {
          logger.warn('Duplicate payment reference detected. Transaction already processed.', { 
              requestId, 
              reference, 
              transactionId: existingTransaction._id 
          });

          // Fetch related data for rendering the "already processed" page
          const [post, buyer, seller] = await Promise.all([
              Post.findById(existingTransaction.postId),
              User.findById(existingTransaction.buyerId),
              User.findById(existingTransaction.sellerId)
          ]);

          const receiptDataForDisplay = {
              reference: existingTransaction.paymentReference,
              amountPaid: existingTransaction.amount,
              transactionDate: existingTransaction.createdAt, // Or the actual paid_at from original Paystack data if stored
              buyerName: buyer ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() : 'N/A',
              email: buyer ? buyer.email : 'N/A',
              productTitle: post ? (post.title || post.description || "Product") : 'N/A',
              sellerName: seller ? `${seller.firstName || ''} ${seller.lastName || ''}`.trim() : 'N/A',
          };
          
          return res.send(`
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Payment Already Processed - Salmart</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
                <style>
                  * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                  }
                  body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); /* Green gradient */
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
                    background: linear-gradient(135deg, #1e7e34 0%, #28a745 100%); /* Green gradient */
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
                    background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); /* Green gradient */
                    color: white;
                    padding: 16px 24px;
                    margin: 30px;
                    border-radius: 16px;
                    text-align: center;
                    font-weight: 600;
                    font-size: 18px;
                    box-shadow: 0 10px 20px rgba(40, 167, 69, 0.3); /* Green shadow */
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
                    border: 1px solid #d4edda; /* Light green border */
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
                    background: linear-gradient(135deg, #eaf7ed 0%, #d4edda 100%); /* Light green gradient */
                    border-radius: 12px;
                    padding: 20px;
                    margin: 20px 0;
                    text-align: center;
                  }
                  .amount-label {
                    font-size: 14px;
                    color: #155724; /* Darker green */
                    font-weight: 500;
                    margin-bottom: 8px;
                  }
                  .amount-value {
                    font-size: 32px;
                    color: #155724; /* Darker green */
                    font-weight: 700;
                  }
                  .receipt-status {
                    padding: 20px 30px;
                    background: #f0fdf4; /* Very light green */
                    border-top: 1px solid #bbf7d0; /* Light green */
                    text-align: center;
                  }
                  .status-icon {
                    font-size: 24px;
                    margin-bottom: 8px;
                  }
                  .status-text {
                    font-size: 16px;
                    font-weight: 600;
                    color: #166534; /* Dark green */
                    margin-bottom: 4px;
                  }
                  .status-detail {
                    font-size: 14px;
                    color: #15803d; /* Dark green */
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
                    <h1 class="title">Payment Already Processed</h1>
                    <p class="subtitle">This transaction has already been successfully completed.</p>
                  </div>
                  
                  <div class="status-badge">
                    ✓ Transaction Confirmed
                  </div>
                  
                  <div class="receipt-section">
                    <h2 class="section-title">
                      <span>📄</span>
                      Transaction Details
                    </h2>
                    
                    <div class="detail-card">
                      <div class="detail-row">
                        <span class="detail-label">Reference</span>
                        <span class="detail-value">${receiptDataForDisplay.reference}</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Date</span>
                        <span class="detail-value">${new Date(receiptDataForDisplay.transactionDate).toLocaleString('en-NG')}</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Buyer</span>
                        <span class="detail-value">${receiptDataForDisplay.buyerName}</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Email</span>
                        <span class="detail-value">${receiptDataForDisplay.email}</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Product</span>
                        <span class="detail-value">${receiptDataForDisplay.productTitle}</span>
                      </div>
                    </div>
                    
                    <div class="amount-highlight">
                      <div class="amount-label">Amount (already) Paid</div>
                      <div class="amount-value">₦${Number(receiptDataForDisplay.amountPaid).toLocaleString('en-NG')}</div>
                    </div>
                  </div>
                  
                  <div class="receipt-status">
                    <div class="status-icon">✅</div>
                    <div class="status-text">
                      No Action Needed
                    </div>
                    <div class="status-detail">
                      This payment was already verified and processed.
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
      }

      // Step 1: Verify payment with Paystack
      logger.debug('Attempting Paystack verification', { requestId, reference });
      const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const data = await paystackResponse.json();
      logger.debug('Paystack verification raw response', { requestId, data });
      
      if (!data.status || data.data.status !== 'success') {
        logger.error('Paystack verification failed: Status not success', { requestId, reference, paystackData: data });
        throw new Error(data.message || "Payment verification failed");
      }

      // Extract IDs from Paystack metadata (more reliable than query params for consistency)
      const retrievedPostId = data.data.metadata.postId;
      const retrievedBuyerId = data.data.metadata.buyerId; // Use this if you want to find buyer by ID
      const buyerEmailFromPaystack = data.data.customer.email;
      const sellerIdFromPaystackMetadata = data.data.metadata.sellerId;

      logger.debug('Extracted IDs from Paystack metadata', { 
        requestId, 
        retrievedPostId, 
        retrievedBuyerId, 
        buyerEmailFromPaystack,
        sellerIdFromPaystackMetadata 
      });

      // Step 2: Fetch required data (Post, Buyer, Seller)
      logger.debug('Attempting to find post, buyer, and seller from DB', { 
        requestId, 
        postId: retrievedPostId, 
        buyerEmail: buyerEmailFromPaystack,
        sellerId: sellerIdFromPaystackMetadata 
      });

      const [post, buyer] = await Promise.all([
        Post.findById(retrievedPostId),
        User.findOne({ email: buyerEmailFromPaystack }) // Finding by email from Paystack is generally more robust for the buyer
      ]);

      if (!post) {
        logger.error('Post not found during payment verification', { requestId, retrievedPostId, reference });
        throw new Error(`Post not found with ID: ${retrievedPostId}. Please contact support.`);
      }
      if (!buyer) {
        logger.error('Buyer not found during payment verification', { requestId, buyerEmail: buyerEmailFromPaystack, reference });
        throw new Error(`Buyer not found with email: ${buyerEmailFromPaystack}. Please contact support.`);
      }

      let seller;
      if (sellerIdFromPaystackMetadata) {
        // We're fixing the metadata generation, so this should now be a proper ObjectId string
        seller = await User.findById(sellerIdFromPaystackMetadata); 
      } else {
        // Ensure post.createdBy.userId is explicitly converted to a string if it's an ObjectId object
        seller = await User.findById(post.createdBy.userId.toString()); 
      }
      
      if (!seller) {
        logger.error('Seller not found for post', { 
          requestId, 
          sellerIdAttempted: sellerIdFromPaystackMetadata || post.createdBy.userId, 
          postId: post._id, 
          reference 
        });
        throw new Error(`Seller not found for product ID: ${post._id}. Please contact support.`);
      }

      logger.info('Found post, buyer, and seller from DB', { 
        requestId, 
        postId: post._id, 
        buyerId: buyer._id, 
        sellerId: seller._id 
      });

const amountPaid = data.data.amount / 100; // From Paystack (in Naira)

// Calculate Paystack fee (1.5% + ₦100 if > ₦2500, capped at ₦2000)
let paystackFee = (1.5 / 100) * amountPaid;
if (amountPaid > 2500) paystackFee += 100;
if (paystackFee > 2000) paystackFee = 2000;

// Net amount received after Paystack fee
const amountAfterPaystack = amountPaid - paystackFee;

// Get commission rate based on amount *after* Paystack fees
function getCommissionRate(amount) {
  if (amount < 10000) return 3.5;
  if (amount < 50000) return 3;
  if (amount < 200000) return 2.5;
  return 1;
}

const commissionPercent = getCommissionRate(amountAfterPaystack);
const commissionNaira = (commissionPercent / 100) * amountAfterPaystack;

// Final seller payout
const amountToTransferNaira = amountAfterPaystack - commissionNaira;
const neededAmountKobo = Math.round(amountToTransferNaira * 100);

// Optional logging
logger.info(`[PAYMENT VERIFIED]`, {
  buyerId: buyer._id,
  sellerId: seller._id,
  postId: post._id,
  amountPaid,
  paystackFee,
  amountAfterPaystack,
  commissionPercent,
  commissionNaira,
  amountToTransferNaira,
});
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
      logger.debug('Prepared receipt data', { requestId, receiptDataRef: reference });

      // Create database records
      logger.debug('Attempting to create Escrow, Transaction, and Notification records', { requestId });
      const [escrow, transaction, notification] = await Promise.all([
        new Escrow({
          product: post._id, // Use post._id
          buyer: buyer._id,
          seller: seller._id,
          amount: amountPaid,
          commissionNaira,
          amountToTransferNaira,
          paymentReference: reference,
          status: 'In Escrow'
        }).save(),
        
        new Transaction({
          buyerId: buyer._id,
          sellerId: seller._id,
          postId: post._id, // Use post._id
          amount: amountPaid,
          status: 'pending', // Keeps status as pending until escrow is managed
          viewed: false,
          paymentReference: reference,
          receiptImageUrl: '' // Will be updated after receipt generation
        }).save(),
        
        new Notification({
          userId: seller._id,
          senderId: buyer._id,
          type: 'payment',
          postId: post._id, // Use post._id
          payment: post.title,
          message: `${receiptData.buyerName} just paid for your product: "${post.title}" Kindly deliver the item to recieve payment`,
          createdAt: new Date()
        }).save()
      ]);
      logger.info('Escrow, Transaction, and Notification records created', { 
        requestId, 
        escrowId: escrow._id, 
        transactionId: transaction._id, 
        notificationId: notification._id 
      });

      // Mark post as sold
      logger.debug('Attempting to mark post as sold', { requestId, postId: post._id });
      post.isSold = true;
      await post.save();
      logger.info('Post marked as sold successfully', { requestId, postId: post._id });

      // Send initial notifications
      logger.debug('Sending initial FCM notifications and updating notification count', { requestId });
      await Promise.all([
        sendNotificationToUser(
          seller._id.toString(),
          'Payment Received',
          `${receiptData.buyerName} paid for your product: "${receiptData.productTitle}" Kindly deliver the item to recieve payment`,
          { type: 'payment', postId: post._id.toString() }, // Use post._id
          req.io,
          post.photo,
          buyer.profilePicture
        ),
        NotificationService.triggerCountUpdate(seller._id.toString(), req.io)
      ]);
      logger.info('Initial notifications sent to seller', { requestId });

      // Generate receipt and send to seller (with timeout)
      let receiptStatus = { success: false, message: 'Receipt generation timed out' };
      logger.debug('Attempting receipt generation and sending with timeout', { requestId });
      
      try {
        const receiptPromise = Promise.race([
          (async () => {
            try {
              const receiptImageUrl = await generateModernReceipt(receiptData);
              
              // Update transaction with receipt URL
              transaction.receiptImageUrl = receiptImageUrl;
              await transaction.save();
              logger.debug('Transaction updated with receipt URL', { requestId, transactionId: transaction._id });
              
              // Send receipt to seller
              return await sendReceiptToSeller({...receiptData, reference}, receiptImageUrl, req.io);
            } catch (error) {
              logger.error('Error within receipt generation promise', { requestId, error: error.message, stack: error.stack });
              throw error;
            }
          })(),
          new Promise((_, reject) => 
            setTimeout(() => {
              logger.warn('Receipt generation timeout triggered', { requestId });
              reject(new Error('Receipt generation timeout'));
            }, RECEIPT_TIMEOUT)
          )
        ]);

        receiptStatus = await receiptPromise;
        logger.info('Receipt generation and sending completed', { requestId, receiptStatus });
      } catch (error) {
        logger.error('Receipt generation/sending failed (outer catch)', { requestId, error: error.message, stack: error.stack });
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
              background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); /* Green gradient */
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
              background: linear-gradient(135deg, #1e7e34 0%, #28a745 100%); /* Green gradient */
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
              background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); /* Green gradient */
              color: white;
              padding: 16px 24px;
              margin: 30px;
              border-radius: 16px;
              text-align: center;
              font-weight: 600;
              font-size: 18px;
              box-shadow: 0 10px 20px rgba(40, 167, 69, 0.3); /* Green shadow */
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
              border: 1px solid #d4edda; /* Light green border */
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
              background: linear-gradient(135deg, #eaf7ed 0%, #d4edda 100%); /* Light green gradient */
              border-radius: 12px;
              padding: 20px;
              margin: 20px 0;
              text-align: center;
            }
            
            .amount-label {
              font-size: 14px;
              color: #155724; /* Darker green */
              font-weight: 500;
              margin-bottom: 8px;
            }
            
            .amount-value {
              font-size: 32px;
              color: #155724; /* Darker green */
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

      logger.info('Payment verification completed successfully and success page rendered', { 
        requestId, 
        reference, 
        receiptSent: receiptStatus.success 
      });

    } catch (error) {
      logger.error('Payment verification failed in main catch block', { 
        requestId, 
        error: error.message, 
        stack: error.stack, 
        reference 
      });
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
