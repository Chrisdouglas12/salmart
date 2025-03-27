// routes/adminUsers.js
const express = require('express');
const User = require('../models/User');
const adminAuth = require('../middlewares/adminAuth');

// GET all users
app.get('/', adminAuth, async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET a specific user
app.get('/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// BLOCK/UNBLOCK user
app.patch('/:id/block', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({ message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE user
app.delete('/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

const Ad = require('./models/Ad'); // Assuming you have Ad model
const Notification = require('./models/Notification'); // Assuming you have Notification model

// ======== ADMIN - ADS MANAGEMENT ========

// Get all ads
app.get('/api/admin/ads', adminAuth, async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 });
    res.json(ads);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch ads' });
  }
});

// Get single ad by ID
app.get('/api/admin/ads/:id', adminAuth, async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ message: 'Ad not found' });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching ad' });
  }
});

// Delete an ad
app.delete('/api/admin/ads/:id', adminAuth, async (req, res) => {
  try {
    const ad = await Ad.findByIdAndDelete(req.params.id);
    if (!ad) return res.status(404).json({ message: 'Ad not found' });
    res.json({ message: 'Ad deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting ad' });
  }
});

// Mark ad as featured (optional)
app.patch('/api/admin/ads/:id/feature', adminAuth, async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ message: 'Ad not found' });

    ad.featured = true;
    await ad.save();
    res.json({ message: 'Ad marked as featured', ad });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update ad' });
  }
});

// Get all notifications
app.get('/api/admin/notifications', adminAuth, async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// Send notification to all users (broadcast)
app.post('/api/admin/notifications', adminAuth, async (req, res) => {
  try {
    const { title, message } = req.body;
    const newNotification = new Notification({
      title,
      message,
      type: 'admin_broadcast',
    });
    await newNotification.save();
    res.json({ message: 'Notification sent to all users', newNotification });
  } catch (err) {
    res.status(500).json({ message: 'Error sending notification' });
  }
});

// Delete a notification
app.delete('/api/admin/notifications/:id', adminAuth, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting notification' });
  }
});
// View All Refund Requests
app.get('/api/admin/refund-requests', adminAuth, async (req, res) => {
  try {
    const refunds = await RefundRequest.find().populate('buyerId sellerId transactionId').sort({ createdAt: -1 });
    res.json(refunds);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching refund requests' });
  }
});

// Approve Refund
app.patch('/api/admin/refund-requests/:id/approve', adminAuth, async (req, res) => {
  try {
    const refund = await RefundRequest.findById(req.params.id);
    if (!refund || refund.status !== 'pending') return res.status(400).json({ message: 'Invalid refund request' });

    refund.status = 'approved';
    refund.adminComment = req.body.comment || '';
    await refund.save();

    // TODO: trigger Paystack refund OR manually refund from admin account
    // Optional: Also mark transaction as refunded

    res.json({ message: 'Refund approved', refund });
  } catch (err) {
    res.status(500).json({ message: 'Error approving refund' });
  }
});

// Reject Refund
app.patch('/api/admin/refund-requests/:id/reject', adminAuth, async (req, res) => {
  try {
    const refund = await RefundRequest.findById(req.params.id);
    if (!refund || refund.status !== 'pending') return res.status(400).json({ message: 'Invalid refund request' });

    refund.status = 'rejected';
    refund.adminComment = req.body.comment || '';
    await refund.save();

    res.json({ message: 'Refund rejected', refund });
  } catch (err) {
    res.status(500).json({ message: 'Error rejecting refund' });
  }
});

