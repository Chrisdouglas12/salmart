const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const User = require('../models/userSchema.js');
const PlatformWallet = require('../models/platformWallet.js');
const Transaction = require('../models/transactionSchema');
const Post = require('../models/postSchema');
const Admin = require('../models/adminSchema.js');
const RefundRequests = require('../models/refundSchema.js');
const Report = require('../models/reportSchema.js');
const Payout = require('../models/payoutSchema.js');
const Payment = require('../models/paymentSchema.js');
const verifyToken = require('../middleware/auths.js');
const Notification = require('../models/notificationSchema.js');
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
const winston = require('winston');

const paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);

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


const JWT_SECRET = process.env.JWT_SECRET;
const SECRET_ADMIN_CODE = process.env.SECRET_ADMIN_CODE;

// Set up storage dynamically
const uploadDir = path.join(__dirname, 'Uploads');
let storage;
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'Uploads',
      allowed_formats: ['jpg', 'png', 'jpeg'],
    },
  });
} else {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const fileExt = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${fileExt}`);
    },
  });
}
const upload = multer({ storage });


module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    next();
  });

  // --- Utility Functions ---
  async function markProductAsSold(txn, reference, io) {
    if (!txn || !txn.postId) return;
  
    try {
      await Post.findByIdAndUpdate(txn.postId._id || txn.postId, {
        status: 'sold',
        soldAt: new Date()
      });
  
      if (io) {
        io.emit('product-sold', {
          postId: txn.postId._id || txn.postId,
          status: 'sold'
        });
      }
  
    } catch (err) {
      console.error('[markProductAsSold ERROR]', err.message);
    }
  }


  // --- Transaction and Refund Routes ---
  
  // Get all refunds request
  router.get('/api/admin/refunds', verifyToken, async (req, res) => {
    try {
      const refunds = await RefundRequests.find()
        .populate('buyerId', 'firstName lastName')
        .populate('sellerId', 'firstName lastName')
        .populate('transactionId', 'amount description date')
        .sort({ createdAt: -1 });
  
      res.status(200).json(refunds);
    } catch (error) {
      console.error('Fetch refunds error:', error.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });


  // Get all transactions with tiered commission logic
  router.get('/api/admin/transactions', verifyToken, async (req, res) => {
    try {
      const transactions = await Transaction.find()
        .populate('buyerId', 'firstName lastName email')
        .populate('sellerId', 'firstName lastName email')
        .populate('postId', 'title')
        .select('buyerId sellerId postId amount status createdAt refundRequested paymentReference')
        .sort({ createdAt: -1 });
  
      const transactionsWithCommission = transactions.map(tx => {
        const amount = tx.amount || 0;
        let commission = 0;
  
        if (amount <= 10000) commission = 0.065 * amount;
        else if (amount <= 20000) commission = 0.055 * amount;
        else if (amount <= 50000) commission = 0.045 * amount;
        else if (amount <= 100000) commission = 0.04 * amount;
        else commission = 0.025 * amount;
  
        commission = parseFloat(commission.toFixed(2));
        const sellerAmount = parseFloat((amount - commission).toFixed(2));
  
        return {
          ...tx.toObject(),
          platformCommission: commission,
          sellerAmount
        };
      });
  
      res.status(200).json(transactionsWithCommission);
    } catch (error) {
      console.error('Fetch transactions error:', error.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });


  // Get pending transactions
  router.get('/admin/transactions/pending', verifyToken, async (req, res) => {
    try {
      const pendingTxns = await Transaction.find({
        status: { $in: ['confirmed_pending_payout', 'in_escrow'] }
      })
      .populate('postId', 'title', )
      .populate('buyerId', 'firstName lastName email')
      .sort({ createdAt: -1 });
  
      res.json({ success: true, data: pendingTxns });
    } catch (err) {
      logger.error('[ADMIN TXNS] Error fetching pending txns:', err);
      res.status(500).json({ success: false, message: 'Error loading transactions' });
    }
  });


  // Approve a payment
  router.post('/admin/approve-payment', verifyToken, async (req, res) => {
    const { reference } = req.body;
  
    try {
      const txn = await Transaction.findOne({
        paymentReference: new RegExp(`^${reference}$`, 'i')
      }).populate('postId buyerId sellerId');
  
      if (!txn) {
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }
  
      if (!['confirmed_pending_payout', 'pending', 'in_escrow'].includes(txn.status)) {
        return res.status(400).json({ success: false, message: 'Transaction not in payout-ready state' });
      }
  
      const systemUser = await User.findOne({ isSystemUser: true });
      if (!systemUser) {
        logger.error('[SYSTEM USER NOT FOUND]');
        return res.status(500).json({ error: 'System user not found' });
      }
  
      const seller = txn.sellerId;
  
      if (
        !seller.bankDetails ||
        !seller.bankDetails.accountNumber ||
        !seller.bankDetails.bankCode ||
        !seller.bankDetails.accountName
      ) {
        return res.status(400).json({
          success: false,
          message: 'Seller bank details missing. Cannot create recipient.'
        });
      }
  
      let recipientCode = seller?.paystack?.recipientCode;
      if (!recipientCode) {
        const recipientResponse = await axios.post(
          'https://api.paystack.co/transferrecipient',
          {
            type: 'nuban',
            name: seller.bankDetails.accountName,
            account_number: seller.bankDetails.accountNumber,
            bank_code: seller.bankDetails.bankCode,
            currency: 'NGN'
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            }
          }
        );
  
        recipientCode = recipientResponse.data.data.recipient_code;
  
        seller.paystack = seller.paystack || {};
        seller.paystack.recipientCode = recipientCode;
        await seller.save();
      }
  
      const amountKobo = Math.round(txn.amountDue * 100);
      const transferReason = `Manual payout for: ${txn.postId?.title || 'Product'}`;
  
      const transferPayload = {
        source: 'balance',
        amount: amountKobo,
        recipient: recipientCode,
        reason: transferReason
      };
  
      const transferResponse = await axios.post(
        'https://api.paystack.co/transfer',
        transferPayload,
        {
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
        }
      );
  
      const paystackRef = transferResponse.data.data.reference;
  
      txn.status = 'released';
      txn.transferReference = paystackRef;
      txn.amountTransferred = txn.amountDue;
      txn.transferStatus = transferResponse.data.data.status;
      txn.paidAt = new Date();
      txn.approvedByAdmin = true;
      txn.transferRecipient = recipientCode;
      await txn.save();
  
      await markProductAsSold(txn, reference, req.io);
  
      const title = 'Payment Released by Admin';
      const productTitle = txn.postId?.title || 'product';
      const message = `₦${txn.amountDue.toLocaleString('en-NG')} for "${productTitle}" has been released to your account.`;
  
      await Notification.create({
        userId: txn.sellerId._id,
        senderId: systemUser._id,
        postId: txn.postId?._id,
        title,
        message,
        type: 'payment_released',
        metadata: {
          transactionId: txn._id,
          reference: paystackRef
        }
      });
  
      await sendFCMNotification(
        txn.sellerId._id,
        title,
        message,
        {
          type: 'payment_released',
          transactionId: txn._id.toString(),
          reference: paystackRef
        }
      );
  
      return res.json({
        success: true,
        message: 'Payment released and product marked as sold',
        data: txn
      });
  
    } catch (err) {
      console.error('[ADMIN PAYOUT ERROR]', err.message, err.stack);
      return res.status(500).json({ success: false, message: 'Error approving payment', error: err.message });
    }
  });


  // Process a refund
  router.post('/api/admin/refunds/:id/:action', verifyToken, async (req, res) => {
    try {
      const { id, action } = req.params;
  
      const refund = await RefundRequests.findOne({ transactionId: id }).populate('transactionId buyerId sellerId description');
      if (!refund) {
        return res.status(404).json({ success: false, message: 'Refund request not found' });
      }
  
      const transaction = await Transaction.findById(refund.transactionId);
      if (!transaction || !transaction.paymentReference) {
        return res.status(404).json({ success: false, message: 'Related transaction not found or missing payment reference' });
      }
  
      const buyerId = refund.buyerId?._id || transaction.buyerId;
      const postId = refund.description?._id || transaction.postId;
      const amount = transaction.amount || 0;
      const productTitle = refund.description?.title || 'product';
  
      const systemUser = await User.findOne({ isSystemUser: true });
      if (!systemUser) {
        console.error('[SYSTEM USER NOT FOUND]');
        return res.status(500).json({ error: 'System user not found' });
      }
  
      if (action === 'approve') {
        let paystackFee = (1.5 / 100) * amount;
        if (amount > 2500) paystackFee += 100;
        if (paystackFee > 2000) paystackFee = 2000;
  
        const refundAmount = Math.round((amount - paystackFee) * 100);
  
        try {
          const refundResponse = await axios.post(
            'https://api.paystack.co/refund',
            {
              transaction: transaction.paymentReference,
              amount: refundAmount
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
              }
            }
          );
  
          const refundData = refundResponse.data.data;
  
          refund.status = 'refunded';
          refund.adminComment = 'Refund approved and processed';
          await refund.save();
  
          transaction.status = 'refunded';
          transaction.refundedAt = new Date();
          transaction.refundReference = refundData?.refund_reference || 'manual';
          transaction.refundStatus = refundData?.status || 'initiated';
          await transaction.save();
  
          await Notification.create({
            userId: buyerId,
            senderId: systemUser._id,
            postId,
            title: 'Refund Approved',
            message: `₦${(amount - paystackFee).toLocaleString('en-NG')} has been refunded for your purchase of "${productTitle}".`,
            type: 'refund_processed',
            metadata: {
              refundId: refund._id,
              transactionId: transaction._id,
              amount: amount - paystackFee,
              reference: transaction.refundReference
            }
          });
  
          await sendFCMNotification(
            buyerId,
            'Refund Approved',
            `₦${(amount - paystackFee).toLocaleString('en-NG')} refunded for "${productTitle}".`,
            {
              type: 'refund_processed',
              refundId: refund._id.toString(),
              transactionId: transaction._id.toString(),
              amount: amount - paystackFee,
              reference: transaction.refundReference
            }
          );
  
          return res.status(200).json({
            success: true,
            message: 'Refund approved and processed via Paystack',
            data: refundData
          });
  
        } catch (paystackErr) {
          console.error('[PAYSTACK REFUND ERROR]', paystackErr.response?.data || paystackErr.message);
          return res.status(500).json({
            success: false,
            message: 'Refund failed on Paystack',
            error: paystackErr.response?.data?.message || paystackErr.message
          });
        }
  
      } else if (action === 'deny') {
        refund.status = 'rejected';
        refund.adminComment = 'Refund denied by admin';
        await refund.save();
  
        await Notification.create({
          userId: buyerId,
          senderId: systemUser._id,
          postId,
          title: 'Refund Denied',
          message: `Your refund request for "${productTitle}" was denied by admin.`,
          type: 'refund_rejected',
          metadata: {
            refundId: refund._id,
            transactionId: transaction._id
          }
        });
  
        await sendFCMNotification(
          buyerId,
          'Refund Denied',
          `Your refund request for "${productTitle}" was rejected.`,
          {
            type: 'refund_rejected',
            refundId: refund._id.toString(),
            transactionId: transaction._id.toString(),
          }
        );
  
        return res.status(200).json({ success: true, message: 'Refund request denied' });
      }
  
      return res.status(400).json({ success: false, message: 'Invalid action' });
  
    } catch (err) {
      console.error('[ADMIN REFUND ERROR]', err.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });


  // --- Platform Wallet Routes ---

  // Get platform wallet balance
  router.get('/admin/platform-wallet', verifyToken, async (req, res) => {
    try {
      const { type } = req.query;
  
      const validTypes = ['commission', 'promotion'];
      if (!type || !validTypes.includes(type)) {
        return res.status(400).json({ success: false, message: 'Invalid wallet type specified.' });
      }
  
      let walletInfo = null;
  
      const platformWalletDoc = await PlatformWallet.findOne({ type });
  
      if (!platformWalletDoc) {
        walletInfo = {
          type: type,
          balance: 0,
          lastUpdated: new Date()
        };
      } else {
        walletInfo = {
          type: platformWalletDoc.type,
          balance: platformWalletDoc.balance,
          lastUpdated: platformWalletDoc.lastUpdated,
        };
      }
  
      res.status(200).json({
        success: true,
        wallet: walletInfo
      });
  
    } catch (err) {
      console.error('[WALLET FETCH ERROR]', err.message);
      res.status(500).json({ success: false, message: 'Failed to retrieve platform wallet info' });
    }
  });


  // Withdraw from platform wallet
  router.post('/admin/platform-wallet/withdraw', verifyToken, async (req, res) => {
    const { amount: rawAmount, type } = req.body;
    const amountToWithdrawKobo = parseInt(rawAmount, 10);
  
    if (isNaN(amountToWithdrawKobo) || amountToWithdrawKobo <= 0) {
      console.error(`[WITHDRAWAL VALIDATION FAIL] rawAmount: ${rawAmount}, parsed amountToWithdrawKobo: ${amountToWithdrawKobo}`);
      return res.status(400).json({ error: 'Invalid withdrawal amount: Must be a positive number.' });
    }
  
    if (!['commission', 'promotion'].includes(type)) {
      return res.status(400).json({ error: 'Invalid wallet type specified.' });
    }
  
    try {
      const platformWallet = await PlatformWallet.findOne({ type });
  
      if (!platformWallet || platformWallet.balance < amountToWithdrawKobo) {
        console.error(`[WITHDRAWAL BALANCE FAIL] Wallet balance: ${platformWallet ? platformWallet.balance : 'N/A'}, Attempted withdrawal: ${amountToWithdrawKobo}`);
        return res.status(400).json({ error: `Insufficient ${type} balance.` });
      }
  
      let recipientCode = process.env.PLATFORM_RECIPIENT_CODE || platformWallet.recipientCode;
  
      if (!recipientCode) {
        const { PLATFORM_ACCOUNT_NUMBER, PLATFORM_BANK_CODE, PLATFORM_ACCOUNT_NAME, PAYSTACK_SECRET_KEY } = process.env;
        if (!PLATFORM_ACCOUNT_NUMBER || !PLATFORM_BANK_CODE) {
          return res.status(500).json({ error: 'Platform bank details are not configured.' });
        }
  
        const recipientRes = await axios.post(
          'https://api.paystack.co/transferrecipient',
          {
            type: 'nuban',
            name: PLATFORM_ACCOUNT_NAME || 'Salmart Technologies',
            account_number: PLATFORM_ACCOUNT_NUMBER,
            bank_code: PLATFORM_BANK_CODE,
            currency: 'NGN'
          },
          {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
          }
        );
  
        recipientCode = recipientRes.data?.data?.recipient_code;
  
        if (!recipientCode) {
          return res.status(500).json({ error: 'Paystack did not return a valid recipient_code.' });
        }
  
        platformWallet.recipientCode = recipientCode;
        await platformWallet.save();
      }
  
      const transfer = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: amountToWithdrawKobo,
          recipient: recipientCode,
          reason: `Withdrawal of platform ${type}`
        },
        {
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
        }
      );
  
      const reference = transfer?.data?.data?.reference;
      if (!reference) {
        return res.status(500).json({ error: 'Paystack transfer did not return a valid reference.' });
      }
  
      platformWallet.balance -= amountToWithdrawKobo;
      platformWallet.lastUpdated = new Date();
  
      const newTransaction = {
        amount: amountToWithdrawKobo,
        reference,
        type: 'debit',
        purpose: `withdraw_${type}`,
        timestamp: new Date()
      };
  
      console.log('✅ Adding transaction to wallet:', newTransaction);
      platformWallet.transactions.push(newTransaction);
      platformWallet.markModified('transactions');
      await platformWallet.save();
  
      return res.status(200).json({
        message: `${type.charAt(0).toUpperCase() + type.slice(1)} withdrawal successful`,
        transferReference: reference
      });
  
    } catch (err) {
      if (err.name === 'ValidationError') {
        console.error(`[WITHDRAW ${type.toUpperCase()} VALIDATION ERROR]`, err.message);
        for (let field in err.errors) {
          console.error(`  - Field: ${field}, Message: ${err.errors[field].message}`);
        }
        return res.status(400).json({
          error: 'Validation failed',
          details: err.message
        });
      } else {
        console.error(`[WITHDRAW ${type.toUpperCase()} ERROR]`, err.response?.data || err.message);
        return res.status(500).json({
          error: 'Paystack transfer failed or unexpected error',
          details: err.response?.data?.message || err.message
        });
      }
    }
  });


  // Get platform wallet transactions
  router.get('/admin/platform-wallet/transactions', verifyToken, async (req, res) => {
    const { type } = req.query;
    if (!type || !['commission', 'promotion'].includes(type)) {
      return res.status(400).json({ error: 'Invalid wallet type.' });
    }
  
    const wallet = await PlatformWallet.findOne({ type }).populate('userId productId');
    if (!wallet) {
      return res.json({ transactions: [] });
    }
  
    res.json({ transactions: wallet.transactions });
  });


  return router;
};
