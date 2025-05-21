const express = require('express');
const app = express();
const mongoose = require('mongoose')
const multer = require('multer')
const User = require('./Schema.js');
const Post  = require('./postSchema.js')
const Profile = require('./profileSchema.js') 
const Admin = require('./adminSchema.js')
const Report = require('./reportSchema.js')
const RefundRequests = require('./refundSchema.js')
const Request = require('./RequestSchema.js')
const Message = require('./messageSchema.js')
const payOutLog = require('./payOut.js')
const Escrow = require('./EscrowSchema.js') 
const Transaction = require('./Transaction.js')
const Review = require('./reviewSchema.js')
const Notification = require('./notificationScript.js')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const htmlToImage = require('html-to-image')
const fs = require('fs');
const fsExtra = require('fs-extra')
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const Jimp = require('jimp');
console.log('Jimp imported:', typeof Jimp, 'read:', typeof Jimp.read);

const ALIGN_CENTER = 1;
const ALIGN_TOP = 2;

const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});
logger.info('Starting application...');

app.use(cors({
  origin:[ 'http://localhost:8158', 'https://labrighterlanguageservices.infinityfreeapp.com', 'https://salmart.vercel.app' ],// Allow Acode Preview
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true
}));

const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
    cloud_name: process.env.CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET 
});

const { CloudinaryStorage } = require('multer-storage-cloudinary');



// Create an HTTP server
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin:[ 'https://cfdouglas.rf.gd','http://localhost:8158',   'https://labrighterlanguageservices.infinityfreeapp.com', 'https://salmart.vercel.app'], 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  path: '/socket.io', //allow explicit path
  transports: ['websocket', 'polling'], //force websockets
  pingTimeout: 60000, //important for production
  pingInterval: 25000,
  cookie: true,
  
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 

// Initialize Socket.IO

io.on('connection', (socket) => {
  console.log('A New client is connected:', socket.id);

  socket.on('joinRoom', async (userId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) return;
      await User.findByIdAndUpdate(userId, { socketId: socket.id }, { new: true });
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined room user_${userId}`);
      await NotificationService.sendCountsToUser(userId);
    } catch (err) {
      console.log('Error in joinRoom:', err);
    }
  }); 

  socket.on('badge-update', async ({ type, count, userId }) => {
    try {
      io.to(`user_${userId}`).emit('badge-update', { type, count, userId });
      console.log(`Broadcasted badge-update for ${type} to user ${userId}`);
      await NotificationService.sendCountsToUser(userId);
    } catch (error) {
      console.error('Error broadcasting badge-update:', error);
    }
  });

// Helper function to send FCM notification
async function sendFCMNotification(userId, title, body, data = {}, imageUrl = null, profilePictureUrl = null) {
  try {
    console.log(`Fetching user from MongoDB: ${userId}`);
    const user = await User.findById(userId);

    if (!user) {
      console.log(`No user found with ID ${userId}`);
      return;
    }

    const token = user.fcmToken;

    if (!token) {
      console.log(`No FCM token for user ${userId}`);
      return;
    }

    const message = {
      token,
      notification: {
        title,
        body,
      },
      data: {
        ...data, // Additional data for click actions
        userId: userId.toString(),
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          icon: profilePictureUrl || 'https://salmart.vercel.app/favicon.ico', // Use sender's profile picture as icon, fallback to app icon
          image: imageUrl || null, // Use product image as the main notification image
          requireInteraction: true,
        },
      },
    };

    await admin.messaging().send(message);
    console.log(`FCM notification sent to user ${userId}: ${title}`);
  } catch (err) {
    console.error(`Error sending FCM notification to user ${userId}:`, err);
  }
}

  socket.on('followUser', async ({ followerId, followedId }) => {
  try {
    const follower = await User.findById(followerId).select('firstName lastName profilePicture');
    if (!follower) return;

    const notification = new Notification({
      userId: followedId,
      type: 'follow',
      senderId: followerId,
      message: `${follower.firstName} ${follower.lastName} followed you`,
      createdAt: new Date(),
    });
    await notification.save();

      io.to(`user_${followedId}`).emit('notification', {
        type: 'follow',
        userId: followerId,
        sender: { firstName: follower.firstName, lastName: follower.lastName, profilePicture: follower.profilePicture },
        createdAt: new Date(),
      });
    

    await sendFCMNotification(
      followedId.toString(),
      'New Follower',
      `${follower.firstName} ${follower.lastName} followed you`,
      { type: 'follow', userId: followerId.toString() }
    );
    await NotificationService.triggerCountUpdate(followedId);
  } catch (error) {
    console.error('Error handling followUser event:', error);
  }
});

  socket.on('likePost', async ({ postId, userId }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
        console.error('Invalid userId or postId');
        return;
      }

      const post = await Post.findById(postId).select('createdBy');
      if (!post) {
        console.error(`Post ${postId} not found`);
        return;
      }

      const sender = await User.findById(userId).select('firstName lastName profilePicture');
      if (!sender) {
        console.error(`User ${userId} not found`);
        return;
      }

      const notification = new Notification({
        userId: post.createdBy.userId,
        type: 'like',
        senderId: userId,
        postId,
        message: `${sender.firstName} ${sender.lastName} just liked your ad`,
        createdAt: new Date(),
      });

      await notification.save();

      // Emit real-time notification
    
        io.to(`user_${post.createdBy.userId}`).emit('notification', {
          type: 'like',
          postId,
          userId,
          sender: {
            firstName: sender.firstName,
            lastName: sender.lastName,
            profilePicture: sender.profilePicture,
          },
          createdAt: new Date(),
        });
      

      // Send FCM push notification
      await sendFCMNotification(
        post.createdBy.userId.toString(),
        'New Like',
        `${sender.firstName} ${sender.lastName} just liked your post`,
        { type: 'like', postId: postId.toString() }
      );

      await NotificationService.triggerCountUpdate(post.createdBy.userId);
    } catch (error) {
      console.error('Error handling likePost event:', error);
    }
  });

  socket.on('commentPost', async ({ postId, userId, comment }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
        console.error('Invalid userId or postId');
        return;
      }

      const post = await Post.findById(postId).select('createdBy');
      if (!post) {
        console.error(`Post ${postId} not found`);
        return;
      }

      const sender = await User.findById(userId).select('firstName lastName profilePicture');
      if (!sender) {
        console.error(`User ${userId} not found`);
        return;
      }

      const notification = new Notification({
        userId: post.createdBy.userId,
        type: 'comment',
        senderId: userId,
        postId,
        message: `${sender.firstName} ${sender.lastName} commented on your post`,
        createdAt: new Date(),
      });

      await notification.save();

      // Emit real-time notification
      
        io.to(`user_${post.createdBy.userId}`).emit('notification', {
          type: 'comment',
          postId,
          userId,
          comment,
          sender: {
            firstName: sender.firstName,
            lastName: sender.lastName,
            profilePicture: sender.profilePicture,
          },
          createdAt: new Date(),
        });
      

      // Send FCM push notification
      await sendFCMNotification(
        post.createdBy.userId.toString(),
        'New Comment',
        `${sender.firstName} ${sender.lastName}: ${comment}`,
        { type: 'comment', postId: postId.toString() }
      );

      await NotificationService.triggerCountUpdate(post.createdBy.userId);
    } catch (error) {
      console.error('Error handling commentPost event:', error);
    }
  });

 socket.on('sendMessage', async (message) => {
  try {
    const { senderId, receiverId, text, messageType, offerDetails, attachment } = message;

    // Validate required fields based on message type  
    if (!senderId || !receiverId) {  
      throw new Error('Missing senderId or receiverId');  
    }  

    if (messageType === 'text' && !text) {  
      throw new Error('Text messages require content');  
    }  

    if (['offer', 'counter-offer'].includes(messageType) && (!offerDetails || !offerDetails.proposedPrice)) {  
      throw new Error('Offer messages require price details');  
    }  

    // Get sender info  
    const sender = await User.findById(senderId).select('firstName lastName profilePicture role');  
    if (!sender) throw new Error('Sender not found');  

    // Prepare the message document  
    const newMessage = new Message({  
      senderId,  
      receiverId,  
      text,  
      messageType: messageType || 'text',  
      status: 'sent',  
      ...(offerDetails && { offerDetails }),  
      ...(attachment && { attachment }),  
      metadata: {  
        isSystemMessage: false,  
        actionRequired: ['offer', 'counter-offer'].includes(messageType)  
      }  
    });  

    const savedMessage = await newMessage.save();  

    // Special handling for offer acceptances  
    if (messageType === 'accept-offer') {  
      // Update product price if offer was accepted  
      if (offerDetails?.productId) {  
        await Product.findByIdAndUpdate(  
          offerDetails.productId,  
          { price: offerDetails.proposedPrice }  
        );  
      }  

      // Create system message for the accepting party  
      const systemMessage = new Message({  
        senderId: senderId,  
        receiverId: senderId, // Send to self as system message  
        messageType: 'system',  
        text: `You accepted the offer for ${offerDetails.productName} at ₦${offerDetails.proposedPrice}`,  
        metadata: {  
          isSystemMessage: true,  
          actionRequired: false  
        }  
      });  
      await systemMessage.save();  
    }  

    // Emit to recipient  
    io.to(`user_${receiverId}`).emit('receiveMessage', {  
      ...savedMessage.toObject(),  
      senderProfile: {  
        firstName: sender.firstName,  
        lastName: sender.lastName,  
        profilePicture: sender.profilePicture  
      }  
    });  

    // Send FCM notification if not a system message  
    if (!message.metadata?.isSystemMessage) {  
      let notificationText = text || 'Sent you an offer';  
      let productImageUrl = null;
      let senderProfilePictureUrl = sender.profilePicture || null; // Use sender's profile picture

      // Enhance notification text with offer details if available  
      if (offerDetails) {  
        if (offerDetails.productName) {  
          notificationText += ` Product: ${offerDetails.productName}`;  
        }  
        if (offerDetails.proposedPrice) {  
          notificationText += ` Offer: ₦${Number(offerDetails.proposedPrice).toLocaleString('en-NG')}`;  
        }  
        // Extract product image URL for the notification  
        productImageUrl = offerDetails.image || null;  
      }  

      // Truncate notification text to avoid FCM limits  
      const maxLength = 80;  
      if (notificationText.length > maxLength) {  
        notificationText = notificationText.substring(0, maxLength - 3) + '...';  
      }  

      await sendFCMNotification(  
        receiverId.toString(),  
        'New Message',  
        `${sender.firstName} ${sender.lastName}: ${notificationText}`,  
        {   
          type: 'message',   
          senderId: senderId.toString(),  
          messageType: savedMessage.messageType  
        },  
        productImageUrl, // Pass product image URL  
        senderProfilePictureUrl // Pass sender's profile picture URL  
      );  
    }  

    await NotificationService.triggerCountUpdate(receiverId);

  } catch (error) {
    console.error('Error sending message:', error);
    socket.emit('messageError', { error: error.message });
  }
});

socket.on('markAsSeen', async ({ messageIds, senderId, receiverId }) => {
  try {
    if (!messageIds || !senderId || !receiverId) {
      throw new Error('Missing required fields');
    }

    // Convert string IDs to ObjectId
    const messageObjectIds = messageIds.map(id => new mongoose.Types.ObjectId(id));

    // Update messages to seen status
    await Message.updateMany(
      {
        _id: { $in: messageObjectIds },
        receiverId: new mongoose.Types.ObjectId(receiverId),
        senderId: new mongoose.Types.ObjectId(senderId)
      },
      { $set: { status: 'seen', isRead: true } }
    );

    // Notify sender that messages were seen
    io.to(`user_${senderId}`).emit('messagesSeen', { 
      messageIds,
      seenAt: new Date() 
    });

    // Update unread counts for both parties
    await NotificationService.triggerCountUpdate(senderId);
    await NotificationService.triggerCountUpdate(receiverId);

  } catch (error) {
    console.error('Error updating message status:', error);
    socket.emit('markSeenError', { error: error.message });
  }
});

// Handle offer acceptances specifically
socket.on('acceptOffer', async ({ offerId, acceptorId }) => {
  try {
    // Get the original offer
    const originalOffer = await Message.findById(offerId);
    if (!originalOffer) throw new Error('Offer not found');

    // Verify the acceptor has rights to accept
    if (originalOffer.receiverId.toString() !== acceptorId) {
      throw new Error('Not authorized to accept this offer');
    }

    // Create acceptance message for buyer
    const buyerMessage = new Message({
      senderId: acceptorId,
      receiverId: originalOffer.senderId,
      messageType: 'accept-offer',
      offerDetails: {
        ...originalOffer.offerDetails,
        status: 'accepted'
      },
      metadata: {
        isSystemMessage: false,
        actionRequired: true // Buyer needs to proceed to payment
      }
    });
    await buyerMessage.save();

    // Create notification for seller
    const sellerMessage = new Message({
      senderId: originalOffer.senderId,
      receiverId: acceptorId,
      messageType: 'system',
      text: `Your offer for ${originalOffer.offerDetails.productName} was accepted`,
      metadata: {
        isSystemMessage: true
      }
    });
    await sellerMessage.save();

    // Emit to both parties
    io.to(`user_${originalOffer.senderId}`).emit('receiveMessage', buyerMessage);
    io.to(`user_${acceptorId}`).emit('receiveMessage', sellerMessage);

    // Update product price
    await Product.findByIdAndUpdate(
      originalOffer.offerDetails.productId,
      { price: originalOffer.offerDetails.proposedPrice }
    );

  } catch (error) {
    console.error('Error accepting offer:', error);
    socket.emit('offerError', { error: error.message });
  }
});
  
  // Handle user disconnection
  
socket.on('disconnect', async () => {
  try {
    console.log('Client disconnected:', socket.id);
    await User.updateOne({ socketId: socket.id }, { socketId: null });
    console.log(`Cleared socketId ${socket.id}`);
  } catch (err) {
    console.log('Error handling disconnect:', err);
  }
});
})


require('dotenv').config(); // Load environment variables
const paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);


const uploadDir = path.join(__dirname, 'Uploads');00

// Check if the directory exists, if not create it
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
//middleware configuration
app.use(cors({
     origin: [
       'http://localhost:8158', 
       'https://labrighterlanguageservices.infinityfreeapp.com',
       'https://cfdouglas.rf.gd', // Add your frontend domain
       'https://salmart-production.up.railway.app', 'https://salmart.vercel.app',
       // Add your Railway domain
     ],
     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
     credentials: true,
     allowedHeaders: ['Content-Type', 'Authorization']
   }));
app.use(express.json())
// Force pure JavaScript MongoDB driver (bypasses native module issues)
process.env.MONGODB_DRIVER_MODULE = 'mongodb-legacy';

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log("Connected to MongoDB (using legacy driver)"))
.catch(err => {
  console.error("MongoDB connection error:", err);
  process.exit(1); // Exit in production if can't connect
});

// Check if in production
const isProduction = process.env.NODE_ENV === 'production';

// Configure Cloudinary (for production)
if (isProduction) {
    cloudinary.config({ 
        cloud_name: process.env.CLOUD_NAME, 
        api_key: process.env.CLOUDINARY_API_KEY, 
        api_secret: process.env.CLOUDINARY_API_SECRET 
    });
}

// Set up storage dynamically
let storage;
if (isProduction) {
    // Cloudinary storage (for production)
    storage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'uploads',
            allowed_formats: ['jpg', 'png', 'jpeg']
        }
    });
} else {
    // Local storage (for development)
    const uploadDir = path.join(__dirname, 'Uploads/');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir); // Ensure folder exists

    storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
            const fileExt = path.extname(file.originalname);
            cb(null, `${uniqueSuffix}${fileExt}`);
        }
    });
}

// Multer setup
const upload = multer({ storage });

// Upload Route
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const imageUrl = isProduction ? req.file.path : `/Uploads/${req.file.filename}`;
    res.json({ imageUrl }); // Return Cloudinary URL or local file path
});

// Serve local images in development
if (!isProduction) {
    app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));
}




//Endpoint to register user

app.post('/register', async(req, res)=> {
try {
const {firstName, lastName, email, password, accountNumber } = req.body
//check if user exists
const existingUser = await User.findOne({email})
if (existingUser) {
return res.status(400).json({ message: 'User already exists' });
}
//hashedPassword
const hashedPassword = await bcrypt.hash(password, 10)
//create user
const newUser = new User({firstName, lastName, email, password: hashedPassword, bankDetails: {
  accountNumber: accountNumber
}})
//save User
await  newUser.save()
console.log("New user registered:", newUser);
res.status(201).json({message: 'user created successfully'})
}
catch(error) {
console.error(error)
res.status(500).json({message: 'Server error'})
}

})
//endpoint to authenticate user login
app.post('/login', async (req, res) => {
    console.log('login attempt:', req.body)
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }
        const restrictBanned = async (req, res, next) => {
  const user = await User.findById(req.user.userId);
  if (user.isBanned) {
    return res.status(403).json({ message: 'Account is banned' });
  }
  next();
};
await Post.updateMany({ userId: user._id }, { isHidden: true });

        const isPassword = await bcrypt.compare(password, user.password);
        if (!isPassword) {
            return res.status(400).json({ message: 'Invalid password' });
        }

        // Generate JWT
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1w' });

        // Save userId in localStorage (on frontend)
        res.status(201).json({
            message: 'Login successful',
            token: token, // Include the token in the response
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                bio: user.bio,
                userId: user._id,
                email: user.email,
                // Send userId to the frontend
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
}); 
// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No or invalid token provided.' });
  }

  const token = authHeader.split(' ')[1]; // Extract the token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Replace with your secret
    req.user = decoded; // Attach decoded token info to req.user
    next(); // Proceed to the next middleware/route
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token has expired. Please log in again.' });
    }
    return res.status(401).json({ message: 'Invalid token.' });
  }
}; 
// Route to verify the token
app.get('/verify-token', verifyToken, async (req, res) => {
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
        res.status(500).json({ message: 'Server error' });
    }
});
// Example route
app.get('/post/reply/:postId/:commentId', async (req, res) => {
    const { postId, commentId } = req.params;
    const post = await Post.findById(postId);
    const comment = post.comments.id(commentId);
    res.json({ comment });
});

app.post('/post/reply/:postId/:commentId', verifyToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;

    // Validate input
    if (!text) {
      return res.status(400).json({ message: 'Reply text is required' });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if comment exists
    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Fetch user
    const user = await User.findById(req.user.userId).select('firstName lastName profilePicture');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create reply
    const reply = {
      userId: req.user.userId,
      name: `${user.firstName} ${user.lastName}`,
      text,
      profilePicture: user.profilePicture || 'default-avatar.png',
      createdAt: new Date(),
    };

    // Add reply to comment
    comment.replies.push(reply);
    await post.save();

    // Create notification for post owner if they're not the one replying
    if (post.createdBy.userId.toString() !== req.user.userId.toString()) {
      const notification = new Notification({
        userId: post.createdBy.userId,
        type: 'reply',
        senderId: req.user.userId,
        postId,
        message: `${user.firstName} ${user.lastName} replied to your comment`,
        createdAt: new Date(),
      });
      await notification.save();

      // Emit real-time notification
      io.to(`user_${post.createdBy.userId}`).emit('notification', {
        type: 'reply',
        postId,
        userId: req.user.userId,
        commentId,
        text,
        sender: {
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture,
        },
        createdAt: new Date(),
      });

      // Send FCM push notification
      await sendFCMNotification(
        post.createdBy.userId.toString(),
        'New Reply',
        `${user.firstName} ${user.lastName} replied to your comment`,
        { type: 'reply', postId: postId.toString(), commentId: commentId.toString() }
      );

      // Update notification counts
      await NotificationService.triggerCountUpdate(post.createdBy.userId);
    }

    // Respond with the reply
    res.status(201).json({ reply });
  } catch (error) {
    console.error('Error in reply route:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
app.get('/user/:userId', async(req, res) => {
    const userId = req.params.userId;
    // Fetch user data based on userId
    const user = await User.findById(userId); // Replace with your actual logic
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});
//endpoint to logout a user
app.post('/logout', (req, res) => {
  // Clear token on the client-side; no need for server-side token management
  res.status(200).json({ message: 'Logged out successfully' });
});
 
//endpoint to update user info
app.patch('/users/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedUser = await User.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});


// Create Request
app.post('/create-request', verifyToken, async (req, res) => {
  try {
    const { text, category, budget, location } = req.body;

    const newRequest = new Request({
      user: req.user.userId,
      text,
      category,
      budget,
      location
    });

    const savedRequest = await newRequest.save();
    res.status(201).json(savedRequest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create request' });
  }
});



app.get('/requests', async (req, res) => {
  try {
    let loggedInUserId = null;
    const { category } = req.query;

    // Check auth token
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      loggedInUserId = decoded.userId;
    }

    // Build category filter
    const query = {};
    if (category && ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others'].includes(category)) {
      query.category = category;
    }

    // Fetch requests
    const requests = await Request.find(query)
      .sort({ createdAt: -1 })
      .populate('user', 'firstName lastName profilePicture');

    if (!requests || requests.length === 0) {
      return res.status(404).json({ message: 'No requests found' });
    }

    // Get following list
    const following = loggedInUserId
      ? await Follow.find({ follower: loggedInUserId }).distinct('following')
      : [];

    // Add name, isFollowing, and profilePicture to each request
    const enrichedRequests = requests.map((req) => {
      const isFollowing = following.includes(req.user._id.toString());
      return {
        ...req.toObject(),
        name: `${req.user.firstName} ${req.user.lastName}`,
        profilePicture: req.user.profilePicture || '',
        isFollowing: isFollowing
      };
    });

    res.status(200).json(enrichedRequests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Endpoint to create a post
app.post('/post', verifyToken, upload.single('photo'), async (req, res) => {
  try {
    const { description, productCondition, location, category } = req.body;
    const price = Number(req.body.price);

    // Validate input
    if (!description || !productCondition || !price || !location || !req.file || !category) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Get the correct image URL based on environment
    let photoUrl;
    if (process.env.NODE_ENV === 'production') {
      // Cloudinary gives us the URL in req.file.path
      photoUrl = req.file.path; 
    } else {
      // Local development
      photoUrl = `${req.protocol}://${req.get('host')}/Uploads/${req.file.filename}`;
    }

    const newPost = new Post({
      description,
      productCondition,
      price,
      location,
      category,
      photo: photoUrl, // Use the correct URL
      profilePicture: user.profilePicture,
      createdBy: {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
      },
      likes: [],
      createdAt: Date.now(),
    });

    await newPost.save();
    res.status(201).json({ 
      message: 'Post created successfully', 
      post: newPost 
    });
  } catch (error) {
    console.error('Post creation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// to get single post
app.get('/post/:postId', async (req, res) => {
  console.log('Get post endpoint hit');
  try {
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(postId).populate('createdBy.userId', 'firstName lastName profilePicture');
    if (!post) {
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
        console.log('Invalid or missing token:', err.message);
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

    res.status(200).json(postData); // Return postData directly
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



//endpoint to get all users
app.get('/users-profile/:id', verifyToken, async (req, res) => {
    const userId = req.params.id;
    console.log(`Fetching profile for userId: ${userId}`); // Log the userId to debug
    try {
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
            profilePicture: user.profilePicture || 'default-avatar.png', // Default picture if not set
        });
    } catch (error) {
        console.error(error); // Log the error to debug
        res.status(500).json({ message: 'Server error' });
    }
});

//endpoint to get post
app.get('/post', async (req, res) => {
  try {
    let loggedInUserId = null;
    const { category } = req.query;

    // Get auth token if present
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET); 
      loggedInUserId = decoded.userId;
    }

    // Build category filter
    const query = {};
    if (category && ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others'].includes(category)) {
      query.category = category;
    }

    // Get posts
    const posts = await Post.find(query).sort({ createdAt: -1 });

    if (!posts || posts.length === 0) {
      return res.status(404).json({ message: 'No posts found' });
    }

    // Get who current user is following
    const following = loggedInUserId 
      ? await Follow.find({ follower: loggedInUserId }).distinct('following') 
      : [];

    // Prepare final post data with isFollowing and profilePicture
    const populatedPosts = await Promise.all(posts.map(async (post) => {
      const user = await User.findById(post.createdBy.userId);
      const isFollowing = following.includes(post.createdBy.userId);

      return {
        ...post.toObject(),
        profilePicture: user?.profilePicture || '',
        isFollowing: isFollowing
      };
    }));

    res.status(200).json(populatedPosts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
//get post by user id

app.get('/user-posts/:Id', async (req, res) => {
  try {
    const { userId } = req.params;
    const userPosts = await Post.find({ 'createdBy.userId': userId }).sort({ createdAt: -1 });

    if (!userPosts || userPosts.length === 0) {
      return res.status(404).json({ message: 'No posts found for this user' });
    }

    res.status(200).json(userPosts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Submit a review
app.post('/submit-review', verifyToken, async (req, res) => {
  try {
    const { reviewedUserId, rating, review } = req.body;
    const reviewerId = req.user.userId; // From auth middleware

    // Validate input
    if (!reviewedUserId || !rating || !review) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(reviewedUserId)) {
      return res.status(400).json({ message: 'Invalid reviewed user ID' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Check if user is trying to review themselves
    if (reviewerId === reviewedUserId) {
      return res.status(400).json({ message: 'You cannot review yourself' });
    }

    // Check if reviewer has already reviewed this user
    const existingReview = await Review.findOne({ 
      reviewerId, 
      reviewedUserId 
    });

    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this user' });
    }

    // Create new review
    const newReview = new Review({
      reviewerId,
      reviewedUserId,
      rating,
      review,
      createdAt: new Date() // Explicitly set timestamp
    });

    await newReview.save();

    // Populate reviewerId in the response
    const populatedReview = await Review.findById(newReview._id).populate('reviewerId', 'firstName lastName profilePicture');

    res.status(201).json({ 
      success: true,
      message: 'Review submitted successfully',
      review: populatedReview
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update an existing review
app.patch('/update-review', verifyToken, async (req, res) => {
  try {
    const { reviewedUserId, rating, review } = req.body;
    const reviewerId = req.user.userId; // From auth middleware

    // Validate input
    if (!reviewedUserId || !rating || !review) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(reviewedUserId)) {
      return res.status(400).json({ message: 'Invalid reviewed user ID' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Check if user is trying to update a review for themselves
    if (reviewerId === reviewedUserId) {
      return res.status(400).json({ message: 'You cannot review yourself' });
    }

    // Find existing review
    const existingReview = await Review.findOne({ 
      reviewerId, 
      reviewedUserId 
    });

    if (!existingReview) {
      return res.status(404).json({ message: 'No review found to update' });
    }

    // Update review fields
    existingReview.rating = rating;
    existingReview.review = review;
    existingReview.createdAt = new Date(); // Update timestamp to reflect edit time

    await existingReview.save();

    // Populate reviewerId in the response
    const populatedReview = await Review.findById(existingReview._id).populate('reviewerId', ' firstName lastName profilePicture');

    res.status(200).json({ 
      success: true,
      message: 'Review updated successfully',
      review: populatedReview
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get reviews for a specific user
app.get('/user-reviews/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userReviews = await Review.find({ reviewedUserId: userId })
      .populate('reviewerId', ' firstName lastName profilePicture')
      .sort({ createdAt: -1 });

    if (!userReviews || userReviews.length === 0) {
      return res.status(404).json({ message: 'No reviews found for this user' });
    }

    res.status(200).json(userReviews);
  } catch (error) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get average rating for a user
app.get('/average-rating/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const result = await Review.aggregate([
      { $match: { reviewedUserId: new mongoose.Types.ObjectId(userId) } },
      { $group: { 
        _id: null, 
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 }
      }}
    ]);

    const averageRating = result.length > 0 ? result[0].averageRating : 0;
    const reviewCount = result.length > 0 ? result[0].reviewCount : 0;

    res.status(200).json({ 
      averageRating: parseFloat(averageRating.toFixed(1)),
      reviewCount
    });
  } catch (error) {
    console.error('Error calculating average rating:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
//Delete users
app.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});
// Endpoint to upload a profile picture

const isDev = process.env.NODE_ENV === "development";

app.post("/upload-profile-picture", verifyToken, upload.single("profilePicture"), async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Profile picture is required" });
    }

    let profilePictureUrl;

    if (isDev) {
      // Local storage in development
      profilePictureUrl = `${req.protocol}://${req.get("host")}/Uploads/${req.file.filename}`;
    } else {
      // Upload to Cloudinary in production
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "profile_pictures",
        use_filename: true,
        unique_filename: false,
      });
      profilePictureUrl = result.secure_url;
    }

    user.profilePicture = profilePictureUrl;
    await user.save();

    res.json({ profilePicture: profilePictureUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Endpoint to get profile picture
app.get('/profile-picture', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId; // Use the user ID from the token
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ profilePicture: user.profilePicture });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

//Endpoint to like a post
app.post('/post/like/:id', verifyToken, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.userId; // Get user ID from verified token

        // 1. Validate Post Existence
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Post not found' 
            });
        }

        // 2. Check Current Like Status
        const userIndex = post.likes.findIndex(id => id.toString() === userId.toString());
        const alreadyLiked = userIndex !== -1;

        // 3. Perform Like/Unlike Action
        if (alreadyLiked) {
            // Unlike - Remove user from likes array
            post.likes.splice(userIndex, 1);
        } else {
            // Like - Add user to likes array (avoid duplicates)
            if (!post.likes.some(id => id.toString() === userId.toString())) {
                post.likes.push(userId);
            }
        }

        // 4. Save Changes
        const updatedPost = await post.save();

        // 5. Prepare Response Data
        const responseData = {
            success: true,
            likes: updatedPost.likes, // Return full array of likes
            likeCount: updatedPost.likes.length,
            isLiked: !alreadyLiked, // Current state after toggle
            message: alreadyLiked ? 'Post unliked successfully' : 'Post liked successfully'
        };

        // 6. Send Success Response
        res.status(200).json(responseData);

    } catch (error) {
        console.error('Error in like/unlike operation:', error);
        
        // 7. Error Handling
        res.status(500).json({ 
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});
// Get comments for a request (NEW ENDPOINT NEEDED)
app.get('/requests/comments/:id', async (req, res) => {
  try {
    const requestId = req.params.id;
    const request = await Request.findById(requestId).populate('comments.user', 'firstName lastName profilePicture');
    
    if (!request) return res.status(404).json({ message: 'Request not found' });
    
    res.json(request.comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get comment count (NEW ENDPOINT NEEDED)
app.get('/requests/:id/comments/count', async (req, res) => {
  try {
    const requestId = req.params.id;
    const request = await Request.findById(requestId);
    
    if (!request) return res.status(404).json({ message: 'Request not found' });
    
    res.json({ success: true, count: request.comments.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Your existing comment endpoint (MODIFIED FOR BETTER RESPONSE)
app.post('/requests/comment/:id', verifyToken, async (req, res) => {
  try {
    const requestId = req.params.id;
    const { text } = req.body;
    const userId = req.user.userId;

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const comment = { user: userId, text, createdAt: new Date() };
    request.comments.push(comment);

    await request.save();
    
    // Populate user data before sending response
    const populatedComment = await Request.populate(request, {
      path: 'comments.user',
      select: 'firstName lastName profilePicture'
    });
    
    const newComment = populatedComment.comments[populatedComment.comments.length - 1];
    
    res.json({ 
      success: true, 
      comment: {
        ...newComment.toObject(),
        user: {
          firstName: newComment.user.firstName,
          lastName: newComment.user.lastName,
          profilePicture: newComment.user.profilePicture
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
//edit requests
app.put('/requests/:id', verifyToken, async (req, res) => {
  try {
    const requestId = req.params.id;
    const { title, description, status } = req.body;
    const userId = req.user.userId;

    const request = await Request.findOne({ _id: requestId, user: userId });
    if (!request) return res.status(404).json({ message: 'Request not found or unauthorized' });

    // Update the fields
    if (title) request.title = title;
    if (description) request.description = description;
    if (status) request.status = status;

    await request.save();
    res.json({ success: true, message: 'Request updated successfully', request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
//delete requests
app.delete('/requests/:id', verifyToken, async (req, res) => {
  try {
    const requestId = req.params.id;
    const userId = req.user.userId;

    const request = await Request.findOneAndDelete({ _id: requestId, user: userId });
    if (!request) return res.status(404).json({ message: 'Request not found or unauthorized' });

    res.json({ success: true, message: 'Request deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
//report requests

app.post('/requests/report/:id', verifyToken, async (req, res) => {
  try {
    const requestId = req.params.id;
    const { reason } = req.body;
    const reportedBy = req.user.userId;

    // Find the request and its owner
    const request = await Request.findById(requestId).populate('user');
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const reportedUser = request.user._id;

    // Create a new report
    const newReport = new Report({
      reportedUser,
      reportedBy,
      reason
    });

    await newReport.save();

    res.json({ 
      success: true, 
      message: 'Request reported successfully', 
      report: newReport 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Your existing like endpoint (MODIFIED FOR BETTER RESPONSE)
app.post('/requests/like/:id', verifyToken, async (req, res) => {
  try {
    const requestId = req.params.id;
    const userId = req.user.userId;

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const hasLiked = request.likes.includes(userId);

    if (hasLiked) {
      request.likes.pull(userId);
    } else {
      request.likes.push(userId);
    }

    await request.save();
    res.json({ 
      success: true,
      liked: !hasLiked, 
      totalLikes: request.likes.length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//Endpoint to handle comments 
app.post('/post/comment/:postId', verifyToken, async (req, res) => { try { const { text } = req.body; const userId = req.user.userId;

if (!text) return res.status(400).json({ error: "Comment text is required" });

const user = await User.findById(userId);
if (!user) return res.status(404).json({ error: "User not found" });

const newComment = {
    text,
    createdAt: new Date(),
    profilePicture: user.profilePicture,
    name: `${user.firstName} ${user.lastName}`, // Full name for display
};

// Update the post with the new comment
const post = await Post.findByIdAndUpdate(
    req.params.postId,
    { $push: { comments: newComment } },
    { new: true }
);

if (!post) return res.status(404).json({ error: "Post not found" });

res.json({ message: "Comment added successfully", comment: newComment });

} catch (error) { console.error("Error adding comment:", error); res.status(500).json({ message: "Server error" }); }

});



//process buy orders
app.post('/pay', async (req, res) => {
    try {
        console.log("Received request body:", req.body); // Debugging line

        const { email, postId, buyerId } = req.body; 

        if (!email || !buyerId) {  
            return res.status(400).json({ success: false, message: "Email and Buyer ID are required" });
        }

        const trimmedPostId = postId.trim();
        const post = await Post.findById(trimmedPostId);
        
        if (!post) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        if (post.isSold) {
            return res.status(400).json({ success: false, message: "Product is already sold" });
        }

        const amount = parseFloat(post.price) * 100;

        const sellerId = post.createdBy;  // Ensure sellerId is correctly assigned

        console.log("Seller ID from post:", sellerId); // Debugging log
   app.enable('trust proxy'); // only once in your app config

const protocol = req.secure ? 'https' : 'http';
const host = req.get('host');
const API_BASE_URL = `${protocol}://${host}`;
        // include correct sellerId in metadata
        const response = await paystack.transaction.initialize({
            email,
            amount: amount,
            callback_url: `${API_BASE_URL}/payment-success?postId=${trimmedPostId}&buyerId=${buyerId}`,
            metadata: {
                postId: trimmedPostId,
                email,
                buyerId,  
                sellerId,  // ✅ Now correctly set
            },
        });

        res.json({ success: true, url: response.data.authorization_url });
    } catch (error) {
        console.error("Error initiating payment:", error);
        res.status(500).json({ success: false, message: "Payment failed" });
    }
});


app.get('/payment-success', async (req, res) => {
    const { reference, postId, productId, buyerId, format = 'html' } = req.query;

    try {
        // Handle JSON-based payment status check
        if (productId && buyerId || format === 'json') {
            console.log('🔍 Verifying payment status:', { productId, buyerId });

            // Find transaction or escrow record to check payment status
            const transaction = await Transaction.findOne({ productId: productId || postId, buyerId });
            if (!transaction) {
                return res.status(404).json({ error: 'Transaction not found', paymentCompleted: false });
            }

            const paymentCompleted = transaction.status === 'completed' || transaction.status === 'pending';
            return res.status(200).json({ paymentCompleted, reference: transaction.paymentReference });
        }

        // Existing logic for Paystack verification and HTML receipt
        if (!reference || !postId) {
            return res.status(400).json({ error: 'Missing reference or postId' });
        }

        console.log("🔍 Verifying Payment with reference:", reference);
        const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || "your_test_secret_key";

        const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${paystackSecretKey}`,
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();
        console.log("✅ Paystack Response:", JSON.stringify(data, null, 2));

        if (!data.status) {
            return res.status(400).json({ error: data.message || "Failed to verify payment" });
        }

        if (data.data.status === 'success') {
            console.log("🎉 Payment Verified Successfully!");

            const post = await Post.findById(postId);
            if (!post) {
                console.log("⚠️ Post not found!");
                return res.status(404).json({ error: "Post not found" });
            }

            const email = data.data.customer.email;
            const buyer = await User.findOne({ email });
            const seller = await User.findById(post.createdBy.userId);

            if (!seller) {
                console.log("⚠️ Seller not found!");
                return res.status(404).json({ error: "Seller not found" });
            }

            if (!buyer) {
                console.log("⚠️ Buyer not found!");
                return res.status(404).json({ error: "Buyer not found" });
            }

            const buyerId = buyer._id.toString();
            const buyerName = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim();
            const amountPaid = data.data.amount / 100;
            const transactionDate = new Date(data.data.paid_at).toLocaleString();
            const productDescription = post.description || "No description available.";
            const sellerId = seller._id.toString();
            const sellerName = `${seller.firstName} ${seller.lastName}`.trim();
            const sellerProfilePic = seller.profilePicture || "default.jpg";

            const COMMISSION_PERCENT = 2;
            const totalAmount = amountPaid;
            const commission = (COMMISSION_PERCENT / 100) * totalAmount;
            const sellerShare = totalAmount - commission;

            const notification = new Notification({
                userId: sellerId,
                senderId: buyerId,
                type: 'payment',
                postId,
                payment: post.description,
                message: `${buyer.firstName} ${buyer.lastName} just paid for your product: "${post.description}"`,
                createdAt: new Date()
            });

            const escrow = new Escrow({
                product: postId,
                buyer: buyerId,
                seller: sellerId,
                amount: amountPaid,
                commission,
                sellerShare,
                paymentReference: reference,
                status: 'In Escrow'
            });

            await escrow.save();

            const transaction = new Transaction({
                buyerId,
                sellerId,
                productId: postId,
                amount: amountPaid,
                status: 'pending',
                viewed: false,
                paymentReference: reference,
            });
            await transaction.save();
            console.log("✅ Transaction record saved.");

            post.isSold = true;
            await post.save();

            await NotificationService.triggerCountUpdate(buyerId);
            await NotificationService.triggerCountUpdate(sellerId);
            console.log("✅ Escrow record saved.");

            await notification.save();
            console.log('✅ Notification sent');
            io.to(sellerId).emit('notification', notification);

            let receiptImageUrl = '';
            try {
                const receiptsDir = path.join(__dirname, 'receipts');
                if (!fs.existsSync(receiptsDir)) {
                    fs.mkdirSync(receiptsDir, { recursive: true });
                    console.log('Created receipts directory:', receiptsDir);
                }
                const imagePath = path.join(receiptsDir, `${reference}.png`);

                console.log('Starting Jimp image generation...');
            const image = new Jimp(600, 800, 0xFFFFFFFF); // white background

// Load fonts
const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

// Draw blue border
for (let x = 0; x < 600; x++) {
    for (let y = 0; y < 800; y++) {
        if (x < 10 || x > 590 || y < 10 || y > 790) {
            image.setPixelColor(Jimp.rgbaToInt(0, 102, 204, 255), x, y); // soft blue
        }
    }
}

// Placeholder for logo
image.print(font, 40, 20, 'Logo Here'); // replace this later with actual logo image

// Add SALMART name and receipt title
const brandName = 'SALMART';
const brandX = (600 - Jimp.measureText(fontLarge, brandName)) / 2;
image.print(fontLarge, brandX, 80, brandName);

const titleText = 'Payment Receipt';
const titleX = (600 - Jimp.measureText(font, titleText)) / 2;
image.print(font, titleX, 160, titleText);

// Receipt details
const details = [
    `Reference: ${reference || 'N/A'}`,
    `Amount Paid: ₦${Number(amountPaid || 0).toLocaleString('en-NG')}`,
    `Date: ${transactionDate || new Date().toISOString()}`,
    `Buyer: ${buyerName || 'Unknown'}`,
    `Email: ${email || 'N/A'}`,
    `Description: ${productDescription || 'Purchase'}`
];

let yPosition = 240;
details.forEach(line => {
    image.print(font, 40, yPosition, line);
    yPosition += 50;
});

// Footer message
const footerText = 'Thank you for shopping with SALMART!';
const footerX = (600 - Jimp.measureText(font, footerText)) / 2;
image.print(font, footerX, 700, footerText);
                await image.writeAsync(imagePath);
                console.log('✅ Receipt image generated:', imagePath);

                const cloudinaryResponse = await cloudinary.uploader.upload(imagePath, {
                    public_id: `receipts/${reference}`,
                    folder: 'salmart_receipts'
                });
                receiptImageUrl = cloudinaryResponse.secure_url;
                console.log('✅ Receipt image uploaded to Cloudinary:', receiptImageUrl);

                await fs.promises.unlink(imagePath);
                console.log('Temporary image deleted:', imagePath);
            } catch (imageError) {
                console.error('🚨 Error generating or uploading image:', imageError.message, imageError.stack);
                receiptImageUrl = '';
                console.warn('⚠️ Proceeding without receipt image');
            }

            const safeReceiptImageUrl = String(receiptImageUrl || '');

            // Return HTML receipt page for user-facing requests
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Payment Receipt</title>
                    <style>
                        body { font-family: Arial, sans-serif; background-color: #f8f8f8; text-align: center; padding: 20px; }
                        .receipt-container {
                            max-width: 400px;
                            margin: auto;
                            padding: 20px;
                            background: white;
                            border-radius: 10px;
                            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                            text-align: left;
                        }
                        .header {
                            text-align: center;
                            padding-bottom: 10px;
                            border-bottom: 2px solid #007bff;
                        }
                        .header h2 { color: #007bff; margin: 5px 0; }
                        .status { text-align: center; font-size: 18px; padding: 10px; color: green; font-weight: bold; }
                        .details p { font-size: 14px; margin: 5px 0; }
                        .details span { font-weight: bold; }
                        .footer {
                            text-align: center;
                            font-size: 12px;
                            color: gray;
                            padding-top: 10px;
                            border-top: 1px solid #ddd;
                        }
                        .share-button {
                            display: block;
                            width: 100%;
                            padding: 10px;
                            margin-top: 10px;
                            background: #28a745;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                            text-align: center;
                        }
                        .share-button:hover { background: #218838; }
                    </style>
                </head>
                <body>
                    <div class="receipt-container">
                        <div class="header">
                            <h2>Payment Receipt</h2>
                        </div>
                        <p class="status">✅ Payment Successful</p>
                        <div class="details">
                            <p><span>Transaction Reference:</span> ${reference}</p>
                            <p><span>Amount Paid:</span> ₦${Number(amountPaid).toLocaleString('en-NG')}</p>
                            <p><span>Payment Date:</span> ${transactionDate}</p>
                            <p><span>Buyer Name:</span> ${buyerName}</p>
                            <p><span>Buyer Email:</span> ${email}</p>
                            <p><span>Description:</span> ${productDescription}</p>
                        </div>
                        <button class="share-button" onclick="shareReceipt()">📤 Share Receipt</button>
                        <div class="footer">
                            <p>© 2025 Salmart Technologies. All rights reserved.</p>
                        </div>
                    </div>
                    <script>
                        const API_BASE_URL = window.location.hostname === 'localhost' 
                            ? 'http://localhost:3000' 
                            : 'https://salmart-production.up.railway.app';
                        async function shareReceipt() {
                            try {
                                const payload = {
                                    reference: '${reference || ''}',
                                    buyerId: '${buyer._id || ''}',
                                    sellerId: '${seller._id || ''}',
                                    amountPaid: ${amountPaid || 0},
                                    transactionDate: '${transactionDate || ''}',
                                    buyerName: '${buyerName || ''}',
                                    email: '${buyer.email || ''}',
                                    productDescription: '${productDescription || ''}',
                                    receiptImageUrl: '${safeReceiptImageUrl}'
                                };
                                console.log('Sending /share-receipt payload:', payload);
                                const response = await fetch(API_BASE_URL + '/share-receipt', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload)
                                });
                                const result = await response.json();
                                if (result.success) {
                                    window.location.href = API_BASE_URL + '/Chats.html?recipient_id=${seller._id || ''}&recipient_username=' + encodeURIComponent('${sellerName || ''}') + '&recipient_profile_picture_url=' + encodeURIComponent('${sellerProfilePic || ''}') + '&user_id=${buyer._id || ''}';
                                } else {
                                    alert('Failed to share receipt: ' + result.message);
                                }
                            } catch (error) {
                                alert('Error sharing receipt: ' + error.message);
                                console.error(error);
                            }
                        }
                    </script>
                </body>
                </html>
            `);
        } else {
            return res.status(400).json({ error: `Payment status: ${data.data.status}` });
        }
    } catch (error) {
        console.error('🚨 Error during payment verification:', error.message);
        return res.status(500).json({ error: `An error occurred: ${error.message}` });
    }
});
app.get('/Chats.html', (req, res) => {
    console.log('Serving chat.html');
    res.sendFile(path.join(__dirname, 'public', 'Chats.html'));
});

const nodemailer = require('nodemailer');

async function sendEmail(to, subject, message) {
    const transporter = nodemailer.createTransport({
        service: 'gmail', // You can use another provider
        auth: {
            user: process.env.EMAIL_USER, // Your email
            pass: process.env.EMAIL_PASS, // App password
        },
    });

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html: message,
    });
}

const PDFDocument = require('pdfkit'); 


const bodyParser = require('body-parser');
app.post('/share-receipt', async (req, res) => {
    try {
        const {
            reference,
            buyerId,
            sellerId,
            amountPaid,
            transactionDate,
            buyerName,
            email,
            productDescription,
            receiptImageUrl = ''
        } = req.body;

        console.log('Received /share-receipt request:', req.body);

        const missingFields = [];
        if (!reference) missingFields.push('reference');
        if (!buyerId) missingFields.push('buyerId');
        if (!sellerId) missingFields.push('sellerId');
        if (amountPaid == null) missingFields.push('amountPaid');
        if (!transactionDate) missingFields.push('transactionDate');
        if (!buyerName) missingFields.push('buyerName');
        if (!email) missingFields.push('email');
        if (!productDescription) missingFields.push('productDescription');
        if (!receiptImageUrl) missingFields.push('receiptImageUrl');

        if (missingFields.length > 0) {
            console.error('Missing required fields:', missingFields, req.body);
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`,
                missing: missingFields
            });
        }

        const transaction = await Transaction.findOne({ paymentReference: reference });
        if (!transaction) {
            console.error('Transaction not found for paymentReference:', reference);
            return res.status(400).json({ success: false, message: 'Invalid transaction reference' });
        }

        const message = new Message({
            senderId: buyerId,
            receiverId: sellerId,
            messageType: 'image',
            attachment: { url: receiptImageUrl },
            text: `Receipt for ${productDescription}`,
            status: 'sent',
            timestamp: new Date()
        });

        await message.save();
        console.log('Sending message', message)
        io.to(`user_${sellerId}`).emit('receiveMessage', message.toObject());
        await sendFCMNotification(
            sellerId,
            'New Receipt',
            `${buyerName} shared a receipt for ${productDescription}`,
            { type: 'message', senderId: buyerId, receiptImageUrl }
        );

        res.json({ success: true, message: 'Receipt shared successfully' });
    } catch (error) {
        console.error('Error sharing receipt:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// Serve PDF receipts
app.use('/receipts', express.static(path.join(__dirname, 'receipts')));


 
app.get('/messages', async (req, res) => {
  const senderId = req.query.user1; // Get senderId from query parameter
  const receiverId = req.query.user2; // Get receiverId from query parameter

  if (!senderId || !receiverId) {
    return res.status(400).json({ error: 'Missing senderId or receiverId' });
  }

  // Check if IDs are valid MongoDB ObjectIds
  if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
    return res.status(400).json({ error: 'Invalid senderId or receiverId format' });
  }

  try {
    const userId1 = new mongoose.Types.ObjectId(senderId);
    const userId2 = new mongoose.Types.ObjectId(receiverId);
    const messages = await Message.find({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
    }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


//get messages
app.get("/api/messages", async (req, res) => {
  const { userId } = req.query;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }

  const userIdObjectId = new mongoose.Types.ObjectId(userId);

  try {
    const latestMessages = await Message.aggregate([
      {
        $match: {
          $or: [{ senderId: userIdObjectId }, { receiverId: userIdObjectId }],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $lt: ["$senderId", "$receiverId"] },
              { senderId: "$senderId", receiverId: "$receiverId" },
              { senderId: "$receiverId", receiverId: "$senderId" },
            ],
          },
          latestMessage: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latestMessage" } },
    ]);

    const systemMessageTypes = [
      'bargainStart',
      'end-bargain',
      'buyerAccept',
      'sellerAccept',
      'sellerDecline',
      'buyerDeclineResponse',
      'offer',
      'counter-offer',
    ];

    const populatedMessages = await Promise.all(
      latestMessages.map(async (msg) => {
        const sender = await User.findById(msg.senderId);
        const receiver = await User.findById(msg.receiverId);

        const chatPartner =
          msg.senderId.toString() === userId ? receiver : sender;

        const isSystem = systemMessageTypes.includes(msg.messageType);

        let messageText = msg.text || '';
        if (isSystem && (!messageText || messageText.trim() === '')) {
          switch (msg.messageType) {
            case 'bargainStart':
              messageText = 'Bargain started';
              break;
            case 'end-bargain':
              messageText =
                msg.bargainStatus === 'accepted'
                  ? 'Bargain ended - Accepted'
                  : msg.bargainStatus === 'declined'
                  ? 'Bargain ended - Declined'
                  : 'Bargain ended';
              break;
            case 'buyerAccept':
              messageText = 'Buyer accepted the offer';
              break;
            case 'sellerAccept':
              messageText = 'Seller accepted the offer';
              break;
            case 'sellerDecline':
              messageText = 'Seller declined the offer';
              break;
            case 'buyerDeclineResponse':
              messageText = 'Buyer declined the offer';
              break;
            case 'offer':
              messageText = 'New offer made';
              break;
            case 'counter-offer':
              messageText = 'Counter-offer made';
              break;
            default:
              messageText = 'System notification';
          }
        } else if (messageText.startsWith('{')) {
          // Parse JSON-formatted text to extract the actual message
          try {
            const parsed = JSON.parse(messageText);
            messageText = parsed.text || parsed.content || parsed.productId || 'No message';
          } catch (e) {
            // If parsing fails, use the raw text
            messageText = messageText.substring(messageText.indexOf('}') + 1).trim() || 'No message';
          }
        }

        return {
          _id: msg._id,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          chatPartnerId: chatPartner?._id || null,
          chatPartnerName: chatPartner
            ? `${chatPartner.firstName} ${chatPartner.lastName}`
            : isSystem
            ? 'System'
            : 'Unknown',
          chatPartnerProfilePicture: chatPartner?.profilePicture || 'default.jpg',
          text: messageText,
          status: msg.status,
          isSystem,
          messageType: msg.messageType,
          createdAt: msg.createdAt.toISOString(),
        };
      })
    );

    res.status(200).json(populatedMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages", details: error.message });
  }
});


// Fetch notifications for the logged-in user
app.get('/notifications', verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log('Fetching notifications for user:', userId);

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const notifications = await Notification.find({ userId })
            .populate('senderId', 'firstName lastName profilePicture') // Get the sender's name and profile picture
            .sort({ createdAt: -1 });

        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


// DELETE post route 
app.delete('/post/delete/:postId', verifyToken, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.userId;

        console.log('DELETE request received');
        console.log('Post ID:', postId);
        console.log('User ID from token:', userId);

        const post = await Post.findById(postId);
        if (!post) {
            console.log('Post not found');
            return res.status(404).json({ message: 'Post not found' });
        }

        console.log('Post found:', post);
        console.log('Post createdBy.userId:', post.createdBy.userId.toString());

        if (post.createdBy.userId.toString() !== userId) {
            console.log('Not authorized to delete this post');
            return res.status(403).json({ message: 'Not authorized' });
        }

        await Post.findByIdAndDelete(postId);
        console.log('Post deleted successfully');
        res.json({ success: true, message: 'Post deleted' });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


const confirmDelivery = async (req, res) => {
  const { escrowId } = req.body;
  const buyerId = req.user.userId; 

  try {
    const escrow = await Escrow.findById(escrowId).populate('seller');

    if (!escrow) return res.status(404).json({ msg: 'Escrow not found' });
    if (!escrow.buyer.equals(buyerId)) return res.status(403).json({ msg: 'Unauthorized' });

    // Mark as Delivered
    escrow.status = 'Delivered';
    await escrow.save();

    res.json({ msg: 'Delivery confirmed. Payment will now be released.' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};



// PUT Route to Edit Post
app.put('/post/edit/:postId', verifyToken, upload.single('photo'), async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    // Find post
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    // Check if user is owner
    if (post.createdBy.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this post' });
    }

    // Update fields
    const { description, productCondition, price, location } = req.body;
    if (description) post.description = description;
    if (productCondition) post.productCondition = productCondition;
    if (price) post.price = price;
    if (location) post.location = location;

    // If new photo is uploaded
    if (req.file) {
      post.photoUrl = `http://localhost:3000/uploads/${req.file.filename}`;
    }

    await post.save();

    res.json({ success: true, message: 'Post updated successfully', post });
  } catch (error) {
    console.error('Edit post error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
app.get('/post/:postId', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    res.json({ success: true, post });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// Follow a user
// FOLLOW ROUTE (Improved to prevent duplicates)

app.post('/follow/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.userId; // Logged-in user ID
    const targetUserId = req.params.id; // User ID to follow/unfollow

    // Validate user IDs
    if (!userId || !targetUserId) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Prevent users from following themselves
    if (userId === targetUserId) {
      return res.status(400).json({ message: "You can't follow yourself." });
    }

    // Find the logged-in user and the target user
    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);

    // Check if users exist
    if (!user || !targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the logged-in user is already following the target user
    const isFollowing = user.following.includes(targetUserId);

    if (isFollowing) {
      // Unfollow the user
      user.following.pull(targetUserId); // Remove targetUserId from the logged-in user's following list
      targetUser.followers.pull(userId); // Remove userId from the target user's followers list
    } else {
      // Follow the user
      user.following.push(targetUserId); // Add targetUserId to the logged-in user's following list
      targetUser.followers.push(userId); // Add userId to the target user's followers list
    }

    // Save changes to both users
    await user.save();
    await targetUser.save();

    // Send the updated follow status back to the client
    res.status(200).json({
      success: true,
      message: isFollowing ? 'User unfollowed successfully' : 'User followed successfully',
      isFollowing: !isFollowing, // Toggle the follow status
    });
  } catch (err) {
    console.error('Error in follow route:', err.message);
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
});

// Unfollow a user
app.post('/unfollow/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.body.userId;
        const targetUserId = req.params.id;

        const user = await User.findById(userId);
        const targetUser = await User.findById(targetUserId);

        if (!user || !targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.following = user.following.filter(id => id.toString() !== targetUserId);
        targetUser.followers = targetUser.followers.filter(id => id.toString() !== userId);

        await user.save();
        await targetUser.save();

        res.status(200).json({ message: 'User unfollowed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('followers');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      followersCount: user.followers?.length || 0,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicture: user.profilePicture,
      productsCount: 0 // replace with actual product count later
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});
// Backend route to check if the logged-in user is following another user
app.get('/api/is-following/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params; // User ID to check
        const loggedInUserId = req.user.userId; // Logged-in user ID from JWT

        // Find the logged-in user
        const loggedInUser = await User.findById(loggedInUserId);

        if (!loggedInUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if the logged-in user is following the target user
        const isFollowing = loggedInUser.following.includes(userId);

        res.json({ isFollowing });
    } catch (error) {
        console.error('Error checking follow status:', error);
        res.status(500).json({ message: 'Server error' });
    }
});




app.post('/release-payment', async (req, res) => {
  const { escrowId } = req.body;

  if (!escrowId) {
    return res.status(400).json({ success: false, message: "Escrow ID is required" });
  }

  try {
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      return res.status(404).json({ success: false, message: "Escrow record not found" });
    }

    if (escrow.status !== 'In Escrow') {
      return res.status(400).json({ success: false, message: "Funds already released or refunded." });
    }

    const seller = await User.findById(escrow.sellerId);
    if (!seller || !seller.paystackRecipientCode) {
      return res.status(400).json({ success: false, message: "Seller or recipient code not found." });
    }

    const transferPayload = {
      source: "balance",
      amount: Math.floor(escrow.sellerShare * 100), // Paystack uses kobo
      recipient: seller.paystackRecipientCode,
      reason: `Payment for product sale (Post ID: ${escrow.postId})`
    };

    const response = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transferPayload)
    });

    const result = await response.json();
    console.log("Paystack Transfer Response:", result);

    if (!result.status) {
      return res.status(500).json({ success: false, message: "Transfer failed", error: result.message });
    }

    // Mark escrow as Released
    escrow.status = 'Released';
    await escrow.save();

    res.status(200).json({ success: true, message: "Funds released to seller successfully", transfer: result.data });
  } catch (error) {
    console.error("Error releasing payment:", error);
    res.status(500).json({ success: false, message: "Server error during payment release" });
  }
});



app.post('/create-recipient', async (req, res) => {
  const { sellerId, account_number, bank_code } = req.body;

  if (!sellerId || !account_number || !bank_code) {
    return res.status(400).json({ success: false, message: 'Missing required fields: sellerId, account_number, bank_code' });
  }

  try {
    const seller = await User.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const payload = {
      type: "nuban",
      name: `${seller.firstName} ${seller.lastName}`,
      account_number,
      bank_code,
      currency: "NGN"
    };

    const response = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log("Paystack Create Recipient Response:", result);

    if (!result.status) {
      return res.status(500).json({ success: false, message: 'Failed to create recipient', error: result.message });
    }

    // Save recipient_code to seller profile
    seller.paystackRecipientCode = result.data.recipient_code;
    await seller.save();

    res.status(200).json({
      success: true,
      message: 'Recipient created and linked to seller successfully',
      recipient_code: result.data.recipient_code
    });
  } catch (error) {
    console.error('Error creating recipient:', error);
    res.status(500).json({ success: false, message: 'Server error creating recipient' });
  }
});




app.get('/banks', async (req, res) => {
  try {
    const response = await fetch('https://api.paystack.co/bank?currency=NGN', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    if (!result.status) {
      return res.status(500).json({ success: false, message: 'Failed to fetch banks', error: result.message });
    }

    res.status(200).json({
      success: true,
      banks: result.data // Contains array of banks with name, code, slug
    });
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ success: false, message: 'Server error fetching banks' });
  }
});


app.get('/verify-account', async (req, res) => {
  const { account_number, bank_code } = req.query;

  if (!account_number || !bank_code) {
    return res.status(400).json({ success: false, message: 'Account number and bank code are required' });
  }

  try {
    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const result = await response.json();
    if (!result.status) {
      return res.status(400).json({ success: false, message: result.message || 'Invalid account details' });
    }

    res.status(200).json({
      success: true,
      account_name: result.data.account_name,
      account_number: result.data.account_number,
      bank_code: bank_code
    });
  } catch (error) {
    console.error('Error verifying account:', error.message);
    res.status(500).json({ success: false, message: 'Server error verifying account' });
  }
});



app.post('/create-transfer-recipient', async (req, res) => {
  const { name, account_number, bank_code } = req.body;

  if (!name || !account_number || !bank_code) {
    return res.status(400).json({ success: false, message: 'Name, account number and bank code are required' });
  }

  try {
    const response = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'nuban',
        name,
        account_number,
        bank_code,
        currency: 'NGN'
      })
    });

    const result = await response.json();
    if (!result.status) {
      return res.status(400).json({ success: false, message: result.message || 'Failed to create recipient' });
    }

    // You can save result.data.recipient_code to your database (in Seller or User model)
    res.status(200).json({
      success: true,
      message: 'Recipient created successfully',
      recipient_code: result.data.recipient_code,
      recipient_details: result.data
    });
  } catch (error) {
    console.error('Error creating transfer recipient:', error.message);
    res.status(500).json({ success: false, message: 'Server error creating recipient' });
  }
});



app.post('/release-escrow', async (req, res) => {
  const { postId } = req.body;

  if (!postId) {
    return res.status(400).json({ success: false, message: 'postId is required' });
  }

  try {
    const escrow = await Escrow.findOne({ postId });

    if (!escrow || escrow.status !== 'In Escrow') {
      return res.status(404).json({ success: false, message: 'Escrow not found or already released' });
    }

    const seller = await User.findById(escrow.sellerId);
    if (!seller || !seller.transferRecipientCode) {
      return res.status(400).json({ success: false, message: 'Seller recipient code not available' });
    }

    const amountToTransfer = Math.floor(escrow.sellerShare * 100); // Convert to kobo and round down

    // Create Paystack Transfer
    const response = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: 'balance',
        amount: amountToTransfer,
        recipient: seller.transferRecipientCode,
        reason: `Payout for post: ${postId}`
      })
    });

    const result = await response.json();

    if (!result.status) {
      return res.status(400).json({ success: false, message: result.message || 'Transfer failed' });
    }

    // ✅ Update Escrow Record
    escrow.status = 'Released';
    escrow.transferReference = result.data.transfer_code;
    await escrow.save();

    // ✅ Update Post status
    await Post.findByIdAndUpdate(postId, { isSold: true });

    res.status(200).json({ success: true, message: 'Escrow released successfully', data: result.data });
  } catch (error) {
    console.error('Error releasing escrow:', error.message);
    res.status(500).json({ success: false, message: 'Server error releasing escrow' });
  }
});

// GET transactions for a buyer
app.get('/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find({ buyerId: req.user.userId })
      .populate('productId')
      .populate('sellerId');

    res.json({ success: true, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});



app.post('/verify-payment', async (req, res) => {
  const { reference, productId } = req.body;
  const buyerId = req.useruserId; // from session or JWT

  try {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${paystackSecretKey}` },
    });

    const payment = response.data.data;

    if (payment.status === 'success') {
      const post = await Post.findById(productId);
      const sellerId = post.userId;

      await Transaction.create({
        buyerId,
        sellerId,
        productId,
        amount: payment.amount / 100,
        status: 'pending',
        viewed: false,
        createdAt: new Date(),
      });

      return res.redirect('/transactions');
    } else {
      return res.status(400).send('Payment verification failed.');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});



//get transactions
app.get('/get-transactions/:userId', async (req, res) => {
  try { 
    const userId = req.params.userId;

    const transactions = await Transaction.find({
      $or: [{ buyerId: userId }, { sellerId: userId }]
    })
    .populate('buyerId sellerId productId');
    

    res.json(transactions); // ✅ return plain array
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});
 

  

// Confirm delivery and release payment to seller
app.post('/confirm-delivery/:transactionId', verifyToken, async (req, res) => {
  const transactionId = req.params.transactionId;
  console.log('\n[CONFIRM DELIVERY INITIATED] Transaction ID:', transactionId);

  try {
    // Fetch transaction and populate buyer, seller, product
    const transaction = await Transaction.findById(transactionId).populate('buyerId sellerId productId');

    if (!transaction) {
      console.log('[ERROR] Transaction not found');
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Extract seller object and validate bank details
    const seller = transaction.sellerId;
    if (!seller.bankDetails || !seller.bankDetails.accountNumber || !seller.bankDetails.bankCode) {
      console.warn('[BANK DETAILS MISSING OR INVALID]');
      return res.status(400).json({
        error: "Seller has not added valid bank details. Payment cannot be processed until seller updates their account."
      });
    }

    // === Check or create Paystack recipient ===
    let recipientCode = seller.paystackRecipientCode;
    if (!recipientCode) {
      const recipientPayload = {
        type: 'nuban',
        name: `${seller.firstName} ${seller.lastName}`,
        account_number: seller.bankDetails.accountNumber,
        bank_code: seller.bankDetails.bankCode,
        currency: 'NGN'
      };

      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        recipientPayload,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );

      recipientCode = recipientResponse.data.data.recipient_code;
      seller.paystackRecipientCode = recipientCode;
      await seller.save();
    }

    // === Calculate amount to transfer ===
    const productPrice = transaction.productId?.price || 0;
    const commissionPercent = 2.5;
    const commission = Math.floor((commissionPercent / 100) * productPrice);
    const amountToTransfer = productPrice - commission;

    // === Initiate Transfer ===
    const transferPayload = {
      source: 'balance',
      amount: amountToTransfer * 100,
      recipient: recipientCode,
      reason: `Payment for product: ${transaction.productId?.description}`
    };

    const transferResponse = await axios.post(
      'https://api.paystack.co/transfer',
      transferPayload,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    console.log('[TRANSFER INITIATED]', transferResponse.data);
    const transferStatus = transferResponse.data.data.status;

    // === OTP Required Handling ===
    if (transferStatus === 'otp') {
      transaction.transferReference = transferResponse.data.data.transfer_code;
      transaction.otpRequired = true;
      await transaction.save();

      console.log('[OTP REQUIRED FOR TRANSFER] Transfer Code:', transaction.transferReference);

      return res.status(200).json({
        message: "OTP is required to complete the transfer. Please enter the OTP to proceed.",
        otpRequired: true,
        transferReference: transaction.transferReference
      });
    }

    // === Transfer Successful, update transaction ===
    transaction.status = 'released';
    await transaction.save();

    console.log('[TRANSACTION STATUS UPDATED TO "released"]');

    return res.status(200).json({
      message: "Delivery confirmed. Payment released to seller.",
      transferReference: transferResponse.data.data.reference,
      amountTransferred: amountToTransfer
    });

  } catch (err) {
    console.error('[CONFIRM DELIVERY SERVER ERROR]', err);
    return res.status(500).json({ error: "Something went wrong.", details: err.message || 'Unknown error' });
  }
});

// Confirm OTP for Transfer
app.post('/confirm-otp', verifyToken, async (req, res) => {
  const { transactionId, otp } = req.body;
  console.log(`[OTP SUBMISSION] TransactionID: ${transactionId}, OTP: ${otp}`);

  try {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      console.error('[ERROR] Transaction not found');
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (!transaction.otpRequired || !transaction.transferReference) {
      console.error('[ERROR] OTP not required or transfer reference missing', {
        otpRequired: transaction.otpRequired,
        transferReference: transaction.transferReference
      });
      return res.status(400).json({ error: "OTP is not required for this transaction." });
    }

    const otpPayload = {
      transfer_code: transaction.transferReference,
      otp
    };

    console.log('[OTP PAYLOAD SENT TO PAYSTACK]', otpPayload);

    const otpResponse = await axios.post(
      'https://api.paystack.co/transfer/finalize_transfer',
      otpPayload,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    console.log('[PAYSTACK OTP RESPONSE]', otpResponse.data);

    if (otpResponse.data.status === true) {
      transaction.status = 'released';
      transaction.otpRequired = false;
      await transaction.save();

      console.log('[TRANSFER COMPLETED WITH OTP]');
      return res.status(200).json({ message: "Transfer completed successfully." });
    } else {
      console.error('[OTP VALIDATION FAILED]', otpResponse.data.message);
      return res.status(400).json({ error: otpResponse.data.message || "Invalid OTP. Please try again." });
    }

  } catch (err) {
    if (err.response) {
      // Paystack responded with an error
      console.error('[PAYSTACK ERROR]', err.response.data);
      return res.status(400).json({ error: err.response.data.message || "OTP confirmation failed." });
    } else {
      // Unexpected server error
      console.error('[OTP CONFIRMATION ERROR]', err.message);
      return res.status(500).json({ error: "Something went wrong during OTP confirmation." });
    }
  }
});


// Update Bank Details Route
const axios = require('axios')
app.post('/update-bank-details', verifyToken, async (req, res) => {
  console.log('--- /update-bank-details endpoint hit ---');

  // Log full request body
  console.log('Request body:', req.body);

  // Log the user ID from the token
  const userId = req.user?.userId;
  console.log('User ID from token:', userId);

  const { accountNumber, bankCode, bankName } = req.body;

  // Check if request is missing values
  if (!accountNumber || !bankCode || !bankName) {
    console.log('Missing fields:', { accountNumber, bankCode, bankName });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    console.log('Sending account resolve request to Paystack...');
    const response = await axios.get(`https://api.paystack.co/bank/resolve`, {
      params: {
        account_number: accountNumber,
        bank_code: bankCode
      },
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    });

    const accountName = response.data.data.account_name;
    console.log('Account resolved:', accountName);

    // Update user record
    console.log('Updating user bank details...');
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        bankDetails: {
          accountNumber,
          bankCode,
          bankName,
          accountName
        }
      },
      { new: true }
    );

    console.log('Bank details updated in DB:', updatedUser.bankDetails);
    res.status(200).json({ message: 'Bank details updated successfully', bankDetails: updatedUser.bankDetails });

  } catch (error) {
    console.error('Error occurred while updating bank details');
    console.error('Error message:', error.message);
    console.error('Full error object:', error.response?.data || error);

    res.status(500).json({
      message: 'Failed to update bank details',
      error: error.response?.data || error.message
    });
  }
});



// Route to get bank details
app.get('/get-bank-details', verifyToken, async (req, res) => {
  console.log('--- /get-bank-details endpoint hit ---');

  // Extract user ID from the token
  const userId = req.user?.userId;
  console.log('User ID from token:', userId);

  try {
    // Find the user by ID and select only the bankDetails field
    const user = await User.findById(userId).select('bankDetails');

    if (!user) {
      console.log('User not found');
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if bankDetails exists
    if (!user.bankDetails) {
      console.log('Bank details not found for user');
      return res.status(404).json({ message: 'Bank details not found' });
    }

    console.log('Bank details fetched successfully:', user.bankDetails);
    res.status(200).json({ success: true, bankDetails: user.bankDetails });

  } catch (error) {
    console.error('Error occurred while fetching bank details');
    console.error('Error message:', error.message);
    console.error('Full error object:', error);

    res.status(500).json({
      message: 'Failed to fetch bank details',
      error: error.message
    });
  }
});

// Request Refund Endpoint
app.post('/request-refund/:transactionId', verifyToken, async (req, res) => {
  console.log('REQUEST REFUND ENDPOINT HIT');
  const userId = req.user.userId;
  const { transactionId } = req.params;
  const { reason, evidence } = req.body;

  try {
    const transaction = await Transaction.findById(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.buyerId.toString() !== userId) {
      return res.status(403).json({ error: 'You are not authorized to request a refund for this transaction' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ error: 'Refund not applicable. Transaction already completed.' });
    }

    // Check if refund already exists for this transaction
    const existingRefund = await RefundRequests.findOne({ transactionId });
    if (existingRefund) {
      return res.status(400).json({ error: 'Refund has already been requested for this transaction.' });
    }

    // Create new refund document
    const refund = new RefundRequests({
      transactionId,
      buyerId: userId,
      reason,
      evidence,
      status: 'pending', // default status
    });

    await refund.save();

    // Optionally mark the transaction as having a refund requested
    transaction.refundRequested = true;
    await transaction.save();

    res.status(200).json({ message: 'Refund requested successfully.' });

  } catch (err) {
    console.error('Error requesting refund:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get All Refund Requests (Admin)
app.get('/api/admin/refunds', async (req, res) => {
  try {
    const refunds = await RefundRequests.find()
      .populate({ path: 'buyerId', select: 'firstName lastName' })
      .populate({ path: 'sellerId', select: 'firstName lastName' })
      .populate({ path: 'transactionId', select: 'amount description date' })
      .populate({ path: 'description', select: 'description'})
      .select('buyerId sellerId transactionId reason evidence status adminComment createdAt updatedAt');

    const formattedRefunds = refunds.map(refund => ({
      ...refund.toObject(),
      buyerName: `${refund.buyerId?.firstName || ''} ${refund.buyerId?.lastName || ''}`,
      sellerName: `${refund.sellerId?.firstName || ''} ${refund.sellerId?.lastName || ''}`
    }));

    res.status(200).json(formattedRefunds);
  } catch (err) {
    console.error('Error fetching refunds:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
// Get All Users (Admin)
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('firstName lastName email profilePicture createdAt isBanned')
      .sort({ createdAt: -1 });

    const formattedUsers = users.map(user => ({
      ...user.toObject(),
      fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A'
    }));

    res.status(200).json(formattedUsers);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
// Ban a User (Admin)
app.post('/api/admin/users/:id/ban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.isBanned) {
      return res.status(400).json({ success: false, message: 'User is already banned' });
    }
    user.isBanned = true;
    await user.save();
    res.status(200).json({ success: true, message: 'User banned successfully' });
  } catch (err) {
    console.error('Error banning user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// Get All Banned Users (Admin)
app.get('/api/admin/users/banned', async (req, res) => {
  try {
    const bannedUsers = await User.find({ isBanned: true })
      .select('firstName lastName email profilePicture createdAt isBanned')
      .sort({ createdAt: -1 });

    const formattedUsers = bannedUsers.map(user => ({
      ...user.toObject(),
      fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A'
    }));

    res.status(200).json(formattedUsers);
  } catch (err) {
    console.error('Error fetching banned users:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unban a User (Admin)
app.post('/api/admin/users/:id/unban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (!user.isBanned) {
      return res.status(400).json({ success: false, message: 'User is not banned' });
    }
    user.isBanned = false;
    await user.save();
    res.status(200).json({ success: true, message: 'User unbanned successfully' });
  } catch (err) {
    console.error('Error unbanning user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// Get All Transactions (Admin)
app.get('/api/admin/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate({ path: 'buyerId', select: 'firstName lastName email' })
      .populate({ path: 'sellerId', select: 'firstName lastName email' })
      .populate({ path: 'productId', select: 'description' })
      .select('buyerId sellerId productId amount status createdAt refundRequested refundReason paymentReference')
      .sort({ createdAt: -1 });

    const formattedTransactions = transactions.map(tx => ({
      ...tx.toObject(),
      buyerName: `${tx.buyerId?.firstName || ''} ${tx.buyerId?.lastName || ''}`,
      sellerName: `${tx.sellerId?.firstName || ''} ${tx.sellerId?.lastName || ''}`,
      productTitle: tx.productId?.description || 'N/A'
    }));

    res.status(200).json(formattedTransactions);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
// Resolve Refund (Approve or Deny)
app.post('/api/admin/refunds/:id/:action', async (req, res) => {
  const { id, action } = req.params;

  try {
    const transaction = await Transaction.findById(id);
    if (!transaction || !transaction.refundRequested) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    if (action === 'approve') {
      transaction.status = 'refunded'; // or your appropriate status
      transaction.refundRequested = false;
    } else if (action === 'deny') {
      transaction.refundRequested = false;
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "approve" or "deny".' });
    }

    await transaction.save();
    res.status(200).json({ message: `Refund ${action}d successfully.` });
  } catch (err) {
    console.error('Error resolving refund:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
// routes/searchRoute.js

app.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchQuery = new RegExp(q, 'i'); // case-insensitive regex

    // Search Users
    const users = await User.find({
      $or: [
        { firstName: searchQuery },
        { lastName: searchQuery },
        { email: searchQuery }
      ]
    }).select('firstName lastName email profilePicture');

    // Search Posts
    const posts = await Post.find({
      $or: [
        { description: searchQuery },
        { location: searchQuery },
        { productCondition: searchQuery }
      ]
    }).populate('createdBy.userId', 'firstName lastName profilePicture');

    res.status(200).json({ users, posts });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while searching' });
  }
});
//get products
app.get('/products', verifyToken, async (req, res) => {
  try {
    const { sellerId } = req.query;
    const query = {
      price: { $exists: true, $ne: "" },
      productCondition: { $exists: true, $ne: "" },
      location: { $exists: true, $ne: "" },
      isSold: false
    };
    if (sellerId) {
      query['createdBy.userId'] = sellerId;
    }
    console.log('Fetching products with query:', query);
    const products = await Post.find(query)
      .sort({ createdAt: -1 })
      .populate('createdBy.userId', 'firstName lastName profilePicture');
    console.log('Found products:', products.length);
    res.status(200).json(products);
  } catch (err) {
    console.error('Error fetching products:', err.message, err.stack);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

//Update price
app.put('/posts/:postId/update-price', verifyToken, async (req, res) => {
  const { postId } = req.params;
  const { newPrice } = req.body;

  // Log the postId for debugging
  console.log('Received postId:', postId);

  // Validate postId
  if (!postId || postId === 'undefined') {
    return res.status(400).json({ message: 'Post ID is required' });
  }
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    return res.status(400).json({ message: 'Invalid Post ID format' });
  }

  // Validate newPrice
  if (newPrice === undefined || isNaN(newPrice) || newPrice < 0) {
    return res.status(400).json({ message: 'Invalid or missing price' });
  }

  try {
    // Find and update the post
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Update the price
    post.price = newPrice;
    await post.save();

    res.status(200).json({ message: 'Price updated successfully', post });
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ message: 'Failed to update price', error: error.message });
  }
});
// resolve Account
app.get('/banks/register', async (req, res) => {
  try {
    const response = await fetch('https://api.paystack.co/bank', {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });
    const data = await response.json();
    res.json(data.data);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching banks' });
  }
});
// POST /resolve-account
app.post('/resolve-account', async (req, res) => {
  const { account_number, bank_code } = req.body;
  try {
    const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    });
    const data = await response.json();
    if (data.status) {
      res.json({ account_name: data.data.account_name });
    } else {
      res.status(400).json({ message: 'Unable to resolve account' });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
});

//Register admin


const SECRET_ADMIN_CODE = process.env.SECRET_ADMIN_CODE; 

// Admin Registration Route
app.post("/admin/register", async (req, res) => {
  try {
    const { name, email, password, adminCode } = req.body;

    // Check if the secret admin code is correct
    if (adminCode !== SECRET_ADMIN_CODE) {
      return res.status(403).json({ message: "Invalid admin code" });
    }

    // Check if admin already exists
    let admin = await Admin.findOne({ email });
    if (admin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    // Hash password and save admin
    const hashedPassword = await bcrypt.hash(password, 10);
    admin = new Admin({ name, email, password: hashedPassword });

    await admin.save();
    res.status(201).json({ message: "Admin registered successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});



// Admin Login Route
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if admin exists
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate JWT Token
    const token = jwt.sign({ adminId: admin._id }, 'ghgh6rrjrfhteldwb', { expiresIn: '1w' });

    res.status(200).json({ token, message: "Login successful" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});




// Get Admin Details (Protected Route)
app.get("/admin/me", verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select("-password");
    if (!admin) return res.status(404).json({ message: "Admin not found." });

    res.json(admin);
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

// Add this to your backend routes
app.get('/check-payment-status', async (req, res) => {
  try {
    const { productId, buyerId } = req.query;
    
    // Check if transaction exists and is successful
    const transaction = await Transaction.findOne({
      productId,
      buyerId,
      status: 'completed' // or whatever your success status is
    });

    // Alternatively, check escrow status
    const escrow = await Escrow.findOne({
      product: productId,
      buyer: buyerId,
      status: 'Released' // or whatever your success status is
    });

    res.json({
      paymentCompleted: !!transaction || !!escrow
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ error: 'Error checking payment status' });
  }
});

app.get('/', (req, res) => {
    res.send('Salmart API is running');
});

// Report User Endpoint
app.post('/users/report', verifyToken, async (req, res) => {
  try {
    const { reportedUserId, reason } = req.body;
    const reporterId = req.user.userId; // From the verified token

    // Validate input
    if (!reportedUserId || !reason) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Check if user is reporting themselves
    if (reportedUserId === reporterId) {
      return res.status(400).json({ success: false, message: 'You cannot report yourself' });
    }

    // Check if the report already exists
    const existingReport = await Report.findOne({
      reportedUser: reportedUserId,
      reportedBy: reporterId
    });

    if (existingReport) {
      return res.status(400).json({ success: false, message: 'You have already reported this user' });
    }

    // Create new report
    const report = new Report({
      reportedUser: reportedUserId,
      reportedBy: reporterId,
      reason: reason,
      status: 'pending'
    });

    await report.save();

    // Update the reported user's record
    await User.findByIdAndUpdate(reportedUserId, { 
      $inc: { reportCount: 1 },
      $set: { isReported: true }
    });

    res.status(201).json({ 
      success: true, 
      message: 'User reported successfully',
      report
    });

  } catch (error) {
    console.error('Error reporting user:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// GET /admin/reported-users
app.get('/api/reported-users', async (req, res) => {
  try {
    // Get reports with user details
    const reports = await Report.find({ status: 'pending' })
      .populate('reportedUser', 'firstName lastName email profilePicture createdAt')
      .populate('reportedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Format response
    const formatted = reports.map(report => ({
      reportedUser: report.reportedUser,
      reportedBy: report.reportedBy,
      reason: report.reason,
      createdAt: report.createdAt,
      report
    }));

    res.status(200).json({
      success: true,
      reports: formatted
    });

  } catch (error) {
    console.error('Error fetching reported users:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Block User Endpoint
app.post('/users/block', verifyToken, async (req, res) => {
  try {
    const { userIdToBlock } = req.body;
    const blockerId = req.user.userId; // From the verified token

    // Validate input
    if (!userIdToBlock) {
      return res.status(400).json({ success: false, message: 'User ID to block is required' });
    }

    // Check if user is blocking themselves
    if (userIdToBlock === blockerId) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }

    // Check if already blocked
    const user = await User.findById(blockerId);
    if (user.blockedUsers.includes(userIdToBlock)) {
      return res.status(400).json({ success: false, message: 'User is already blocked' });
    }

    // Add to blocked users list
    user.blockedUsers.push(userIdToBlock);
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: 'User blocked successfully',
      blockedUsers: user.blockedUsers
    });

  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get Reported Users (Admin Only)
app.get('/admin/reported-users',  async (req, res) => {
  try {

    // Get all reports with populated user data
    const reportedUsers = await Report.find({ status: 'pending' })
      .populate('reportedUser', 'firstName lastName email profilePicture reportCount')
      .populate('reportedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json({ 
      success: true, 
      reportedUsers 
    });

  } catch (error) {
    console.error('Error fetching reported users:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin Resolve Report
app.post('/admin/resolve-report', verifyToken, async (req, res) => {
  try {
    const { reportId, action } = req.body; // action: 'warn' or 'ban'
    const adminId = req.user.userId;

    // Check if user is admin
    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Admin access required' });
    }

    // Find the report
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    // Update report status
    report.status = 'resolved';
    report.resolvedBy = adminId;
    report.resolution = action;
    await report.save();

    // Take action based on resolution
    const reportedUser = await User.findById(report.reportedUser);
    if (action === 'warn') {
      // Send warning notification
      const notification = new Notification({
        userId: report.reportedUser,
        type: 'warning',
        message: 'You have received a warning for violating community guidelines',
        createdAt: new Date()
      });
      await notification.save();
    } 
    else if (action === 'ban') {
      // Ban the user
      reportedUser.isBanned = true;
      await reportedUser.save();
    }

    res.status(200).json({ 
      success: true, 
      message: `Report resolved with action: ${action}`,
      report
    });

  } catch (error) {
    console.error('Error resolving report:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
 
//Push Notifications
const admin = require('firebase-admin');


// Initialize Firebase Admin SDK

const firebaseKey = Buffer.from(process.env.FIREBASE_ADMIN_KEY_BASE64, 'base64').toString('utf8');
const serviceAccount = JSON.parse(firebaseKey);

// Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://salmart-330ab.firebaseio.com' // Replace with your URL
});
async function sendFCMNotification(userId, title, body, data = {}) {
  try {
    const user = await User.findById(userId);
    const token = user?.fcmToken;
    if (!token) {
      console.log(`No FCM token for user ${userId}`);
      return;
    }
    // Check notification preference
    if (data.type && !user.notificationPreferences[data.type]) {
      console.log(`User ${userId} has disabled ${data.type} notifications`);
      return;
    }
    const message = {
      token,
      notification: { title, body },
      data: { ...data, userId: userId.toString() },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          icon: 'https://salmart.vercel.app/favicon.ico',
          requireInteraction: true,
        },
      },
    };
    await admin.messaging().send(message);
    console.log(`FCM notification sent to user ${userId}: ${title}`);
  } catch (err) {
    console.error(`Error sending FCM notification to user ${userId}:`, err);
    if (err.code === 'messaging/registration-token-not-registered') {
      await User.findByIdAndUpdate(userId, { fcmToken: null, notificationEnabled: false });
      console.log(`Removed invalid FCM token for user ${userId}`);
    }
  }
}
//notification-preferences
app.patch('/user/notification-preferences', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const preferences = req.body; // e.g., { likes: false, comments: true }
    await User.findByIdAndUpdate(userId, { notificationPreferences: preferences });
    res.json({ success: true, message: 'Notification preferences updated' });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
    
app.post('/api/save-fcm-token', verifyToken, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.userId;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Save token to MongoDB
    await User.findByIdAndUpdate(userId, { 
      fcmToken: token, 
      notificationEnabled: true 
    });

    res.json({ success: true });
    
  } catch (error) {
    console.error('Error saving FCM token:', error);
    res.status(500).json({ error: 'Failed to save token' });
  }
});
app.post('/send-notification', async (req, res) => {
  const { userId, title, body } = req.body;

  console.log('Received request to send notification:', { userId, title, body });

  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error(`User with ID ${userId} not found in MongoDB.`);
      return res.status(404).send('User not found');
    }

    if (!user.fcmToken) {
      console.error(`User with ID ${userId} does not have an FCM token.`);
      return res.status(404).send('User token not found');
    }

    console.log(`Sending notification to user ${userId} with token: ${user.fcmToken}`);

    await admin.messaging().send({
      token: user.fcmToken,
      notification: { title, body },
      webpush: {
        headers: { Urgency: 'high' }
      }
    });

    console.log(`Notification successfully sent to user ${userId}.`);
    res.status(200).send('Notification sent');
  } catch (err) {
    console.error('Error sending notification:', err);
    res.status(500).send('Error sending notification');
  }
});

// Send Notification (Customize as needed)
app.post('/send-notification', async (req, res) => {
  const { userId, title, body } = req.body;

  console.log('Received request to send notification:', { userId, title, body });

  try {
    const user = await User.findById(userId);

    if (!user) {
      console.error(`User with ID ${userId} not found in MongoDB.`);
      return res.status(404).send('User not found');
    }

    if (!user.fcmToken) {
      console.error(`User with ID ${userId} does not have an FCM token.`);
      return res.status(404).send('User token not found');
    }

    console.log(`Sending notification to user ${userId} with token: ${user.fcmToken}`);

    await admin.messaging().send({
      token: user.fcmToken,
      notification: { title, body },
      webpush: {
        headers: { Urgency: 'high' }
      }
    });

    console.log(`Notification successfully sent to user ${userId}.`);
    res.status(200).send('Notification sent');
  } catch (err) {
    console.error('Error sending notification:', err);
    res.status(500).send('Error sending notification');
  }
});



app.post('/post/report/:postId', verifyToken, async (req, res) => {
    try {
        const { postId } = req.params;
        const { reason } = req.body;
        const reporterId = req.user.userId;

        // Validate input
        if (!reason || reason.trim() === '') {
            return res.status(400).json({ error: 'Reason is required' });
        }

        // Find the post and populate creator info
        const post = await Post.findById(postId).populate('createdBy', 'userId');
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // Check if user already reported this post
        const existingReport = await Report.findOne({
            reportedUser: post.createdBy.userId,
            reportedBy: reporterId,
            'relatedPost': postId
        });

        if (existingReport) {
            return res.status(400).json({ 
                error: 'You have already reported this post',
                reportId: existingReport._id
            });
        }

        // Create new report
        const newReport = new Report({
            reportedUser: post.createdBy.userId,
            reportedBy: reporterId,
            reason: reason.trim(),
            relatedPost: postId,
            status: 'pending'
        });
        console.log(reason)

        await newReport.save();

        // Also add to post's reports array for quick reference
        post.reports.push({
            reportId: newReport._id,
            reason: reason.trim(),
            reportedAt: new Date()
        });

        // Check report threshold for auto-flagging
        const reportCount = await Report.countDocuments({
            reportedUser: post.createdBy.userId,
            status: 'pending'
        });

        if (reportCount >= 3) { // Configurable threshold
            post.status = 'under_review';
            // Optionally notify admin
        }

        await post.save();

        res.json({ 
            success: true, 
            message: 'Post reported successfully',
            reportId: newReport._id
        });

    } catch (error) {
        console.error('Error reporting post:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all pending reports
app.get('/admin/reports/pending', verifyToken, async (req, res) => {
    try {
        const reports = await Report.find({ status: 'pending' })
            .populate('reportedUser', 'name email profilePicture')
            .populate('reportedBy', 'name email')
            .populate('relatedPost', 'description photo')
            .sort({ createdAt: -1 });

        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Resolve a report
app.post('/admin/reports/:reportId/resolve', verifyToken, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { action, adminNotes } = req.body;

        const report = await Report.findById(reportId);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        // Update report
        report.status = 'resolved';
        report.resolution = action;
        report.resolvedBy = req.user.userId;
        report.adminNotes = adminNotes;
        report.resolvedAt = new Date();

        // Take appropriate action
        if (action === 'ban') {
            await User.findByIdAndUpdate(report.reportedUser, { isBanned: true });
        } else if (action === 'post_removed') {
            await Post.findByIdAndUpdate(report.relatedPost, { status: 'removed' });
        }
        // Warn action might involve sending a notification

        await report.save();

        res.json({ success: true, message: `Report resolved with action: ${action}` });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});


// notification badge
app.get('/notification-counts', verifyToken, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.userId; // Fallback to token userId
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    console.log('[NOTIFICATION COUNTS] Request received from user:', userId);

    const counts = await NotificationService.getNotificationCounts(userId);

    console.log('[NOTIFICATION COUNTS] Counts retrieved:', { userId, counts });
    res.json(counts);
  } catch (error) {
    console.error('[NOTIFICATION COUNTS ERROR]', { userId: req.user.userId, error: error.message });
    res.status(500).json({ error: 'Error fetching notification counts' });
  }
});


// Notification Service Functions
const NotificationService = {
  async sendCountsToUser(userId) {
    try {
      const counts = await this.getNotificationCounts(userId);
      
        io.to(`user_${userId}`).emit('badge-update', { type: 'alerts', count: counts.alertsCount, userId });
        io.to(`user_${userId}`).emit('badge-update', { type: 'messages', count: counts.messagesCount, userId });
        io.to(`user_${userId}`).emit('badge-update', { type: 'deals', count: counts.dealsCount, userId });
        console.log(`Sent counts to user ${userId} via room user_${userId}:`, counts);
    
    } catch (error) {
      console.error('Error sending counts:', error);
    }
  },
  async getNotificationCounts(userId) {
    try {
      console.log('[GET COUNTS] Starting for user:', userId);
      
      const [alertsCount, messagesCount, dealsCount] = await Promise.all([
        Notification.countDocuments({ userId, isRead: false }),
        Message.countDocuments({ receiverId: userId, status: 'sent' }),
        Transaction.countDocuments({
          $or: [{ buyerId: userId }, { sellerId: userId }],
          status: 'pending' // Count only unviewed deals
        })
      ]);

      const counts = { alertsCount, messagesCount, dealsCount };
      console.log('[GET COUNTS] Retrieved counts:', { userId, counts });
      
      return counts;
    } catch (error) {
      console.error('[GET COUNTS ERROR]', { userId, error: error.message });
      return { alertsCount: 0, messagesCount: 0, dealsCount: 0 };
    }
  },
  async triggerCountUpdate(userId) {
    console.log('[TRIGGER UPDATE] Starting for user:', userId);
    await this.sendCountsToUser(userId);
  }
};
// Alerts
app.post('/alerts/mark-as-viewed', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );
    if (result.modifiedCount > 0) {
      
        io.to(`user_${userId}`).emit('badge-update', { type: 'alerts', count: 0, userId });
      
      await NotificationService.triggerCountUpdate(userId);
      res.json({ success: true, message: 'Alerts marked as viewed', updated: result.modifiedCount });
    } else {
      res.json({ success: true, message: 'No unread alerts to mark as viewed' });
    }
  } catch (error) {
    console.error('Error marking alerts as viewed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Messages
app.post('/messages/mark-as-viewed', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await Message.updateMany(
      { receiverId: userId, status: 'sent' },
      { $set: { status: 'seen' } } // Match Socket.IO 'markAsSeen'
    );
    if (result.modifiedCount > 0) {
      
        io.to(`user_${userId}`).emit('badge-update', { type: 'messages', count: 0, userId });
      
      await NotificationService.triggerCountUpdate(userId);
      res.json({ success: true, message: 'Messages marked as viewed', updated: result.modifiedCount });
    } else {
      res.json({ success: true, message: 'No unread messages to mark as viewed' });
    }
  } catch (error) {
    console.error('Error marking messages as viewed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Deals
app.post('/deals/mark-as-viewed', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await Transaction.updateMany(
      {
        $or: [{ buyerId: userId }, { sellerId: userId }],
        status: 'pending', // Only pending deals
        viewed: false // Only unviewed
      },
      { $set: { viewed: true } }
    );
    console.log(`[DEALS MARK AS VIEWED] Updated ${result.modifiedCount} transactions for user ${userId}`);
    if (result.modifiedCount > 0) {
      io.to(`user_${userId}`).emit('badge-update', { type: 'deals', count: await Transaction.countDocuments({ $or: [{ buyerId: userId }, { sellerId: userId }], status: 'pending' }), userId });
      await NotificationService.triggerCountUpdate(userId);
      res.json({ success: true, message: 'Deals marked as viewed', updated: result.modifiedCount });
    } else {
      res.json({ success: true, message: 'No unviewed pending deals to mark' });
    }
  } catch (error) {
    console.error('Error marking deals as viewed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('joinRoom', async (userId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) return;
    if (!socket.rooms.has(`user_${userId}`)) {
      await User.findByIdAndUpdate(userId, { socketId: socket.id }, { new: true });
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined room user_${userId}`);
      await NotificationService.sendCountsToUser(userId);
    }
  } catch (err) {
    console.log('Error in joinRoom:', err);
  }
});

  socket.on('badge-update', async ({ type, count, userId }) => {
    try {
      io.to(`user_${userId}`).emit('badge-update', { type, count, userId });
      console.log(`Broadcasted badge-update for ${type} to user ${userId}`);
      await NotificationService.sendCountsToUser(userId); // Sync full counts
    } catch (error) {
      console.error('Error broadcasting badge-update:', error);
    }
  });

  socket.on('disconnect', async () => {
    try {
      console.log('Client disconnected:', socket.id);
      await User.updateOne({ socketId: socket.id }, { socketId: null });
      console.log(`Cleared socketId ${socket.id}`);
    } catch (err) {
      console.log('Error handling disconnect:', err);
    }
  });
});