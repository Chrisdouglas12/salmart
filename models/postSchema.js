const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  postType: {
    type: String,
    enum: ['regular', 'video_ad'],
    default: 'regular',
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others'],
  },

  // Video for video ads
  video: {
    type: String,
    required: function () {
      return this.postType === 'video_ad';
    },
  },

  // Fields for regular posts
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
    type: String,
    required: function () {
      return this.postType === 'regular';
    },
  },
  photo: {
    type: String,
    required: function () {
      return this.postType === 'regular';
    },
  },

  profilePicture: {
    type: String,
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
  },
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  comments: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
      profilePicture: String,
      text: String,
      createdAt: { type: Date, default: Date.now },
      replies: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          name: String,
          profilePicture: String,
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
});

module.exports = mongoose.model('Post', postSchema);