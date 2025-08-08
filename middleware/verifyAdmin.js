// middleware/verifyAdmin.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/adminSchema.js');

const verifyAdmin = async (req, res, next) => {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. No or invalid token provided.' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ Handle both "id" and "adminId" field names
    const adminId = decoded.adminId || decoded.id;
    
    if (!adminId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token structure.' 
      });
    }
    
    // ✅ Fetch admin from Admin collection
    const admin = await Admin.findById(adminId);
    
    if (!admin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin not found. Access denied.' 
      });
    }

    // ✅ Set req.user with admin data and isAdmin flag
    req.user = { 
      ...admin.toObject(), 
      _id: admin._id 
    };
    
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token has expired. Please log in again.' 
      });
    }
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid token.' 
    });
  }
};

module.exports = verifyAdmin;