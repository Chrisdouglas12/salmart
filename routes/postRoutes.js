const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const os = require('os');
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
const sanitizeHtml = require('sanitize-html');
const winston = require('winston');

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

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
logger.info('✅ Cloudinary configured in postRoutes');

const isProduction = process.env.NODE_ENV === 'production';

// Multer storage config
const storage = isProduction
  ? new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'Uploads',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'png', 'jpeg', 'mp4'],
      },
    })
  : multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../Uploads/');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Invalid file type. Only JPEG, PNG, and MP4 are allowed.'));
  },
});

// Helper function for Cloudinary upload
const uploadToCloudinary = (filePath, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    logger.info(`Uploading to Cloudinary: ${filePath}`);
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType },
      (error, result) => {
        if (error) {
          logger.error(`Cloudinary upload error: ${error.message}`);
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );
    fs.createReadStream(filePath).pipe(stream);
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
    logger.info('Attached io to request object in postRoutes');
    next();
  });

  router.post(
  '/post',
  verifyToken,
  upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'video', maxCount: 1 }]),
  async (req, res) => {
    let tempFiles = [];
    try {
      const { description, title, productCondition, location, category, price, postType = 'regular', productLink } = req.body;
      const userId = req.user.userId;

      logger.info(`Starting post creation for user ${userId}, type: ${postType}`);

      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User ${userId} not found`);
        return res.status(404).json({ message: 'User not found' });
      }

      const validCategories = ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others'];
      if (!validCategories.includes(category)) {
        logger.warn(`Invalid category ${category} by user ${userId}`);
        return res.status(400).json({ message: 'Invalid category' });
      }

      const sanitizedDescription = sanitizeHtml(description, {
        allowedTags: [],
        allowedAttributes: {},
      });
      const sanitizedTitle = sanitizeHtml(title, {
        allowedTags: [],
        allowedAttributes: {},
      });

      let photoUrl = null;
      let videoUrl = null;

      // Validate productLink for video ads
      const validDomain = isProduction ? 'salmart.vercel.app' : 'localhost';
      const isValidSalmartLink = (link) => {
        try {
          const url = new URL(link);
          return url.hostname === validDomain;
        } catch (e) {
          return false;
        }
      };

      if (postType === 'video_ad') {
        if (!description || !category || !req.files?.video?.[0] || !productLink) {
          logger.warn(`Missing fields in video ad post creation by user ${userId}`);
          return res.status(400).json({ 
            message: 'Description, category, video, and product link are required' 
          });
        }

        if (!isValidSalmartLink(productLink)) {
          logger.warn(`Invalid product link ${productLink} by user ${userId}`);
          return res.status(400).json({ 
            message: 'Product link must be a valid Salmart URL (e.g., https://salmart.vercel.app/posts/123)' 
          });
        }

        const videoFile = req.files.video[0];
        if (isProduction) {
          // In production, multer-storage-cloudinary already uploaded the file
          videoUrl = videoFile.path; // Use the Cloudinary URL directly
        } else {
          // In development, upload the local file to Cloudinary
          videoUrl = await uploadToCloudinary(videoFile.path, 'video');
          tempFiles.push(videoFile.path);
        }
      } else if (postType === 'regular') {
        if (!title || !productCondition || !price || !location || !category || !req.files?.photo?.[0]) {
          logger.warn(`Missing fields in regular post creation by user ${userId}`);
          return res.status(400).json({ 
            message: 'All fields are required for regular posts' 
          });
        }

        if (isNaN(price) || Number(price) < 0) {
          logger.warn(`Invalid price ${price} by user ${userId}`);
          return res.status(400).json({ 
            message: 'Price must be a valid non-negative number' 
          });
        }

        const photoFile = req.files.photo[0];
        if (isProduction) {
          // In production, multer-storage-cloudinary already uploaded the file
          photoUrl = photoFile.path; // Use the Cloudinary URL directly
        } else {
          // In development, upload the local file to Cloudinary
          photoUrl = await uploadToCloudinary(photoFile.path, 'image');
          tempFiles.push(photoFile.path);
        }
      } else {
        logger.warn(`Invalid postType ${postType} by user ${userId}`);
        return res.status(400).json({ message: 'Invalid post type' });
      }

      const newPost = new Post({
        postType,
        title: sanitizedTitle,
        description: sanitizedDescription,
        category,
        profilePicture: user.profilePicture || 'default.jpg',
        createdBy: {
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
        },
        createdAt: new Date(),
        likes: [],
        ...(postType === 'video_ad' 
          ? { video: videoUrl, productLink } 
          : { 
              photo: photoUrl, 
              location, 
              productCondition, 
              price: Number(price) 
            }
        ),
      });

      await newPost.save();
      logger.info(`Post created by user ${userId}: ${newPost._id}`);

      // Notification logic
      const followers = user.followers || [];
      const notificationPromises = followers
        .filter((followerId) => followerId.toString() !== userId.toString())
        .map(async (followerId) => {
          try {
            const follower = await User.findById(followerId)
              .select('notificationPreferences fcmToken blockedUsers')
              .lean();

            if (follower.blockedUsers?.includes(userId)) {
              logger.info(`Skipping notification for blocked user ${followerId}`);
              return;
            }

            if (follower.notificationPreferences?.posts !== false) {
              const notification = new Notification({
                userId: followerId,
                type: 'new_post',
                senderId: userId,
                postId: newPost._id,
                message: `${user.firstName} ${user.lastName} created a new post`,
                createdAt: new Date(),
              });
              await notification.save();
              logger.info(`Created notification for follower ${followerId} for post ${newPost._id}`);

              if (follower.fcmToken && follower.notificationEnabled !== false) {
                await sendFCMNotification(
                  followerId,
                  'New Post',
                  `${user.firstName} ${user.lastName} created a new post`,
                  { type: 'new_post', postId: newPost._id.toString() },
                  req.io
                );
              }

              await NotificationService.triggerCountUpdate(req.io, followerId);
            }
          } catch (notifError) {
            logger.error(`Notification error for user ${followerId}: ${notifError.message}`);
          }
        });

      await Promise.all(notificationPromises);

      res.status(201).json({ 
        message: 'Post created successfully', 
        post: newPost 
      });
    } catch (error) {
      logger.error(`Post creation error for user ${req.user?.userId}: ${error.message}`);
      res.status(500).json({ 
        message: `Server error: ${error.message}` 
      });
    } finally {
      cleanupFiles(tempFiles);
    }
  }
);


router.get('/post', async (req, res) => {
  try {
    const { category } = req.query;
    const validCategories = ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others'];
    const categoryFilter = category && validCategories.includes(category) ? { category } : {};

    // Fetch logged-in user ID (if any)
    let loggedInUserId = null;
    let userInterests = [];
    let following = [];
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        loggedInUserId = decoded.userId;
        const user = await User.findById(loggedInUserId).select('following').lean();
        following = user?.following || [];
        // Get user interests from past interactions
        userInterests = await Post.find({ likes: loggedInUserId })
          .distinct('category')
          .lean();
      } catch (err) {
        logger.warn(`Invalid token in get posts: ${err.message}`);
      }
    }

    // Fetch posts with status 'active'
    const posts = await Post.find({ ...categoryFilter, status: 'active' })
      .populate('createdBy.userId', 'firstName lastName profilePicture')
      .lean();

    if (!posts || posts.length === 0) {
      logger.info(`No posts found for query: ${JSON.stringify(categoryFilter)}`);
      return res.status(404).json({ message: 'No posts found' });
    }

    const currentTime = new Date();
    
    // Categorize posts into different buckets for fair distribution
    const buckets = {
      ultraFresh: [],    // 0-2 hours
      fresh: [],         // 2-12 hours  
      recent: [],        // 12-48 hours
      thisWeek: [],      // 2-7 days
      older: []          // 7+ days
    };

    // Sort posts into time-based buckets
    posts.forEach(post => {
      const hoursSincePosted = (currentTime - new Date(post.createdAt)) / (1000 * 60 * 60);
      
      if (hoursSincePosted < 2) buckets.ultraFresh.push(post);
      else if (hoursSincePosted < 12) buckets.fresh.push(post);
      else if (hoursSincePosted < 48) buckets.recent.push(post);
      else if (hoursSincePosted < 168) buckets.thisWeek.push(post);
      else buckets.older.push(post);
    });

    // Score and sort each bucket
    const scoreAndSortBucket = (bucketPosts) => {
      return bucketPosts.map(post => {
        const hoursSincePosted = (currentTime - new Date(post.createdAt)) / (1000 * 60 * 60);
        
        // Engagement Score
        const likeCount = post.likes?.length || 0;
        const commentCount = post.comments?.length || 0;
        const engagementScore = (likeCount * 0.3) + (commentCount * 0.7);

        // Following Score - Higher priority for followed users
        let followingScore = 0;
        if (loggedInUserId && following.some(id => id.toString() === post.createdBy.userId._id.toString())) {
          followingScore = 5; // Strong boost for followed users
        }

        // Interest Relevance Score
        let relevanceScore = 0;
        if (loggedInUserId && userInterests.includes(post.category)) {
          relevanceScore = 2;
        }

        // Promotion Score
        let promotionScore = 0;
        if (post.isPromoted && post.promotionDetails?.endDate > currentTime) {
          const amountPaid = post.promotionDetails.amountPaid || 0;
          promotionScore = Math.min(amountPaid / 100, 3);
        }

        // Content Type Score
        const contentTypeScore = post.postType === 'video_ad' ? 1 : 0;

        // Micro-recency within bucket (for fine-tuning order within same time bucket)
        const microRecencyScore = 1 / (hoursSincePosted + 1);

        // Total score prioritizing: Following > Engagement > Relevance > Promotion > Content Type > Micro-recency
        const totalScore = 
          (followingScore * 0.4) +        // 40% - Following gets highest priority
          (engagementScore * 0.25) +      // 25% - Engagement
          (relevanceScore * 0.15) +       // 15% - Interest relevance
          (promotionScore * 0.1) +        // 10% - Promotions
          (contentTypeScore * 0.05) +     // 5% - Content type
          (microRecencyScore * 0.05);     // 5% - Fine-tuning within bucket

        return { ...post, totalScore, hoursSincePosted, followingScore, engagementScore };
      }).sort((a, b) => b.totalScore - a.totalScore);
    };

    // Score and sort each bucket
    const sortedBuckets = {
      ultraFresh: scoreAndSortBucket(buckets.ultraFresh),
      fresh: scoreAndSortBucket(buckets.fresh),
      recent: scoreAndSortBucket(buckets.recent),
      thisWeek: scoreAndSortBucket(buckets.thisWeek),
      older: scoreAndSortBucket(buckets.older)
    };

    // Distribute posts fairly with recency dominance
    const distributedPosts = [];
    const maxPosts = 50;
    
    // Distribution strategy: Newer posts get more slots
    const distribution = {
      ultraFresh: Math.min(15, sortedBuckets.ultraFresh.length),  // Up to 15 slots (30%)
      fresh: Math.min(15, sortedBuckets.fresh.length),            // Up to 15 slots (30%)
      recent: Math.min(10, sortedBuckets.recent.length),          // Up to 10 slots (20%)
      thisWeek: Math.min(7, sortedBuckets.thisWeek.length),       // Up to 7 slots (14%)
      older: Math.min(3, sortedBuckets.older.length)              // Up to 3 slots (6%)
    };

    // Fill slots according to distribution
    distributedPosts.push(...sortedBuckets.ultraFresh.slice(0, distribution.ultraFresh));
    distributedPosts.push(...sortedBuckets.fresh.slice(0, distribution.fresh));
    distributedPosts.push(...sortedBuckets.recent.slice(0, distribution.recent));
    distributedPosts.push(...sortedBuckets.thisWeek.slice(0, distribution.thisWeek));
    distributedPosts.push(...sortedBuckets.older.slice(0, distribution.older));

    // If we have remaining slots, fill with best remaining posts from any bucket
    const remainingSlots = maxPosts - distributedPosts.length;
    if (remainingSlots > 0) {
      const usedIds = new Set(distributedPosts.map(p => p._id.toString()));
      const remainingPosts = [
        ...sortedBuckets.ultraFresh.slice(distribution.ultraFresh),
        ...sortedBuckets.fresh.slice(distribution.fresh),
        ...sortedBuckets.recent.slice(distribution.recent),
        ...sortedBuckets.thisWeek.slice(distribution.thisWeek),
        ...sortedBuckets.older.slice(distribution.older)
      ].filter(post => !usedIds.has(post._id.toString()))
       .sort((a, b) => b.totalScore - a.totalScore);

      distributedPosts.push(...remainingPosts.slice(0, remainingSlots));
    }

    // Final shuffle within time buckets to avoid predictable ordering (optional)
    // This maintains recency dominance while adding some variety
    const finalPosts = [];
    let ultraIndex = 0, freshIndex = 0, recentIndex = 0;
    
    for (let i = 0; i < distributedPosts.length; i++) {
      // Interleave newer posts more frequently
      if (i % 3 === 0 && ultraIndex < distribution.ultraFresh) {
        finalPosts.push(sortedBuckets.ultraFresh[ultraIndex++]);
      } else if (i % 2 === 0 && freshIndex < distribution.fresh) {
        finalPosts.push(sortedBuckets.fresh[freshIndex++]);
      } else if (recentIndex < distribution.recent) {
        finalPosts.push(sortedBuckets.recent[recentIndex++]);
      } else {
        // Fill remaining slots in order
        finalPosts.push(distributedPosts[finalPosts.length]);
      }
    }

    // Use distributed posts as final result
    const sortedPosts = distributedPosts.slice(0, maxPosts);

    // Format response
    const populatedPosts = sortedPosts.map((post) => ({
      ...post,
      createdBy: {
        userId: post.createdBy.userId._id,
        name: `${post.createdBy.userId.firstName} ${post.createdBy.userId.lastName}`,
        profilePicture: post.createdBy.userId.profilePicture || 'default-avatar.png',
      },
      isFollowing: following.some(
        (followedId) => followedId.toString() === post.createdBy.userId._id.toString()
      ),
      postType: post.postType,
      media: post.postType === 'video_ad' ? { video: post.video } : { photo: post.photo },
      isLiked: loggedInUserId ? post.likes.includes(loggedInUserId) : false,
    }));

    // Update viewCount for fetched posts
    await Post.updateMany(
      { _id: { $in: sortedPosts.map((p) => p._id) } },
      { $inc: { viewCount: 1 } }
    );

    logger.info(`Distributed ${populatedPosts.length} posts for user ${loggedInUserId || 'anonymous'} - Fresh: ${distribution.ultraFresh + distribution.fresh}, Recent: ${distribution.recent}, Older: ${distribution.thisWeek + distribution.older}`);
    res.status(200).json(populatedPosts);
  } catch (error) {
    logger.error(`Error fetching posts: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
});
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
          profilePicture: post.createdBy.userId.profilePicture || 'default-avatar.png',
        },
        likes: post.likes || [],
        comments: post.comments || [],
        isLiked: loggedInUserId ? post.likes.includes(loggedInUserId) : false,
      };

      delete postData.createdBy.userId._id;
      logger.info(`Fetched post ${postId} for user ${loggedInUserId || 'anonymous'}`);
      res.status(200).json(postData);
    } catch (error) {
      logger.error(`Error fetching post ${req.params.postId}: ${error.message}`);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  router.get('/user-posts/:Id', async (req, res) => {
    try {
      const { Id } = req.params;
      const userPosts = await Post.find({ 'createdBy.userId': Id }).sort({ createdAt: -1 });
      if (!userPosts || userPosts.length === 0) {
        logger.info(`No posts found for user ${Id}`);
        return res.status(404).json({ message: 'No posts found for this user' });
      }
      logger.info(`Fetched ${userPosts.length} posts for user ${Id}`);
      res.status(200).json(userPosts);
    } catch (error) {
      logger.error(`Error fetching posts for user ${req.params.Id}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.post('/post/like/:id', verifyToken, async (req, res) => {
    try {
      const postId = req.params.id;
      const userId = req.user.userId;

      const post = await Post.findById(postId);
      if (!post) {
        logger.error(`Post not found: ${postId}`);
        return res.status(404).json({ success: false, message: 'Post not found' });
      }

      const userIndex = post.likes.findIndex((id) => id.toString() === userId.toString());
      const alreadyLiked = userIndex !== -1;

      if (alreadyLiked) {
        post.likes.splice(userIndex, 1);
        logger.info(`User ${userId} unliked post ${postId}`);
      } else {
        if (!post.likes.some((id) => id.toString() === userId.toString())) {
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
            logger.info(`Created like notification for user ${post.createdBy.userId} for post ${postId}`);
            await sendFCMNotification(
              post.createdBy.userId.toString(),
              'New Like',
              `${user.firstName} ${user.lastName} liked your post`,
              { type: 'like', postId: postId.toString() },
              req.io
            );
            await NotificationService.triggerCountUpdate(req.io, post.createdBy.userId.toString());
          }
        }
      }

      const updatedPost = await post.save();
      res.status(200).json({
        success: true,
        likes: updatedPost.likes,
        likeCount: updatedPost.likes.length,
        isLiked: !alreadyLiked,
        message: alreadyLiked ? 'Post unliked successfully' : 'Post liked successfully',
      });
    } catch (error) {
      logger.error(`Error in like/unlike for post ${req.params.id} by user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

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
        logger.info(`Created comment notification for user ${post.createdBy.userId} for post ${postId}`);
        await sendFCMNotification(
          post.createdBy.userId.toString(),
          'New Comment',
          `${user.firstName} ${user.lastName} commented on your post`,
          { type: 'comment', postId: postId.toString() },
          req.io
        );
        await NotificationService.triggerCountUpdate(req.io, post.createdBy.userId.toString());
      }

      logger.info(`Comment added to post ${postId} by user ${userId}`);
      res.json({ message: 'Comment added successfully', comment: newComment });
    } catch (error) {
      logger.error(`Error adding comment to post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.get('/post/reply/:postId/:commentId', async (req, res) => {
    try {
      const { postId, commentId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(postId)) {
        logger.warn(`Invalid post ID: ${postId}`);
        return res.status(400).json({ message: 'Invalid post ID' });
      }

      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        logger.warn(`Invalid comment ID: ${commentId}`);
        return res.status(400).json({ message: 'Invalid comment ID' });
      }

      const post = await Post.findById(postId);
      if (!post) {
        logger.error(`Post not found: ${postId}`);
        return res.status(404).json({ message: 'Post not found' });
      }

      const comment = post.comments.id(commentId);
      if (!comment) {
        logger.error(`Comment not found: ${commentId} in post ${postId}`);
        return res.status(404).json({ message: 'Comment not found' });
      }

      const user = await User.findById(comment.userId).select('firstName lastName profilePicture').lean();
      if (!user) {
        logger.warn(`User not found for comment ${commentId}`);
      }

      const commentData = {
        _id: comment._id,
        text: comment.text,
        name: user ? `${user.firstName} ${user.lastName}` : comment.name || 'Unknown User',
        profilePicture: user?.profilePicture || comment.profilePicture || 'default-avatar.png',
        createdAt: comment.createdAt,
        replies: comment.replies || [],
      };

      logger.info(`Fetched comment ${commentId} for post ${postId}`);
      res.status(200).json({ comment: commentData });
    } catch (error) {
      logger.error(`Error fetching comment ${req.params.commentId} for post ${req.params.postId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

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
        logger.info(`Created reply notification for user ${post.createdBy.userId} for comment ${commentId}`);
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
        await NotificationService.triggerCountUpdate(req.io, post.createdBy.userId.toString());
      }

      logger.info(`Reply added to comment ${commentId} on post ${postId} by user ${userId}`);
      res.status(201).json({ reply });
    } catch (error) {
      logger.error(`Error adding reply to comment ${req.params.commentId} on post ${req.params.postId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

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
      let tempFiles = [];

      if (description) post.description = sanitizeHtml(description, { allowedTags: [], allowedAttributes: {} });
      if (productCondition) post.productCondition = productCondition;
      if (price) post.price = Number(price);
      if (location) post.location = location;
      if (req.file) {
        if (isProduction) {
          post.photo = await uploadToCloudinary(req.file.path, 'image');
          tempFiles.push(req.file.path);
        } else {
          post.photo = `${req.protocol}://${req.get('host')}/Uploads/${req.file.filename}`;
          tempFiles.push(req.file.path);
        }
      }

      await post.save();
      logger.info(`Post ${postId} edited by user ${userId}`);
      res.json({ success: true, message: 'Post updated successfully', post });

      cleanupFiles(tempFiles);
    } catch (error) {
      logger.error(`Error editing post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

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
        relatedPost: postId,
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
        status: 'pending',
      });
      await newReport.save();

      post.reports.push({
        reportId: newReport._id,
        reason: reason.trim(),
        reportedAt: new Date(),
      });

      const reportCount = await Report.countDocuments({
        reportedUser: post.createdBy.userId,
        status: 'pending',
      });

      if (reportCount >= 3) {
        post.status = 'under_review';
        const adminUsers = await User.find({ role: 'admin' });
        logger.info(`Notifying ${adminUsers.length} admins for post ${postId} with ${reportCount} reports`);
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
          await NotificationService.triggerCountUpdate(req.io, admin._id.toString());
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
  // GET /api/post/:postId/likers
// This route fetches the names of users who liked a specific post.

router.get('/:postId/likers', async (req, res) => { // Added 'auth' middleware for protection
    try {
        const postId = req.params.postId;

        // Find the post by ID
        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        // Check if there are any likes
        if (!post.likes || post.likes.length === 0) {
            return res.status(200).json({ likers: [], message: 'No one has liked this post yet.' });
        }

        // Fetch user details for each user ID in the 'likes' array
        // We select only the '_id' and 'name' fields for efficiency and privacy
        const likers = await User.find({ _id: { $in: post.likes } })
                                 .select('_id name')
                                 .lean(); // .lean() makes the result plain JavaScript objects, faster for reads

        // Send back the array of liker objects (with _id and name)
        res.status(200).json({ likers });

    } catch (error) {
        console.error('Error fetching likers:', error);
        // Handle CastError for invalid postId format
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid Post ID format.' });
        }
        res.status(500).json({ message: 'Server error while fetching likers.', error: error.message });
    }
});

  return router;
};