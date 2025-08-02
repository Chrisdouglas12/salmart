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

// Generate verification token
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

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
     

const crypto = require('crypto');

// Register a user
router.post('/register', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      state,
      city,
      accountNumber,
      bankCode,
      accountName,
      bankName
    } = req.body;

    // --- Input Validation ---
    if (!email || !password || !phoneNumber || !state || !city) {
      return res.status(400).json({ message: 'All required fields must be provided.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // --- Check for existing user ---
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    // --- Account Creation ---
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const newUser = new User({
      firstName: firstName?.trim(),
      lastName: lastName?.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phoneNumber: phoneNumber?.trim(),
      state: state?.trim(),
      city: city?.trim(),
      isVerified: false,
      verificationToken,
      bankDetails: {
        accountNumber,
        bankCode,
        accountName,
        bankName,
      }
    });

    await newUser.save();

    const verifyUrl = `https://salmartonline.com.ng/verify-email.html?token=${verificationToken}`;

    // --- Email Sending Logic ---
    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Welcome to Salmart</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          
          /* Reset and base styles */
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
          
          /* Responsive */
          @media only screen and (max-width: 600px) {
            .container { width: 100% !important; padding: 10px !important; }
            .content { padding: 20px !important; }
            .button { font-size: 16px !important; padding: 14px 28px !important; }
            .header-icon { font-size: 32px !important; }
            .brand-name { font-size: 20px !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 20px 0; background-color: #f8f9fa; color: #333;">
        
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              
              <table class="container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 8px 32px rgba(40, 167, 69, 0.12); overflow: hidden; border: 1px solid rgba(40, 167, 69, 0.1);">
                
                <tr>
                  <td style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 0; position: relative;">
                    <div style="height: 4px; background: linear-gradient(90deg, #28a745, #20c997, #28a745);"></div>
                    
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding: 40px 30px; position: relative;">
                         
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" style="position: relative; z-index: 1;">
                               
                                
                                <h1 class="brand-name" style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Salmart</h1>
                                <p style="color: rgba(255, 255, 255, 0.9); font-size: 14px; margin: 8px 0 0 0; font-weight: 500;">Your Online Social Marketplace</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <tr>
                  <td class="content" style="padding: 48px 40px;">
                    
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td>
                          <div style="text-align: center; margin-bottom: 32px;">
                            <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #28a745, #20c997); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; position: relative;">
                              <span style="font-size: 40px; color: #ffffff;">✓</span>
                              <div style="position: absolute; width: 100px; height: 100px; border: 2px solid rgba(40, 167, 69, 0.2); border-radius: 50%; top: -10px; left: -10px;"></div>
                            </div>
                          </div>
                          
                          <h2 style="color: #2c3e50; font-size: 28px; font-weight: 600; text-align: center; margin: 0 0 16px 0; line-height: 1.3; letter-spacing: -0.5px;">
                            Welcome to Salmart, ${newUser.firstName}! 🎉
                          </h2>
                          
                          <p style="color: #6c757d; font-size: 16px; line-height: 1.6; text-align: center; margin: 0 0 32px 0;">
                            Thank you for joining our community! We're excited to have you as part of the Salmart family. 
                            To get started and secure your account, please verify your email address.
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding: 0 0 32px 0;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" style="border-radius: 12px; background: linear-gradient(135deg, #28a745, #20c997); box-shadow: 0 4px 16px rgba(40, 167, 69, 0.3);">
                                <a href="${verifyUrl}" class="button" style="display: inline-block; color: #ffffff; font-size: 18px; font-weight: 600; text-decoration: none; padding: 16px 32px; border-radius: 12px; letter-spacing: 0.5px; transition: all 0.3s ease;">
                                  ✉️ Verify My Email Address
                                </a>
                              </td>
                            </tr>
                          </table>
                          
                          <p style="margin: 20px 0 0 0; font-size: 14px; color: #9ca3af; text-align: center;">
                            Or copy and paste this link in your browser:<br>
                            <a href="${verifyUrl}" style="color: #28a745; text-decoration: none; word-break: break-all; font-size: 13px;">${verifyUrl}</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>

                <!-- First Box -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  <tr>
    <td style="background-color: rgba(40, 167, 69, 0.05); border: 1px solid rgba(40, 167, 69, 0.15); border-radius: 12px; padding: 24px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td>
            <h3 style="color: #28a745; font-size: 16px; font-weight: 600; margin: 0 0 12px 0; display: flex; align-items: center;">
              🔒 What happens next?
            </h3>
            <ul style="color: #6c757d; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">Click the verification button above</li>
              <li style="margin-bottom: 8px;">Your account will be activated instantly</li>
              <li style="margin-bottom: 8px;">Start exploring thousands of products</li>
              <li>Enjoy secure shopping with trusted sellers</li>
            </ul>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Spacer Row (Acts like vertical space between blocks) -->
<table role="presentation" width="100%">
  <tr>
    <td height="24" style="line-height: 24px;">&nbsp;</td>
  </tr>
</table>

<!-- Second Box -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  <tr>
    <td style="background-color: #f8f9fa; border-left: 4px solid #28a745; padding: 20px; border-radius: 8px; padding-top: 10px;">
      <p style="color: #495057; font-size: 14px; margin: 0; line-height: 1.5;">
        <strong style="color: #28a745;">🛡️ Security Notice:</strong><br>
        This verification link will expire in <strong>24 hours</strong> for your security. 
        If you didn't create this account, please ignore this email.
      </p>
    </td>
  </tr>
</table>
                <tr>
                  <td style="background-color: #f8f9fa; padding: 32px 40px; border-top: 1px solid #e9ecef;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td align="center">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 20px 0;">
                            <tr>
                              <td style="padding: 0 10px;">
                                <a href="#" style="color: #28a745; text-decoration: none; font-size: 24px;">📱</a>
                              </td>
                              <td style="padding: 0 10px;">
                                <a href="#" style="color: #28a745; text-decoration: none; font-size: 24px;">📧</a>
                              </td>
                              <td style="padding: 0 10px;">
                                <a href="#" style="color: #28a745; text-decoration: none; font-size: 24px;">🌐</a>
                              </td>
                            </tr>
                          </table>
                          
                          <p style="color: #6c757d; font-size: 14px; margin: 0 0 16px 0; text-align: center;">
                            Need help? Contact our support team at 
                            <a href="mailto:support@salmart.com" style="color: #28a745; text-decoration: none;">support@salmartonline.com.ng</a>
                          </p>
                          
                          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0; line-height: 1.5;">
                            © ${new Date().getFullYear()} Salmart. All rights reserved.<br>
                            Nigeria's first social E-commerce Marketplace<br>
                            <a href="https://salmartonline.com.ng/Privacy.html" style="color: #9ca3af; text-decoration: none;">Privacy Policy</a> | 
                            <a href="https://salmartonline.com.ng/Community.html" style="color: #9ca3af; text-decoration: none;">Terms of Service</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
              </table>
              
            </td>
          </tr>
        </table>
        
      </body>
      </html>
    `;

    const emailOptions = {
      from: `"Salmart Team" <${process.env.EMAIL_USER}>`,
      to: newUser.email,
      subject: '🎉 Welcome to Salmart - Verify Your Account',
      html: emailHtml,
      // More reliable email headers for deliverability
      headers: {
        'X-Priority': '1', 
        'Importance': 'high',
      },
      text: `
        Welcome to Salmart, ${newUser.firstName}!
        
        Thank you for joining our community! To activate your account and start shopping, please verify your email address by clicking the link below:
        
        ${verifyUrl}
        
        This link will expire in 24 hours for security reasons.
        
        If you didn't create this account, please ignore this email.
        
        Best regards,
        The Salmart Team
        
        Need help? Contact us at support@salmart.com
        © ${new Date().getFullYear()} Salmart. All rights reserved.
      `.trim()
    };
    
    console.log('Sending verification email to:', newUser.email);
    
    transporter.sendMail(emailOptions, (emailError, emailResult) => {
      if (emailError) {
        console.error('Failed to send verification email:', emailError);
      } else {
        console.log('Verification email sent successfully:', {
          messageId: emailResult.messageId,
          response: emailResult.response,
          to: newUser.email
        });
      }
    });

    res.status(201).json({
      message: 'Registration successful! A verification email has been sent to your inbox. Please check your email (including spam folder) to activate your account.',
      userId: newUser._id,
      email: newUser.email,
      verificationSent: true
    });

  } catch (error) {
    console.error('Registration error:', {
      message: error.message,
      stack: error.stack,
    });
    
    if (error.code === 11000) {
      res.status(400).json({ message: 'An account with this email already exists.' });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ message: 'Invalid data provided. Please check your information.' });
    } else {
      res.status(500).json({ message: 'Registration failed. Please try again later.' });
    }
  }
});

// Verify email router
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token missing' });
    }

    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(404).json({ error: 'Invalid or expired verification token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.status(200).json({ message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    console.error('Email verification error:', err);
    res.status(500).json({ error: 'Server error' });
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

 if (!user.isVerified) {
  return res.status(403).json({ message: 'Email not verified. Please check your email inbox.' });  
     }

    if (user.isBanned) {
      return res.status(403).json({ message: 'Your account has been suspended. Please contact our support team.' });
    }

    const isPassword = await bcrypt.compare(password, user.password);
    if (!isPassword) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

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


router.get('/users-profile/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.params.id;
    console.log(`Fetching profile for userId: ${userId}`);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ✅ Remove duplicates from followers and following
    const uniqueFollowers = [...new Set(user.followers.map(f => f.toString()))];
    const uniqueFollowing = [...new Set(user.following.map(f => f.toString()))];

    res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      email: user.email,
      followers: uniqueFollowers,         // Cleaned array
      following: uniqueFollowing,         // Cleaned array
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
    res.json({ profilePicture: user.profilePicture || 'default-avater.png' });
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

    // Count only products created by user that are NOT sold
    const productsCount = await Post.countDocuments({
      'createdBy.userId': req.params.userId,
      isSold: false,
    });

    // ✅ Ensure unique follower count
    const uniqueFollowers = new Set(user.followers.map(f => f.toString()));
    const followersCount = uniqueFollowers.size;

    res.json({
      followersCount,
      name: `${user.firstName} ${user.lastName}`.trim(),
      profilePicture: user.profilePicture,
      productsCount,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/api/is-following/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const loggedInUserId = req.user.userId;

    const loggedInUser = await User.findById(loggedInUserId);
    if (!loggedInUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // remove duplicates from following list
    loggedInUser.following = [...new Set(loggedInUser.following.map(f => f.toString()))];

    // check if user is following the target user
    const isFollowing = loggedInUser.following.includes(userId.toString());

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

// New endpoint to fetch combined user data
router.get('/api/user-data', verifyToken, async (req, res) => {
  try {
    const loggedInUserId = req.user.userId; // `req.user.userId` should be set by your `verifyToken` middleware

    // Fetch the user, populating both 'following' and 'interests'
    const user = await User.findById(loggedInUserId)
      .populate('following', '_id name avatar') // Populate 'following' with specific fields
      .lean(); // Use .lean() for faster queries if you don't need Mongoose document methods

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prepare the following list: filter out any nulls/undefineds if they exist due to old/deleted users
    // Ensure that each item in 'following' array is an object with an '_id'
    const followingList = (user.following || []).filter(u => u && u._id);

    // Prepare the interests list: ensure it's an array
    const userInterests = Array.isArray(user.interests) ? user.interests : [];

    // Send back the user object containing 'following' and 'interests'
    res.json({
      user: {
        _id: user._id, // Include user ID
        name: user.name, // Include user name (or other relevant top-level user data)
        email: user.email, // Example, add other fields as needed by your frontend
        avatar: user.avatar,
        following: followingList, // Array of populated user objects
        interests: userInterests, // Array of strings
        // Add any other user properties your frontend expects here
      }
    });

  } catch (error) {
    console.error('Error fetching user data:', error.message);
    res.status(500).json({ message: 'Server error while fetching user data' });
  }
});


router.get('/api/is-following-list', verifyToken, async (req, res) => {
  try {
    const loggedInUserId = req.user.userId;
    const user = await User.findById(loggedInUserId)
      .populate('following', '_id name avatar')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

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
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/password-reset.html?token=${resetToken}`;
    
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




router.get('/states-lgas', (req, res) => {
  console.log('States API hit!');
  try {
    const filePath = path.join(__dirname, '..', 'nigerian-states.json'); // go up one level
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    res.status(200).json(parsed);
  } catch (error) {
    console.error('Failed to load states and LGAs:', error);
    res.status(500).json({ message: 'Error loading data' });
  }
});



// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found with this email address' });
    }

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate new verification token if needed
    if (!user.verificationToken) {
      user.verificationToken = crypto.randomBytes(32).toString('hex');
      await user.save();
    }

    // Create verification URL
    const verifyUrl = `https://salmartonline.com.ng/verify-email.html?token=${user.verificationToken}`;

    // Send verification email
    await transporter.sendMail({
      from: `"Salmart" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Verify your email address - Resent',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa; padding: 20px;">
          <div style="background-color: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #28a745; margin-bottom: 10px; font-size: 28px;">📧 Email Verification</h1>
              <p style="color: #6c757d; font-size: 16px;">Salmart Account Verification</p>
            </div>
            
            <div style="text-align: center; margin-bottom: 30px;">
              <h2 style="color: #333; margin-bottom: 15px;">Hello ${user.firstName}!</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                You requested a new verification link. Click the button below to verify your email address and activate your Salmart account:
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="display: inline-block; padding: 15px 30px; background-color: #28a745; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);">
                ✅ Verify Email Address
              </a>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #28a745; margin: 20px 0;">
              <p style="color: #495057; font-size: 14px; margin: 0;">
                <strong>🔒 Security Note:</strong> This verification link will expire in 24 hours for your security.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
              <p style="color: #6c757d; font-size: 14px; margin-bottom: 10px;">
                If the button doesn't work, copy and paste this link in your browser:
              </p>
              <p style="color: #28a745; font-size: 12px; word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${verifyUrl}
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #868e96; font-size: 12px;">
                If you didn't request this verification email, please ignore this message.
                <br>
                This email was sent from Salmart - Your trusted online marketplace.
              </p>
            </div>
          </div>
        </div>
      `
    });

    res.status(200).json({ 
      message: 'Verification email sent successfully',
      success: true 
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ 
      message: 'Failed to send verification email. Please try again later.',
      error: error.message 
    });
  }
});


module.exports = router;
  return router;
};
