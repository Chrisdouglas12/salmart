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
              message: 'Product link must be a valid Salmart URL (e.g., https://salmartonline.com.ng/product/123)'
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
          createdBy: {
            userId: user._id,
            name: `${user.firstName} ${user.lastName}`, // Kept name for consistency in 'createdBy'
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
        media: post.postType === 'video_ad' ? { video: post.video } : { photo: post.photo },
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
        ...post, // Spread the lean object
        createdBy: {
          userId: post.createdBy.userId._id,
          name: `${post.createdBy.userId.firstName} ${post.createdBy.userId.lastName}`,
          profilePicture: post.createdBy.userId.profilePicture || 'default-avatar.png',
        },
        likes: post.likes || [],
        comments: post.comments.map(comment => ({
            ...comment,
            // Map populated userId data to profilePicture and name
            profilePicture: comment.userId?.profilePicture || 'default-avatar.png',
            name: `${comment.userId?.firstName || 'Unknown'} ${comment.userId?.lastName || 'User'}`,
            replies: comment.replies.map(reply => ({
                ...reply,
                // Map populated userId data to profilePicture and name for replies
                profilePicture: reply.userId?.profilePicture || 'default-avatar.png',
                name: `${reply.userId?.firstName || 'Unknown'} ${reply.userId?.lastName || 'User'}`,
            }))
        })) || [], // Ensure comments is an array
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
            await sendFCMNotification(
              post.createdBy.userId._id.toString(),
              'New Like',
              `${user.firstName} ${user.lastName} liked your post`,
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

      const user = await User.findById(userId); // Fetch user to get current profile data for immediate response
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
        userId: user._id, // Store ONLY the userId reference in the DB
        text,
        createdAt: new Date(),
        // Do NOT store profilePicture or name here to avoid stale data
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
      // Send back the current user's profile info for immediate client-side display
      res.json({
        message: 'Comment added successfully',
        comment: {
          ...newComment,
          name: `${user.firstName} ${user.lastName}`, // Send current name
          profilePicture: user.profilePicture || 'default-avatar.png', // Send current profile picture
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
        await sendFCMNotification(
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

  return router;
};