const Request = require('../models/requestSchema.js')
const User = require('../models/userSchema.js')
const mongoose = require('mongoose')
const verifyToken = require('../middleware/auths')
const express = require('express')
const router = express.Router()

module.exports = (io) => {
// Create Request
router.post('/create-request', verifyToken, async (req, res) => {
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



router.get('/requests', async (req, res) => {
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

// Get comments for a request (NEW ENDPOINT NEEDED)
router.get('/requests/comments/:id', async (req, res) => {
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
router.get('/requests/:id/comments/count', async (req, res) => {
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
router.post('/requests/comment/:id', verifyToken, async (req, res) => {
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
router.put('/requests/:id', verifyToken, async (req, res) => {
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
router.delete('/requests/:id', verifyToken, async (req, res) => {
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
router.post('/requests/report/:id', verifyToken, async (req, res) => {
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
router.post('/requests/like/:id', verifyToken, async (req, res) => {
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

// Export router as a function that accepts io

  return router;
};