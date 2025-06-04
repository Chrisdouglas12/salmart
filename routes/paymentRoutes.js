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

module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    logger.info('Attached io to request object in postRoutes');
    next();
  });

  // Process buy orders
  router.post('/pay', async (req, res) => {
    try {
      console.log("Received request body:", req.body);

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
      const sellerId = post.createdBy;

      console.log("Seller ID from post:", sellerId);

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

      res.json({ success: true, url: response.data.authorization_url });
    } catch (error) {
      console.error("Error initiating payment:", error);
      res.status(500).json({ success: false, message: "Payment failed" });
    }
  });

  router.get('/payment-success', async (req, res) => {
    const logMeta = { route: '/payment-success', requestId: `SUCCESS_${Date.now()}` };
    const { reference, postId, buyerId, format = 'html' } = req.query;

    try {
      console.log("🔍 Verifying Payment with reference:", reference);

      const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || "your_test_secret_key";

      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();
      console.log("✅ Paystack Response:", JSON.stringify(data, null, 2));

      if (!data.status) {
        throw new Error(data.message || "Failed to verify payment");
      }

      if (data.data.status === 'success') {
        console.log("🎉 Payment Verified Successfully!");

        const post = await Post.findById(postId);
        if (!post) {
          console.log("⚠️ Post not found!");
          return res.status(404).send("Post not found.");
        }

        const email = data.data.customer.email;
        const buyer = await User.findOne({ email });
        const seller = await User.findById(post.createdBy.userId);

        if (!seller) {
          console.log("⚠️ Seller not found!");
          return res.status(404).send("Seller not found.");
        }

        const buyerId = buyer ? buyer._id.toString() : null;
        const buyerName = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim();
        if (!buyer) {
          console.log('buyer not found');
          return res.status(404).json({ message: 'buyer not found' });
        }
        const amountPaid = data.data.amount / 100;
        const transactionDate = new Date(data.data.paid_at).toLocaleString();
        const productTitle = post.title || "No description available.";
        const sellerId = seller._id.toString();
        const sellerName = `${seller.firstName} ${seller.lastName}`;
        const sellerProfilePic = seller.profilePicture || "default.jpg";

        const COMMISSION_PERCENT = 2;
        const totalAmount = amountPaid;
        const commission = (COMMISSION_PERCENT / 100) * totalAmount;
        const sellerShare = totalAmount - commission;

        const notification = new Notification({
          userId: sellerId,
          senderId: buyerId,
          type: 'payment',
          postId: postId,
          payment: post.title,
          message: `${buyer.firstName} ${buyer.lastName} just paid for your product: "${post.description}"`,
          createdAt: new Date()
        });

        const escrow = new Escrow({
          product: postId,
          buyer: buyerId,
          seller: sellerId,
          amount: amountPaid,
          commission,
          sellerShare,
          paymentReference: reference,
          status: 'In Escrow'
        });

        await escrow.save();

        const transaction = new Transaction({
          buyerId,
          sellerId,
          productId: postId,
          amount: amountPaid,
          status: 'pending',
          viewed: false,
          paymentReference: reference,
          receiptImageUrl: '' // Initialize, will be updated after image generation
        });

        await transaction.save();
        console.log("✅ Transaction record saved.");
        post.isSold = true;
        await post.save();

        await sendFCMNotification(
          sellerId,
          'Payment Received',
          `${buyerName} paid for your product: "${productTitle}"`,
          { type: 'payment', postId: postId.toString() },
          req.io,
          post.photo,
          buyer.profilePicture
        );

        await NotificationService.triggerCountUpdate(sellerId, req.io);

        console.log("✅ Escrow record saved.");
        await notification.save();
        console.log('notification sent');
        req.io.to(sellerId.toString()).emit('notification', notification);

        let receiptImageUrl = '';
        try {
          const receiptsDir = path.join(__dirname, 'receipts');
          await fs.mkdir(receiptsDir, { recursive: true });
          console.log('Created receipts directory:', receiptsDir);

          const imagePath = path.join(receiptsDir, `${reference}.png`);
          console.log('Starting Jimp image generation...');

          // Modern receipt design
          const image = new Jimp(600, 900, 0xFFFFFFFF); // White background, slightly taller
          const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
          const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
          const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
          console.log('Fonts loaded');

          // Gradient header background
          const gradient = await Jimp.create(600, 150, 0x007BFFFF);
          for (let x = 0; x < 600; x++) {
            for (let y = 0; y < 150; y++) {
              const alpha = y / 150;
              gradient.setPixelColor(
                Jimp.rgbaToInt(0, 123, 255, 255 * (1 - alpha)),
                x, y
              );
            }
          }
          image.composite(gradient, 0, 0);

          // Logo placeholder (optional: replace with actual logo)
          const logo = await Jimp.create(80, 80, 0x00000000);
          logo.print(fontBold, 10, 10, 'S', 60, 60);
          image.composite(logo, 30, 35);

          // Title
          const titleText = 'Payment Receipt';
          const titleX = (600 - Jimp.measureText(fontTitle, titleText)) / 2;
          image.print(fontTitle, titleX, 50, titleText);

          // Status badge
          const statusBadge = await Jimp.create(150, 40, 0x28A745FF);
          statusBadge.print(font, 20, 10, '✓ SUCCESS', 110);
          image.composite(statusBadge, (600 - 150) / 2, 120);

          // Details section with clean layout
          const details = [
            { label: 'Reference', value: reference || 'N/A' },
            { label: 'Amount Paid', value: `₦${Number(amountPaid || 0).toLocaleString('en-NG')}` },
            { label: 'Date', value: transactionDate || new Date().toISOString() },
            { label: 'Buyer', value: buyerName || 'Unknown' },
            { label: 'Email', value: email || 'N/A' },
            { label: 'Title', value: productTitle || 'Purchase' }
          ];

          let yPosition = 200;
          details.forEach(({ label, value }) => {
            image.print(fontBold, 50, yPosition, `${label}:`);
            image.print(font, 50, yPosition + 20, value);
            yPosition += 60;
          });

          // Footer with subtle divider
          image.print(font, 50, 780, '─'.repeat(70));
          const footerText = 'Salmart Technologies • Thank you for your payment!';
          const footerX = (600 - Jimp.measureText(font, footerText)) / 2;
          image.print(font, footerX, 820, footerText);

          // Save image
          await image.writeAsync(imagePath);
          console.log('✅ Receipt image generated:', imagePath);

          // Upload to Cloudinary
          const cloudinaryResponse = await cloudinary.uploader.upload(imagePath, {
            public_id: `receipts/${reference}`,
            folder: 'salmart_receipts'
          });
          receiptImageUrl = cloudinaryResponse.secure_url;
          console.log('✅ Receipt image uploaded to Cloudinary:', receiptImageUrl);

          // Update transaction with receiptImageUrl
          transaction.receiptImageUrl = receiptImageUrl;
          await transaction.save();
          console.log('✅ Transaction updated with receiptImageUrl');

          // Clean up
          await fs.unlink(imagePath);
          console.log('Temporary image deleted:', imagePath);
        } catch (imageError) {
          console.error('🚨 Error generating or uploading image:', imageError.message, imageError.stack);
          receiptImageUrl = '';
          console.warn('⚠️ Proceeding without receipt image');
        }

        const safeReceiptImageUrl = String(receiptImageUrl || '');

        // Updated receipt HTML with modern design
        res.send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Receipt</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background-color: #f5f6f5;
                margin: 0;
                padding: 20px;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
              }
              .receipt-container {
                max-width: 450px;
                width: 100%;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                overflow: hidden;
              }
              .header {
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 20px;
                text-align: center;
              }
              .header h2 {
                margin: 0;
                font-size: 24px;
                font-weight: 600;
              }
              .status {
                background: #28a745;
                color: white;
                padding: 10px;
                text-align: center;
                font-weight: 500;
                font-size: 16px;
                margin: 20px;
                border-radius: 8px;
              }
              .details {
                padding: 0 20px 20px;
              }
              .detail-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 12px;
                font-size: 14px;
              }
              .detail-row label {
                font-weight: 600;
                color: #333;
              }
              .detail-row span {
                color: #555;
                text-align: right;
                max-width: 60%;
              }
              .receipt-image {
                max-width: 100%;
                margin: 20px 0;
                border-radius: 8px;
                display: ${safeReceiptImageUrl ? 'block' : 'none'};
              }
              .share-button {
                display: block;
                width: calc(100% - 40px);
                margin: 20px;
                padding: 12px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.2s;
              }
              .share-button:hover {
                background: #0056b3;
              }
              .footer {
                background: #f8f9fa;
                padding: 15px;
                text-align: center;
                font-size: 12px;
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="receipt-container">
              <div class="header">
                <h2>Payment Receipt</h2>
              </div>
              <div class="status">✓ Payment Successful</div>
              <div class="details">
                <div class="detail-row">
                  <label>Transaction Reference</label>
                  <span>${reference}</span>
                </div>
                <div class="detail-row">
                  <label>Amount Paid</label>
                  <span>₦${Number(amountPaid).toLocaleString('en-NG')}</span>
                </div>
                <div class="detail-row">
                  <label>Payment Date</label>
                  <span>${transactionDate}</span>
                </div>
                <div class="detail-row">
                  <label>Buyer Name</label>
                  <span>${buyerName}</span>
                </div>
                <div class="detail-row">
                  <label>Buyer Email</label>
                  <span>${email}</span>
                </div>
                <div class="detail-row">
                  <label>Title</label>
                  <span>${productTitle}</span>
                </div>
                ${safeReceiptImageUrl ? `<img src="${safeReceiptImageUrl}" class="receipt-image" alt="Payment Receipt">` : ''}
              </div>
              <button class="share-button" onclick="shareReceipt()">📤 Share Receipt</button>
              <div class="footer">
                <p>© 2025 Salmart Technologies. All rights reserved.</p>
              </div>
            </div>
            <script>
              const API_BASE_URL = window.location.hostname === 'localhost' 
                ? 'http://localhost:3000' 
                : 'https://salmart.onrender.com';
              async function shareReceipt() {
                try {
                  const payload = {
                    reference: '${reference || ''}',
                    buyerId: '${buyer._id || ''}',
                    sellerId: '${seller._id || ''}',
                    amountPaid: ${amountPaid || 0},
                    transactionDate: '${transactionDate || ''}',
                    buyerName: '${buyerName || ''}',
                    email: '${buyer.email || ''}',
                    productTitle: '${productTitle || ''}',
                    receiptImageUrl: '${safeReceiptImageUrl}'
                  };
                  console.log('Sending /share-receipt payload:', payload);
                  const response = await fetch(API_BASE_URL + '/share-receipt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });

                  const result = await response.json();
                  if (result.success) {
                    window.location.href = API_BASE_URL + '/Chats.html?recipient_id=${seller._id || ''}&recipient_username=' + encodeURIComponent('${sellerName || ''}') + '&recipient_profile_picture_url=' + encodeURIComponent('${sellerProfilePic || ''}') + '&user_id=${buyer._id || ''}';
                  } else {
                    alert('Failed to share receipt: ' + result.message);
                  }
                } catch (error) {
                  alert('Error sharing receipt: ' + error.message);
                  console.error(error);
                }
              }
            </script>
          </body>
          </html>
        `);
      }
    } catch (error) {
      console.error('🚨 Error during payment verification:', error.message);
      res.status(500).send(`An error occurred: ${error.message}`);
    }
  });

  router.get('/Chats.html', (req, res) => {
    console.log('Serving chat.html');
    res.sendFile(path.join(__dirname, 'public', 'Chats.html'));
  });

  router.post('/share-receipt', async (req, res) => {
    try {
      const {
        reference,
        buyerId,
        sellerId,
        amountPaid,
        transactionDate,
        buyerName,
        email,
        productTitle,
        receiptImageUrl
      } = req.body;

      console.log('Received /share-receipt request:', req.body);

      const missingFields = [];
      if (!reference) missingFields.push('reference');
      if (!buyerId) missingFields.push('buyerId');
      if (!sellerId) missingFields.push('sellerId');
      if (amountPaid == null) missingFields.push('amountPaid');
      if (!transactionDate) missingFields.push('transactionDate');
      if (!buyerName) missingFields.push('buyerName');
      if (!email) missingFields.push('email');
      if (!productTitle) missingFields.push('productTitle');
      if (!receiptImageUrl) missingFields.push('receiptImageUrl');

      if (missingFields.length > 0) {
        console.error('Missing required fields:', missingFields, req.body);
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
          missing: missingFields
        });
      }

      const transaction = await Transaction.findOne({ paymentReference: reference });
      if (!transaction) {
        console.error('Transaction not found for paymentReference:', reference);
        return res.status(400).json({ success: false, message: 'Invalid transaction reference' });
      }

      const message = new Message({
        senderId: buyerId,
        receiverId: sellerId,
        messageType: 'image',
        attachment: { url: receiptImageUrl },
        text: `Receipt for ${productTitle}`,
        status: 'sent',
        timestamp: new Date()
      });

      await message.save();
      console.log('Sending message', message);
      io.to(`user_${sellerId}`).emit('receiveMessage', message.toObject());
      await sendFCMNotification(
        sellerId,
        'New Receipt',
        `${buyerName} shared a receipt for ${productTitle}`,
        { type: 'message', senderId: buyerId, receiptImageUrl }
      );

      res.json({ success: true, message: 'Receipt shared successfully' });
    } catch (error) {
      console.error('Error sharing receipt:', error.message, error.stack);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  return router;
};