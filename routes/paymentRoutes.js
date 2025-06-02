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

module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    logger.info('Attached io to request object in postRoutes');
    next();
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

// Save escrow record
            const post = await Post.findById(postId);
            if (!post) {
                console.log("⚠️ Post not found!");
                return res.status(404).send("Post not found.");
            }

            const email = data.data.customer.email;
            const buyer = await User.findOne({ email });
            const seller = await User.findById(post.createdBy.userId); // Get seller

            if (!seller) {
                console.log("⚠️ Seller not found!");
                return res.status(404).send("Seller not found.");
            }

            // ✅ Extract required data
            const buyerId = buyer ? buyer._id.toString() : null;
            const buyerName = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim()
            if(!buyer) {
              console.log('buyer not found');
              res.status(404).json({message: 'buyer not found'})
            }
            const amountPaid = data.data.amount / 100;
            
            const transactionDate = new Date(data.data.paid_at).toLocaleString();
          
            const productTitle = post.title || "No description available.";
            const sellerId = seller._id.toString();
            const sellerName = `${seller.firstName} ${seller.lastName}`;
            const sellerProfilePic = seller.profilePicture || "default.jpg";
            
            const COMMISSION_PERCENT = 2; // Platform earns 2%

const totalAmount = amountPaid; // Already calculated
const commission = (COMMISSION_PERCENT / 100) * totalAmount;
const sellerShare = totalAmount - commission;
            
            const notification = new Notification({
  userId: sellerId,       // Who should receive the notification (the seller)
  senderId: buyerId, // Who triggered the notification (the buyer)
  type: 'payment',  
  postId: postId,// New notification type
  payment: post.title,     
  message: `${buyer.firstName} ${buyer.lastName} just paid for your product: "${post.description}"`,
  createdAt: new Date()
  
});
const escrow = new Escrow({
  product : postId,
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
  amount: amountPaid ,
  status: 'pending', 
  viewed: false,
  paymentReference: reference,
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
console.log('notification sent')
// Send real-time notification via Socket.IO
req.io.to(sellerId.toString()).emit('notification', notification);
    let receiptImageUrl = '';
try {
    const receiptsDir = path.join(__dirname, 'receipts');
    if (!fs.existsSync(receiptsDir)) {
        fs.mkdirSync(receiptsDir, { recursive: true });
        console.log('Created receipts directory:', receiptsDir);
    }
    const imagePath = path.join(receiptsDir, `${reference}.png`);

    console.log('Starting Jimp image generation...');

    // Create image - synchronous constructor
    console.log('Jimp constructor:', Jimp);
    const image = new Jimp(600, 800, 0xFFFFFFFF); // White background
    console.log('Jimp image created:', image.bitmap.width, image.bitmap.height);

    // Load fonts
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    console.log('Fonts loaded');

    // Draw border
    for (let x = 0; x < 600; x++) {
        for (let y = 0; y < 800; y++) {
            if (x < 15 || x > 585 || y < 15 || y > 785) {
                image.setPixelColor(Jimp.rgbaToInt(0, 123, 255, 255), x, y);
            }
        }
    }

    // Title - centered
    const titleText = 'Payment Receipt';
    const titleX = (600 - Jimp.measureText(fontLarge, titleText)) / 2;
    image.print(fontLarge, titleX, 50, titleText);

    // Details with proper alignment
    const details = [
        `Reference: ${reference || 'N/A'}`,
        `Amount Paid: ₦${Number(amountPaid || 0).toLocaleString('en-NG')}`,
        `Date: ${transactionDate || new Date().toISOString()}`,
        `Buyer: ${buyerName || 'Unknown'}`,
        `Email: ${email || 'N/A'}`,
        `Title: ${productTitle || 'Purchase'}`
    ];

    let yPosition = 180;
    details.forEach(line => {
        image.print(font, 40, yPosition, line);
        yPosition += 50;
    });

    // Footer
    const footerText = 'Thank you for your payment!';
    const footerX = (600 - Jimp.measureText(font, footerText)) / 2;
    image.print(font, footerX, 700, footerText);

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

    // Clean up
    await fs.promises.unlink(imagePath);
    console.log('Temporary image deleted:', imagePath);
} catch (imageError) {
    console.error('🚨 Error generating or uploading image:', imageError.message, imageError.stack);
    receiptImageUrl = '';
    console.warn('⚠️ Proceeding without receipt image');
}
const safeReceiptImageUrl = String(receiptImageUrl || '');

// ✅ Send receipt page
res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Receipt</title>
        <style>
            body { font-family: Arial, sans-serif; background-color: #f8f8f8; text-align: center; padding: 20px; }
            .receipt-container {
                max-width: 400px;
                margin: auto;
                padding: 20px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                text-align: left;
            }
            .header {
                text-align: center;
                padding-bottom: 10px;
                border-bottom: 2px solid #007bff;
            }
            .header img { width: 80px; }
            .header h2 { color: #007bff; margin: 5px 0; }
            .status { text-align: center; font-size: 18px; padding: 10px; color: green; font-weight: bold; }
            .details p { font-size: 14px; margin: 5px 0; }
            .details span { font-weight: bold; }
            .footer {
                text-align: center;
                font-size: 12px;
                color: gray;
                padding-top: 10px;
                border-top: 1px solid #ddd;
            }
            .share-button {
                display: block;
                width: 100%;
                padding: 10px;
                margin-top: 10px;
                background: #28a745;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                text-align: center;
            }
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
                <p><span>Transaction Reference:</span> ${reference}</p>
                <p><span>Amount Paid:</span> ₦${Number(amountPaid).toLocaleString('en-NG')}</p>
                <p><span>Payment Date:</span> ${transactionDate}</p>
                <p><span>Buyer Name:</span> ${buyerName}</p>
                <p><span>Buyer Email:</span> ${email}</p>
                <p><span>Title:</span> ${productTitle}</p>
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
                        window.location.href = API_BASE_URL + '/Chats.html?recipient_id=${seller._id || ''}&recipient_usernarme=' + encodeURIComponent('${sellerName || ''}') + '&recipient_profile_picture_url=' + encodeURIComponent('${sellerProfilePic || ''}') + '&user_id=${buyer._id || ''}';
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




const bodyParser = require('body-parser');
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
            receiptImageUrl = ''
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
        console.log('Sending message', message)
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