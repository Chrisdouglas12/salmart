const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/userSchema.js');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const Post = require('../models/postSchema.js');
const Review = require('../models/reviewSchema.js');
const Report = require('../models/reportSchema.js');
const verifyToken = require('../middleware/auths');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const winston = require('winston');

require('dotenv').config();

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/userRoutes.log' }),
    new winston.transports.Console(),
  ],
});

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'Zoho',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
logger.info('✅ Cloudinary configured in userRoutes');

// Set up storage dynamically
const uploadDir = path.join(__dirname, '../Uploads');
const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = isProduction
  ? new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'profile_pictures',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
        invalidate: true, // Invalidate CDN cache for updated images
      },
    })
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const fileExt = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${fileExt}`);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for profile pictures
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Invalid file type. Only JPEG, PNG are allowed.'));
  },
});

// Helper function for Cloudinary upload (used in development)
const uploadToCloudinary = (filePath) => {
  return new Promise((resolve, reject) => {
    logger.info(`Uploading to Cloudinary: ${filePath}`);
    cloudinary.uploader.upload(
      filePath,
      {
        folder: 'profile_pictures',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
        invalidate: true,
      },
      (error, result) => {
        if (error) {
          logger.error(`Cloudinary upload error: ${error.message}`);
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );
  });
};

// Helper function for file cleanup
const cleanupFiles = (filePaths) => {
  filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.info(`Cleaned up file: ${filePath}`);
      } catch (err) {
        logger.error(`Error cleaning up file ${filePath}: ${err.message}`);
      }
    }
  });
};

module.exports = (io) => {
  router.use((req, res, next) => {
    req.io = io;
    logger.info('Attached io to request object in userRoutes');
    next();
  });

  // Register a user
  router.post('/register', async (req, res) => {
    try {
      let { firstName, lastName, email, password, accountNumber, bankCode, accountName } = req.body;
      email = email.trim().toLowerCase();

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        logger.warn(`Registration attempt with existing email: ${email}`);
        return res.status(400).json({ message: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new User({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        bankDetails: {
          accountNumber,
          bankCode,
          accountName,
        },
        profilePicture: 'default-avatar.png', // Set default profile picture
      });

      await newUser.save();
      logger.info(`New user registered: ${newUser._id}`);

      res.status(201).json({
        message: 'User created successfully',
        userId: newUser._id,
      });
    } catch (error) {
      logger.error(`Register error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Login
  router.post('/login', async (req, res) => {
    try {
      let { email, password } = req.body;
      email = email.trim().toLowerCase();

      const user = await User.findOne({ email });
      if (!user) {
        logger.warn(`Login attempt with non-existent email: ${email}`);
        return res.status(400).json({ message: 'User not found' });
      }
      if (user.isBanned) {
        logger.warn(`Banned user attempted login: ${user._id}`);
        return res.status(403).json({ message: 'Account is banned' });
      }

      const isPassword = await bcrypt.compare(password, user.password);
      if (!isPassword) {
        logger.warn(`Invalid password for user: ${user._id}`);
        return res.status(400).json({ message: 'Invalid password' });
      }

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1w' });
      logger.info(`User logged in: ${user._id}`);

      res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          bio: user.bio,
          userId: user._id,
          email: user.email,
          profilePicture: user.profilePicture || 'default-avatar.png',
        },
      });
    } catch (error) {
      logger.error(`Login error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Verify token
  router.get('/verify-token', verifyToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) {
        logger.error(`User not found for token verification: ${req.user.userId}`);
        return res.status(404).json({ message: 'User not found' });
      }
      res.status(200).json({
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        followers: user.followers?.length || 0,
        following: user.following?.length || 0,
        products: user.products || [],
        profilePicture: user.profilePicture || 'default-avatar.png',
      });
    } catch (error) {
      logger.error(`Verify token error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Update user
  router.patch('/users/:id', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (req.user.userId !== id) {
        logger.warn(`Unauthorized update attempt by user ${req.user.userId} on user ${id}`);
        return res.status(403).json({ message: 'Not authorized to update this user' });
      }

      const updateData = { ...req.body };
      delete updateData.password; // Prevent password updates via this route
      delete updateData.email; // Prevent email updates via this route

      const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
      if (!updatedUser) {
        logger.error(`User not found for update: ${id}`);
        return res.status(404).json({ message: 'User not found' });
      }

      logger.info(`User updated: ${id}`);
      res.json({
        userId: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        bio: updatedUser.bio,
        profilePicture: updatedUser.profilePicture || 'default-avatar.png',
      });
    } catch (error) {
      logger.error(`Update user error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Get user profile
  router.get('/users-profile/:id', verifyToken, async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User not found for profile: ${userId}`);
        return res.status(404).json({ message: 'User not found' });
      }
      logger.info(`Fetched profile for user: ${userId}`);
      res.json({
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        bio: user.bio,
        email: user.email,
        followers: user.followers?.length || 0,
        following: user.following?.length || 0,
        products: user.products || [],
        profilePicture: user.profilePicture || 'default-avatar.png',
      });
    } catch (error) {
      logger.error(`Get user profile error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Profile picture upload
  router.post('/upload-profile-picture', verifyToken, upload.single('profilePicture'), async (req, res) => {
    let tempFiles = [];
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User not found for profile picture upload: ${userId}`);
        return res.status(404).json({ message: 'User not found' });
      }
      if (!req.file) {
        logger.warn(`No file uploaded for profile picture by user: ${userId}`);
        return res.status(400).json({ message: 'Profile picture is required' });
      }

      let profilePictureUrl;
      if (isProduction) {
        profilePictureUrl = req.file.path; // Cloudinary URL with transformations
      } else {
        profilePictureUrl = await uploadToCloudinary(req.file.path);
        tempFiles.push(req.file.path);
      }

      // Delete old profile picture from Cloudinary if it exists (in production)
      if (isProduction && user.profilePicture && user.profilePicture.includes('cloudinary.com')) {
        try {
          const publicId = user.profilePicture.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`profile_pictures/${publicId}`);
          logger.info(`Deleted old profile picture from Cloudinary for user: ${userId}`);
        } catch (error) {
          logger.warn(`Failed to delete old profile picture from Cloudinary: ${error.message}`);
        }
      }

      user.profilePicture = profilePictureUrl;
      await user.save();

      // Emit profile picture update to connected clients
      req.io.to(`user_${userId}`).emit('profilePictureUpdate', {
        userId,
        profilePicture: profilePictureUrl,
      });

      logger.info(`Profile picture updated for user: ${userId}`);
      res.json({ profilePicture: profilePictureUrl });
    } catch (error) {
      logger.error(`Profile picture upload error for user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    } finally {
      cleanupFiles(tempFiles);
    }
  });

  // Get profile picture
  router.get('/profile-picture', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User not found for profile picture fetch: ${userId}`);
        return res.status(404).json({ message: 'User not found' });
      }
      res.json({ profilePicture: user.profilePicture || 'default-avatar.png' });
    } catch (error) {
      logger.error(`Get profile picture error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Delete user
  router.delete('/users/:id', verifyToken, async (req, res) => {
    try {
      const userId = req.params.id;
      if (req.user.userId !== userId) {
        logger.warn(`Unauthorized delete attempt by user ${req.user.userId} on user ${userId}`);
        return res.status(403).json({ message: 'Not authorized to delete this user' });
      }

      const deletedUser = await User.findByIdAndDelete(userId);
      if (!deletedUser) {
        logger.error(`User not found for deletion: ${userId}`);
        return res.status(404).json({ message: 'User not found' });
      }

      // Delete associated posts
      await Post.deleteMany({ 'createdBy.userId': userId });
      logger.info(`Deleted posts for user: ${userId}`);

      logger.info(`User deleted: ${userId}`);
      res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
      logger.error(`Delete user error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Submit review
  router.post('/submit-review', verifyToken, async (req, res) => {
    try {
      const { reviewedUserId, rating, review } = req.body;
      const reviewerId = req.user.userId;

      if (!reviewedUserId || !rating || !review) {
        logger.warn(`Missing fields in review submission by user: ${reviewerId}`);
        return res.status(400).json({ message: 'All fields are required' });
      }
      if (!mongoose.Types.ObjectId.isValid(reviewedUserId)) {
        logger.warn(`Invalid reviewed user ID: ${reviewedUserId}`);
        return res.status(400).json({ message: 'Invalid reviewed user ID' });
      }
      if (rating < 1 || rating > 5) {
        logger.warn(`Invalid rating ${rating} by user: ${reviewerId}`);
        return res.status(400).json({ message: 'Rating must be between 1 and 5' });
      }
      if (reviewerId === reviewedUserId) {
        logger.warn(`User ${reviewerId} attempted to review themselves`);
        return res.status(400).json({ message: 'You cannot review yourself' });
      }

      const existingReview = await Review.findOne({ reviewerId, reviewedUserId });
      if (existingReview) {
        logger.warn(`User ${reviewerId} already reviewed user ${reviewedUserId}`);
        return res.status(400).json({ message: 'You have already reviewed this user' });
      }

      const newReview = new Review({
        reviewerId,
        reviewedUserId,
        rating,
        review,
        createdAt: new Date(),
      });
      await newReview.save();

      const populatedReview = await Review.findById(newReview._id)
        .populate('reviewerId', 'firstName lastName profilePicture')
        .lean();

      logger.info(`Review submitted by user ${reviewerId} for user ${reviewedUserId}`);
      res.status(201).json({
        success: true,
        message: 'Review submitted successfully',
        review: {
          ...populatedReview,
          reviewerId: {
            ...populatedReview.reviewerId,
            profilePicture: populatedReview.reviewerId.profilePicture || 'default-avatar.png',
          },
        },
      });
    } catch (error) {
      logger.error(`Submit review error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Update review
  router.patch('/update-review', verifyToken, async (req, res) => {
    try {
      const { reviewedUserId, rating, review } = req.body;
      const reviewerId = req.user.userId;

      if (!reviewedUserId || !rating || !review) {
        logger.warn(`Missing fields in review update by user: ${reviewerId}`);
        return res.status(400).json({ message: 'All fields are required' });
      }
      if (!mongoose.Types.ObjectId.isValid(reviewedUserId)) {
        logger.warn(`Invalid reviewed user ID: ${reviewedUserId}`);
        return res.status(400).json({ message: 'Invalid reviewed user ID' });
      }
      if (rating < 1 || rating > 5) {
        logger.warn(`Invalid rating ${rating} by user: ${reviewerId}`);
        return res.status(400).json({ message: 'Rating must be between 1 and 5' });
      }
      if (reviewerId === reviewedUserId) {
        logger.warn(`User ${reviewerId} attempted to review themselves`);
        return res.status(400).json({ message: 'You cannot review yourself' });
      }

      const existingReview = await Review.findOne({ reviewerId, reviewedUserId });
      if (!existingReview) {
        logger.warn(`No review found to update for user ${reviewerId} on ${reviewedUserId}`);
        return res.status(404).json({ message: 'No review found to update' });
      }

      existingReview.rating = rating;
      existingReview.review = review;
      existingReview.createdAt = new Date();
      await existingReview.save();

      const populatedReview = await Review.findById(existingReview._id)
        .populate('reviewerId', 'firstName lastName profilePicture')
        .lean();

      logger.info(`Review updated by user ${reviewerId} for user ${reviewedUserId}`);
      res.status(200).json({
        success: true,
        message: 'Review updated successfully',
        review: {
          ...populatedReview,
          reviewerId: {
            ...populatedReview.reviewerId,
            profilePicture: populatedReview.reviewerId.profilePicture || 'default-avatar.png',
          },
        },
      });
    } catch (error) {
      logger.error(`Update review error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Get user reviews
  router.get('/user-reviews/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        logger.warn(`Invalid user ID for reviews: ${userId}`);
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const userReviews = await Review.find({ reviewedUserId: userId })
        .populate('reviewerId', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 })
        .lean();

      if (!userReviews || userReviews.length === 0) {
        logger.info(`No reviews found for user: ${userId}`);
        return res.status(404).json({ message: 'No reviews found for this user' });
      }

      const formattedReviews = userReviews.map(review => ({
        ...review,
        reviewerId: {
          ...review.reviewerId,
          profilePicture: review.reviewerId.profilePicture || 'default-avatar.png',
        },
      }));

      logger.info(`Fetched ${userReviews.length} reviews for user: ${userId}`);
      res.status(200).json(formattedReviews);
    } catch (error) {
      logger.error(`Fetch user reviews error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Get average rating
  router.get('/average-rating/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        logger.warn(`Invalid user ID for average rating: ${userId}`);
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const result = await Review.aggregate([
        { $match: { reviewedUserId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            reviewCount: { $sum: 1 },
          },
        },
      ]);

      const averageRating = result.length > 0 ? result[0].averageRating : 0;
      const reviewCount = result.length > 0 ? result[0].reviewCount : 0;

      logger.info(`Fetched average rating for user: ${userId}`);
      res.status(200).json({
        averageRating: parseFloat(averageRating.toFixed(1)),
        reviewCount,
      });
    } catch (error) {
      logger.error(`Calculate average rating error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Get user by ID
  router.get('/user/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        logger.warn(`Invalid user ID: ${userId}`);
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const user = await User.findById(userId).lean();
      if (!user) {
        logger.error(`User not found: ${userId}`);
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        ...user,
        profilePicture: user.profilePicture || 'default-avatar.png',
      });
    } catch (error) {
      logger.error(`Get user error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Follow a user
  router.post('/follow/:id', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const targetUserId = req.params.id;

      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        logger.warn(`Invalid target user ID for follow: ${targetUserId}`);
        return res.status(400).json({ message: 'Invalid user ID' });
      }
      if (userId === targetUserId) {
        logger.warn(`User ${userId} attempted to follow themselves`);
        return res.status(400).json({ message: "You can't follow yourself" });
      }

      const user = await User.findById(userId);
      const targetUser = await User.findById(targetUserId);

      if (!user || !targetUser) {
        logger.error(`User or target user not found: ${userId}, ${targetUserId}`);
        return res.status(404).json({ message: 'User not found' });
      }

      const isFollowing = user.following.includes(targetUserId);
      if (isFollowing) {
        user.following.pull(targetUserId);
        targetUser.followers.pull(userId);
        logger.info(`User ${userId} unfollowed user ${targetUserId}`);
      } else {
        user.following.push(targetUserId);
        targetUser.followers.push(userId);
        logger.info(`User ${userId} followed user ${targetUserId}`);
      }

      await Promise.all([user.save(), targetUser.save()]);

      res.status(200).json({
        success: true,
        message: isFollowing ? 'User unfollowed successfully' : 'User followed successfully',
        isFollowing: !isFollowing,
      });
    } catch (error) {
      logger.error(`Follow error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Unfollow a user
  router.post('/unfollow/:id', verifyToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const targetUserId = req.params.id;

      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        logger.warn(`Invalid target user ID for unfollow: ${targetUserId}`);
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const user = await User.findById(userId);
      const targetUser = await User.findById(targetUserId);

      if (!user || !targetUser) {
        logger.error(`User or target user not found: ${userId}, ${targetUserId}`);
        return res.status(404).json({ message: 'User not found' });
      }

      user.following = user.following.filter((id) => id.toString() !== targetUserId);
      targetUser.followers = targetUser.followers.filter((id) => id.toString() !== userId);

      await Promise.all([user.save(), targetUser.save()]);

      logger.info(`User ${userId} unfollowed user ${targetUserId}`);
      res.status(200).json({ message: 'User unfollowed successfully' });
    } catch (error) {
      logger.error(`Unfollow error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Get profile
  router.get('/profile/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        logger.warn(`Invalid user ID for profile: ${userId}`);
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const user = await User.findById(userId).lean();
      if (!user) {
        logger.error(`User not found for profile: ${userId}`);
        return res.status(404).json({ message: 'User not found' });
      }

      const productsCount = await Post.countDocuments({ 'createdBy.userId': userId });

      logger.info(`Fetched profile for user: ${userId}`);
      res.json({
        followersCount: user.followers?.length || 0,
        name: `${user.firstName} ${user.lastName}`.trim(),
        profilePicture: user.profilePicture || 'default-avatar.png',
        productsCount,
      });
    } catch (error) {
      logger.error(`Get profile error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Check follow status
  router.get('/api/is-following/:userId', verifyToken, async (req, res) => {
    try {
      const { userId } = req.params;
      const loggedInUserId = req.user.userId;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        logger.warn(`Invalid user ID for follow status: ${userId}`);
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const loggedInUser = await User.findById(loggedInUserId);
      if (!loggedInUser) {
        logger.error(`Logged-in user not found: ${loggedInUserId}`);
        return res.status(404).json({ message: 'User not found' });
      }

      const isFollowing = loggedInUser.following.includes(userId);
      logger.info(`Checked follow status for user ${userId} by ${loggedInUserId}: ${isFollowing}`);
      res.json({ isFollowing });
    } catch (error) {
      logger.error(`Check follow status error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Report a user
  router.post('/users/report', verifyToken, async (req, res) => {
    try {
      const { reportedUserId, reason } = req.body;
      const reporterId = req.user.userId;

      if (!reportedUserId || !reason) {
        logger.warn(`Missing fields in report by user: ${reporterId}`);
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }
      if (!mongoose.Types.ObjectId.isValid(reportedUserId)) {
        logger.warn(`Invalid reported user ID: ${reportedUserId}`);
        return res.status(400).json({ success: false, message: 'Invalid user ID' });
      }
      if (reportedUserId === reporterId) {
        logger.warn(`User ${reporterId} attempted to report themselves`);
        return res.status(400).json({ success: false, message: 'You cannot report yourself' });
      }

      const existingReport = await Report.findOne({ reportedUser: reportedUserId, reportedBy: reporterId });
      if (existingReport) {
        logger.warn(`User ${reporterId} already reported user ${reportedUserId}`);
        return res.status(400).json({ success: false, message: 'You have already reported this user' });
      }

      const report = new Report({
        reportedUser: reportedUserId,
        reportedBy: reporterId,
        reason,
        status: 'pending',
      });

      await Promise.all([
        report.save(),
        User.findByIdAndUpdate(reportedUserId, { $inc: { reportCount: 1 }, $set: { isReported: true } }),
      ]);

      logger.info(`User ${reportedUserId} reported by user ${reporterId}`);
      res.status(201).json({ success: true, message: 'User reported successfully', report });
    } catch (error) {
      logger.error(`Report user error: ${error.message}`);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // Block a user
  router.post('/users/block', verifyToken, async (req, res) => {
    try {
      const { userIdToBlock } = req.body;
      const blockerId = req.user.userId;

      if (!userIdToBlock) {
        logger.warn(`Missing user ID to block by user: ${blockerId}`);
        return res.status(400).json({ success: false, message: 'User ID to block is required' });
      }
      if (!mongoose.Types.ObjectId.isValid(userIdToBlock)) {
        logger.warn(`Invalid user ID to block: ${userIdToBlock}`);
        return res.status(400).json({ success: false, message: 'Invalid user ID' });
      }
      if (userIdToBlock === blockerId) {
        logger.warn(`User ${blockerId} attempted to block themselves`);
        return res.status(400).json({ success: false, message: 'You cannot block yourself' });
      }

      const user = await User.findById(blockerId);
      if (user.blockedUsers.includes(userIdToBlock)) {
        logger.warn(`User ${userIdToBlock} already blocked by user ${blockerId}`);
        return res.status(400).json({ success: false, message: 'User already blocked' });
      }

      user.blockedUsers.push(userIdToBlock);
      await user.save();

      logger.info(`User ${userIdToBlock} blocked by user ${blockerId}`);
      res.status(200).json({ success: true, message: 'User blocked successfully', blockedUsers: user.blockedUsers });
    } catch (error) {
      logger.error(`Block user error: ${error.message}`);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // Logout
  router.post('/logout', (req, res) => {
    logger.info('User logged out');
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  });

  // Get list of users the logged-in user is following
  router.get('/api/is-following-list', verifyToken, async (req, res) => {
    try {
      const loggedInUserId = req.user.userId;
      const user = await User.findById(loggedInUserId).lean();
      if (!user) {
        logger.error(`User not found for following list: ${loggedInUserId}`);
        return res.status(404).json({ message: 'User not found' });
      }

      const followingUsers = await User.find({ _id: { $in: user.following } })
        .select('firstName lastName profilePicture')
        .lean();

      const formattedFollowing = followingUsers.map(u => ({
        ...u,
        profilePicture: u.profilePicture || 'default-avatar.png',
      }));

      logger.info(`Fetched following list for user: ${loggedInUserId}`);
      res.json({ following: formattedFollowing });
    } catch (error) {
      logger.error(`Error fetching following list: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Get user suggestions
  router.get('/api/user-suggestions', verifyToken, async (req, res) => {
    try {
      const loggedInUserId = req.user.userId;
      const limit = parseInt(req.query.limit, 10) || 8;

      const loggedInUser = await User.findById(loggedInUserId).lean();
      if (!loggedInUser) {
        logger.error(`Logged-in user not found: ${loggedInUserId}`);
        return res.status(404).json({ message: 'Logged-in user not found' });
      }

      const excludedUserIds = new Set([
        ...(loggedInUser.following || []),
        loggedInUserId,
      ].map(id => new mongoose.Types.ObjectId(id)));

      const systemUser = await User.findOne({ isSystemUser: true }).lean();
      if (systemUser) {
        excludedUserIds.add(new mongoose.Types.ObjectId(systemUser._id));
      }

      const suggestions = await User.aggregate([
        {
          $match: {
            _id: { $nin: Array.from(excludedUserIds) },
            isBanned: false,
          },
        },
        {
          $addFields: {
            followersCount: { $size: '$followers' },
            name: { $concat: ['$firstName', ' ', '$lastName'] },
            profilePicture: {
              $ifNull: ['$profilePicture', 'default-avatar.png'],
            },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            profilePicture: 1,
            followersCount: 1,
          },
        },
        { $sort: { followersCount: -1 } },
        { $limit: limit },
      ]);

      logger.info(`Fetched ${suggestions.length} user suggestions for user: ${loggedInUserId}`);
      res.status(200).json({ suggestions });
    } catch (error) {
      logger.error(`Error in /api/user-suggestions: ${error.message}`);
      res.status(500).json({ message: 'Failed to fetch user suggestions' });
    }
  });

  // Password reset request
  router.post('/api/password-reset/request', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        logger.warn('Password reset request missing email');
        return res.status(400).json({ message: 'Email is required' });
      }

      const user = await User.findOne({ email });
      if (!user) {
        logger.warn(`Password reset request for non-existent email: ${email}`);
        return res.status(404).json({ message: 'User not found' });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = Date.now() + 3600000; // 1 hour

      user.resetPasswordToken = resetToken;
      user.resetPasswordExpiry = resetTokenExpiry;
      await user.save();

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password.html?token=${resetToken}`;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset - Salmart',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">Password Reset Request</h2>
            <p>Hi ${user.firstName},</p>
            <p>You requested to reset your password. Click the button below to reset it:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">Best regards,<br>Salmart Online Team</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      logger.info(`Password reset link sent to: ${email}`);

      res.status(200).json({
        message: 'Password reset link sent to your email',
        success: true,
      });
    } catch (error) {
      logger.error(`Password reset request error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Password reset
  router.post('/api/password-reset/reset', async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        logger.warn('Password reset attempt missing token or new password');
        return res.status(400).json({ message: 'Token and new password are required' });
      }

      if (newPassword.length < 8) {
        logger.warn('Password reset attempt with password less than 8 characters');
        return res.status(400).json({ message: 'Password must be at least 8 characters long' });
      }

      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpiry: { $gt: Date.now() },
      });

      if (!user) {
        logger.warn('Invalid or expired reset token');
        return res.status(400).json({ message: 'Invalid or expired reset token' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      user.password = hashedPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpiry = undefined;
      await user.save();

      logger.info(`Password reset successful for user: ${user._id}`);
      res.status(200).json({
        message: 'Password reset successful',
        success: true,
      });
    } catch (error) {
      logger.error(`Password reset error: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Generic upload route (for testing or other image uploads)
  router.post('/upload', verifyToken, upload.single('image'), async (req, res) => {
    let tempFiles = [];
    try {
      if (!req.file) {
        logger.warn(`No file uploaded by user: ${req.user.userId}`);
        return res.status(400).json({ message: 'No file uploaded' });
      }

      let imageUrl;
      if (isProduction) {
        imageUrl = req.file.path;
      } else {
        imageUrl = await uploadToCloudinary(req.file.path);
        tempFiles.push(req.file.path);
      }

      logger.info(`Image uploaded by user ${req.user.userId}: ${imageUrl}`);
      res.json({ imageUrl });
    } catch (error) {
      logger.error(`Upload error for user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    } finally {
      cleanupFiles(tempFiles);
    }
  });

  return router;
};