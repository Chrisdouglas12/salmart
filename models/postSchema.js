// Schema (postSchema.js)
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
postType: {
type: String,
enum: ['regular', 'video_ad'],
default: 'regular',
},
description: {
type: String,
trim: true,
},
title: {
type: String,
required: function () {
return this.postType === 'regular';
},
trim: true,
},
category: {
type: String,
required: true,
enum: ['electronics', 'fashion', 'home', 'vehicles', 'music', 'books', 'food_items', 'others'],
},
video: {
type: String,
required: function () {
return this.postType === 'video_ad';
},
},
videoThumbnail: {
type: String,
required: false,
},
productLink: {
type: String,
required: function () {
return this.postType === 'video_ad';
},
trim: true,
validate: {
validator: function (value) {
// Only validate links for video ads
if (this.postType !== 'video_ad') return true;

try {  
      const { hostname } = new URL(value);  

      // Set allowed domains based on environment  
      const validDomains = process.env.NODE_ENV === 'production'  
        ? ['salmartonline.com.ng', 'salmart.onrender.com']  
        : ['localhost'];  

      return validDomains.includes(hostname);  
    } catch {  
      return false;  
    }  
  },  
  message: 'Product link must be a valid Salmart URL (e.g., https://salmartonline.com.ng)',  
}

},
location: {
type: String,
required: function () {
return this.postType === 'regular';
},
trim: true,
},
productCondition: {
type: String,
required: function () {
return this.postType === 'regular';
},
trim: true,
},
price: {
type: Number,
required: function () {
return this.postType === 'regular';
},
min: [0, 'Price cannot be negative'],
},
// 🆕 Added quantity field
quantity: {
type: Number,
default: 1,
min: [0, 'Quantity cannot be negative'],
validate: {
validator: function(value) {
// Only validate quantity for regular posts (products)
if (this.postType !== 'regular') return true;
return Number.isInteger(value) && value >= 0;
},
message: 'Quantity must be a non-negative integer'
}
},
photo: {
type: String,
required: function () {
return this.postType === 'regular';
},
},
createdBy: {
userId: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User',
required: true,
},
name: {
type: String,
required: true,
},
},
reports: [
{
reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
reason: String,
reportedAt: { type: Date, default: Date.now },
},
],
status: {
type: String,
enum: ['active', 'under_review', 'removed'],
default: 'active',
},
createdAt: {
type: Date,
default: Date.now,
},
updatedAt: {
type: Date,
default: Date.now,
},
likes: [
{
type: mongoose.Schema.Types.ObjectId,
ref: 'User',
},
],
comments: [
{
userId: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User', // Now we will rely solely on this reference for user details
},
// name: String, // You can keep this or derive it from populated user
text: String,
createdAt: { type: Date, default: Date.now },
replies: [
{
userId: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User', // Rely on this for user details
},
// name: String, // You can keep this or derive it from populated user
text: String,
createdAt: { type: Date, default: Date.now },
},
],
},
],
isSold: {
type: Boolean,
default: false,
},
isPromoted: {
type: Boolean,
default: false,
},
promotionDetails: {
startDate: {
type: Date,
required: function () {
return this.isPromoted;
},
},
endDate: {
type: Date,
required: function () {
return this.isPromoted;
},
},
durationDays: {
type: Number,
required: function () {
return this.isPromoted;
},
min: [1, 'Promotion duration must be at least 1 day'],
},
amountPaid: {
type: Number,
required: function () {
return this.isPromoted;
},
min: [0, 'Amount paid cannot be negative'],
},
paymentReference: {
type: String,
required: function () {
return this.isPromoted && !this.promotionDetails.promotedByAdmin;
},
trim: true,
},
// 🆕 Track promotion expiry status without deleting the post
isPromotionExpired: {
type: Boolean,
default: false,
},
},
});

// 🆕 Add indexes for quantity-based queries
postSchema.index({ quantity: 1 });
postSchema.index({ isSold: 1 });
postSchema.index({ quantity: 1, isSold: 1 }); // Compound index for efficient queries

// 🔧 UPDATED: Only video ads get deleted after 24 hours
postSchema.index(
{ createdAt: 1 },
{
expireAfterSeconds: 86400,
partialFilterExpression: { postType: 'video_ad' },
}
);

// 🔧 REMOVED: TTL index for promoted posts - they won't be auto-deleted anymore
// Instead, we'll use a regular index for querying expired promotions
postSchema.index({ 'promotionDetails.endDate': 1 });
postSchema.index({ isPromoted: 1, 'promotionDetails.isPromotionExpired': 1 });

// 🆕 Enhanced pre-save hook to auto-manage isSold status and promotion expiry
postSchema.pre('save', function (next) {
this.updatedAt = new Date();

// 🔧 Auto-set isSold based on quantity for regular posts
if (this.postType === 'regular') {
const wasNotSold = !this.isSold;
this.isSold = this.quantity < 1;

// Log when item becomes sold/unsold (optional - remove if not needed)  
if (wasNotSold && this.isSold) {  
  console.log(`📦 Post ${this._id} marked as SOLD (quantity: ${this.quantity})`);  
} else if (!wasNotSold && !this.isSold) {  
  console.log(`📦 Post ${this._id} marked as AVAILABLE (quantity: ${this.quantity})`);  
}
}

// 🆕 Check and update promotion expiry status
if (this.isPromoted && this.promotionDetails.endDate) {
const now = new Date();
const wasExpired = this.promotionDetails.isPromotionExpired;
const isNowExpired = now > this.promotionDetails.endDate;

// Update expiry status
this.promotionDetails.isPromotionExpired = isNowExpired;

// 🔧 OPTION 1: Keep isPromoted true, filter in queries (current behavior)
// Posts remain marked as promoted but are filtered out of active promotion lists

// 🔧 OPTION 2: Automatically unmark expired promotions (uncomment below)
// if (isNowExpired && this.isPromoted) {
//   this.isPromoted = false;
//   console.log(`🎯 Post ${this._id} promotion EXPIRED - unmarked as promoted`);
// }

// Log promotion status changes (optional)
if (!wasExpired && isNowExpired) {
  console.log(`🎯 Post ${this._id} promotion EXPIRED but post preserved`);
} else if (wasExpired && !isNowExpired) {
  console.log(`🎯 Post ${this._id} promotion RENEWED`);
}
}

next();
});

// 🆕 Instance method to reduce quantity (for purchases)
postSchema.methods.reduceQuantity = function(amount = 1) {
if (this.postType !== 'regular') {
throw new Error('Cannot reduce quantity for non-product posts');
}

if (amount <= 0) {
throw new Error('Amount must be positive');
}

if (this.quantity < amount) {
throw new Error(`Insufficient quantity. Available: ${this.quantity}, Requested: ${amount}`);
}

this.quantity -= amount;
// isSold will be auto-set by pre-save hook
return this.save();
};

// 🆕 Instance method to increase quantity (for restocking)
postSchema.methods.increaseQuantity = function(amount = 1) {
if (this.postType !== 'regular') {
throw new Error('Cannot increase quantity for non-product posts');
}

if (amount <= 0) {
throw new Error('Amount must be positive');
}

this.quantity += amount;
// isSold will be auto-set by pre-save hook
return this.save();
};

// 🆕 Instance method to check availability
postSchema.methods.isAvailable = function(requestedQuantity = 1) {
if (this.postType !== 'regular') return false;
return this.quantity >= requestedQuantity && !this.isSold;
};

// 🔧 UPDATED: Instance method to check if promotion is active
postSchema.methods.isPromotionActive = function() {
if (!this.isPromoted) return false;
const now = new Date();
return now <= this.promotionDetails.endDate && !this.promotionDetails.isPromotionExpired;
};

// 🆕 Instance method to extend promotion
postSchema.methods.extendPromotion = function(additionalDays, additionalAmount = 0) {
if (!this.isPromoted) {
throw new Error('Post is not currently promoted');
}

const newEndDate = new Date(this.promotionDetails.endDate);
newEndDate.setDate(newEndDate.getDate() + additionalDays);

this.promotionDetails.endDate = newEndDate;
this.promotionDetails.durationDays += additionalDays;
this.promotionDetails.amountPaid += additionalAmount;
this.promotionDetails.isPromotionExpired = false;

return this.save();
};

// 🆕 Static method to find available posts
postSchema.statics.findAvailable = function(filter = {}) {
return this.find({
...filter,
postType: 'regular',
isSold: false,
quantity: { $gte: 1 },
status: 'active'
});
};

// 🆕 Static method to find sold posts
postSchema.statics.findSold = function(filter = {}) {
return this.find({
...filter,
postType: 'regular',
isSold: true
});
};

// 🔧 UPDATED: Static method to find actively promoted posts
postSchema.statics.findActivelyPromoted = function(filter = {}) {
return this.find({
...filter,
isPromoted: true,
'promotionDetails.endDate': { $gte: new Date() },
'promotionDetails.isPromotionExpired': { $ne: true },
status: 'active'
});
};

// 🆕 Static method to find expired promoted posts (for cleanup or re-promotion)
postSchema.statics.findExpiredPromoted = function(filter = {}) {
return this.find({
...filter,
isPromoted: true,
$or: [
{ 'promotionDetails.endDate': { $lt: new Date() } },
{ 'promotionDetails.isPromotionExpired': true }
],
status: 'active'
});
};

// 🆕 Static method to find ALL promoted posts (active + expired)
postSchema.statics.findAllPromoted = function(filter = {}) {
return this.find({
...filter,
isPromoted: true,
status: 'active'
});
};

// 🆕 Static method to bulk unmark expired promotions (if you want to clean up)
postSchema.statics.unmarkExpiredPromotions = async function() {
const now = new Date();
const result = await this.updateMany(
{
isPromoted: true,
$or: [
{ 'promotionDetails.endDate': { $lt: now } },
{ 'promotionDetails.isPromotionExpired': true }
]
},
{
$set: {
isPromoted: false,
'promotionDetails.isPromotionExpired': true
}
}
);
console.log(`🧹 Unmarked ${result.modifiedCount} expired promoted posts`);
return result;
};

// 🆕 Virtual for stock status
postSchema.virtual('stockStatus').get(function() {
if (this.postType !== 'regular') return 'N/A';

if (this.quantity === 0) return 'Out of Stock';
if (this.quantity <= 5) return 'Low Stock';
return 'In Stock';
});

// 🆕 Virtual for promotion status
postSchema.virtual('promotionStatus').get(function() {
if (!this.isPromoted) return 'Not Promoted';

const now = new Date();
if (now > this.promotionDetails.endDate || this.promotionDetails.isPromotionExpired) {
return 'Promotion Expired';
}
return 'Actively Promoted';
});

module.exports = mongoose.model('Post', postSchema);