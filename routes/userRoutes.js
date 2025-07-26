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
const Report = require('../models/reportSchema.js'); // Added import
const verifyToken = require('../middleware/auths');
const fs = require('fs');
const Message = require('../models/messageSchema.js');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

require('dotenv').config();

// Configure nodemailer (add this near the top of your file after other requires)
const transporter = nodemailer.createTransport({
  service: 'Zoho', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Set up storage dynamically
const uploadDir = path.join(__dirname, 'Uploads');
let storage;
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
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
    // Destructure all necessary fields from req.body
    let { firstName, lastName, email, password, accountNumber, bankCode, accountName } = req.body;
    
    // Trim and lowercase email
    email = email.trim().toLowerCase();
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create a new User instance
    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      // Populate bankDetails with all received information
      bankDetails: { 
        accountNumber, 
        bankCode,    // Add bankCode here
        accountName  // Add accountName here
      },
    });
    
    // Save the new user to the database
    await newUser.save();
    
    console.log('New user registered:', newUser);
    // You might want to return a token or user ID here for immediate login on the frontend
    res.status(201).json({ 
        message: 'User created successfully',
        // Optional: include user ID or a token for immediate login
        userId: newUser._id 
    });

  } catch (error) {
    console.error('Register error:', error.message);
    // Check for specific Mongoose validation errors if needed for more detailed feedback
    res.status(500).json({ message: 'Server error' });
  }
});


// Login
router.post('/login', async (req, res) => {
  console.log('Login attempt:', req.body);
  try {
    let { email, password } = req.body;
    email = email.trim().toLowerCase();
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
    const user = await User.findById(loggedInUserId)
      .populate('following', '_id name avatar') // Add more fields as needed
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Ensure valid user objects are returned
    const following = (user.following || []).filter(u => u && u._id);

    res.json({ following });
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




// Password reset request
router.post('/api/password-reset/request', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // Save token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiry = resetTokenExpiry;
    await user.save();

    // Send email
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
      `
    };

    await transporter.sendMail(mailOptions);
    
    res.status(200).json({ 
      message: 'Password reset link sent to your email',
      success: true 
    });

  } catch (error) {
    console.error('Password reset request error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Password reset
router.post('/api/password-reset/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();

    res.status(200).json({ 
      message: 'Password reset successful',
      success: true 
    });

  } catch (error) {
    console.error('Password reset error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Enhanced Upload Route for View-Once Images with Multiple Upload Support
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { senderId, receiverId, messageType, tempId, viewOnce } = req.body;

    // Validate required fields
    if (!senderId || !receiverId || !tempId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        received: { senderId, receiverId, tempId, messageType }
      });
    }

    // Additional file validation
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' 
      });
    }

    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (req.file.size > maxSize) {
      return res.status(400).json({ 
        error: 'File too large. Maximum size is 5MB.' 
      });
    }

    let imageUrl, publicId = null;

    if (isProduction) {
      // Cloudinary upload
      imageUrl = req.file.path;
      publicId = req.file.filename; // Cloudinary public_id for cleanup
    } else {
      // Local upload - ensure the URL is properly formatted
      imageUrl = `/Uploads/${req.file.filename}`;
    }

    // Parse and enhance viewOnce configuration
    let parsedViewOnce = null;
    if (viewOnce) {
      try {
        parsedViewOnce = typeof viewOnce === 'string' ? JSON.parse(viewOnce) : viewOnce;
        
        // Ensure all required viewOnce properties are present
        parsedViewOnce = {
          enabled: parsedViewOnce.enabled !== undefined ? parsedViewOnce.enabled : true,
          viewed: parsedViewOnce.viewed !== undefined ? parsedViewOnce.viewed : false,
          allowDownload: parsedViewOnce.allowDownload !== undefined ? parsedViewOnce.allowDownload : false,
          deleteAt: parsedViewOnce.deleteAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          viewedAt: null, // Will be set when image is viewed
          viewedBy: null  // Will be set when image is viewed
        };
      } catch (e) {
        console.warn('Failed to parse viewOnce, using defaults:', e.message);
        parsedViewOnce = { 
          enabled: true, 
          viewed: false, 
          allowDownload: false,
          deleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          viewedAt: null,
          viewedBy: null
        };
      }
    }

    // Generate a more descriptive filename for download
    const originalName = req.file.originalname;
    const fileExtension = originalName.split('.').pop();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const downloadFilename = `image_${timestamp}.${fileExtension}`;

    // Log successful upload for debugging
    console.log(`Image uploaded successfully:`, {
      tempId,
      imageUrl,
      publicId,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      viewOnce: parsedViewOnce
    });

    res.json({ 
      success: true,
      imageUrl,
      publicId,
      tempId,
      viewOnce: parsedViewOnce,
      messageType: messageType || 'image',
      fileInfo: {
        originalName: originalName,
        downloadFilename: downloadFilename,
        size: req.file.size,
        mimeType: req.file.mimetype
      },
      uploadedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Image upload error:', error);
    
    // More detailed error response
    res.status(500).json({ 
      error: 'Server error during image upload',
      message: error.message,
      tempId: req.body?.tempId || null // Include tempId for frontend error handling
    });
  }
});

// Optional: Add a route to handle image view confirmation and download enabling
router.post('/image-viewed', async (req, res) => {
  try {
    const { messageId, viewerId } = req.body;
    
    if (!messageId || !viewerId) {
      return res.status(400).json({ error: 'Missing messageId or viewerId' });
    }

    // Here you would typically:
    // 1. Find the message in your database
    // 2. Update the viewOnce.viewed = true
    // 3. Set viewOnce.allowDownload = true
    // 4. Set viewOnce.viewedAt = new Date()
    // 5. Set viewOnce.viewedBy = viewerId
    
    // Example database update (adjust according to your schema):
    /*
    const message = await Message.findByIdAndUpdate(
      messageId, 
      {
        'viewOnce.viewed': true,
        'viewOnce.allowDownload': true,
        'viewOnce.viewedAt': new Date(),
        'viewOnce.viewedBy': viewerId
      },
      { new: true }
    );
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    */

    res.json({ 
      success: true,
      messageId,
      viewerId,
      allowDownload: true,
      viewedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Image view confirmation error:', error);
    res.status(500).json({ 
      error: 'Server error confirming image view',
      message: error.message 
    });
  }
});

// Optional: Add a route for secure image download with view verification
router.get('/download-image/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id; // Assuming you have auth middleware
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Here you would:
    // 1. Find the message
    // 2. Verify the user has permission to download (viewed the image)
    // 3. Check if download is still allowed (within time limits)
    // 4. Serve the file or redirect to the image URL
    
    // Example:
    /*
    const message = await Message.findById(messageId);
    
    if (!message || !message.viewOnce.allowDownload) {
      return res.status(403).json({ error: 'Download not permitted' });
    }
    
    if (message.senderId !== userId && message.receiverId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // For Cloudinary images, you might redirect:
    if (message.attachment.cloudinaryPublicId) {
      return res.redirect(message.attachment.url);
    }
    
    // For local files, serve the file:
    const filePath = path.join(__dirname, '../uploads', message.attachment.filename);
    res.download(filePath, message.attachment.downloadFilename || 'image.jpg');
    */

    res.json({ 
      success: true, 
      message: 'Download endpoint - implement based on your needs' 
    });

  } catch (error) {
    console.error('Image download error:', error);
    res.status(500).json({ 
      error: 'Server error during download',
      message: error.message 
    });
  }
});
  return router;
};
