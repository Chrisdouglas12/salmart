// models/visitSchema.js
const mongoose = require('mongoose');

const VisitSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  ip: {
    type: String,
    required: true
  },
  userAgent: String,
  referrer: String,
  url: String,
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  deviceType: {
    type: String,
    enum: ['Mobile', 'Desktop', 'Tablet', 'Other', 'Unknown'],
    default: 'Unknown'
  },
  location: {
    country: String,
    city: String
  },
  isBot: {
    type: Boolean,
    default: false
  },
  // Additional tracking fields
  pageTitle: String,
  screenResolution: String,
  browserLanguage: String,
  timeZone: String
}, { 
  timestamps: true,
  // Add index for better query performance
  indexes: [
    { timestamp: -1 },
    { ip: 1 },
    { sessionId: 1 },
    { isBot: 1 }
  ]
});

// Add method to check if visit is recent (within last 15 minutes)
VisitSchema.methods.isRecent = function() {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  return this.timestamp > fifteenMinutesAgo;
};

// Static method to get visit stats
VisitSchema.statics.getStats = async function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate },
        isBot: { $ne: true }
      }
    },
    {
      $group: {
        _id: null,
        totalVisits: { $sum: 1 },
        uniqueIPs: { $addToSet: '$ip' },
        deviceBreakdown: {
          $push: '$deviceType'
        }
      }
    },
    {
      $project: {
        totalVisits: 1,
        uniqueVisitors: { $size: '$uniqueIPs' },
        deviceBreakdown: 1
      }
    }
  ]);
};

module.exports = mongoose.model('Visit', VisitSchema);