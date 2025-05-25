const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  profileName: String,
  bio: String,
  email: String,
  profilePicture: String,
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;