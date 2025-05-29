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
const ffmpeg = require('fluent-ffmpeg');
const sanitizeHtml = require('sanitize-html');
const winston = require('winston');

// Configure FFmpeg paths for Termux
const isTermux = process.env.TERMUX_VERSION !== undefined;
const ffmpegPath = isTermux 
  ? '/data/data/com.termux/files/usr/bin/ffmpeg' 
  : 'ffmpeg';
const ffprobePath = isTermux 
  ? '/data/data/com.termux/files/usr/bin/ffprobe' 
  : 'ffprobe';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

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
let storage;
if (isProduction) {
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'Uploads',
      resource_type: 'auto',
      allowed_formats: ['jpg', 'png', 'jpeg', 'mp4'],
    },
  });
} else {
  const uploadDir = isTermux
    ? '/data/data/com.termux/files/home/storage/shared/Uploads'
    : path.join(__dirname, '../Uploads/');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const fileExt = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${fileExt}`);
    },
  });
}

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Invalid file type. Only JPEG, PNG, and MP4 are allowed.'));
  },
});

// Helper functions for video processing
const getVideoDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    logger.info(`Getting duration for video: ${filePath}`);
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.error(`FFprobe error for ${filePath}: ${err.message}`);
        return reject(err);
      }
      resolve(metadata.format.duration);
    });
  });
};

const compressVideo = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    logger.info(`Compressing video from ${inputPath} to ${outputPath}`);
    
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-crf 23',
        '-preset fast',
        '-movflags +faststart',
        '-maxrate 1M',
        '-bufsize 2M'
      ])
      .on('start', (cmd) => logger.debug(`FFmpeg command: ${cmd}`))
      .on('error', (err) => {
        logger.error(`Compression error: ${err.message}`);
        reject(new Error(`Video compression failed: ${err.message}`));
      })
      .on('end', () => {
        logger.info(`Successfully compressed video to ${outputPath}`);
        resolve(outputPath);
      })
      .save(outputPath);
  });
};

const generateThumbnail = (videoPath, outputPath) => {
  return new Promise((resolve, reject) => {
    logger.info(`Generating thumbnail for ${videoPath}`);
    
    ffmpeg(videoPath)
      .screenshots({
        count: 1,
        folder: path.dirname(outputPath),
        filename: path.basename(outputPath),
        size: '320x240',
      })
      .on('error', (err) => {
        logger.error(`Thumbnail generation error: ${err.message}`);
        reject(new Error(`Thumbnail generation failed: ${err.message}`));
      })
      .on('end', () => {
        logger.info(`Successfully generated thumbnail at ${outputPath}`);
        resolve(outputPath);
      });
  });
};

const uploadToCloudinary = (filePath, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    logger.info(`Uploading to Cloudinary: ${filePath}`);
    cloudinary.uploader.upload(
      filePath,
      { resource_type: resourceType },
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
        const { description, productCondition, location, category, price, postType = 'regular' } = req.body;
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

        let photoUrl = null;
        let videoUrl = null;
        let thumbnailUrl = null;

        // In your post creation route, modify the video processing logic:
if (postType === 'video_ad') {
  if (!description || !category || !req.files?.video?.[0]) {
    return res.status(400).json({ message: 'Description, category, and video are required' });
  }

  const videoFile = req.files.video[0];
  
  if (isProduction) {
    // Directly upload to Cloudinary - no local compression needed
    videoUrl = await uploadToCloudinary(videoFile.path, 'video');
    
    // Generate thumbnail from the original file before upload
    const thumbnailFilename = `thumb-${Date.now()}.jpg`;
    const thumbnailPath = path.join(os.tmpdir(), thumbnailFilename);
    await generateThumbnail(videoFile.path, thumbnailPath);
    thumbnailUrl = await uploadToCloudinary(thumbnailPath, 'image');
    cleanupFiles([thumbnailPath]);
  } else {
    // Development - use original file (with 6MB limit)
    videoUrl = `${req.protocol}://${req.get('host')}/Uploads/${videoFile.filename}`;
    
    // Generate thumbnail
    const thumbnailFilename = `thumb-${videoFile.filename.replace(/\.[^/.]+$/, '.jpg')}`;
    const thumbnailPath = path.join(path.dirname(videoFile.path), thumbnailFilename);
    await generateThumbnail(videoFile.path, thumbnailPath);
    thumbnailUrl = `${req.protocol}://${req.get('host')}/Uploads/${thumbnailFilename}`;
  }
} else if (postType === 'regular') {
          if (!description || !productCondition || !price || !location || !category || !req.files?.photo?.[0]) {
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

          if (isProduction) {
            photoUrl = await uploadToCloudinary(req.files.photo[0].path, 'image');
          } else {
            photoUrl = `${req.protocol}://${req.get('host')}/Uploads/${req.files.photo[0].filename}`;
          }
        } else {
          logger.warn(`Invalid postType ${postType} by user ${userId}`);
          return res.status(400).json({ message: 'Invalid post type' });
        }

        const newPost = new Post({
          postType,
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
            ? { video: videoUrl, thumbnail: thumbnailUrl } 
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

        // Notification logic remains the same as your original code
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
        if (!isProduction) {
          cleanupFiles(tempFiles);
        }
      }
    }
  );

router.get('/post', async (req, res) => {
  try {
    let loggedInUserId = null;
    const { category } = req.query;

    // Build optional category filter
    const validCategories = ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others'];
    const categoryFilter = category && validCategories.includes(category)
      ? { category }
      : {};

    // Fetch all post types (photo and video_ad), sorted by creation time
    const posts = await Post.find(categoryFilter).sort({ createdAt: -1 });
    if (!posts || posts.length === 0) {
      logger.info(`No posts found for query: ${JSON.stringify(categoryFilter)}`);
      return res.status(404).json({ message: 'No posts found' });
    }

    // Get the list of users the logged-in user is following
    const following = loggedInUserId
      ? await User.findById(loggedInUserId).select('following').lean().then((u) => u?.following || [])
      : [];

    // Populate posts with user info and appropriate media
    const populatedPosts = await Promise.all(
      posts.map(async (post) => {
        const user = await User.findById(post.createdBy.userId).select('profilePicture firstName lastName').lean();
        const isFollowing = following.some(
          (followedId) => followedId.toString() === post.createdBy.userId.toString()
        );

        return {
          ...post.toObject(),
          profilePicture: user?.profilePicture || 'default-avatar.png',
          createdBy: {
            ...post.createdBy,
            name: user ? `${user.firstName} ${user.lastName}` : post.createdBy.name,
          },
          isFollowing,
          postType: post.postType,
          media: post.postType === 'video_ad'
            ? { video: post.video, thumbnail: post.thumbnail }
            : { photo: post.photo },
        };
      })
    );

    logger.info(`Fetched ${populatedPosts.length} posts for user ${loggedInUserId || 'anonymous'}`);
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

  return router;
};