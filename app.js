const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const winston = require('winston');
const { Server } = require('socket.io');
const admin = require('firebase-admin');
const cloudinary = require('cloudinary').v2;
const nodemailer = require('nodemailer');
require('dotenv').config();

// Models
const User = require('./models/userSchema.js');
const Post = require('./models/postSchema.js');
const Notification = require('./models/notificationSchema.js');

// Routes
const userRoutes = require('./routes/userRoutes.js');
const postRoutes = require('./routes/postRoutes.js');
const requestRoutes = require('./routes/requestRoutes.js');
const notificationRoutes = require('./routes/notificationRoutes.js');
const messageRoutes = require('./routes/messageRoutes.js');
const paymentRoutes = require('./routes/paymentRoutes.js');
const transactionRoutes = require('./routes/transactionRoutes.js');
const adminRoutes = require('./routes/adminRoutes.js');
const promoteRoutes = require('./routes/promoteRoutes.js');
const cleanupPromotions = require('./cron/promotionCleanUp.js');


// Initialize Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/server.log' }),
    new winston.transports.Console()
  ]
});

// Initialize Firebase Admin SDK
try {
  const firebaseKey = Buffer.from(process.env.FIREBASE_ADMIN_KEY_BASE64, 'base64').toString('utf8');
  const serviceAccount = JSON.parse(firebaseKey);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://salmart-330ab.firebaseio.com'
  });
  logger.info('✅ Firebase Admin SDK initialized successfully');
} catch (error) {
  logger.error(`❌ Firebase Admin SDK initialization failed: ${error.message}`);
  process.exit(1); // Exit if Firebase fails to initialize
}

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:8158', 'https://salmart.onrender.com', 'https://salmart.vercel.app', 'https://salmartonline.com.ng'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use((req, res, next) => {
  logger.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/receipts', express.static(path.join(__dirname, 'receipts')));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => logger.info('✅ MongoDB connected successfully'))
  .catch((err) => {
    logger.error(`❌ MongoDB connection error: ${err.message}`);
    process.exit(1); // Exit if MongoDB fails to connect
  });

// Initialize Socket.IO
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:8158', 'https://salmart.onrender.com', 'https://salmart.vercel.app', 'https://salmartonline.com.ng' ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  },
  path: '/socket.io',
});
logger.info('✅ Socket.IO initialized');

// Socket.IO connection handling (moved from socket.js)
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  socket.on('join', (userId) => {
    if (mongoose.Types.ObjectId.isValid(userId)) {
      socket.join(`user_${userId}`);
      logger.info(`User ${userId} joined room user_${userId}`);
    } else {
      logger.warn(`Invalid userId in join event: ${userId}`);
    }
  });
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});



// Routes
app.use(userRoutes(io));
app.use(postRoutes(io));
app.use(requestRoutes(io));
app.use(notificationRoutes(io));
app.use(messageRoutes(io));
app.use(paymentRoutes(io));
app.use(transactionRoutes(io));
app.use(adminRoutes(io));
app.use(promoteRoutes(io));


// Search Endpoint
app.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      logger.warn('Search query missing');
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const searchQuery = new RegExp(q.trim(), 'i');
    const [users, posts] = await Promise.all([
      User.find({
        $or: [{ firstName: searchQuery }, { lastName: searchQuery }, { email: searchQuery }],
      }).select('firstName lastName email profilePicture'),
      Post.find({
        $or: [{ description: searchQuery }, { location: searchQuery }, { productCondition: searchQuery }],
      }).populate('createdBy.userId', 'firstName lastName profilePicture'),
    ]);

    logger.info(`Search executed for query: ${q}, found ${users.length} users, ${posts.length} posts`);
    res.status(200).json({ success: true, users, posts });
  } catch (error) {
    logger.error(`Search error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Root Endpoint
app.get('/', (req, res) => {
  res.send('Salmart API is running');
});

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
logger.info('✅ Nodemailer configured');

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME || 'default',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
logger.info('✅ Cloudinary configured');

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => logger.info(`✅ Server running on port ${PORT}`));

module.exports = { app, io, server, transporter };