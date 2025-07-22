const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Post = require('../models/postSchema.js');
const User = require('../models/userSchema.js'); // Ensure User model is correctly imported
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
      params: async (req, file) => {
        const folder = 'Uploads';
        let resourceType = 'auto';
        let transformation = [];

        if (file.mimetype.startsWith('video/')) {
          resourceType = 'video';
          transformation.push(
            { duration: "60", crop: "limit" },
            { quality: "auto:eco", fetch_format: "mp4" }
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
          eager: [
            ...(file.mimetype.startsWith('video/') ?
              [{ duration: "60", crop: "limit", quality: "auto:eco", fetch_format: "mp4" }] : []),
          ],
          eager_async: true,
          invalidate: true,
        };
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
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Invalid file type. Only JPEG, PNG, and MP4 are allowed.'));
  },
});

// Helper function for Cloudinary upload (used in development environment)
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
      transformationParams.eager = [
        { duration: "60", crop: "limit", quality: "auto:eco", fetch_format: "mp4" }
      ];
      transformationParams.eager_async = true;
      transformationParams.invalidate = true;
    } else {
      transformationParams.resource_type = resourceType;
      transformationParams.transformation = [{ quality: "auto:good", fetch_format: "auto" }];
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

  // --- POST /post - Create a new post ---
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

        const validDomain = isProduction ? 'salmartonline.com.ng' : 'localhost';
        const isValidSalmartLink = (link) => {
          try {
            const url = new URL(link);
            // Ensure link is for HTTP or HTTPS and the correct domain
            return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === validDomain;
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
              message: `Product link must be a valid Salmart URL (e.g., https://${validDomain}/product/123)`
            });
          }

          const videoFile = req.files.video[0];
          if (isProduction) {
            videoUrl = videoFile.path;
          } else {
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
            photoUrl = photoFile.path;
          } else {
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
          // Removed profilePicture from here - it will be populated dynamically
          createdBy: {
            userId: user._id,
            name: `${user.firstName} ${user.lastName}`, // Keep name as a snapshot, or populate it too if preferred
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

        // Notification logic for followers
        const followers = user.followers || [];
        const notificationPromises = followers
          .filter((followerId) => followerId.toString() !== userId.toString())
          .map(async (followerId) => {
            try {
              const follower = await User.findById(followerId)
                .select('notificationPreferences fcmToken blockedUsers')
                .lean();

              if (!follower) { // Handle case where follower might have been deleted
                logger.warn(`Follower ${followerId} not found for notification.`);
                return;
              }

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

  
  // --- GET /post - Get all posts with dynamic profile pictures ---
  router.get('/post', async (req, res) => {
    try {
      const { category } = req.query;
      const validCategories = ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others'];
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

      const posts = await Post.find({ ...categoryFilter, status: 'active' })
        .populate({
          path: 'createdBy.userId',
          model: 'User',
          select: 'firstName lastName profilePicture'
        })
        // You might also want to populate comments and replies here if you return them in this route
        // .populate({
        //   path: 'comments.userId',
        //   model: 'User',
        //   select: 'profilePicture firstName lastName'
        // })
        // .populate({
        //   path: 'comments.replies.userId',
        //   model: 'User',
        //   select: 'profilePicture firstName lastName'
        // })
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
          // IMPORTANT: Check if post.createdBy.userId exists and has _id for comparison
          if (loggedInUserId && post.createdBy.userId && following.some(id => id.toString() === post.createdBy.userId._id.toString())) {
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

      // Final shuffle within time buckets to avoid predictable ordering (optional)
      const finalPosts = [];
      let ultraIndex = 0, freshIndex = 0, recentIndex = 0, thisWeekIndex = 0, olderIndex = 0;

      for (let i = 0; i < maxPosts; i++) {
        let added = false;
        if (i % 3 === 0 && ultraIndex < sortedBuckets.ultraFresh.length) {
          finalPosts.push(sortedBuckets.ultraFresh[ultraIndex++]);
          added = true;
        } else if (i % 2 === 0 && freshIndex < sortedBuckets.fresh.length) {
          finalPosts.push(sortedBuckets.fresh[freshIndex++]);
          added = true;
        } else if (recentIndex < sortedBuckets.recent.length) {
          finalPosts.push(sortedBuckets.recent[recentIndex++]);
          added = true;
        } else if (thisWeekIndex < sortedBuckets.thisWeek.length) {
          finalPosts.push(sortedBuckets.thisWeek[thisWeekIndex++]);
          added = true;
        } else if (olderIndex < sortedBuckets.older.length) {
          finalPosts.push(sortedBuckets.older[olderIndex++]);
          added = true;
        }

        // If no post from higher priority buckets was added, try to fill from any remaining
        if (!added && distributedPosts.length > finalPosts.length) {
          const nextPost = distributedPosts.find(p => !finalPosts.includes(p));
          if (nextPost) {
            finalPosts.push(nextPost);
          }
        }
        if (finalPosts.length >= maxPosts) break; // Ensure we don't exceed maxPosts
      }


      // Format response to include populated user details
      const populatedPosts = finalPosts.map((post) => {
        // Ensure createdBy.userId is populated
        const profilePicture = post.createdBy.userId?.profilePicture || 'default-avatar.png';
        const firstName = post.createdBy.userId?.firstName || 'Unknown';
        const lastName = post.createdBy.userId?.lastName || 'User';

        return {
          ...post,
          createdBy: {
            userId: post.createdBy.userId?._id,
            name: `${firstName} ${lastName}`,
            profilePicture: profilePicture,
          },
          isFollowing: loggedInUserId ? following.some(
            (followedId) => followedId.toString() === post.createdBy.userId?._id.toString()
          ) : false,
          media: post.postType === 'video_ad' ? { video: post.video } : { photo: post.photo },
          isLiked: loggedInUserId ? post.likes.includes(loggedInUserId) : false,
          // Remove totalScore, hoursSincePosted, etc. if not needed by frontend
          totalScore: undefined,
          hoursSincePosted: undefined,
          followingScore: undefined,
          engagementScore: undefined,
        };
      }).filter(p => p.createdBy.userId); // Filter out posts where user data couldn't be populated (e.g., deleted user)

      await Post.updateMany(
        { _id: { $in: populatedPosts.map((p) => p._id) } }, // Use populatedPosts to ensure _id exists
        { $inc: { viewCount: 1 } }
      );

      logger.info(`Distributed ${populatedPosts.length} posts for user ${loggedInUserId || 'anonymous'}`);
      res.status(200).json(populatedPosts);
    } catch (error) {
      logger.error(`Error fetching posts: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // --- GET /post/:postId - Get a single post with dynamic profile picture ---
  router.get('/post/:postId', async (req, res) => {
    try {
      const { postId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(postId)) {
        logger.warn(`Invalid post ID: ${postId}`);
        return res.status(400).json({ success: false, message: 'Invalid post ID' });
      }

      const post = await Post.findById(postId)
        .populate({
          path: 'createdBy.userId',
          model: 'User',
          select: 'firstName lastName profilePicture'
        })
        .populate({
          path: 'comments.userId',
          model: 'User',
          select: 'firstName lastName profilePicture'
        })
        .populate({
          path: 'comments.replies.userId',
          model: 'User',
          select: 'firstName lastName profilePicture'
        })
        .lean(); // Use .lean() for faster retrieval if you're transforming the object afterwards

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

      // Reconstruct comments and replies to use populated data
      const formattedComments = post.comments.map(comment => {
        const commentAuthor = comment.userId || {}; // Use an empty object if userId isn't populated
        const formattedReplies = comment.replies.map(reply => {
          const replyAuthor = reply.userId || {};
          return {
            ...reply,
            userId: replyAuthor._id, // Keep the ID
            name: `${replyAuthor.firstName || 'Unknown'} ${replyAuthor.lastName || 'User'}`,
            profilePicture: replyAuthor.profilePicture || 'default-avatar.png',
          };
        });

        return {
          ...comment,
          userId: commentAuthor._id, // Keep the ID
          name: `${commentAuthor.firstName || 'Unknown'} ${commentAuthor.lastName || 'User'}`,
          profilePicture: commentAuthor.profilePicture || 'default-avatar.png',
          replies: formattedReplies,
        };
      });

      const postData = {
        ...post, // Use the lean post object directly
        createdBy: {
          userId: post.createdBy.userId?._id, // Ensure ._id is accessed safely
          name: `${post.createdBy.userId?.firstName || 'Unknown'} ${post.createdBy.userId?.lastName || 'User'}`,
          profilePicture: post.createdBy.userId?.profilePicture || 'default-avatar.png',
        },
        likes: post.likes || [],
        comments: formattedComments, // Use the newly formatted comments
        isLiked: loggedInUserId ? post.likes.includes(loggedInUserId) : false,
      };

      // No need to delete postData.createdBy.userId._id if we are careful with direct assignment
      logger.info(`Fetched post ${postId} for user ${loggedInUserId || 'anonymous'}`);
      res.status(200).json(postData);
    } catch (error) {
      logger.error(`Error fetching post ${req.params.postId}: ${error.message}`);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // --- GET /user-posts/:Id - Get all posts by a specific user with dynamic profile pictures ---
  router.get('/user-posts/:Id', async (req, res) => {
    try {
      const { Id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(Id)) {
        logger.warn(`Invalid user ID: ${Id}`);
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const userPosts = await Post.find({ 'createdBy.userId': Id })
        .populate({
          path: 'createdBy.userId',
          model: 'User',
          select: 'firstName lastName profilePicture'
        })
        .sort({ createdAt: -1 })
        .lean();

      if (!userPosts || userPosts.length === 0) {
        logger.info(`No posts found for user ${Id}`);
        return res.status(404).json({ message: 'No posts found for this user' });
      }

      // Format response to include populated user details
      const formattedUserPosts = userPosts.map(post => {
        const profilePicture = post.createdBy.userId?.profilePicture || 'default-avatar.png';
        const firstName = post.createdBy.userId?.firstName || 'Unknown';
        const lastName = post.createdBy.userId?.lastName || 'User';

        return {
          ...post,
          createdBy: {
            userId: post.createdBy.userId?._id,
            name: `${firstName} ${lastName}`,
            profilePicture: profilePicture,
          },
          // You might also want to populate comments here if you return them
          // comments: post.comments.map(comment => { ... }),
        };
      }).filter(p => p.createdBy.userId); // Filter out posts where user data couldn't be populated

      logger.info(`Fetched ${formattedUserPosts.length} posts for user ${Id}`);
      res.status(200).json(formattedUserPosts);
    } catch (error) {
      logger.error(`Error fetching posts for user ${req.params.Id}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  
  // --- POST /post/like/:id - Like/Unlike a post ---
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
            const user = await User.findById(userId).select('firstName lastName'); // Fetch sender's name
            if (user) {
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

  // --- POST /post/comment/:postId - Add a comment to a post ---
  router.post('/post/comment/:postId', verifyToken, async (req, res) => {
    try {
      const { text } = req.body;
      const userId = req.user.userId;
      const postId = req.params.postId;

      if (!text) {
        logger.warn(`Comment text missing for post ${postId} by user ${userId}`);
        return res.status(400).json({ error: 'Comment text is required' });
      }

      const user = await User.findById(userId).select('firstName lastName profilePicture'); // Select profilePicture
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
        userId: user._id, // Store only userId
        text,
        createdAt: new Date(),
        // Removed profilePicture and name from here, will be populated on read
      };

      post.comments.push(newComment);
      await post.save();

      // Populate the newly added comment for response
      const savedComment = post.comments[post.comments.length - 1]; // Get the last added comment
      const populatedComment = {
          ...savedComment.toObject(), // Convert Mongoose object to plain object
          userId: user._id, // Keep the user ID
          name: `${user.firstName} ${user.lastName}`, // Add populated name
          profilePicture: user.profilePicture || 'default-avatar.png', // Add populated profilePicture
      };

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
      res.status(201).json({ message: 'Comment added successfully', comment: populatedComment });
    } catch (error) {
      logger.error(`Error adding comment to post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // --- GET /post/reply/:postId/:commentId - Get a single comment with its replies (populated) ---
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

      const post = await Post.findById(postId)
        .populate({
          path: 'comments.userId',
          model: 'User',
          select: 'firstName lastName profilePicture'
        })
        .populate({
          path: 'comments.replies.userId',
          model: 'User',
          select: 'firstName lastName profilePicture'
        })
        .lean(); // Use lean for performance

      if (!post) {
        logger.error(`Post not found: ${postId}`);
        return res.status(404).json({ message: 'Post not found' });
      }

      const comment = post.comments.find(c => c._id.toString() === commentId); // Use find with toString() for comparison
      if (!comment) {
        logger.error(`Comment not found: ${commentId} in post ${postId}`);
        return res.status(404).json({ message: 'Comment not found' });
      }

      // Format the comment and its replies to include populated user details
      const formattedReplies = comment.replies.map(reply => {
        const replyAuthor = reply.userId || {}; // Populated user object or empty
        return {
          ...reply,
          userId: replyAuthor._id,
          name: `${replyAuthor.firstName || 'Unknown'} ${replyAuthor.lastName || 'User'}`,
          profilePicture: replyAuthor.profilePicture || 'default-avatar.png',
        };
      });

      const commentData = {
        _id: comment._id,
        text: comment.text,
        userId: comment.userId?._id, // Access populated ID
        name: `${comment.userId?.firstName || 'Unknown'} ${comment.userId?.lastName || 'User'}`,
        profilePicture: comment.userId?.profilePicture || 'default-avatar.png',
        createdAt: comment.createdAt,
        replies: formattedReplies,
      };

      logger.info(`Fetched comment ${commentId} for post ${postId}`);
      res.status(200).json({ comment: commentData });
    } catch (error) {
      logger.error(`Error fetching comment ${req.params.commentId} for post ${req.params.postId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // --- POST /post/reply/:postId/:commentId - Add a reply to a comment ---
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

      const user = await User.findById(userId).select('firstName lastName profilePicture'); // Select profilePicture
      if (!user) {
        logger.error(`User ${userId} not found`);
        return res.status(404).json({ message: 'User not found' });
      }

      const reply = {
        userId: user._id, // Store only userId
        text,
        createdAt: new Date(),
        // Removed profilePicture and name from here, will be populated on read
      };

      comment.replies.push(reply);
      await post.save();

      // Populate the newly added reply for response
      const savedReply = comment.replies[comment.replies.length - 1];
      const populatedReply = {
          ...savedReply.toObject(),
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
          profilePicture: user.profilePicture || 'default-avatar.png',
      };

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
        // Consider sending less sensitive data over socket if possible
        req.io.to(`user_${post.createdBy.userId}`).emit('notification', {
          type: 'reply',
          postId,
          commentId,
          text: populatedReply.text, // Use the text from the formatted reply
          sender: {
            userId: populatedReply.userId,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePicture: populatedReply.profilePicture,
          },
          createdAt: populatedReply.createdAt,
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
      res.status(201).json({ reply: populatedReply });
    } catch (error) {
      logger.error(`Error adding reply to comment ${req.params.commentId} on post ${req.params.postId}: ${error.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // --- PUT /post/edit/:postId - Edit a post ---
  router.put('/post/edit/:postId', verifyToken, upload.single('photo'), async (req, res) => {
    let tempFiles = []; // Initialize tempFiles here
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

      if (description) post.description = sanitizeHtml(description, { allowedTags: [], allowedAttributes: {} });
      if (productCondition) post.productCondition = productCondition;
      // Ensure price is handled correctly
      if (price !== undefined && !isNaN(Number(price))) {
        post.price = Number(price);
      } else if (price !== undefined) { // If price is provided but invalid
        logger.warn(`Invalid price ${price} provided for post ${postId} by user ${userId}`);
        return res.status(400).json({ success: false, message: 'Invalid price value' });
      }
      if (location) post.location = location;

      if (req.file) {
        if (isProduction) {
          post.photo = req.file.path;
        } else {
          post.photo = await uploadToCloudinary(req.file.path, 'image');
          tempFiles.push(req.file.path);
        }
      }

      const updatedPost = await post.save();
      logger.info(`Post ${postId} edited by user ${userId}`);
      res.json({ success: true, message: 'Post updated successfully', post: updatedPost });

    } catch (error) {
      logger.error(`Error editing post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        cleanupFiles(tempFiles); // Ensure cleanup runs even if there's an error
    }
  });

  // --- POST /post/report/:postId - Report a post ---
  router.post('/post/report/:postId', verifyToken, async (req, res) => {
    try {
      const { postId } = req.params;
      const { reason } = req.body;
      const reporterId = req.user.userId;

      if (!reason || reason.trim() === '') {
        logger.warn(`Reason missing in report for post ${postId} by user ${reporterId}`);
        return res.status(400).json({ error: 'Reason is required' });
      }

      const post = await Post.findById(postId).populate('createdBy.userId', 'firstName lastName'); // Only populate necessary fields
      if (!post) {
        logger.error(`Post ${postId} not found`);
        return res.status(404).json({ error: 'Post not found' });
      }

      // Check if post.createdBy.userId exists (user might be deleted)
      if (!post.createdBy.userId) {
        logger.error(`Creator user for post ${postId} not found. Cannot report.`);
        return res.status(404).json({ error: 'Post creator not found. Cannot report.' });
      }

      const existingReport = await Report.findOne({
        reportedUser: post.createdBy.userId._id, // Use the populated _id
        reportedBy: reporterId,
        relatedPost: postId,
      });

      if (existingReport) {
        logger.warn(`User ${reporterId} already reported post ${postId}`);
        return res.status(400).json({ error: 'You have already reported this post', reportId: existingReport._id });
      }

      const newReport = new Report({
        reportedUser: post.createdBy.userId._id, // Use the populated _id
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

      // Recalculate report count for the user
      const reportCountForUser = await Report.countDocuments({
        reportedUser: post.createdBy.userId._id, // Count reports against the *user*
        status: 'pending',
      });

      // Update post status based on number of reports for the *post itself* (if you have this logic)
      // Or, if 3 reports means suspending the *user*, then you'd handle that separately.
      // Assuming 3 reports on a single post makes it 'under_review' for that post:
      if (post.reports.length >= 3) { // Using post.reports.length as proxy for reports on this specific post
        post.status = 'under_review';
        // Notify admins if a post goes 'under_review'
        const adminUsers = await User.find({ isAdmin: true }).select('_id fcmToken notificationEnabled'); // Select necessary fields for notification
        logger.info(`Post ${postId} has reached ${post.reports.length} reports. Notifying ${adminUsers.length} admins.`);
        for (const admin of adminUsers) {
          const notification = new Notification({
            userId: admin._id,
            type: 'report',
            senderId: reporterId,
            postId,
            message: `Post "${post.title || post.description.substring(0, 20) + '...'}" by ${post.createdBy.userId.firstName || 'Unknown'} was reported. Now under review.`,
            createdAt: new Date(),
          });
          await notification.save();
          if (admin.fcmToken && admin.notificationEnabled !== false) {
             await sendFCMNotification(
              admin._id.toString(),
              'Post Under Review',
              `Post by ${post.createdBy.userId.firstName || 'Unknown'} reported for: ${reason}. Status: Under Review.`,
              { type: 'report_under_review', postId: postId.toString() },
              req.io
            );
          }
          await NotificationService.triggerCountUpdate(req.io, admin._id.toString());
        }
      }

      await post.save();
      logger.info(`Post ${postId} reported by user ${reporterId}`);
      res.status(201).json({ success: true, message: 'Post reported successfully', reportId: newReport._id });
    } catch (error) {
      logger.error(`Error reporting post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- DELETE /post/delete/:postId - Delete a post ---
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
      res.status(200).json({ success: true, message: 'Post deleted' });
    } catch (error) {
      logger.error(`Error deleting post ${req.params.postId} by user ${req.user.userId}: ${error.message}`);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // --- GET /:postId/likers - Get users who liked a post ---
  router.get('/:postId/likers', async (req, res) => { // Consider adding verifyToken if this info is sensitive
    try {
      const postId = req.params.postId;

      const post = await Post.findById(postId);

      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }

      if (!post.likes || post.likes.length === 0) {
        return res.status(200).json({ likers: [], message: 'No one has liked this post yet.' });
      }

      // Populate likers with first name, last name, and profile picture
      const likers = await User.find({ _id: { $in: post.likes } })
        .select('firstName lastName profilePicture')
        .lean();

      // Format the likers array to include full name and profile picture
      const formattedLikers = likers.map(liker => ({
        _id: liker._id,
        name: `${liker.firstName} ${liker.lastName}`,
        profilePicture: liker.profilePicture || 'default-avatar.png',
      }));

      res.status(200).json({ likers: formattedLikers });

    } catch (error) {
      logger.error('Error fetching likers:', error);
      if (error.name === 'CastError') {
        return res.status(400).json({ message: 'Invalid Post ID format.' });
      }
      res.status(500).json({ message: 'Server error while fetching likers.', error: error.message });
    }
  });

  return router;
};
