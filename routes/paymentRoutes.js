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

//process buy orders
router.post('/pay', async (req, res) => {
    try {
        console.log("Received request body:", req.body); // Debugging line

        const { email, postId, buyerId } = req.body; 

        if (!email || !buyerId) {  
            return res.status(400).json({ success: false, message: "Email and Buyer ID are required" });
        }

        const trimmedPostId = postId.trim();
        const post = await Post.findById(trimmedPostId);
        
        if (!post) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        if (post.isSold) {
            return res.status(400).json({ success: false, message: "Product is already sold" });
        }

        const amount = parseFloat(post.price) * 100;

        const sellerId = post.createdBy;  // Ensure sellerId is correctly assigned

        console.log("Seller ID from post:", sellerId); // Debugging log
   
const protocol = req.secure ? 'https' : 'http';
const host = req.get('host');
const API_BASE_URL = `${protocol}://${host}`;
        // include correct sellerId in metadata
        const response = await paystack.transaction.initialize({
            email,
            amount: amount,
            callback_url: `${API_BASE_URL}/payment-success?postId=${trimmedPostId}&buyerId=${buyerId}`,
            metadata: {
                postId: trimmedPostId,
                email,
                buyerId,  
                sellerId,  // ✅ Now correctly set
            },
        });

        res.json({ success: true, url: response.data.authorization_url });
    } catch (error) {
        console.error("Error initiating payment:", error);
        res.status(500).json({ success: false, message: "Payment failed" });
    }
});


// Payment Success Callback
router.get('/payment-success', async (req, res) => {
  const logMeta = { route: '/payment-success', requestId: `SUCCESS_${Date.now()}` };
  const { reference, postId, buyerId, format = 'html' } = req.query;

  try {
    logger.debug('Payment success callback received', { ...logMeta, query: req.query });

    if (!reference || !postId || !buyerId) {
      logger.warn('Missing required parameters', { ...logMeta, reference, postId, buyerId });
      return res.status(400).json({ success: false, message: 'Missing reference, postId, or buyerId' });
    }

    if (format === 'json') {
      const transaction = await Transaction.findOne({ postId, buyerId });
      if (!transaction) {
        logger.error('Transaction not found', { ...logMeta, postId, buyerId });
        return res.status(404).json({ success: false, paymentCompleted: false, message: 'Transaction not found' });
      }
      logger.info('JSON response for transaction status', { ...logMeta, paymentReference: transaction.paymentReference, status: transaction.status });
      return res.status(200).json({ success: true, paymentCompleted: transaction.status === 'completed', reference: transaction.paymentReference });
    }

    logger.debug('Verifying transaction with Paystack', {
      ...logMeta,
      endpoint: `https://api.paystack.co/transaction/verify/${reference}`
    });

    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.debug('Paystack verification response', {
      ...logMeta,
      status: paystackRes.status,
      response: paystackRes.data
    });

    const data = paystackRes.data;
    if (!data.status || data.data.status !== 'success') {
      logger.error('Payment verification failed', { ...logMeta, response: data });
      return res.status(400).json({ success: false, message: data.message || 'Payment verification failed' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      logger.error('Post not found', { ...logMeta, postId });
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const buyer = await User.findById(buyerId);
    if (!buyer) {
      logger.error('Buyer not found', { ...logMeta, buyerId });
      return res.status(404).json({ success: false, message: 'Buyer not found' });
    }

    const seller = await User.findById(post.createdBy?.userId || post.createdBy);
    if (!seller) {
      logger.error('Seller not found', { ...logMeta, sellerId: post.createdBy?.userId });
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const buyerName = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim();
    const amountPaid = data.data.amount / 100; // Convert from kobo to naira
    const transactionDate = new Date(data.data.transaction_date).toLocaleString();
    const productDescription = post.description || 'No description available.';
    const sellerId = seller._id.toString();
    const commission = amountPaid * 0.02;
    const sellerShare = amountPaid - commission;

    const transaction = await Transaction.findOne({ paymentReference: data.data.reference });
    if (transaction && transaction.status === 'completed') {
      logger.info('Duplicate callback', { ...logMeta, paymentReference: data.data.reference });
      return res.status(200).json({ success: true, message: 'Transaction already processed' });
    }

    await Transaction.findOneAndUpdate(
      { paymentReference: data.data.reference },
      { status: 'completed', amount: amountPaid, paystackRef: data.data.reference, commission, sellerShare },
      { new: true }
    );

    const escrow = new Escrow({
      product: postId,
      buyer: buyer._id,
      seller: sellerId,
      amount: amountPaid,
      commission,
      sellerShare,
      paymentReference: data.data.reference,
      status: 'In Escrow', // Simulated escrow
    });

    const notification = new Notification({
      userId: sellerId,
      senderId: buyer._id,
      type: 'payment',
      postId,
      message: `${buyerName} paid for your product: "${productDescription}"`,
      createdAt: new Date(),
    });

    await Promise.all([
      escrow.save(),
      notification.save(),
      Post.findByIdAndUpdate(postId, { isSold: true }),
    ]);

    logger.info('Escrow and notification created', { ...logMeta, paymentReference: data.data.reference, escrowId: escrow._id });

    req.io.to(`user_${sellerId}`).emit('notification', {
      type: 'payment',
      postId,
      userId: buyer._id,
      message: notification.message,
      sender: { firstName: buyer.firstName, lastName: buyer.lastName, profilePicture: buyer.profilePicture },
      createdAt: new Date(),
    });

    await sendFCMNotification(
      sellerId,
      'Payment Received',
      `${buyerName} paid for your product: "${productDescription}"`,
      { type: 'payment', postId: postId.toString() },
      req.io,
      post.photo,
      buyer.profilePicture
    );

    await NotificationService.triggerCountUpdate(sellerId, req.io);

    let receiptImageUrl = '';
    try {
      const receiptsDir = path.join(__dirname, '../receipts');
      await fs.mkdir(receiptsDir, { recursive: true });
      const imagePath = path.join(receiptsDir, `${data.data.reference}.png`);
      const image = new Jimp(600, 800, 0xFFFFFFFF);
      const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
      const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

      for (let x = 0; x < 600; x++) {
        for (let y = 0; y < 800; y++) {
          if (x < 10 || x > 590 || y < 10 || y > 790) {
            image.setPixelColor(Jimp.rgbaToInt(0, 102, 204, 255), x, y);
          }
        }
      }

      image.print(font, 40, 20, 'Salmart');
      const brandName = 'SALMART';
      const brandX = (600 - Jimp.measureText(fontLarge, brandName)) / 2;
      image.print(fontLarge, brandX, 80, brandName);
      const titleText = 'Payment Receipt';
      const titleX = (600 - Jimp.measureText(font, titleText)) / 2;
      image.print(font, titleX, 160, titleText);

      const details = [
        `Reference: ${data.data.reference}`,
        `Amount: ₦${Number(amountPaid).toLocaleString('en-NG')}`,
        `Date: ${transactionDate}`,
        `Buyer: ${buyerName}`,
        `Email: ${buyer.email}`,
        `Description: ${productDescription}`,
      ];

      let yPosition = 240;
      details.forEach((line) => {
        image.print(font, 40, yPosition, line);
        yPosition += 50;
      });

      const footerText = 'Thank you for shopping with SALMART!';
      const footerX = (600 - Jimp.measureText(font, footerText)) / 2;
      image.print(font, footerX, 700, footerText);
      await image.writeAsync(imagePath);

      const cloudinaryResponse = await cloudinary.uploader.upload(imagePath, {
        public_id: `receipts/${data.data.reference}`,
        folder: 'salmart_receipts',
      });
      receiptImageUrl = cloudinaryResponse.secure_url;
      await fs.unlink(imagePath).catch((err) => logger.warn(`Failed to delete temp file ${imagePath}`, { ...logMeta, error: err.message }));
    } catch (error) {
      logger.error('Receipt generation error', { ...logMeta, error: error.message });
    }

    await Transaction.findOneAndUpdate(
      { paymentReference: data.data.reference },
      { receiptUrl: receiptImageUrl }
    );

    logger.info('Payment success processed', { ...logMeta, paymentReference: data.data.reference, receiptUrl: receiptImageUrl });

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Payment Receipt</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f8f8f8; text-align: center; padding: 20px; }
          .receipt-container { max-width: 400px; margin: auto; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); text-align: left; }
          .header { text-align: center; padding-bottom: 10px; border-bottom: 2px solid #007bff; }
          .header h2 { color: #007bff; margin: 5px 0; }
          .status { text-align: center; font-size: 18px; padding: 10px; color: green; font-weight: bold; }
          .details p { font-size: 14px; margin: 5px 0; }
          .details span { font-weight: bold; }
          .footer { text-align: center; font-size: 12px; color: gray; padding-top: 10px; border-top: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header">
            <h2>Payment Receipt</h2>
          </div>
          <p class="status">✅ Payment Successful</p>
          <div class="details">
            <p><span>Transaction Reference:</span> ${data.data.reference}</p>
            <p><span>Amount Paid:</span> ₦${Number(amountPaid).toLocaleString('en-NG')}</p>
            <p><span>Payment Date:</span> ${transactionDate}</p>
            <p><span>Buyer Name:</span> ${buyerName}</p>
            <p><span>Buyer Email:</span> ${buyer.email}</p>
            <p><span>Description:</span> ${productDescription}</p>
          </div>
          <div class="footer">
            <p>© 2025 Salmart Technologies. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    const errorDetails = {
      message: error.message,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      } : null,
      stack: error.stack
    };
    logger.error('Payment success error', { ...logMeta, error: errorDetails });
    res.status(error.response?.status || 500).json({ success: false, message: 'Payment verification error' });
  }
});

module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    next();
  });
  return router;
};