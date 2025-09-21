const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const os = require('os'); // Not directly used in the provided snippets, but kept for consistency
const Post = require('../models/postSchema.js');
const User = require('../models/userSchema.js');
const Report = require('../models/reportSchema.js');
const Notification = require('../models/notificationSchema.js');
const verifyToken = require('../middleware/auths.js');
const NotificationService = require('../services/notificationService.js');
const { sendNotificationToUser } = require('../services/notificationUtils.js');
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

const storage = isProduction ? new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const folder = 'Uploads';
    let resourceType = 'auto';
    let transformation = [];
    let eager = [];

    if (file.mimetype.startsWith('video/')) {
      resourceType = 'video';
      transformation.push(
        { duration: "60", crop: "limit" },
        { quality: "auto:eco", fetch_format: "mp4" }
      );
      
      // Generate thumbnail at 5 seconds
      eager.push(
        {
          start_offset: "5.0", // 5 seconds
          format: "jpg",
          crop: "fill",
          width: 400,
          height: 350,
          quality: "auto:good"
        }
      );
    } else if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
      transformation.push(
        { quality: "auto:good", fetch_format: "auto" }
      );
    }

    return {
      folder: folder,
      resource_type: resourceType,
      allowed_formats: ['jpg', 'png', 'jpeg', 'mp4'],
      transformation: transformation,
      eager: eager,
      eager_async: false, // Set to false to wait for thumbnail generation
      invalidate: true,
    };
  },
}) : multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../Uploads/');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const fileExt = path.extname(file.originalname).toLowerCase();
        cb(null, `${uniqueSuffix}${fileExt}`);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Invalid file type. Only JPEG, PNG, and MP4 are allowed.'));
  },
});

// Helper function to extract Cloudinary thumbnail URL
const getCloudinaryThumbnailUrl = (videoUrl) => {
  try {
    // Extract public_id from video URL
    const urlParts = videoUrl.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    if (uploadIndex === -1) return null;
    
    // Get public_id (everything after version number, remove extension)
    const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');
    
    // Construct thumbnail URL
    const baseUrl = urlParts.slice(0, uploadIndex + 1).join('/');
    return `${baseUrl}/image/upload/so_5.0,c_fill,w_400,h_350,q_auto:good/${publicId}.jpg`;
  } catch (error) {
    logger.error(`Error generating thumbnail URL: ${error.message}`);
    return null;
  }
};

// Helper function for Cloudinary upload (used in development environment if not direct multer-storage-cloudinary)
const uploadToCloudinary = (filePath, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    logger.info(`Uploading to Cloudinary: ${filePath}`);

    const transformationParams = {
      folder: 'Uploads',
    };
    
    if (resourceType === 'video') {
      transformationParams.resource_type = 'video';
      transformationParams.transformation = [
        { duration: "60", crop: "limit" },
        { quality: "auto:eco", fetch_format: "mp4" }
      ];
      // Add thumbnail generation for videos only
      transformationParams.eager = [
        {
          start_offset: "5.0",
          format: "jpg",
          crop: "fill",
          width: 400,
          height: 350,
          quality: "auto:good"
        }
      ];
      transformationParams.eager_async = false; // Wait for thumbnail
      transformationParams.invalidate = true;
    } else {
      transformationParams.resource_type = resourceType;
      transformationParams.transformation = [{ quality: "auto:good", fetch_format: "auto" }];
      // No eager transformations for images
    }

    const stream = cloudinary.uploader.upload_stream(
      transformationParams,
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
//Create a new post
//Create a new post
router.post(
  '/post',
  verifyToken,
  upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'video', maxCount: 1 }]),
  async (req, res) => {
    let tempFiles = [];
    try {
      const { 
        description, 
        title, 
        productCondition, 
        location, 
        category, 
        price, 
        postType = 'regular', 
        productLink,
        quantity // Added quantity from request body
      } = req.body;
      const userId = req.user.userId;

      logger.info(`Starting post creation for user ${userId}, type: ${postType}`);

      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User ${userId} not found`);
        return res.status(404).json({ message: 'User not found' });
      }

      const validCategories = ['electronics', 'fashion', 'home', 'vehicles', 'music', 'books', 'food_items', 'others'];
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

      const isProduction = process.env.NODE_ENV === 'production';

      const validDomains = isProduction
        ? ['salmartonline.com.ng', 'salmart.onrender.com']
        : ['localhost'];

      const isValidSalmartLink = (link) => {
        try {
          const { hostname } = new URL(link);
          return validDomains.includes(hostname);
        } catch {
          return false;
        }
      };

      let newPost;

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
            message: 'Product link must be a valid Salmart URL (e.g., https://salmartonline.com.ng/product/123)'
          });
        }

        const videoFile = req.files.video[0];
        let videoUrl;
        
        if (isProduction) {
          videoUrl = videoFile.path;
        } else {
          videoUrl = await uploadToCloudinary(videoFile.path, 'video');
          tempFiles.push(videoFile.path);
        }

        // Generate thumbnail URL only for video posts
        const thumbnailUrl = getCloudinaryThumbnailUrl(videoUrl);

        newPost = new Post({
          postType,
          description: sanitizedDescription,
          category,
          createdBy: {
            userId: user._id,
            name: `${user.firstName} ${user.lastName}`,
          },
          createdAt: new Date(),
          likes: [],
          video: videoUrl, 
          productLink,
          videoThumbnail: thumbnailUrl
        });

        logger.info(`Video ad created for user ${userId}: ${videoUrl}`);
        
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

        // Validate quantity for regular posts
        let validatedQuantity = 1; // Default quantity
        if (quantity !== undefined && quantity !== null && quantity !== '') {
          validatedQuantity = parseInt(quantity, 10);
          
          if (isNaN(validatedQuantity) || validatedQuantity < 0 || !Number.isInteger(validatedQuantity)) {
            logger.warn(`Invalid quantity ${quantity} by user ${userId}`);
            return res.status(400).json({
              message: 'Quantity must be a non-negative integer'
            });
          }
          
          if (validatedQuantity > 10000) { // Reasonable upper limit
            logger.warn(`Quantity too high ${quantity} by user ${userId}`);
            return res.status(400).json({
              message: 'Quantity cannot exceed 10,000'
            });
          }
        }

        const photoFile = req.files.photo[0];
        let photoUrl;
        
        if (isProduction) {
          photoUrl = photoFile.path;
        } else {
          photoUrl = await uploadToCloudinary(photoFile.path, 'image');
          tempFiles.push(photoFile.path);
        }

        newPost = new Post({
          postType,
          title: sanitizedTitle,
          description: sanitizedDescription,
          category,
          createdBy: {
            userId: user._id,
            name: `${user.firstName} ${user.lastName}`,
          },
          createdAt: new Date(),
          likes: [],
          photo: photoUrl,
          location,
          productCondition,
          price: Number(price),
          quantity: validatedQuantity
        });

        logger.info(`Creating regular post with quantity: ${validatedQuantity} for user ${userId}`);
        
      } else {
        logger.warn(`Invalid postType ${postType} by user ${userId}`);
        return res.status(400).json({ message: 'Invalid post type' });
      }

      // Save the post
      await newPost.save();
      
      // Enhanced logging with quantity and sold status for regular posts
      const logMessage = postType === 'regular' 
        ? `Post created by user ${userId}: ${newPost._id} (quantity: ${newPost.quantity}, isSold: ${newPost.isSold}, stockStatus: ${newPost.stockStatus})`
        : `Video ad created by user ${userId}: ${newPost._id}`;
      
      logger.info(logMessage);

      // Simplified notification system
      await notifyFollowersOfNewPost(newPost, user, req);

      // Enhanced response with quantity info
      const responsePost = {
        ...newPost.toObject(),
        stockStatus: newPost.stockStatus, // Include virtual field
      };

      res.status(201).json({
        message: 'Post created successfully',
        post: responsePost
      });
      
    } catch (error) {
      logger.error(`Post creation error for user ${req.user?.userId}: ${error.message}`);
      
      // Enhanced error handling for quantity-specific errors
      if (error.name === 'ValidationError') {
        const quantityError = error.errors.quantity;
        if (quantityError) {
          return res.status(400).json({
            message: quantityError.message || 'Invalid quantity value'
          });
        }
      }
      
      res.status(500).json({
        message: `Server error: ${error.message}`
      });
    } finally {
      cleanupFiles(tempFiles);
    }
  }
);

/**
 * Simplified notification system for new posts
 * Uses the exact same pattern as the like notification system
 */
async function notifyFollowersOfNewPost(newPost, user, req) {
  try {
    const followers = user.followers || [];
    
    if (followers.length === 0) {
      logger.info(`No followers to notify for user ${user._id}`);
      return;
    }

    logger.info(`Sending notifications to ${followers.length} followers for new post ${newPost._id}`);

    // Process each follower
    for (const followerId of followers) {
      try {
        // Skip if it's the post creator
        if (followerId.toString() === user._id.toString()) {
          logger.info(`Skipping self-notification for user ${followerId}`);
          continue;
        }

        // Check if follower exists and get their preferences
        const follower = await User.findById(followerId)
          .select('blockedUsers notificationPreferences notificationEnabled')
          .lean();

        if (!follower) {
          logger.warn(`Follower ${followerId} not found`);
          continue;
        }

        // Skip if the follower has blocked the post creator
        if (follower.blockedUsers && follower.blockedUsers.includes(user._id)) {
          logger.info(`Skipping notification - user ${followerId} has blocked ${user._id}`);
          continue;
        }

        // Skip if follower has disabled new post notifications specifically
        if (follower.notificationPreferences && follower.notificationPreferences.new_post === false) {
          logger.info(`Skipping notification - user ${followerId} has disabled new post notifications`);
          continue;
        }

        // Skip if follower has disabled all notifications
        if (follower.notificationEnabled === false) {
          logger.info(`Skipping notification - user ${followerId} has disabled all notifications`);
          continue;
        }

        // 🆕 Enhanced notification message with quantity info for regular posts
        let notificationMessage = `New listing from ${user.firstName} ${user.lastName}. you might be interested in it.`;
        
        if (newPost.postType === 'regular' && newPost.quantity > 1) {
          notificationMessage = `📷 ${user.firstName} ${user.lastName} listed ${newPost.quantity} ${newPost.title} - you might be interested in it.`;
        } else if (newPost.postType === 'regular') {
          notificationMessage = `📷 ${user.firstName} ${user.lastName} listed "${newPost.title}" - you might be interested in it!`;
        }

        // Create and save notification - exact same pattern as like notification
        const notification = new Notification({
          userId: followerId,
          senderId: user._id,
          type: 'new_post',
          postId: newPost._id,
          message: notificationMessage,
          createdAt: new Date()
        });

        await notification.save();
        logger.info(`Created new post notification for user ${followerId} for post ${newPost._id}`);

        // Send FCM notification - exact same pattern as like notification  
        await sendNotificationToUser(
          followerId.toString(),
          'New Listing',
          notificationMessage,
          { type: 'new_post', postId: newPost._id.toString() },
          req.io
        );

        // Update notification count - exact same pattern as like notification
        await NotificationService.triggerCountUpdate(req.io, followerId.toString());

      } catch (error) {
        logger.error(`Error sending notification to follower ${followerId}: ${error.message}`);
        // Continue with next follower
      }
    }

    logger.info(`Completed sending notifications for post ${newPost._id}`);

  } catch (error) {
    logger.error(`Error in notifyFollowersOfNewPost: ${error.message}`, {
      error,
      postId: newPost._id,
      userId: user._id
    });
    // Don't throw - notification failures shouldn't prevent post creation
  }
}

  router.get('/post', async (req, res) => {
    try {
      const { category } = req.query;
      const validCategories = ['electronics', 'fashion', 'home', 'vehicles', 'music',  'books', 'food_items', 'others'];
      const categoryFilter = category && validCategories.includes(category) ? { category } : {};

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
          userInterests = await Post.find({ likes: loggedInUserId })
            .distinct('category')
            .lean();
        } catch (err) {
          logger.warn(`Invalid token in get posts: ${err.message}`);
        }
      }

      // Updated populate to include comments.userId and comments.replies.userId for profile picture
      const posts = await Post.find({ ...categoryFilter, status: 'active' })
        .populate('createdBy.userId', 'firstName lastName profilePicture')
        .populate({
            path: 'comments.userId',
            select: 'firstName lastName profilePicture'
        })
        .populate({
            path: 'comments.replies.userId',
            select: 'firstName lastName profilePicture'
        })
        .lean();

      if (!posts || posts.length === 0) {
        logger.info(`No posts found for query: ${JSON.stringify(categoryFilter)}`);
        return res.status(404).json({ message: 'No posts found' });
      }

      const currentTime = new Date();

      const buckets = {
        ultraFresh: [],
        fresh: [],
        recent: [],
        thisWeek: [],
        older: []
      };

      posts.forEach(post => {
        const hoursSincePosted = (currentTime - new Date(post.createdAt)) / (1000 * 60 * 60);

        if (hoursSincePosted < 2) buckets.ultraFresh.push(post);
        else if (hoursSincePosted < 12) buckets.fresh.push(post);
        else if (hoursSincePosted < 48) buckets.recent.push(post);
        else if (hoursSincePosted < 168) buckets.thisWeek.push(post);
        else buckets.older.push(post);
      });

      const scoreAndSortBucket = (bucketPosts) => {
        return bucketPosts.map(post => {
          const hoursSincePosted = (currentTime - new Date(post.createdAt)) / (1000 * 60 * 60);

          const likeCount = post.likes?.length || 0;
          const commentCount = post.comments?.length || 0;
          const engagementScore = (likeCount * 0.3) + (commentCount * 0.7);

          let followingScore = 0;
          if (loggedInUserId && following.some(id => id.toString() === post.createdBy.userId._id.toString())) {
            followingScore = 5;
          }

          let relevanceScore = 0;
          if (loggedInUserId && userInterests.includes(post.category)) {
            relevanceScore = 2;
          }

          let promotionScore = 0;
          if (post.isPromoted && post.promotionDetails?.endDate > currentTime) {
            const amountPaid = post.promotionDetails.amountPaid || 0;
            promotionScore = Math.min(amountPaid / 100, 3);
          }

          const contentTypeScore = post.postType === 'video_ad' ? 1 : 0;
          const microRecencyScore = 1 / (hoursSincePosted + 1);

          const totalScore =
            (followingScore * 0.4) +
            (engagementScore * 0.25) +
            (relevanceScore * 0.15) +
            (promotionScore * 0.1) +
            (contentTypeScore * 0.05) +
            (microRecencyScore * 0.05);

          return { ...post, totalScore, hoursSincePosted, followingScore, engagementScore };
        }).sort((a, b) => b.totalScore - a.totalScore);
      };

      const sortedBuckets = {
        ultraFresh: scoreAndSortBucket(buckets.ultraFresh),
        fresh: scoreAndSortBucket(buckets.fresh),
        recent: scoreAndSortBucket(buckets.recent),
        thisWeek: scoreAndSortBucket(buckets.thisWeek),
        older: scoreAndSortBucket(buckets.older)
      };

      const distributedPosts = [];
      const maxPosts = 50;

      const distribution = {
        ultraFresh: Math.min(15, sortedBuckets.ultraFresh.length),
        fresh: Math.min(15, sortedBuckets.fresh.length),
        recent: Math.min(10, sortedBuckets.recent.length),
        thisWeek: Math.min(7, sortedBuckets.thisWeek.length),
        older: Math.min(3, sortedBuckets.older.length)
      };

      distributedPosts.push(...sortedBuckets.ultraFresh.slice(0, distribution.ultraFresh));
      distributedPosts.push(...sortedBuckets.fresh.slice(0, distribution.fresh));
      distributedPosts.push(...sortedBuckets.recent.slice(0, distribution.recent));
      distributedPosts.push(...sortedBuckets.thisWeek.slice(0, distribution.thisWeek));
      distributedPosts.push(...sortedBuckets.older.slice(0, distribution.older));

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

      // No need for 'finalPosts' specific interleaving, 'distributedPosts' is already scored
      const sortedPosts = distributedPosts.slice(0, maxPosts);

      const populatedPosts = sortedPosts.map((post) => ({
        ...post,
        createdBy: {
          userId: post.createdBy.userId._id,
          name: `${post.createdBy.userId.firstName} ${post.createdBy.userId.lastName}`,
          profilePicture: post.createdBy.userId.profilePicture || 'default-avatar.png', // Use User profile picture
        },
        // Transform comments to include profilePicture and name from populated userId
        comments: post.comments.map(comment => ({
          ...comment,
          profilePicture: comment.userId?.profilePicture || 'default-avatar.png',
          name: `${comment.userId?.firstName || 'Unknown'} ${comment.userId?.lastName || 'User'}`,
          // Transform replies to include profilePicture and name from populated userId
          replies: comment.replies.map(reply => ({
            ...reply,
            profilePicture: reply.userId?.profilePicture || 'default-avatar.png',
            name: `${reply.userId?.firstName || 'Unknown'} ${reply.userId?.lastName || 'User'}`,
          }))
        })),
        isFollowing: following.some(
          (followedId) => followedId.toString() === post.createdBy.userId._id.toString()
        ),
        postType: post.postType,
        media: post.postType === 'video_ad' ? { video: post.video, thumbnail: post.videoThumbnail} : { photo: post.photo },
        isLiked: loggedInUserId ? post.likes.includes(loggedInUserId) : false,
      }));

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

      // Populate createdBy, comments, and replies to get user profile pictures
      const post = await Post.findById(postId)
        .populate('createdBy.userId', 'firstName lastName profilePicture')
        .populate({
            path: 'comments.userId',
            select: 'firstName lastName profilePicture'
        })
        .populate({
            path: 'comments.replies.userId',
            select: 'firstName lastName profilePicture'
        })
        .lean(); // Use .lean() for performance

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

      // Construct the response object, mapping populated user data to the expected fields
      const postData = {
  ...post,
  createdBy: {
    userId: post.createdBy.userId._id,
    name: `${post.createdBy.userId.firstName} ${post.createdBy.userId.lastName}`,
    profilePicture: post.createdBy.userId.profilePicture || 'default-avatar.png',
  },
  likes: post.likes || [],
  comments: post.comments.map(comment => ({
    ...comment,
    profilePicture: comment.userId?.profilePicture || 'default-avatar.png',
    name: `${comment.userId?.firstName || 'Unknown'} ${comment.userId?.lastName || 'User'}`,
    replies: comment.replies.map(reply => ({
      ...reply,
      profilePicture: reply.userId?.profilePicture || 'default-avatar.png',
      name: `${reply.userId?.firstName || 'Unknown'} ${reply.userId?.lastName || 'User'}`,
    }))
  })) || [],
  media: post.postType === 'video_ad' 
    ? { 
        video: post.video,
        thumbnail: post.videoThumbnail 
      } 
    : { photo: post.photo },
  isLiked: loggedInUserId ? post.likes.includes(loggedInUserId) : false,
};
      // No need to delete postData.createdBy.userId._id if you use .lean() and restructure as above
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
      const userPosts = await Post.find({ 'createdBy.userId': Id })
        .populate('createdBy.userId', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 })
        .lean();

      if (!userPosts || userPosts.length === 0) {
        logger.info(`No posts found for user ${Id}`);
        return res.status(404).json({ message: 'No posts found for this user' });
      }

      const formattedPosts = userPosts.map(post => ({
        ...post,
        createdBy: {
          userId: post.createdBy.userId._id,
          name: `${post.createdBy.userId.firstName} ${post.createdBy.userId.lastName}`,
          profilePicture: post.createdBy.userId.profilePicture || 'default-avatar.png', // Use User profile picture
        },
        // Add transformation for comments and replies here as well for user posts
        comments: post.comments.map(comment => ({
            ...comment,
            profilePicture: comment.userId?.profilePicture || 'default-avatar.png',
            name: `${comment.userId?.firstName || 'Unknown'} ${comment.userId?.lastName || 'User'}`,
            replies: comment.replies.map(reply => ({
                ...reply,
                profilePicture: reply.userId?.profilePicture || 'default-avatar.png',
                name: `${reply.userId?.firstName || 'Unknown'} ${reply.userId?.lastName || 'User'}`,
            }))
        })) || [],
        media: post.postType === 'video_ad' 
    ? { 
        video: post.video,
        thumbnail: post.videoThumbnail 
      } 
    : { photo: post.photo },
      }));

      logger.info(`Fetched ${userPosts.length} posts for user ${Id}`);
      res.status(200).json(formattedPosts);
    } catch (error) {
      logger.error(`Error fetching posts for user ${req.params.Id}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.post('/post/like/:id', verifyToken, async (req, res) => {
    try {
      const postId = req.params.id;
      const userId = req.user.userId;

      const post = await Post.findById(postId).populate('createdBy.userId', 'firstName lastName profilePicture');
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
          if (post.createdBy.userId._id.toString() !== userId.toString()) {
            const user = await User.findById(userId);
            const notification = new Notification({
              userId: post.createdBy.userId._id,
              type: 'like',
              senderId: userId,
              postId,
              message: `${user.firstName} ${user.lastName} liked your post`,
              createdAt: new Date(),
            });
            await notification.save();
            logger.info(`Created like notification for user ${post.createdBy.userId._id} for post ${postId}`);
            await sendNotificationToUser(
              post.createdBy.userId._id.toString(),
              'New Like',
              `${user.firstName} ${user.lastName} liked your Ad`,
              { type: 'like', postId: postId.toString() },
              req.io
            );
            await NotificationService.triggerCountUpdate(req.io, post.createdBy.userId._id.toString());
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

    const post = await Post.findById(postId).populate('createdBy.userId');
    if (!post) {
      logger.error(`Post ${postId} not found`);
      return res.status(404).json({ error: 'Post not found' });
    }

    const newComment = {
      userId: user._id,
      text,
      createdAt: new Date(),
    };

    post.comments.push(newComment);
    await post.save();

    // --- New Logic: Check if the commenter is the post creator ---
    const isPostCreator = post.createdBy.userId.toString() === userId.toString();

    // Notify the post owner (if not the creator themselves)
    if (!isPostCreator) {
      const notification = new Notification({
        userId: post.createdBy.userId._id,
        type: 'comment',
        senderId: userId,
        postId,
        message: `${user.firstName} ${user.lastName} commented on your post`,
        createdAt: new Date(),
      });
      await notification.save();

      await sendNotificationToUser(
        post.createdBy.userId._id.toString(),
        'New Comment',
        `${user.firstName} ${user.lastName} commented on your Ad`,
        { type: 'comment', postId: postId.toString() },
        req.io
      );

      await NotificationService.triggerCountUpdate(req.io, post.createdBy.userId._id.toString());
    }

    // @shoppers Logic — Notify all followers of the post owner
    if (text.includes('@shoppers')) {
      const seller = post.createdBy.userId;

      // Find all followers, excluding the user who is commenting
      const followers = await User.find({ 
        _id: { 
          $in: user.followers, 
          $ne: userId 
        } 
      });

      for (const follower of followers) {
        await Notification.create({
          userId: follower._id,
          senderId: userId,
          postId,
          type: 'notify-followers',
          message: `${seller.firstName} just posted a new product`,
          productName: post.title || '',
        });

        await sendNotificationToUser(
          follower._id.toString(),
          'New Product Alert',
          `${seller.firstName} just dropped something new – check it out!`,
          { type: 'notify-followers', postId: postId.toString() },
          req.io
        );

        await NotificationService.triggerCountUpdate(req.io, follower._id.toString());
      }

      logger.info(`@shoppers triggered by ${userId} for followers of ${seller._id}`);
    }

    logger.info(`Comment added to post ${postId} by user ${userId}`);
    res.json({
      message: 'Comment added successfully',
      comment: {
        ...newComment,
        name: `${user.firstName} ${user.lastName}`,
        profilePicture: user.profilePicture || 'default-avatar.png',
      }
    });

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

      // Populate the comment's userId and its replies' userIds
      const post = await Post.findById(postId)
        .populate({
            path: 'comments.userId',
            select: 'firstName lastName profilePicture'
        })
        .populate({
            path: 'comments.replies.userId',
            select: 'firstName lastName profilePicture'
        })
        .lean(); // Use .lean() here too

      if (!post) {
        logger.error(`Post not found: ${postId}`);
        return res.status(404).json({ message: 'Post not found' });
      }

      // Find the specific comment using find on the lean object
      const comment = post.comments.find(c => c._id.toString() === commentId);
      if (!comment) {
        logger.error(`Comment not found: ${commentId} in post ${postId}`);
        return res.status(404).json({ message: 'Comment not found' });
      }

      // Construct the commentData with populated profilePicture and name
      const commentData = {
        _id: comment._id,
        text: comment.text,
        name: `${comment.userId?.firstName || 'Unknown'} ${comment.userId?.lastName || 'User'}`,
        profilePicture: comment.userId?.profilePicture || 'default-avatar.png',
        createdAt: comment.createdAt,
        replies: comment.replies.map(reply => ({
            ...reply,
            name: `${reply.userId?.firstName || 'Unknown'} ${reply.userId?.lastName || 'User'}`,
            profilePicture: reply.userId?.profilePicture || 'default-avatar.png',
        })) || [], // Ensure replies is an array
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

      // Fetch the post and populate only the necessary parts to save database calls
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
        userId, // Store ONLY the userId reference in the DB
        text,
        createdAt: new Date(),
        // Do NOT store profilePicture or name here to avoid stale data
      };

      comment.replies.push(reply);
      await post.save();

      // Notification logic (ensure post.createdBy.userId is populated if needed, or fetch separately)
      // For this specific route, post.createdBy.userId would need to be populated if used directly
      // However, it's safer to fetch the original post creator user for notifications if not populated.
      // Assuming post.createdBy.userId is available from the initial fetch or implicitly linked
      const postCreatorId = post.createdBy.userId.toString(); // Ensure it's a string for comparison

      if (postCreatorId !== userId.toString()) {
        const notification = new Notification({
          userId: postCreatorId,
          type: 'reply',
          senderId: userId,
          postId,
          message: `${user.firstName} ${user.lastName} replied to your comment`,
          createdAt: new Date(),
        });
        await notification.save();
        logger.info(`Created reply notification for user ${postCreatorId} for comment ${commentId}`);
        // Ensure you're emitting to the correct user's socket
        req.io.to(`user_${postCreatorId}`).emit('notification', {
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
        await sendNotificationToUser(
          postCreatorId,
          'New Reply',
          `${user.firstName} ${user.lastName} replied to your comment`,
          { type: 'reply', postId: postId.toString(), commentId: commentId.toString() },
          req.io
        );
        await NotificationService.triggerCountUpdate(req.io, postCreatorId);
      }

      logger.info(`Reply added to comment ${commentId} on post ${postId} by user ${userId}`);
      // Send back the current user's profile info for immediate client-side display
      res.status(201).json({
        reply: {
          ...reply,
          name: `${user.firstName} ${user.lastName}`, // Send current name
          profilePicture: user.profilePicture || 'default-avatar.png', // Send current profile picture
        }
      });
    } catch (error) {
      logger.error(`Error adding reply to comment ${req.params.commentId} on post ${req.params.postId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.put('/post/edit/:postId', verifyToken, upload.single('photo'), async (req, res) => {
    try {
      const { postId } = req.params;
      const userId = req.user.userId;
      const post = await Post.findById(postId).populate('createdBy.userId', 'firstName lastName profilePicture');
      if (!post) {
        logger.error(`Post ${postId} not found`);
        return res.status(404).json({ success: false, message: 'Post not found' });
      }

      if (post.createdBy.userId._id.toString() !== userId) {
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
          post.photo = req.file.path;
        } else {
          post.photo = await uploadToCloudinary(req.file.path, 'image');
          tempFiles.push(req.file.path);
        }
      }

      await post.save();
      const updatedPost = {
        ...post.toObject(),
        createdBy: {
          userId: post.createdBy.userId._id,
          name: `${post.createdBy.userId.firstName} ${post.createdBy.userId.lastName}`,
          profilePicture: post.createdBy.userId.profilePicture || 'default-avatar.png', // Use User profile picture
        },
      };

      logger.info(`Post ${postId} edited by user ${userId}`);
      res.json({ success: true, message: 'Post updated successfully', post: updatedPost });

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

      const post = await Post.findById(postId).populate('createdBy.userId', 'firstName lastName profilePicture');
      if (!post) {
        logger.error(`Post ${postId} not found`);
        return res.status(404).json({ error: 'Post not found' });
      }

      const existingReport = await Report.findOne({
        reportedUser: post.createdBy.userId._id,
        reportedBy: reporterId,
        relatedPost: postId,
      });

      if (existingReport) {
        logger.warn(`User ${reporterId} already reported post ${postId}`);
        return res.status(400).json({ error: 'You have already reported this post', reportId: existingReport._id });
      }

      const newReport = new Report({
        reportedUser: post.createdBy.userId._id,
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
        reportedUser: post.createdBy.userId._id,
        status: 'pending',
      });

      if (reportCount >= 3) {
        post.status = 'under_review';
        const adminUsers = await User.find({ role: 'admin' }); // Assuming an 'admin' role in User schema
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
          await sendNotificationToUser(
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

      const post = await Post.findById(postId).populate('createdBy.userId', 'firstName lastName profilePicture');
      if (!post) {
        logger.error(`Post ${postId} not found`);
        return res.status(404).json({ message: 'Post not found' });
      }

      if (post.createdBy.userId._id.toString() !== userId) {
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

  router.get('/:postId/likers', async (req, res) => {
    try {
      const postId = req.params.postId;

      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }

      if (!post.likes || post.likes.length === 0) {
        return res.status(200).json({ likers: [], message: 'No one has liked this post yet.' });
      }

      const likers = await User.find({ _id: { $in: post.likes } })
        .select('_id firstName lastName profilePicture') // Select full name fields
        .lean();

      const formattedLikers = likers.map(liker => ({
        _id: liker._id,
        name: `${liker.firstName} ${liker.lastName}`, // Construct full name
        profilePicture: liker.profilePicture || 'default-avatar.png', // Use User profile picture
      }));

      res.status(200).json({ likers: formattedLikers });
    } catch (error) {
      console.error('Error fetching likers:', error);
      if (error.name === 'CastError') {
        return res.status(400).json({ message: 'Invalid Post ID format.' });
      }
      res.status(500).json({ message: 'Server error while fetching likers.', error: error.message });
    }
  });
  
  
  router.get('/share/:postId', async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    
    if (!post) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Product Not Found</title></head>
        <body>
          <h1>Product not found</h1>
          <script>setTimeout(() => window.location.href = "https://www.salmartonline.com.ng", 3000);</script>
        </body>
        </html>
      `);
    }

    const photo = post.photo || 'https://www.salmartonline.com.ng/default-avater.jpg';
    const title = post?.title || 'See this amazing item on Salmart';
    const description = post?.description || 'Shop safely with escrow on Salmart';
    const price = post?.price ? `₦${Number(post.price).toLocaleString('en-NG')}` : '';
    
    // Enhanced description with price
    const fullDescription = `${description}${price ? ` - Only ${price}` : ''}`;
    
    const redirectUrl = `https://www.salmartonline.com.ng/product.html?postId=${post._id}`;
    const shareUrl = `https://www.salmartonline.com.ng/share/${post._id}`;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>${title}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        
        <!-- Enhanced Open Graph tags -->
        <meta property="og:type" content="product" />
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${fullDescription}" />
        <meta property="og:image" content="${photo}" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="${title}" />
        <meta property="og:url" content="${shareUrl}" />
        <meta property="og:site_name" content="Salmart Online" />
        <meta property="og:locale" content="en_NG" />
        
        <!-- Product-specific Open Graph tags -->
        ${price ? `<meta property="product:price:amount" content="${post.price}" />` : ''}
        <meta property="product:price:currency" content="NGN" />
        <meta property="product:availability" content="in stock" />
        
        <!-- Enhanced Twitter Card -->
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@salmartonline" />
        <meta name="twitter:title" content="${title}" />
        <meta name="twitter:description" content="${fullDescription}" />
        <meta name="twitter:image" content="${photo}" />
        <meta name="twitter:image:alt" content="${title}" />
        
        <!-- WhatsApp specific (uses Open Graph) -->
        <meta property="og:image:type" content="image/jpeg" />
        
        <!-- Standard meta tags -->
        <meta name="description" content="${fullDescription}" />
        <meta name="keywords" content="online shopping, Nigeria, ${post?.category || 'products'}, marketplace" />
        <meta name="author" content="Salmart Online" />
        
        <!-- Favicon -->
        <link rel="icon" type="image/x-icon" href="https://www.salmartonline.com.ng/favicon.ico" />
        
        <!-- Canonical URL -->
        <link rel="canonical" href="${redirectUrl}" />
        
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    padding: 20px;
    background: linear-gradient(135deg, #28a745 0%, #28a745 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }

  .container {
    text-align: center;
    background: rgba(40, 167, 69, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    padding: 40px;
    max-width: 500px;
    border: 1px solid rgba(40, 167, 69, 0.2);
  }

  .logo {
    font-size: 2em;
    font-weight: bold;
    margin-bottom: 20px;
    color: #fff;
  }

  .product-info {
    margin: 20px 0;
  }

  .product-title {
    font-size: 1.3em;
    font-weight: 600;
    margin-bottom: 10px;
  }

  .product-price {
    font-size: 1.5em;
    color: #fff;
    font-weight: bold;
    margin: 10px 0;
  }

  .loading {
    margin: 20px 0;
  }

  .spinner {
    border: 3px solid rgba(40, 167, 69, 0.3);
    border-radius: 50%;
    border-top: 3px solid #fff;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(360deg);
    }
  }

  .redirect-text {
    font-size: 0.9em;
    opacity: 0.8;
    margin-top: 15px;
  }

  .manual-link {
    display: inline-block;
    margin-top: 15px;
    padding: 10px 20px;
    background: rgba(40, 167, 69, 0.2);
    border: 1px solid rgba(40, 167, 69, 0.3);
    border-radius: 25px;
    color: #fff;
    text-decoration: none;
    transition: all 0.3s ease;
  }

  .manual-link:hover {
    background: rgba(40, 167, 69, 0.3);
    transform: translateY(-2px);
  }
</style>

      </head>
      <body>
        <div class="container">
          <div class="logo">Salmart</div>
          <div class="product-info">
            <div class="product-title">${title}</div>
            ${price ? `<div class="product-price">${price}</div>` : ''}
          </div>
          <div class="loading">
            <div class="spinner"></div>
            <div class="redirect-text">Taking you to the product...</div>
          </div>
          <a href="${redirectUrl}" class="manual-link">View Product</a>
        </div>
        
        <script>
          // Enhanced redirect with fallback
          let redirected = false;
          
          function redirect() {
            if (!redirected) {
              redirected = true;
              window.location.href = "${redirectUrl}";
            }
          }
          
          // Try immediate redirect
          setTimeout(redirect, 1000);
          
          // Fallback for older browsers or if redirect fails
          setTimeout(() => {
            if (!redirected) {
              document.querySelector('.redirect-text').textContent = 'Click the button below to continue';
            }
          }, 5000);
          
          // Handle back button
          window.addEventListener('pageshow', function(event) {
            if (event.persisted) {
              redirect();
            }
          });
        </script>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Error in share route:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error - Salmart</title></head>
      <body>
        <h1>Something went wrong</h1>
        <p>Please try again later.</p>
        <script>setTimeout(() => window.location.href = "https://www.salmartonline.com.ng", 3000);</script>
      </body>
      </html>
    `);
  }
});

// POST /posts/interactions - Get interaction data for multiple posts
router.post('/posts/interactions', verifyToken, async (req, res) => {
    try {
        const { postIds } = req.body;
        
        if (!Array.isArray(postIds) || postIds.length === 0) {
            return res.status(400).json({ message: 'postIds array is required' });
        }

        // Validate postIds are valid ObjectIds
        const validPostIds = postIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        
        if (validPostIds.length === 0) {
            return res.status(400).json({ message: 'No valid post IDs provided' });
        }

        // Fetch posts with only interaction data we need
        const posts = await Post.find(
            { 
                _id: { $in: validPostIds },
                status: 'active' // Only get active posts
            },
            { 
                _id: 1, 
                likes: 1, 
                comments: 1, 
                isSold: 1 
            }
        ).lean(); // Use lean() for better performance

        const interactions = posts.map(post => ({
            postId: post._id.toString(),
            likes: post.likes ? post.likes.map(id => id.toString()) : [],
            comments: post.comments || [],
            isSold: post.isSold || false
        }));

        res.json({ interactions });
        
    } catch (error) {
        console.error('Error fetching interactions data:', error);
        res.status(500).json({ message: 'Failed to fetch interactions data' });
    }
});

  return router;
};