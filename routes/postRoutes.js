const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken'); // Required for token verification in some endpoints
const Post = require('../models/postSchema.js');
const User = require('../models/userSchema.js');
const Report = require('../models/reportSchema.js');
const Notification = require('../models/notificationSchema.js');

const verifyToken = require('../middleware/auths.js');
const NotificationService = require('../services/notificationService.js');
const { sendFCMNotification } = require('../services/notificationUtils.js');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const winston = require('winston');
const admin = require('firebase-admin')

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/postRoutes.log' }),
    new winston.transports.Console()
  ]
});

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Set up storage dynamically
const isProduction = process.env.NODE_ENV === 'production';
let storage;
if (isProduction) {
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'Uploads',
      allowed_formats: ['jpg', 'png', 'jpeg']
    }
  });
} else {
  const uploadDir = path.join(__dirname, 'Uploads/');
  if (!require('fs').existsSync(uploadDir)) require('fs').mkdirSync(uploadDir, { recursive: true });
  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      const fileExt = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${fileExt}`);
    }
  });
}
const upload = multer({ storage });


// Upload Route
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    logger.warn('No file uploaded in /upload');
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const imageUrl = isProduction ? req.file.path : `${req.protocol}://${req.get('host')}/Uploads/${req.file.filename}`;
  logger.info(`File uploaded: ${imageUrl}`);
  res.json({ imageUrl });
});

module.exports = (io) => {

router.post(
  '/post',
  verifyToken,
  upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'video', maxCount: 1 }]),
  async (req, res) => {
    try {
      const { description, productCondition, location, category, price, postType = 'regular' } = req.body;
      const userId = req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User ${userId} not found`);
        return res.status(404).json({ message: 'User not found' });
      }

      if (postType === 'video_ad') {
        if (!description || !category || !req.files.video) {
          logger.warn(`Missing fields in video ad creation by user ${userId}`);
          return res.status(400).json({ message: 'Description, category and video are required for video ads' });
        }
      } else {
        if (!description || !productCondition || !price || !location || !category || !req.files.photo) {
          logger.warn(`Missing fields in regular post creation by user ${userId}`);
          return res.status(400).json({ message: 'All fields are required for regular posts' });
        }
      }

      const photoUrl = req.files.photo
        ? isProduction
          ? req.files.photo[0].path
          : `${req.protocol}://${req.get('host')}/Uploads/${req.files.photo[0].filename}`
        : null;

      const videoUrl = req.files.video
        ? isProduction
          ? req.files.video[0].path
          : `${req.protocol}://${req.get('host')}/Uploads/${req.files.video[0].filename}`
        : null;

      const newPost = new Post({
        postType,
        description,
        category,
        profilePicture: user.profilePicture,
        createdBy: {
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
        },
        createdAt: Date.now(),
        likes: [],
      });

      if (postType === 'video_ad') {
        newPost.video = videoUrl;
      } else {
        newPost.photo = photoUrl;
        newPost.location = location;
        newPost.productCondition = productCondition;
        newPost.price = Number(price);
      }

      await newPost.save();
      logger.info(`Post created by user ${userId}: ${newPost._id}`);

      // Notify followers
      const followers = await Follow.find({ following: userId }).distinct('follower');
      for (const followerId of followers) {
        if (followerId.toString() !== userId.toString()) {
          const notification = new Notification({
            userId: followerId,
            type: 'new_post',
            senderId: userId,
            postId: newPost._id,
            message: `${user.firstName} ${user.lastName} created a new post`,
            createdAt: new Date(),
          });
          await notification.save();
          await sendFCMNotification(
            followerId,
            'New Post',
            `${user.firstName} ${user.lastName} created a new post`,
            { type: 'new_post', postId: newPost._id.toString() },
            req.io
          );
          await NotificationService.triggerCountUpdate(followerId, req.io);
        }
      }

      res.status(201).json({ message: 'Post created successfully', post: newPost });
    } catch (error) {
      logger.error(`Post creation error for user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  }
);
// Get Single Post
router.get('/post/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      logger.warn(`Invalid post ID: ${postId}`);
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(postId).populate('createdBy.userId', 'firstName lastName profilePicture');
    if (!post) {
      logger.error(`Post not found: ${postId}`);
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    let loggedInUserId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        loggedInUserId = decoded.userId;
      } catch (err) {
        logger.warn(`Invalid token in get post: ${err.message}`);
      }
    }

    const postData = {
      ...post.toObject(),
      createdBy: {
        userId: post.createdBy.userId._id,
        name: `${post.createdBy.userId.firstName} ${post.createdBy.userId.lastName}`,
        profilePicture: post.createdBy.userId.profilePicture || 'default-avatar.png'
      },
      likes: post.likes || [],
      comments: post.comments || [],
      isLiked: loggedInUserId ? post.likes.includes(loggedInUserId) : false
    };

    delete postData.createdBy.userId._id;
    res.status(200).json(postData);
  } catch (error) {
    logger.error(`Error fetching post ${req.params.postId}: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get Posts
router.get('/post', async (req, res) => {
  try {
    let loggedInUserId = null;
    const { category } = req.query;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      loggedInUserId = decoded.userId;
    }

    const query = {};
    if (category && ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others'].includes(category)) {
      query.category = category;
    }

    const posts = await Post.find(query).sort({ createdAt: -1 });
    if (!posts || posts.length === 0) {
      logger.info(`No posts found for query: ${JSON.stringify(query)}`);
      return res.status(404).json({ message: 'No posts found' });
    }

    const following = loggedInUserId
      ? await Follow.find({ follower: loggedInUserId }).distinct('following')
      : [];

    const populatedPosts = await Promise.all(posts.map(async (post) => {
      const user = await User.findById(post.createdBy.userId);
      const isFollowing = following.includes(post.createdBy.userId);
      return {
        ...post.toObject(),
        profilePicture: user?.profilePicture || '',
        isFollowing
      };
    }));

    res.status(200).json(populatedPosts);
  } catch (error) {
    logger.error(`Error fetching posts: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User Posts
router.get('/user-posts/:Id', async (req, res) => {
  try {
    const { Id } = req.params;
    const userPosts = await Post.find({ 'createdBy.userId': Id }).sort({ createdAt: -1 });
    if (!userPosts || userPosts.length === 0) {
      logger.info(`No posts found for user ${Id}`);
      return res.status(404).json({ message: 'No posts found for this user' });
    }
    res.status(200).json(userPosts);
  } catch (error) {
    logger.error(`Error fetching posts for user ${req.params.Id}: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
});

// Like Post
router.post('/post/like/:id', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.userId;

    const post = await Post.findById(postId);
    if (!post) {
      logger.error(`Post not found: ${postId}`);
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const userIndex = post.likes.findIndex(id => id.toString() === userId.toString());
    const alreadyLiked = userIndex !== -1;

    if (alreadyLiked) {
      post.likes.splice(userIndex, 1);
      logger.info(`User ${userId} unliked post ${postId}`);
    } else {
      if (!post.likes.some(id => id.toString() === userId.toString())) {
        post.likes.push(userId);
        logger.info(`User ${userId} liked post ${postId}`);
        if (post.createdBy.userId.toString() !== userId.toString()) {
          const user = await User.findById(userId);
          const notification = new Notification({
            userId: post.createdBy.userId,
            type: 'like',
            senderId: userId,
            postId,
            message: `${user.firstName} ${user.lastName} liked your post`,
            createdAt: new Date(),
          });
          await notification.save();
          await sendFCMNotification(
            post.createdBy.userId.toString(),
            'New Like',
            `${user.firstName} ${user.lastName} liked your post`,
            { type: 'like', postId: postId.toString() },
            req.io
          );
          await NotificationService.triggerCountUpdate(post.createdBy.userId, req.io);
        }
      }
    }

    const updatedPost = await post.save();
    res.status(200).json({
      success: true,
      likes: updatedPost.likes,
      likeCount: updatedPost.likes.length,
      isLiked: !alreadyLiked,
      message: alreadyLiked ? 'Post unliked successfully' : 'Post liked successfully'
    });
  } catch (error) {
    logger.error(`Error in like/unlike for post ${req.params.id} by user ${req.user.userId}: ${error.message}`);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Comment on Post
router.post('/post/comment/:postId', verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.user.userId;
    const postId = req.params.postId;

    if (!text) {
      logger.warn(`Comment text missing for post ${postId} by user ${userId}`);
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User ${userId} not found`);
      return res.status(404).json({ error: 'User not found' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      logger.error(`Post ${postId} not found`);
      return res.status(404).json({ error: 'Post not found' });
    }

    const newComment = {
      text,
      createdAt: new Date(),
      profilePicture: user.profilePicture,
      name: `${user.firstName} ${user.lastName}`,
    };

    post.comments.push(newComment);
    await post.save();

    if (post.createdBy.userId.toString() !== userId.toString()) {
      const notification = new Notification({
        userId: post.createdBy.userId,
        type: 'comment',
        senderId: userId,
        postId,
        message: `${user.firstName} ${user.lastName} commented on your post`,
        createdAt: new Date(),
      });
      await notification.save();
      await sendFCMNotification(
        post.createdBy.userId.toString(),
        'New Comment',
        `${user.firstName} ${user.lastName} commented on your post`,
        { type: 'comment', postId: postId.toString() },
        req.io
      );
      await NotificationService.triggerCountUpdate(post.createdBy.userId, req.io);
    }

    logger.info(`Comment added to post ${postId} by user ${userId}`);
    res.json({ message: 'Comment added successfully', comment: newComment });
  } catch (error) {
    logger.error(`Error adding comment to post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reply to Comment
router.post('/post/reply/:postId/:commentId', verifyToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.user.userId;

    if (!text) {
      logger.warn(`Reply text missing for comment ${commentId} on post ${postId}`);
      return res.status(400).json({ message: 'Reply text is required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      logger.error(`Post ${postId} not found`);
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      logger.error(`Comment ${commentId} not found on post ${postId}`);
      return res.status(404).json({ message: 'Comment not found' });
    }

    const user = await User.findById(userId).select('firstName lastName profilePicture');
    if (!user) {
      logger.error(`User ${userId} not found`);
      return res.status(404).json({ message: 'User not found' });
    }

    const reply = {
      userId,
      name: `${user.firstName} ${user.lastName}`,
      text,
      profilePicture: user.profilePicture || 'default-avatar.png',
      createdAt: new Date(),
    };

    comment.replies.push(reply);
    await post.save();

    if (post.createdBy.userId.toString() !== userId.toString()) {
      const notification = new Notification({
        userId: post.createdBy.userId,
        type: 'reply',
        senderId: userId,
        postId,
        message: `${user.firstName} ${user.lastName} replied to your comment`,
        createdAt: new Date(),
      });
      await notification.save();
      req.io.to(`user_${post.createdBy.userId}`).emit('notification', {
        type: 'reply',
        postId,
        userId,
        commentId,
        text,
        sender: {
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture,
        },
        createdAt: new Date(),
      });
      await sendFCMNotification(
        post.createdBy.userId.toString(),
        'New Reply',
        `${user.firstName} ${user.lastName} replied to your comment`,
        { type: 'reply', postId: postId.toString(), commentId: commentId.toString() },
        req.io
      );
      await NotificationService.triggerCountUpdate(post.createdBy.userId, req.io);
    }

    logger.info(`Reply added to comment ${commentId} on post ${postId} by user ${userId}`);
    res.status(201).json({ reply });
  } catch (error) {
    logger.error(`Error adding reply to comment ${req.params.commentId} on post ${req.params.postId}: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit Post
router.put('/post/edit/:postId', verifyToken, upload.single('photo'), async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;
    const post = await Post.findById(postId);
    if (!post) {
      logger.error(`Post ${postId} not found`);
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (post.createdBy.userId.toString() !== userId) {
      logger.warn(`User ${userId} not authorized to edit post ${postId}`);
      return res.status(403).json({ success: false, message: 'Not authorized to edit this post' });
    }

    const { description, productCondition, price, location } = req.body;
    if (description) post.description = description;
    if (productCondition) post.productCondition = productCondition;
    if (price) post.price = Number(price);
    if (location) post.location = location;
    if (req.file) {
      post.photo = isProduction ? req.file.path : `${req.protocol}://${req.get('host')}/Uploads/${req.file.filename}`;
    }

    await post.save();
    logger.info(`Post ${postId} edited by user ${userId}`);
    res.json({ success: true, message: 'Post updated successfully', post });
  } catch (error) {
    logger.error(`Error editing post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Report Post
router.post('/post/report/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { reason } = req.body;
    const reporterId = req.user.userId;

    if (!reason || reason.trim() === '') {
      logger.warn(`Reason missing in report for post ${postId} by user ${reporterId}`);
      return res.status(400).json({ error: 'Reason is required' });
    }

    const post = await Post.findById(postId).populate('createdBy.userId');
    if (!post) {
      logger.error(`Post ${postId} not found`);
      return res.status(404).json({ error: 'Post not found' });
    }

    const existingReport = await Report.findOne({
      reportedUser: post.createdBy.userId,
      reportedBy: reporterId,
      relatedPost: postId
    });

    if (existingReport) {
      logger.warn(`User ${reporterId} already reported post ${postId}`);
      return res.status(400).json({ error: 'You have already reported this post', reportId: existingReport._id });
    }

    const newReport = new Report({
      reportedUser: post.createdBy.userId,
      reportedBy: reporterId,
      reason: reason.trim(),
      relatedPost: postId,
      status: 'pending'
    });
    await newReport.save();

    post.reports.push({
      reportId: newReport._id,
      reason: reason.trim(),
      reportedAt: new Date()
    });

    const reportCount = await Report.countDocuments({
      reportedUser: post.createdBy.userId,
      status: 'pending'
    });

    if (reportCount >= 3) {
      post.status = 'under_review';
      const adminUsers = await User.find({ role: 'admin' }); // Assumes admin role exists
      for (const admin of adminUsers) {
        const notification = new Notification({
          userId: admin._id,
          type: 'report',
          senderId: reporterId,
          postId,
          message: `Post ${postId} reported by user ${reporterId} for: ${reason}`,
          createdAt: new Date(),
        });
        await notification.save();
        await sendFCMNotification(
          admin._id.toString(),
          'Post Reported',
          `Post ${postId} reported for: ${reason}`,
          { type: 'report', postId: postId.toString() },
          req.io
        );
        await NotificationService.triggerCountUpdate(admin._id, req.io);
      }
    }

    await post.save();
    logger.info(`Post ${postId} reported by user ${reporterId}`);
    res.json({ success: true, message: 'Post reported successfully', reportId: newReport._id });
  } catch (error) {
    logger.error(`Error reporting post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Post
router.delete('/post/delete/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    const post = await Post.findById(postId);
    if (!post) {
      logger.error(`Post ${postId} not found`);
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.createdBy.userId.toString() !== userId) {
      logger.warn(`User ${userId} not authorized to delete post ${postId}`);
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Post.findByIdAndDelete(postId);
    logger.info(`Post ${postId} deleted by user ${userId}`);
    res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    logger.error(`Error deleting post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


  
  return router;
};