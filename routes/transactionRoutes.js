const express = require('express')
const mongoose = require('mongoose')
const Post = require('../models/postSchema.js')
const User = require('../models/userSchema.js')
const Report = require('../models/reportSchema.js')
const RefundRequests = require('../models/refundSchema.js')
const verifyToken = require('../middleware/auths.js')
const Transaction = require('../models/transactionSchema.js')
const router = express.Router()
const Notification = require('../models/notificationSchema.js')

module.exports = (io) => {
//Get Transaction
router.get('/get-transactions/:userId', verifyToken, async (req, res) => {
 console.log("fecting tx")
  try {
    const userId = req.params.userId;
    const transactions = await Transaction.find({ $or: [{ buyerId: userId }, { sellerId: userId }] })
      .populate('buyerId sellerId productId')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, transactions });
  } catch (error) {
    console.error('Fetch transactions error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
//Check payment status
router.get('/check-payment-status', async (req, res) => {
  try {
    const { productId, buyerId } = req.query;
    const [transaction, escrow] = await Promise.all([
      Transaction.findOne({ productId, buyerId, status: 'completed' }),
      Escrow.findOne({ product: productId, buyer: buyerId, status: 'Released' }),
    ]);
    res.status(200).json({ success: true, paymentCompleted: !!(transaction || escrow) });
  } catch (error) {
    console.error('Check payment status error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/release-escrow', verifyToken, async (req, res) => {
  try {
    const { postId } = req.body;
    if (!postId) {
      return res.status(400).json({ success: false, message: 'Post ID is required' });
    }

    const escrow = await Escrow.findOne({ postId });
    if (!escrow || escrow.status !== 'In Escrow') {
      return res.status(404).json({ success: false, message: 'Escrow not found or already released' });
    }

    const seller = await User.findById(escrow.seller);
    if (!seller || !seller.flutterwaveBeneficiaryId) {
      return res.status(400).json({ success: false, message: 'Seller beneficiary ID not available' });
    }

    const response = await axios.post(
      'https://api.flutterwave.com/v3/transfers',
      {
        account_bank: seller.bank_code,
        account_number: seller.account_number,
        amount: escrow.sellerShare,
        currency: 'NGN',
        narration: `Payout for post: ${postId}`,
        beneficiary: seller.flutterwaveBeneficiaryId,
      },
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
    );

    if (response.data.status !== 'success') {
      return res.status(400).json({ success: false, message: response.data.message || 'Transfer failed' });
    }

    escrow.status = 'Released';
    escrow.transferReference = response.data.data.reference;
    await Promise.all([escrow.save(), Post.findByIdAndUpdate(postId, { isSold: true })]);
    res.status(200).json({ success: true, message: 'Escrow released successfully', data: response.data.data });
  } catch (error) {
    console.error('Release escrow error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/banks/register', async (req, res) => {
  try {
    const response = await axios.get('https://api.flutterwave.com/v3/banks/NG', {
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
    });

    if (response.data.status !== 'success') {
      return res.status(400).json({ success: false, message: response.data.message || 'Unable to fetch banks' });
    }
    res.status(200).json({ success: true, banks: response.data.data });
  } catch (error) {
    console.error('Fetch banks error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/resolve-account', async (req, res) => {
  try {
    const { account_number, bank_code } = req.body;
    const response = await axios.post(
      'https://api.flutterwave.com/v3/accounts/resolve',
      { account_number, account_bank: bank_code },
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
    );

    if (response.data.status === 'success') {
      res.status(200).json({ success: true, account_name: response.data.data.account_name });
    } else {
      res.status(400).json({ success: false, message: response.data.message || 'Unable to resolve account' });
    }
  } catch (error) {
    console.error('Resolve account error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/create-recipient', verifyToken, async (req, res) => {
  try {
    const { sellerId, account_number, bank_code } = req.body;
    if (!sellerId || !account_number || !bank_code) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const seller = await User.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const payload = {
      account_number,
      account_bank: bank_code,
      account_name: `${seller.firstName} ${seller.lastName}`,
      currency: 'NGN',
    };

    const response = await axios.post('https://api.flutterwave.com/v3/beneficiaries', payload, {
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' },
    });

    if (response.data.status !== 'success') {
      return res.status(400).json({ success: false, message: response.data.message || 'Failed to create beneficiary' });
    }

    seller.flutterwaveBeneficiaryId = response.data.data.id;
    seller.account_number = account_number;
    seller.bank_code = bank_code;
    await seller.save();

    res.status(200).json({ success: true, message: 'Beneficiary created successfully', beneficiary_id: response.data.data.id });
  } catch (error) {
    console.error('Create recipient error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
//Get products for bargain
router.get('/products', verifyToken, async (req, res) => {
  try {
    const { sellerId } = req.query;
    const query = { price: { $exists: true, $ne: '' }, productCondition: { $exists: true, $ne: '' }, location: { $exists: true, $ne: '' }, isSold: false };
    if (sellerId) query['createdBy.userId'] = sellerId;

    const products = await Post.find(query).sort({ createdAt: -1 }).populate('createdBy.userId', 'firstName lastName profilePicture');
    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error('Fetch products error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

//Update price after successful bargain
router.put('/posts/:postId/update-price', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { newPrice } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid Post ID' });
    }
    if (newPrice === undefined || isNaN(newPrice) || newPrice < 0) {
      return res.status(400).json({ success: false, message: 'Invalid price' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    post.price = newPrice;
    await post.save();
    res.status(200).json({ success: true, message: 'Price updated successfully', post });
  } catch (error) {
    console.error('Update price error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Request Refund
router.post('/request-refund/:transactionId', verifyToken, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason, evidence } = req.body;
    const userId = req.user.userId;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.buyerId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Refund not applicable' });
    }

    const existingRefund = await RefundRequests.findOne({ transactionId });
    if (existingRefund) {
      return res.status(400).json({ success: false, message: 'Refund already requested' });
    }

    const refund = new RefundRequests({
      transactionId,
      buyerId: userId,
      reason,
      evidence,
      status: 'pending',
    });

    await Promise.all([refund.save(), transaction.updateOne({ refundRequested: true })]);
    res.status(200).json({ success: true, message: 'Refund requested successfully' });
  } catch (error) {
    console.error('Request refund error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Confirm Delivery
router.post('/confirm-delivery/:transactionId', verifyToken, async (req, res) => {
  try {
    const transactionId = req.params.transactionId;
    const userId = req.user.userId;

    const transaction = await Transaction.findById(transactionId).populate('buyerId sellerId productId');
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.buyerId._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const seller = transaction.sellerId;
    if (!seller.bankDetails?.accountNumber || !seller.bankDetails?.bankCode) {
      return res.status(400).json({ success: false, message: 'Seller bank details missing' });
    }

    let beneficiaryId = seller.flutterwaveBeneficiaryId;
    if (!beneficiaryId) {
      const beneficiaryPayload = {
        account_number: seller.bankDetails.accountNumber,
        account_bank: seller.bankDetails.bankCode,
        account_name: `${seller.firstName} ${seller.lastName}`,
        currency: 'NGN',
      };
      const beneficiaryResponse = await axios.post(
        'https://api.flutterwave.com/v3/beneficiaries',
        beneficiaryPayload,
        { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } }
      );

      if (beneficiaryResponse.data.status !== 'success') {
        return res.status(400).json({ success: false, message: 'Failed to create beneficiary' });
      }

      beneficiaryId = beneficiaryResponse.data.data.id;
      seller.flutterwaveBeneficiaryId = beneficiaryId;
      seller.account_number = seller.bankDetails.accountNumber;
      seller.bank_code = seller.bankDetails.bankCode;
      await seller.save();
    }

    const productPrice = transaction.productId?.price || 0;
    const commission = (2.5 / 100) * productPrice;
    const amountToTransfer = productPrice - commission;

    const transferPayload = {
      account_bank: seller.bankDetails.bankCode,
      account_number: seller.bankDetails.accountNumber,
      amount: amountToTransfer,
      currency: 'NGN',
      narration: `Payment for product: ${transaction.productId?.description}`,
      beneficiary: beneficiaryId,
    };

    const transferResponse = await axios.post(
      'https://api.flutterwave.com/v3/transfers',
      transferPayload,
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } }
    );

    if (transferResponse.data.status !== 'success') {
      return res.status(400).json({ success: false, message: 'Transfer failed' });
    }

    transaction.status = 'released';
    await transaction.save();
    await Post.findByIdAndUpdate(transaction.productId._id, { isSold: true });

    res.status(200).json({
      success: true,
      message: 'Delivery confirmed. Payment released to seller.',
      transferReference: transferResponse.data.data.reference,
      amountTransferred: amountToTransfer,
    });
  } catch (error) {
    console.error('Confirm delivery error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update Bank Details
router.post('/update-bank-details', verifyToken, async (req, res) => {
  const { accountNumber, bankCode, bankName } = req.body;
  const userId = req.user.userId;

  if (!accountNumber || !bankCode || !bankName) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const response = await axios.post(
      'https://api.flutterwave.com/v3/accounts/resolve',
      { account_number: accountNumber, account_bank: bankCode },
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
    );

    if (response.data.status !== 'success') {
      return res.status(400).json({ success: false, message: response.data.message || 'Failed to verify account details' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { bankDetails: { accountNumber, bankCode, bankName, accountName: response.data.data.account_name } },
      { new: true }
    );

    res.status(200).json({ success: true, message: 'Bank details updated successfully', bankDetails: updatedUser.bankDetails });
  } catch (error) {
    console.error('Update bank details error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update bank details' });
  }
});

// Get Bank Details
router.get('/get-bank-details', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('bankDetails');
    if (!user || !user.bankDetails) {
      return res.status(404).json({ success: false, message: 'Bank details not found' });
    }
    res.status(200).json({ success: true, bankDetails: user.bankDetails });
  } catch (error) {
    console.error('Get bank details error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch bank details' });
  }
});


  return router;
};