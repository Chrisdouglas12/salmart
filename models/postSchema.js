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
    enum: ['electronics', 'fashion', 'home', 'vehicles', 'music', 'others'],
  },
  video: {
    type: String,
    required: function () {
      return this.postType === 'video_ad';
    },
  },
  thumbnail: {
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
        if (this.postType !== 'video_ad') return true;
        try {
          const url = new URL(value);
          const validDomain = process.env.NODE_ENV === 'production' ? 'salmart.vercel.app' : 'localhost';
          return url.hostname === validDomain;
        } catch (e) {
          return false;
        }
      },
      message: 'Product link must be a valid Salmart URL (e.g., https://salmart.vercel.app)',
    },
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
  // New promotion fields
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
        return this.isPromoted;
      },
      trim: true,
    },
  },
});

// TTL index for video_ad posts (delete after 24 hours = 86400 seconds)
postSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 86400,
    partialFilterExpression: { postType: 'video_ad' },
  }
);

// TTL index for promoted posts (expire promotion after endDate)
postSchema.index(
  { 'promotionDetails.endDate': 1 },
  {
    expireAfterSeconds: 0, // Expire immediately after endDate
    partialFilterExpression: { isPromoted: true },
  }
);

// Update updatedAt on save
postSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Post', postSchema);