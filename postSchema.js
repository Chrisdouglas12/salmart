// models/Post.js
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    description: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    productCondition: { type: String, required: true, trim: true },
    price: { type: String, required: true },
    photo: { type: String, required: true },
    profilePicture: { type: String, required: false },
    
    createdBy: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, required: true },
    },
    category:{
      type: String,
      required: true,
      enum: ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others']
    },
     
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            name: String,
            profilePicture: String,
            text: String,
            createdAt: { type: Date, default: Date.now },
        },
    ],
    isSold: {
      type: Boolean,
      default: false
    }
});

module.exports = mongoose.model('Post', postSchema);