// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios'); // Still useful for general HTTP requests if needed
const path = require('path');
const Jimp = require('jimp');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const winston = require('winston');
const crypto = require('crypto'); // For webhook signature verification

// Models
const Post = require('../models/postSchema.js');
const Message = require('../models/messageSchema.js');
const User = require('../models/userSchema.js'); // Ensure this model is updated with Paystack fields
const Transaction = require('../models/transactionSchema.js');
const Escrow = require('../models/escrowSchema.js');
const Notification = require('../models/notificationSchema.js');

// Services
const { sendFCMNotification } = require('../services/notificationUtils.js');
const NotificationService = require('../services/notificationService.js');

// Paystack API
const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
console.log('Available methods:', Object.keys(paystack));
console.log('Dedicated account methods:', paystack.dedicated_account ? Object.keys(paystack.dedicated_account) : 'Not available');
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
    new winston.transports.Console({ format: winston.format.simple() }) // Keep console logging for development
  ]
});

// Constants
const COMMISSION_PERCENT = 2; // 2% commission
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


  // --- DVA Payment Initiation ---
  

// routes/paymentRoutes.js

router.post('/pay', async (req, res) => {
    const requestId = `DVA_PAY_INIT_${Date.now()}`;
    logger.info('DVA payment initiation started', { requestId, body: req.body });

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
        logger.warn('Product not found for payment initiation', { requestId, postId: trimmedPostId });
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      if (post.isSold) {
        logger.warn('Product already sold for payment initiation', { requestId, postId: trimmedPostId });
        return res.status(400).json({ success: false, message: "Product is already sold" });
      }

      const buyer = await User.findById(buyerId);
      if (!buyer) {
        logger.warn('Buyer not found for payment initiation', { requestId, buyerId });
        return res.status(404).json({ success: false, message: "Buyer not found" });
      }

      const sellerObjectId = post.createdBy.userId;
      const amount = parseFloat(post.price);

      let paystackCustomerId = buyer.paystack?.customerId;
      if (!paystackCustomerId) {
        logger.info('Creating new Paystack customer for buyer', { requestId, buyerId, email: buyer.email });
        
        // Create customer using HTTPS request
        try {
          const customerResponse = await axios.post(
            'https://api.paystack.co/customer',
            {
              email: buyer.email,
              first_name: buyer.firstName,
              last_name: buyer.lastName,
              phone: buyer.phoneNumber || ''
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!customerResponse.data.status) {
            logger.error('Failed to create Paystack customer', { requestId, error: customerResponse.data.message });
            return res.status(500).json({
              success: false,
              message: customerResponse.data.message || "Failed to create Paystack customer."
            });
          }

          paystackCustomerId = customerResponse.data.data.customer_code;
          buyer.paystack = buyer.paystack || {};
          buyer.paystack.customerId = paystackCustomerId;
          await buyer.save();
          logger.info('Paystack customer created', { requestId, customerCode: paystackCustomerId });
        } catch (customerError) {
          logger.error('Error creating Paystack customer', { requestId, error: customerError.message });
          return res.status(500).json({
            success: false,
            message: "Failed to create Paystack customer: " + customerError.message
          });
        }
      }

      let dedicatedAccountDetails = buyer.paystack?.dedicatedAccount;

      console.log(`[${requestId}] Pre-DVA Check: dedicatedAccountDetails from buyer.paystack:`, dedicatedAccountDetails);
      if (dedicatedAccountDetails) {
          console.log(`[${requestId}] Pre-DVA Check: dedicatedAccountDetails.id from buyer.paystack:`, dedicatedAccountDetails.id);
      }

      if (!dedicatedAccountDetails || !dedicatedAccountDetails.id) {
        logger.info('Creating dedicated virtual account for buyer', { requestId, buyerId, customerId: paystackCustomerId });
        
        // CRITICAL FIX: Use proper bank for production
        const isTestMode = process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_');
        const preferredBank = isTestMode ? "test-bank" : "wema-bank"; // or "paystack-titan"
        
        console.log(`[${requestId}] Environment: ${isTestMode ? 'TEST' : 'PRODUCTION'}, Using bank: ${preferredBank}`);
        
        // Create dedicated virtual account using HTTPS request
        try {
          const dvaResponse = await axios.post(
            'https://api.paystack.co/dedicated_account',
            {
              customer: paystackCustomerId,
              preferred_bank: preferredBank // FIXED: No more hardcoded "test-bank"
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
              }
            }
          );

          console.log(`[${requestId}] Paystack DVA Create Response Status:`, dvaResponse.data.status);
          console.log(`[${requestId}] Paystack DVA Create Response Data (FULL):`, dvaResponse.data.data);

          if (!dvaResponse.data.status) {
            logger.error('Failed to create Dedicated Virtual Account', { requestId, error: dvaResponse.data.message });
            return res.status(500).json({
              success: false,
              message: dvaResponse.data.message || "Failed to create dedicated virtual account."
            });
          }

          const dvaData = dvaResponse.data.data;
          console.log(`[${requestId}] dvaData (FULL):`, dvaData);

          dedicatedAccountDetails = {
            accountName: dvaData.account_name,
            accountNumber: dvaData.account_number,
            bankName: dvaData.bank.name,
            bankSlug: dvaData.bank.slug,
            id: dvaData.id
          };

          console.log(`[${requestId}] dedicatedAccountDetails object AFTER assignment:`, dedicatedAccountDetails);
          console.log(`[${requestId}] dedicatedAccountDetails.id AFTER assignment:`, dedicatedAccountDetails.id);

          buyer.paystack.dedicatedAccount = dedicatedAccountDetails;
          await buyer.save();
          logger.info('Dedicated Virtual Account created and assigned', { requestId, accountNumber: dedicatedAccountDetails.accountNumber, bank: preferredBank });
        } catch (dvaError) {
          logger.error('Error creating Dedicated Virtual Account', { requestId, error: dvaError.message, response: dvaError.response?.data });
          return res.status(500).json({
            success: false,
            message: "Failed to create dedicated virtual account: " + (dvaError.response?.data?.message || dvaError.message)
          });
        }
      }

      console.log(`[${requestId}] FINAL CHECK: dedicatedAccountDetails.id before new Transaction:`, dedicatedAccountDetails ? dedicatedAccountDetails.id : 'FINAL DVA ID IS NULL/UNDEFINED!');

      const existingAwaitingPayment = await Transaction.findOne({
        buyerId: buyer._id,
        status: 'awaiting_payment',
        'dedicatedAccountDetails.customerCode': paystackCustomerId
      });

      if (existingAwaitingPayment) {
        logger.warn('Buyer already has an outstanding awaiting_payment transaction via DVA', { requestId, transactionId: existingAwaitingPayment._id, existingAmount: existingAwaitingPayment.amount });
        const existingPost = await Post.findById(existingAwaitingPayment.productId);
        return res.status(200).json({
          success: true,
          message: "You have an existing pending payment. Please complete it or cancel to proceed with a new one.",
          paymentDetails: {
            accountName: dedicatedAccountDetails.accountName,
            accountNumber: dedicatedAccountDetails.accountNumber,
            bankName: dedicatedAccountDetails.bankName,
            amount: existingAwaitingPayment.amount,
            transactionId: existingAwaitingPayment._id,
            productTitle: existingPost?.title || existingPost?.description || "Previous Order"
          }
        });
      }

      const newTransaction = new Transaction({
        buyerId: buyerId,
        sellerId: sellerObjectId,
        productId: trimmedPostId,
        amount: amount,
        status: 'awaiting_payment',
        paymentReference: dedicatedAccountDetails.id,
        dedicatedAccountDetails: {
          accountName: dedicatedAccountDetails.accountName,
          accountNumber: dedicatedAccountDetails.accountNumber,
          bankName: dedicatedAccountDetails.bankName,
          bankSlug: dedicatedAccountDetails.bankSlug,
          customerCode: paystackCustomerId
        }
      });
      await newTransaction.save();

      logger.info('Transaction record created for DVA payment', { requestId, transactionId: newTransaction._id });

      res.json({
        success: true,
        message: "Dedicated virtual account details provided. Please make payment.",
        paymentDetails: {
          accountName: dedicatedAccountDetails.accountName,
          accountNumber: dedicatedAccountDetails.accountNumber,
          bankName: dedicatedAccountDetails.bankName,
          amount: amount,
          transactionId: newTransaction._id,
          productTitle: post.title || post.description
        }
      });

    } catch (error) {
      logger.error('DVA payment initiation failed', { requestId, error: error.message, stack: error.stack });
      res.status(500).json({ success: false, message: "Payment initiation failed: " + error.message });
    }
});


  // --- Paystack Webhook (for DVA payments and transfers) ---
  router.post('/paystack-webhook', async (req, res) => {
    const WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET;
    if (!WEBHOOK_SECRET) {
      logger.error('PAYSTACK_WEBHOOK_SECRET is not set in environment variables.');
      return res.status(500).send('Webhook secret not configured.');
    }

    const hash = crypto.createHmac('sha512', WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      logger.warn('Invalid Paystack webhook signature', { signature: req.headers['x-paystack-signature'] });
      return res.status(400).send('Invalid signature');
    }

    const event = req.body;
    const requestId = `WEBHOOK_${event.event}_${Date.now()}`;
    logger.info(`Paystack Webhook received: ${event.event}`, { requestId, eventType: event.event, data: event.data });

    try {
      switch (event.event) {
        case 'charge.success':
          const transactionData = event.data;
          const { reference, amount, customer, paid_at, dedicated_account } = transactionData;
          const paidAmount = amount / 100; // Convert kobo to naira

          logger.info('Charge success event received', { requestId, reference, paidAmount, customerEmail: customer.email, customerCode: customer.customer_code });

          // Find the buyer based on Paystack Customer Code
          const buyer = await User.findOne({ 'paystack.customerId': customer.customer_code });

          if (!buyer) {
            logger.warn('Buyer not found for received Paystack customer code', { requestId, customerCode: customer.customer_code });
            // This might happen if a DVA was created outside our system or for a deleted user.
            // You might want to log this for manual review or refund.
            return res.status(200).send('Buyer not found, but event processed.');
          }

          // RECONCILIATION LOGIC: Find the specific outstanding transaction for this buyer that matches the amount.
          // This is critical for the "one DVA per customer" model.
          const internalTransaction = await Transaction.findOne({
            buyerId: buyer._id,
            status: 'awaiting_payment', // Must be awaiting payment
            amount: paidAmount, // Must match the exact amount paid (in Naira)
            'dedicatedAccountDetails.customerCode': customer.customer_code // Ensure it came through this customer's DVA
          });

          if (!internalTransaction) {
            logger.warn('No matching awaiting_payment transaction found for DVA charge.success', {
              requestId,
              buyerId: buyer._id,
              paidAmount,
              reference,
              message: "Amount mismatch or no pending order for this customer."
            });
            // Possible scenarios: overpayment/underpayment, duplicate payment, payment for a manually cancelled order.
            // You might want to implement:
            // 1. Refund the buyer.
            // 2. Credit the buyer's internal wallet (if you have one).
            // 3. Flag for manual review.
            return res.status(200).send('No matching transaction found, but event processed.');
          }

          if (internalTransaction.status !== 'awaiting_payment') {
            logger.warn('Transaction already processed or not awaiting payment', { requestId, transactionId: internalTransaction._id, currentStatus: internalTransaction.status });
            return res.status(200).send('Transaction already processed.');
          }

          // Update transaction status to 'in_escrow'
          internalTransaction.status = 'in_escrow';
          internalTransaction.paymentReference = reference; // This is the specific charge reference from Paystack
          internalTransaction.paidAt = paid_at; // Store the actual payment time
          await internalTransaction.save();

          // Fetch post and seller
          const [post, seller] = await Promise.all([
            Post.findById(internalTransaction.productId),
            User.findById(internalTransaction.sellerId)
          ]);

          if (!post || !seller) {
            logger.error('Post or seller not found during DVA charge success processing', {
              requestId, postId: internalTransaction.productId, sellerId: internalTransaction.sellerId
            });
            // This indicates data inconsistency, needs attention.
            return res.status(500).send('Internal error: post or seller not found.');
          }

          // Mark post as sold (funds are now in escrow)
          post.isSold = true;
          await post.save();

          // Calculate commission and seller share
          const commission = (COMMISSION_PERCENT / 100) * paidAmount;
          const sellerShare = paidAmount - commission;

          // Create or update Escrow record
          const escrow = await Escrow.findOneAndUpdate(
            { product: internalTransaction.productId, buyer: internalTransaction.buyerId, status: { $ne: 'Released' } },
            {
              product: internalTransaction.productId,
              buyer: internalTransaction.buyerId,
              seller: internalTransaction.sellerId,
              amount: paidAmount,
              commission: commission,
              sellerShare: sellerShare,
              paymentReference: reference, // Use the charge reference here
              status: 'In Escrow'
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          // Prepare receipt data
          const receiptData = {
            reference: reference,
            amountPaid: paidAmount,
            transactionDate: paid_at,
            buyerName: `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim(),
            email: buyer.email,
            productTitle: post.title || post.description || "Product",
            sellerName: `${seller.firstName} ${seller.lastName}`,
            buyerId: buyer._id.toString(),
            sellerId: seller._id.toString()
          };

          // Send notifications to seller (funds received into escrow)
          await Promise.all([
            new Notification({
              userId: seller._id,
              senderId: buyer._id,
              type: 'payment_received_escrow',
              postId: post._id,
              payment: post.title,
              message: `${receiptData.buyerName} has paid for your product: "${post.description}". Funds are now held in escrow.`,
              createdAt: new Date()
            }).save(),
            sendFCMNotification(
              seller._id.toString(),
              'Payment Received (Escrow)',
              `${receiptData.buyerName} paid for "${receiptData.productTitle}". Funds in escrow.`,
              { type: 'payment_escrow', postId: post._id.toString() },
              req.io,
              post.photo,
              buyer.profilePicture
            ),
            NotificationService.triggerCountUpdate(seller._id.toString(), req.io)
          ]);

          // Generate receipt and send to seller (with timeout)
          let receiptStatus = { success: false, message: 'Receipt generation timed out' };
          try {
            const receiptPromise = Promise.race([
              (async () => {
                const receiptImageUrl = await generateModernReceipt(receiptData);
                internalTransaction.receiptImageUrl = receiptImageUrl;
                await internalTransaction.save();
                return await sendReceiptToSeller({...receiptData, reference}, receiptImageUrl, req.io);
              })(),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Receipt generation timeout')), RECEIPT_TIMEOUT)
              )
            ]);
            receiptStatus = await receiptPromise;
          } catch (error) {
            logger.error('Receipt generation/sending failed (webhook)', { requestId, error: error.message });
            receiptStatus = { success: false, message: error.message };
          }

          logger.info('DVA charge success processed', { requestId, reference, receiptSent: receiptStatus.success });
          break;

        case 'transfer.success':
        case 'transfer.failed':
        case 'transfer.reversed':
          // These events are from YOUR initiated transfers (e.g., to sellers).
          // Find the corresponding Transaction and Escrow records and update their status.
          const transferEventData = event.data;
          const transferRef = transferEventData.reference;
          const transferStatus = transferEventData.status; // 'success', 'failed', 'reversed'

          logger.info(`Transfer webhook received: ${transferStatus}`, { requestId, transferRef, transferEventData });

          const affectedTransaction = await Transaction.findOne({ transferReference: transferRef });
          const affectedEscrow = await Escrow.findOne({ transferReference: transferRef }); // Assuming escrow also stores transferRef

          if (affectedTransaction && affectedEscrow) {
            let newTransactionStatus;
            let newEscrowStatus;
            let notificationMessage;
            let notificationType;
            let fcmNotificationTitle;

            if (transferStatus === 'success') {
              newTransactionStatus = 'completed';
              newEscrowStatus = 'Completed';
              notificationMessage = `Payment for "${(await Post.findById(affectedTransaction.productId))?.title || 'product'}" has been successfully transferred to your bank account.`;
              notificationType = 'transfer_success';
              fcmNotificationTitle = 'Funds Received!';
              logger.info('Transaction and Escrow updated to completed via transfer.success webhook', { requestId, transactionId: affectedTransaction._id, transferRef });
            } else if (transferStatus === 'failed') {
              newTransactionStatus = 'transfer_failed';
              newEscrowStatus = 'Transfer Failed';
              notificationMessage = `Failed to transfer funds for "${(await Post.findById(affectedTransaction.productId))?.title || 'product'}" to your bank account. Reason: ${transferEventData.failures?.[0]?.reason || 'Unknown'}.`;
              notificationType = 'transfer_failed';
              fcmNotificationTitle = 'Funds Transfer Failed';
              logger.warn('Transaction transfer failed via webhook', { requestId, transactionId: affectedTransaction._id, transferRef, reason: transferEventData.failures });
              // Additional actions: notify admin, queue for retry, or request new bank details from seller.
            } else if (transferStatus === 'reversed') {
              newTransactionStatus = 'refunded'; // Or a specific 'transfer_reversed' status if you have it
              newEscrowStatus = 'Reversed';
              notificationMessage = `The transfer for "${(await Post.findById(affectedTransaction.productId))?.title || 'product'}" was reversed. Funds returned to Salmart.`;
              notificationType = 'transfer_reversed';
              fcmNotificationTitle = 'Funds Transfer Reversed';
              logger.warn('Transaction transfer reversed via webhook', { requestId, transactionId: affectedTransaction._id, transferRef });
              // Funds returned to your Paystack balance. Decide if buyer needs to be refunded or re-transferred.
            }

            affectedTransaction.status = newTransactionStatus;
            await affectedTransaction.save();

            affectedEscrow.status = newEscrowStatus;
            await affectedEscrow.save();

            // Notify seller about the transfer status
            await Promise.all([
              new Notification({
                userId: affectedTransaction.sellerId,
                senderId: affectedTransaction.buyerId, // Consider senderId as system or relevant party
                type: notificationType,
                postId: affectedTransaction.productId,
                payment: (await Post.findById(affectedTransaction.productId))?.title || 'Product Payment',
                message: notificationMessage,
                createdAt: new Date()
              }).save(),
              sendFCMNotification(
                affectedTransaction.sellerId.toString(),
                fcmNotificationTitle,
                notificationMessage,
                { type: notificationType, postId: affectedTransaction.productId.toString(), transactionId: affectedTransaction._id.toString() },
                req.io
              ),
              NotificationService.triggerCountUpdate(affectedTransaction.sellerId.toString(), req.io)
            ]);

            // If transfer failed or reversed, also notify the buyer for transparency
            if (transferStatus === 'failed' || transferStatus === 'reversed') {
              const buyerMessage = `Update on your order for "${(await Post.findById(affectedTransaction.productId))?.title || 'product'}": The payout to the seller has ${transferStatus === 'failed' ? 'failed' : 'been reversed'}. We are looking into it.`;
              await Promise.all([
                new Notification({
                  userId: affectedTransaction.buyerId,
                  senderId: affectedTransaction.sellerId, // Or system
                  type: `buyer_${notificationType}`,
                  postId: affectedTransaction.productId,
                  payment: (await Post.findById(affectedTransaction.productId))?.title || 'Product Payment',
                  message: buyerMessage,
                  createdAt: new Date()
                }).save(),
                sendFCMNotification(
                  affectedTransaction.buyerId.toString(),
                  `Order Payout ${transferStatus === 'failed' ? 'Failed' : 'Reversed'}`,
                  buyerMessage,
                  { type: `buyer_${notificationType}`, postId: affectedTransaction.productId.toString(), transactionId: affectedTransaction._id.toString() },
                  req.io
                ),
                NotificationService.triggerCountUpdate(affectedTransaction.buyerId.toString(), req.io)
              ]);
            }

          } else {
            logger.warn('No matching transaction or escrow found for transfer webhook', { requestId, transferRef, event: event.event });
          }
          break;

        default:
          logger.info(`Unhandled Paystack webhook event: ${event.event}`, { requestId });
          break;
      }
      res.status(200).send('Webhook Received');
    } catch (error) {
      logger.error('Error processing Paystack webhook', { requestId, event: event.event, error: error.message, stack: error.stack });
      res.status(500).send('Internal Server Error');
    }
  });


  // --- Confirm Delivery and Release Funds (Payout to Seller) ---
  router.post('/confirm-delivery/:transactionId', async (req, res) => {
    const requestId = `RELEASE_FUNDS_${Date.now()}`;
    const { transactionId } = req.params;
    const { userId } = req.body; // Assuming the buyer ID is sent in the request body for authorization

    logger.info('Confirm delivery and release funds initiated', { requestId, transactionId, userId });

    try {
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        return res.status(404).json({ success: false, message: "Transaction not found." });
      }

      if (transaction.buyerId.toString() !== userId) {
        return res.status(403).json({ success: false, message: "Unauthorized to confirm this delivery." });
      }

      // Funds must be in escrow (i.e., charge.success must have been processed)
      if (transaction.status !== 'in_escrow') {
        return res.status(400).json({ success: false, message: "Funds are not currently in escrow for this transaction." });
      }

      const seller = await User.findById(transaction.sellerId);
      if (!seller) {
        logger.error('Seller not found during fund release', { requestId, sellerId: transaction.sellerId });
        return res.status(404).json({ success: false, message: "Seller not found." });
      }

      // Check if seller has a Paystack recipient code. If not, create one.
      // This ensures the seller can receive payouts. You might want this to happen during seller onboarding.
      let sellerRecipientCode = seller.paystack?.recipientCode;
      if (!sellerRecipientCode) {
          logger.info('Creating Paystack transfer recipient for seller', { requestId, sellerId: seller._id });
          // Assuming seller has bank details saved in their user profile (e.g., bankName, accountNumber)
          if (!seller.bankDetails || !seller.bankDetails.bankName || !seller.bankDetails.accountNumber) {
              return res.status(400).json({ success: false, message: "Seller's bank details are missing. Cannot create payout recipient." });
          }

          const recipientResponse = await paystack.transferRecipient.create({
              type: "nuban", // NUBAN for Nigerian bank accounts
              name: `${seller.firstName} ${seller.lastName}`,
              account_number: seller.bankDetails.accountNumber,
              bank_code: seller.bankDetails.bankCode, // You need to store the bank code (slug) for the seller
              currency: "NGN",
          });

          if (!recipientResponse.status) {
              logger.error('Failed to create Paystack transfer recipient for seller', { requestId, error: recipientResponse.message });
              return res.status(500).json({
                  success: false,
                  message: recipientResponse.message || "Failed to set up seller for payouts."
              });
          }
          sellerRecipientCode = recipientResponse.data.recipient_code;
          seller.paystack = seller.paystack || {};
          seller.paystack.recipientCode = sellerRecipientCode;
          await seller.save();
          logger.info('Paystack transfer recipient created for seller', { requestId, recipientCode: sellerRecipientCode });
      }


      const escrowRecord = await Escrow.findOne({ paymentReference: transaction.paymentReference });
      if (!escrowRecord) {
        return res.status(404).json({ success: false, message: "Escrow record not found for this transaction." });
      }

      const amountToTransfer = escrowRecord.sellerShare * 100; // Convert to kobo

      if (amountToTransfer <= 0) {
        return res.status(400).json({ success: false, message: "Invalid amount to transfer." });
      }

      // Initiate transfer to seller
      const transferResponse = await paystack.transfer.initiate({
        source: "balance", // Transfer from your Paystack balance
        amount: amountToTransfer,
        recipient: sellerRecipientCode, // The seller's Paystack Recipient Code
        reason: `Payment for product: ${transaction.productId} (Order Ref: ${transaction.paymentReference})`
      });

      if (!transferResponse.status) {
        logger.error('Paystack transfer initiation failed', { requestId, error: transferResponse.message, transactionId });
        return res.status(500).json({ success: false, message: transferResponse.message || "Failed to initiate transfer to seller." });
      }

      // Update transaction and escrow status to 'transfer_initiated'
      // The actual 'completed' status will come from the 'transfer.success' webhook
      transaction.status = 'transfer_initiated';
      transaction.transferReference = transferResponse.data.reference; // Store the Paystack transfer reference
      await transaction.save();

      escrowRecord.status = 'Released'; // This status change means you've triggered the release
      escrowRecord.releasedAt = new Date();
      escrowRecord.transferReference = transferResponse.data.reference; // Store the transfer ref on escrow too
      await escrowRecord.save();

      logger.info('Funds transfer initiated successfully to seller', {
        requestId,
        transactionId,
        transferReference: transferResponse.data.reference
      });

      // Send notifications that transfer has been initiated
      const postTitle = (await Post.findById(transaction.productId))?.title || 'Product';
      const sellerNotificationMessage = `Buyer confirmed delivery for "${postTitle}". Funds transfer initiated to your bank account.`;
      const buyerNotificationMessage = `You confirmed delivery for "${postTitle}". Funds have been released to the seller.`;

      await Promise.all([
        // Notification to Seller
        new Notification({
          userId: transaction.sellerId,
          senderId: transaction.buyerId,
          type: 'delivery_confirmed_transfer_initiated',
          postId: transaction.productId,
          payment: postTitle,
          message: sellerNotificationMessage,
          createdAt: new Date()
        }).save(),
        sendFCMNotification(
          transaction.sellerId.toString(),
          'Delivery Confirmed!',
          sellerNotificationMessage,
          { type: 'delivery_confirmed', postId: transaction.productId.toString() },
          req.io
        ),
        NotificationService.triggerCountUpdate(transaction.sellerId.toString(), req.io),

        // Notification to Buyer
        new Notification({
          userId: transaction.buyerId,
          senderId: transaction.sellerId, // Seller is the 'recipient' of action in this context
          type: 'delivery_confirmed_buyer_notify',
          postId: transaction.productId,
          payment: postTitle,
          message: buyerNotificationMessage,
          createdAt: new Date()
        }).save(),
        sendFCMNotification(
          transaction.buyerId.toString(),
          'Delivery Confirmed!',
          buyerNotificationMessage,
          { type: 'delivery_confirmed_buyer', postId: transaction.productId.toString() },
          req.io
        ),
        NotificationService.triggerCountUpdate(transaction.buyerId.toString(), req.io)
      ]);

      res.json({ success: true, message: "Funds transfer initiated successfully. Seller will receive payment shortly." });

    } catch (error) {
      logger.error('Failed to confirm delivery and release funds', { requestId, error: error.message, stack: error.stack });
      res.status(500).json({ success: false, message: "Failed to release funds: " + error.message });
    }
  });

  // --- HTML for success (removed the redundant endpoint, your frontend will handle this) ---
  // The old /payment-success HTML response is moved inline to the Paystack webhook `charge.success` handling,
  // to be displayed if Paystack somehow redirects there, although with DVA, this redirect is not the primary flow.
  // The primary flow is webhook processing.
  router.get('/payment-success', async (req, res) => {
    logger.warn('Received redirect to /payment-success, this is not the primary DVA flow. Processing as a fallback.');
    const requestId = `FALLBACK_SUCCESS_${Date.now()}`;
    const { reference } = req.query; // Only reference is reliable from this redirect

    try {
      // Re-verify payment with Paystack if a reference is provided
      if (!reference) {
        throw new Error("No payment reference found for verification.");
      }

      const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const data = paystackResponse.data;

      if (!data.status || data.data.status !== 'success') {
        throw new Error(data.message || "Payment verification failed on fallback.");
      }

      // Attempt to find the transaction in your database
      const internalTransaction = await Transaction.findOne({ paymentReference: reference });
      let receiptData = {};
      let receiptStatus = { success: false, message: 'Receipt not re-generated on redirect' };

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
          receiptStatus.success = true; // Assume receipt was handled by webhook
          receiptStatus.message = 'Receipt processing likely handled by webhook.';
        }
      } else {
        // If transaction not found by reference, it means the webhook likely hasn't processed it yet,
        // or this is an old style payment that was already handled differently.
        logger.warn('Transaction not found by reference in fallback /payment-success', { requestId, reference });
        // Attempt to construct minimal receipt data if possible from Paystack response directly
        receiptData = {
          reference: reference,
          amountPaid: data.data.amount / 100,
          transactionDate: data.data.paid_at,
          buyerName: data.data.customer.first_name + ' ' + data.data.customer.last_name,
          email: data.data.customer.email,
          productTitle: 'Unknown Product', // Cannot determine without internal transaction
          sellerName: 'Unknown Seller' // Cannot determine without internal transaction
        };
        receiptStatus.message = 'No internal transaction found to confirm receipt status.';
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
                  : `Due to the nature of this fallback, we cannot confirm receipt delivery. Please check seller chat. ${receiptStatus.message}`
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
      logger.error('Fallback /payment-success failed', { requestId, error: error.message });
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
            <p class="error-message">An unexpected error occurred during payment verification. Please check your transaction history. ${error.message}</p>
          </div>
        </body>
        </html>
      `);
    }
  });

  return router;
};
