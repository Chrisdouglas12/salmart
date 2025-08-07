const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const winston = require('winston');
const { Server } = require('socket.io');
const admin = require('firebase-admin');
const cloudinary = require('cloudinary').v2;
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken
require('dotenv').config();

// Models
const User = require('./models/userSchema.js');
const Post = require('./models/postSchema.js');
const Notification = require('./models/notificationSchema.js');
const Message = require('./models/messageSchema.js'); // Ensure Message model is imported

// Routes
const userRoutes = require('./routes/userRoutes.js');
const postRoutes = require('./routes/postRoutes.js');
const requestRoutes = require('./routes/requestRoutes.js');
const notificationRoutes = require('./routes/notificationRoutes.js');
const messageRoutes = require('./routes/messageRoutes.js'); // Your REST message routes
const paymentRoutes = require('./routes/paymentRoutes.js');
const transactionRoutes = require('./routes/transactionRoutes.js');
const adminRoutes = require('./routes/adminRoutes.js');
const adminRoutes1 = require('./routes/adminRoutes1.js');
const promoteRoutes = require('./routes/promoteRoutes.js');
const cleanupPromotions = require('./cron/promotionCleanUp.js');
const initializeSocket = require('./routes/socketRoutes.js'); // Import your socket handler


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
app.set('trust proxy', true);
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
  // --- Socket.IO Authentication Middleware ---
  // This middleware runs for every new socket connection
  // It checks the auth token passed from the client during connection.
  auth: (socket, callback) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      logger.warn('Socket connection denied: No authentication token provided.');
      return callback(new Error('Authentication error: No token provided'));
    }
    try {
      // Replace 'YOUR_JWT_SECRET' with your actual JWT secret
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.handshake.auth.userId = decoded.userId; // Attach userId to the handshake object
      logger.info(`Socket ${socket.id} authenticated for user ${decoded.userId}.`);
      callback(null, true); // Allow connection
    } catch (error) {
      logger.error(`Socket connection denied: Invalid token - ${error.message}`);
      callback(new Error('Authentication error: Invalid token'));
    }
  }
});
logger.info('✅ Socket.IO initialized');

// --- Pass io instance to your Socket.IO event handler ---
initializeSocket(io); // This replaces the simple io.on('connection') block here

// Routes
app.use(userRoutes(io));
app.use(postRoutes(io));
app.use(requestRoutes(io));
app.use(notificationRoutes(io));
app.use(messageRoutes(io)); 
app.use(paymentRoutes(io));
app.use(transactionRoutes(io));
app.use(adminRoutes(io));
app.use(adminRoutes1(io));
app.use(promoteRoutes(io));


const escapeRegex = (text) => {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

// === Search Endpoint ===
app.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      logger.warn('Search query missing');
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const searchQuery = escapeRegex(q.trim());
    const fuzzyRegex = new RegExp(searchQuery.split('').join('.*'), 'i'); // Basic fuzzy match

    // Find and exclude Salmart system user
    const systemUser = await User.findOne({ isSystemUser: true }).lean();
    const systemUserId = systemUser?._id?.toString();

    const [users, posts] = await Promise.all([
      User.find({
        $and: [
          {
            $or: [
              { firstName: fuzzyRegex },
              { lastName: fuzzyRegex },
              { email: fuzzyRegex },
              { username: fuzzyRegex },
            ],
          },
          systemUserId ? { _id: { $ne: systemUserId } } : {}, // Exclude system user
        ],
      }).select('firstName lastName username email profilePicture'),

      Post.find({
        $or: [
          { description: fuzzyRegex },
          { location: fuzzyRegex },
          { productCondition: fuzzyRegex },
        ],
      }).populate('createdBy.userId', 'firstName lastName profilePicture'),
    ]);

    logger.info(`Search executed for query: ${q}, found ${users.length} users, ${posts.length} posts`);

    res.status(200).json({ success: true, users, posts });

  } catch (error) {
    logger.error(`Search error: ${error.message}`, { stack: error.stack });
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
