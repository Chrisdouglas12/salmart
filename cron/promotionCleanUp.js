const cron = require('node-cron');
const Post = require('../models/postSchema.js');

const cleanupPromotions = () => {
  cron.schedule('0 0 * * *', async () => {
    try {
      const now = new Date();
      const expiredPosts = await Post.find({
        isPromoted: true,
        'promotionDetails.endDate': { $lte: now },
      });

      for (const post of expiredPosts) {
        post.isPromoted = false;
        post.promotionDetails = null;
        await post.save();
      }
      console.log(`Expired ${expiredPosts.length} promotions`);
    } catch (error) {
      console.error('Error expiring promotions:', error.message);
    }
  });
};

module.exports = cleanupPromotions;