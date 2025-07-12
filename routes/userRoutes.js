const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/userSchema.js');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Post = require('../models/postSchema.js');
const Review = require('../models/reviewSchema.js');
const Report = require('../models/reportSchema.js'); // Added import
const verifyToken = require('../middleware/auths');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

require('dotenv').config();

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

// Upload Route
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = isProduction ? req.file.path : `/Uploads/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});
module.exports = (io) => {
// Register a user
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, accountNumber,} = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      bankDetails: { accountNumber },
    });
    await newUser.save();
    console.log('New user registered:', newUser);
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  console.log('Login attempt:', req.body);
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }
    if (user.isBanned) {
      return res.status(403).json({ message: 'Account is banned' });
    }
    const isPassword = await bcrypt.compare(password, user.password);
    if (!isPassword) {
      return res.status(400).json({ message: 'Invalid password' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1w' });
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        bio: user.bio,
        userId: user._id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify token
router.get('/verify-token', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      followers: user.followers || 0,
      following: user.following || 0,
      products: user.products || [],
      profilePicture: user.profilePicture || 'default-avatar.png',
    });
  } catch (error) {
    console.error('Verify token error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user
router.patch('/users/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedUser = await User.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile
router.get('/users-profile/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.params.id;
    console.log(`Fetching profile for userId: ${userId}`);
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      email: user.email,
      followers: user.followers || 0,
      following: user.following || 0,
      products: user.products || [],
      profilePicture: user.profilePicture || 'default-avatar.png',
    });
  } catch (error) {
    console.error('Get user profile error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Profile picture upload
router.post('/upload-profile-picture', verifyToken, upload.single('profilePicture'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Profile picture is required' });
    }
    let profilePictureUrl;
    if (!isProduction) {
      profilePictureUrl = `${req.protocol}://${req.get('host')}/Uploads/${req.file.filename}`;
    } else {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'profile_pictures',
        use_filename: true,
        unique_filename: false,
      });
      profilePictureUrl = result.secure_url;
    }
    user.profilePicture = profilePictureUrl;
    await user.save();
    res.json({ profilePicture: profilePictureUrl });
  } catch (error) {
    console.error('Profile picture upload error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get profile picture
router.get('/profile-picture', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ profilePicture: user.profilePicture || 'default-avatar.png' });
  } catch (error) {
    console.error('Get profile picture error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit review
router.post('/submit-review', verifyToken, async (req, res) => {
  try {
    const { reviewedUserId, rating, review } = req.body;
    const reviewerId = req.user.userId;
    if (!reviewedUserId || !rating || !review) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (!mongoose.Types.ObjectId.isValid(reviewedUserId)) {
      return res.status(400).json({ message: 'Invalid reviewed user ID' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }
    if (reviewerId === reviewedUserId) {
      return res.status(400).json({ message: 'You cannot review yourself' });
    }
    const existingReview = await Review.findOne({ reviewerId, reviewedUserId });
    if (existingReview) {
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
    const populatedReview = await Review.findById(newReview._id).populate('reviewerId', 'firstName lastName profilePicture');
    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      review: populatedReview,
    });
  } catch (error) {
    console.error('Submit review error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update review
router.patch('/update-review', verifyToken, async (req, res) => {
  try {
    const { reviewedUserId, rating, review } = req.body;
    const reviewerId = req.user.userId;
    if (!reviewedUserId || !rating || !review) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (!mongoose.Types.ObjectId.isValid(reviewedUserId)) {
      return res.status(400).json({ message: 'Invalid reviewed user ID' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }
    if (reviewerId === reviewedUserId) {
      return res.status(400).json({ message: 'You cannot review yourself' });
    }
    const existingReview = await Review.findOne({ reviewerId, reviewedUserId });
    if (!existingReview) {
      return res.status(404).json({ message: 'No review found to update' });
    }
    existingReview.rating = rating;
    existingReview.review = review;
    existingReview.createdAt = new Date();
    await existingReview.save();
    const populatedReview = await Review.findById(existingReview._id).populate('reviewerId', 'firstName lastName profilePicture');
    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      review: populatedReview,
    });
  } catch (error) {
    console.error('Update review error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user reviews
router.get('/user-reviews/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userReviews = await Review.find({ reviewedUserId: userId })
      .populate('reviewerId', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 });
    if (!userReviews || userReviews.length === 0) {
      return res.status(404).json({ message: 'No reviews found for this user' });
    }
    res.status(200).json(userReviews);
  } catch (error) {
    console.error('Fetch user reviews error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get average rating
router.get('/average-rating/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
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
    res.status(200).json({
      averageRating: parseFloat(averageRating.toFixed(1)),
      reviewCount,
    });
  } catch (error) {
    console.error('Calculate average rating error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user by ID
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Follow a user
router.post('/follow/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const targetUserId = req.params.id;
    if (!userId || !targetUserId) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    if (userId === targetUserId) {
      return res.status(400).json({ message: "You can't follow yourself" });
    }
    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);
    if (!user || !targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isFollowing = user.following.includes(targetUserId);
    if (isFollowing) {
      user.following.pull(targetUserId);
      targetUser.followers.pull(userId);
    } else {
      user.following.push(targetUserId);
      targetUser.followers.push(userId);
    }
    await user.save();
    await targetUser.save();
    res.status(200).json({
      success: true,
      message: isFollowing ? 'User unfollowed successfully' : 'User followed successfully',
      isFollowing: !isFollowing,
    });
  } catch (error) {
    console.error('Follow error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unfollow a user
router.post('/unfollow/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const targetUserId = req.params.id;
    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);
    if (!user || !targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    user.following = user.following.filter((id) => id.toString() !== targetUserId);
    targetUser.followers = targetUser.followers.filter((id) => id.toString() !== userId);
    await user.save();
    await targetUser.save();
    res.status(200).json({ message: 'User unfollowed successfully' });
  } catch (error) {
    console.error('Unfollow error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('followers');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // --- Correct way to get products count ---
    const productsCount = await Post.countDocuments({ createdBy: req.params.userId });
    // Assuming your Post/Product model has an 'owner' field that references the User ID

    res.json({
      followersCount: user.followers?.length || 0,
      name: `${user.firstName} ${user.lastName}`.trim(), // Combine first and last name for 'name'
      profilePicture: user.profilePicture,
      productsCount: productsCount, // Use the correctly fetched count
    });
  } catch (error) {
    console.error('Get profile error:', error.message);
    // It's good practice to log the full error for debugging
    console.error(error); // Log the full error object
    res.status(500).json({ message: 'Server error' });
  }
});


// Check follow status
router.get('/api/is-following/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const loggedInUserId = req.user.userId;
    const loggedInUser = await User.findById(loggedInUserId);
    if (!loggedInUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isFollowing = loggedInUser.following.includes(userId);
    res.json({ isFollowing });
  } catch (error) {
    console.error('Check follow status error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Report a user
router.post('/users/report', verifyToken, async (req, res) => {
  try {
    const { reportedUserId, reason } = req.body;
    const reporterId = req.user.userId;
    if (!reportedUserId || !reason) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (reportedUserId === reporterId) {
      return res.status(400).json({ success: false, message: 'You cannot report yourself' });
    }
    const existingReport = await Report.findOne({ reportedUser: reportedUserId, reportedBy: reporterId });
    if (existingReport) {
      return res.status(400).json({ success: false, message: 'You have already reported this user' });
    }
    const report = new Report({
      reportedUser: reportedUserId,
      reportedBy: reporterId,
      reason,
      status: 'pending',
    });
    await Promise.all([report.save(), User.findByIdAndUpdate(reportedUserId, { $inc: { reportCount: 1 }, $set: { isReported: true } })]);
    res.status(201).json({ success: true, message: 'User reported successfully', report });
  } catch (error) {
    console.error('Report user error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Block a user
router.post('/users/block', verifyToken, async (req, res) => {
  try {
    const { userIdToBlock } = req.body;
    const blockerId = req.user.userId;
    if (!userIdToBlock) {
      return res.status(400).json({ success: false, message: 'User ID to block is required' });
    }
    if (userIdToBlock === blockerId) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }
    const user = await User.findById(blockerId);
    if (user.blockedUsers.includes(userIdToBlock)) {
      return res.status(400).json({ success: false, message: 'User already blocked' });
    }
    user.blockedUsers.push(userIdToBlock);
    await user.save();
    res.status(200).json({ success: true, message: 'User blocked successfully', blockedUsers: user.blockedUsers });
  } catch (error) {
    console.error('Block user error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// Get list of users the logged-in user is following
router.get('/api/is-following-list', verifyToken, async (req, res) => {
  try {
    const loggedInUserId = req.user.userId;
    const user = await User.findById(loggedInUserId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Return the array of user IDs that the logged-in user is following
    res.json({ following: user.following || [] });
  } catch (error) {
    console.error('Error fetching following list:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/api/user-suggestions', verifyToken, async (req, res) => {
  try {
    const loggedInUserId = req.user.userId;
    const limit = parseInt(req.query.limit, 10) || 8;

    const loggedInUser = await User.findById(loggedInUserId).lean();
    if (!loggedInUser) {
      return res.status(404).json({ message: 'Logged-in user not found' });
    }

    // Exclude logged-in user + following + system user
    const excludedUserIds = new Set([
      ...(loggedInUser.following || []),
      loggedInUserId
    ].map(id => new mongoose.Types.ObjectId(id)));

    // Find the system user and exclude them
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
          followersCount: { $size: "$followers" },
          name: { $concat: ["$firstName", " ", "$lastName"] },
          profilePicture: {
            $ifNull: ["$profilePicture", "/salmart-192x192.png"],
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

    return res.status(200).json({ suggestions });
  } catch (error) {
    console.error('Error in /api/user-suggestions:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ message: 'Failed to fetch user suggestions' });
  }
});

  return router;
};
