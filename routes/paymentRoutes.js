// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
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
const Message = require('../models/messageSchema.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
const NotificationService = require('../services/NotificationService.js');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/paymentRoutes.log' }),
    new winston.transports.Console()
  ]
});

// Payment Initialization (OPay)
router.post('/pay', async (req, res) => {
  try {
    const { email, postId, buyerId, currency = 'NGN' } = req.body;
    if (!email || !postId || !buyerId) {
      logger.warn('Missing required fields in /pay');
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(buyerId)) {
      logger.warn(`Invalid Post ID ${postId} or Buyer ID ${buyerId}`);
      return res.status(400).json({ success: false, message: 'Invalid Post ID or Buyer ID' });
    }

    const post = await Post.findById(postId);
    if (!post || post.isSold) {
      logger.warn(`Post ${postId} not available`);
      return res.status(400).json({ success: false, message: 'Product not available' });
    }

    const amount = Number(post.price);
    if (isNaN(amount) || amount <= 0) {
      logger.warn(`Invalid price for post ${postId}`);
      return res.status(400).json({ success: false, message: 'Invalid product price' });
    }

    const [seller, buyer] = await Promise.all([
      User.findById(post.createdBy?.userId || post.createdBy),
      User.findById(buyerId),
    ]);
    if (!seller || !buyer) {
      logger.error(`Buyer ${buyerId} or Seller ${post.createdBy?.userId} not found`);
      return res.status(404).json({ success: false, message: 'Buyer or Seller not found' });
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const API_BASE_URL = isProduction ? `https://${req.get('host')}` : process.env.API_BASE_URL || 'http://localhost:3000';
    const reference = `SALMART_${postId}_${Date.now()}`;
    const opayPayload = {
      amount: currency === 'NGN' ? amount * 100 : amount, // OPay expects amount in kobo for NGN
      currency,
      reference,
      returnUrl: `${API_BASE_URL}/payment-success?postId=${postId}&buyerId=${buyerId}`,
      userPhone: buyer.phone || '',
      userEmail: email,
      userName: `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Anonymous Buyer',
      countryCode: 'NG',
    };

    const payloadString = JSON.stringify(opayPayload, Object.keys(opayPayload).sort());
    const signature = crypto
      .createHmac('sha512', process.env.OPAY_SECRET_KEY)
      .update(payloadString)
      .digest('hex');

    const opayRes = await axios.post(
      isProduction ? 'https://api.opaycheckout.com/api/v3/transaction/initialize' : 'https://sandboxapi.opaycheckout.com/api/v3/transaction/initialize',
      opayPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPAY_PUBLIC_KEY}`,
          'Content-Type': 'application/json',
          Signature: signature,
        },
      }
    );

    if (opayRes.data.code !== '00000') {
      logger.error(`OPay initialization failed: ${opayRes.data.message}`);
      return res.status(400).json({ success: false, message: opayRes.data.message || 'Failed to initiate payment' });
    }

    await Transaction.create({
      postId,
      buyerId,
      sellerId: seller._id,
      amount,
      currency,
      paymentReference: reference,
      status: 'pending',
    });

    logger.info(`Payment initiated for post ${postId} by buyer ${buyerId}`);
    res.status(200).json({ success: true, url: opayRes.data.data.authorizationUrl });
  } catch (error) {
    logger.error(`OPay payment error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Error initiating payment' });
  }
});

// Payment Success Callback
router.get('/payment-success', async (req, res) => {
  const { transactionReference, postId, buyerId, format = 'html' } = req.query;

  try {
    if (!transactionReference || !postId || !buyerId) {
      logger.warn('Missing transactionReference, postId, or buyerId in /payment-success');
      return res.status(400).json({ success: false, message: 'Missing transactionReference, postId, or buyerId' });
    }

    if (format === 'json') {
      const transaction = await Transaction.findOne({ postId, buyerId });
      if (!transaction) {
        logger.error(`Transaction not found for post ${postId} and buyer ${buyerId}`);
        return res.status(404).json({ success: false, paymentCompleted: false, message: 'Transaction not found' });
      }
      const paymentCompleted = ['completed'].includes(transaction.status);
      return res.status(200).json({ success: true, paymentCompleted, reference: transaction.paymentReference });
    }

    // Verify payment with OPay
    const opayPayload = { reference: transactionReference };
    const payloadString = JSON.stringify(opayPayload, Object.keys(opayPayload).sort());
    const signature = crypto
      .createHmac('sha512', process.env.OPAY_SECRET_KEY)
      .update(payloadString)
      .digest('hex');

    const isProduction = process.env.NODE_ENV === 'production';
    const opayRes = await axios.post(
      isProduction ? 'https://api.opaycheckout.com/api/v3/transaction/query' : 'https://sandboxapi.opaycheckout.com/api/v3/transaction/query',
      opayPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPAY_PUBLIC_KEY}`,
          'Content-Type': 'application/json',
          Signature: signature,
        },
      }
    );

    const data = opayRes.data;
    if (data.code !== '00000' || data.data.status !== 'SUCCESS') {
      logger.error(`Payment verification failed for reference ${transactionReference}: ${data.message}`);
      return res.status(400).json({ success: false, message: data.message || 'Payment verification failed' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      logger.error(`Post ${postId} not found`);
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const buyer = await User.findById(buyerId);
    if (!buyer) {
      logger.error(`Buyer ${buyerId} not found`);
      return res.status(404).json({ success: false, message: 'Buyer not found' });
    }

    const seller = await User.findById(post.createdBy?.userId || post.createdBy);
    if (!seller) {
      logger.error(`Seller ${post.createdBy?.userId} not found`);
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const buyerName = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim();
    const amountPaid = data.data.amount / 100; // Convert from kobo
    const transactionDate = new Date(data.data.createdAt).toLocaleString();
    const productDescription = post.description || 'No description available.';
    const sellerId = seller._id.toString();
    const sellerName = `${seller.firstName} ${seller.lastName}`.trim();
    const sellerProfilePic = seller.profilePicture || 'default.jpg';
    const commission = (2 / 100) * amountPaid;
    const sellerShare = amountPaid - commission;

    // Update transaction
    const transaction = await Transaction.findOneAndUpdate(
      { paymentReference: transactionReference },
      { status: 'completed', amount: amountPaid },
      { new: true }
    );
    if (!transaction) {
      logger.error(`Transaction not found for reference ${transactionReference}`);
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Create escrow
    const escrow = new Escrow({
      product: postId,
      buyer: buyer._id,
      seller: sellerId,
      amount: amountPaid,
      commission,
      sellerShare,
      paymentReference: transactionReference,
      status: 'In Escrow',
    });

    // Create notification for seller
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

    // Send real-time notification
    req.io.to(`user_${sellerId}`).emit('notification', {
      type: 'payment',
      postId,
      userId: buyer._id,
      message: notification.message,
      sender: { firstName: buyer.firstName, lastName: buyer.lastName, profilePicture: buyer.profilePicture },
      createdAt: new Date(),
    });

    // Send FCM notification
    await sendFCMNotification(
      sellerId,
      'Payment Received',
      `${buyerName} paid for your product: "${productDescription}"`,
      { type: 'payment', postId: postId.toString() },
      req.io,
      post.photo,
      buyer.profilePicture
    );

    // Update notification counts
    await NotificationService.triggerCountUpdate(sellerId, req.io);

    // Generate receipt image
    let receiptImageUrl = '';
    try {
      const receiptsDir = path.join(__dirname, '../receipts');
      await fs.mkdir(receiptsDir, { recursive: true });
      const imagePath = path.join(receiptsDir, `${transactionReference}.png`);
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
        `Reference: ${transactionReference}`,
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
        public_id: `receipts/${transactionReference}`,
        folder: 'salmart_receipts',
      });
      receiptImageUrl = cloudinaryResponse.secure_url;
      await fs.unlink(imagePath).catch((err) => logger.warn(`Failed to delete temp file ${imagePath}: ${err.message}`));
    } catch (error) {
      logger.error(`Receipt image generation error: ${error.message}`);
    }

    // Update transaction with receipt URL
    await Transaction.findByIdAndUpdate(transaction._id, { receiptUrl: receiptImageUrl });

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
          .share-button { display: block; width: 100%; padding: 10px; margin-top: 10px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: center; }
          .share-button:hover { background: #218838; }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header">
            <h2>Payment Receipt</h2>
          </div>
          <p class="status">✅ Payment Successful</p>
          <div class="details">
            <p><span>Transaction Reference:</span> ${transactionReference}</p>
            <p><span>Amount Paid:</span> ₦${Number(amountPaid).toLocaleString('en-NG')}</p>
            <p><span>Payment Date:</span> ${transactionDate}</p>
            <p><span>Buyer Name:</span> ${buyerName}</p>
            <p><span>Buyer Email:</span> ${buyer.email}</p>
            <p><span>Description:</span> ${productDescription}</p>
          </div>
          <button class="share-button" onclick="shareReceipt()">📤 Share Receipt</button>
          <div class="footer">
            <p>© 2025 Salmart Technologies. All rights reserved.</p>
          </div>
        </div>
        <script>
          const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
          async function shareReceipt() {
            try {
              const response = await fetch(API_BASE_URL + '/payment/share-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reference: '${transactionReference}',
                  buyerId: '${buyer._id}',
                  sellerId: '${sellerId}',
                  amountPaid: ${amountPaid},
                  transactionDate: '${transactionDate}',
                  buyerName: '${buyerName}',
                  email: '${buyer.email}',
                  productDescription: '${productDescription}',
                  receiptImageUrl: '${receiptImageUrl || ''}',
                }),
              });
              const result = await response.json();
              if (result.success) {
                window.location.href = API_BASE_URL + '/Chats.html?recipient_id=${sellerId}&recipient_username=${encodeURIComponent(sellerName)}&recipient_profile_picture_url=${encodeURIComponent(sellerProfilePic)}&user_id=${buyer._id}';
              } else {
                alert('Failed to share receipt: ' + result.message);
              }
            } catch (error) {
              alert('Error sharing receipt: ' + error.message);
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error(`Payment success error for reference ${transactionReference}: ${error.message}`);
    res.status(500).json({ success: false, message: 'Payment verification error' });
  }
});

// Share Receipt
router.post('/share-receipt', async (req, res) => {
  try {
    const { reference, buyerId, sellerId, amountPaid, transactionDate, buyerName, email, productDescription, receiptImageUrl } = req.body;
    if (!reference || !buyerId || !sellerId || !amountPaid || !transactionDate || !buyerName || !email || !productDescription) {
      logger.warn('Missing required fields in /share-receipt');
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const transaction = await Transaction.findOne({ paymentReference: reference });
    if (!transaction) {
      logger.error(`Transaction not found for reference ${reference}`);
      return res.status(400).json({ success: false, message: 'Invalid transaction reference' });
    }

    const buyer = await User.findById(buyerId);
    if (!buyer) {
      logger.error(`Buyer ${buyerId} not found`);
      return res.status(404).json({ success: false, message: 'Buyer not found' });
    }

    // Create message
    const message = new Message({
      senderId: buyerId,
      receiverId: sellerId,
      messageType: 'image',
      attachment: { url: receiptImageUrl || '' },
      text: `Receipt for ${productDescription}`,
      status: 'sent',
      createdAt: new Date(),
    });

    // Create notification
    const notification = new Notification({
      userId: sellerId,
      senderId: buyerId,
      type: 'receipt',
      postId: transaction.postId,
      message: `${buyerName} shared a receipt for "${productDescription}"`,
      createdAt: new Date(),
    });

    await Promise.all([message.save(), notification.save()]);

    // Send real-time notifications
    req.io.to(`user_${sellerId}`).emit('receiveMessage', message.toObject());
    req.io.to(`user_${sellerId}`).emit('notification', {
      type: 'receipt',
      postId: transaction.postId,
      userId: buyerId,
      message: notification.message,
      sender: { firstName: buyer.firstName, lastName: buyer.lastName, profilePicture: buyer.profilePicture },
      createdAt: new Date(),
    });

    // Send FCM notification
    await sendFCMNotification(
      sellerId,
      'Receipt Shared',
      `${buyerName} shared a receipt for "${productDescription}"`,
      { type: 'receipt', postId: transaction.postId.toString() },
      req.io,
      receiptImageUrl,
      buyer.profilePicture
    );

    await NotificationService.triggerCountUpdate(sellerId, req.io);
    logger.info(`Receipt shared for transaction ${reference} by buyer ${buyerId}`);
    res.status(200).json({ success: true, message: 'Receipt shared successfully' });
  } catch (error) {
    logger.error(`Share receipt error for reference ${req.body.reference}: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    next();
  });
  return router;
};