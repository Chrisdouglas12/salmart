const mongoose = require('mongoose')
const Admin = new mongoose.Schema({
  Email:{
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  }
})
module.exports = mongoose.model('Admin', adminSchema)