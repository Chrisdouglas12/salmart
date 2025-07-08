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
const crypto = require('crypto'); // For webhook signature verification

// Models
const Post = require('../models/postSchema.js');
const Message = require('../models/messageSchema.js');
const User = require('../models/userSchema.js');
const Transaction = require('../models/transactionSchema.js');
const Escrow = require('../models/escrowSchema.js');
const Notification = require('../models/notificationSchema.js');

// Services
const { sendFCMNotification } = require('../services/notificationUtils.js');
const NotificationService = require('../services/notificationService.js');

// Paystack API
const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
console.log('Available methods:', Object.keys(paystack));


// Configure Winston logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.metadata()
  ),
  transports: [
    // FIX IS HERE: Add 'new'
    new winston.transports.Console({ format: winston.format.simple() }), // Keep console logging for development
    new winston.transports.File({ filename: 'logs/paymentRoutes.log' }),
  ]
});

// Constants
const COMMISSION_PERCENT = 3; // 2% commission
const RECEIPT_TIMEOUT = 30000; // 30 seconds timeout for receipt generation

module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    logger.info('Attached io to request object in paymentRoutes');
    next();
  });

  // Helper function to validate required fields (Adjusted for direct payment)
  const validatePaymentRequest = (body) => {
    const { email, postId, buyerId, amount } = body; // Add amount validation
    const errors = [];

    if (!email) errors.push('Email is required');
    if (!buyerId) errors.push('Buyer ID is required');
    if (!postId) errors.push('Post ID is required');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) errors.push('Valid amount is required');

    return errors;
  };

  // --- Receipt Functionality (Left as is, per your request) ---
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

      const image = new Jimp(650, 1000, 0xFFFFFFFF);

      const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK);
      const fontRegular = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
      const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
      const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

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

      const logoArea = await Jimp.create(100, 100, 0x1E3A8AFF);
      logoArea.print(fontLarge, 25, 20, 'S', 50, 60);
      image.composite(logoArea, 50, 40);

      image.print(fontBold, 170, 50, 'SALMART', 400);
      image.print(fontRegular, 170, 85, 'Payment Receipt', 400);
      image.print(fontSmall, 170, 110, 'Digital Transaction Confirmation', 400);

      const successBadge = await Jimp.create(200, 50, 0x10B981FF);
      successBadge.print(fontRegular, 40, 15, '✓ VERIFIED', 120);
      image.composite(successBadge, 450, 65);

      const cardY = 220;
      const cardHeight = 600;

      const card = await Jimp.create(590, cardHeight, 0xF9FAFBFF);

      for (let i = 0; i < 2; i++) {
        card.scan(i, 0, 1, cardHeight, function (x, y, idx) {
          this.bitmap.data[idx] = 229;
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

      let yPos = cardY + 40;
      const leftMargin = 60;
      const lineHeight = 45;

      image.print(fontSmall, leftMargin, yPos, 'TRANSACTION REFERENCE', 300);
      image.print(fontRegular, leftMargin, yPos + 18, reference.toUpperCase(), 500);
      yPos += lineHeight + 10;

      for (let x = leftMargin; x < 590; x++) {
        image.setPixelColor(0xE5E7EBFF, x, yPos);
      }
      yPos += 25;

      const amountBg = await Jimp.create(530, 80, 0xF0F9FFFF);
      image.composite(amountBg, leftMargin, yPos);

      image.print(fontSmall, leftMargin + 20, yPos + 15, 'AMOUNT PAID', 300);
      image.print(fontBold, leftMargin + 20, yPos + 35, `₦${Number(amountPaid).toLocaleString('en-NG')}`, 400);
      yPos += 100;

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

      yPos = 900;

      for (let x = 50; x < 600; x++) {
        image.setPixelColor(0xD1D5DBFF, x, yPos - 20);
      }

      image.print(fontSmall, 50, yPos, '© 2025 Salmart Technologies', 300);
      image.print(fontSmall, 50, yPos + 20, 'Secure Digital Commerce Platform', 300);
      image.print(fontSmall, 400, yPos, `Receipt ID: ${reference.slice(-8)}`, 200);
      image.print(fontSmall, 400, yPos + 20, new Date().toISOString().split('T')[0], 200);

      await image.writeAsync(imagePath);

      const cloudinaryResponse = await cloudinary.uploader.upload(imagePath, {
        public_id: `receipts/${reference}`,
        folder: 'salmart_receipts',
        quality: 'auto:good',
        format: 'png'
      });

      await fs.unlink(imagePath);

      return cloudinaryResponse.secure_url;
    } catch (error) {
      logger.error('Receipt generation failed:', error);
      throw error;
    }
  };

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

      io.to(`user_${sellerId}`).emit('receiveMessage', message.toObject());

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
  // --- End Receipt Functionality ---

// POST /api/pay
router.post('/pay', async (req, res) => {
  try {
    const { email, postId, buyerId, expectedPrice } = req.body;

    // Validate input
    if (!postId || !buyerId || !email) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post || post.isSold) {
      return res.status(404).json({ message: 'Product not found or already sold' });
    }

    // Get sellerId from post
    const sellerId = post.createdBy?.userId || post.createdBy;
    if (!mongoose.isValidObjectId(sellerId)) {
      return res.status(400).json({ message: 'Invalid seller ID' });
    }

    const amount = parseFloat(post.price);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // 🛑 Check for existing pending transaction
    const existingTxn = await Transaction.findOne({
      postId,
      buyerId,
      status: 'awaiting_payment'
    });

    if (existingTxn) {
      console.log('[PAY] Found existing pending transaction:', existingTxn.paymentReference);

      return res.json({
        success: true,
        reference: existingTxn.paymentReference,
        amount: existingTxn.amount,
        accountNumber: '0000700239',
        bankName: 'Titan Bank',
        accountName: 'SALMART TECHNOLOGIES',
        message: `Pay ₦${existingTxn.amount} to Titan Bank 0000700239. Use ${existingTxn.paymentReference} as narration.`,
        callback_url: `https://salmartonline.com.ng/pay-success?ref=${existingTxn.paymentReference}`
      });
    }

    // ✅ Create new transaction
    const reference = `SALMART_${postId}_${buyerId}_${Date.now()}`;

    await Transaction.create({
      postId,
      buyerId,
      sellerId,
      buyerEmail: email,
      amount,
      paymentReference: reference,
      status: 'awaiting_payment',
      dedicatedAccountDetails: {
        accountName: 'SALMART TECHNOLOGIES',
        accountNumber: '0000700239',
        bankName: 'Titan Bank',
        bankSlug: 'titan-bank'
      }
    });

    console.log('[PAY] New transaction created:', reference);

    res.json({
      success: true,
      reference,
      amount,
      accountNumber: '0000700239',
      bankName: 'Titan Bank',
      accountName: 'SALMART TECHNOLOGIES',
      message: `Pay ₦${amount} to Titan Bank 0000700239. Use ${reference} as narration.`,
      callback_url: `https://salmart.onrender.com/payment-success?ref=${reference}`
    });
  } catch (error) {
    console.error('[PAY] Error:', error.message, error.stack);
    res.status(500).json({ message: 'Server error while creating transaction' });
  }
});

// Paystack Webhook
router.post('/paystack/webhook', async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  const hash = crypto
    .createHmac('sha512', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Unauthorized webhook request');
  }

  const event = req.body;

  try {
    if (event.event === 'charge.success') {
      const data = event.data;

      const reference = data.reference;
      const email = data.customer?.email;
      const amount = data.amount / 100;
      const channel = data.channel;
      const narration = data?.narration || data?.log?.history?.[0]?.message || null;
      const currency = data.currency || "NGN";

      let txn = await Transaction.findOne({ paymentReference: reference });

      if (!txn) {
        txn = await Transaction.findOne({
          buyerEmail: email,
          amount,
          status: 'awaiting_payment'
        });
      }

      if (txn && txn.status === 'awaiting_payment') {
        txn.status = 'in_escrow';
        txn.paidAt = new Date(data.paid_at || Date.now());
        txn.paymentChannel = channel;
        txn.narration = narration;
        txn.currency = currency;
        txn.buyerEmail = email;
        await txn.save();

        // ✅ Mark associated post as sold
        if (txn.postId) {
          await Post.findByIdAndUpdate(txn.postId, { isSold: true });
          console.log(`✅ Post ${txn.postId} marked as sold due to payment [${reference}]`);
        } else {
          console.warn(`⚠️ Transaction has no postId to mark as sold`);
        }

        console.log(`✅ Transaction updated for reference: ${reference}`);
      } else {
        console.warn(`⚠️ No matching transaction found or already processed for reference: ${reference}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook processing failed:', err);
    res.sendStatus(500);
  }
});

  router.get('/payment-success', async (req, res) => {
    logger.info('Received redirect to /payment-success. Verifying transaction via reference.');
    const requestId = `REDIRECT_SUCCESS_${Date.now()}`;
    const { reference } = req.query; // This `reference` is the Paystack transaction reference

    try {
      if (!reference) {
        throw new Error("No payment reference found for verification.");
      }

      // Verify payment with Paystack
      const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const data = paystackResponse.data;

      if (!data.status || data.data.status !== 'success') {
        throw new Error(data.message || "Payment verification failed on redirect.");
      }

      // Find the transaction in your database using the Paystack reference
      const internalTransaction = await Transaction.findOne({ paymentReference: reference });

      let receiptData = {};
      let receiptStatus = { success: false, message: 'Receipt status unknown on redirect' };

      if (internalTransaction) {
        const [buyer, seller, post] = await Promise.all([
          User.findById(internalTransaction.buyerId),
          User.findById(internalTransaction.sellerId),
          Post.findById(internalTransaction.productId)
        ]);

        if (buyer && seller && post) {
          receiptData = {
            reference: internalTransaction.paymentReference,
            amountPaid: internalTransaction.amount,
            transactionDate: internalTransaction.paidAt || data.data.paid_at,
            buyerName: `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim(),
            email: buyer.email,
            productTitle: post.title || post.description || "Product",
            sellerName: `${seller.firstName} ${seller.lastName}`,
            buyerId: buyer._id.toString(),
            sellerId: seller._id.toString()
          };
          // The webhook should have ideally processed the receipt generation.
          // This path primarily serves as a confirmation page for the user.
          receiptStatus.success = internalTransaction.receiptImageUrl ? true : false;
          receiptStatus.message = internalTransaction.receiptImageUrl ? 'Digital receipt sent to seller.' : 'Receipt processing ongoing or failed. Check seller chat.';
        }
      } else {
        // Fallback if internal transaction isn't found (e.g., webhook delay)
        logger.warn('Internal transaction not found by reference in /payment-success redirect. Webhook may be pending.', { requestId, reference });
        receiptData = {
          reference: reference,
          amountPaid: data.data.amount / 100,
          transactionDate: data.data.paid_at,
          buyerName: data.data.customer.first_name + ' ' + data.data.customer.last_name,
          email: data.data.customer.email,
          productTitle: metadata?.custom_fields?.find(f => f.variable_name === 'product_name')?.value || 'Unknown Product',
          sellerName: 'Unknown Seller'
        };
        receiptStatus.message = 'No internal transaction found to confirm full processing. Please check your order status later.';
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
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
            .container { background: white; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; max-width: 480px; width: 100%; position: relative; }
            .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 40px 30px 30px; text-align: center; position: relative; }
            .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="1" fill="white" opacity="0.1"/><circle cx="80" cy="40" r="1" fill="white" opacity="0.1"/><circle cx="40" cy="80" r="1" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>'); opacity: 0.3; }
            .logo { width: 80px; height: 80px; background: rgba(255, 255, 255, 0.2); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; font-weight: 700; backdrop-filter: blur(10px); position: relative; z-index: 1; }
            .title { font-size: 28px; font-weight: 700; margin-bottom: 8px; position: relative; z-index: 1; }
            .subtitle { font-size: 16px; opacity: 0.9; font-weight: 400; position: relative; z-index: 1; }
            .status-badge { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 16px 24px; margin: 30px; border-radius: 16px; text-align: center; font-weight: 600; font-size: 18px; box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3); }
            .receipt-section { padding: 30px; }
            .section-title { font-size: 20px; font-weight: 600; color: #1f2937; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
            .detail-card { background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
            .detail-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
            .detail-row:last-child { margin-bottom: 0; }
            .detail-label { font-size: 14px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
            .detail-value { font-size: 16px; color: #1e293b; font-weight: 600; text-align: right; max-width: 60%; word-break: break-word; }
            .amount-highlight { background: linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%); border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center; }
            .amount-label { font-size: 14px; color: #92400e; font-weight: 500; margin-bottom: 8px; }
            .amount-value { font-size: 32px; color: #92400e; font-weight: 700; }
            .receipt-status { padding: 20px 30px; background: ${receiptStatus.success ? '#f0fdf4' : '#fef2f2'}; border-top: 1px solid ${receiptStatus.success ? '#bbf7d0' : '#fecaca'}; text-align: center; }
            .status-icon { font-size: 24px; margin-bottom: 8px; }
            .status-text { font-size: 16px; font-weight: 600; color: ${receiptStatus.success ? '#166534' : '#dc2626'}; margin-bottom: 4px; }
            .status-detail { font-size: 14px; color: ${receiptStatus.success ? '#15803d' : '#b91c1c'}; }
            .footer { background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
            .footer-text { font-size: 12px; color: #64748b; line-height: 1.5; }
            @media (max-width: 480px) { .container { margin: 10px; border-radius: 16px; } .header { padding: 30px 20px 20px; } .receipt-section { padding: 20px; } .detail-row { flex-direction: column; gap: 4px; } .detail-value { text-align: left; max-width: 100%; } }
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
                  <span class="detail-value">${receiptData.reference || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date</span>
                  <span class="detail-value">${receiptData.transactionDate ? new Date(receiptData.transactionDate).toLocaleString('en-NG') : 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Buyer</span>
                  <span class="detail-value">${receiptData.buyerName || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Email</span>
                  <span class="detail-value">${receiptData.email || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Product</span>
                  <span class="detail-value">${receiptData.productTitle || 'N/A'}</span>
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
                ${receiptStatus.success ? 'Receipt Sent Successfully' : 'Receipt Delivery Status Unknown'}
              </div>
              <div class="status-detail">
                ${receiptStatus.success
                  ? 'Digital receipt has been automatically sent to the seller'
                  : `There was an issue confirming receipt delivery. Please check seller chat. ${receiptStatus.message}`
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

    } catch (error) {
      logger.error('Error on /payment-success redirect', { requestId, error: error.message, stack: error.stack });
      res.status(500).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Error - Salmart</title>
          <style>
            body { font-family: 'Inter', sans-serif; background: #fee2e2; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
            .error-container { background: white; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); max-width: 400px; }
            .error-icon { font-size: 48px; color: #dc2626; margin-bottom: 20px; }
            .error-title { font-size: 24px; color: #1f2937; margin-bottom: 16px; font-weight: 600; }
            .error-message { color: #6b7280; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <div class="error-icon">⚠️</div>
            <h1 class="error-title">Payment Verification Failed</h1>
            <p class="error-message">An unexpected error occurred during payment verification. Please check your transaction history. Details: ${error.message}</p>
          </div>
        </body>
        </html>
      `);
    }
  });

// GET /verify-payment/:reference
router.get('/verify-payment/:reference', async (req, res) => {
  const reference = req.params.reference;

  try {
    const txn = await Transaction.findOne({ paymentReference: reference });

    if (!txn) {
      console.warn(`[VERIFY PAYMENT] Reference not found: ${reference}`);
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    console.log(`[VERIFY PAYMENT] Found transaction:`, {
      reference: txn.paymentReference,
      status: txn.status,
      amount: txn.amount
    });

    // Only check status, don't update anything here
    if (
      txn.status === 'in_escrow' ||
      txn.status === 'transfer_initiated' ||
      txn.status === 'completed'
    ) {
      return res.json({
        success: true,
        data: {
          status: 'success',
          message: 'Payment confirmed',
          amount: txn.amount,
          buyerId: txn.buyerId,
          sellerId: txn.sellerId,
          productId: txn.postId
        }
      });
    }

    if (txn.status === 'awaiting_payment') {
      return res.json({
        success: true,
        data: {
          status: 'pending',
          message: 'Payment not yet confirmed'
        }
      });
    }

    // Any other status
    return res.json({
      success: true,
      data: {
        status: txn.status,
        message: `Payment status: ${txn.status}`
      }
    });
  } catch (error) {
    console.error('[VERIFY PAYMENT] Failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying payment'
    });
  }
});
  return router;
};
