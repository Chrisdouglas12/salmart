const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());

// Transaction model
const Transaction = require('./backend/Transaction'); // Update the path if it's elsewhere
const User = require('./models/User'); // assuming admin will also be a user

// Admin auth middleware
const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await User.findById(decoded.id);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'Admins only' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// GET all transactions
app.get('/api/admin/transactions', adminAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching transactions' });
  }
});

// GET single transaction
app.get('/api/admin/transactions/:id', adminAuth, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching transaction' });
  }
});

// FILTER transactions by status
app.get('/api/admin/transactions/status/:status', adminAuth, async (req, res) => {
  try {
    const { status } = req.params;
    const transactions = await Transaction.find({ status }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching transactions' });
  }
});

// UPDATE transaction status (e.g., mark as released)
app.patch('/api/admin/transactions/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body; // new status
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

    transaction.status = status;
    await transaction.save();

    res.json({ message: `Transaction marked as ${status}`, transaction });
  } catch (err) {
    res.status(500).json({ message: 'Error updating transaction' });
  }
});