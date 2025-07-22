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
const crypto = require('crypto');

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
const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY); // Note: The Paystack SDK is not directly used in these updated routes, but axios is for direct API calls.

// Configure Winston logger
const logger = winston.createLogger({
  level: 'debug', // Ensure debug level to see detailed logs
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.metadata() // This is good for adding extra context
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename: 'logs/paymentRoutes.log' }),
  ]
});

// Constants
const COMMISSION_PERCENT = 3;
const RECEIPT_TIMEOUT = 30000; // Not directly used in this code path, but kept for context

// PT Account Details
const PT_ACCOUNT_DETAILS = {
  accountNumber: '0000700239',
  accountName: 'SALMART TECHNOLOGIES',
  bankName: 'Titan Trust Bank',
  bankCode: '58',
  bankSlug: 'titan-trust-bank'
};

module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    logger.info('Attached io to request object in paymentRoutes');
    next();
  });

  // Helper function to generate product-specific reference
  const generateProductReference = (postId) => {
    const timestamp = Date.now().toString(36).slice(-4);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    const shortPostId = postId.slice(-4); // Use last 4 chars of ObjectId
    return `SALM-${shortPostId}-${timestamp}-${random}`;
  };

  // Helper function to validate payment request (kept for compatibility, though not directly used in /pay)
  const validatePaymentRequest = (body) => {
    const { email, postId, buyerId, amount } = body;
    const errors = [];

    if (!email) errors.push('Email is required');
    if (!buyerId) errors.push('Buyer ID is required');
    if (!postId) errors.push('Post ID is required');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) errors.push('Valid amount is required');

    return errors;
  };

  // Enhanced receipt generation with product information
  const generateModernReceipt = async (receiptData) => {
    try {
      const {
        reference,
        amountPaid,
        transactionDate,
        buyerName,
        email,
        productTitle,
        sellerName,
        productId,
        productCategory
      } = receiptData;

      const receiptsDir = path.join(__dirname, 'receipts');
      await fs.mkdir(receiptsDir, { recursive: true });

      const imagePath = path.join(receiptsDir, `${reference}.png`);
      const image = new Jimp(650, 1000, 0xFFFFFFFF);

      // Load fonts
      const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK);
      const fontRegular = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
      const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
      const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

      // Header gradient
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

      // Logo
      const logoArea = await Jimp.create(100, 100, 0x1E3A8AFF);
      logoArea.print(fontLarge, 25, 20, 'S', 50, 60);
      image.composite(logoArea, 50, 40);

      // Header text
      image.print(fontBold, 170, 50, 'SALMART', 400);
      image.print(fontRegular, 170, 85, 'Payment Receipt', 400);
      image.print(fontSmall, 170, 110, 'Digital Transaction Confirmation', 400);

      // Success badge
      const successBadge = await Jimp.create(200, 50, 0x10B981FF);
      successBadge.print(fontRegular, 40, 15, '✓ VERIFIED', 120);
      image.composite(successBadge, 450, 65);

      // Card background
      const cardY = 220;
      const cardHeight = 650;
      const card = await Jimp.create(590, cardHeight, 0xF9FAFBFF);

      // Card borders
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

      // Transaction reference
      image.print(fontSmall, leftMargin, yPos, 'TRANSACTION REFERENCE', 300);
      image.print(fontRegular, leftMargin, yPos + 18, reference.toUpperCase(), 500);
      yPos += lineHeight + 10;

      // Separator line
      for (let x = leftMargin; x < 590; x++) {
        image.setPixelColor(0xE5E7EBFF, x, yPos);
      }
      yPos += 25;

      // Amount section
      const amountBg = await Jimp.create(530, 80, 0xF0F9FFFF);
      image.composite(amountBg, leftMargin, yPos);

      image.print(fontSmall, leftMargin + 20, yPos + 15, 'AMOUNT PAID', 300);
      image.print(fontBold, leftMargin + 20, yPos + 35, `₦${Number(amountPaid).toLocaleString('en-NG')}`, 400);
      yPos += 100;

      // Enhanced details with product information
      const details = [
        { label: 'PAYMENT DATE', value: new Date(transactionDate).toLocaleDateString('en-NG', {
          year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })},
        { label: 'BUYER NAME', value: buyerName },
        { label: 'BUYER EMAIL', value: email },
        { label: 'PRODUCT', value: productTitle },
        { label: 'PRODUCT ID', value: productId ? productId.slice(-8) : 'N/A' },
        { label: 'CATEGORY', value: productCategory || 'General' },
        { label: 'SELLER', value: sellerName },
        { label: 'PAYMENT METHOD', value: 'Bank Transfer (PT Account)' },
        { label: 'STATUS', value: 'COMPLETED' }
      ];

      details.forEach(({ label, value }) => {
        image.print(fontSmall, leftMargin, yPos, label, 250);
        image.print(fontRegular, leftMargin, yPos + 18, value, 500);
        yPos += lineHeight;
      });

      // Footer
      yPos = 900;
      for (let x = 50; x < 600; x++) {
        image.setPixelColor(0xD1D5DBFF, x, yPos - 20);
      }

      image.print(fontSmall, 50, yPos, '© 2025 Salmart Technologies', 300);
      image.print(fontSmall, 50, yPos + 20, 'Secure Digital Commerce Platform', 300);
      image.print(fontSmall, 400, yPos, `Receipt ID: ${reference.slice(-8)}`, 200);
      image.print(fontSmall, 400, yPos + 20, new Date().toISOString().split('T')[0], 200);

      await image.writeAsync(imagePath);

      // Upload to Cloudinary
      const cloudinaryResponse = await cloudinary.uploader.upload(imagePath, {
        public_id: `receipts/${reference}`,
        folder: 'salmart_receipts',
        quality: 'auto:good',
        format: 'png'
      });

      await fs.unlink(imagePath);

      return cloudinaryResponse.secure_url;
    } catch (error) {
      logger.error('Receipt generation failed:', { error: error.message, stack: error.stack, receiptData });
      throw error;
    }
  };

  // Enhanced receipt sender with product context
  const sendReceiptToSeller = async (receiptData, receiptImageUrl, io) => {
    try {
      const { buyerId, sellerId, buyerName, productTitle, reference, productId } = receiptData;

      const message = new Message({
        senderId: buyerId,
        receiverId: sellerId,
        messageType: 'image',
        attachment: { url: receiptImageUrl },
        text: `✅ Payment Receipt - ${productTitle} (Product ID: ${productId?.slice(-8)})`,
        status: 'sent',
        timestamp: new Date()
      });

      await message.save();

      // Send socket notification
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
          reference,
          productId
        }
      );

      return { success: true };
    } catch (error) {
      logger.error('Failed to send receipt to seller:', { error: error.message, stack: error.stack, receiptData });
      return { success: false, error: error.message };
    }
  };

 // Enhanced POST /api/pay for PT account flow
router.post('/initiate', async (req, res) => {
  try {
    const { email, postId, buyerId, expectedPrice } = req.body;

    // Validate input
    if (!postId || !buyerId || !email) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ message: 'Invalid post ID format' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (post.isSold) {
      return res.status(400).json({ 
        message: 'Product already sold',
        productTitle: post.title,
        soldAt: post.soldAt
      });
    }

    const sellerId = post.createdBy?.userId || post.createdBy;
    if (!mongoose.isValidObjectId(sellerId)) {
      return res.status(400).json({ message: 'Invalid seller ID' });
    }

    const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({ message: 'Buyer not found' });
    }

    const amount = parseFloat(post.price);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Invalid product price' });
    }

    if (expectedPrice && Math.abs(amount - expectedPrice) > 0.01) {
      return res.status(400).json({ 
        message: 'Price mismatch',
        expected: expectedPrice,
        actual: amount
      });
    }

    // Check for existing pending txn
    const existingTxn = await Transaction.findOne({
      postId,
      buyerId,
      status: 'awaiting_payment'
    });

    if (existingTxn) {
      logger.info(`[PAY] Found existing pending txn:`, { ref: existingTxn.paymentReference });

      return res.json({
        success: true,
        reference: existingTxn.paymentReference,
        amount: existingTxn.amount,
        productTitle: post.title,
        productId: postId,
        accountNumber: PT_ACCOUNT_DETAILS.accountNumber,
        bankName: PT_ACCOUNT_DETAILS.bankName,
        accountName: PT_ACCOUNT_DETAILS.accountName,
        checkoutType: 'pt_manual_transfer',
        message: `Transfer ₦${existingTxn.amount} to ${PT_ACCOUNT_DETAILS.bankName} ${PT_ACCOUNT_DETAILS.accountNumber} using "${existingTxn.paymentReference}" as narration.`,
        callback_url: `${process.env.CALLBACK_URL}/payment-success?ref=${existingTxn.paymentReference}`,
        instructions: {
          title: `Pay for "${post.title}"`,
          steps: [
            `Transfer ₦${existingTxn.amount} to ${PT_ACCOUNT_DETAILS.bankName}`,
            `Acct No: ${PT_ACCOUNT_DETAILS.accountNumber}`,
            `Acct Name: ${PT_ACCOUNT_DETAILS.accountName}`,
            `Use "${existingTxn.paymentReference}" as transfer narration`,
            `Once we detect your payment, this product will be marked as sold`
          ]
        }
      });
    }

    // Generate new reference
    const reference = generateProductReference(postId); // e.g. SALM-p123-buyer123-1720457600
    const narrationKey = reference.toLowerCase();

    // Create new transaction
    const newTxn = await Transaction.create({
      postId,
      buyerId,
      sellerId,
      buyerEmail: email,
      amount,
      paymentReference: reference,
      narrationKey, // <-- ADD THIS
      status: 'awaiting_payment',
      paymentMethod: 'pt_account_transfer',
      createdAt: new Date(),
      productMetadata: {
        productTitle: post.title,
        productDescription: post.description,
        productCategory: post.category,
        productImages: post.images,
        productLocation: post.location,
        productCondition: post.condition,
        createdAt: post.createdAt
      },
      dedicatedAccountDetails: {
        accountName: PT_ACCOUNT_DETAILS.accountName,
        accountNumber: PT_ACCOUNT_DETAILS.accountNumber,
        bankName: PT_ACCOUNT_DETAILS.bankName,
        bankCode: PT_ACCOUNT_DETAILS.bankCode,
        bankSlug: PT_ACCOUNT_DETAILS.bankSlug
      }
    });

    logger.info(`[PAY] Created new PT transaction`, {
      ref: reference,
      productTitle: post.title,
      buyer: `${buyer.firstName} ${buyer.lastName}`,
      narrationKey
    });

    res.json({
      success: true,
      reference,
      amount,
      productTitle: post.title,
      productId: postId,
      accountNumber: PT_ACCOUNT_DETAILS.accountNumber,
      bankName: PT_ACCOUNT_DETAILS.bankName,
      accountName: PT_ACCOUNT_DETAILS.accountName,
      checkoutType: 'pt_manual_transfer',
      message: `Transfer ₦${amount} to ${PT_ACCOUNT_DETAILS.bankName} ${PT_ACCOUNT_DETAILS.accountNumber} using "${reference}" as narration.`,
      callback_url: `${process.env.CALLBACK_URL}/payment-success?ref=${reference}`,
      instructions: {
        title: `Pay for "${post.title}"`,
        steps: [
          `Transfer ₦${amount} to ${PT_ACCOUNT_DETAILS.bankName}`,
          `Acct No: ${PT_ACCOUNT_DETAILS.accountNumber}`,
          `Acct Name: ${PT_ACCOUNT_DETAILS.accountName}`,
          `Use "${reference}" as transfer narration`,
          `Once we detect your payment, this product will be marked as sold`
        ]
      }
    });

  } catch (err) {
    logger.error('[PAY] Error creating PT transaction:', {
      error: err.message,
      stack: err.stack,
      postId: req.body.postId
    });
    res.status(500).json({
      message: 'Server error while creating transaction',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

  // Enhanced Paystack Webhook for PT Account
  router.post('/paystack/webhook', async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    // Verify webhook signature
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      logger.warn('Unauthorized webhook request received', {
        paystackSignature: req.headers['x-paystack-signature'],
        calculatedHash: hash,
        webhookBodySample: JSON.stringify(req.body).substring(0, 500) + '...' // Log a sample of the body
      });
      return res.status(401).send('Unauthorized webhook request');
    }

    const event = req.body;
    logger.info(`[WEBHOOK] Received event: ${event.event}`, {
      paystack_event_id: event.id, // Unique ID for the event
      paystack_internal_reference: event.data?.reference, // This is Paystack's own reference for the transaction
      amount_kobo: event.data?.amount, // In kobo
      channel: event.data?.channel,
      narration_from_paystack: event.data?.narration, // THIS IS THE CRITICAL FIELD for user's input
      customer_email: event.data?.customer?.email,
      event_type: event.event,
      payment_type: event.data?.payment_method
    });

    try {
      if (event.event === 'charge.success') {
        const data = event.data;
        const paystackInternalRef = data.reference; // Paystack's unique transaction ID
        const buyerEmail = data.customer?.email;
        const receivedAmount = data.amount / 100; // Convert from kobo to naira
        const channel = data.channel;
        const fullNarration = data.narration; // The full narration string from the bank transfer
        const currency = data.currency || "NGN";

        // --- Step 1: Attempt to extract your SALM- reference from the narration ---
        // Regex to find "SALM-XXXX-YYYY-ZZZZ" pattern (case-insensitive)
        const salmRefRegex = /(SALM-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})/i;
        const match = fullNarration ? fullNarration.match(salmRefRegex) : null;
        const extractedSalmRef = match ? match[1] : null; // This should be your paymentReference

        logger.debug(`[WEBHOOK DEBUG] Raw Narration (data.narration): ${fullNarration}`, { extractedSalmRef, paystackInternalRef });
        logger.debug(`[WEBHOOK DEBUG] Extracted SALM-Reference: ${extractedSalmRef}`);
        logger.debug(`[WEBHOOK DEBUG] Paystack Internal Reference (data.reference): ${paystackInternalRef}`);
        logger.debug(`[WEBHOOK DEBUG] Received Amount (Naira): ${receivedAmount}`);
        
        let txn = null;

        // --- Step 2: Primary lookup by the extracted SALM- reference ---
        if (extractedSalmRef) {
          logger.debug(`[WEBHOOK DEBUG] Attempting primary lookup by extracted SALM-ref: ${extractedSalmRef}`);
          txn = await Transaction.findOne({ paymentReference: extractedSalmRef });
          if (txn) {
            logger.debug(`[WEBHOOK DEBUG] Found transaction by extracted SALM-ref: ${txn._id}`);
          } else {
            logger.warn(`[WEBHOOK DEBUG] No transaction found for extracted SALM-ref: ${extractedSalmRef}`);
          }
        }

        // --- Step 3: Fallback lookup by Paystack's internal reference ---
        // This relies on `paystackTransactionId` being stored on your Transaction model.
        if (!txn && paystackInternalRef) {
          logger.debug(`[WEBHOOK DEBUG] Attempting fallback lookup by Paystack Internal Ref: ${paystackInternalRef}`);
          txn = await Transaction.findOne({ paystackTransactionId: paystackInternalRef });
          if (txn) {
             logger.debug(`[WEBHOOK DEBUG] Found transaction by Paystack Internal Ref: ${txn._id}`);
          } else {
            logger.warn(`[WEBHOOK DEBUG] No transaction found for Paystack Internal Ref: ${paystackInternalRef}`);
          }
        }

        // --- Step 4: Final fallback lookup by buyer email and amount ---
        // This is the least precise but can catch cases where references are totally missing.
        if (!txn) {
          logger.warn(`[WEBHOOK DEBUG] Both reference lookups failed. Attempting final fallback by email and amount.`);
          txn = await Transaction.findOne({
            buyerEmail: buyerEmail,
            amount: receivedAmount,
            status: 'awaiting_payment' // Only consider if still awaiting
          });
          if (txn) {
            logger.debug(`[WEBHOOK DEBUG] Found transaction by email/amount fallback: ${txn._id}`);
          } else {
            logger.warn(`[WEBHOOK DEBUG] No transaction found via email/amount fallback for email: ${buyerEmail}, amount: ${receivedAmount}`);
          }
        }


        // --- Step 5: Process the found transaction ---
        if (txn && txn.status === 'awaiting_payment') {
          logger.info(`[WEBHOOK] Processing transaction ${txn.paymentReference} (ID: ${txn._id}) from 'awaiting_payment' to 'in_escrow'.`, {
            paystackInternalRef,
            extractedSalmRef: extractedSalmRef || 'N/A'
          });
          
          // Update transaction status
          txn.status = 'in_escrow';
          txn.paidAt = new Date(data.paid_at || Date.now());
          txn.paymentChannel = channel;
          txn.narration = fullNarration; // Store the complete narration
          txn.currency = currency;
          txn.buyerEmail = buyerEmail; // Update buyer email in case it was missing or changed
          txn.paystackTransactionId = paystackInternalRef; // Store Paystack's unique ID for this transaction
          
          await txn.save();

          // 🎯 MARK POST AS SOLD
          if (txn.postId) {
            const updatedPost = await Post.findByIdAndUpdate(
              txn.postId, // Assuming postId is just the ID string here
              { 
                isSold: true,
                soldAt: new Date(),
                soldTo: txn.buyerId,
                soldPrice: txn.amount,
                soldReference: extractedSalmRef || paystackInternalRef // Use extracted ref or Paystack's ref
              },
              { new: true }
            );

            if (updatedPost) {
              logger.info(`✅ Post ${txn.postId} marked as sold via webhook.`, {
                reference_used: extractedSalmRef || paystackInternalRef,
                productTitle: updatedPost.title,
                soldPrice: txn.amount,
                buyerId: txn.buyerId
              });

              // Emit real-time update to seller
              req.io?.to(`user_${txn.sellerId}`).emit('productSold', {
                postId: txn.postId,
                productTitle: updatedPost.title,
                soldPrice: txn.amount,
                reference: extractedSalmRef || paystackInternalRef,
                buyerId: txn.buyerId,
                soldAt: updatedPost.soldAt
              });
            } else {
              logger.warn(`⚠️ Post ${txn.postId} not found for marking as sold via webhook`);
            }
          } else {
            logger.warn(`⚠️ Transaction has no postId to mark as sold (Txn ID: ${txn._id})`);
          }

          // Generate and send receipt
          try {
            const [buyer, seller, post] = await Promise.all([
              User.findById(txn.buyerId),
              User.findById(txn.sellerId),
              Post.findById(txn.postId)
            ]);

            if (buyer && seller && post) {
              const receiptData = {
                reference: txn.paymentReference, // Use your internal SALM- reference for the receipt
                amountPaid: txn.amount,
                transactionDate: txn.paidAt,
                buyerName: `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim(),
                email: buyer.email,
                productTitle: post.title || post.description || "Product",
                productId: txn.postId,
                productCategory: post.category,
                sellerName: `${seller.firstName} ${seller.lastName}`,
                buyerId: buyer._id.toString(),
                sellerId: seller._id.toString()
              };

              // Generate receipt
              const receiptImageUrl = await generateModernReceipt(receiptData);
              
              // Send receipt to seller
              await sendReceiptToSeller(receiptData, receiptImageUrl, req.io);

              // Update transaction with receipt URL
              txn.receiptImageUrl = receiptImageUrl;
              await txn.save();

              logger.info(`✅ Receipt generated and sent for transaction: ${txn.paymentReference}`);
            } else {
              logger.warn(`⚠️ Could not generate receipt for transaction ${txn.paymentReference}: Missing buyer, seller, or post data.`);
            }
          } catch (receiptError) {
            logger.error('Receipt generation or sending failed in webhook:', {
              transactionId: txn._id,
              error: receiptError.message,
              stack: receiptError.stack
            });
          }

          logger.info(`✅ Transaction ${txn.paymentReference} fully processed successfully by webhook.`);
        } else if (txn && txn.status !== 'awaiting_payment') {
          logger.warn(`⚠️ Transaction ${txn.paymentReference} already processed with status: ${txn.status}. No action taken by webhook.`);
        } else {
          logger.warn(`⚠️ No matching transaction found for any provided reference or fallback. Webhook did not process payment.`, {
            paystackRef: paystackInternalRef,
            extractedSalmRef: extractedSalmRef,
            buyerEmail: buyerEmail,
            amount: receivedAmount
          });
        }
      } else {
        logger.info(`[WEBHOOK] Received non-charge.success event: ${event.event}. Not processing.`);
      }

      res.sendStatus(200); // Always respond with 200 OK to Paystack
    } catch (err) {
      logger.error('❌ Webhook processing failed unexpectedly:', {
        error: err.message,
        stack: err.stack,
        event_type: event.event,
        paystack_internal_reference: event.data?.reference,
        narration: event.data?.narration
      });
      res.sendStatus(500); // Respond with 500 if an unhandled error occurs
    }
  });


router.get('/verify-payment/:reference', async (req, res) => {
  const reference = req.params.reference;

  try {
    // Case-insensitive DB search
    const txn = await Transaction.findOne({
      paymentReference: new RegExp(`^${reference}$`, 'i')
    })
      .populate('postId', 'title description price category images isSold')
      .populate('buyerId', 'firstName lastName email')
      .populate('sellerId', 'firstName lastName email');

    if (!txn) {
      logger.warn(`[VERIFY PAYMENT] No internal transaction found for ${reference}`);
    }

    // Always fetch and log Paystack ledger transactions
    try {
      const ledgerResp = await axios.get('https://api.paystack.co/balance/ledger', {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        params: { perPage: 20, page: 1 }
      });

      const ledgerTxs = ledgerResp.data?.data || [];
      const creditTxs = ledgerTxs.filter(tx => tx.type === 'credit');

      logger.info(`[PAYSTACK BALANCE] Retrieved ${creditTxs.length} ledger credits.`);

      creditTxs.slice(0, 5).forEach((tx, i) => {
        logger.info(`[BALANCE TX ${i + 1}]`, {
          amount: tx.amount / 100,
          description: tx.description,
          reference: tx.reference,
          date: tx.transaction_date,
        });
      });

      if (!txn) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found in system, but Paystack balance credits logged'
        });
      }

      if (txn.status !== 'awaiting_payment') {
        return res.json({
          success: true,
          message: 'Payment already confirmed.',
          data: txn
        });
      }

      logger.info(`[VERIFY PAYMENT] Trying to match reference "${reference}" via balance ledger`);

      const matched = creditTxs.find(t =>
        t.amount / 100 === txn.amount &&
        Math.abs(new Date(t.transaction_date) - new Date(txn.createdAt)) < 20 * 60 * 1000 // within 20 minutes
      );

      if (!matched) {
        return res.json({
          success: false,
          message: 'No matching credit found yet. Try again shortly.',
          data: { status: txn.status, productTitle: txn.postId?.title }
        });
      }

      // ✅ Match found
      txn.status = 'in_escrow';
      txn.paidAt = new Date(matched.transaction_date || Date.now());
      txn.paymentChannel = 'manual_bank_transfer';
      txn.currency = 'NGN';
      txn.narration = matched.description || 'PT Auto Top-up';
      txn.paystackTransactionId = matched.reference;

      await txn.save();
      await markProductAsSold(txn, reference, req.io);

      return res.json({
        success: true,
        message: 'Payment confirmed via PT balance ledger match',
        data: txn
      });

    } catch (err) {
      logger.error('[PAYSTACK LEDGER] Error verifying via balance ledger:', {
        message: err.message,
        stack: err.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Server error while checking balance ledger for payment'
      });
    }

  } catch (err) {
    logger.error('[VERIFY PAYMENT] Unexpected error:', {
      error: err.message,
      stack: err.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Server error during verification'
    });
  }
});

// Helper to mark product as sold
async function markProductAsSold(txn, reference, io) {
  if (!txn.postId || txn.postId.isSold) return;

  const updatedPost = await Post.findByIdAndUpdate(
    txn.postId._id,
    {
      isSold: true,
      soldAt: new Date(),
      soldTo: txn.buyerId,
      soldPrice: txn.amount,
      soldReference: reference
    },
    { new: true }
  );

  if (updatedPost) {
    logger.info(`✅ Post "${updatedPost.title}" marked as sold for ${reference}`);
    io?.to(`user_${txn.sellerId}`).emit('productSold', {
      postId: updatedPost._id,
      productTitle: updatedPost.title,
      soldPrice: txn.amount,
      reference,
      buyerId: txn.buyerId._id,
      soldAt: updatedPost.soldAt
    });

    // Optional: send receipt
    try {
      const receiptData = {
        reference: txn.paymentReference,
        amountPaid: txn.amount,
        transactionDate: txn.paidAt,
        buyerName: `${txn.buyerId.firstName} ${txn.buyerId.lastName}`,
        email: txn.buyerId.email,
        productTitle: updatedPost.title,
        productId: updatedPost._id.toString(),
        productCategory: updatedPost.category,
        sellerName: `${txn.sellerId.firstName} ${txn.sellerId.lastName}`,
        buyerId: txn.buyerId._id.toString(),
        sellerId: txn.sellerId._id.toString()
      };

      const receiptImageUrl = await generateModernReceipt(receiptData);
      await sendReceiptToSeller(receiptData, receiptImageUrl, io);

      txn.receiptImageUrl = receiptImageUrl;
      await txn.save();
      logger.info(`✅ Receipt sent for ${reference}`);
    } catch (err) {
      logger.error('Receipt generation/sending failed:', err.message);
    }
  } else {
    logger.warn(`⚠️ Failed to update post as sold for reference ${reference}`);
  }
}
  router.get('/payment-success', async (req, res) => {
    logger.info('Received redirect to /payment-success. Verifying transaction via reference.');
    const requestId = `REDIRECT_SUCCESS_${Date.now()}`;
    const { reference } = req.query; // This `reference` is the Paystack transaction reference (your SALM- ref)

    try {
      if (!reference) {
        logger.error(`[PAYMENT SUCCESS] No payment reference found in query for requestId: ${requestId}`);
        throw new Error("No payment reference found for verification.");
      }

      // Verify payment with Paystack using YOUR SALM- reference
      const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const data = paystackResponse.data;

      if (!data.status || data.data.status !== 'success') {
        logger.warn(`[PAYMENT SUCCESS] Paystack verification failed for reference ${reference}: ${data.message}`, { requestId, paystackData: data.data });
        throw new Error(data.message || "Payment verification failed on redirect.");
      }

      // Find the transaction in your database using YOUR SALM- reference
      let internalTransaction = await Transaction.findOne({ paymentReference: reference });

      // If internal transaction not found or not updated by webhook yet, attempt to update it here
      if (internalTransaction && internalTransaction.status === 'awaiting_payment') {
          logger.info(`[PAYMENT SUCCESS] Internal transaction ${reference} found but status is awaiting_payment. Updating via redirect verification.`, { requestId });
          
          internalTransaction.status = 'in_escrow';
          internalTransaction.paidAt = new Date(data.data.paid_at || Date.now());
          internalTransaction.paymentChannel = data.data.channel;
          internalTransaction.narration = data.data.narration;
          internalTransaction.currency = data.data.currency || "NGN";
          internalTransaction.buyerEmail = data.data.customer?.email || internalTransaction.buyerEmail;
          internalTransaction.paystackTransactionId = data.data.id;
          await internalTransaction.save();

          // Also mark post as sold if not already
          if (internalTransaction.postId) {
              const updatedPost = await Post.findByIdAndUpdate(
                  internalTransaction.postId, 
                  { isSold: true, soldAt: new Date(), soldTo: internalTransaction.buyerId, soldPrice: internalTransaction.amount, soldReference: reference },
                  { new: true }
              );
              if (updatedPost) {
                  logger.info(`✅ Post ${internalTransaction.postId} marked as sold via /payment-success redirect.`);
                  req.io?.to(`user_${internalTransaction.sellerId}`).emit('productSold', {
                      postId: internalTransaction.postId,
                      productTitle: updatedPost.title,
                      soldPrice: internalTransaction.amount,
                      reference,
                      buyerId: internalTransaction.buyerId,
                      soldAt: updatedPost.soldAt
                  });
              }
          }
      } else if (!internalTransaction) {
          logger.warn(`[PAYMENT SUCCESS] No internal transaction found for reference ${reference}. This might indicate a missing initial transaction or webhook failure.`, { requestId });
          // Potentially create a placeholder transaction here if it's truly missing,
          // though it's better to ensure /pay creates it reliably.
      }


      let receiptData = {};
      let receiptStatus = { success: false, message: 'Receipt status unknown on redirect' };

      // Re-fetch or use updated internalTransaction for receipt data consistency
      if (internalTransaction) { // Check again in case it was just updated
        const [buyer, seller, post] = await Promise.all([
          User.findById(internalTransaction.buyerId),
          User.findById(internalTransaction.sellerId),
          Post.findById(internalTransaction.postId)
        ]);

        if (buyer && seller && post) {
          receiptData = {
            reference: internalTransaction.paymentReference,
            amountPaid: internalTransaction.amount,
            transactionDate: internalTransaction.paidAt || data.data.paid_at,
            buyerName: `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim(),
            email: buyer.email,
            productTitle: post.title || post.description || "Product",
            productId: internalTransaction.postId,
            productCategory: post.category,
            sellerName: `${seller.firstName} ${seller.lastName}`,
            buyerId: buyer._id.toString(),
            sellerId: seller._id.toString()
          };

          // Try to generate and send receipt here if it wasn't already generated (e.g. by webhook)
          if (!internalTransaction.receiptImageUrl) {
            try {
              const receiptImageUrl = await generateModernReceipt(receiptData);
              await sendReceiptToSeller(receiptData, receiptImageUrl, req.io);
              internalTransaction.receiptImageUrl = receiptImageUrl;
              await internalTransaction.save();
              logger.info(`✅ Receipt generated and sent via /payment-success redirect for ${reference}`);
              receiptStatus.success = true;
              receiptStatus.message = 'Digital receipt sent to seller.';
            } catch (receiptGenError) {
              logger.error('Receipt generation/sending failed during /payment-success redirect:', {
                error: receiptGenError.message
                stack: receiptGenError.stack,
                reference
              });
              receiptStatus.message = 'Receipt processing failed. Check seller chat.';
            }
          } else {
             receiptStatus.success = true; // Receipt already exists
             receiptStatus.message = 'Digital receipt already sent to seller.';
          }
        } else {
          logger.warn(`[PAYMENT SUCCESS] Missing buyer, seller, or post data for receipt generation for ref ${reference}.`);
          receiptStatus.message = 'Missing order details for receipt. Contact support.';
        }
      } else {
        // Fallback for receipt data if no internalTransaction could be found (edge case)
        receiptData = {
          reference: reference,
          amountPaid: data.data.amount / 100,
          transactionDate: data.data.paid_at,
          buyerName: data.data.customer?.first_name ? `${data.data.customer.first_name} ${data.data.customer.last_name || ''}`.trim() : data.data.customer?.email,
          email: data.data.customer?.email,
          productTitle: data.data.metadata?.custom_fields?.find(f => f.variable_name === 'product_name')?.value || 'Unknown Product', // Assuming metadata might hold product info
          sellerName: 'Unknown Seller'
        };
        receiptStatus.message = 'No internal transaction found. Please check your order status later.';
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

// POST /api/confirm-payment
router.post('/confirm-payment', async (req, res) => {
  const { reference } = req.body;

  try {
    const txn = await Transaction.findOne({
      paymentReference: new RegExp(`^${reference}$`, 'i'),
      status: 'awaiting_payment'
    });

    if (!txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found or already processed' });
    }

    txn.status = 'awaiting_admin_review';
    txn.confirmedByBuyer = true;
    txn.confirmedAt = new Date();
    await txn.save();

    logger.info(`[PAYMENT CONFIRMATION] Buyer confirmed payment for ${reference}. Awaiting admin review.`);

    res.json({ success: true, message: 'Payment submitted for admin review', data: txn });
  } catch (err) {
    logger.error('[CONFIRM PAYMENT ERROR]', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Error confirming payment' });
  }
});
  return router;
};
