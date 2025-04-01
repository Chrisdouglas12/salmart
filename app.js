const express = require('express');
const app = express();
const multer = require('multer')
const User = require('./Schema.js');
const Post  = require('./postSchema.js')
const Profile = require('./profileSchema.js') 
const Admin = require('./adminSchema.js')
const Message = require('./messageSchema.js')
const payOutLog = require('./payOut.js')
const Escrow = require('./EscrowSchema.js') 
const Transaction = require('./Transaction.js')
const Notification = require('./notificationScript.js')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const htmlToImage = require('html-to-image')
const fs = require('fs');
const fsExtra = require('fs-extra')
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');


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
  transports: ['websockets'] //force websockets
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 

// Initialize Socket.IO
const users = {}; // Store userId -> socketId mapping

// Handle Socket.IO Connections

 
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle user joining
  socket.on('joinRoom', (userId) => {
    if (userId) {
      users[userId] = socket.id;
      console.log(`User ${userId} joined with socket ID: ${socket.id}`);
    }
  });

  // Handle sending messages
  socket.on('sendMessage', async (message) => {
    try {
      const { senderId, receiverId, text } = message;

      if (!senderId || !receiverId || !text) {
        console.error('Error: Missing senderId, receiverId, or text');
        return;
      }

      const newMessage = new Message({
        senderId: new mongoose.Types.ObjectId(senderId),
        receiverId: new mongoose.Types.ObjectId(receiverId),
        text,
        status: 'sent',
        timestamp: new Date(),
      });
      await newMessage.save();
      console.log('Message saved successfully:', newMessage);

      if (users[receiverId]) {
        io.to(users[receiverId]).emit('receiveMessage', newMessage);
      } else {
        console.log(`User ${receiverId} is offline, storing message.`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // Handle marking messages as seen
  socket.on('markAsSeen', async ({ senderId, receiverId }) => {
    try {
      if (!senderId || !receiverId) {
        console.error('Error: Missing senderId or receiverId');
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
        console.error('Invalid senderId or receiverId format:', { senderId, receiverId });
        return;
      }

      const senderObjectId = new mongoose.Types.ObjectId(senderId);
      const receiverObjectId = new mongoose.Types.ObjectId(receiverId);

      await Message.updateMany(
        {
          senderId: senderObjectId,
          receiverId: receiverObjectId,
          status: { $ne: 'seen' }
        },
        { $set: { status: 'seen' } }
      );

      if (users[senderId]) {
        io.to(users[senderId]).emit('messagesSeen', { senderId: receiverId });
      }
    } catch (error) {
      console.error('Error updating message status:', error);
    }
  });

socket.on('likePost', async ({ postId, userId }) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
            console.error("Invalid userId or postId");
            return;
        }

        const post = await Post.findById(postId).select('createdBy');
        if (!post) {
            console.error(`Post ${postId} not found`);
            return;
        }
        
 const sender = await User.findById(userId).select('firstName lastName profilePicture')
 if(!sender) {
   console.error(`User ${userId} not found`)
 }
        // Save the notification to the database
        const notification = new Notification({
            userId: post.createdBy.userId, // Notify the post owner
            type: 'like',
            senderId: userId,  // The user who liked the post
            postId,
            message: 'Someone liked your post',
        });{
          console.log(`${sender.firstName} ${sender.lastName} like your post was liked`)
        }

        await notification.save();
        

        // Emit the notification to the post owner if they are online
        if (users[post.createdBy.userId]) {
            io.to(users[post.createdBy.userId]).emit('notification', {
                type: 'like',
                postId,
                userId,
                sender:{
                  firstName: sender.firstName,
                 lastName: sender.lastName,
                 profilePicture: sender.profilePicture,
                },
                createdAt: new date()
            });
        }
    } catch (error) {
        console.error('Error handling likePost event:', error);
    }
});

// Handle comment notifications
socket.on('commentPost', async ({ postId, userId, comment }) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
            console.error("Invalid userId or postId");
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
            userId: post.createdBy, // Notify the post owner
            type: 'comment',
            senderId: userId,  // The user who commented
            postId,
            message: 'Someone commented on your post',
        });

        console.log(`${sender.firstName} ${sender.lastName} commented on your post`);

        await notification.save();

        // Emit the notification to the post owner if they are online
        if (users[post.createdBy]) {
            io.to(users[post.createdBy]).emit('notification', {
                type: 'comment',
                postId,
                userId,
                comment,
                sender: {
                    firstName: sender.firstName,
                    lastName: sender.lastName,
                    profilePicture: sender.profilePicture,
                },
                createdAt: new Date()
            });
        }

    } catch (error) {
        console.error('Error handling commentPost event:', error);
    }
});

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    const userId = Object.keys(users).find((key) => users[key] === socket.id);
    if (userId) {
      delete users[userId];
    }
    console.log('Updated users mapping', users);
  });
});






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
// MongoDB Atlas connection string
 const uri = process.env.MONGO_URI

// Connect to MongoDB using Mongoose
mongoose.connect(uri)
  .then(() => console.log("Connected to MongoDB!"))
  .catch(err => console.error("MongoDB connection error:", err));


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


// Endpoint to create a post
app.post('/post', verifyToken, upload.single('photo'), async (req, res) => {
  try {
    const { description, productCondition, location } = req.body;
    const price = Number(req.body.price);

    // Validate input
    if (!description || !productCondition || !price || !location || !req.file) {
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

    // Try to get the token from headers
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET); 
      loggedInUserId = decoded.userId;
    }

    const posts = await Post.find().sort({ createdAt: -1 });

    if (!posts || posts.length === 0) {
      return res.status(404).json({ message: 'No posts found' });
    }

    const populatedPosts = await Promise.all(posts.map(async (post) => {
      const user = await User.findById(post.createdBy.userId);

      const isFollowing = user?.followers?.includes(loggedInUserId);

      return {
        ...post._doc,
        profilePicture: user?.profilePicture || '',
        isFollowing: isFollowing || false
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
// Endpoint to upload a profile picture
app.post('/upload-profile-picture', verifyToken, upload.single('profilePicture'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Profile picture is required' });
    }

    const profilePictureUrl = `${req.protocol}://${req.get('host')}/Uploads/${req.file.filename}`;
    user.profilePicture = profilePictureUrl;
    await user.save();

    res.json({ profilePicture: profilePictureUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
//get profile picture
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
// Like a post

app.post('/post/like/:id', verifyToken, async (req, res) => { try { const postId = req.params.id; const userId = req.user.userId;  // Corrected here

// Find the post
const post = await Post.findById(postId); if (!post) { return res.status(404).json({ message: 'Post not found' }); }

// Check if the user has already liked the post
const alreadyLiked = post.likes.includes(userId);

if (alreadyLiked) {
    // Remove the like if the user already liked the post
    post.likes = post.likes.filter(id => id !== userId);
} else {
    // Add the user ID to the likes array
    post.likes.push(userId);
}

// Save the post with updated likes
await post.save();

return res.status(200).json(post);

} catch (error) { console.error('Error liking post:', error); res.status(500).json({ message: 'Server error' }); }

}); //comments 
app.post('/post/comment/:postId', verifyToken, async (req, res) => { try { const { text } = req.body; const userId = req.user.userId; // ✅ Corrected: Access userId from verified token

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

        const sellerId = post.createdBy;  // ✅ Ensure sellerId is correctly assigned

        console.log("Seller ID from post:", sellerId); // Debugging log

        // ✅ Include correct sellerId in metadata
        const response = await paystack.transaction.initialize({
            email,
            amount: amount,
            callback_url: `http://localhost:3000/payment-success?postId=${trimmedPostId}&buyerId=${buyerId}`,
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
    const { reference, postId } = req.query;

    try {
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
            throw new Error(data.message || "Failed to verify payment");
        }

        if (data.data.status === 'success') {
            console.log("🎉 Payment Verified Successfully!");


   





// Save escrow record

          
            const post = await Post.findById(postId);
            if (!post) {
                console.log("⚠️ Post not found!");
                return res.status(404).send("Post not found.");
            }

            const email = data.data.customer.email;
            const buyer = await User.findOne({ email });
            const seller = await User.findById(post.createdBy.userId); // Get seller

            if (!seller) {
                console.log("⚠️ Seller not found!");
                return res.status(404).send("Seller not found.");
            }

            // ✅ Extract required data
            const buyerId = buyer ? buyer._id.toString() : null;
            const buyerName = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim()
            if(!buyer) {
              console.log('buyer not found');
              res.status(404).json({message: 'buyer not found'})
            }
            const amountPaid = data.data.amount / 100;
            
            const transactionDate = new Date(data.data.paid_at).toLocaleString();
            const productName = post.title;
            const productDescription = post.description || "No description available.";
            const sellerId = seller._id.toString();
            const sellerName = `${seller.firstName} ${seller.lastName}`;
            const sellerProfilePic = seller.profilePicture || "default.jpg";
            
            const COMMISSION_PERCENT = 2; // Platform earns 2%

const totalAmount = amountPaid; // Already calculated
const commission = (COMMISSION_PERCENT / 100) * totalAmount;
const sellerShare = totalAmount - commission;
            
            const notification = new Notification({
  userId: sellerId,       // Who should receive the notification (the seller)
  senderId: buyerId, // Who triggered the notification (the buyer)
  type: 'payment',  
  postId: postId,// New notification type
  payment: post.description,     
  message: `${buyer.firstName} ${buyer.lastName} just paid for your product: "${post.description}"`,
  createdAt: new Date()
  
});
const escrow = new Escrow({
  product : postId,
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
  amount: amountPaid ,
  status: 'pending'
});
await transaction.save();
console.log("✅ Transaction record saved.");
post.isSold = true;
await post.save();

console.log("✅ Escrow record saved.");

await notification.save();
console.log('notification sent')
// Send real-time notification via Socket.IO
io.to(sellerId.toString()).emit('notification', notification);
            

// Function to generate the receipt PDF
async function generateReceiptPDF(reference, amountPaid, transactionDate, buyerName, email, productName, productDescription) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const receiptPath = path.join(__dirname, `receipts/${reference}.pdf`);

        // Ensure receipts folder exists
        if (!fs.existsSync(path.join(__dirname, "receipts"))) {
            fs.mkdirSync(path.join(__dirname, "receipts"));
        }

        const stream = fs.createWriteStream(receiptPath);
        doc.pipe(stream);

        // PDF Content
        doc.fontSize(18).text("Payment Receipt", { align: "center" });
        doc.moveDown();
        doc.fontSize(12).text(`Transaction Reference: ${reference}`);
        doc.text(`Amount Paid: ₦${amountPaid}`);
        doc.text(`Payment Date: ${transactionDate}`);
        doc.text(`Buyer Name: ${buyerName}`);
        doc.text(`Buyer Email: ${email}`);
        doc.text(`Product: ${productName}`);
        doc.text(`Description: ${productDescription}`);
        doc.moveDown();
        doc.text("Thank you for your purchase!", { align: "center" });

        doc.end();

        stream.on("finish", () => resolve(receiptPath));
        stream.on("error", reject);
    });
}

// ✅ Generate the PDF
const pdfPath = await generateReceiptPDF(reference, amountPaid, transactionDate, buyerName, email, productName, productDescription);
console.log("✅ Receipt PDF Generated:", pdfPath);

            // ✅ Send receipt page
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
            .header img { width: 80px; }
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
                <p><span>Amount Paid:</span> ₦${amountPaid}</p>
                <p><span>Payment Date:</span> ${transactionDate}</p>
                <p><span>Buyer Name:</span> ${buyerName}</p>
                <p><span>Buyer Email:</span> ${email}</p>
                <p><span>Product:</span> ${productName}</p>
                <p><span>Description:</span> ${productDescription}</p>
            </div>

            <button class="share-button" onclick="redirectToChat()">📤 Share Receipt</button>

            <div class="footer">
                <p>© 2025 Salmart Technologies. All rights reserved.</p>
            </div>
        </div>

<script>
    function redirectToChat() {
        const sellerId = "${sellerId}";
        const userId = "${buyerId}";
        const sellerName = "${sellerName}";
        const sellerProfilePic = "${sellerProfilePic}";
        const reference = "${reference}";

        localStorage.setItem("recipient_username", sellerName);
        localStorage.setItem("recipient_profile_picture_url", sellerProfilePic);

        // Send the PDF receipt to the seller via chat
        
</script>
    </body>
    </html>
`);
        }
    } catch (error) {
        console.error('🚨 Error during payment verification:', error.message);
        res.status(500).send(`An error occurred: ${error.message}`);
    }
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
app.post("/send-receipt", async (req, res) => {
    try {
        const { reference, sellerId, userId } = req.body;
        const receiptPath = path.join(__dirname, `receipts/${reference}.pdf`);

        if (!fs.existsSync(receiptPath)) {
            return res.status(404).json({ success: false, message: "Receipt not found." });
        }

        // Simulate sending receipt via chat (Replace this with your chat logic)
        console.log(`📤 Sending receipt ${reference}.pdf to seller ${sellerId}`);

        res.json({ success: true, message: "Receipt sent successfully." });
    } catch (error) {
        console.error("🚨 Error sending receipt:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});
app.get('/payment-success', async (req, res) => {
    const { reference, postId } = req.query;

    try {
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
            throw new Error(data.message || "Failed to verify payment");
        }

        if (data.data.status === 'success') {
            console.log("🎉 Payment Verified Successfully!");
            

const notification = new Notification({
  userId: sellerId,             // Who should receive the notification (the seller)
  senderId: buyerId,            // Who triggered the notification (the buyer)
  type: 'payment',              // New notification type
  postId: productId,            // Optional, if you want to link to the product
  message: `${buyer.firstName} ${buyer.lastName} just paid for your product: "${product.name}"`,
  createdAt: new Date()
});

await notification.save();

// Send real-time notification via Socket.IO
io.to(sellerId.toString()).emit('notification', notification);

            const post = await Post.findById(postId);
            if (!post) {
                console.log("⚠️ Post not found!");
                return res.status(404).send("Post not found.");
            }

            const email = data.data.customer.email;
            const buyer = await User.findOne({ email });
            const seller = await User.findById(post.createdBy.userId); // Get seller from post

            if (!seller) {
                console.log("⚠️ Seller not found!");
                return res.status(404).send("Seller not found.");
            }

            const buyerName = buyer ? `${buyer.firstName} ${buyer.lastName}` : "Unknown Buyer";
            const amountPaid = data.data.amount / 100;
            const transactionDate = new Date(data.data.paid_at).toLocaleString();
            const productName = post.title;
            const productDescription = post.description || "No description available.";
            const sellerId = post.createdBy.userId.toString(); // Ensure seller ID is a string

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
            .header img { width: 80px; }
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
                <img src="https://yourwebsite.com/logo.png" alt="Company Logo"> <!-- Replace with your logo URL -->
                <h2>Payment Receipt</h2>
            </div>

            <p class="status">✅ Payment Successful</p>

            <div class="details">
                <p><span>Transaction Reference:</span> ${reference}</p>
                <p><span>Amount Paid:</span> ₦${amountPaid}</p>
                <p><span>Payment Date:</span> ${transactionDate}</p>
                <p><span>Buyer Name:</span> ${buyerName}</p>
                <p><span>Buyer Email:</span> ${email}</p>
                <p><span>Product:</span> ${productName}</p>
                <p><span>Description:</span> ${productDescription}</p>
            </div>

            <button class="share-button" onclick="redirectToChat()">📤 Share Receipt</button>

            <div class="footer">
                <p>Need help? Contact <a href="mailto:support@yourwebsite.com">support@yourwebsite.com</a></p>
                <p>© 2025 salmart technologies. All rights reserved.</p>
            </div>
        </div>
<script>
    function redirectToChat() {
        const sellerId = "${sellerId}";
        const userId = "${buyerId}";
        const sellerName = "${sellerName}";
        const sellerProfilePic = "${sellerProfilePic}";

        localStorage.setItem("recipient_username", sellerName);
        localStorage.setItem("recipient_profile_picture_url", sellerProfilePic);

        fetch('/generate-receipt-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reference: "${reference}",
                amountPaid: "${amountPaid}",
                transactionDate: "${transactionDate}",
                buyerName: "${buyerName}",
                email: "${email}",
                productName: "${productName}",
                productDescription: "${productDescription}",
                buyerId: userId,
                sellerId: sellerId
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                const receiptUrl = encodeURIComponent(result.receiptUrl);
                const chatPageUrl = \`http://localhost:8158/Chats.html?user_id=\${userId}&recipient_id=\${sellerId}&receipt=\${receiptUrl}\`;
                window.location.href = chatPageUrl;
            } else {
                alert("❌ Failed to send receipt.");
            }
        })
        .catch(error => {
            console.error("🚨 Error sharing receipt:", error);
        });
    }
</script>
    </body>
    </html>
`);
        } else {
            console.log("⚠️ Payment verification failed:", data.data.status);
            res.status(400).send("Payment verification failed. Please contact support.");
        }
    } catch (error) {
        console.error('🚨 Error during payment verification:', error.message);
        res.status(500).send(`An error occurred: ${error.message}`);
    }
});

        
          
            

app.post("/generate-receipt-image", async (req, res) => {
    try {
        const { reference, amountPaid, transactionDate, buyerName, email, productName, productDescription, buyerId, sellerId } = req.body;
        if (!buyerId || !sellerId) return res.status(400).json({ success: false, message: "Missing data" });

        // ✅ Generate HTML for the receipt
        const receiptHtml = `
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
                .receipt-container { max-width: 400px; margin: auto; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); text-align: left; }
                .header { text-align: center; padding-bottom: 10px; border-bottom: 2px solid #007bff; }
                .header h2 { color: #007bff; margin: 5px 0; }
                .status { text-align: center; font-size: 18px; padding: 10px; color: green; font-weight: bold; }
                .details p { font-size: 14px; margin: 5px 0; }
                .details span { font-weight: bold; }
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
                    <p><span>Amount Paid:</span> ₦${amountPaid}</p>
                    <p><span>Payment Date:</span> ${transactionDate}</p>
                    <p><span>Buyer Name:</span> ${buyerName}</p>
                    <p><span>Buyer Email:</span> ${email}</p>
                    <p><span>Product:</span> ${productName}</p>
                    <p><span>Description:</span> ${productDescription}</p>
                </div>
            </div>
        </body>
        </html>`;

        // ✅ Convert HTML to an image
        const imagePath = path.join(__dirname, `receipts/receipt_${Date.now()}.png`);
        await htmlToImage({ output: imagePath, html: receiptHtml });

        console.log("🖼️ Receipt Image Created:", imagePath);

        // Store the image URL (modify if using a hosting service)
        const receiptUrl = `http://yourserver.com/receipts/${path.basename(imagePath)}`;

        // ✅ Save message to chat
        await Message.create({
            senderId: buyerId,
            recipientId: sellerId,
            messageType: "image",
            content: receiptUrl,
            timestamp: new Date()
        });

        console.log("📩 Receipt Sent to Chat!");
        res.json({ success: true, receiptUrl });
    } catch (error) {
        console.error("🚨 Error generating receipt image:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// Serve PDF receipts
app.use('/receipts', express.static(path.join(__dirname, 'receipts')));

// Start the server


//chats
 



 
 
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



// Route to fetch messages for a user




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
      { $sort: { createdAt: -1 } }, // Sort messages by latest first
      {
        $group: {
          _id: {
            $cond: [
              { $lt: ["$senderId", "$receiverId"] },
              { senderId: "$senderId", receiverId: "$receiverId" },
              { senderId: "$receiverId", receiverId: "$senderId" },
            ],
          }, // Group by conversation pair
          latestMessage: { $first: "$$ROOT" }, // Take the first (latest) message
        },
      },
      { $replaceRoot: { newRoot: "$latestMessage" } }, // Replace root with latest message
    ]);

    // Fetch sender and receiver details for each message
    const populatedMessages = await Promise.all(
      latestMessages.map(async (msg) => {
        const sender = await User.findById(msg.senderId);
        const receiver = await User.findById(msg.receiverId);

        // Determine chat partner (i.e., the other person in the conversation)
        const chatPartner =
          msg.senderId.toString() === userId ? receiver : sender;

        return {
          _id: msg._id,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          chatPartnerId: chatPartner?._id || null,
          chatPartnerName: chatPartner
            ? `${chatPartner.firstName} ${chatPartner.lastName}`
            : "Unknown",
          chatPartnerProfilePicture: chatPartner?.profilePicture || "default.jpg",
          text: msg.text,
          status: msg.status,
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

app.put('/notifications/mark-as-read', verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId; // Ensure userId is correctly extracted
        console.log('User ID:', userId);

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const result = await Notification.updateMany(
            { userId, isRead: false }, // Find unread notifications for this user
            { $set: { isRead: true } } // Mark them as read
        );

        console.log('Notifications updated:', result);

        res.json({ message: 'Notifications marked as read' });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
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
        status: 'pending'
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
    
    console.log(JSON.stringify(transactions, null, 2));

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

    // Log transaction details
    console.log('[TRANSACTION FOUND]', {
      transactionId: transaction._id,
      buyer: transaction.buyerId?.firstName + ' ' + transaction.buyerId?.lastName,
      seller: transaction.sellerId?.firstName + ' ' + transaction.sellerId?.lastName,
      product: transaction.productId?.description,
      currentStatus: transaction.status,
    });

    // Extract seller object
    const seller = transaction.sellerId;

    // === Strict Validation: Check if seller has valid bank details ===
    console.log('[SELLER BANK DETAILS]', seller.bankDetails);

    if (
      !seller.bankDetails ||
      !seller.bankDetails.accountNumber || typeof seller.bankDetails.accountNumber !== 'string' || seller.bankDetails.accountNumber.trim() === '' ||
      !seller.bankDetails.bankCode || typeof seller.bankDetails.bankCode !== 'string' || seller.bankDetails.bankCode.trim() === '' ||
      !seller.bankDetails.bankName || typeof seller.bankDetails.bankName !== 'string' || seller.bankDetails.bankName.trim() === ''
    ) {
      console.warn('[BANK DETAILS MISSING OR INVALID] Payment halted.');

      // Notify seller to update bank details
      const bankNotify = new Notification({
        userId: seller._id,
        senderId: transaction.buyerId._id || seller._id,
        postId: transaction.productId?._id || null,
        type: 'warning',
        payment: transaction.productId?.description || 'Payment',
        message: `Payment could not be processed because your bank details are missing or invalid. Please update your account number and bank name.`,
        createdAt: new Date()
      });

      await bankNotify.save();
      io.to(seller._id.toString()).emit('notification', bankNotify);

      return res.status(400).json({
        error: "Seller has not added valid bank details. Payment cannot be processed until seller updates their account."
      });
    }

    // === Proceed with payout ===

    // Check if recipient code exists in DB
    let recipientCode = seller.paystackRecipientCode;

    if (!recipientCode) {
      // Create Paystack recipient
      const recipientPayload = {
        type: 'nuban',
        name: seller.firstName + ' ' + seller.lastName,
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

      // Save to seller profile
      seller.paystackRecipientCode = recipientCode;
      await seller.save();

      console.log('[PAYSTACK RECIPIENT CREATED]', recipientCode);
    }

    // Calculate amount to transfer (minus platform commission)
    const productPrice = transaction.productId?.price || 0;
    const commissionPercent = 10;
    const commission = Math.floor((commissionPercent / 100) * productPrice);
    const amountToTransfer = productPrice - commission;

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

    // === Check if transfer was successfully initiated ===
    if (transferStatus !== 'success' && transferStatus !== 'successfully-queued') {
      console.warn('[TRANSFER FAILED OR QUEUED INVALIDLY] Payment not marked as released');

      return res.status(500).json({
        error: "Transfer to seller failed or could not be completed. Please try again later.",
        paystackStatus: transferStatus
      });
    }

    // === Now mark transaction as released only after successful payout ===
    transaction.status = 'released';
    await transaction.save();
    console.log('[TRANSACTION STATUS UPDATED TO "released"]');

    // Update escrow status
    const escrowPostId = transaction.productId?._id;
    const updatedEscrow = await Escrow.findOneAndUpdate(
      { postId: escrowPostId },
      { status: 'Released' },
      { new: true }
    );

    if (!updatedEscrow) {
      console.warn('[ESCROW WARNING] No escrow found for post ID:', escrowPostId);
    } else {
      console.log('[ESCROW UPDATED]', updatedEscrow);
    }

    // Notify seller about successful release
    const notification = new Notification({
      userId: transaction.sellerId._id,
      senderId: transaction.buyerId._id,
      type: 'delivery',
      payment: transaction.productId?.description,
      postId: transaction.productId._id,
      message: `Buyer has confirmed delivery. You will now receive your payment.`,
      createdAt: new Date()
    });

    await notification.save();
    io.to(transaction.sellerId._id.toString()).emit('notification', notification);
    console.log('[NOTIFICATION CREATED & EMITTED]');

    return res.status(200).json({
      message: "Delivery confirmed. Payment released to seller.",
      transferReference: transferResponse.data.data.reference,
      amountTransferred: amountToTransfer
    });

  } catch (err) {
    console.error('[CONFIRM DELIVERY SERVER ERROR]', err);
    return res.status(500).json({
      error: "Something went wrong.",
      details: err.message || 'Unknown error'
    });
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


// Submit Refund Request


// Request Refund Endpoint
app.post('/request-refund/:transactionId', verifyToken, async (req, res) => {
  const userId = req.user.userId;
  const { transactionId } = req.params;
  const { reason } = req.body;

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

    if (transaction.refundRequested) {
      return res.status(400).json({ error: 'Refund has already been requested for this transaction.' });
    }

    transaction.refundRequested = true;
    transaction.refundReason = reason; // Save reason
    await transaction.save();

    res.status(200).json({ message: 'Refund requested successfully.' });
  } catch (err) {
    console.error('Error requesting refund:', err);
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

// GET all products (not sold)
app.get('/products', async (req, res) => {
  try {
    const { sellerId } = req.query; // Get sellerId from query parameters

    // Define the base query
    const query = {
      price: { $exists: true, $ne: "" },
      productCondition: { $exists: true, $ne: "" },
      location: { $exists: true, $ne: "" },
      isSold: false
    };

    // If sellerId is provided, filter products by the seller
    if (sellerId) {
      query['createdBy.userId'] = sellerId; // Ensure this matches your schema
    }

    // Fetch products based on the query
    const products = await Post.find(query)
      .sort({ createdAt: -1 }) // Sort by latest first
      .populate('createdBy.userId', 'firstName lastName profilePicture'); // Populate user info

    res.status(200).json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Backend route to update product price
app.put('/posts/:postId/update-price', async (req, res) => {
  const { postId } = req.params;
  const { newPrice } = req.body;

  try {
    // Find the post by ID
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
    res.status(500).json({ message: 'Failed to update price', error });
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


const SECRET_ADMIN_CODE = "Chris@23%#2025"; 

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



 

